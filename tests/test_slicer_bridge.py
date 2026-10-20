from pathlib import Path
from http.server import ThreadingHTTPServer
import http.client
import json
import subprocess
import threading

import pytest

from ffadv4manager import slicer_bridge


@pytest.mark.parametrize("name", ["../part.gcode", "..\\part.gcode", "/tmp/part.gcode", "part.gcode;id", "part.gx", ""])
def test_remote_name_rejects_paths_and_unsafe_names(name):
    with pytest.raises(ValueError):
        slicer_bridge.safe_remote_name(name)


def test_remote_name_accepts_plain_gcode_basename():
    assert slicer_bridge.safe_remote_name("My_part-01.GCODE") == "My_part-01.GCODE"


def test_request_schema_is_strict():
    valid = b'{"filename":"safe.gcode","gcode":"G1 X1","start":false}'
    assert slicer_bridge.validate_print_request(valid) == ("safe.gcode", "G1 X1", False)
    for invalid in (
        b'{"filename":"safe.gcode","gcode":"G1","start":0}',
        b'{"filename":"safe.gcode","gcode":"G1","start":false,"extra":1}',
        b'{"filename":"safe.gcode","gcode":"G1","start":false,"start":true}',
    ):
        with pytest.raises((ValueError, TypeError)):
            slicer_bridge.validate_print_request(invalid)


@pytest.mark.parametrize("start", [False, True])
def test_upload_uses_fixed_module_argv_and_cleans_temp_file(monkeypatch, start):
    captured = {}

    def fake_run(argv, **kwargs):
        captured.update(argv=argv, kwargs=kwargs)
        captured["content"] = Path(argv[4]).read_text()
        return subprocess.CompletedProcess(argv, 0, "ok", "")

    monkeypatch.setattr(slicer_bridge.subprocess, "run", fake_run)
    result = slicer_bridge.invoke_upload("G1 X1\n", "safe.gcode", start)
    argv = captured["argv"]
    assert result.returncode == 0
    assert argv[:3] == [slicer_bridge.sys.executable, "-m", "ffadv4manager.cli"]
    assert argv[3] == "upload"
    assert Path(argv[4]).suffix == ".gcode"
    assert argv[5:] == ["--remote-name", "safe.gcode"] + (["--start"] if start else [])
    assert captured["content"] == "G1 X1\n"
    assert captured["kwargs"] == {"capture_output": True, "text": True, "check": False}
    assert not Path(argv[4]).exists()


def test_slicer_server_defaults_to_loopback_and_web_dist(tmp_path, monkeypatch):
    index = tmp_path / "index.html"
    index.write_text(f"<script>{slicer_bridge.TOKEN_PLACEHOLDER}</script>")
    seen = {}

    class FakeServer:
        server_port = 45678

        def __init__(self, address, handler):
            seen.update(address=address, handler=handler)

        def serve_forever(self):
            raise KeyboardInterrupt

        def server_close(self):
            seen["closed"] = True

    monkeypatch.setattr(slicer_bridge, "ThreadingHTTPServer", FakeServer)
    monkeypatch.setattr(slicer_bridge.webbrowser, "open", lambda url: seen.update(url=url))
    slicer_bridge.serve(tmp_path)
    assert seen["address"] == ("127.0.0.1", slicer_bridge.PORT)
    assert seen["url"] == "http://127.0.0.1:45678/"
    assert seen["closed"] is True


def test_missing_ui_build_has_actionable_error(tmp_path):
    with pytest.raises(FileNotFoundError, match="build the web UI first"):
        slicer_bridge.serve(tmp_path)


@pytest.fixture
def http_bridge(tmp_path):
    calls = []

    def upload(gcode, remote_name, start):
        calls.append((gcode, remote_name, start))
        return subprocess.CompletedProcess([], 0, "ok", "")

    server = ThreadingHTTPServer(
        ("127.0.0.1", 0),
        slicer_bridge.make_handler(tmp_path, "test-secret-token", upload),
    )
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield server.server_port, calls
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


