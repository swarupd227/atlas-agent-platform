#!/usr/bin/env bash
# BlackRock Use Case 2: External Portal Offboarding — Demo Environment Setup
#
# This script recreates the Termination Intake Agent and its associated
# SailPoint MCP tools and trigger in a fresh environment.
#
# Prerequisites:
#   - Application running at $BASE_URL (default: http://localhost:5000)
#   - SailPoint IdentityIQ MCP Server must already exist
#     (set SAILPOINT_MCP_ID env var or update the default below)
#
# Usage:
#   ./scripts/setup-blackrock2-demo.sh
#   BASE_URL=https://my-app.repl.co SAILPOINT_MCP_ID=<uuid> ./scripts/setup-blackrock2-demo.sh

BASE_URL="${BASE_URL:-http://localhost:5000}"
SAILPOINT_MCP_ID="${SAILPOINT_MCP_ID:-1619ef7f-8bee-4d02-8f39-480275397c22}"

echo "Setting up BlackRock 2 demo against $BASE_URL"

# ---------------------------------------------------------------------------
# Step 1: Add get_identity_cube tool to SailPoint MCP server
# ---------------------------------------------------------------------------
echo "[1/4] Adding get_identity_cube tool to SailPoint MCP server..."
TOOL1=$(curl -sf -X POST "$BASE_URL/api/mcp-servers/$SAILPOINT_MCP_ID/tools" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "get_identity_cube",
    "description": "Retrieves the full SailPoint IdentityIQ identity cube for a given employee, including all linked accounts, entitlements, roles, and access certifications across connected systems.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "identityName": { "type": "string", "description": "The SailPoint identity name or employee ID to look up" }
      },
      "required": ["identityName"]
    },
    "outputSchema": {
      "type": "object",
      "properties": {
        "identityId": { "type": "string" },
        "displayName": { "type": "string" },
        "employeeId": { "type": "string" },
        "status": { "type": "string" },
        "accounts": { "type": "array" },
        "entitlements": { "type": "array" },
        "terminationDate": { "type": "string" }
      }
    },
    "riskClassification": "medium",
    "enabled": true,
    "owner": "Identity & Access Management"
  }')
TOOL1_ID=$(echo "$TOOL1" | jq -r '.id')
echo "  Created: $TOOL1_ID (get_identity_cube)"

# ---------------------------------------------------------------------------
# Step 2: Add get_pending_tasks tool to SailPoint MCP server
# ---------------------------------------------------------------------------
echo "[2/4] Adding get_pending_tasks tool to SailPoint MCP server..."
TOOL2=$(curl -sf -X POST "$BASE_URL/api/mcp-servers/$SAILPOINT_MCP_ID/tools" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "get_pending_tasks",
    "description": "Polls the SailPoint IdentityIQ workflow task queue for pending termination events. Returns all open termination workflow tasks awaiting processing.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "taskType": { "type": "string", "description": "Filter by task type, e.g. termination_event", "default": "termination_event" },
        "limit": { "type": "integer", "description": "Max number of tasks to return", "default": 50 }
      }
    },
    "outputSchema": {
      "type": "object",
      "properties": {
        "tasks": { "type": "array" },
        "count": { "type": "integer" },
        "polledAt": { "type": "string" }
      }
    },
    "riskClassification": "medium",
    "enabled": true,
    "owner": "Identity & Access Management"
  }')
TOOL2_ID=$(echo "$TOOL2" | jq -r '.id')
echo "  Created: $TOOL2_ID (get_pending_tasks)"

