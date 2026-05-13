#!/usr/bin/env bash
# =============================================================================
# migrate_solifi_dealer_to_prod.sh
# Copies the Solifi Dealer Experience Hub demo (SCN-SOLIFI-DEH-1)
# from dev → production via API only — no direct DB writes.
#
# Usage:
#   PROD_URL=https://your-prod-domain.replit.app bash scripts/migrate_solifi_dealer_to_prod.sh
#
# What it does:
#   1. Calls POST /demo-api/solifi-dealer/ensure-agents on PROD_URL
#      (idempotent bootstrap endpoint — safe to run multiple times)
#   2. Verifies the response and prints agent/MCP IDs for the audit trail
# =============================================================================

set -euo pipefail

PROD_URL="${PROD_URL:-}"
if [ -z "$PROD_URL" ]; then
  echo "✗ PROD_URL is required."
  echo "  Usage: PROD_URL=https://your-prod-domain.replit.app bash scripts/migrate_solifi_dealer_to_prod.sh"
  exit 1
fi

echo ""
echo "================================================================"
echo " Solifi Dealer Experience Hub — Dev → Prod Migration"
echo " Target: ${PROD_URL}"
echo "================================================================"
echo ""

# ── Health check ──────────────────────────────────────────────────────────────
echo "▸ Checking production server health…"
if ! curl -sf "${PROD_URL}/api/health" > /dev/null 2>&1; then
  echo "✗ Production server is not responding. Check PROD_URL and deployment status."
  exit 1
fi
echo "✓ Production server is healthy."
echo ""

# ── Bootstrap via ensure-agents ───────────────────────────────────────────────
echo "▸ Calling ensure-agents bootstrap on production…"
RESULT=$(curl -sf -X POST "${PROD_URL}/demo-api/solifi-dealer/ensure-agents" \
  -H "Content-Type: application/json" \
  -d '{}' 2>/dev/null || echo "{}")

SUCCESS=$(echo "$RESULT" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('success', False))" 2>/dev/null || echo "False")

if [ "$SUCCESS" != "True" ]; then
  echo "✗ ensure-agents call failed."
  echo "  Response: $RESULT"
  exit 1
fi

echo "✓ ensure-agents succeeded."
echo ""

# ── Print summary ─────────────────────────────────────────────────────────────
echo "$RESULT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print('  Agent ID      :', d.get('agentId', 'unknown'))
print('  Deployment ID :', d.get('deploymentId', 'unknown'))
print('  MCP Server ID :', d.get('mcpServerId', 'unknown'))
print('  Message       :', d.get('message', ''))
" 2>/dev/null || echo "  (could not parse summary)"

echo ""
echo "================================================================"
echo " ✓ Solifi DEH demo is live on production!"
echo ""
echo "   Demo URL : ${PROD_URL}/demo/solifi-dealer"
echo "================================================================"
echo ""
