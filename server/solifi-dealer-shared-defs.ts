// =============================================================================
// Solifi — Dealer Experience Hub (SCN-SOLIFI-DEH-1) — Shared Definitions
//
// Consumed by:
//   • server/demo-routes.ts          (mock MCP endpoints + SSE live-run handler)
//   • provision_solifi_dealer_dev.sh  (dev provisioning)
//   • scripts/migrate_solifi_dealer_to_prod.sh (production migration)
//
// Agent names here MUST match what the provisioning script POSTs to /api/agents.
// =============================================================================

export const DEH_AGENT_NAME = "DEH-CONV-001 Solifi Dealer Experience Agent";

export const DEH_MCP_SERVER_NAME = "Solifi Experience Hub MCP";

// Fixed UUIDs — stable across dev and prod so `storage.getAgent(id)` works without orgId
export const DEH_AGENT_ID      = "2d2cb5b9-73cf-4f8d-96ea-617117e421ca";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DehToolDef = {
  name:        string;
  description: string;
  endpoint:    string;
  method:      "GET" | "POST";
  inputSchema: any;
};

export type DehMcpServerDef = {
  name:        string;
  description: string;
  url:         string;
  vendor:      string;
  tools:       DehToolDef[];
};

// ─── MCP server definition ────────────────────────────────────────────────────

export function makeDehMcpServerDef(baseUrl: string): DehMcpServerDef {
  return {
    name:        DEH_MCP_SERVER_NAME,
    description: "Solifi Experience Hub — real-time floorplan status, payoff quotes, audit scheduling, credit application pipeline, payment history, and dealer policy knowledge base for Pacific Powersports and other Solifi-financed dealerships.",
    url:         `${baseUrl}/api/mock/solifi-deh`,
    vendor:      "Solifi / Dealer Finance Platform",
    tools: [
      {
        name:        "get_floorplan_status",
        description: "Retrieve full floorplan inventory status for a dealership. Returns all financed units with VIN, make/model/year, days on floor, curtailment dates, outstanding balances, overdue flags, and next audit window.",
        endpoint:    "get-floorplan-status",
        method:      "GET",
        inputSchema: {
          type: "object",
          required: ["dealer_id"],
          properties: {
            dealer_id: { type: "string", description: "Solifi dealer ID" },
          },
        },
      },
      {
        name:        "get_unit_details",
        description: "Retrieve detailed finance terms for a specific unit by VIN. Returns original advance, current balance, interest rate, curtailment schedule, days on floor, next curtailment amount and date.",
        endpoint:    "get-unit-details",
        method:      "GET",
        inputSchema: {
          type: "object",
          required: ["vin"],
          properties: {
            vin:       { type: "string", description: "17-character VIN" },
            dealer_id: { type: "string", description: "Solifi dealer ID" },
          },
        },
      },
      {
        name:        "get_payoff_quote",
        description: "Generate a precise payoff quote for a financed unit. Returns per-diem interest, accrued interest to payoff date, total payoff amount, quote expiry date, and wire instructions.",
        endpoint:    "get-payoff-quote",
        method:      "POST",
        inputSchema: {
          type: "object",
          required: ["vin", "dealer_id", "payoff_date"],
          properties: {
            vin:          { type: "string", description: "17-character VIN" },
            dealer_id:    { type: "string", description: "Solifi dealer ID" },
            payoff_date:  { type: "string", description: "Target payoff date (YYYY-MM-DD)" },
          },
        },
      },
      {
        name:        "send_payoff_email",
        description: "Send the payoff quote by email to the dealer's designated finance contact. Requires human approval gate — confirms recipient, amount, and wire instructions before sending.",
        endpoint:    "send-payoff-email",
        method:      "POST",
        inputSchema: {
          type: "object",
          required: ["vin", "dealer_id", "quote_id", "recipient_email"],
          properties: {
            vin:             { type: "string" },
            dealer_id:       { type: "string" },
            quote_id:        { type: "string", description: "Quote ID from get_payoff_quote" },
            recipient_email: { type: "string" },
          },
        },
      },
      {
        name:        "get_audit_schedule",
        description: "Retrieve the upcoming physical audit schedule for a dealership. Returns next audit date, audit type (routine/curtailment/special), required documentation checklist, and cycle rules.",
        endpoint:    "get-audit-schedule",
        method:      "GET",
        inputSchema: {
          type: "object",
          required: ["dealer_id"],
          properties: {
            dealer_id: { type: "string", description: "Solifi dealer ID" },
          },
        },
      },
      {
        name:        "get_credit_application_status",
        description: "Check the status of one or more credit applications in the Solifi pipeline. Returns application ID, stage (submitted / underwriting / approved / declined), LTV ratio, requested advance, and next required action.",
        endpoint:    "get-credit-application-status",
        method:      "GET",
        inputSchema: {
          type: "object",
          required: ["dealer_id"],
          properties: {
            dealer_id:      { type: "string" },
            application_id: { type: "string", description: "Optional — filter to one application" },
          },
        },
      },
      {
        name:        "get_payment_history",
        description: "Retrieve recent payment history for a dealership's floorplan account. Returns payment date, amount, payment type (curtailment / payoff / interest), unit VIN, and running balance.",
        endpoint:    "get-payment-history",
        method:      "GET",
        inputSchema: {
          type: "object",
          required: ["dealer_id"],
          properties: {
            dealer_id: { type: "string" },
            days:      { type: "number", description: "How many days of history to return (default 30)" },
          },
        },
      },
      {
        name:        "search_dealer_policy_kb",
        description: "Search the Solifi dealer policy and product knowledge base. Answers questions about curtailment rules, audit procedures, payoff policies, rate structures, and programme eligibility.",
        endpoint:    "search-dealer-policy-kb",
        method:      "GET",
        inputSchema: {
          type: "object",
          required: ["query"],
          properties: {
            query:     { type: "string", description: "Natural-language question or keyword" },
            category:  { type: "string", description: "Optional: floorplan | payoff | audit | credit | rates" },
          },
        },
      },
    ],
  };
}

