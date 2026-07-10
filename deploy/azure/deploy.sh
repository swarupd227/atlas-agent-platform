#!/usr/bin/env bash
# Zip-deploys the current repo to the already-provisioned Web App.
#
# The GitHub-linked continuous deployment set up by provision.sh
# (--manual-integration + deployment source sync) has proven unreliable in
# practice -- the SCM container's git fetch from GitHub fails silently and
# near-instantly, leaving wwwroot empty and the container stuck retrying
# `npm start` against a missing package.json until it hits the platform's
# 230s startup timeout. Zip deploy pushes the exact bytes directly over the
# same authenticated Kudu/SCM channel used for log/VFS access (which does
# work), then lets Oryx run its normal npm install + build on extraction --
# same build Oryx would have run from a successful git fetch.
#
# Run this after every commit you want live. Safe to re-run any time.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

if [ ! -f config.env ]; then
  echo "Missing config.env — copy config.env.example to config.env and fill it in first." >&2
  exit 1
fi
# shellcheck disable=SC1091
source config.env

REPO_ROOT="$(cd ../.. && pwd)"
ZIP_PATH=$(mktemp --suffix=.zip)
# mktemp creates the file empty -- `zip` treats an existing file as an
# archive to append to and chokes on it being empty/invalid, so remove the
# placeholder and let `zip` create a fresh archive at the same path.
rm -f "$ZIP_PATH"

echo "Zipping $REPO_ROOT (excluding .git, node_modules, dist, deploy secrets)..."
(
  cd "$REPO_ROOT"
  zip -rq "$ZIP_PATH" . \
    -x '.git/*' \
    -x 'node_modules/*' \
    -x 'dist/*' \
    -x 'deploy/azure/config.env' \
    -x 'deploy/azure/.generated-secrets.env' \
    -x 'deploy/azure/logs/*' \
    -x 'deploy/azure/*.zip' \
    -x '*.zip'
)

echo "Deploying via zip (Oryx runs npm install + npm run build server-side on extraction)..."
az webapp deployment source config-zip \
  --resource-group "$RG" --name "$APP_NAME" \
  --src "$ZIP_PATH" \
  --output none

rm -f "$ZIP_PATH"
echo ""
echo "Done. Run ./verify.sh to confirm the app comes up (the build takes a minute or two)."
