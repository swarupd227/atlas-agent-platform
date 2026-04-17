import { Router, type Request, type Response } from "express";

const router = Router();

const QUERY = {
  id:          "AIVA-Q-2026-04-17-0831",
  channel:     "portal",
  received_at: new Date().toISOString(),
  text:        "Our InfinityQS SPC charts stopped updating this morning after we applied the v9.3 patch. The 'Xbar-R' chart type is returning SQL timeout errors — error code IQS-SQL-TMO-7891. Our production QC team cannot monitor any of our 47 control charts. This is completely blocking our ISO 9001 audit scheduled for tomorrow morning at 09:00.",
  customer: {
    account_id:      "ACC-00741",
    company:         "Cascade Polymers Inc.",
    contact:         "Priya Nair",
    contact_email:   "p.nair@cascadepolymers.com",
    account_manager: "James Whitfield",
  },
};

// GET /inbound-query
router.get("/inbound-query", (_req: Request, res: Response) => {
  res.json({
    query: QUERY,
    aiva_session_id: "AIVA-SESSION-20260417-083112",
    priority_flag:   true,
    received_ms:     Date.now(),
  });
});

// POST /classify-intent
router.post("/classify-intent", (_req: Request, res: Response) => {
  res.json({
    classification: {
      primary_intent:    "technical_troubleshooting",
      primary_confidence: 0.97,
      secondary_intent:  "bug_report",
      secondary_confidence: 0.61,
      intent_signals: [
        "error code present: IQS-SQL-TMO-7891",
        "version-specific trigger: 'after we applied the v9.3 patch'",
        "production impact: '47 control charts blocked'",
        "compliance deadline: 'ISO 9001 audit tomorrow morning'",
      ],
      urgency_level: "CRITICAL",
      production_impact: true,
      compliance_flag:   true,
    },
    classified_at: new Date().toISOString(),
  });
});

// POST /detect-product
router.post("/detect-product", (_req: Request, res: Response) => {
  res.json({
    product: {
      product_id:       "INFINITYQS",
      product_name:     "InfinityQS SPC Pro",
      product_line:     "Quality Management",
      version:          "9.3.0",
      version_released: "2026-04-10",
      days_since_release: 7,
      component:        "SPC Chart Engine",
      sub_component:    "SQL Data Adapter",
      detection_signals: [
        "explicit mention: 'InfinityQS'",
        "chart type: 'Xbar-R' — InfinityQS-specific terminology",
        "error code prefix: 'IQS' — InfinityQS error namespace",
        "version: 'v9.3 patch'",
      ],
      account_product_tier: "Enterprise — Full Suite License",
    },
    detected_at: new Date().toISOString(),
  });
});

// GET /customer-tier
router.get("/customer-tier", (_req: Request, res: Response) => {
  res.json({
    customer: {
      account_id:             "ACC-00741",
      company:                "Cascade Polymers Inc.",
      tier:                   "Enterprise",
      contract_value_usd:     248000,
      contract_type:          "Enterprise Full Suite + Premium Support",
      sla_response_target_hours: 4,
      sla_resolution_target_hours: 24,
      account_manager:        "James Whitfield",
      am_email:               "j.whitfield@advantive.com",
      am_phone:               "+1 612-555-0182",
      priority_flag:          true,
      active_products:        ["InfinityQS SPC Pro", "ParityFactory"],
      support_cases_ytd:      3,
      avg_csat_ytd:           4.6,
      renewal_date:           "2026-12-01",
    },
    retrieved_at: new Date().toISOString(),
  });
});

// POST /route-to-agent
router.post("/route-to-agent", (_req: Request, res: Response) => {
  res.json({
    routing_decision: {
      primary_route:     "DIAGNOSTIC_REASONING_AGENT",
      agent_code:        "SUP-003",
      routing_rationale: [
        "Intent: technical_troubleshooting (confidence 0.97) → diagnostic path triggered",
        "Customer Tier: Enterprise → diagnostic agent mandatory per tier rules",
        "Compliance flag: ISO 9001 audit tomorrow → URGENT priority applied",
        "Production impact: 47 control charts blocked → escalation likely",
        "Error code IQS-SQL-TMO-7891: known to require log analysis",
      ],
      kb_pre_check: {
        run:        true,
        agent_code: "SUP-002",
        purpose:    "parallel KB check to confirm whether v9.3 issue is documented",
      },
      urgency_override: {
        applied: true,
        reason:  "ISO 9001 audit deadline < 18 hours from query receipt",
        sla_target_hours: 2,
      },
      context_transferred: ["query", "classification", "product_version", "customer_tier", "compliance_flag"],
    },
    routed_at: new Date().toISOString(),
  });
});

export default router;
