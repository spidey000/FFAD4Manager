from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import sys
import time
import webbrowser

from ffadv4manager.core import (
    CameraError,
    FlashForgeClient,
    build_stream_url,
    capture_first_frame,
    discover_printers,
)
from ffadv4manager import config as config_store

DEFAULT_PORT = 8899
DEFAULT_TIMEOUT = 8.0
DEFAULT_CAMERA_PORT = 8080
DEFAULT_CAMERA_PATH = "/?action=stream"

_HELP_TOPICS = {
    "status": "status\n  Read printer state, current file, temperatures, and progress. Prints a human-readable status summary.",
    "files": "files\n  List printer-side files. Output is one file per line.",
    "files-raw": "files-raw\n  Print the unparsed response to the printer's file-list request.",
    "watch": "watch [--interval SECONDS]\n  Refresh status continuously (default interval: 5 seconds). Press Ctrl+C to stop; exits 130.",
    "discover": "discover [--timeout SECONDS] [--json]\n  Search for printers with UDP multicast/broadcast discovery. Does not require a configured host or connect to printer TCP. Prints a name/IP/port table, or a JSON array with --json; no JSON results is []. On an interactive terminal, human-readable output offers to save a discovered host when exactly one printer advertises command port 8899; with multiple such printers, choose one first. This uses the port advertised in UDP discovery, not a TCP port scan. JSON and non-interactive runs never prompt or save config.",
    "camera": "camera {url,open,snapshot}\n  Build or use the printer's live MJPEG stream URL. Uses the configured printer host or root --host, and does not open a printer TCP connection. Camera defaults: HTTP port 8080 and path /?action=stream. The HTTP endpoint has no authentication; use only on a trusted network. See `ffadv4manager help camera url`, `ffadv4manager help camera open`, or `ffadv4manager help camera snapshot`.",
    "camera url": "camera url [--camera-port PORT] [--camera-path PATH]\n  Print only the camera stream URL, suitable for piping. Uses the configured printer host or root --host. Defaults are port 8080 and path /?action=stream; paths are kept literally, including query strings. No network request is made.",
    "camera open": "camera open [--camera-port PORT] [--camera-path PATH]\n  Ask Python's stdlib webbrowser module to open the MJPEG URL. This depends on a usable desktop browser; headless systems may not open a browser, in which case the URL is printed with guidance. The stream is plain HTTP and has no authentication.",
    "camera snapshot": "camera snapshot OUTPUT [--camera-port PORT] [--camera-path PATH]\n  Download and save the first complete JPEG frame, bounded by the helper's response-size limit. On success prints only the saved path. Requires the camera HTTP endpoint to be reachable; no printer TCP connection is used.",
    "upload": "upload LOCAL_FILE [--remote-name NAME] [--start] [--force] [--log-file PATH]\n  Upload a local G-code/GX file and confirm its name appears in M661. Without --start, upload does not select or print the file; M661 does not verify size or content. --start explicitly selects and starts it after the listing check. --log-file appends timestamped printer response records as JSONL. Upload is refused when status reports an active print unless --force is supplied.",
    "print": "print REMOTE_NAME [--force]\n  Select a file already on the printer and start it. Use the printer-side name, with or without /data/. This starts a physical print. It is refused while status reports printing unless --force is supplied.",
    "pause": "pause\n  Pause the current print.",
    "resume": "resume\n  Resume the current print.",
    "cancel": "cancel\n  Cancel/reset the current SD print state. This is destructive to the active job.",
    "config": "config show | path | set | unset\n  Manage connection and camera defaults locally; these actions do not contact a printer. See `ffadv4manager help config show`, `ffadv4manager help config path`, `ffadv4manager help config set`, or `ffadv4manager help config unset`.",
    "config show": "config show\n  Print stored connection and camera values, or explain that no config is stored. Does not contact a printer.",
    "config path": "config path\n  Print the active config file location. Does not contact a printer.",
    "config set": "config set [--host HOST] [--port PORT] [--timeout SECONDS] [--camera-port PORT] [--camera-path PATH]\n  Store one or more connection/camera defaults. Camera defaults are port 8080 and path /?action=stream. At least one option is required. This writes the local config file and does not contact a printer.",
    "config unset": "config unset {host,port,timeout,camera_port,camera_path} [...]\n  Remove one or more stored connection or camera values. This writes the local config file and does not contact a printer.",
}


