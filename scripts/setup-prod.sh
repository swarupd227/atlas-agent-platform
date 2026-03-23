#!/usr/bin/env bash
# ATLAS Demo Platform — Full Production Bootstrap
#
# Idempotent. Safe to re-run at any time.
# Creates or reconciles all agents, MCP servers, and deployments for every demo.
#
# Demos covered:
#   BK1  BlackRock Synthetic Worker          — 5 agents, worker MCP servers
#   BK2  BlackRock AIM Portal Offboarding    — 6 agents, AIM Offboarding Suite MCP (9 tools)
#   KIN  Kinective Change of Address         — 1 agent,  11 MCP servers
#   MDY  Moody's Credit Assessment           — 6 agents, 2 MCP servers (9 + 6 tools)
#
# Usage:
#   ./scripts/setup-prod.sh
#   BASE_URL=https://your-custom-domain.replit.app ./scripts/setup-prod.sh
#
# Optional flags:
#   --skip-bk1    Skip BlackRock 1 setup
#   --skip-bk2    Skip BlackRock 2 setup
#   --skip-kin    Skip Kinective setup
#   --skip-mdy    Skip Moody's setup
#   --smoke-test  After setup, hit each live-run endpoint to verify agent execution works

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────

BASE_URL="${BASE_URL:-https://agent-lifecycle-management-platform.replit.app}"
TIMEOUT=60   # seconds per ensure-agents call
SMOKE_TEST=0

SKIP_BK1=0
SKIP_BK2=0
SKIP_KIN=0
SKIP_MDY=0

for arg in "$@"; do
  case "$arg" in
    --skip-bk1)   SKIP_BK1=1 ;;
    --skip-bk2)   SKIP_BK2=1 ;;
    --skip-kin)   SKIP_KIN=1 ;;
    --skip-mdy)   SKIP_MDY=1 ;;
    --smoke-test) SMOKE_TEST=1 ;;
  esac
done

# ── Helpers ───────────────────────────────────────────────────────────────────

PASS="✓"
FAIL="✗"
SKIP="–"

ok()   { echo "  $PASS $*"; }
fail() { echo "  $FAIL $*"; }
skip() { echo "  $SKIP $*  (skipped)"; }

ensure() {
  local label="$1"
  local url="$2"
  curl -sf -X POST "$url" \
    -H "Content-Type: application/json" \
    --max-time "$TIMEOUT" \
    2>/dev/null
}

smoke() {
  local label="$1"
  local url="$2"
  local status
  status=$(curl -sfo /dev/null -w "%{http_code}" --max-time 10 "$url" 2>/dev/null || echo "000")
  if [ "$status" = "200" ]; then
    ok "$label → HTTP $status"
  else
    fail "$label → HTTP $status"
  fi
}

# ── Header ────────────────────────────────────────────────────────────────────

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║        ATLAS Demo Platform — Production Bootstrap                ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
echo "  Target : $BASE_URL"
echo "  Time   : $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo ""

# ── BK1: BlackRock Synthetic Worker ──────────────────────────────────────────

echo "┌─ BK1  BlackRock Synthetic Worker ─────────────────────────────────"

if [ "$SKIP_BK1" -eq 1 ]; then
  skip "Skipped by --skip-bk1"
else
  BK1_RESP=$(ensure "BK1" "$BASE_URL/demo-api/blackrock/ensure-agents" 2>&1) || {
    fail "Request failed — is the app running at $BASE_URL?"
    exit 1
  }

  BK1_AGENTS=$(echo "$BK1_RESP" | jq -r '.agentsConfigured // 0' 2>/dev/null || echo "?")
  BK1_OK=$(echo "$BK1_RESP"    | jq -r '.success // false' 2>/dev/null || echo "false")

  if [ "$BK1_OK" = "true" ]; then
    ok "Agents configured : $BK1_AGENTS / 5"
    BK1_AGENT_IDS=$(echo "$BK1_RESP" | jq -r '.agents | to_entries[] | "     \(.key): \(.value)"' 2>/dev/null || echo "")
    [ -n "$BK1_AGENT_IDS" ] && echo "$BK1_AGENT_IDS"
  else
    fail "ensure-agents returned an error"
    echo "$BK1_RESP" | jq -r '.error // .' 2>/dev/null | sed 's/^/     /'
  fi
fi

echo ""

# ── BK2: BlackRock AIM Portal Offboarding ────────────────────────────────────

echo "┌─ BK2  BlackRock AIM Portal Offboarding ───────────────────────────"

if [ "$SKIP_BK2" -eq 1 ]; then
  skip "Skipped by --skip-bk2"
