#!/usr/bin/env bash
# Keeps trying to create the Always Free A1 VM until Oracle has capacity.
# Each round tries every availability domain, first at the full free size
# (2 OCPU / 12 GB), then at 1 OCPU / 6 GB. Stops once the VM exists.
#
# Needs: OCI CLI with a working ~/.oci/config (`brew install oci-cli`, then `oci setup bootstrap`).
# Run:   caffeinate -i deploy/oracle-create-vm.sh
# Every setting below can be overridden with an environment variable.
set -uo pipefail

NAME=${NAME:-food-buddy}
VCN_NAME=${VCN_NAME:-prod-vcn}
SUBNET_NAME=${SUBNET_NAME:-public subnet-prod-vcn}
SSH_KEY=${SSH_KEY:-$HOME/.ssh/oracle_food-buddy.pub}
SIZES=${SIZES:-"2:12 1:6"} # OCPU:GB, tried in this order
BOOT_GB=${BOOT_GB:-100}
INTERVAL=${INTERVAL:-900} # seconds between rounds
SHAPE=VM.Standard.A1.Flex
export PYTHONWARNINGS=ignore # the Homebrew CLI prints a harmless SyntaxWarning on every call

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*"; }
die() { log "ERROR: $*"; exit 1; }
notify() { osascript -e "display notification \"$1\" with title \"Oracle VM\"" 2>/dev/null || true; }

command -v oci >/dev/null || die "OCI CLI not found (brew install oci-cli)"
[ -f "$SSH_KEY" ] || die "SSH public key not found: $SSH_KEY"

COMPARTMENT_ID=${COMPARTMENT_ID:-$(sed -n 's/^tenancy *= *//p' "$HOME/.oci/config" 2>/dev/null | head -1)}
[ -n "$COMPARTMENT_ID" ] || die "no tenancy in ~/.oci/config; set COMPARTMENT_ID"

ADS=$(oci iam availability-domain list --compartment-id "$COMPARTMENT_ID" \
  --query "join(' ', data[].name)" --raw-output) || die "could not list availability domains (is the CLI set up?)"

IMAGE_ID=${IMAGE_ID:-$(oci compute image list --compartment-id "$COMPARTMENT_ID" \
  --operating-system "Canonical Ubuntu" --operating-system-version "24.04" --shape "$SHAPE" \
  --sort-by TIMECREATED --sort-order DESC --all \
  --query "data[?contains(\"display-name\", 'aarch64') && !contains(\"display-name\", 'Minimal')] | [0].id" --raw-output)}
[ -n "$IMAGE_ID" ] && [ "$IMAGE_ID" != null ] || die "no Ubuntu 24.04 aarch64 image found; set IMAGE_ID"

VCN_ID=$(oci network vcn list --compartment-id "$COMPARTMENT_ID" --display-name "$VCN_NAME" \
  --query 'data[0].id' --raw-output)
[ -n "$VCN_ID" ] && [ "$VCN_ID" != null ] || die "VCN '$VCN_NAME' not found"
SUBNET_ID=${SUBNET_ID:-$(oci network subnet list --compartment-id "$COMPARTMENT_ID" --vcn-id "$VCN_ID" \
  --display-name "$SUBNET_NAME" --query 'data[0].id' --raw-output)}
[ -n "$SUBNET_ID" ] && [ "$SUBNET_ID" != null ] || die "subnet '$SUBNET_NAME' not found"

# Prints how many non-terminated instances carry $NAME. The CLI prints nothing when there are none.
existing() {
  local n
  n=$(oci compute instance list --compartment-id "$COMPARTMENT_ID" --display-name "$NAME" \
    --query "length(data[?\"lifecycle-state\" != 'TERMINATED'])" --raw-output) || return 1
  echo "${n:-0}"
}

finish() {
  local id=$1 ip
  ip=$(oci compute instance list-vnics --instance-id "$id" --query 'data[0]."public-ip"' --raw-output)
  log "VM is running. Public IP: $ip"
  log "Connect: ssh -i ${SSH_KEY%.pub} ubuntu@$ip"
  notify "food-buddy VM created: $ip"
  exit 0
}

# Returns 0 on success, 1 when Oracle is out of capacity or rate limiting; exits on any other error.
launch() {
  local ad=$1 ocpus=$2 gb=$3 out id
  out=$(oci compute instance launch \
    --compartment-id "$COMPARTMENT_ID" --availability-domain "$ad" \
    --display-name "$NAME" --shape "$SHAPE" \
    --shape-config "{\"ocpus\": $ocpus, \"memoryInGBs\": $gb}" \
    --image-id "$IMAGE_ID" --boot-volume-size-in-gbs "$BOOT_GB" \
    --subnet-id "$SUBNET_ID" --assign-public-ip true \
    --ssh-authorized-keys-file "$SSH_KEY" \
    --is-pv-encryption-in-transit-enabled true \
    --instance-options '{"areLegacyImdsEndpointsDisabled": true}' \
    --availability-config '{"recoveryAction": "RESTORE_INSTANCE"}' \
    --wait-for-state RUNNING --query 'data.id' --raw-output 2>&1)
  if [ $? -eq 0 ]; then
    id=$(printf '%s\n' "$out" | grep -o 'ocid1\.instance\.[^"[:space:]]*' | tail -1)
    log "Created $NAME in $ad with $ocpus OCPU / $gb GB"
    finish "$id"
  fi
  if printf '%s' "$out" | grep -qiE 'out of (host )?capacity|TooManyRequests|LimitExceeded'; then
    log "  $ad, $ocpus OCPU / $gb GB: no capacity"
    return 1
  fi
  # Network drops (e.g. the Mac slept mid-request) and Oracle-side hiccups: retry later.
  if printf '%s' "$out" | grep -qiE 'ConnectionError|Timeout|timed out|Max retries exceeded|Name or service not known|nodename nor servname|"status": 5[0-9][0-9]'; then
    log "  $ad, $ocpus OCPU / $gb GB: temporary error, will retry"
    return 1
  fi
  log "Unexpected error from Oracle, stopping:"
  printf '%s\n' "$out"
  exit 1
}

log "Image $IMAGE_ID"
log "Subnet $SUBNET_ID"
log "ADs: $ADS · sizes: $SIZES · every ${INTERVAL}s"

round=0
while true; do
  round=$((round + 1))
  if ! count=$(existing); then
    log "Could not check for an existing instance; retrying in $((INTERVAL / 60)) min."
    sleep "$INTERVAL"
    continue
  fi
  [ "$count" = 0 ] || die "an instance named '$NAME' already exists; not creating another"
  log "Round $round"
  for size in $SIZES; do
    for ad in $ADS; do
      launch "$ad" "${size%%:*}" "${size##*:}"
      sleep 5
    done
  done
  wait_s=$((INTERVAL + RANDOM % 120))
  log "No capacity anywhere. Next round in $((wait_s / 60)) min."
  sleep "$wait_s"
done