def _print_help(topic: str | None = None) -> int:
    if topic:
        text = _HELP_TOPICS.get(topic)
        if text is None:
            print(f"Unknown help topic: {topic}. Run 'ffadv4manager help' for available topics.", file=sys.stderr)
            return 2
        print(text)
        return 0

    print(f"""ffadv4manager — Linux/Python command-line client for FlashForge Adventurer printers
  The legacy `ad4ctl` command is also available as an alias.

USAGE
  ffadv4manager [CONNECTION OPTIONS] COMMAND [ARGS]
  ffadv4manager help [COMMAND [SUBCOMMAND]]

SUPPORTED COMMANDS
  status       Read machine state, temperatures, current file, and progress.
  watch        Repeatedly display status; Ctrl+C stops the loop.
  files        List printer-side files; one filename per output line.
  files-raw    Show the unparsed file-list response.
  upload       Upload a local file; optionally start it with --start.
  print        Select and start a printer-side file.
  pause        Pause the active print.
  resume       Resume the active print.
  cancel       Cancel/reset the active SD print state.
  discover     Find printers by UDP multicast/broadcast; no host required.
  camera       Build a stream URL, open the stream, or save a snapshot.
  config       Show, locate, set, or unset local connection/camera defaults.

CONNECTION AND CONFIGURATION
  Options: --host HOST, --port PORT, --timeout SECONDS. Defaults are port {DEFAULT_PORT}
  and timeout {DEFAULT_TIMEOUT:g} seconds. Values resolve separately in this order:
  command-line option > config file > built-in default. Host is required for
  printer commands; help, config, discovery, and camera URL commands need no
  printer-command connection (camera needs a host to construct its HTTP URL).

  Config is an INI file with a [connection] section and host, port, timeout,
  camera_port, and camera_path keys. Default path: ~/.config/ffadv4manager/config.ini;
  XDG_CONFIG_HOME changes
  the base directory to $XDG_CONFIG_HOME/ffadv4manager/config.ini. FFADV4MANAGER_CONFIG
  overrides the file path and takes precedence over legacy AD4CONNECT_CONFIG.
  If neither override is set and the new default file is absent, an existing
  ~/.config/ad4connect/config.ini is read; writes go to the new path and leave
  the legacy file untouched. These environment variables are read directly;
  ffadv4manager does not load .env files. No credentials are stored or used.

NETWORK / PROTOCOL
  Printer commands connect over TCP (default port 8899) using the legacy
  FlashForge protocol, sending ~GCODE followed by CRLF. This is not an encrypted
  or authenticated channel. The implementation is confirmed against Adventurer 4
  firmware v2.3.3-3.33; compatible firmware/models may behave differently.
  The printer must be reachable on the network. Help and config commands do not
  instantiate a network client or connect to a printer.

DISCOVERY AND CAMERA
  discover sends UDP discovery requests to multicast/broadcast targets and
  listens for the requested timeout. It does not require printer config.
  camera uses HTTP MJPEG (default http://HOST:8080/?action=stream), separate from
  the printer's command TCP protocol. No HTTP authentication is used. The camera
  endpoint must be reachable on a trusted network. camera open depends on the
  system browser and may not work headlessly; camera url supports piping and
  camera snapshot saves the first complete bounded JPEG without a browser.

SAFETY
  status/files/watch are observational; upload writes a file to printer storage.
  print, upload --start, resume, pause, and cancel affect a physical job/state.
  Review the target printer and file before starting a print. Upload/print check
  reported printing status and refuse by default; --force bypasses that check,
  not a general safety mechanism. cancel can discard/cancel the active job.

OUTPUT AND EXIT STATUS
  Successful commands return 0. Runtime/configuration errors return 1; Ctrl+C
  during watch returns 130. Discovery/camera errors and missing camera host return
  1. A busy-printer safety refusal or config set without
  values returns 2. Argument errors/help topics not recognized by argparse return
  2. Output is plain text; upload prints progress and the resulting remote path.

EXAMPLES
  ffadv4manager help upload
  ffadv4manager discover --json
  ffadv4manager camera url
  ffadv4manager camera snapshot /tmp/ad4.jpg
  ffadv4manager config set --host 192.168.1.50
  ffadv4manager status
  ffadv4manager --host 192.168.1.60 --timeout 12 files
  ffadv4manager upload ~/Downloads/part.gcode --remote-name part.gcode
  ffadv4manager upload ~/Downloads/part.gcode --start
  ffadv4manager print part.gcode
  ffadv4manager config show

Run `ffadv4manager help COMMAND` for command-specific details. `ffadv4manager COMMAND --help`
also displays that command's argument syntax.""")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="ffadv4manager")
    # Defaults are None so we can tell an explicit flag apart from "fall back to
    # the stored config". Resolution happens after parsing in _resolve_connection.
    parser.add_argument("--host", help="Printer IP address or hostname (or store it with 'ffadv4manager config set')")
    parser.add_argument("--port", type=int, help=f"Printer TCP port, default {DEFAULT_PORT}")
    parser.add_argument("--timeout", type=float, help=f"Socket timeout in seconds, default {DEFAULT_TIMEOUT}")

    sub = parser.add_subparsers(dest="command", required=True)
    help_cmd = sub.add_parser("help", help="Show the CLI guide or help for a command")
    help_cmd.add_argument("topic", nargs="*")
    sub.add_parser("status")
    sub.add_parser("files")
    sub.add_parser("files-raw")

    discover = sub.add_parser("discover", help="Discover printers using UDP")
    discover.add_argument("--timeout", type=float, default=3.0)
    discover.add_argument("--json", action="store_true", help="Output a JSON array")

    camera_cmd = sub.add_parser("camera", help="Get or open the camera stream")
    camera_sub = camera_cmd.add_subparsers(dest="camera_action", required=True)
    camera_url = camera_sub.add_parser("url", help="Print only the camera stream URL")
    camera_open = camera_sub.add_parser("open", help="Open the camera stream in a browser")
    camera_snapshot = camera_sub.add_parser("snapshot", help="Save the first complete JPEG frame")
    camera_snapshot.add_argument("output")
    for camera_parser in (camera_url, camera_open, camera_snapshot):
        camera_parser.add_argument("--camera-port", type=_camera_port_arg)
        camera_parser.add_argument("--camera-path")

    watch = sub.add_parser("watch")
    watch.add_argument("--interval", type=float, default=5.0)

    upload = sub.add_parser("upload")
    upload.add_argument("file")
    upload.add_argument("--remote-name")
    upload.add_argument("--start", action="store_true")
    upload.add_argument("--force", action="store_true", help="Allow upload while printer reports printing")
    upload.add_argument("--log-file", help="Append timestamped printer responses to this JSONL file")

    print_cmd = sub.add_parser("print")
    print_cmd.add_argument("remote_name")
    print_cmd.add_argument("--force", action="store_true", help="Allow print command while printer reports printing")

    sub.add_parser("pause")
    sub.add_parser("resume")
    sub.add_parser("cancel")

    config_cmd = sub.add_parser("config", help="View or edit stored connection defaults")
    config_sub = config_cmd.add_subparsers(dest="config_action", required=True)
    config_sub.add_parser("show", help="Print the stored config")
    config_sub.add_parser("path", help="Print the config file location")
    set_cmd = config_sub.add_parser("set", help="Store one or more connection defaults")
    set_cmd.add_argument("--host", help="Printer IP address or hostname")
    set_cmd.add_argument("--port", type=int)
    set_cmd.add_argument("--timeout", type=float)
    set_cmd.add_argument("--camera-port", type=_camera_port_arg)
    set_cmd.add_argument("--camera-path")
    unset_cmd = config_sub.add_parser("unset", help="Remove stored keys")
    unset_cmd.add_argument("keys", nargs="+", choices=config_store.KEYS)

    args = parser.parse_args(argv)

    if args.command == "help":
        if len(args.topic) > 2:
            parser.error("help accepts a command and optional subcommand")
        return _print_help(" ".join(args.topic) or None)

    if args.command == "config":
        return _handle_config(args)

    if args.command == "discover":
        try:
            printers = discover_printers(timeout=args.timeout)
            if args.json:
                print(json.dumps([{"name": p.name, "ip": p.host, "port": p.port} for p in printers]))
            elif not printers:
                print("No printers discovered.")
            else:
                print(f"{'NAME':<32} {'IP':<39} PORT")
                for printer in printers:
                    print(f"{printer.name:<32} {printer.host:<39} {printer.port}")
            if not args.json:
                _offer_discovered_host(printers)
            return 0
        except Exception as exc:  # noqa: BLE001 - CLI should show clear errors
            print(f"Error: {exc}", file=sys.stderr)
            return 1

    if args.command == "camera":
        try:
            return _handle_camera(args)
        except Exception as exc:  # noqa: BLE001 - CLI should show clear errors
            print(f"Error: {exc}", file=sys.stderr)
            return 1

    host, port, timeout = _resolve_connection(args, parser)
    client = FlashForgeClient(host, port, timeout=timeout)

    try:
        if args.command == "status":
            _print_status(client.status())
        elif args.command == "watch":
            _watch(client, args.interval)
        elif args.command == "files":
            for file in client.files():
                print(file)
        elif args.command == "files-raw":
            print(client.files_raw())
        elif args.command == "upload":
            status = client.status()
            if status.is_printing and not args.force:
                print(
                    "Printer appears to be printing. Use --force to upload anyway.",
                    file=sys.stderr,
                )
                return 2
            response_callback = _response_logger(args.log_file) if args.log_file else _print_response
            remote = client.upload_and_confirm_listed(
                args.file, args.remote_name, progress=_progress,
                response_callback=response_callback,
            )
            print(f"\nUploaded and listed: {remote}")
            if args.start:
                print(client.print_file(remote, response_callback=response_callback))
        elif args.command == "print":
            status = client.status()
            if status.is_printing and not args.force:
                print(
                    "Printer appears to be printing. Use --force to start another job anyway.",
                    file=sys.stderr,
                )
                return 2
            print(client.print_file(args.remote_name))
        elif args.command == "pause":
            print(client.pause())
        elif args.command == "resume":
            print(client.resume())
        elif args.command == "cancel":
            print(client.cancel())
    except KeyboardInterrupt:
        return 130
    except Exception as exc:  # noqa: BLE001 - CLI should show clear errors
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    return 0