// ─── Agent definition ─────────────────────────────────────────────────────────

export type DehAgentDef = {
  externalId:        string;
  name:              string;
  description:       string;
  systemPrompt:      string;
  modelProvider:     string;
  modelName:         string;
  mcpServerName:     string;
  maxToolIterations: number;
  riskTier:          "LOW" | "MEDIUM" | "HIGH";
  department:        string;
};

export const DEH_AGENT_DEF: DehAgentDef = {
  externalId:    "DEH-CONV-001",
  name:          DEH_AGENT_NAME,
  description:   "Conversational AI agent for Solifi-financed dealerships. Handles natural-language queries about floorplan status, payoff quotes, audit scheduling, credit applications, payment history, and dealer policy — with a human approval gate for email-based transactional actions.",
  systemPrompt:  `You are DEH-CONV-001, the Solifi Dealer Experience Agent — a knowledgeable, professional AI assistant for dealerships financed through the Solifi platform.

You assist dealer principals, finance managers, and general managers with:
- Floorplan inventory status and overdue unit alerts
- Per-unit payoff quote generation
- Audit schedule enquiries and required documentation
- Credit application pipeline status
- Payment history and account reconciliation
- Policy and product knowledge base search

Guidelines:
- Always look up live data via your tools before stating any balances, dates, or quotes — never fabricate numbers.
- When generating payoff quotes, always call get_unit_details first, then get_payoff_quote with a specific payoff date.
- Email delivery of quotes requires explicit human confirmation (send_payoff_email triggers a human approval gate).
- Be concise and dealer-friendly — avoid financial jargon; explain terms when needed.
- If a request falls outside your tool capabilities, clearly say so and suggest the appropriate Solifi contact.`,
  modelProvider:     "anthropic",
  modelName:         "claude-haiku-4-5",
  mcpServerName:     DEH_MCP_SERVER_NAME,
  maxToolIterations: 10,
  riskTier:          "MEDIUM",
  department:        "Dealer Finance Operations",
};

