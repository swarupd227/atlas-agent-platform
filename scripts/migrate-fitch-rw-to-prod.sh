#!/usr/bin/env bash
# SCN-1.1 Fitch RW Demo — Dev → Production Migration
#
# Runs the TypeScript migration script via ts-node.
# Edit the three variables below before running.
#
# Prerequisites:
#   - ts-node installed: npm install -g ts-node  (or use npx)
#   - Node 18+ (native fetch required)
#   - Dev environment running locally on port 5000 (npm run dev)
#   - Production deployment accessible at PROD_URL
#
# Usage:
#   bash scripts/migrate-fitch-rw-to-prod.sh
#
#   To preview what would be migrated without writing anything:
#   bash scripts/migrate-fitch-rw-to-prod.sh --dry-run

set -euo pipefail

# ─── Configuration ────────────────────────────────────────────────────────────
# Replace placeholder values with your actual Production credentials.

PROD_URL="https://YOUR-APP.replit.app"
PROD_ORG_ID="YOUR-PROD-ORG-ID"
PROD_API_KEY="YOUR-PROD-API-KEY"       # Leave empty ("") if no auth required

# Dev API base — defaults to localhost:5000 (change if dev runs elsewhere)
DEV_URL="${DEV_URL:-http://localhost:5000}"
# Optional: Dev org UUID to scope API reads (sent as x-organization-id header)
DEV_ORG_ID="${DEV_ORG_ID:-}"

# ─── Pre-flight checks ────────────────────────────────────────────────────────

if [[ "$PROD_URL" == *"YOUR-APP"* ]]; then
  echo "ERROR: Set PROD_URL to your Production deployment URL before running."
  exit 1
fi
if [[ "$PROD_ORG_ID" == *"YOUR-PROD"* ]]; then
  echo "ERROR: Set PROD_ORG_ID to your Production organization ID before running."
  exit 1
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "  ATLAS SCN-1.1 — Fitch RW Dev → Production Migration"
echo "  Dev:  $DEV_URL"
echo "  Prod: $PROD_URL"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# Pass --dry-run through if provided
DRY_RUN_FLAG=""
for arg in "$@"; do
  if [[ "$arg" == "--dry-run" ]]; then
    DRY_RUN_FLAG="--dry-run"
    echo "  ⚠  DRY-RUN mode — no writes will be made to Production"
    echo ""
  fi
done

# ─── Run the migration ────────────────────────────────────────────────────────

DEV_ORG_ARG=""
if [[ -n "$DEV_ORG_ID" ]]; then
  DEV_ORG_ARG="--dev-org-id $DEV_ORG_ID"
fi

npx ts-node \
  --project tsconfig.json \
  scripts/migrate-fitch-rw-to-prod.ts \
  --prod-url     "$PROD_URL" \
  --prod-org-id  "$PROD_ORG_ID" \
  --prod-api-key "$PROD_API_KEY" \
  --dev-url      "$DEV_URL" \
  $DEV_ORG_ARG \
  $DRY_RUN_FLAG
