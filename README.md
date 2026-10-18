# FFADV4Manager

FFADV4Manager is an open-source Python command-line toolkit for controlling legacy FlashForge printers that are no longer well supported by current FlashForge desktop software. The `ffadv4manager` CLI is designed for Linux terminals and AI-agent workflows; `ad4ctl` remains as a compatibility alias.

The first target is the **FlashForge Adventurer 4**, confirmed working against firmware `v2.3.3-3.33` on TCP port `8899`.

## Current status

Working today:

- Printer status
- Temperature readout
- Print progress readout
- Parsed and raw printer file listings (`files`, `files-raw`)
- Upload G-code/GX files
- Verify upload acknowledgement, remote path, and reported byte size before `--start`
- Optional timestamped JSONL logs of printer upload/verification replies (`--log-file`)
- Start prints remotely
- Pause/resume/cancel commands
- Live `watch` mode
- UDP printer discovery, with optional JSON output
- Camera stream URL, browser launch, and bounded JPEG snapshot (`camera snapshot`)

Planned CLI and protocol improvements:

- Support for related FlashForge models

## Linux CLI installation and use

The Python CLI works from a terminal on Linux with Python 3.9 or newer. From a
checkout, install it in an isolated virtual environment:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -e .
```

Set a printer address, then run commands without repeating it:

```bash
ffadv4manager config set --host 192.168.1.50
ffadv4manager status
ffadv4manager files
ffadv4manager help                 # comprehensive guide; no printer connection
ffadv4manager help upload          # command-specific help; no printer connection
ffadv4manager discover --json      # find printers without a configured host
```

You can also pass a host directly, e.g. `ffadv4manager --host 192.168.1.50 status`.
See [Configuration](#configuration) and [Usage](#usage) for details.
For the full command reference, see [docs/CLI.md](docs/CLI.md).

## Configuration

Rather than passing `--host` on every command, store connection defaults once:

```bash
ffadv4manager config set --host 192.168.1.50
ffadv4manager config set --host 192.168.1.50 --port 8899 --timeout 8
ffadv4manager config set --camera-port 8080 --camera-path '/?action=stream'
```

Then commands can be run without flags:

```bash
ffadv4manager status
ffadv4manager files
```

A flag always overrides the stored value, so you can point at a different printer
temporarily:

```bash
ffadv4manager --host 192.168.1.60 status
```

Inspect or clear the stored config:

```bash
ffadv4manager config show
ffadv4manager config path
ffadv4manager config unset port camera_path
```

The config lives at `~/.config/ffadv4manager/config.ini` (respecting `XDG_CONFIG_HOME`).
Set `FFADV4MANAGER_CONFIG` to point at a different file. It takes precedence over
legacy `AD4CONNECT_CONFIG`, which is used when the new variable is unset. If no
override is set and the new default config is absent, the existing
`~/.config/ad4connect/config.ini` (or its `XDG_CONFIG_HOME` equivalent) is read.
Writes go to the new path and leave the legacy file untouched.
Camera defaults are `camera_port = 8080` and `camera_path = /?action=stream`;
camera command options override them. Camera paths are kept literally, including
query strings.

## Usage

```bash
ffadv4manager --host 192.168.1.50 status
ffadv4manager --host 192.168.1.50 files
ffadv4manager --host 192.168.1.50 files-raw
ffadv4manager --host 192.168.1.50 watch
ffadv4manager discover
ffadv4manager discover --json
```

Upload only:

```bash
ffadv4manager --host 192.168.1.50 upload ~/Downloads/model.gcode --remote-name model.gcode
```

The input must be an existing, non-empty G-code/GX file (typically exported by a
slicer); empty files are rejected before the upload starts. The upload command
does not generate or slice a model.

Upload and start:

```bash
ffadv4manager --host 192.168.1.50 upload ~/Downloads/model.gcode --remote-name model.gcode --start --log-file upload.jsonl
```

With `--start`, the CLI starts the job only after the printer acknowledges upload
completion, lists the remote path, and reports a byte total matching the bytes
sent. If the firmware does not provide an unambiguous size, the CLI refuses to
start. The JSONL log is appended and includes the printer's raw protocol replies.

Print an existing printer-side file:

```bash
ffadv4manager --host 192.168.1.50 print model.gcode
```

Pause/resume/cancel:

```bash
ffadv4manager --host 192.168.1.50 pause
ffadv4manager --host 192.168.1.50 resume
ffadv4manager --host 192.168.1.50 cancel
```

## Discovery and camera

Discovery sends UDP multicast/broadcast probes to the supported FlashForge
discovery targets and listens for up to three seconds by default. It needs no
stored host and does not open a printer command connection:

```bash
ffadv4manager discover
ffadv4manager discover --timeout 5 --json
```

On an interactive terminal, plain `discover` offers to save the discovered host
as the local default only when a printer advertises command port `8899`. If more
than one printer advertises that port, select one and confirm before saving. The
port is the value advertised in the UDP discovery response; the command does not
scan TCP ports or the subnet. `--json` and non-interactive runs never prompt or
write the config. If no eligible printer is found, the config is unchanged.

Camera commands use the configured printer host (or an explicit root `--host`)
and the camera's separate HTTP MJPEG endpoint. The defaults are port `8080` and
path `/?action=stream`:

```bash
ffadv4manager camera url                         # prints only the URL; useful for piping
ffadv4manager camera open                        # asks the system browser to open it
ffadv4manager camera snapshot /tmp/ad4-frame.jpg # saves first complete JPEG frame
ffadv4manager --host 192.168.1.60 camera url --camera-port 8081
```

`camera snapshot OUTPUT` saves the first complete JPEG frame to the given path;
for example, `/tmp/ad4-frame.jpg` above. `camera url` prints a URL without
connecting, while `camera open` requires a usable desktop browser.

`camera open` depends on `webbrowser` finding a usable desktop browser; in a
headless environment it reports that it could not open the browser and shows the
URL. Use `camera url` or `camera snapshot` in terminal-only/agent workflows.
Snapshot download is bounded and only writes a complete JPEG frame. The camera
HTTP stream has no authentication or encryption, so expose/use it only on a
trusted network. These camera operations use HTTP, not the printer-control TCP
protocol.

## Protocol notes

The Adventurer 4 exposes a legacy FlashForge TCP service on port `8899`. Commands are sent as:

```text
~M119\r\n
```

Useful commands confirmed:

| Command | Purpose |
| --- | --- |
| `M119` | Printer state / current file |
| `M105` | Temperature state |
| `M27` | Print progress |
| `M661` | File listing |
| `M601 S1`, `M115`, `M650`, `M119` | Acknowledged upload preamble (separate connection) |
| `M28 <size> 0:/user/file.gcode` | Begin file upload with declared byte size and destination |
| `M29` | Finish file upload |
| `M23 0:/user/file.gcode` | Select and verify uploaded file |
| `M24` | Start/resume print |
| `M25` | Pause print |
| `M26` | Cancel/reset SD print state |

Uploads require a standalone `ok` response after every preamble command, M28
readiness, and M29 completion. Payload is sent as raw chunks followed by a 3-second
flush delay. Verification selects the same `0:/user/<name>` path and requires
M23 to report the exact local byte size; M661's `/data` listing is supplementary
because its namespace may differ.

## Safety

This is early alpha software. Watch the printer when starting prints remotely. Use at your own risk.

## OrcaSlicer Linux post-processing hook

The optional `scripts/orca_ad4_upload.py` hook accepts the generated G-code path
as a final positional argument. In the verified OrcaSlicer Linux post-processing
contract, Orca runs each configured command line through `$SHELL -c` and appends
the G-code path as one shell-quoted final argument. The tested contract is based
on OrcaSlicer source commit `1ee0b730a1e6484e55a631dd567b41c986fc1d6a`; downstream
builds or versions may differ.

Configure one command per line in OrcaSlicer, for example:

```sh
'/home/user/venv/bin/python' '/home/user/FFADV4Manager/scripts/orca_ad4_upload.py' --host 192.168.1.50 --start
```

Quote paths to the Python executable and script in the configured command, and
use shell quoting if either path contains spaces or quote characters. OrcaSlicer
appends the generated G-code filename automatically, quoting it as a single shell
word (including paths with spaces or single quotes). **Do not append a filename
placeholder** such as `$1` or `{file}`. The hook also accepts `--gcode PATH` for
manual invocation, or `--gcode` may be omitted in favor of the appended positional
path.

The hook uses `--host` when supplied; otherwise it reads the same stored config
as `ffadv4manager`. It also honors explicit `--port` / `--timeout` before the stored
values and built-in defaults. It checks printer status before uploading and,
with `--start`, checks again immediately before starting the print. An unavailable
or unparseable status and a busy printer fail closed by default. `--force`
explicitly bypasses these status gates; `--start` remains opt-in. Hook failures
return nonzero, which OrcaSlicer treats as export failure under the verified
contract. Usage/configuration errors return status 2; operational errors return
status 1.
