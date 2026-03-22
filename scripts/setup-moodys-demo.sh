#!/usr/bin/env bash
# Moody's Credit Assessment Package Assembly — Demo Environment Setup
#
# Bootstraps all 6 Moody's agents and both MCP servers in the target environment:
#   - Financial Data Collector & Spreader    (GPT-4.1)
#   - Earnings & Management Signal Analyzer  (Claude Sonnet)
#   - Peer Comparison Builder                (GPT-4.1)
#   - ESG & Sustainability Profile Agent     (Claude Sonnet)
#   - News & Event Scanner                   (Claude Sonnet)
#   - Scorecard Pre-Population Agent         (GPT-4.1)
#
# MCP Servers configured:
#   - Moody's Internal Data MCP Server (9 tools)
#   - External Research MCP Server     (6 tools)
#
# Each agent is created if it does not yet exist, and each deployment is
# seeded with the exact UUID that the /demo-api/moodys/run pipeline expects.
# Safe to run multiple times — fully idempotent.
#
# Usage:
#   ./scripts/setup-moodys-demo.sh
#   BASE_URL=https://your-production-domain.replit.app ./scripts/setup-moodys-demo.sh

set -euo pipefail

BASE_URL="${BASE_URL:-https://agent-lifecycle-management-platform.replit.app}"

echo "Moody's Credit Assessment — Demo Environment Setup"
echo "Target: $BASE_URL"
echo ""

RESPONSE=$(curl -sf -X POST "$BASE_URL/demo-api/moodys/ensure-agents" \
  -H "Content-Type: application/json" \
  --max-time 30)

if [ $? -ne 0 ]; then
  echo "ERROR: Request failed. Is the app running at $BASE_URL?"
  exit 1
fi

echo "$RESPONSE" | jq '.'

CONFIGURED=$(echo "$RESPONSE" | jq -r '.agentsConfigured // 0')
INTERNAL_ID=$(echo "$RESPONSE" | jq -r '.mcpServers.internal // "n/a"')
EXTERNAL_ID=$(echo "$RESPONSE" | jq -r '.mcpServers.external // "n/a"')

echo ""
echo "Moody's demo setup complete."
echo "  Agents configured : $CONFIGURED"
echo "  Internal MCP      : $INTERNAL_ID"
echo "  External MCP      : $EXTERNAL_ID"
