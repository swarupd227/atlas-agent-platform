#!/usr/bin/env bash
# BlackRock AIM Portal Offboarding (BK2) — Demo Environment Setup
#
# Bootstraps all 6 BK2 agents and the AIM Offboarding Suite MCP server
# in the target environment. Safe to run multiple times — fully idempotent.
#
# Agents configured (6):
#   - Termination Intake Agent
#   - Portal Discovery Agent
#   - Active Trade Check Agent
#   - Access Removal Executor Agent
#   - Removal Verification Agent
#   - Audit & Evidence Agent
#
# MCP Server:
#   - AIM Offboarding Suite (9 tools: validate_termination, scan_portal_accounts,
#     check_portal_health, check_pending_settlements, execute_access_removal,
#     verify_access_removed, generate_evidence_package, validate_transfer,
#     provision_access)
#
# Usage:
#   ./scripts/setup-bk2-demo.sh
#   BASE_URL=https://your-production-domain.replit.app ./scripts/setup-bk2-demo.sh

set -euo pipefail

BASE_URL="${BASE_URL:-https://agent-lifecycle-management-platform.replit.app}"

echo "BlackRock AIM Portal Offboarding (BK2) — Demo Environment Setup"
echo "Target: $BASE_URL"
echo ""

RESPONSE=$(curl -sf -X POST "$BASE_URL/demo-api/blackrock2/ensure-agents" \
  -H "Content-Type: application/json" \
  --max-time 30)

if [ $? -ne 0 ]; then
  echo "ERROR: Request failed. Is the app running at $BASE_URL?"
  exit 1
fi

echo "$RESPONSE" | jq '.'

AGENTS=$(echo "$RESPONSE" | jq -r '.agentsConfigured // 0')
MCP_ID=$(echo "$RESPONSE" | jq -r '.mcpServerId // "n/a"')

echo ""
echo "BK2 demo setup complete."
echo "  Agents configured  : $AGENTS"
echo "  AIM MCP Server ID  : $MCP_ID"
echo ""
echo "Live run endpoint:"
echo "  GET $BASE_URL/demo-api/blackrock2/live-run?scenarioId=happy_path"
echo "  GET $BASE_URL/demo-api/blackrock2/live-run?scenarioId=portal_unreachable"
echo "  GET $BASE_URL/demo-api/blackrock2/live-run?scenarioId=pending_trades"
echo "  GET $BASE_URL/demo-api/blackrock2/live-run?scenarioId=admin_access"
echo "  GET $BASE_URL/demo-api/blackrock2/live-run?scenarioId=employee_transfer"
