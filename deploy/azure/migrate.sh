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
echo "Pushing schema from $REPO_ROOT to ${DB_SERVER}.postgres.database.azure.com..."
(cd "$REPO_ROOT" && npm run db:push)
