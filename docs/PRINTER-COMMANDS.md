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
| `M601 S1` | Sent first in the current upload preamble. The device replied `Control Success V2.1.` followed by `ok`. | **Device response (`v2.2.4`)**; **semantics uncertain / potentially risky**. Its firmware-side effect is not authoritatively established. It remains in the upload preamble; do not infer that “Control Success” means it cannot affect execution state. |
| `M115` | Firmware/device information query. The recorded reply identified `Flashforge Adventurer 4`, firmware `v2.2.4`, and machine dimensions, then `ok`. | **Device response (`v2.2.4`)**. |
| `M650` | Sent in the upload preamble. The recorded reply was `X: 1.0 Y: 0.5` and `ok`. | **Device response (`v2.2.4`)**; **semantics uncertain**. The meaning of these values is not established here. |
| `M119` | Status/endstop query. The recorded response included endstop values, `MachineStatus: READY`, `MoveMode: READY`, status flags, LED state, and an empty current file. | **Device response (`v2.2.4`)**. |
| `M114` | Reports current X/Y/Z and extruder position. | **Directly observed.** The device returned X/Y/Z/A/B fields followed by `ok`; this is a position query, not a move. The transient numeric coordinates are kept only in the local test log. Community reference: [M114](https://github.com/Parallel-7/flashforge-api-docs/wiki/TCP-Protocol#m114---current-position). |
| `M28 <size> 0:/user/<name>` | Current upload sender declares the local byte count and destination. M28 readiness is accepted only on a standalone `ok`. | **Implemented; not directly hardware-verified for this exact argument form**. The device did answer M28 during uploads, with a response such as `Writing to file: /data/probe-1.gcode` and `ok`; the exact transmitted arguments are not recorded in the response log, and the firmware-reported `/data` namespace differs from the sender's `0:/user` namespace. |
| Raw file payload | Current sender transmits the file's bytes in chunks between acknowledged M28 and M29, without command framing or added payload markers. | **Implemented**. Uploads were accepted and filenames appeared in M661, but this is not byte-for-byte device-side content verification. |
| `M29` | Ends the upload. A recorded device reply was `Done saving file.` followed by `ok`. Current sender also requires a standalone `ok`. | **Device response (`v2.2.4`)**. The reply does not by itself establish exact stored content. |
| `M661` | Requests the printer's file listing. Recorded replies included `/data/...` entries; the current upload-only path checks for the requested basename across `/data/` and `0:/user/`. | **Device response (`v2.2.4`)**. Listing a name confirms presence in the listing only; it does not establish file size or content integrity. |
| `M662 <file_path>` | Reads a printer-side preview/thumbnail. | **Directly observed.** An existing `.gx` path returned `CMD M662 Received.`, `ok`, and 14,486 bytes beginning with a BMP `BM` header (not PNG). Community reference: [M662](https://github.com/Parallel-7/flashforge-api-docs/wiki/TCP-Protocol#m662---get-local-file-preview). |
| `M23 <path>` | Selects/opens a file in current `print_file()` flow. A recorded response for `test2.gcode` said `File opened: test2.gcode Size: 727`, `File selected`, `ok`. | **Device response (`v2.2.4`)**; **semantics uncertain / potentially print-starting on this unit**. The user confirmed that `test2.gcode` physically executed after an older upload flow sent M23, despite no M24 in the transcript. M23 is the leading trigger candidate, not proven causation. It is deliberately absent from upload-only paths. |
| `M24` | Current CLI's explicit `print`/`upload --start` path sends M24 after file selection; `resume` also sends M24. | **Implemented; not directly hardware-verified in this session**. It is the application's explicit start/resume action and can execute a physical print. |
| `M25` | Current client `pause()` sends M25. | **Implemented; not directly hardware-verified in this session**; may affect an active job. |
| `M26` | Current client `cancel()` sends M26; the implementation describes it as cancel/reset of SD print state. | **Implemented; not directly hardware-verified in this session**; **potentially destructive/risky** for an active job. |
| `M105` | Current status path queries nozzle and bed temperatures. | **Device-backed status query.** The live `status` output parsed nozzle `30/0 °C` and bed `26/0 °C`; the raw M105 line was not retained separately. |
| `M27` | Current status path queries print progress. A diagnostic device reply included `SD printing byte 0/100`, `Layer: 0/0`, and `ok`. | **Device response (`v2.2.4`)**. The diagnostic was not evidence of an active print being started by M27. |

`M663 S<pct>` is **not** a read query: the community reference describes it as a
print-speed setter for newer 5M-series models. It was not sent to this AD4.

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
This is separate from TCP port `8899` and sends no G-code. Unit tests use mocked
HTTP responses; this session did not capture an image from the physical camera.

Evidence is **community/implementation-level**, not an official AD4 API spec:
[OrcaSlicer issue #6106](https://github.com/OrcaSlicer/OrcaSlicer/issues/6106)
mentions `http://PRINTER_IP:8080/?action=stream` for several FlashForge models
including Adventurer 4, and an [unofficial AD4-series page](https://github.com/Parallel-7/flashforge-api-docs/wiki/Adventurer-4-Series#camera)
describes HTTP/MJPEG. Flashforge's [official camera-install article](https://wiki.flashforge.com/en/adventurer-series/maintenance/install-the-camera)
is for Adventurer 5M, not the AD4 network endpoint. The stream is unauthenticated
plain HTTP; keep it on a trusted LAN. No verified G-code command for a webcam
snapshot was found. M662 is a printer-file preview/thumbnail query, not the live
camera.

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
