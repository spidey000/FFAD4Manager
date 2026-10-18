from __future__ import annotations

import os
import re
import socket
import time
from pathlib import Path
from typing import Callable

from .models import PrinterStatus
from .parser import parse_file_list, parse_status

ProgressCallback = Callable[[int, int], None]
ResponseCallback = Callable[[str, str], None]
M661_TIMEOUT = 12.0
M661_IDLE_TIMEOUT = 0.3
M661_MAX_BYTES = 1_048_576


class ProtocolError(RuntimeError):
    """Raised when a printer rejects a command or omits its completion ack."""


class FlashForgeClient:
    """Small TCP client for legacy FlashForge printers on port 8899.

    Confirmed against a FlashForge Adventurer 4 firmware v2.3.3-3.33.
    Commands are sent as `~GCODE\r\n`. File upload is performed on the same
    socket after `M28 /data/name.gcode` and completed with `M29`.
    """

    def __init__(self, host: str, port: int = 8899, timeout: float = 8.0) -> None:
        self.host = host
        self.port = port
        self.timeout = timeout

    def command(self, gcode: str, read_timeout: float | None = None) -> str:
        with self._connect(timeout=read_timeout or self.timeout) as sock:
            self._send_command(sock, gcode)
            return self._read_response(sock, read_timeout or self.timeout)

    def status(self) -> PrinterStatus:
        return parse_status(
            self.command("M119"),
            self.command("M105"),
            self.command("M27"),
        )

    def files_raw(self) -> str:
        with self._connect(timeout=M661_TIMEOUT) as sock:
            self._send_command(sock, "M661")
            return self._read_until_idle(
                sock,
                timeout=M661_TIMEOUT,
                idle_timeout=M661_IDLE_TIMEOUT,
                max_bytes=M661_MAX_BYTES,
            )

    def files(self) -> list[str]:
        return parse_file_list(self.files_raw())

    def upload(
        self,
        local_file: str | os.PathLike[str],
        remote_name: str | None = None,
        progress: ProgressCallback | None = None,
        chunk_size: int = 4096,
        response_callback: ResponseCallback | None = None,
    ) -> str:
        path = Path(local_file)
        if not path.is_file():
            raise FileNotFoundError(path)

        remote = path.name if remote_name is None else remote_name
        remote_path = _validated_remote_path(remote)
        total = path.stat().st_size
        if total == 0:
            raise ValueError(f"local file must not be empty: {path}")
        sent = 0

        with self._connect(timeout=max(self.timeout, 30.0)) as sock:
            self._send_command(sock, f"M28 {remote_path}")
            # Some printers reply before data, some stay quiet until M29. Read briefly only.
            m28_response = self._read_available(sock, 0.5)
            _report_response(response_callback, "M28", m28_response)
            if m28_response.strip():
                _require_ack("M28 upload start", m28_response, command="M28")

            with path.open("rb") as fh:
                while True:
                    chunk = fh.read(chunk_size)
                    if not chunk:
                        break
                    sock.sendall(chunk)
                    sent += len(chunk)
                    if progress:
                        progress(sent, total)

            if sent != total or path.stat().st_size != total:
                raise ValueError(
                    f"local file changed during upload: expected {total} bytes, sent {sent}"
                )

            self._send_command(sock, "M29")
            m29_response = self._read_response(sock, 20.0)
            _report_response(response_callback, "M29", m29_response)
            _require_ack("M29 upload completion", m29_response)

        return remote_path

    def upload_and_verify(
        self,
        local_file: str | os.PathLike[str],
        remote_name: str | None = None,
        progress: ProgressCallback | None = None,
        response_callback: ResponseCallback | None = None,
    ) -> str:
        path = Path(local_file)
        if not path.is_file():
            raise FileNotFoundError(path)
        expected_size = path.stat().st_size
        remote_path = self.upload(
            path, remote_name, progress=progress, response_callback=response_callback
        )

        listing = self.files_raw()
        _report_response(response_callback, "M661", listing)

        selected = self.command(f"M23 {remote_path}")
        _report_response(response_callback, "M23", selected)
        _require_ack("M23 file selection", selected)

        opened = re.findall(
            r"\bFile opened:\s*(.*?)\s+Size:\s*(\d+)\b",
            selected,
            re.IGNORECASE,
        )
        opened_names = re.findall(r"\bFile opened:\s*([^\r\n]+)", selected, re.IGNORECASE)
        requested_basename = remote_path.rsplit("/", 1)[-1]
        for opened_name in opened_names:
            # A size field may be absent, but any reported opened name must still
            # refer to the requested file before using M27 as a fallback.
            name_without_size = re.split(r"\s+Size:", opened_name, maxsplit=1, flags=re.IGNORECASE)[0]
            basename = name_without_size.strip().rsplit("/", 1)[-1]
            if basename != requested_basename:
                raise ProtocolError(
                    f"printer opened {basename!r} instead of requested file {requested_basename!r}"
                )

        if opened:
            if len(opened) != 1:
                raise ProtocolError("printer returned ambiguous M23 file size information")
            opened_name, reported_size = opened[0]
            basename = opened_name.strip().rsplit("/", 1)[-1]
            if basename != requested_basename:
                raise ProtocolError(
                    f"printer opened {basename!r} instead of requested file {requested_basename!r}"
                )
            remote_size = int(reported_size)
            if remote_size != expected_size:
                raise ProtocolError(
                    f"remote file size mismatch for {remote_path}: expected {expected_size} bytes, printer reports {remote_size}"
                )
            return remote_path

        if remote_path not in parse_file_list(listing):
            raise ProtocolError(f"uploaded file {remote_path} is absent from printer file list and M23 gave no size")

        size_response = self.command("M27")
        _report_response(response_callback, "M27", size_response)
        _require_ack("M27 file size query", size_response)
        matches = re.findall(
            r"\bSD printing byte\s+(\d+)\s*/\s*(\d+)\b",
            size_response,
            re.IGNORECASE,
        )
        if len(matches) != 1:
            raise ProtocolError("printer did not report an unambiguous M27 total byte size after file selection")
        remote_size = int(matches[0][1])
        if remote_size != expected_size:
            raise ProtocolError(
                f"remote file size mismatch for {remote_path}: expected {expected_size} bytes, printer reports {remote_size}"
            )
        return remote_path

    def print_file(
        self, remote_name: str, response_callback: ResponseCallback | None = None
    ) -> str:
        remote_path = _validated_remote_path(remote_name)
        # Proven working on AD4: select SD file then start/resume SD print.
        select_response = self.command(f"M23 {remote_path}")
        _report_response(response_callback, "M23", select_response)
        _require_ack("M23 file selection", select_response)
        start_response = self.command("M24")
        _report_response(response_callback, "M24", start_response)
        _require_ack("M24 print start", start_response)
        return select_response + "\n" + start_response

    def pause(self) -> str:
        return self.command("M25")

    def resume(self) -> str:
        return self.command("M24")

    def cancel(self) -> str:
        return self.command("M26")

    def _connect(self, timeout: float | None = None) -> socket.socket:
        sock = socket.create_connection((self.host, self.port), timeout=timeout or self.timeout)
        sock.settimeout(timeout or self.timeout)
        return sock

    @staticmethod
    def _send_command(sock: socket.socket, gcode: str) -> None:
        payload = f"~{gcode}\r\n".encode("utf-8")
        sock.sendall(payload)

    @staticmethod
    def _read_response(sock: socket.socket, timeout: float) -> str:
        sock.settimeout(timeout)
        chunks: list[bytes] = []
        end = time.time() + timeout
        while time.time() < end:
            try:
                data = sock.recv(8192)
            except socket.timeout:
                break
            if not data:
                break
            chunks.append(data)
            text = b"".join(chunks).decode("utf-8", errors="replace")
            if re.search(r"(?:^|\s)ok(?:\s|$)", text, flags=re.IGNORECASE):
                break
        return b"".join(chunks).decode("utf-8", errors="replace")

    @staticmethod
    def _read_available(sock: socket.socket, timeout: float) -> str:
        previous = sock.gettimeout()
        sock.settimeout(timeout)
        chunks: list[bytes] = []
        try:
            while True:
                try:
                    data = sock.recv(8192)
                except socket.timeout:
                    break
                if not data:
                    break
                chunks.append(data)
                if b"ok" in data:
                    break
        finally:
            sock.settimeout(previous)
        return b"".join(chunks).decode("utf-8", errors="replace")

    @staticmethod
    def _read_until_idle(
        sock: socket.socket,
        timeout: float,
        idle_timeout: float,
        max_bytes: int,
    ) -> str:
        deadline = time.monotonic() + timeout
        chunks: list[bytes] = []
        total_bytes = 0
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            sock.settimeout(min(idle_timeout, remaining))
            try:
                data = sock.recv(min(8192, max_bytes - total_bytes + 1))
            except socket.timeout:
                break
            if not data:
                break
            total_bytes += len(data)
            if total_bytes > max_bytes:
                raise ProtocolError(f"printer M661 response exceeds {max_bytes} byte limit")
            chunks.append(data)
        return b"".join(chunks).decode("utf-8", errors="replace")


