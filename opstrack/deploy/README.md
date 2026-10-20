# Self-hosting OpsTrack + MeshCentral

`install-server.sh` sets up a complete remote-management server on one Ubuntu machine:

| Component | Address | What it does |
|-----------|---------|--------------|
| **OpsTrack** | `https://ops.yourcompany.com` | Tracker, tickets, Devices & Remote |
| **MeshCentral** | `https://mesh.yourcompany.com` | Remote desktop, terminal and files for your devices |
| **Caddy** | ports 80 / 443 | Free HTTPS certificates (Let's Encrypt), renewed automatically |

Both apps are on HTTPS under the same domain, so remote sessions open **inside** OpsTrack.
OpsTrack's Remote Desktop settings are filled in for you.

## What you need

1. **A server that stays on.** Ubuntu 22.04 or 24.04 with 2 GB RAM or more and a public IP. Any of these work:
   - **Oracle Cloud "Always Free"**. Free, but needs a card for identity verification. Choose an
     *Ampere A1* or *VM.Standard.E2.1.Micro* instance with the Ubuntu image.
   - A small VPS from DigitalOcean, Hetzner, Linode, AWS Lightsail or Azure (about US$5–6 a month).
   - A spare PC or VM in your office with ports 80/443 forwarded from your router.
2. **A domain name** where you can add DNS records, for example `yourcompany.com`.
3. **Two DNS "A" records** pointing to the server's public IP:
   - `ops.yourcompany.com` → server IP
   - `mesh.yourcompany.com` → server IP
4. **Ports 80 and 443 open** in the cloud firewall. On Oracle Cloud, go to
   *Networking → Virtual Cloud Networks → your VCN → Security Lists → Default* and add ingress rules
   for TCP 80 and 443 from `0.0.0.0/0`. The script opens the server's own firewall.

## Install

SSH into the server and run:

```bash
curl -fsSL -o install-server.sh \
  https://raw.githubusercontent.com/kalidasmane/kalidasmane/claude/custom-vapt-tool-3yr9zc/opstrack/deploy/install-server.sh
sudo bash install-server.sh \
  --ops-domain ops.yourcompany.com \
  --mesh-domain mesh.yourcompany.com \
  --email you@yourcompany.com \
  --admin-password 'Choose-A-Strong-Password'
```

It takes about 5 minutes. At the end it prints both addresses and the `admin` login, which works
for both OpsTrack and MeshCentral. If you leave out `--admin-password`, a random password is
generated and printed.

**Already running OpsTrack on Render?** Install MeshCentral only, and allow your Render address to
embed it. Sessions will still open in a new tab, because the two are on different domains:

```bash
sudo bash install-server.sh --no-opstrack \
  --mesh-domain mesh.yourcompany.com --ops-url https://opstrack.onrender.com --email you@yourcompany.com
```

## After installing

1. **MeshCentral** (`https://mesh.yourcompany.com`, user `admin`):
   - Create a **device group**, for example "Acme Corp".
   - Click **Add Agent** and install the agent on every computer your engineers support
     (Windows installer, or the one-line Linux/macOS command). Devices appear within seconds and work
     behind firewalls and NAT, because the agent connects out to your server.
   - Under **My Users**, create an account for each engineer and give them rights on their device groups.
2. **OpsTrack** (`https://ops.yourcompany.com`, user `admin`):
   - Change the admin password (user menu → Change password).
   - **Devices & Remote → Add device**. Paste each device's **node ID**: in MeshCentral, open the device
     and copy the value after `gotonode=` in the address bar.
   - Engineers sign in to MeshCentral once in their browser. After that, **Remote desktop**,
     **Terminal** and **Files** open inside OpsTrack, and ending a session logs the time.

## What the script does

- Installs Node.js 22, git and Caddy from their official package repositories.
- Installs MeshCentral 1.2.5 in `/opt/meshcentral` as the `meshcentral` system user.
  - It listens only on `127.0.0.1:4430`, with HTTPS handled by Caddy (`tlsOffload`).
  - `certUrl` lets agents pin the public certificate.
  - `allowedFramingOrigins` allows only your OpsTrack address to embed it.
  - New-account sign-up and the Intel AMT (MPS) port are disabled.
- Installs OpsTrack in `/opt/opstrack` as the `opstrack` system user.
  - Data is stored in `/var/lib/opstrack`.
  - Settings are in `/etc/opstrack.env` (readable by root only).
- Creates `systemd` services `meshcentral`, `opstrack` and `caddy`. They start on boot and restart if they crash.
- Opens TCP 80/443 in `ufw`, or in the iptables rules that Oracle Cloud images ship with.

## Maintenance

| Task | Command |
|------|---------|
| Live logs | `sudo journalctl -u opstrack -u meshcentral -u caddy -f` |
| Restart | `sudo systemctl restart opstrack meshcentral` |
| Update OpsTrack | run `install-server.sh` again with the same options (keeps data and passwords) |
| Back up | copy `/var/lib/opstrack` and `/opt/meshcentral/meshcentral-data` |
| Load demo data | `cd /opt/opstrack/src/opstrack && sudo -u opstrack env DATA_DIR=/var/lib/opstrack npm run demo` (only into an empty database, before real use) |

If HTTPS isn't working, check that both DNS records point at the server and that ports 80/443 are
open in the cloud firewall. Then run `sudo systemctl restart caddy meshcentral`.
