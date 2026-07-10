#!/usr/bin/env bash
# Pushes the current shared/schema.ts to the deployed Azure Postgres database.
# Run this once after provision.sh, and again after every commit that changes
# shared/schema.ts.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

if [ ! -f config.env ] || [ ! -f .generated-secrets.env ]; then
  echo "Missing config.env or .generated-secrets.env — run ./provision.sh first." >&2
  exit 1
fi
# shellcheck disable=SC1091
source config.env
# shellcheck disable=SC1091
source .generated-secrets.env

export DATABASE_URL="postgresql://${DB_ADMIN}:${DB_PASSWORD}@${DB_SERVER}.postgres.database.azure.com:5432/${DB_NAME}?sslmode=require"

REPO_ROOT="$(cd ../.. && pwd)"
if [ ! -f "$REPO_ROOT/package.json" ]; then
  echo "Expected a full repo clone at $REPO_ROOT (couldn't find package.json there)." >&2
  echo "Run this script from inside a git clone of the repo, e.g.:" >&2
  echo "  git clone https://github.com/swarupd227/atlas-agent-platform.git && cd atlas-agent-platform/deploy/azure" >&2
  exit 1
fi

NODE_VERSION=$(node --version 2>/dev/null || echo "not found")
echo "Node: $NODE_VERSION"
NODE_MAJOR=$(node -e "console.log(process.versions.node.split('.')[0])" 2>/dev/null || echo 0)
if [ "$NODE_MAJOR" -lt 18 ] 2>/dev/null; then
  echo "Warning: Node $NODE_VERSION detected — this repo is built/tested on Node 22." >&2
  echo "If db:push fails below, install a newer Node first, e.g.:" >&2
  echo "  nvm install 22 && nvm use 22   (Cloud Shell ships nvm)" >&2
fi

if [ ! -d "$REPO_ROOT/node_modules" ]; then
  echo "node_modules not found — running npm install first (this can take a minute)..."
  (cd "$REPO_ROOT" && npm install)
fi

echo "Pushing schema from $REPO_ROOT to ${DB_SERVER}.postgres.database.azure.com..."
(cd "$REPO_ROOT" && npm run db:push)
