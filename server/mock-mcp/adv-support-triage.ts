import { Router, type Request, type Response } from "express";
import { getAdvScenario } from "../advantive-support-shared-defs";

const router = Router();

function getScenarioData() {
  const s = getAdvScenario();

  if (s === "B") return {
    query: {
      id: "AIVA-Q-2026-04-17-1142", channel: "portal",
      received_at: new Date().toISOString(),
      text: "Our InfinityQS SPC alarm email notifications have stopped sending after the v9.3 upgrade this morning. The alarm configuration panel shows all 12 alarms as enabled but no emails are going out to the shop floor supervisors.",
      customer: { account_id: "ACC-00892", company: "Meridian Manufacturing LLC", contact: "David Park", contact_email: "d.park@meridianmfg.com", account_manager: "Sarah Chen" },
    },
    intent: {
      primary_intent: "configuration_issue", primary_confidence: 0.93,
      secondary_intent: "how_to", secondary_confidence: 0.52,
      intent_signals: ["alarm configuration present but not firing", "version-specific trigger: 'after the v9.3 upgrade'", "monitoring degraded — not production-blocked", "no compliance deadline"],
      urgency_level: "MEDIUM", production_impact: false, compliance_flag: false,
    },
    product: {
      product_id: "INFINITYQS", product_name: "InfinityQS SPC Pro", product_line: "Quality Management",
      version: "9.3.0", version_released: "2026-04-10", days_since_release: 7,
      component: "SPC Alarm Engine", sub_component: "SMTP Notification Dispatcher",
      detection_signals: ["explicit mention: 'InfinityQS'", "alarm terminology: InfinityQS-specific", "version: 'v9.3 upgrade'"],
      account_product_tier: "Professional — Standard License",
    },
    customer: {
      account_id: "ACC-00892", company: "Meridian Manufacturing LLC", tier: "Professional",
      contract_value_usd: 62000, contract_type: "Professional Suite",
      sla_response_target_hours: 8, sla_resolution_target_hours: 48,
      account_manager: "Sarah Chen", am_email: "s.chen@advantive.com",
      priority_flag: false, active_products: ["InfinityQS SPC Pro"],
      support_cases_ytd: 1, avg_csat_ytd: 4.7, renewal_date: "2027-02-15",
    },
    routing: {
      primary_route: "KNOWLEDGE_RESOLUTION_AGENT", agent_code: "SUP-002",
      routing_rationale: ["Intent: configuration_issue (0.93) → KB resolution path", "Professional tier → KB attempt mandatory", "No compliance flag → standard routing", "No production blocking → MEDIUM priority"],
      urgency_override: { applied: false, reason: "", sla_target_hours: 8 },
    },
  };

  if (s === "C") return {
    query: {
      id: "AIVA-Q-2026-04-17-0614", channel: "portal",
      received_at: new Date().toISOString(),
      text: "Our ParityFactory data synchronization with our FDA-validated batch record system has failed during an active 21 CFR Part 11 validation window. Batch records BNX-2026-0417-LOT089 through LOT094 are missing from the validated repository. FDA auditors are on-site and will begin the inspection in 4 hours.",
      customer: { account_id: "ACC-01234", company: "BioNexus Pharma Inc.", contact: "Rachel Kim", contact_email: "r.kim@bionexuspharma.com", account_manager: "Tyler Brooks" },
    },
    intent: {
      primary_intent: "compliance_critical", primary_confidence: 0.99,
      secondary_intent: "technical_troubleshooting", secondary_confidence: 0.88,
      intent_signals: ["FDA 21 CFR Part 11 validation window explicitly mentioned", "Missing batch records — regulatory data integrity risk", "FDA auditors on-site in 4 hours", "ParityFactory data sync failure"],
      urgency_level: "REGULATORY-CRITICAL", production_impact: true, compliance_flag: true, regulatory_hold_required: true,
    },
    product: {
      product_id: "PARITYFACTORY", product_name: "ParityFactory", product_line: "Regulated Manufacturing",
      version: "8.2.1", version_released: "2026-01-15", days_since_release: 92,
      component: "Data Sync Engine", sub_component: "FDA-Validated Repository Connector",
      detection_signals: ["explicit mention: 'ParityFactory'", "FDA 21 CFR Part 11 — regulatory context", "batch record terminology"],
      account_product_tier: "Enterprise — Regulated Manufacturing Suite",
    },
    customer: {
      account_id: "ACC-01234", company: "BioNexus Pharma Inc.", tier: "Enterprise",
      contract_value_usd: 520000, contract_type: "Enterprise Regulated Manufacturing + Premium Support + Compliance SLA",
      sla_response_target_hours: 1, sla_resolution_target_hours: 4,
      account_manager: "Tyler Brooks", am_email: "t.brooks@advantive.com",
      priority_flag: true, active_products: ["ParityFactory", "Advantzware"],
      support_cases_ytd: 2, avg_csat_ytd: 4.9, renewal_date: "2026-10-01",
    },
    routing: {
      primary_route: "DIAGNOSTIC_REASONING_AGENT", agent_code: "SUP-003",
      routing_rationale: ["Intent: compliance_critical (0.99) → regulatory escalation path", "FDA 21 CFR Part 11 active validation window → legal hold protocol", "Enterprise + Compliance SLA → Diagnostic mandatory", "FDA auditors on-site in 4 hours → max urgency override", "Missing batch records → data integrity requires log analysis"],
      urgency_override: { applied: true, reason: "FDA audit window <4 hours — regulatory emergency", sla_target_hours: 1 },
      regulatory_protocol: { activated: true, legal_hold: true, legal_team_cc: "compliance@advantive.com" },
    },
  };

  // Scenario A (default)
  return {
    query: {
      id: "AIVA-Q-2026-04-17-0831", channel: "portal",
      received_at: new Date().toISOString(),
      text: "Our InfinityQS SPC charts stopped updating this morning after we applied the v9.3 patch. The 'Xbar-R' chart type is returning SQL timeout errors — error code IQS-SQL-TMO-7891. Our production QC team cannot monitor any of our 47 control charts. This is completely blocking our ISO 9001 audit scheduled for tomorrow morning at 09:00.",
      customer: { account_id: "ACC-00741", company: "Cascade Polymers Inc.", contact: "Priya Nair", contact_email: "p.nair@cascadepolymers.com", account_manager: "James Whitfield" },
    },
    intent: {
      primary_intent: "technical_troubleshooting", primary_confidence: 0.97,
      secondary_intent: "bug_report", secondary_confidence: 0.61,
      intent_signals: ["error code present: IQS-SQL-TMO-7891", "version-specific trigger: 'after we applied the v9.3 patch'", "production impact: '47 control charts blocked'", "compliance deadline: 'ISO 9001 audit tomorrow morning'"],
      urgency_level: "CRITICAL", production_impact: true, compliance_flag: true,
    },
    product: {
      product_id: "INFINITYQS", product_name: "InfinityQS SPC Pro", product_line: "Quality Management",
      version: "9.3.0", version_released: "2026-04-10", days_since_release: 7,
      component: "SPC Chart Engine", sub_component: "SQL Data Adapter",
      detection_signals: ["explicit mention: 'InfinityQS'", "chart type: 'Xbar-R' — InfinityQS-specific", "error code prefix: 'IQS'", "version: 'v9.3 patch'"],
      account_product_tier: "Enterprise — Full Suite License",
    },
    customer: {
      account_id: "ACC-00741", company: "Cascade Polymers Inc.", tier: "Enterprise",
      contract_value_usd: 248000, contract_type: "Enterprise Full Suite + Premium Support",
      sla_response_target_hours: 4, sla_resolution_target_hours: 24,
      account_manager: "James Whitfield", am_email: "j.whitfield@advantive.com", am_phone: "+1 612-555-0182",
      priority_flag: true, active_products: ["InfinityQS SPC Pro", "ParityFactory"],
      support_cases_ytd: 3, avg_csat_ytd: 4.6, renewal_date: "2026-12-01",
    },
    routing: {
      primary_route: "DIAGNOSTIC_REASONING_AGENT", agent_code: "SUP-003",
      routing_rationale: ["Intent: technical_troubleshooting (0.97) → diagnostic path triggered", "Customer Tier: Enterprise → diagnostic mandatory", "Compliance flag: ISO 9001 audit tomorrow → URGENT", "Production impact: 47 control charts blocked", "Error code IQS-SQL-TMO-7891: requires log analysis"],
      kb_pre_check: { run: true, agent_code: "SUP-002", purpose: "parallel KB check" },
      urgency_override: { applied: true, reason: "ISO 9001 audit deadline < 18 hours", sla_target_hours: 2 },
    },
  };
}

router.get("/inbound-query", (_req: Request, res: Response) => {
  const d = getScenarioData();
  res.json({ query: d.query, aiva_session_id: `AIVA-SESSION-${Date.now()}`, priority_flag: d.customer.priority_flag, received_ms: Date.now() });
});

router.post("/classify-intent", (_req: Request, res: Response) => {
  const d = getScenarioData();
  res.json({ classification: d.intent, classified_at: new Date().toISOString() });
});

router.post("/detect-product", (_req: Request, res: Response) => {
  const d = getScenarioData();
  res.json({ product: d.product, detected_at: new Date().toISOString() });
});

router.get("/customer-tier", (_req: Request, res: Response) => {
  const d = getScenarioData();
  res.json({ customer: d.customer, retrieved_at: new Date().toISOString() });
});

router.post("/route-to-agent", (_req: Request, res: Response) => {
  const d = getScenarioData();
  res.json({ routing_decision: d.routing, routed_at: new Date().toISOString() });
});

export default router;
