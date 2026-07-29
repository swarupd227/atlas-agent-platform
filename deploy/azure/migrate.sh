#!/usr/bin/env bash
# Applies pending schema changes to the deployed Azure Postgres database.
#
# IMPORTANT: this codebase does NOT use `drizzle-kit push` (npm run db:push)
# as its migration mechanism. server/db.ts's runStartupMigrations() runs a
# sequence of idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` / `CREATE
# TABLE IF NOT EXISTS` statements automatically every time the app boots --
# so a normal `./deploy.sh` (which restarts the Web App) already applies any
# schema change that's been added there. There is usually nothing for this
# script to do.
#
# db:push is actively dangerous here: shared/schema.ts has no `embedding`
# column on knowledge_chunks at all (it's created out-of-band by
# server/embeddings.ts's ensurePgVector() specifically so drizzle-kit never
# manages it), so `drizzle-kit push` always proposes DROPPING that column --
# taking real pgvector embeddings with it, irreversibly, on a live database.
# This has already almost happened once. Do not run db:push against this
# database. If you hit "Missing config.env" or "drizzle-kit: command not
# found" errors while trying to, that is not a sign to fix your way through
# to running it -- it's a sign to add your change to runStartupMigrations()
# instead.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Pulling latest from git..."
  git pull --ff-only || { echo "git pull failed -- resolve manually (uncommitted changes / diverged branch?) before continuing." >&2; exit 1; }
fi

if [ ! -f config.env ] || [ ! -f .generated-secrets.env ]; then
  echo "Missing config.env or .generated-secrets.env — run ./provision.sh or ./recover-secrets.sh first." >&2
  exit 1
fi
# shellcheck disable=SC1091
source config.env
# shellcheck disable=SC1091
source .generated-secrets.env

echo "This app applies schema changes automatically on startup (server/db.ts's"
echo "runStartupMigrations()) -- redeploying with ./deploy.sh already migrates"
echo "the database. This script cannot verify pending migrations without direct"
echo "DB access, and does not run drizzle-kit push (see the warning at the top"
echo "of this file for why)."
echo
echo "If you have a genuinely new table/column that isn't in runStartupMigrations()"
echo "yet: add an idempotent 'ALTER TABLE ... ADD COLUMN IF NOT EXISTS' or"
echo "'CREATE TABLE IF NOT EXISTS' statement there (see the existing statements in"
echo "server/db.ts for the pattern), commit it, then run ./deploy.sh -- the restart"
echo "applies it. Do not use drizzle-kit push against this database."
