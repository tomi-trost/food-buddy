#!/usr/bin/env bash
# Prepares a fresh Ubuntu 24.04 host (Oracle A1) for the Food Buddy stack.
# Safe to run again: every step checks what is already done.
#   - Docker Engine + compose plugin
#   - swap file (the model + Postgres + builds can spike past 12 GB)
#   - outgoing bandwidth cap, so even a flood of requests can't push egress past
#     Oracle's free 10 TB/month (25 Mbit/s nonstop ≈ 8 TB)
#   - repo checkout in $DIR and deploy/.env with generated secrets (never overwritten)
# The host firewall is left as Oracle ships it: only SSH is accepted. Public traffic
# arrives through the Cloudflare tunnel, which is an outgoing connection.
#
# Run on the host: curl -fsSL https://raw.githubusercontent.com/tomi-trost/food-buddy/main/deploy/bootstrap.sh | bash
# or copy it over:  scp deploy/bootstrap.sh ubuntu@<ip>: && ssh ubuntu@<ip> ./bootstrap.sh
set -euo pipefail

REPO=${REPO:-https://github.com/tomi-trost/food-buddy.git}
BRANCH=${BRANCH:-main}
DIR=${DIR:-/opt/food-buddy}
SWAP_GB=${SWAP_GB:-4}
EGRESS_RATE=${EGRESS_RATE:-25mbit}

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*"; }
export DEBIAN_FRONTEND=noninteractive

log "Packages"
sudo apt-get update -q
sudo apt-get upgrade -yq
sudo apt-get install -yq ca-certificates curl git

if ! command -v docker >/dev/null; then
  log "Docker"
  sudo install -m 0755 -d /etc/apt/keyrings
  sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" |
    sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update -q
  sudo apt-get install -yq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
sudo usermod -aG docker "$USER"
# Rotate container logs so they can't fill the disk
if [ ! -f /etc/docker/daemon.json ]; then
  echo '{"log-driver":"local","log-opts":{"max-size":"20m","max-file":"3"}}' | sudo tee /etc/docker/daemon.json >/dev/null
  sudo systemctl restart docker
fi

if [ ! -f /swapfile ]; then
  log "Swap ${SWAP_GB} GB"
  sudo fallocate -l "${SWAP_GB}G" /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
  echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/90-swappiness.conf >/dev/null
  sudo sysctl -q -p /etc/sysctl.d/90-swappiness.conf
fi

IFACE=$(ip route show default | awk '{print $5; exit}')
log "Egress cap ${EGRESS_RATE} on ${IFACE}"
sudo tee /etc/systemd/system/egress-cap.service >/dev/null <<EOF
[Unit]
Description=Cap outgoing bandwidth at ${EGRESS_RATE} (keeps egress under Oracle's free 10 TB/month)
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/sbin/tc qdisc replace dev ${IFACE} root tbf rate ${EGRESS_RATE} burst 256kb latency 400ms
ExecStop=-/usr/sbin/tc qdisc del dev ${IFACE} root

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable egress-cap.service >/dev/null 2>&1
sudo systemctl restart egress-cap.service

log "Checkout ${REPO} → ${DIR}"
if [ ! -d "$DIR/.git" ]; then
  sudo install -d -o "$USER" -g "$USER" "$DIR"
  git clone --branch "$BRANCH" "$REPO" "$DIR"
else
  git -C "$DIR" pull --ff-only
fi

ENV="$DIR/deploy/.env"
if [ ! -f "$ENV" ]; then
  log "Creating deploy/.env with generated secrets"
  secret() { openssl rand -base64 48 | tr -d '/+=\n' | cut -c1-"$1"; }
  sed -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(secret 32)|" \
    -e "s|^JWT_SECRET=.*|JWT_SECRET=$(secret 64)|" \
    "$DIR/deploy/.env.example" >"$ENV"
  chmod 600 "$ENV"
fi

log "Nightly backups (restic → Backblaze B2)"
sudo apt-get install -yq restic
sudo install -d -m 700 /etc/food-buddy
sudo install -m 644 "$DIR"/deploy/systemd/food-buddy-backup.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now food-buddy-backup.timer >/dev/null 2>&1
[ -f /etc/food-buddy/backup.env ] ||
  log "Backups stay off until /etc/food-buddy/backup.env exists (template: deploy/backup.env.example)"

log "Done. Next: put CLOUDFLARE_TUNNEL_TOKEN in $ENV, then (after logging in again for the docker group):"
log "  cd $DIR/deploy && docker compose build && docker compose --profile ai --profile tunnel up -d"
