#!/usr/bin/env bash
# Builds the app locally (wherever this script runs -- Cloud Shell, WSL, Git
# Bash) and zip-deploys the already-built artifact to the Web App.
#
# We build locally instead of relying on Azure's server-side Oryx build.
# Oryx's build kept failing on `npm run build` with
# "Cannot find package '@vitejs/plugin-react'" (a devDependency) even after
# setting NPM_CONFIG_PRODUCTION=false (the documented fix for Oryx skipping
# devDependencies) -- the installed package count didn't change at all with
# that setting, so something about Oryx's build container/npm resolution
# specifically was the problem, not our devDependencies list or app
# settings. The exact same `npm install` + `npm run build` already runs
# clean locally (this is the same install migrate.sh uses), so build here
# and ship the result instead of continuing to debug Oryx's environment.
# provision.sh sets SCM_DO_BUILD_DURING_DEPLOYMENT=false so Azure just runs
# `npm start` against exactly what's in this zip, no server-side build step.
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
cd "$REPO_ROOT"

echo "Installing dependencies (npm install)..."
npm install

echo "Building (npm run build)..."
npm run build

# server/index.ts is bundled into dist/index.cjs with most dependencies
# inlined (see script/build.ts's allowlist) -- what's left as "external" and
# actually needed at runtime is a real production dependency, never a
# devDependency (nothing at runtime imports vite/tsx/esbuild/etc). Safe to
# prune devDependencies out of node_modules before zipping to keep the
# upload small; the next run's `npm install` above restores them for the
# build step.
echo "Pruning devDependencies for a smaller deploy artifact..."
npm prune --omit=dev

ZIP_PATH=$(mktemp --suffix=.zip)
# mktemp creates the file empty -- `zip` treats an existing file as an
# archive to append to and chokes on it being empty/invalid, so remove the
# placeholder and let `zip` create a fresh archive at the same path.
rm -f "$ZIP_PATH"

echo "Zipping build artifact (package.json, package-lock.json, dist/, node_modules/)..."
zip -rq "$ZIP_PATH" package.json package-lock.json dist node_modules

echo "Deploying via zip (SCM_DO_BUILD_DURING_DEPLOYMENT=false -- Azure just runs npm start against this)..."
az webapp deployment source config-zip \
  --resource-group "$RG" --name "$APP_NAME" \
  --src "$ZIP_PATH" \
  --output none

rm -f "$ZIP_PATH"
echo ""
echo "Done. Run ./verify.sh (from deploy/azure) to confirm the app comes up."
