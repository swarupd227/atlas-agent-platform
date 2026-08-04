#!/usr/bin/env bash
# One-shot redeploy: pulls the latest commit on main, builds, zip-deploys to
# the already-provisioned Azure Web App (via deploy.sh), then polls the
# health endpoint until the new build is actually serving traffic.
#
# This is deploy.sh + a non-tailing version of verify.sh's health check
# combined into a single command, for the common "just ship what's on main"
# case. Run from Azure Cloud Shell (or Git Bash/WSL) inside deploy/azure.
#
# Fresh Cloud Shell session with no local state (no config.env yet)?
# Run ./recover-secrets.sh <resource-group> <app-name> first -- see README.md.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

if [ ! -f config.env ]; then
  echo "Missing config.env." >&2
  echo "Fresh Cloud Shell session? Run: ./recover-secrets.sh <resource-group> <app-name>" >&2
  echo "First time ever? Run: ./provision.sh (after copying config.env.example)" >&2
  exit 1
fi
# shellcheck disable=SC1091
source config.env

# deploy.sh does its own `git pull --ff-only` + npm install/build + zip-deploy.
./deploy.sh

echo ""
echo "== Confirming the new build is live =="
URL="https://${APP_NAME}.azurewebsites.net"
# A redeploy restarts the container, and cold start can take a minute or two
# -- poll instead of a single curl that might just catch it mid-restart.
ATTEMPTS=12
for i in $(seq 1 "$ATTEMPTS"); do
  if curl -sf "${URL}/api/auth/mode" > /dev/null 2>&1; then
    echo "App is up at ${URL}"
    curl -sf "${URL}/api/auth/mode"
    echo ""
    echo "Redeploy complete."
    exit 0
  fi
  echo "  ...not responding yet, retrying in 10s (${i}/${ATTEMPTS})"
  sleep 10
done

echo "App did not come back up after 2 minutes." >&2
echo "Check what's happening with: az webapp log tail --resource-group \"$RG\" --name \"$APP_NAME\"" >&2
exit 1
