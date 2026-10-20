#!/usr/bin/env bash
# OpsTrack + MeshCentral one-shot installer for a fresh Ubuntu 22.04 / 24.04 server.
#
# Installs:
#   - MeshCentral (remote desktop / terminal / files)      -> https://<mesh-domain>
#   - OpsTrack (this app, optional)                         -> https://<ops-domain>
#   - Caddy as the HTTPS reverse proxy (free Let's Encrypt certificates, auto-renewed)
# and connects OpsTrack's Remote Desktop settings to MeshCentral.
#
# Usage (as root):
#   bash install-server.sh --ops-domain ops.example.com --mesh-domain mesh.example.com --email you@example.com
# Options:
#   --admin-password PASS   password for the OpsTrack "admin" and MeshCentral "admin" accounts
#                           (a random one is generated and printed if omitted)
#   --no-opstrack           install MeshCentral only (OpsTrack runs elsewhere, e.g. Render)
#   --ops-url URL           with --no-opstrack: the OpsTrack address allowed to embed MeshCentral
#   --repo URL --branch B   where to fetch OpsTrack from (defaults to this project's GitHub repo)
set -euo pipefail

OPS_DOMAIN=""; MESH_DOMAIN=""; EMAIL=""; ADMIN_PASSWORD=""; WITH_OPSTRACK=1; OPS_URL=""
REPO="https://github.com/kalidasmane/kalidasmane.git"; BRANCH="claude/custom-vapt-tool-3yr9zc"
MESHCENTRAL_VERSION="1.2.5"

die() { echo "ERROR: $*" >&2; exit 1; }
step() { echo; echo "==> $*"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --ops-domain) OPS_DOMAIN="$2"; shift 2 ;;
    --mesh-domain) MESH_DOMAIN="$2"; shift 2 ;;
    --email) EMAIL="$2"; shift 2 ;;
    --admin-password) ADMIN_PASSWORD="$2"; shift 2 ;;
    --no-opstrack) WITH_OPSTRACK=0; shift ;;
    --ops-url) OPS_URL="$2"; shift 2 ;;
    --repo) REPO="$2"; shift 2 ;;
    --branch) BRANCH="$2"; shift 2 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) die "Unknown option: $1 (see --help)" ;;
  esac
done

[ "$(id -u)" -eq 0 ] || die "Run as root, e.g. sudo bash $0 ..."
[ -n "$MESH_DOMAIN" ] || die "--mesh-domain is required"
[ -n "$EMAIL" ] || die "--email is required (used for Let's Encrypt certificate notices)"
if [ "$WITH_OPSTRACK" -eq 1 ]; then
  [ -n "$OPS_DOMAIN" ] || die "--ops-domain is required (or use --no-opstrack --ops-url https://...)"
  OPS_URL="https://$OPS_DOMAIN"
else
  [ -n "$OPS_URL" ] || die "--ops-url is required with --no-opstrack"
fi
case "$OPS_URL" in http://*|https://*) ;; *) die "--ops-url must start with https://" ;; esac
grep -qi ubuntu /etc/os-release || echo "WARNING: this script is tested on Ubuntu; continuing anyway."
GENERATED_PASSWORD=0
FIRST_INSTALL=1
[ -f /opt/meshcentral/.admin-created ] && FIRST_INSTALL=0
if [ -z "$ADMIN_PASSWORD" ]; then
  ADMIN_PASSWORD="$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 16 || true)"
  GENERATED_PASSWORD=1
fi
case "$ADMIN_PASSWORD" in *'"'*|*'\'*|*' '*) die "--admin-password must not contain quotes, backslashes or spaces" ;; esac
[ "${#ADMIN_PASSWORD}" -ge 8 ] || die "--admin-password must be at least 8 characters"

step "Checking DNS"
PUBLIC_IP="$(curl -fsS4 --max-time 10 https://api.ipify.org || true)"
for d in "$MESH_DOMAIN" ${OPS_DOMAIN:+"$OPS_DOMAIN"}; do
  ip="$(getent ahostsv4 "$d" | awk 'NR==1{print $1}' || true)"
  if [ -z "$ip" ]; then
    echo "WARNING: $d does not resolve yet. Create an A record pointing to ${PUBLIC_IP:-this server} - HTTPS will start working once it does."
  elif [ -n "$PUBLIC_IP" ] && [ "$ip" != "$PUBLIC_IP" ]; then
    echo "WARNING: $d points to $ip but this server's public IP is $PUBLIC_IP."
  else
    echo "$d -> $ip OK"
  fi
