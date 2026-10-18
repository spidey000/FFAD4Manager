import socket

import pytest

from ffadv4manager.core.client import FlashForgeClient, ProtocolError


class FakeSocket:
    def __init__(self, responses):
        self.responses = list(responses)
        self.sent = []
        self.timeout = None

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return None

    def settimeout(self, timeout):
        self.timeout = timeout

    def gettimeout(self):
        return self.timeout

    def sendall(self, payload):
        self.sent.append(payload)

    def recv(self, _size):
        response = self.responses.pop(0) if self.responses else socket.timeout()
        if isinstance(response, BaseException):
            raise response
        return response


def test_upload_allows_silent_m28_but_requires_m29_ack(monkeypatch, tmp_path):
    gcode = tmp_path / "part.gcode"
    gcode.write_bytes(b"G1 X1\n")
    fake = FakeSocket([socket.timeout(), b"ok\n"])
    monkeypatch.setattr(socket, "create_connection", lambda *_args, **_kwargs: fake)
    client = FlashForgeClient("printer")

    assert client.upload(gcode) == "/data/part.gcode"
    assert fake.sent[0] == b"~M28 /data/part.gcode\r\n"
    assert fake.sent[1] == b"G1 X1\n"
    assert fake.sent[2] == b"~M29\r\n"


def test_upload_rejects_empty_file_before_connect(monkeypatch, tmp_path):
    empty_file = tmp_path / "empty.gcode"
    empty_file.write_bytes(b"")
    monkeypatch.setattr(
        socket,
        "create_connection",
        lambda *_args, **_kwargs: pytest.fail("empty file must not open a socket"),
    )

    with pytest.raises(ValueError, match="local file must not be empty"):
        FlashForgeClient("printer").upload(empty_file)


def test_upload_rejects_file_that_grows_during_transfer(monkeypatch, tmp_path):
    gcode = tmp_path / "part.gcode"
    gcode.write_bytes(b"G1 X1\n")
    fake = FakeSocket([socket.timeout(), b"ok\n"])
    sendall = fake.sendall

    def send_and_grow(payload):
        sendall(payload)
        if payload == b"G1 X1\n":
            gcode.write_bytes(b"G1 X1\nG1 X2\n")

    fake.sendall = send_and_grow
    monkeypatch.setattr(socket, "create_connection", lambda *_args, **_kwargs: fake)

    with pytest.raises(ValueError, match="local file changed during upload"):
        FlashForgeClient("printer").upload(gcode)


def test_files_collects_chunks_after_m661_ack(monkeypatch):
    fake = FakeSocket(
        [
            b"CMD M661 Received.\r\nOK\r\n",
            b"/data/first.gcode:\x01metadata\n/data/second.",
            b"gcode:\x01metadata\n/data/third.gcode:\x01metadata\n",
        ]
    )
    monkeypatch.setattr(socket, "create_connection", lambda *_args, **_kwargs: fake)

    client = FlashForgeClient("printer")
    raw = client.files_raw()

    assert "/data/first.gcode" in raw
    assert "/data/second.gcode" in raw
    assert "/data/third.gcode" in raw

    fake.responses = [
        b"CMD M661 Received.\r\nOK\r\n",
        b"/data/first.gcode:\x01metadata\n/data/second.",
        b"gcode:\x01metadata\n/data/third.gcode:\x01metadata\n",
    ]
    assert client.files() == [
        "/data/first.gcode",
        "/data/second.gcode",
        "/data/third.gcode",
    ]


def test_upload_accepts_flashforge_m28_received_ack(monkeypatch, tmp_path):
    gcode = tmp_path / "part.gcode"
    gcode.write_bytes(b"G1 X1\n")
    fake = FakeSocket([b"CMD M28 Received.\r\n", socket.timeout(), b"ok\n"])
    monkeypatch.setattr(socket, "create_connection", lambda *_args, **_kwargs: fake)

    assert FlashForgeClient("printer").upload(gcode) == "/data/part.gcode"
    assert fake.sent[0] == b"~M28 /data/part.gcode\r\n"
    assert fake.sent[-1] == b"~M29\r\n"


def test_upload_rejects_m28_and_missing_m29_ack(monkeypatch, tmp_path):
    gcode = tmp_path / "part.gcode"
    gcode.write_bytes(b"G1 X1")
    rejected = FakeSocket([b"Error: cannot open file\n"])
    monkeypatch.setattr(socket, "create_connection", lambda *_args, **_kwargs: rejected)
    with pytest.raises(ProtocolError, match="M28"):
        FlashForgeClient("printer").upload(gcode)
    assert len(rejected.sent) == 1

    missing_ack = FakeSocket([socket.timeout(), socket.timeout()])
    monkeypatch.setattr(socket, "create_connection", lambda *_args, **_kwargs: missing_ack)
    with pytest.raises(ProtocolError, match="M29 upload completion"):
        FlashForgeClient("printer").upload(gcode)


def _verified_client(monkeypatch, upload_responses, listing, selection, size):
    responses = [upload_responses, [listing], [selection], [size]]
    sockets = [FakeSocket(batch) for batch in responses]
    monkeypatch.setattr(socket, "create_connection", lambda *_args, **_kwargs: sockets.pop(0))


def test_upload_and_verify_requires_exact_size(monkeypatch, tmp_path):
    gcode = tmp_path / "part.gcode"
    gcode.write_bytes(b"G1 X1\n")
    _verified_client(
        monkeypatch,
        [socket.timeout(), b"ok\n"],
        b"/data/part.gcode:\n",
        b"ok\n",
        b"SD printing byte 0/6\nok\n",
    )
    assert FlashForgeClient("printer").upload_and_verify(gcode) == "/data/part.gcode"


