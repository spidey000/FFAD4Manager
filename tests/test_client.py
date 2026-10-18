import socket

import pytest

from ffadv4manager.core import client as client_module
from ffadv4manager.core.client import FlashForgeClient, ProtocolError


@pytest.fixture(autouse=True)
def skip_upload_flush_wait(monkeypatch):
    monkeypatch.setattr(client_module.time, "sleep", lambda _seconds: None)


class FakeSocket:
    def __init__(self, responses):
        self.responses = list(responses)
        self.sent = []
        self.events = []
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
        self.events.append(("sendall", payload))

    def recv(self, _size):
        response = self.responses.pop(0) if self.responses else socket.timeout()
        if isinstance(response, BaseException):
            raise response
        return response


def test_upload_preamble_order_and_size_path_with_fragmented_acknowledgements(monkeypatch, tmp_path):
    gcode = tmp_path / "part.gcode"
    gcode.write_bytes(b"G1 X1\n")
    console = FakeSocket([b"prefix\r\n", b"o", b"k\r\n", b"ok\n", b"ok\n", b"ok\n"])
    upload = FakeSocket([b"CMD M28 Received.\r\no", b"k\r\n", b"o", b"k\n"])
    sockets = [console, upload]
    monkeypatch.setattr(socket, "create_connection", lambda *_args, **_kwargs: sockets.pop(0))
    client = FlashForgeClient("printer")

    assert client.upload(gcode) == "0:/user/part.gcode"
    assert console.sent == [b"~M601 S1\r\n", b"~M115\r\n", b"~M650\r\n", b"~M119\r\n"]
    assert upload.sent == [b"~M28 6 0:/user/part.gcode\r\n", b"G1 X1\n", b"~M29\r\n"]


def test_upload_flushes_payload_for_three_seconds_before_m29(monkeypatch, tmp_path):
    gcode = tmp_path / "part.gcode"
    gcode.write_bytes(b"abcdef")
    console = FakeSocket([b"ok\n"] * 4)
    upload = FakeSocket([b"ok\n", b"ok\n"])
    sockets = [console, upload]
    monkeypatch.setattr(socket, "create_connection", lambda *_args, **_kwargs: sockets.pop(0))
    monkeypatch.setattr(
        client_module.time,
        "sleep",
        lambda seconds: upload.events.append(("sleep", seconds)),
    )

    assert FlashForgeClient("printer").upload(gcode, chunk_size=2) == "0:/user/part.gcode"

    assert upload.events == [
        ("sendall", b"~M28 6 0:/user/part.gcode\r\n"),
        ("sendall", b"ab"),
        ("sendall", b"cd"),
        ("sendall", b"ef"),
        ("sleep", 3.0),
        ("sendall", b"~M29\r\n"),
    ]


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
    fake = FakeSocket([b"ok\n"] * 4 + [b"ok\n", b"ok\n"])
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


def test_m28_command_receipt_without_exact_ok_aborts_before_payload_or_m29(monkeypatch, tmp_path):
    gcode = tmp_path / "part.gcode"
    gcode.write_bytes(b"G1 X1\n")
    console = FakeSocket([b"ok\n"] * 4)
    upload = FakeSocket([b"CMD M28 Received.\r\n"])
    sockets = [console, upload]
    monkeypatch.setattr(socket, "create_connection", lambda *_args, **_kwargs: sockets.pop(0))

    with pytest.raises(ProtocolError, match="M28 upload start"):
        FlashForgeClient("printer").upload(gcode)
    assert upload.sent == [b"~M28 6 0:/user/part.gcode\r\n"]


def test_m28_error_with_ok_aborts_before_payload_or_m29(monkeypatch, tmp_path):
    gcode = tmp_path / "part.gcode"
    gcode.write_bytes(b"G1 X1\n")
    console = FakeSocket([b"ok\n"] * 4)
    upload = FakeSocket([b"Error: cannot open file\r\nok\r\n"])
    sockets = [console, upload]
    monkeypatch.setattr(socket, "create_connection", lambda *_args, **_kwargs: sockets.pop(0))

    with pytest.raises(ProtocolError, match="rejected M28 upload start: Error: cannot open file"):
        FlashForgeClient("printer").upload(gcode)
    assert upload.sent == [b"~M28 6 0:/user/part.gcode\r\n"]


def test_upload_missing_preamble_ack_fails_before_upload_connection(monkeypatch, tmp_path):
    gcode = tmp_path / "part.gcode"
    gcode.write_bytes(b"G1 X1")
    console = FakeSocket([b"ok\n", b"not ready\n"])
    sockets = [console]
    monkeypatch.setattr(socket, "create_connection", lambda *_args, **_kwargs: sockets.pop(0))
    with pytest.raises(ProtocolError, match="M115 preamble"):
        FlashForgeClient("printer").upload(gcode)
    assert console.sent == [b"~M601 S1\r\n", b"~M115\r\n"]
    assert sockets == []


def test_upload_preamble_timeout_fails_closed(monkeypatch, tmp_path):
    gcode = tmp_path / "part.gcode"
    gcode.write_bytes(b"G1 X1")
    console = FakeSocket([socket.timeout()])
    sockets = [console]
    monkeypatch.setattr(socket, "create_connection", lambda *_args, **_kwargs: sockets.pop(0))
    with pytest.raises(ProtocolError, match="M601 S1 preamble"):
        FlashForgeClient("printer").upload(gcode)
    assert console.sent == [b"~M601 S1\r\n"]
    assert sockets == []

