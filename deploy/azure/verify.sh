#!/usr/bin/env bash
# Quick post-deploy sanity check: hits the health endpoint and tails recent logs.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

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
az webapp log tail --resource-group "$RG" --name "$APP_NAME"
