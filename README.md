# FFADV4Manager

**Self-hosted FlashForge Adventurer 4 toolkit:** a Python CLI for printer control plus a responsive, locally hosted 3D slicer UI. Use Cloudflare Tunnel and Access to reach the web UI from anywhere without exposing the printer to the Internet.

## Install with an AI agent

Copy this **single-line prompt** into an AI agent with terminal access to your Linux server:

~~~text
Install and configure https://github.com/spidey000/FFAD4Manager for my FlashForge Adventurer 4 on a Linux host that can reach the printer on its local network: read this README and the actual source first; install Python 3.9+, Node.js 20+, Git and required dependencies; clone the repository, create an isolated Python virtual environment, run pip install -e ., then npm ci and npm run build in web/; configure the printer LAN IP (TCP 8899) and camera (HTTP 8080), verify ffadv4manager status and a camera snapshot, and run the loopback-only web bridge at 127.0.0.1:8765 as a persistent systemd service; for remote use, configure Cloudflare Tunnel to this loopback origin, protect the public hostname with a Cloudflare Access application restricted to my approved email, and run the bridge with --require-access and valid CF_ACCESS_TEAM_DOMAIN, CF_ACCESS_AUD, CF_ACCESS_EMAIL and CF_ACCESS_PUBLIC_ORIGIN environment variables; ask for missing printer IP, hostname, Access configuration or approval instead of guessing; never open printer ports or port 8765 to the Internet, never commit credentials or secrets, and verify both authorized access and unauthenticated rejection; preserve existing safety restrictions (browser upload/start is currently disabled, while CLI upload/print works), test before declaring success, avoid unrelated changes and do not create unnecessary documentation.
~~~

> The prompt is **instructions for an agent**, not a shell command. An agent needs terminal access and your participation for Cloudflare authentication and Access policy setup. It must not invent domain names, printer IPs, email addresses, or credentials.

## What works

The CLI and the web UI are not interchangeable. The current web bridge deliberately exposes only a narrow set of operations.

| Capability | CLI | Web UI |
| --- | :---: | :---: |
| Read printer status, temperatures, progress | Yes | No |
| List printer files and fetch GX/BMP preview | Yes | No |
| Upload G-code or GX | Yes | **Disabled** |
| Start / pause / resume / cancel printing | Yes | **Not available** |
| Convert G-code to GX with embedded preview | Yes | Via the CLI during upload only; browser upload disabled |
| Slice 3D models and preview layers | No | Yes |
| Camera snapshot | Yes | Yes |
| Camera live MJPEG URL | Yes | No live feed in UI |
| Interval-based timelapse capture | Yes | No timelapse manager in UI |
| Discover printers over LAN | Yes | No |
| Printer information, axes and diagnostics | Yes | No |
| Part-cooling fan on/off | Yes | No |
| Monitoring, state-change logs, wait conditions | Yes | No |
| Desktop notifications via Linux notify-send | Yes | No |
| Named local printer connection profiles | Yes | No |

**Important:** browser upload and print-start are intentionally disabled in the currently bundled Three Slicer UI because its upstream slicer does not expose a reliable model/paint revision signal. The server implements an authenticated upload API, but the UI cannot safely confirm that a sliced file still matches the current model. Do not remove this safeguard merely to make a button clickable. Use the CLI for uploads and printing until that provenance check is resolved.

This is **alpha software** tested primarily against one Adventurer 4 reporting firmware v2.2.4. Some printer responses and physical effects are only partially verified. See [CLI reference](docs/CLI.md) and [printer protocol evidence](docs/PRINTER-COMMANDS.md).

## How remote access works

~~~text
Your browser (anywhere)
         |
   HTTPS + Cloudflare Access
         |
     Cloudflare Tunnel
         |
 Linux host on the printer's LAN
   127.0.0.1:8765  (FFADV4Manager web bridge)
         |
      FlashForge Adventurer 4
   TCP 8899 (commands) / HTTP 8080 (camera)
~~~

Run the Python service and the Cloudflare Tunnel connector on the **same Linux host**, or provide equivalent private routing. The bridge listens on 127.0.0.1 only; the printer's raw services are not publicly accessible. Cloudflare Access controls admission, and the bridge independently validates the Access JWT for requests arriving on the public hostname.

**Do not forward TCP 8899, HTTP 8080, or 8765 through your router. Do not publish the bridge without Access.** GitHub Pages alone cannot run the Python bridge or reach your local printer.

## Requirements