def test_upload_missing_m29_ack_fails_closed(monkeypatch, tmp_path):
    gcode = tmp_path / "part.gcode"
    gcode.write_bytes(b"G1 X1")
    console = FakeSocket([b"ok\n"] * 4)
    upload = FakeSocket([b"ok\n", socket.timeout()])
    sockets = [console, upload]
    monkeypatch.setattr(socket, "create_connection", lambda *_args, **_kwargs: sockets.pop(0))
    with pytest.raises(ProtocolError, match="M29 upload completion"):
        FlashForgeClient("printer").upload(gcode)


def test_m29_save_error_with_ok_fails_completion(monkeypatch, tmp_path):
    gcode = tmp_path / "part.gcode"
    gcode.write_bytes(b"G1 X1")
    console = FakeSocket([b"ok\n"] * 4)
    upload = FakeSocket([b"ok\n", b"Error: failed to save file\r\nok\r\n"])
    sockets = [console, upload]
    monkeypatch.setattr(socket, "create_connection", lambda *_args, **_kwargs: sockets.pop(0))

    with pytest.raises(ProtocolError, match="rejected M29 upload completion: Error: failed to save file"):
        FlashForgeClient("printer").upload(gcode)


def _verified_client(monkeypatch, upload_responses, listing, selection, size):
    responses = [[b"ok\n"] * 4, upload_responses, [listing], [selection], [size]]
    sockets = [FakeSocket(batch) for batch in responses]
    created_sockets = list(sockets)
    monkeypatch.setattr(socket, "create_connection", lambda *_args, **_kwargs: sockets.pop(0))
    return created_sockets


def test_upload_and_verify_requires_exact_size(monkeypatch, tmp_path):
    gcode = tmp_path / "part.gcode"
    gcode.write_bytes(b"G1 X1\n")
    _verified_client(
        monkeypatch,
        [b"ok\n", b"ok\n"],
        b"/data/part.gcode:\n",
        b"File opened: 0:/user/part.gcode Size: 6\nok\n",
        b"SD printing byte 0/6\nok\n",
    )
    assert FlashForgeClient("printer").upload_and_verify(gcode) == "0:/user/part.gcode"


def test_upload_verification_selects_same_user_path(monkeypatch, tmp_path):
    gcode = tmp_path / "part.gcode"
    gcode.write_bytes(b"G1 X1\n")
    sockets = _verified_client(
        monkeypatch,
        [b"ok\n", b"ok\n"],
        b"/data/part.gcode:\n",
        b"File opened: part.gcode Size: 6\nok\n",
        b"unused",
    )
    FlashForgeClient("printer").upload_and_verify(gcode)
    assert sockets[3].sent == [b"~M23 0:/user/part.gcode\r\n"]


def test_upload_and_verify_uses_m23_size_even_when_listing_omits_file(monkeypatch, tmp_path):
    gcode = tmp_path / "part.gcode"
    gcode.write_bytes(b"G1 X1\n")
    _verified_client(
        monkeypatch,
        [b"ok\n", b"ok\n"],
        b"/data/other.gcode:\n",
        b"CMD M23 Received\nFile opened: part.gcode Size: 6\nFile selected\nok\n",
        b"SD printing byte 0/100\nok\n",
    )
    assert FlashForgeClient("printer").upload_and_verify(gcode) == "0:/user/part.gcode"


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
        [b"ok\n", b"ok\n"],
        b"/data/part.gcode:\n",
        selection,
        b"SD printing byte 0/6\nok\n",
    )
    with pytest.raises(ProtocolError, match=error):
        FlashForgeClient("printer").upload_and_verify(gcode)


@pytest.mark.parametrize(
    ("listing", "selection", "size", "upload_responses", "error"),
    [
        (b"/data/part.gcode:\n", b"File opened: part.gcode Size: 5\nok\n", b"SD printing byte 0/5\nok\n", [b"ok\n", b"ok\n"], "size mismatch"),
        (b"/data/other.gcode:\n", b"ok\n", b"SD printing byte 0/6\nok\n", [b"ok\n", b"ok\n"], "M23 did not report the size"),
        (b"/data/part.gcode:\n", b"ok\n", b"size unavailable\nok\n", [b"ok\n", b"ok\n"], "M23 did not report the size"),
        (b"/data/part.gcode:\n", b"not ok\n", b"SD printing byte 0/6\n", [b"ok\n", b"ok\n"], "M23 file selection"),
        (b"/data/part.gcode:\n", b"ok\n", b"SD printing byte 0/6\nok\n", [b"ok\n", socket.timeout()], "M29 upload completion"),
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


def test_print_file_accepts_uploaded_user_namespace(monkeypatch):
    fake = FakeSocket([b"ok\n"])
    start = FakeSocket([b"ok\n"])
    sockets = [fake, start]
    monkeypatch.setattr(socket, "create_connection", lambda *_args, **_kwargs: sockets.pop(0))
    assert FlashForgeClient("printer").print_file("0:/user/part.gcode") == "ok\n\nok\n"
    assert fake.sent == [b"~M23 0:/user/part.gcode\r\n"]
    assert start.sent == [b"~M24\r\n"]


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
    sockets = [FakeSocket([b"ok\n"] * 4), FakeSocket([b"ok\n", b"ok\n"])]
    monkeypatch.setattr(socket, "create_connection", lambda *_args, **_kwargs: sockets.pop(0))
    assert FlashForgeClient("printer").upload(gcode, "my part – café.gcode") == "0:/user/my part – café.gcode"

    sockets = [FakeSocket([b"ok\n"]), FakeSocket([b"ok\n"])]
    monkeypatch.setattr(socket, "create_connection", lambda *_args, **_kwargs: sockets.pop(0))
    FlashForgeClient("printer").print_file("/data/my part – café.gcode")
