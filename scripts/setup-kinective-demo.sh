#!/usr/bin/env bash
# Kinective Change of Address — Demo Environment Setup
#
# Bootstraps the Kinective COA agent and all 11 MCP servers in the target environment:
#   - Change of Address Agent (GPT-4.1)
#
# MCP Servers configured (11):
#   - Kinective SignPlus MCP Server
#   - Kinective Gateway Core MCP Server
#   - USPS Address Validation MCP Server
#   - Digital Banking Connector MCP Server
#   - Statement Vendor Connector MCP Server
#   - Card Management Connector MCP Server
#   - Loan Origination Connector MCP Server
#   - CRM Connector MCP Server
#   - Bill Pay Connector MCP Server
#   - Fraud Detection Connector MCP Server
#   - Compliance Connector MCP Server
#
# Safe to run multiple times — fully idempotent.
#
# Usage:
#   ./scripts/setup-kinective-demo.sh
#   BASE_URL=https://your-production-domain.replit.app ./scripts/setup-kinective-demo.sh

set -euo pipefail

BASE_URL="${BASE_URL:-https://agent-lifecycle-management-platform.replit.app}"

echo "Kinective Change of Address — Demo Environment Setup"
echo "Target: $BASE_URL"
echo ""

RESPONSE=$(curl -sf -X POST "$BASE_URL/demo-api/kinective/ensure-agent" \
  -H "Content-Type: application/json" \
  --max-time 30)

if [ $? -ne 0 ]; then
  echo "ERROR: Request failed. Is the app running at $BASE_URL?"
  exit 1
fi

echo "$RESPONSE" | jq '.'

AGENT_ID=$(echo "$RESPONSE" | jq -r '.agentId // "n/a"')
MCP_COUNT=$(echo "$RESPONSE" | jq -r '.mcpServersConfigured // 0')

echo ""
echo "Kinective demo setup complete."
echo "  Agent ID          : $AGENT_ID"
echo "  MCP servers ready : $MCP_COUNT"
