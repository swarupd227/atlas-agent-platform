#!/usr/bin/env bash
# Copies data from the local Docker Postgres (the "atlas-postgres" container
# used by `npm run dev` / run-dev.ps1) into the deployed Azure Postgres
# Flexible Server.
#
# Run this LOCALLY (Git Bash on your Windows machine), not in Cloud Shell --
# it needs the local Docker container, which only exists on your machine.
#
# Uses pg_dump/pg_restore from *inside* the atlas-postgres container itself
# instead of requiring Postgres client tools on the host, so the dump/
# restore tool version always exactly matches the server (pgvector/pgvector
# :pg16). The container reaches the Azure server directly over the network
# for the restore step, so the Azure Postgres firewall must still allow
# external connections (provision.sh's 0.0.0.0-255.255.255.255 rule -- if
# you've since tightened it, add your current IP instead).
#
# WARNING: --clean --if-exists means this DROPS and recreates every table
# in the Azure database before restoring, i.e. it fully REPLACES whatever
# is currently in the cloud database with what's in your local one. Don't
# run this if there's cloud-only data you want to keep.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

# Keep this in sync with the other deploy/azure scripts, which pull first
# because Cloud Shell sessions restart often and never auto-update.
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
if [ -f .generated-secrets.env ]; then
  # shellcheck disable=SC1090
  source .generated-secrets.env
fi

LOCAL_CONTAINER="${LOCAL_PG_CONTAINER:-atlas-postgres}"
LOCAL_DB_USER="${LOCAL_PG_USER:-atlas}"
LOCAL_DB_NAME="${LOCAL_PG_DB:-atlas}"

if ! docker ps --format '{{.Names}}' | grep -qx "$LOCAL_CONTAINER"; then
  echo "Local Postgres container '$LOCAL_CONTAINER' is not running — start it first (docker start $LOCAL_CONTAINER)." >&2
  exit 1
fi

AZURE_DATABASE_URL="postgresql://${DB_ADMIN}:${DB_PASSWORD}@${DB_SERVER}.postgres.database.azure.com:5432/${DB_NAME}?sslmode=require"

echo "This will REPLACE all data in the Azure database '$DB_NAME' on '$DB_SERVER' with"
echo "what's currently in the local '$LOCAL_DB_NAME' database. This cannot be undone."
read -r -p "Continue? [y/N] " CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 1
fi

echo "Dumping local database '$LOCAL_DB_NAME' from container '$LOCAL_CONTAINER'..."
docker exec "$LOCAL_CONTAINER" pg_dump \
  -U "$LOCAL_DB_USER" -d "$LOCAL_DB_NAME" \
  --no-owner --no-privileges --clean --if-exists -Fc \
  -f /tmp/local-data-sync.dump

echo "Restoring into Azure database '$DB_NAME' on '$DB_SERVER'..."
docker exec "$LOCAL_CONTAINER" pg_restore \
  --no-owner --no-privileges --clean --if-exists \
  -d "$AZURE_DATABASE_URL" \
  /tmp/local-data-sync.dump

docker exec "$LOCAL_CONTAINER" rm -f /tmp/local-data-sync.dump

echo ""
echo "Done. The Azure database now mirrors local. Restart the app so any"
echo "cached data clears: az webapp restart --resource-group $RG --name $APP_NAME"