def _offer_discovered_host(printers) -> None:
    """Offer to store a discovered host, but only in an interactive terminal."""
    if not (sys.stdin.isatty() and sys.stdout.isatty()):
        return

    candidates = [printer for printer in printers if printer.port == DEFAULT_PORT]
    if not candidates:
        if printers:
            print("Ninguna impresora anuncia el puerto de comandos 8899; configuración sin cambios.")
        return

    if len(candidates) == 1:
        candidate = candidates[0]
        print(
            f"Puerto de comandos anunciado por descubrimiento: {candidate.port} "
            f"({candidate.name}, {candidate.host}); no se realizó un escaneo TCP."
        )
    else:
        print(
            f"Varias impresoras anuncian el puerto de comandos 8899 "
            "(puerto indicado por UDP, sin escaneo TCP):"
        )
        for number, printer in enumerate(candidates, start=1):
            print(f"  {number}) {printer.name} — {printer.host}:{printer.port}")
        try:
            selection = input("Elige una para configurar su host (número; Enter cancela): ").strip()
        except (EOFError, KeyboardInterrupt):
            selection = ""
        if not selection:
            print("Selección cancelada; configuración sin cambios.")
            return
        try:
            index = int(selection) - 1
        except ValueError:
            print("Selección no válida; configuración sin cambios.")
            return
        if not 0 <= index < len(candidates):
            print("Selección fuera de rango; configuración sin cambios.")
            return
        candidate = candidates[index]

    try:
        answer = input(
            f"¿Guardar {candidate.host} como host predeterminado de ffadv4manager? [s/N] "
        ).strip().casefold()
    except (EOFError, KeyboardInterrupt):
        answer = ""
    if answer not in {"s", "si", "sí"}:
        print("No se guardó el host; configuración sin cambios.")
        return

    config_store.save_config({"host": candidate.host, "port": candidate.port})
    print(f"Host predeterminado guardado: {candidate.host}")