else
  BK2_RESP=$(ensure "BK2" "$BASE_URL/demo-api/blackrock2/ensure-agents") || {
    fail "Request failed"
    exit 1
  }

  BK2_AGENTS=$(echo "$BK2_RESP" | jq -r '.agentsConfigured // 0' 2>/dev/null || echo "?")
  BK2_MCP=$(echo "$BK2_RESP"    | jq -r '.mcpServerId // "n/a"'  2>/dev/null || echo "n/a")
  BK2_OK=$(echo "$BK2_RESP"     | jq -r '.success // false'       2>/dev/null || echo "false")

  if [ "$BK2_OK" = "true" ]; then
    ok "Agents configured  : $BK2_AGENTS / 6"
    ok "AIM MCP Server ID  : $BK2_MCP"
    BK2_AGENT_IDS=$(echo "$BK2_RESP" | jq -r '.agents | to_entries[] | "     \(.key): \(.value)"' 2>/dev/null || echo "")
    [ -n "$BK2_AGENT_IDS" ] && echo "$BK2_AGENT_IDS"
    echo ""
    echo "  Live-run endpoints (pass scenarioId to demo frontend):"
    echo "    happy_path        : $BASE_URL/demo-api/blackrock2/live-run?scenarioId=happy_path"
    echo "    portal_unreachable: $BASE_URL/demo-api/blackrock2/live-run?scenarioId=portal_unreachable"
    echo "    pending_trades    : $BASE_URL/demo-api/blackrock2/live-run?scenarioId=pending_trades"
    echo "    admin_access      : $BASE_URL/demo-api/blackrock2/live-run?scenarioId=admin_access"
    echo "    employee_transfer : $BASE_URL/demo-api/blackrock2/live-run?scenarioId=employee_transfer"
  else
    fail "ensure-agents returned an error"
    echo "$BK2_RESP" | jq -r '.error // .' 2>/dev/null | sed 's/^/     /'
  fi
fi

echo ""

# ── KIN: Kinective Change of Address ─────────────────────────────────────────

echo "┌─ KIN  Kinective Change of Address ────────────────────────────────"

if [ "$SKIP_KIN" -eq 1 ]; then
  skip "Skipped by --skip-kin"
else
  KIN_RESP=$(ensure "KIN" "$BASE_URL/demo-api/kinective/ensure-agent") || {
    fail "Request failed"
    exit 1
  }

  KIN_AGENT=$(echo "$KIN_RESP" | jq -r '.agentId // "n/a"'          2>/dev/null || echo "n/a")
  KIN_MCP=$(echo "$KIN_RESP"   | jq -r '.mcpServersConfigured // 0'  2>/dev/null || echo "?")
  KIN_OK=$(echo "$KIN_RESP"    | jq -r '.success // false'            2>/dev/null || echo "false")

  if [ "$KIN_OK" = "true" ]; then
    ok "Agent ID           : $KIN_AGENT"
    ok "MCP servers ready  : $KIN_MCP / 11"
  else
    fail "ensure-agent returned an error"
    echo "$KIN_RESP" | jq -r '.error // .' 2>/dev/null | sed 's/^/     /'
  fi
fi

echo ""

# ── MDY: Moody's Credit Assessment ───────────────────────────────────────────

echo "┌─ MDY  Moody's Credit Assessment Package Assembly ─────────────────"

if [ "$SKIP_MDY" -eq 1 ]; then
  skip "Skipped by --skip-mdy"
else
  MDY_RESP=$(ensure "MDY" "$BASE_URL/demo-api/moodys/ensure-agents") || {
    fail "Request failed"
    exit 1
  }

  MDY_AGENTS=$(echo "$MDY_RESP"  | jq -r '.agentsConfigured // 0'          2>/dev/null || echo "?")
  MDY_INT=$(echo "$MDY_RESP"     | jq -r '.mcpServers.internal // "n/a"'   2>/dev/null || echo "n/a")
  MDY_EXT=$(echo "$MDY_RESP"     | jq -r '.mcpServers.external // "n/a"'   2>/dev/null || echo "n/a")
  MDY_OK=$(echo "$MDY_RESP"      | jq -r '.success // false'                2>/dev/null || echo "false")

  if [ "$MDY_OK" = "true" ]; then
    ok "Agents configured  : $MDY_AGENTS / 6"
    ok "Internal MCP ID    : $MDY_INT"
    ok "External MCP ID    : $MDY_EXT"
    MDY_AGENT_IDS=$(echo "$MDY_RESP" | jq -r '.agents | to_entries[] | "     \(.key): \(.value)"' 2>/dev/null || echo "")
    [ -n "$MDY_AGENT_IDS" ] && echo "$MDY_AGENT_IDS"
  else
    fail "ensure-agents returned an error"
    echo "$MDY_RESP" | jq -r '.error // .' 2>/dev/null | sed 's/^/     /'
  fi
fi

echo ""

# ── Optional smoke test ───────────────────────────────────────────────────────

if [ "$SMOKE_TEST" -eq 1 ]; then
  echo "┌─ Smoke Test — health endpoints ───────────────────────────────────"
  smoke "BK1 live-run (default)"      "$BASE_URL/demo-api/blackrock/live-run/stream?scenario=default"
  smoke "BK2 live-run (happy_path)"   "$BASE_URL/demo-api/blackrock2/live-run?scenarioId=happy_path"
  smoke "MDY run (AAPL)"              "$BASE_URL/demo-api/moodys/run?ticker=AAPL"
  echo ""
fi

# ── Summary ───────────────────────────────────────────────────────────────────

echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║                     Setup complete                               ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
echo "  All agents and MCP servers are idempotent — re-running this"
echo "  script will reconcile any configuration drift without creating"
echo "  duplicates."
echo ""
echo "  To re-run only one demo:"
echo "    ./scripts/setup-blackrock1-demo.sh   BASE_URL=$BASE_URL"
echo "    ./scripts/setup-bk2-demo.sh          BASE_URL=$BASE_URL"
echo "    ./scripts/setup-kinective-demo.sh    BASE_URL=$BASE_URL"
echo "    ./scripts/setup-moodys-demo.sh       BASE_URL=$BASE_URL"
echo ""