done

step "Installing packages (Node.js 22, Caddy, git)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl ca-certificates gnupg git debian-keyring debian-archive-keyring apt-transport-https
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

step "Opening ports 80 and 443"
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp; ufw allow 443/tcp
fi
# Oracle Cloud Ubuntu images ship iptables rules that reject everything except SSH.
if iptables -S INPUT 2>/dev/null | grep -q -- '-j REJECT'; then
  for port in 80 443; do
    iptables -C INPUT -p tcp --dport "$port" -m state --state NEW -j ACCEPT 2>/dev/null \
      || iptables -I INPUT 1 -p tcp --dport "$port" -m state --state NEW -j ACCEPT
  done
  if command -v netfilter-persistent >/dev/null; then netfilter-persistent save; fi
fi
echo "Also allow TCP 80 and 443 in your cloud provider's firewall / security list."

step "Installing MeshCentral $MESHCENTRAL_VERSION"
id meshcentral >/dev/null 2>&1 || useradd --system --create-home --home-dir /opt/meshcentral --shell /usr/sbin/nologin meshcentral
mkdir -p /opt/meshcentral/meshcentral-data
cd /opt/meshcentral
[ -f package.json ] || echo '{ "name": "meshcentral-server", "private": true }' > package.json
npm install --no-audit --no-fund "meshcentral@$MESHCENTRAL_VERSION"
cat > /opt/meshcentral/meshcentral-data/config.json <<EOF
{
  "settings": {
    "cert": "$MESH_DOMAIN",
    "port": 4430,
    "portBind": "127.0.0.1",
    "aliasPort": 443,
    "redirPort": 0,
    "mpsPort": 0,
    "tlsOffload": "127.0.0.1",
    "WANonly": true,
    "selfUpdate": false,
    "allowedFramingOrigins": "$OPS_URL"
  },
  "domains": {
    "": {
      "title": "OpsTrack Remote",
      "newAccounts": false,
      "certUrl": "https://$MESH_DOMAIN:443/"
    }
  }
}
EOF
chown -R meshcentral:meshcentral /opt/meshcentral
NODE_BIN="$(command -v node)"
if [ ! -f /opt/meshcentral/.admin-created ]; then
  # Creating accounts only works while MeshCentral is stopped.
  systemctl stop meshcentral 2>/dev/null || true
  sudo -u meshcentral "$NODE_BIN" node_modules/meshcentral --createaccount admin --pass "$ADMIN_PASSWORD" --email "$EMAIL"
  sudo -u meshcentral "$NODE_BIN" node_modules/meshcentral --adminaccount admin
  touch /opt/meshcentral/.admin-created
fi
cat > /etc/systemd/system/meshcentral.service <<EOF
[Unit]
Description=MeshCentral remote management server
After=network.target

[Service]
Type=simple
User=meshcentral
WorkingDirectory=/opt/meshcentral
ExecStart=$NODE_BIN node_modules/meshcentral
Restart=always
RestartSec=10
# MeshCentral installs optional modules into its own folder on first start.
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

if [ "$WITH_OPSTRACK" -eq 1 ]; then
  step "Installing OpsTrack"
  id opstrack >/dev/null 2>&1 || useradd --system --create-home --home-dir /opt/opstrack --shell /usr/sbin/nologin opstrack
  if [ -d /opt/opstrack/src/.git ]; then
    sudo -u opstrack git -C /opt/opstrack/src fetch --depth 1 origin "$BRANCH"
    sudo -u opstrack git -C /opt/opstrack/src checkout -q FETCH_HEAD
  else
    sudo -u opstrack git clone --depth 1 --branch "$BRANCH" "$REPO" /opt/opstrack/src
  fi
  cd /opt/opstrack/src/opstrack
  sudo -u opstrack npm ci --omit=dev --no-audit --no-fund
  mkdir -p /var/lib/opstrack && chown opstrack:opstrack /var/lib/opstrack
  umask 077
  cat > /etc/opstrack.env <<EOF