def _resolve_connection(args, parser) -> tuple[str, int, float]:
    """Combine CLI flags with the stored config: flag > config file > default."""
    stored = config_store.load_config()
    host = args.host or stored.get("host")
    if not host:
        parser.error(
            "no host given: pass --host <ip> or store one with "
            "'ffadv4manager config set --host <ip>'"
        )
    port = args.port if args.port is not None else int(stored.get("port", DEFAULT_PORT))
    timeout = (
        args.timeout if args.timeout is not None else float(stored.get("timeout", DEFAULT_TIMEOUT))
    )
    return host, port, timeout


def _handle_config(args) -> int:
    path = config_store.config_path()

    if args.config_action == "path":
        print(path)
        return 0

    if args.config_action == "show":
        stored = config_store.load_config()
        if not stored:
            print(f"No config stored yet ({path}).")
            print("Set one with: ffadv4manager config set --host <ip>")
            return 0
        print(f"# {path}")
        for key in config_store.KEYS:
            if key in stored:
                print(f"{key} = {stored[key]}")
        return 0

    if args.config_action == "set":
        updates = {key: getattr(args, key) for key in config_store.KEYS if getattr(args, key) is not None}
        if not updates:
            print("Nothing to set. Pass a connection or camera option.", file=sys.stderr)
            return 2
        if "camera_port" in updates:
            try:
                _validate_camera_port(updates["camera_port"])
            except ValueError as exc:
                print(f"Invalid camera port: {exc}", file=sys.stderr)
                return 2
        saved = config_store.save_config(updates)
        print(f"Saved to {saved}")
        for key, value in updates.items():
            print(f"{key} = {value}")
        return 0

    if args.config_action == "unset":
        removed = config_store.unset_config(args.keys)
        if removed:
            print(f"Removed: {', '.join(removed)}")
        else:
            print("Nothing removed (keys were not set).")
        return 0

    return 0


