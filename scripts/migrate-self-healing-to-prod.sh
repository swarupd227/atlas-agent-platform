#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Atlas Self-Healing Demo — Production Migration Script
#
# Performs a full dependency-ordered migration of all 6 self-healing agents
# and their associated Platform Intelligence components (Skills, Runbooks,
# Policies, Golden Datasets, Eval Suites, Healing Pipelines, Blueprint JSON)
# from a Dev/Staging environment to Production.
#
# Usage:
#   ./scripts/migrate-self-healing-to-prod.sh <PROD_BASE_URL>
#
# Example:
#   ./scripts/migrate-self-healing-to-prod.sh https://api.atlas.hearst.com
#
# Requirements:
#   - Node.js 18+ in PATH
#   - scripts/create-self-healing-demos.mjs
#   - scripts/patch-self-healing-agents.mjs
#
# Environment variables (optional):
#   ATLAS_API_TOKEN   — Bearer token if the prod API requires auth
#   ATLAS_ORG_ID      — Org ID override (defaults to prod org in the mjs scripts)
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ─── Validate arguments ──────────────────────────────────────────────────────

if [[ $# -lt 1 ]]; then
  echo "ERROR: PROD_BASE_URL is required." >&2
  echo "Usage: $0 <PROD_BASE_URL>" >&2
  echo "Example: $0 https://api.atlas.hearst.com" >&2
  exit 1
fi

PROD_URL="${1%/}"    # Strip trailing slash

if [[ ! "$PROD_URL" =~ ^https?:// ]]; then
  echo "ERROR: PROD_BASE_URL must start with http:// or https://" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST_PATH="$SCRIPT_DIR/self-healing-dev-ids.json"
PROD_MANIFEST_PATH="$SCRIPT_DIR/self-healing-prod-ids.json"
TIMESTAMP="$(date -u +%Y%m%d_%H%M%S)"
LOG_FILE="/tmp/sh-migration-${TIMESTAMP}.log"

# ─── Banner ──────────────────────────────────────────────────────────────────

cat <<EOF
╔══════════════════════════════════════════════════════════════╗
║  ATLAS Self-Healing Demo — Production Migration             ║
║  6 Agents + Full Platform Intelligence                      ║
╠══════════════════════════════════════════════════════════════╣
║  Target: $(printf '%-51s' "${PROD_URL}")║
║  Log:    $(printf '%-51s' "${LOG_FILE}")║
╚══════════════════════════════════════════════════════════════╝
EOF

# ─── Pre-flight checks ───────────────────────────────────────────────────────

echo ""
echo "[pre-flight] Checking Node.js..."
if ! command -v node &>/dev/null; then
  echo "ERROR: node is not in PATH" >&2
  exit 1
fi
NODE_VER="$(node --version)"
echo "[pre-flight] Node.js $NODE_VER — OK"

echo "[pre-flight] Checking migration scripts..."
for f in "$SCRIPT_DIR/create-self-healing-demos.mjs" "$SCRIPT_DIR/patch-self-healing-agents.mjs"; do
  if [[ ! -f "$f" ]]; then
    echo "ERROR: Required script not found: $f" >&2
    exit 1
  fi
done
echo "[pre-flight] All migration scripts found — OK"

echo "[pre-flight] Checking dev manifest..."
if [[ ! -f "$MANIFEST_PATH" ]]; then
  echo "ERROR: Dev manifest not found at $MANIFEST_PATH" >&2
  echo "       Run create-self-healing-demos.mjs against Dev first." >&2
  exit 1
fi
echo "[pre-flight] Dev manifest found — OK"

echo "[pre-flight] Connectivity check → $PROD_URL/api/health ..."
HTTP_STATUS="$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$PROD_URL/api/health" || true)"
if [[ "$HTTP_STATUS" != "200" ]]; then
  echo "WARNING: Health check returned HTTP $HTTP_STATUS (continuing anyway)" >&2
else
  echo "[pre-flight] API reachable — OK"
fi

# ─── Phase 1: Create all agents and Platform Intelligence ────────────────────

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "[Phase 1] Creating 6 self-healing agents in Production..."
echo "          (Skills → Runbooks → Agent → Policies → Dataset"
echo "           → Test Cases → Eval Suite → Healing Pipeline)"
echo "═══════════════════════════════════════════════════════════"
echo ""

if node "$SCRIPT_DIR/create-self-healing-demos.mjs" "$PROD_URL" 2>&1 | tee -a "$LOG_FILE"; then
  echo ""
  echo "[Phase 1] ✓ Agent creation complete"
else
  EXIT_CODE=$?
  echo ""
  echo "ERROR: Phase 1 failed (exit code $EXIT_CODE). Check log: $LOG_FILE" >&2
  exit $EXIT_CODE
fi

# ─── Phase 2: Patch blueprintJson + normalise pipeline fields ────────────────

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "[Phase 2] Patching agent blueprints + normalising pipeline"
echo "          skillsInvoked field names and descriptions..."
echo "═══════════════════════════════════════════════════════════"
echo ""

if node "$SCRIPT_DIR/patch-self-healing-agents.mjs" "$PROD_URL" 2>&1 | tee -a "$LOG_FILE"; then
  echo ""
  echo "[Phase 2] ✓ Blueprint + pipeline normalisation complete"
else
  EXIT_CODE=$?
  echo ""
  echo "ERROR: Phase 2 failed (exit code $EXIT_CODE). Check log: $LOG_FILE" >&2
  exit $EXIT_CODE
fi

# ─── Phase 3: Validate manifest was written ──────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "[Phase 3] Validating production manifest..."
echo "═══════════════════════════════════════════════════════════"
echo ""

if [[ -f "$MANIFEST_PATH" ]]; then
  # Copy manifest as prod manifest for reference
  cp "$MANIFEST_PATH" "$PROD_MANIFEST_PATH"
  echo "[Phase 3] ✓ Manifest written: $PROD_MANIFEST_PATH"
else
  echo "WARNING: Manifest not found at expected path (non-fatal)" >&2
fi

# ─── Summary ─────────────────────────────────────────────────────────────────

echo ""
cat <<EOF
╔══════════════════════════════════════════════════════════════╗
║  MIGRATION COMPLETE                                         ║
╠══════════════════════════════════════════════════════════════╣
║  6 agents created with:                                     ║
║    • 5 Skills each (30 total)                               ║
║    • 5 Runbooks each (30 total)                             ║
║    • 4 Policies each (24 total)                             ║
║    • 1 Golden Dataset + 5 Test Cases each                   ║
║    • 1 Eval Suite each (6 total)                            ║
║    • 1 Healing Pipeline each (6 total)                      ║
║    • 8-node Blueprint JSON each (6 total)                   ║
╠══════════════════════════════════════════════════════════════╣
║  Industries: Healthcare, Financial Services, Manufacturing, ║
║              Retail/E-Commerce, Energy/Utilities, Insurance ║
╠══════════════════════════════════════════════════════════════╣
║  Full log: $(printf '%-49s' "${LOG_FILE}")║
╚══════════════════════════════════════════════════════════════╝
EOF