def post_print(port, *, origin="correct", host="correct", token="correct", content_type="application/json", payload=None):
    authority = f"127.0.0.1:{port}"
    headers = {"Content-Type": content_type, "Authorization": "Bearer test-secret-token"}
    if origin == "correct":
        headers["Origin"] = f"http://{authority}"
    elif origin == "wrong":
        headers["Origin"] = "http://example.com"
    if host == "correct":
        headers["Host"] = authority
    elif host == "wrong":
        headers["Host"] = "example.com"
    elif host == "missing":
        # http.client otherwise supplies its own Host header automatically.
        headers["Host"] = ""
    if token == "missing":
        headers.pop("Authorization")
    elif token == "wrong":
        headers["Authorization"] = "Bearer wrong-token"
    body = payload if payload is not None else b'{"filename":"safe.gcode","gcode":"G1 X1","start":false}'
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=2)
    connection.request("POST", "/api/print", body=body, headers=headers)
    response = connection.getresponse()
    result = response.status, response.read()
    connection.close()
    return result


@pytest.mark.parametrize(
    "kwargs,expected_status",
    [
        ({"origin": "wrong"}, 403),
        ({"origin": "missing"}, 403),
        ({"host": "wrong"}, 403),
        ({"host": "missing"}, 403),
        ({"token": "wrong"}, 401),
        ({"token": "missing"}, 401),
        ({"content_type": "text/plain"}, 415),
    ],
)
def test_http_rejects_unauthorized_requests_without_upload(http_bridge, kwargs, expected_status):
    port, calls = http_bridge
    status, body = post_print(port, **kwargs)
    assert status == expected_status
    assert json.loads(body)["success"] is False
    assert calls == []


def test_http_valid_upload_only_succeeds_without_start(http_bridge):
    port, calls = http_bridge
    status, body = post_print(port)
    assert status == 200
    result = json.loads(body)
    assert result["success"] is True
    assert result["message"] == "Upload completed"
    assert calls == [("G1 X1", "safe.gcode", False)]


def test_http_explicit_start_true_passes_start_to_mock_upload(http_bridge):
    port, calls = http_bridge
    status, body = post_print(port, payload=b'{"filename":"safe.gcode","gcode":"G1 X1","start":true}')
    assert status == 200
    result = json.loads(body)
    assert result["success"] is True
    assert result["message"] == "Upload completed; print-start command acknowledged; physical printing not verified"
    assert calls == [("G1 X1", "safe.gcode", True)]


def test_http_accepts_gcode_larger_than_previous_limit(http_bridge):
    port, calls = http_bridge
    gcode = "G" * (8 * 1024 * 1024 + 128 * 1024)
    payload = json.dumps({"filename": "large.gcode", "gcode": gcode, "start": False}).encode()
    status, body = post_print(port, payload=payload)
    assert status == 200
    assert json.loads(body)["success"] is True
    assert len(calls) == 1
    assert calls[0] == (gcode, "large.gcode", False)


def test_http_body_timeout_rejects_request_and_releases_upload_lock(http_bridge, monkeypatch):
    monkeypatch.setattr(slicer_bridge, "BODY_READ_TIMEOUT", 0.05)
    port, calls = http_bridge
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=2)
    connection.putrequest("POST", "/api/print")
    connection.putheader("Host", f"127.0.0.1:{port}")
    connection.putheader("Origin", f"http://127.0.0.1:{port}")
    connection.putheader("Authorization", "Bearer test-secret-token")
    connection.putheader("Content-Type", "application/json")
    connection.putheader("Content-Length", "100")
    connection.endheaders()
    connection.send(b'{"filename":"safe.gcode"')
    response = connection.getresponse()
    assert response.status == 408
    assert json.loads(response.read())["success"] is False
    connection.close()
    assert calls == []

    status, body = post_print(port)
    assert status == 200
    assert json.loads(body)["success"] is True
    assert calls == [("G1 X1", "safe.gcode", False)]
