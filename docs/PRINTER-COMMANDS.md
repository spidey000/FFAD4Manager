# Printer command and G-code evidence catalog

This is a catalog of commands found in this project, the captured Adventurer 4
responses, and the local test G-code files. It is **not an exhaustive list of
commands that work**: no official complete command reference for regular
Adventurer 4 firmware `v2.2.4` is available in this project. Firmware, model,
and command context can change behavior. An acknowledgement proves that a
command was accepted or answered, not that its physical effect is safe.

Evidence was cross-checked against the active Python client/CLI and printer
responses collected during a local test session on 2026-10-18. The raw protocol
transcript, test G-code, inert probe, and local test log are not distributed in
this catalog. No undocumented command is presented as confirmed merely because
it appears in test code or a G-code file.

## Evidence labels

- **Device response (`v2.2.4`)** — a response is present in the October 18
  device log, whose `M115` reply identifies an Adventurer 4 running firmware
  `v2.2.4`. This does not necessarily establish all command semantics.
- **Hardware-confirmed control (`v2.2.4`)** — the user confirms print start,
  pause, resume, and cancel worked on the Adventurer 4. CLI replies and status
  transitions were recorded for the short bearing model. In the complete
  sequence, the printer ran for 30 seconds after resume before cancellation;
  progress remained `0/100`, so no extrusion or completed object is claimed.
  (An earlier aborted attempt paused and canceled immediately.)
- **Implemented; not directly hardware-verified** — present in the current
  client, but no direct device evidence for its behavior is recorded in this
  session.
- **Executed-file evidence; not individually observed** — included in the local
  `test.gcode` uploaded as `test2.gcode`, which the user confirmed physically
  executed. There is no per-line device trace, so this does not prove that each
  line ran or establish its exact effect.
- **Probe-file evidence; not executed** — present in the separate M117-only
  probe file and listed on the printer; the user reported that the probe did
  not execute.
- **Semantics uncertain / potentially risky** — acceptance or presence is not a
  guarantee of harmless behavior. Treat commands with physical-motion,
  heating, selection, cancellation, or undocumented firmware effects with
  care.

## FlashForge TCP command protocol

For ordinary printer commands, the client opens TCP port `8899` and frames a
command as `~<G-code>\r\n` (for example, `~M119\r\n`). This framing is specific
to the printer command connection. During an upload, the client sends framed
M28, waits for readiness, transmits the file payload as raw bytes/chunks
without adding a guessed G-code wrapper, waits the existing 3-second flush
interval, then sends framed M29. The payload is file content, not an additional
printer command.

The UDP multicast/broadcast requests used by `ffadv4manager discover` are a
separate discovery protocol, not G-code and not commands on the TCP connection.

## Printer commands