def _camera_port_arg(value: str) -> int:
    try:
        port = int(value)
        _validate_camera_port(port)
        return port
    except ValueError as exc:
        raise argparse.ArgumentTypeError(str(exc)) from exc


def _validate_camera_port(port: int) -> None:
    if isinstance(port, bool) or not isinstance(port, int) or not 1 <= port <= 65535:
        raise ValueError("camera port must be an integer from 1 to 65535")


def _handle_camera(args) -> int:
    stored = config_store.load_config()
    host = args.host or stored.get("host")
    if not host:
        raise CameraError("no printer host given: pass --host <ip> or store one with 'ffadv4manager config set --host <ip>'")

    raw_port = args.camera_port
    if raw_port is None:
        raw_port = stored.get("camera_port", DEFAULT_CAMERA_PORT)
    try:
        camera_port = int(raw_port)
    except (TypeError, ValueError) as exc:
        raise CameraError(f"invalid configured camera port {raw_port!r}; set camera_port from 1 to 65535") from exc
    try:
        _validate_camera_port(camera_port)
    except ValueError as exc:
        raise CameraError(f"invalid camera port: {exc}") from exc

    camera_path = args.camera_path
    if camera_path is None:
        camera_path = stored.get("camera_path", DEFAULT_CAMERA_PATH)
    url = build_stream_url(host, camera_port, camera_path)

    if args.camera_action == "url":
        print(url)
        return 0
    if args.camera_action == "open":
        if webbrowser.open(url):
            print(f"Opened camera stream in your browser: {url}")
            return 0
        print(
            "Could not open a browser (this may be a headless system). "
            f"Open this camera URL manually: {url}",
            file=sys.stderr,
        )
        return 1
    if args.camera_action == "snapshot":
        saved = capture_first_frame(url, args.output)
        print(saved)
        return 0
    return 0


def _print_status(status) -> None:
    print("FFADV4Manager status")
    print(f"Machine: {status.machine_status or '-'}")
    print(f"Move:    {status.move_mode or '-'}")
    print(f"File:    {status.current_file or '-'}")
    if status.nozzle_current is not None:
        print(f"Nozzle:  {status.nozzle_current}/{status.nozzle_target} °C")
    if status.bed_current is not None:
        print(f"Bed:     {status.bed_current}/{status.bed_target} °C")
    if status.sd_current is not None:
        pct = status.progress_percent
        pct_text = f" ({pct:.1f}%)" if pct is not None else ""
        print(f"Bytes:   {status.sd_current}/{status.sd_total}{pct_text}")
    if status.layer_current is not None:
        print(f"Layer:   {status.layer_current}/{status.layer_total}")


def _watch(client: FlashForgeClient, interval: float) -> None:
    while True:
        print("\033[2J\033[H", end="")
        _print_status(client.status())
        print("\nCtrl+C to stop watching.")
        time.sleep(interval)


def _progress(done: int, total: int) -> None:
    width = 30
    ratio = done / total if total else 0
    filled = int(width * ratio)
    bar = "#" * filled + "-" * (width - filled)
    print(f"\rUploading [{bar}] {ratio * 100:5.1f}%", end="", flush=True)


def _print_response(command: str, response: str) -> None:
    print(f"Printer {command} reply: {response.rstrip()}", file=sys.stderr)


def _response_logger(path: str):
    def log_response(command: str, response: str) -> None:
        record = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "command": command,
            "response": response,
        }
        with open(path, "a", encoding="utf-8") as log_file:
            log_file.write(json.dumps(record, ensure_ascii=False) + "\n")
        _print_response(command, response)

    return log_response


if __name__ == "__main__":
    raise SystemExit(main())