PORT=3000
HOST=127.0.0.1
DATA_DIR=/var/lib/opstrack
TRUST_PROXY=1
ADMIN_PASSWORD=$ADMIN_PASSWORD
EOF
  umask 022
  cat > /etc/systemd/system/opstrack.service <<EOF
[Unit]
Description=OpsTrack
After=network.target

[Service]
Type=simple
User=opstrack
WorkingDirectory=/opt/opstrack/src/opstrack
EnvironmentFile=/etc/opstrack.env
ExecStart=$NODE_BIN server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
fi

step "Configuring HTTPS (Caddy)"
{
  echo "{"
  echo "  email $EMAIL"
  echo "}"
  echo
  echo "$MESH_DOMAIN {"
  echo "  reverse_proxy 127.0.0.1:4430"
  echo "}"
  if [ "$WITH_OPSTRACK" -eq 1 ]; then
    echo
    echo "$OPS_DOMAIN {"
    echo "  reverse_proxy 127.0.0.1:3000"
    echo "}"
  fi
} > /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

step "Starting services"
systemctl daemon-reload
systemctl restart caddy
# MeshCentral reads the public certificate from Caddy (certUrl) when it starts, so wait for HTTPS first.
echo "Waiting for the HTTPS certificate for $MESH_DOMAIN (up to 3 minutes)..."
CERT_OK=0
for _ in $(seq 1 36); do
  if curl -s -o /dev/null --max-time 5 "https://$MESH_DOMAIN/"; then CERT_OK=1; break; fi
  sleep 5
done
[ "$CERT_OK" -eq 1 ] || echo "WARNING: HTTPS for $MESH_DOMAIN is not ready yet (DNS or firewall?). When it is, run: systemctl restart meshcentral"
systemctl enable meshcentral
systemctl restart meshcentral
if [ "$WITH_OPSTRACK" -eq 1 ]; then
  systemctl enable --now opstrack
  # Point OpsTrack's Remote Desktop settings at MeshCentral.
  for _ in $(seq 1 30); do curl -fsS http://127.0.0.1:3000/api/health >/dev/null 2>&1 && break; sleep 1; done
  JAR="$(mktemp)"
  if curl -fsS -c "$JAR" -H 'Content-Type: application/json' \
       -d "{\"username\":\"admin\",\"password\":\"$ADMIN_PASSWORD\"}" http://127.0.0.1:3000/api/auth/login >/dev/null; then
    curl -fsS -b "$JAR" -X PUT -H 'Content-Type: application/json' \
      -d "{\"remote\":{\"provider\":\"meshcentral\",\"serverUrl\":\"https://$MESH_DOMAIN\",\"embed\":true}}" \
      http://127.0.0.1:3000/api/settings >/dev/null && echo "OpsTrack Remote Desktop settings now point to https://$MESH_DOMAIN"
  else
    echo "NOTE: could not sign in to OpsTrack to set Remote Desktop (admin password was changed earlier?). Set it in Settings → Remote Desktop."
  fi
  rm -f "$JAR"
fi

cat <<EOF

============================================================
 Done.

 MeshCentral : https://$MESH_DOMAIN
   user      : admin
EOF
if [ "$WITH_OPSTRACK" -eq 1 ]; then
  cat <<EOF
 OpsTrack    : https://$OPS_DOMAIN
   user      : admin
EOF
fi
if [ "$FIRST_INSTALL" -eq 0 ]; then PASS_NOTE="unchanged (set during the first install)"
elif [ "$GENERATED_PASSWORD" -eq 1 ]; then PASS_NOTE="$ADMIN_PASSWORD  (generated – save it now)"
else PASS_NOTE="the one you passed with --admin-password"; fi
cat <<EOF
 Password    : $PASS_NOTE

 Next steps:
  1. Open MeshCentral, create a device group, click "Add Agent" and install the agent
     on each computer engineers will support.
  2. Create a MeshCentral account for each engineer (My Users) with rights on their groups.
  3. In OpsTrack → Devices & Remote, add each device with its MeshCentral node ID
     (MeshCentral → open the device → the value after "gotonode=" in the address bar).
 Certificates are issued automatically once DNS points at this server (allow a minute).
 Logs: journalctl -u meshcentral -u opstrack -u caddy -f
============================================================
EOF