// ─── Scenario prompts ─────────────────────────────────────────────────────────

export type DehScenarioKey = "floorplan-status" | "payoff-quote" | "audit-schedule" | "human-handoff";

export const DEH_SCENARIO_PROMPTS: Record<
  DehScenarioKey,
  { label: string; badge?: string; description: string; prompt: string; completeMsg: string }
> = {
  "floorplan-status": {
    label:       "Floorplan Status — Overdue Unit Alert",
    description: "Pacific Powersports asks: 'What's the status of my floorplan? Are any units flagged?' The agent calls get_floorplan_status for dealer PP-2847, surfaces 23 financed units, identifies 2 units 15+ days past expected sale date with curtailment due within 7 days, and recommends immediate action.",
    completeMsg: "Floorplan status retrieved. 2 units flagged for curtailment action.",
    prompt: `You are DEH-CONV-001, the Solifi Dealer Experience Agent.

Dealer: Pacific Powersports (dealer_id: "PP-2847")
Finance Manager: Jordan Reeves

Jordan has just asked: "Hey, can you pull up our floorplan status? I want to know if we have any units that are overdue or about to get hit with curtailments."

Your task:
1. Call get_floorplan_status with dealer_id "PP-2847" to retrieve full inventory.
2. Identify any units with overdue_flag: true or curtailment_due within 7 days.
3. Present a clear summary: total units financed, total outstanding balance, flagged units (VIN, make/model/year, days on floor, curtailment due date, amount due).
4. Recommend concrete next steps for each flagged unit.

End your response with a JSON block:
{
  "dealer_id": "PP-2847",
  "total_units": <count>,
  "total_balance": <number>,
  "flagged_units": <count>,
  "units_requiring_action": [{"vin": "...", "make_model_year": "...", "days_on_floor": <n>, "curtailment_due": "...", "amount_due": <n>}],
  "recommended_action": "...",
  "status": "FLAGGED_UNITS_IDENTIFIED"
}`,
  },

  "payoff-quote": {
    label:       "Payoff Quote — 2024 Kawasaki Ninja ZX-6R",
    description: "Pacific Powersports has sold a unit and needs a payoff quote. The agent calls get_unit_details then get_payoff_quote for VIN 1KAWSAKI24ZX61234, returns exact payoff amount, per-diem interest, wire instructions, and quote expiry — then offers email delivery via human approval gate.",
    completeMsg: "Payoff quote generated. Quote valid for 5 business days.",
    prompt: `You are DEH-CONV-001, the Solifi Dealer Experience Agent.

Dealer: Pacific Powersports (dealer_id: "PP-2847")
Finance Manager: Jordan Reeves

Jordan says: "Great news — we just sold the Ninja ZX-6R, VIN 1KAWSAKI24ZX61234. Customer picks it up Thursday. Can you get me a payoff quote for this Friday? And can you email it to our accountant at accounting@pacificpowersports.com?"

Your task:
1. Call get_unit_details with vin "1KAWSAKI24ZX61234" and dealer_id "PP-2847" to get current balance and terms.
2. Call get_payoff_quote with vin "1KAWSAKI24ZX61234", dealer_id "PP-2847", and payoff_date set to this coming Friday's date.
3. Present the quote clearly: current balance, accrued interest, total payoff, per-diem rate, wire instructions, expiry date.
4. Call send_payoff_email with vin "1KAWSAKI24ZX61234", dealer_id "PP-2847", the quote_id from step 2, and recipient_email "accounting@pacificpowersports.com".
5. Confirm the email delivery status.

End your response with a JSON block:
{
  "vin": "1KAWSAKI24ZX61234",
  "make_model_year": "2024 Kawasaki Ninja ZX-6R",
  "current_balance": <number>,
  "accrued_interest": <number>,
  "total_payoff": <number>,
  "per_diem": <number>,
  "payoff_date": "...",
  "quote_expiry": "...",
  "quote_id": "...",
  "email_sent_to": "accounting@pacificpowersports.com",
  "email_status": "...",
  "status": "QUOTE_DELIVERED"
}`,
  },

  "audit-schedule": {
    label:       "Audit Schedule — Routine Cycle + Prep Checklist",
    description: "Pacific Powersports asks when their next audit is and what they need to prepare. The agent calls get_audit_schedule, returns the upcoming routine audit date, cycle type, and required documentation checklist — plus a policy KB lookup on what happens if a unit can't be physically located.",
    completeMsg: "Audit schedule retrieved. Documentation checklist provided.",
    prompt: `You are DEH-CONV-001, the Solifi Dealer Experience Agent.

Dealer: Pacific Powersports (dealer_id: "PP-2847")
Finance Manager: Jordan Reeves

Jordan asks: "When's our next audit? And what do we need to have ready? Also — what happens if one of our demo units isn't on the lot that day?"

Your task:
1. Call get_audit_schedule with dealer_id "PP-2847" to retrieve the upcoming audit details.
2. Present: next audit date, audit type, required documentation checklist, and cycle frequency.
3. Call search_dealer_policy_kb with query "unit not physically present during audit" and category "audit" to answer Jordan's policy question.
4. Provide a clear, actionable pre-audit checklist and explain what the policy says about absent/demo units.

End your response with a JSON block:
{
  "dealer_id": "PP-2847",
  "next_audit_date": "...",
  "audit_type": "...",
  "days_until_audit": <number>,
  "required_docs": ["..."],
  "absent_unit_policy": "...",
  "status": "AUDIT_INFO_DELIVERED"
}`,
  },

  "human-handoff": {
    label:       "Human Handoff — Large Curtailment Request",
    description: "Pacific Powersports requests a $47,200 bulk curtailment deferral across 4 aged units — above the $25,000 autonomous approval threshold. The agent surfaces the request details, explains the policy limit, and routes to the assigned Solifi account manager with full context pre-populated.",
    badge:       "Human Gate",
    completeMsg: "Curtailment deferral request routed to human reviewer. Account manager notified.",
    prompt: `You are DEH-CONV-001, the Solifi Dealer Experience Agent.

Dealer: Pacific Powersports (dealer_id: "PP-2847")
Finance Manager: Jordan Reeves

Jordan says: "We've got 4 units that have been sitting longer than expected — snowmobiles, seasonal demand issue. I want to request a 30-day curtailment deferral on all of them. The total balance on those 4 is around $47,200. Can you just push that through?"

Your task:
1. Call get_floorplan_status with dealer_id "PP-2847" to identify the 4 aged units and confirm their balances.
2. Call search_dealer_policy_kb with query "curtailment deferral approval threshold" and category "floorplan" to retrieve the policy.
3. Determine that $47,200 exceeds the autonomous approval threshold (policy states $25,000 limit for automated deferrals).
4. Clearly explain to Jordan: what you found, why this requires human review, who will handle it, and expected response time.
5. Summarise the pre-populated context you are passing to the account manager.

End your response with a JSON block:
{
  "dealer_id": "PP-2847",
  "request_type": "curtailment_deferral",
  "requested_amount": 47200,
  "autonomous_limit": 25000,
  "units_in_scope": <count>,
  "requires_human_review": true,
  "routed_to": "Solifi Account Manager",
  "reason": "Request exceeds autonomous approval threshold of $25,000",
  "estimated_response": "1 business day",
  "status": "HUMAN_REVIEW_REQUIRED"
}`,
  },
};