def _validated_remote_path(remote_name: str) -> str:
    if not isinstance(remote_name, str) or not remote_name:
        raise ValueError("remote filename must not be empty")
    if any(ord(char) < 32 or ord(char) == 127 for char in remote_name):
        raise ValueError("remote filename must not contain ASCII control characters")

    if remote_name.startswith("/data/"):
        basename = remote_name[len("/data/"):]
        if not basename or "/" in basename or "\\" in basename:
            raise ValueError("remote path must be a filename in /data, not a nested path")
    else:
        basename = remote_name
        if "/" in basename or "\\" in basename:
            raise ValueError("remote filename must be a simple name or /data/<basename>")

    if basename in {".", ".."}:
        raise ValueError("remote filename must not be a traversal path")
    return f"/data/{basename}"


def _report_response(callback: ResponseCallback | None, command: str, response: str) -> None:
    if callback is not None:
        callback(command, response)


def _has_positive_ack(response: str) -> bool:
    return bool(re.search(r"(?:^|\s)ok(?:\s|$)", response, flags=re.IGNORECASE))


def _is_rejection(response: str) -> bool:
    return bool(
        re.search(
            r"\b(?:not\s+ok|error|failed|failure|reject(?:ed|ion)?|denied|cannot|unable|invalid|not found|busy|no sd)\b",
            response,
            flags=re.IGNORECASE,
        )
    )


def _response_detail(response: str) -> str:
    detail = " ".join(response.split())
    return detail or "no response"


def _require_ack(action: str, response: str, command: str | None = None) -> None:
    if _is_rejection(response):
        raise ProtocolError(f"printer rejected {action}: {_response_detail(response)}")
    has_command_receipt = command is not None and bool(
        re.search(rf"\bcmd\s+{re.escape(command)}\s+received\b", response, flags=re.IGNORECASE)
    )
    if not _has_positive_ack(response) and not has_command_receipt:
        raise ProtocolError(f"printer did not acknowledge {action}: {_response_detail(response)}")
