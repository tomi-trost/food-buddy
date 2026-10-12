#!/usr/bin/env bash
# Nightly encrypted backup of the database and meal photos to Backblaze B2 with restic.
# Runs as root from food-buddy-backup.timer (installed by bootstrap.sh).
#   backup.sh                 dump Postgres, back up dump + photos, prune old snapshots
#   backup.sh restore-test    restore the latest snapshot to a temp dir and verify it
#
# Stays inside B2's free tier (10 GB stored, downloads up to 3× storage, API calls free):
#   - restic deduplicates, so a night adds only new photos (~200 KB each)
#   - keeps 7 daily, 4 weekly, 6 monthly snapshots; older data is pruned
#   - refuses to upload once the repository reaches MAX_REPO_GB (default 8)
#   - the weekly check reads metadata only; restore-test downloads one copy (≈1× storage)
# The bucket itself must be private, with lifecycle "Keep only the last version" (else
# pruned data stays stored as hidden versions) and Caps & Alerts set to $0.
#
# Credentials live in /etc/food-buddy/backup.env (root, 600); see backup.env.example.
set -Eeuo pipefail

BACKUP_ENV=${BACKUP_ENV:-/etc/food-buddy/backup.env}
COMPOSE_DIR=${COMPOSE_DIR:-/opt/food-buddy/deploy}
STAGE=${STAGE:-/var/backups/food-buddy}
PHOTOS_VOLUME=${PHOTOS_VOLUME:-food-buddy_photos}
CHECK_WEEKDAY=${CHECK_WEEKDAY:-7} # 1 = Monday … 7 = Sunday

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*"; }
fail() {
  log "FAILED: $*"
  ping_health /fail
  exit 1
}
# Optional dead-man switch (e.g. a free healthchecks.io check): alerts when a night is missed
ping_health() { [ -z "${HEALTHCHECK_URL:-}" ] || curl -fsS -m 10 --retry 3 -o /dev/null "${HEALTHCHECK_URL}$1" || true; }

[ -r "$BACKUP_ENV" ] || fail "missing $BACKUP_ENV"
set -a
# shellcheck source=/dev/null
. "$BACKUP_ENV"
set +a
for var in RESTIC_REPOSITORY RESTIC_PASSWORD AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY; do
  [ -n "${!var:-}" ] || fail "$var is not set in $BACKUP_ENV"
done
MAX_REPO_GB=${MAX_REPO_GB:-8}
trap 'fail "line $LINENO: $BASH_COMMAND"' ERR

exec 9>/tmp/food-buddy-backup.lock
flock -n 9 || fail "another backup is running"

compose() { (cd "$COMPOSE_DIR" && docker compose "$@"); }

repo_bytes() {
  restic stats --mode raw-data --json | sed -n 's/.*"total_size":\([0-9]*\).*/\1/p'
}

backup() {
  ping_health /start
  if ! restic cat config >/dev/null 2>&1; then
    log "Initializing repository"
    restic init
  fi

  local size limit
  size=$(repo_bytes)
  limit=$((MAX_REPO_GB * 1024 * 1024 * 1024))
  if [ "${size:-0}" -ge "$limit" ]; then
    fail "repository is $((size / 1024 / 1024)) MB, over the ${MAX_REPO_GB} GB cap (B2 free tier is 10 GB); nothing uploaded"
  fi

  log "Dumping database"
  install -d -m 700 "$STAGE"
  compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' >"$STAGE/food.dump.tmp"
  [ -s "$STAGE/food.dump.tmp" ] || fail "database dump is empty"
  mv "$STAGE/food.dump.tmp" "$STAGE/food.dump"

  local photos
  photos=$(docker volume inspect -f '{{.Mountpoint}}' "$PHOTOS_VOLUME")
  log "Backing up $STAGE/food.dump and $photos"
  restic backup --tag nightly --host food-buddy "$STAGE/food.dump" "$photos"
  restic forget --tag nightly --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune

  if [ "$(date +%u)" = "$CHECK_WEEKDAY" ]; then
    log "Weekly repository check"
    restic check
  fi
  log "Done, repository is $(($(repo_bytes) / 1024 / 1024)) MB"
  ping_health ""
}

restore_test() {
  target=$(mktemp -d) # global: the EXIT trap runs after this function returns
  trap 'rm -rf "$target"' EXIT
  log "Restoring latest snapshot to $target"
  restic restore latest --tag nightly --target "$target"

  local dump
  dump=$(find "$target" -name food.dump -type f | head -1)
  [ -n "$dump" ] || fail "no food.dump in the snapshot"
  compose exec -T db pg_restore --list <"$dump" >/dev/null || fail "food.dump is not a readable dump"
  log "OK: dump is readable, $(find "$target" -name '*.jpg' -type f | wc -l | tr -d ' ') photos restored"
}

case "${1:-backup}" in
  backup) backup ;;
  restore-test) restore_test ;;
  *)
    echo "usage: $0 [backup|restore-test]" >&2
    exit 2
    ;;
esac
