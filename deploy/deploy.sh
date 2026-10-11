#!/usr/bin/env bash
# Updates the running stack to the latest main. Run by CI after the tests pass, through a
# deploy-only SSH key pinned to this script in ~/.ssh/authorized_keys (pulling first means
# the newest version of this script is the one that runs):
#   command="cd /opt/food-buddy && git pull -q --ff-only && exec deploy/deploy.sh",restrict ssh-ed25519 AAAA... food-buddy-deploy
# Also fine to run by hand on the host. Images are built here (native arm64, no QEMU);
# compose only recreates containers whose image or config changed. The api runs the
# migrations on start.
set -euo pipefail

DIR=${DIR:-/opt/food-buddy}
BRANCH=${BRANCH:-main}

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*"; }

# One deploy at a time: a second push waits for the first to finish
exec 9>/tmp/food-buddy-deploy.lock
flock 9

cd "$DIR"
git fetch -q origin "$BRANCH"
git merge -q --ff-only "origin/$BRANCH"
log "Deploying $(git log --oneline -1)"

cd deploy
docker compose build api caddy
docker compose --profile ai --profile tunnel up -d --remove-orphans
docker image prune -f >/dev/null # old layers would slowly fill the boot volume

for _ in $(seq 1 30); do
  if docker compose exec -T api python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')" 2>/dev/null; then
    log "Healthy"
    exit 0
  fi
  sleep 2
done
log "API not healthy after deploy"
docker compose logs --tail 50 api
exit 1
