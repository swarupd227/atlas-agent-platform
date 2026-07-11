#!/usr/bin/env bash
# Quick post-deploy sanity check: hits the health endpoint and tails recent logs.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

# Cloud Shell sessions restart often and never auto-pull -- do it here so a
# fresh session always has the latest scripts/config before you rely on them.
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Pulling latest from git..."
  git pull --ff-only || { echo "git pull failed -- resolve manually (uncommitted changes / diverged branch?) before continuing." >&2; exit 1; }
fi

if [ ! -f config.env ]; then
  echo "Missing config.env — copy config.env.example to config.env and fill it in first." >&2
  exit 1
fi
# shellcheck disable=SC1091
source config.env

URL="https://${APP_NAME}.azurewebsites.net"
echo "=== ${URL}/api/auth/mode ==="
curl -sf "${URL}/api/auth/mode" && echo "" || {
  echo "Request failed — the app may still be starting up (cold start can take a minute or two)." >&2
}

echo ""
echo "=== Recent logs (Ctrl+C to stop tailing) ==="
# Make sure application logging is actually on before tailing -- without it,
# the stream only shows platform-level container lifecycle events, not
# anything the Node process itself logs.
az webapp log config \
  --resource-group "$RG" --name "$APP_NAME" \
  --application-logging filesystem \
  --level verbose \
  --docker-container-logging filesystem \
  --output none
az webapp log tail --resource-group "$RG" --name "$APP_NAME"
