#!/usr/bin/env bash
# BlackRock Use Case 1: Synthetic Worker — Demo Environment Setup
#
# Bootstraps all 5 BK1 agents (Orchestrator, Aquera, SailPoint,
# RadiantOne, Brainwave) in the target environment. Each agent is
# created if it does not yet exist, or updated if its system prompt
# has drifted from the canonical definition.
#
# Usage:
#   ./scripts/setup-blackrock1-demo.sh
#   BASE_URL=https://agent-lifecycle-management-platform.replit.app ./scripts/setup-blackrock1-demo.sh

BASE_URL="${BASE_URL:-https://agent-lifecycle-management-platform.replit.app}"

echo "Setting up BlackRock 1 (Synthetic Worker) demo against $BASE_URL"
echo ""

RESPONSE=$(curl -sf -X POST "$BASE_URL/demo-api/blackrock/ensure-agents" \
  -H "Content-Type: application/json")

if [ $? -ne 0 ]; then
  echo "ERROR: Request failed. Is the app running at $BASE_URL?"
  exit 1
fi

echo "$RESPONSE" | jq '.'

CONFIGURED=$(echo "$RESPONSE" | jq -r '.agentsConfigured // 0')
echo ""
echo "BlackRock 1 demo setup complete — $CONFIGURED agents configured."