| Command | Meaning in this project / response evidence | Evidence and confidence |
|---|---|---|
| `M601 S1` | Sent first in the current upload preamble. The observed reply was `Control Success V2.1.` followed by `ok`. | **Device response (`v2.2.4`)**; **semantics uncertain / potentially risky**. Its firmware-side effect is not authoritatively established. Do not infer that “Control Success” means it cannot affect execution state. |
| `M115` | Firmware/device information query. Observed fields: `Machine Type`, `Machine Name`, `Firmware`, `SN` (serial number), dimensions `X`, `Y`, `Z`, `Tool Count`, and `Mac Address`, followed by `ok`. Example non-unique values were Adventurer 4, firmware `v2.2.4`, and dimensions `220 × 200 × 250`. | **Device response (`v2.2.4`)**. The raw command returns identifying fields including a serial number and MAC address; their values are deliberately not repeated here. The CLI does not parse this response into a model. |
| `M650` | Sent in the upload preamble. The observed reply was `X: 1.0 Y: 0.5` and `ok`. | **Device response (`v2.2.4`)**; **semantics uncertain**. The meaning of these values is not established here. |
| `M119` | Status/endstop query. The observed response included `MachineStatus: READY`, `MoveMode: READY`, empty `CurrentFile`, `Endstop: X-max:0 Y-max:0 Z-max:0`, generic flags `S:1 L:0 J:0 F:0`, and `LED: 1`. | **Device response (`v2.2.4`)**. The parser reads only `MachineStatus`, `MoveMode`, and `CurrentFile`; the endstops, flags, and LED are not separate parsed model fields or shown in CLI status. |
| `M105` | The parser recognizes `T0:<nozzle-current>/<nozzle-target> B:<bed-current>/<bed-target>` and maps the four integer values to nozzle/bed temperatures. Observed CLI examples included nozzle `30/0 °C` and bed `26/0 °C`. | **Device-backed status query**. The raw M105 line was not retained separately, so the recognized format is implementation evidence; the observed evidence is the parsed temperature output. |
| `M27` | Observed progress fields include `SD printing byte <current>/<total>` and `Layer: <current>/<total>`, followed by `ok`. | **Device response (`v2.2.4`)**. The parser maps the byte and layer pairs into optional integer fields; percent is computed from the byte pair, not read as a separate response field. |
| `M114` | Read-only position query. The observed raw reply was `X:-100 Y:90 Z:19.9992 A:0 B:0` followed by `ok`. | **Directly observed.** These are raw response fields; the CLI does not parse or display them as status. Community reference: [M114](https://github.com/Parallel-7/flashforge-api-docs/wiki/TCP-Protocol#m114---current-position). |
| `M28 <size> 0:/user/<name>` | Current upload sender declares the local byte count and destination. M28 readiness is accepted only on a standalone `ok`. | **Implemented; not directly hardware-verified for this exact argument form**. The device did answer M28 during uploads, with a response such as `Writing to file: /data/probe-1.gcode` and `ok`; the exact transmitted arguments are not recorded in the response log, and the firmware-reported `/data` namespace differs from the sender's `0:/user` namespace. |
| Raw file payload | Current sender transmits the file's bytes in chunks between acknowledged M28 and M29, without command framing or added payload markers. | **Implemented**. Uploads were accepted and filenames appeared in M661, but this is not byte-for-byte device-side content verification. |
| `M29` | Ends the upload. A recorded device reply was `Done saving file.` followed by `ok`. Current sender also requires a standalone `ok`. | **Device response (`v2.2.4`)**. The reply does not by itself establish exact stored content. |
| `M661` | Requests the printer's file listing. Recorded replies included `/data/...` entries; the current upload-only path checks for the requested basename across `/data/` and `0:/user/`. | **Device response (`v2.2.4`)**. Listing a name confirms presence in the listing only; it does not establish file size or content integrity. |
| `M662 <file_path>` | Reads a printer-side file preview/thumbnail, not the live camera. | **Directly observed.** An existing `.gx` path returned `CMD M662 Received.`, `ok`, then 14,486 binary bytes beginning with BMP signature `BM` (not PNG). Community reference: [M662](https://github.com/Parallel-7/flashforge-api-docs/wiki/TCP-Protocol#m662---get-local-file-preview). |
| `M23 <path>` | Selects/opens a file in current `print_file()` flow. A recorded response for `test2.gcode` said `File opened: test2.gcode Size: 727`, `File selected`, `ok`. | **Device response (`v2.2.4`)**; **semantics uncertain / potentially print-starting on this unit**. The user confirmed that `test2.gcode` physically executed after an older upload flow sent M23, despite no M24 in the transcript. M23 is the leading trigger candidate, not proven causation. It is deliberately absent from upload-only paths. |
| `M24` | Current CLI's explicit `print`/`upload --start` path sends M24 after file selection; `resume` also sends M24. | **Hardware-confirmed start and resume (`v2.2.4`)**: in the short bearing-model test, M23 selected the file and M24 was acknowledged; status showed `BUILDING_FROM_SD` / `MOVING`. After a confirmed pause, resume M24 was acknowledged; status showed `BUILDING_FROM_SD` / `MOVING` at 5 and 30 seconds after resume. Progress stayed `0/100`; this does not establish extrusion or part completion. Starting a physical print is consequential. |
| `M25` | Current client `pause()` sends M25. | **Hardware-confirmed pause (`v2.2.4`)**: M25 was acknowledged and status reported `BUILDING_FROM_SD` / `PAUSED` five seconds later, with progress `0/100`. Resume followed five seconds after pause; the 30-second interval was after resume, not a 30-second pause. |
| `M26` | Current client `cancel()` sends M26; the implementation describes it as cancel/reset of SD print state. | **Hardware-confirmed cancel (`v2.2.4`)**: after 30 seconds in the resumed `BUILDING_FROM_SD` / `MOVING` state, M26 was acknowledged and status returned `READY` with no current file; progress remained `0/100`. Cancel may discard an active job. |
| `M105` | Current status path queries nozzle and bed temperatures. | **Device-backed status query.** The live `status` output parsed nozzle `30/0 °C` and bed `26/0 °C`; the raw M105 line was not retained separately. |
| `M27` | Current status path queries print progress. A diagnostic device reply included `SD printing byte 0/100`, `Layer: 0/0`, and `ok`. | **Device response (`v2.2.4`)**. The diagnostic was not evidence of an active print being started by M27. |

## What information the CLI returns

This separates parsed model fields from raw protocol text and the user-facing
CLI output. `PrinterStatus.raw` retains the non-empty M119/M105/M27 responses
joined with newlines, but `status` and `watch` print only the human summary; they
do not print that raw string or expose M119's endstop/flag/LED details.

| CLI command | Information returned to the user | Limits and evidence |
|---|---|---|
| `discover` | Returns discovered printer name, IP/host, and UDP-advertised command port; `--json` returns an array of objects with `name`, `ip`, and `port`. | Uses UDP multicast/broadcast discovery, not a TCP query or scan. It reports what the device advertises, not proof that the command port is reachable. An interactive run may offer to save the host when exactly one eligible printer is found. |
| `status`, `watch` | Both use M119, M105, and M27. The CLI summary prints machine status, move mode, current file; nozzle and bed current/target temperatures when present; current/total SD bytes plus a computed percentage when present; and current/total layer when present. `watch` repeats this summary at its interval. | M119 parser fields are only `MachineStatus`, `MoveMode`, `CurrentFile`; generic M119 endstop values, status flags, and LED details remain only in `raw` and are omitted from the CLI summary. Missing parser matches are `None` and displayed as `-` for the three always-printed state/file fields or omitted for optional temperature/progress/layer rows. Hardware status examples include READY, PAUSED, and BUILDING_FROM_SD/MOVING; a short control test stayed at `0/100`. |
| `files` | Prints one unique `/data/...` path per line. | The parser extracts `/data/` names up to colon/NUL/line delimiters, trims whitespace, and removes duplicates. M661 listing presence does not establish file size or contents. |
| `files-raw` | Prints the decoded M661 response as received by the client, including its command reply and binary-ish separators. | It does not parse, normalize, or verify file sizes/content. Collection ends on idle/timeout or the response byte limit. |
| `upload` | Displays local send progress (`sent` bytes relative to the local file's initial size) and on success prints `Uploaded and listed: 0:/user/<name>`. It collects upload-preamble/M28/M29 replies on stderr or in optional JSONL logs, then checks that M661 lists the requested basename under `/data/` or `0:/user/`. With `--start`, after this check it also prints the raw M23 and M24 replies described for `print`. | Progress measures bytes sent by the client, not confirmed printer bytes. The observed M601/M115/M650/M119 preamble replies were respectively `Control Success V2.1.` + `ok`; the M115 fields listed above; `X: 1.0 Y: 0.5` + `ok`; and M119 status. M28/M29 require standalone `ok`; M28 reported writing under `/data/` although the current sender uses `0:/user/`. Upload-only confirms listing presence only—no remote-size or content verification. |
| `print` | Prints the raw text returned by M23 and then M24. In observed selection output, M23 reported `File opened: <filename> Size: <bytes>`, `File selected`, and `ok`; M24 returned `ok`. | For the short bearing model, M23 reported 547,871 bytes; M24 acknowledgment and following `BUILDING_FROM_SD` / `MOVING` status were hardware-observed. The current CLI does not parse these replies into a structured result. |
| `pause`, `resume`, `cancel` | Each prints the raw reply text from M25, M24, or M26 respectively; observed replies included `ok`. | No structured result is parsed. Hardware-confirmed status transitions in the short control test were `PAUSED` after M25, `BUILDING_FROM_SD` / `MOVING` 5 and 30 seconds after resume M24, then `READY` after M26. Progress remained `0/100`; this is not evidence of extrusion or a completed object. |
| `camera snapshot OUTPUT` | Fetches a bounded HTTP/MJPEG response, saves the first complete JPEG frame to `OUTPUT`, and on success prints the saved path only. | Physical snapshots were captured during preflight/start/pause: `/tmp/opencode/ad4-full-control-preflight-20261018.jpg`, `/tmp/opencode/ad4-full-control-started-20261018.jpg`, and `/tmp/opencode/ad4-full-control-paused-20261018.jpg` (see `TEST_LOG.md`). These are still first-frame captures, not evidence of continuous video or motion. The camera uses separate unauthenticated HTTP, not G-code/M662. |
| `camera url`, `camera open` | `url` prints the constructed stream URL without making a network request. `open` asks the system browser to open that URL and prints either a success message or a manual-open URL/error. | Neither command obtains printer telemetry; `open` behavior depends on a usable browser. The default endpoint is unauthenticated HTTP/MJPEG. |
| `config show`, `config path` | `show` prints locally stored host, command port, timeout, camera port/path, or explains that no configuration is stored. `path` prints the active local config-file path. | Local configuration only; neither command contacts the printer. `config set`/`unset` change local config and do not return printer information. |

Direct information queries outside the CLI status summary return raw response
text through the client's `command()` method. In addition to M115/M114/M662
above, these recorded responses should be interpreted only at the evidence
level stated; command acceptance alone does not establish undocumented effects.

`M663 S<pct>` is **not** a read query: the community reference describes it as a
print-speed setter for newer 5M-series models. It was not sent to this AD4, so
there is no observed AD4 reply or confirmed AD4 behavior for it.

## G-code found in test files

The local `test.gcode` used during testing was a short motion/heat test. It was
uploaded under the name `test2.gcode`; the user confirmed that file physically
executed. The
commands below are therefore **executed-file evidence, not individually
observed**: no command-by-command trace confirms which lines ran or their
individual effects. Descriptions are conventional G-code interpretations, not
a guarantee of this firmware's exact implementation.

| G-code in file | Conventional meaning / parameters | Evidence and caution |
|---|---|---|
| `G21` | Use millimeter units. | **Executed-file evidence; not individually observed**. Standard interpretation; exact firmware handling not separately checked. |
| `G90` | Use absolute positioning. Appears before homing and again after relative movement. | **Executed-file evidence; not individually observed**. Mode affects subsequent movement. |
| `G28` | Home axes (no axis selector is supplied in the test file). | **Executed-file evidence; not individually observed**; **potentially risky** because homing moves the machine. |
| `G91` | Use relative positioning. | **Executed-file evidence; not individually observed**. |
| `G1 Y10 F300` | Linear move to Y +10 mm in relative mode at feedrate 300 mm/min (5 mm/s). | **Executed-file evidence; not individually observed**; **potentially risky** because it commands physical motion. |
| `M104 S80` | Set the nozzle temperature target to 80 °C without a wait in conventional usage. | **Executed-file evidence; not individually observed**; **potentially risky** because it requests heating. |
| `G4 S180` | Dwell for 180 seconds in conventional usage. | **Executed-file evidence; not individually observed**. The file comment describes this as a maximum three-minute heating interval; no per-line execution trace exists. |
| `M104 S0` | Set the nozzle target to 0 °C in conventional usage. | **Executed-file evidence; not individually observed**. |
| `M117 UPLOAD_PROBE_ONLY` | Conventional LCD/status-display message command. | **Probe-file evidence; not executed**. The M117-only probe was listed on the printer, and the user reported no execution. This is not evidence that M117 itself was executed or that the device displays the message as expected. |

The test-file comments are not printer commands. Presence in a file, an upload
acknowledgement, or an M661 listing alone should not be treated as proof that a
command executed or that its effects are safe.

## Upload-only safety boundary

Current CLI and Orca upload-only paths stop after M29 and an M661 basename
presence check. They do not issue M23 or M24 and do not claim exact remote size
or content verification. The prior M23-containing upload path was followed by
the user's report that `test2.gcode` executed without M24; consequently M23 is
treated as potentially print-starting on this printer. `--start`, `print`, and
`resume` are explicit execution controls, but undocumented firmware behavior
(including the uncertain M601 S1 preamble effect) means software command
separation is not a physical no-start guarantee. Supervise the device and do
not use test G-code without reviewing motion and heating effects.

## Camera, filament sensor, and buzzer notes

### Webcam: HTTP/MJPEG, not G-code

The project uses the camera's HTTP MJPEG stream at port `8080`, default path
`/?action=stream`. `ffadv4manager camera snapshot OUTPUT` reads a bounded stream
and saves its first complete JPEG frame; `camera url` only constructs the URL.
This is separate from TCP port `8899` and sends no G-code. Physical first-frame
snapshots were captured during printer preflight/start/pause, including
`/tmp/opencode/ad4-full-control-preflight-20261018.jpg`,
`/tmp/opencode/ad4-full-control-started-20261018.jpg`, and
`/tmp/opencode/ad4-full-control-paused-20261018.jpg` (recorded in `TEST_LOG.md`).
These are still images from the first complete JPEG frame only; they do not
establish camera motion, continuous streaming/video, or a time-lapse.

Evidence is **community/implementation-level**, not an official AD4 API spec:
[OrcaSlicer issue #6106](https://github.com/OrcaSlicer/OrcaSlicer/issues/6106)
mentions `http://PRINTER_IP:8080/?action=stream` for several FlashForge models
including Adventurer 4, and an [unofficial AD4-series page](https://github.com/Parallel-7/flashforge-api-docs/wiki/Adventurer-4-Series#camera)
describes HTTP/MJPEG. Flashforge's [official camera-install article](https://wiki.flashforge.com/en/adventurer-series/maintenance/install-the-camera)
is for Adventurer 5M, not the AD4 network endpoint. The stream is unauthenticated
plain HTTP; keep it on a trusted LAN. No verified G-code command for a webcam
snapshot was found. M662 is a printer-file preview/thumbnail query, not the live
camera. It returns binary file-preview data (the observed preview was a 14,486-byte
BMP), whereas `camera snapshot` writes a JPEG from the separate HTTP stream.

### Filament/runout sensor

No filament-sensor API or sensor-specific command is implemented in this
project. The observed M119 status reply has generic flags (`S:1 L:0 J:0 F:0`)
but does not label a runout sensor, so this log cannot identify its state.
Generic Marlin [M412](https://marlinfw.org/docs/gcode/M412.html) reports or
configures filament runout handling, but support on this regular AD4/v2.2.4 is
**unverified**. Bare M412 is a generic query; M412 S1/S0 changes configuration
and must not be treated as a read-only probe. No M412 command was sent.

Generic [M600](https://marlinfw.org/docs/gcode/M600.html) filament-change and
[M701/M702](https://marlinfw.org/docs/gcode/M701.html) load/unload operations
can pause a job, move the head, or extrude/retract filament. AD4/v2.2.4 support
was not established; do not test them without a dedicated, explicitly approved
physical plan.

### Buzzer/beeper

Generic Marlin [M300](https://marlinfw.org/docs/gcode/M300.html) requests a
beep/tone, but no AD4/v2.2.4 implementation evidence was found in the project,
retained device replies, or the sources reviewed. M300 is an audible action, not
a read-only command, and was not sent. Do not assume that generic Marlin codes
are accepted by Flashforge's proprietary firmware.
