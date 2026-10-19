import struct
import sys

import pytest

from ffadv4manager.core.gcode_to_gx import BMP_SIZE, GCODE_OFFSET, GX_MAGIC, HEADER_SIZE, convert_gcode_to_gx, upload_file
from ffadv4manager import cli


def _converter(tmp_path, *, offsets=(HEADER_SIZE, BMP_SIZE, GCODE_OFFSET, GCODE_OFFSET)):
    exe = tmp_path / "gcode-to-gx"
    header = GX_MAGIC + struct.pack("<4I", *offsets) + bytes(HEADER_SIZE - len(GX_MAGIC) - 16)
    exe.write_text(f"#!{sys.executable}\nimport pathlib, sys\np=pathlib.Path(sys.argv[-1])\np.write_bytes({header!r}+b'BM'+bytes({BMP_SIZE - 2})+p.read_bytes())\n")
    exe.chmod(0o755)
    return exe


def test_converter_uses_temp_copy_validates_layout_and_preserves_source(monkeypatch, tmp_path):
    exe = _converter(tmp_path)
    monkeypatch.setenv("PATH", str(tmp_path))
    source = tmp_path / "model.gcode"
    original = b"G1 X1\n"
    source.write_bytes(original)
    output = tmp_path / "model.gx"
    convert_gcode_to_gx(source, output)
    data = output.read_bytes()
    assert source.read_bytes() == original
    assert data.startswith(GX_MAGIC)
    assert struct.unpack_from("<4I", data, len(GX_MAGIC)) == (HEADER_SIZE, BMP_SIZE, GCODE_OFFSET, GCODE_OFFSET)
    assert data[58:60] == b"BM"
    assert data[GCODE_OFFSET:] == original


def test_upload_file_detects_gx_magic_and_rejects_unknown(tmp_path):
    gx = tmp_path / "weird.bin"
    gx.write_bytes(GX_MAGIC + bytes(GCODE_OFFSET - len(GX_MAGIC)))
    with upload_file(gx) as (path, remote):
        assert path == gx and remote == "weird.gx"
    with pytest.raises(ValueError, match="cannot automatically convert"):
        with upload_file(tmp_path / "arbitrary.bin"):
            pass


def test_convert_cli_local_output(monkeypatch, tmp_path, capsys):
    _converter(tmp_path)
    monkeypatch.setenv("PATH", str(tmp_path))
    source = tmp_path / "part.gco"
    source.write_text("G1 X2\n")
    output = tmp_path / "part.gx"
    assert cli.main(["convert", str(source), "--output", str(output)]) == 0
    assert output.read_bytes()[GCODE_OFFSET:] == b"G1 X2\n"
    assert str(output) in capsys.readouterr().out


def test_cli_upload_converts_and_uses_gx_remote_name(monkeypatch, tmp_path):
    _converter(tmp_path)
    monkeypatch.setenv("PATH", str(tmp_path))
    source = tmp_path / "part.gcode"
    source.write_text("G1 X3\n")
    monkeypatch.setattr(cli, "_progress", lambda *_: None)

    class Client:
        def __init__(self, *_args, **_kwargs):
            pass

        def status(self):
            return type("Status", (), {"is_printing": False})()

        def upload_and_confirm_listed(self, path, remote_name, **_kwargs):
            assert path.read_bytes()[GCODE_OFFSET:] == b"G1 X3\n"
            assert remote_name == "part.gx"
            return "0:/user/part.gx"

    monkeypatch.setattr(cli, "FlashForgeClient", Client)
    assert cli.main(["--host", "printer", "upload", str(source)]) == 0
    assert source.read_text() == "G1 X3\n"


@pytest.mark.parametrize(
    ("offsets", "message"),
    [
        ((57, BMP_SIZE, GCODE_OFFSET, GCODE_OFFSET), "BMP offset/size"),
        ((HEADER_SIZE, BMP_SIZE, GCODE_OFFSET - 1, GCODE_OFFSET), "G-code offset"),
        ((HEADER_SIZE, BMP_SIZE, GCODE_OFFSET, GCODE_OFFSET + 1), "G-code offset"),
    ],
)
def test_converter_rejects_incorrect_header_layout(monkeypatch, tmp_path, offsets, message):
    _converter(tmp_path, offsets=offsets)
    monkeypatch.setenv("PATH", str(tmp_path))
    source = tmp_path / "bad.gcode"
    source.write_text("G1 X1\n")
    with pytest.raises(ValueError, match=message):
        convert_gcode_to_gx(source, tmp_path / "bad.gx")


def test_converter_failure_reports_error_and_creates_no_output(monkeypatch, tmp_path):
    executable = tmp_path / "gcode-to-gx"
    executable.write_text(f"#!{sys.executable}\nraise SystemExit('converter failed')\n")
    executable.chmod(0o755)
    monkeypatch.setenv("PATH", str(tmp_path))
    source = tmp_path / "broken.gcode"
    source.write_text("G1 X1\n")
    output = tmp_path / "broken.gx"
    with pytest.raises(RuntimeError, match="gcode-to-gx conversion failed: converter failed"):
        convert_gcode_to_gx(source, output)
    assert not output.exists()