def test_upload_and_verify_uses_m23_size_even_when_listing_omits_file(monkeypatch, tmp_path):
    gcode = tmp_path / "part.gcode"
    gcode.write_bytes(b"G1 X1\n")
    _verified_client(
        monkeypatch,
        [socket.timeout(), b"ok\n"],
        b"/data/other.gcode:\n",
        b"CMD M23 Received\nFile opened: part.gcode Size: 6\nFile selected\nok\n",
        b"SD printing byte 0/100\nok\n",
    )
    assert FlashForgeClient("printer").upload_and_verify(gcode) == "/data/part.gcode"


@pytest.mark.parametrize(
    ("selection", "error"),
    [
        (b"File opened: part.gcode Size: 5\nok\n", "size mismatch"),
        (b"File opened: part.gcode Size: 0\nok\n", "size mismatch"),
        (b"File opened: other.gcode Size: 6\nok\n", "instead of requested"),
    ],
)
def test_upload_and_verify_rejects_bad_m23_open_details(
    monkeypatch, tmp_path, selection, error
):
    gcode = tmp_path / "part.gcode"
    gcode.write_bytes(b"G1 X1\n")
    _verified_client(
        monkeypatch,
        [socket.timeout(), b"ok\n"],
        b"/data/part.gcode:\n",
        selection,
        b"SD printing byte 0/6\nok\n",
    )
    with pytest.raises(ProtocolError, match=error):
        FlashForgeClient("printer").upload_and_verify(gcode)


@pytest.mark.parametrize(
    ("listing", "selection", "size", "upload_responses", "error"),
    [
        (b"/data/part.gcode:\n", b"ok\n", b"SD printing byte 0/5\nok\n", [socket.timeout(), b"ok\n"], "size mismatch"),
        (b"/data/other.gcode:\n", b"ok\n", b"SD printing byte 0/6\nok\n", [socket.timeout(), b"ok\n"], "absent"),
        (b"/data/part.gcode:\n", b"ok\n", b"size unavailable\nok\n", [socket.timeout(), b"ok\n"], "unambiguous M27"),
        (b"/data/part.gcode:\n", b"ok\n", b"SD printing byte 0/6\n", [socket.timeout(), b"ok\n"], "M27 file size query"),
        (b"/data/part.gcode:\n", b"ok\n", b"SD printing byte 0/6\nok\n", [socket.timeout(), socket.timeout()], "M29 upload completion"),
    ],
)
def test_upload_and_verify_fails_closed(
    monkeypatch, tmp_path, listing, selection, size, upload_responses, error
):
    gcode = tmp_path / "part.gcode"
    gcode.write_bytes(b"G1 X1\n")
    _verified_client(monkeypatch, upload_responses, listing, selection, size)
    with pytest.raises(ProtocolError, match=error):
        FlashForgeClient("printer").upload_and_verify(gcode)


def test_print_file_requires_selection_and_start_ack(monkeypatch):
    sockets = [FakeSocket([b"ok\n"]), FakeSocket([b"ok\n"])]
    monkeypatch.setattr(socket, "create_connection", lambda *_args, **_kwargs: sockets.pop(0))
    client = FlashForgeClient("printer")

    assert client.print_file("/data/part.gcode") == "ok\n\nok\n"

    sockets = [FakeSocket([b"Error: file not found\n"])]
    monkeypatch.setattr(socket, "create_connection", lambda *_args, **_kwargs: sockets.pop(0))
    with pytest.raises(ProtocolError, match="M23"):
        client.print_file("part.gcode")
    assert sockets == []

    sockets = [FakeSocket([b"ok\n"]), FakeSocket([socket.timeout()])]
    monkeypatch.setattr(socket, "create_connection", lambda *_args, **_kwargs: sockets.pop(0))
    with pytest.raises(ProtocolError, match="M24"):
        client.print_file("part.gcode")


@pytest.mark.parametrize(
    "name",
    ["", "../part.gcode", "folder/part.gcode", "/tmp/part.gcode", "/data/nested/part.gcode", "bad\rname", "bad\nname", "bad\x00name", "bad\\name"],
)
def test_upload_and_print_reject_unsafe_remote_names_before_connect(monkeypatch, tmp_path, name):
    gcode = tmp_path / "local.gcode"
    gcode.write_text("G1 X1")
    monkeypatch.setattr(
        socket,
        "create_connection",
        lambda *_args, **_kwargs: pytest.fail("invalid name must not open a socket"),
    )
    client = FlashForgeClient("printer")

    with pytest.raises(ValueError):
        client.upload(gcode, remote_name=name)
    with pytest.raises(ValueError):
        client.print_file(name)


def test_remote_names_allow_simple_unicode_spaces_and_explicit_data_path(monkeypatch, tmp_path):
    gcode = tmp_path / "source.gcode"
    gcode.write_text("G1")
    first = FakeSocket([socket.timeout(), b"ok\n"])
    monkeypatch.setattr(socket, "create_connection", lambda *_args, **_kwargs: first)
    assert FlashForgeClient("printer").upload(gcode, "my part – café.gcode") == "/data/my part – café.gcode"

    sockets = [FakeSocket([b"ok\n"]), FakeSocket([b"ok\n"])]
    monkeypatch.setattr(socket, "create_connection", lambda *_args, **_kwargs: sockets.pop(0))
    FlashForgeClient("printer").print_file("/data/my part – café.gcode")