# ---------------------------------------------------------------------------
# Step 3: Create the Termination Intake Agent
# ---------------------------------------------------------------------------
echo "[3/4] Creating Termination Intake Agent..."
AGENT=$(curl -sf -X POST "$BASE_URL/api/agents" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Termination Intake Agent",
    "agentType": "single",
    "description": "Monitors SailPoint IdentityIQ for employee termination events. Validates termination against the HR source of truth, then creates a structured removal case to initiate multi-portal access revocation.",
    "owner": "Identity & Access Management",
    "status": "active",
    "riskTier": "HIGH",
    "autonomyMode": "autonomous",
    "environment": "production",
    "department": "Identity & Access Management",
    "modelProvider": "openai",
    "modelName": "gpt-4.1",
    "complianceTags": ["SOX", "FCA SM&CR", "SEC 17a-4", "FINRA 3110"],
    "toolAccessClass": "privileged",
    "maxToolIterations": 10,
    "healthScore": 98,
    "successRate": 0.997,
    "systemPrompt": "You are the Termination Intake Agent for BlackRock trade settlement operations. You run continuously and trigger immediately when a termination event is detected.\n\nYour three-phase workflow:\n\n1. POLL FOR TERMINATION EVENTS: Call get_pending_tasks with taskType=termination_event. If no tasks are returned, log the poll and stop. If tasks are found, proceed for each terminated employee.\n\n2. VALIDATE AGAINST HR SOURCE: For each termination event, call get_identity_cube with the employee identity name to retrieve their full identity record, linked accounts, and all active entitlements. Cross-validate the termination date and employment status against Workday HR data. If validation fails (e.g. active-employment mismatch), flag for human review and do not proceed.\n\n3. CREATE REMOVAL CASE: For each validated termination, create a structured removal case containing: employee identity, termination date, list of all active portal accounts (DTCC, Euroclear, Clearstream, Bloomberg TOMS, SWIFT, ICE, Markitserv), authentication method per portal, and estimated removal SLA. Log the case ID and route to the Portal Access Revocation Orchestrator.\n\nCritical rules:\n- NEVER skip the HR validation step.\n- Log every action with timestamp, employee ID, system, and outcome.\n- Each removal case must include a SOX-compliant audit trail reference.\n- Trigger immediately on event detection — no human approval required for case creation.",
    "toolsConfig": [
      { "name": "get_pending_tasks", "description": "Polls SailPoint task queue for pending termination workflow events", "permissions": ["sailpoint:tasks:read"], "mcpServerId": "'"$SAILPOINT_MCP_ID"'" },
      { "name": "get_identity_cube", "description": "Retrieves full identity record including all linked accounts and entitlements", "permissions": ["sailpoint:identity:read"], "mcpServerId": "'"$SAILPOINT_MCP_ID"'" },
      { "name": "validate_hr_status", "description": "Validates termination event against Workday HR source of truth", "permissions": ["workday:employees:read"] },
      { "name": "create_removal_case", "description": "Creates a structured portal access removal case and routes to the revocation orchestrator", "permissions": ["cases:write", "audit:write"] }
    ],
    "blueprintJson": {
      "nodes": [
        { "id": "poll", "type": "tool_call", "label": "Poll SailPoint Task Queue" },
        { "id": "validate", "type": "tool_call", "label": "Validate Against HR Source" },
        { "id": "route", "type": "router", "label": "Validation Gate" },
        { "id": "create_case", "type": "tool_call", "label": "Create Removal Case" },
        { "id": "flag_review", "type": "human_review", "label": "Flag for Human Review" }
      ]
    },
    "policyBindings": [
      { "policyName": "SOX Access Removal Audit", "enforcement": "hard" },
      { "policyName": "FCA SM&CR Offboarding Controls", "enforcement": "hard" },
      { "policyName": "SEC 17a-4 Evidence Retention", "enforcement": "hard" },
      { "policyName": "FINRA 3110 Supervisory Controls", "enforcement": "soft" }
    ],
    "runtimeConfig": {
      "triggerType": "event",
      "triggerEvent": "termination_event",
      "triggerSource": "sailpoint_identityiq",
      "autoTrigger": true,
      "pollingIntervalSeconds": 60
    }
  }')
AGENT_ID=$(echo "$AGENT" | jq -r '.id')
echo "  Created: $AGENT_ID (Termination Intake Agent)"

# ---------------------------------------------------------------------------
# Step 4: Link agent to SailPoint MCP server and create trigger
# ---------------------------------------------------------------------------
echo "[4/4] Linking to SailPoint MCP server and creating trigger..."
curl -sf -X POST "$BASE_URL/api/agents/$AGENT_ID/mcp-servers" \
  -H "Content-Type: application/json" \
  -d "{\"serverId\": \"$SAILPOINT_MCP_ID\", \"acknowledgeWarnings\": true}" > /dev/null
echo "  Linked to SailPoint MCP server"

TRIGGER=$(curl -sf -X POST "$BASE_URL/api/agents/$AGENT_ID/triggers" \
  -H "Content-Type: application/json" \
  -d '{
    "triggerType": "event",
    "enabled": true,
    "config": {
      "eventName": "termination_event",
      "source": "sailpoint_identityiq",
      "autoExecute": true,
      "pollingIntervalSeconds": 60,
      "filters": { "taskType": "termination_event", "status": "pending" }
    }
  }')
TRIGGER_ID=$(echo "$TRIGGER" | jq -r '.id')
echo "  Created trigger: $TRIGGER_ID (termination_event)"

echo ""
echo "BlackRock 2 demo setup complete."
echo "  Agent ID:    $AGENT_ID"
echo "  Trigger ID:  $TRIGGER_ID"
echo "  Tool IDs:    $TOOL1_ID (get_identity_cube), $TOOL2_ID (get_pending_tasks)"