- Linux machine (Ubuntu 24.04 is a suitable example) that remains powered on and can reach the printer over the LAN/VPN.
- FlashForge Adventurer 4 with a known local IP. Default command port: **8899**; default MJPEG camera port: **8080**.
- Python **3.9+**, with venv and pip; Git.
- Node.js **20+** and npm to build the web UI (use an actively supported Node LTS).
- For Internet access: a Cloudflare account, a hostname on a domain managed in Cloudflare, a Cloudflare Tunnel, and an Access application/policy.

## Install on Linux

Install the basic system packages (and install a current [Node.js LTS](https://nodejs.org/en/download) separately if it is not already present):

~~~bash
sudo apt update
sudo apt install -y git python3 python3-venv python3-pip
node --version
npm --version
~~~

Clone the project and install the CLI in a virtual environment:

~~~bash
git clone https://github.com/spidey000/FFAD4Manager.git
cd FFAD4Manager
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -e .
~~~

Build the included web UI:

~~~bash
cd web
npm ci
npm run build
cd ..
~~~

Configure and test your own printer IP:

~~~bash
ffadv4manager config set --host 192.168.1.50 --port 8899
ffadv4manager status
ffadv4manager files
ffadv4manager camera snapshot /tmp/ad4-camera.jpg
~~~

Replace **192.168.1.50** with your printer's LAN address. If you do not know the IP, run **ffadv4manager discover** from the printer's LAN; UDP discovery may not cross subnets or VPNs.

Local configuration is stored at ~/.config/ffadv4manager/config.ini (or the configured XDG path), **not in the repository**. Run **ffadv4manager help** and **ffadv4manager config show** to inspect available commands and settings.

## Launch the local web UI

From the repository root, with the Python environment active:

~~~bash
ffadv4manager slicer
~~~

On the Linux host, open **http://127.0.0.1:8765**. This is for local testing only. The current UI supports browser-based slicing, layer preview, settings and a camera snapshot. It is **not yet a complete printer-management dashboard**, and its send/print buttons are locked as explained above.

Stop the foreground server with Ctrl+C. To use the UI from outside your LAN, configure Access and the tunnel below.

## Secure remote installation: Cloudflare Tunnel + Access

1. In **Cloudflare Zero Trust**, create a Tunnel whose connector runs on the **same host** as FFADV4Manager. Install and start cloudflared using [Cloudflare's official Tunnel setup guide](https://developers.cloudflare.com/tunnel/get-started/) and the Linux connector commands shown in your dashboard. Keep the tunnel token outside the repository.
2. Add a **public hostname**, for example **printer.example.com**, pointing to service **http://127.0.0.1:8765**. Do not point the tunnel directly at the printer.
3. Create a [**Cloudflare Access self-hosted application**](https://developers.cloudflare.com/learning-paths/clientless-access/access-application/create-access-app/) for **https://printer.example.com** and an Allow policy limited to your own approved email address. Find the application's **AUD tag** in its settings and your Access team domain (e.g. **myteam.cloudflareaccess.com**).
4. Supply the four bridge settings below, with your own values. The public origin must be the exact HTTPS origin, **without a trailing slash**:

~~~bash
export CF_ACCESS_TEAM_DOMAIN='myteam.cloudflareaccess.com'
export CF_ACCESS_AUD='YOUR_ACCESS_APPLICATION_AUD_TAG'
export CF_ACCESS_EMAIL='you@example.com'
export CF_ACCESS_PUBLIC_ORIGIN='https://printer.example.com'
ffadv4manager slicer --require-access
~~~

The bridge requires all four settings and verifies the signed Access assertion, issuer, audience and permitted email for public-origin requests. If you intentionally use a Cloudflare service token for machine access, the optional **CF_ACCESS_SERVICE_TOKEN_ID** is supported; do not configure it unless needed. Access is not configured automatically by the Python application.

For an unattended Linux service, keep settings in a **root-owned file outside the checkout** (for example /etc/ffadv4manager/access.env, mode 0600). A minimal systemd unit is:

~~~ini
[Unit]
Description=FFADV4Manager web bridge
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=YOUR_LINUX_USER
WorkingDirectory=/home/YOUR_LINUX_USER/FFAD4Manager
EnvironmentFile=/etc/ffadv4manager/access.env
ExecStart=/home/YOUR_LINUX_USER/FFAD4Manager/.venv/bin/ffadv4manager slicer --require-access
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
~~~

Save as **/etc/systemd/system/ffadv4manager.service**, replacing the Linux username and paths. Put the four settings in **/etc/ffadv4manager/access.env** as plain **KEY=value** lines (no **export**). Then run:

~~~bash
sudo chmod 600 /etc/ffadv4manager/access.env
sudo systemctl daemon-reload
sudo systemctl enable --now ffadv4manager
sudo systemctl status ffadv4manager
~~~

Manage **cloudflared** as its own service using Cloudflare's supported installation process; do not run a second public-facing web server or reverse proxy unless your network requires one.

**Verification:** locally, visit http://127.0.0.1:8765 from the server; remotely, open the HTTPS hostname in a private browser window, confirm Cloudflare Access blocks unauthenticated access, sign in with the allowed identity, then test slicing and the camera snapshot. Check logs with **sudo journalctl -u ffadv4manager -n 100 --no-pager**. A successful web login is not proof that printer or camera communication works: verify CLI status separately.

## Everyday CLI commands

These commands run on the Linux host that can contact the printer.

~~~bash
ffadv4manager status
ffadv4manager status --json
ffadv4manager files
ffadv4manager files preview example.gx --output /tmp/example.bmp
ffadv4manager watch --interval 5
ffadv4manager doctor
ffadv4manager camera url
ffadv4manager camera snapshot /tmp/snapshot.jpg
ffadv4manager camera timelapse ./captures --interval 10 --count 60
ffadv4manager fan on
ffadv4manager fan off
~~~

To convert and upload a G-code file (leaving the original untouched):

~~~bash
ffadv4manager convert model.gcode --output model.gx
ffadv4manager upload model.gcode
~~~

To **explicitly start a physical print**, after checking machine state and model suitability:

~~~bash
ffadv4manager upload model.gcode --start
# Or start an already stored printer-side file:
ffadv4manager print model.gx
~~~

To control an ongoing job:

~~~bash
ffadv4manager pause
ffadv4manager resume
ffadv4manager cancel
~~~

G-code uploads are automatically wrapped as GX where appropriate, with a printer-compatible embedded BMP thumbnail and recognized metadata when present. Conversion does **not** repair incompatible toolpaths. A listed upload (M661) confirms the filename appears, **not** the stored file's byte-for-byte integrity. On some firmware, the upload protocol has had uncertain side effects; supervise first-time use and any remote printing.

Additional commands include **discover**, **info**, **position**, **inspect**, **wait**, **monitor**, **notify**, **profiles**, **printer rename** and **config**. See [full CLI usage](docs/CLI.md). An optional [OrcaSlicer Linux post-processing hook](scripts/orca_ad4_upload.py) is also included.

## Troubleshooting

| Problem | Check |
| --- | --- |
| Status fails | Host IP, power, same LAN/private route, TCP 8899, stored config |
| Camera snapshot fails | Camera availability and HTTP 8080, camera URL/path; the printer camera may need enabling |
| Web page unavailable locally | Run npm build; ensure web/dist/index.html exists; check that port 8765 is free |
| Web page unavailable remotely | cloudflared connector, hostname route, Access policy, matching team domain/AUD/origin/email, systemd logs |
| Remote request returns 401/403 | Complete Access login; check identity and the bridge JWT configuration |
| Web upload or print button unavailable | **Expected with the current upstream slicer revision-safety restriction**; use the CLI |
| Timelapse or live video missing in web UI | Not implemented there yet; use CLI timelapse / camera URL on a trusted network |

## Security and limitations

The printer protocol on TCP 8899 and camera HTTP stream have **no built-in authentication or encryption**. Restrict them to your trusted LAN; use Cloudflare Tunnel + Access only for the loopback web bridge. Do not check in Cloudflare tokens, local access settings, private configuration files, logs, credentials or printer-identifying data. The bridge has deliberately narrow endpoints, a randomly generated per-process browser token, request-size limits and JWT checks, but is not a general-purpose Internet-facing printer-control API.

Always supervise remote print start, motion, fan and cancellation operations. Firmware behavior varies, even when a command reports an ACK. This software is provided as-is.

## License and credits

FFADV4Manager is licensed under **GPL-3.0-or-later**; see [LICENSE](LICENSE). The bundled GX converter adapts [HellEvro/FF_Gcode_to_GX](https://github.com/HellEvro/FF_Gcode_to_GX) (GPL-3.0-or-later), itself informed in part by [urself25/Orca_Gcode_to_Gx](https://github.com/urself25/Orca_Gcode_to_Gx). The optional Three Slicer frontend uses the [three-slicer](https://www.npmjs.com/package/three-slicer) package (AGPL-3.0-or-later); review its redistribution obligations.
