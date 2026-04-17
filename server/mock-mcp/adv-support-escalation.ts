import { Router, type Request, type Response } from "express";
import { getAdvScenario } from "../advantive-support-shared-defs";

const router = Router();

router.post("/build-package", (_req: Request, res: Response) => {
  const s = getAdvScenario();
  if (s === "C") {
    res.json({
      escalation_package: {
        package_id: "ESC-REG-2026-04-17-0614", created_at: new Date().toISOString(),
        priority: "P0 — REGULATORY EMERGENCY",
        regulatory_hold: true, legal_team_cc: "compliance@advantive.com",
        customer: { company: "BioNexus Pharma Inc.", account_id: "ACC-01234", tier: "Enterprise", contact: "Rachel Kim", account_manager: "Tyler Brooks" },
        case_summary: {
          title: "ParityFactory v8.2.1 — FDA 21 CFR Part 11 Sync Failure — LOT089-094 Missing — FDA Audit in 4 Hours",
          product: "ParityFactory v8.2.1",
          error_code: "PF-SYNC-DAEMON-EXIT-0",
          impact: "6 batch records (LOT089-094) missing from FDA-validated repository — data integrity event",
          deadline: "FDA auditors on-site 2026-04-17 10:00 — 4 hours from incident",
        },
        pipeline_trace: {
          "SUP-001": { action: "Classified as compliance_critical (0.99), ParityFactory v8.2.1, Enterprise — mandatory regulatory path", completed: true },
          "SUP-002": { action: "KB search confidence 0.52 — regulatory protocol mandates T2 regardless. Route to Diagnostic.", completed: true },
          "SUP-003": { action: "Root cause: PF-BUG-821-0033 — sync daemon not configured for auto-restart after DB maintenance. 5-step recovery path built. Legal hold mandated.", completed: true, resolution_path_available: true },
        },
        resolution_path_attached: true, resolution_path_summary: "5 steps, 20 mins, compliance officer required, LOT089-094 re-sync, FDA repository validation.",
        escalation_rationale: "21 CFR Part 11 active validation window with FDA auditors on-site. Autonomous recovery not permitted. Legal hold placed on all sync logs. T2 and compliance team must co-supervise all recovery steps.",
        recommended_specialist: "ParityFactory Compliance & Integration Team — Level 2",
        t2_routing_code: "PF-COMP-T2-REGULATORY",
      },
      package_built_at: new Date().toISOString(),
    });
    return;
  }
  // Scenario A
  res.json({
    escalation_package: {
      package_id: "ESC-PKG-2026-04-17-0831", created_at: new Date().toISOString(),
      priority: "P1 — CRITICAL",
      customer: { company: "Cascade Polymers Inc.", account_id: "ACC-00741", tier: "Enterprise", contact: "Priya Nair", account_manager: "James Whitfield" },
      case_summary: {
        title: "InfinityQS v9.3 — SPC Chart SQL Timeout (IQS-SQL-TMO-7891) — ISO Audit at Risk",
        product: "InfinityQS SPC Pro v9.3.0", error_code: "IQS-SQL-TMO-7891",
        impact: "47 Xbar-R control charts non-functional — QC team monitoring blocked",
        deadline: "ISO 9001 audit 2026-04-18 09:00 — 26 hours from incident",
      },
      pipeline_trace: {
        "SUP-001": { action: "Classified technical_troubleshooting (0.97), InfinityQS v9.3, Enterprise — routed to Diagnostic", completed: true },
        "SUP-002": { action: "KB confidence 0.58 (below 0.65). Additional search 0.61 — still below. 1 prior v9.3 case was escalated.", completed: true },
        "SUP-003": { action: "Root cause: IQS-BUG-930-0042 — migration script skipped. 5-step resolution path built. T2 standby required.", completed: true, resolution_path_available: true },
      },
      resolution_path_attached: true, resolution_path_summary: "5 steps, 15 mins, no remote access. SQL permission grant + manual migration script.",
      escalation_rationale: "Enterprise tier + ISO 9001 audit deadline within 26 hours mandates T2 standby oversight.",
      recommended_specialist: "InfinityQS Database & Schema Team — Level 2",
      t2_routing_code: "IQS-DB-T2-URGENT",
    },
    package_built_at: new Date().toISOString(),
  });
});

router.post("/create-sf-case", (_req: Request, res: Response) => {
  const s = getAdvScenario();
  if (s === "C") {
    res.json({
      salesforce_case: {
        case_id: "SF-CASE-2026-078034", case_number: "00078034",
        case_url: "https://advantive.lightning.force.com/lightning/r/Case/00078034/view",
        status: "New", priority: "Critical — Regulatory Emergency",
        origin: "Atlas AI-First T1 Support",
        account_name: "BioNexus Pharma Inc.", contact_name: "Rachel Kim",
        subject: "ParityFactory v8.2.1 — FDA 21 CFR Part 11 Sync Failure — LOT089-094 Missing — FDA Audit In 4H",
        product: "ParityFactory", version: "8.2.1",
        error_code: "PF-SYNC-DAEMON-EXIT-0",
        description_summary: "Sync daemon exited after DB maintenance. Batch records LOT089-094 not committed to FDA-validated repository. FDA auditors on-site in 4 hours. Legal hold active. Recovery requires compliance supervision.",
        regulatory_tags: ["21-CFR-PART-11", "FDA-AUDIT-ACTIVE", "LEGAL-HOLD", "DATA-INTEGRITY-EVENT"],
        t1_steps_taken: ["SUP-001: compliance_critical, ParityFactory v8.2.1 — regulatory path", "SUP-002: KB 0.52 — regulatory protocol mandates T2", "SUP-003: PF-BUG-821-0033 confirmed. Recovery path built under compliance protocol."],
        assigned_to: "ParityFactory Compliance & Integration Team",
        assigned_queue: "PF-COMP-T2-REGULATORY",
        sla_target: "Response within 30 minutes (Compliance SLA + P0 override)",
        created_at: new Date().toISOString(),
        auto_populated_fields: 21,
        legal_hold_activated: true, legal_cc: "compliance@advantive.com",
      },
      created_at: new Date().toISOString(),
    });
    return;
  }
  // Scenario A
  res.json({
    salesforce_case: {
      case_id: "SF-CASE-2026-074821", case_number: "00074821",
      case_url: "https://advantive.lightning.force.com/lightning/r/Case/00074821/view",
      status: "New", priority: "Critical",
      origin: "Atlas AI-First T1 Support",
      account_name: "Cascade Polymers Inc.", contact_name: "Priya Nair",
      subject: "InfinityQS v9.3 — SPC Xbar-R SQL Timeout IQS-SQL-TMO-7891 — ISO Audit at Risk",
      product: "InfinityQS SPC Pro", version: "9.3.0",
      error_code: "IQS-SQL-TMO-7891",
      description_summary: "Post-v9.3-upgrade SQL timeout on all Xbar-R charts. Root cause: IQS-MIGRATE-930.sql silently skipped. ISO 9001 audit in 26 hours. Resolution path provided: 5-step, 15-min fix.",
      t1_steps_taken: ["SUP-001: technical_troubleshooting, InfinityQS v9.3 — Diagnostic", "SUP-002: KB 0.58 — below threshold. Prior v9.3 case escalated.", "SUP-003: IQS-BUG-930-0042 confirmed. 5-step resolution path built."],
      assigned_to: "InfinityQS Database & Schema Team",
      assigned_queue: "IQS-DB-T2-URGENT",
      sla_target: "Response within 2 hours (Enterprise + P1 override)",
      created_at: new Date().toISOString(),
      auto_populated_fields: 18,
    },
    created_at: new Date().toISOString(),
  });
});

router.post("/recommend-t2", (_req: Request, res: Response) => {
  const s = getAdvScenario();
  if (s === "C") {
    res.json({
      t2_recommendation: {
        primary_team: "ParityFactory Compliance & Integration Team",
        team_code: "PF-COMP-T2",
        expertise_match: "ParityFactory sync engine, FDA 21 CFR Part 11, regulated manufacturing",
        queue_depth: 1, queue_depth_status: "Low — P0 case will be prioritized immediately",
        estimated_response_hours: 0.5,
        named_specialist: { name: "Sofia Rodriguez", title: "ParityFactory Compliance Specialist — T2", email: "s.rodriguez@advantive.com", availability: "Available now — P0 paged" },
        routing_rationale: ["ParityFactory FDA compliance: PF-COMP-T2 is primary regulated manufacturing team", "PF-BUG-821-0033 ownership: assigned to PF-COMP-T2", "Sofia Rodriguez resolved TKT-2025-14892 (only prior similar case)", "P0 regulatory emergency — immediate response required"],
        compliance_officer_required: true, legal_hold_active: true,
        sla_override: "Enterprise + Compliance SLA + FDA audit on-site → P0 immediate response",
      },
      recommended_at: new Date().toISOString(),
    });
    return;
  }
  // Scenario A
  res.json({
    t2_recommendation: {
      primary_team: "InfinityQS Database & Schema Team",
      team_code: "IQS-DB-T2",
      expertise_match: "SQL Data Adapter, Schema Migration, v9.3 upgrade issues",
      queue_depth: 3, queue_depth_status: "Low — fast response expected",
      estimated_response_hours: 1.5,
      named_specialist: { name: "Marcus Chen", title: "InfinityQS Tier 2 — Database Specialist", email: "m.chen@advantive.com", availability: "Available now" },
      routing_rationale: ["IQS-BUG-930-0042 ownership: assigned to IQS-DB-T2", "Marcus Chen resolved 2 of 2 prior IQS-BUG-930-0042 cases", "Queue depth low — P1 case within 90 minutes"],
      sla_override: "Enterprise + ISO audit deadline → P1 treatment",
    },
    recommended_at: new Date().toISOString(),
  });
});

router.post("/notify-am", (_req: Request, res: Response) => {
  const s = getAdvScenario();
  if (s === "C") {
    res.json({
      am_notification: {
        recipient: "Tyler Brooks", email: "t.brooks@advantive.com",
        channel: "Email + Slack + Phone",
        sent_at: new Date().toISOString(),
        subject: "🔴 P0 REGULATORY: BioNexus Pharma — ParityFactory FDA Sync Failure | Auditors On-Site 10:00",
        message_preview: "Tyler — Atlas has opened SF Case #00078034 for BioNexus Pharma (Rachel Kim). ParityFactory sync daemon failure during FDA 21 CFR Part 11 validation window. Batch records LOT089-094 missing. FDA auditors arrive at 10:00 (4 hours). Legal hold active. Sofia Rodriguez assigned, P0 response in 30 min.",
        notification_status: "delivered",
        legal_cc_sent: true, legal_cc_address: "compliance@advantive.com",
        regulatory_advisory_filed: "FDA-ADV-2026-04-17-001",
      },
      notified_at: new Date().toISOString(),
    });
    return;
  }
  // Scenario A
  res.json({
    am_notification: {
      recipient: "James Whitfield", email: "j.whitfield@advantive.com",
      channel: "email + Slack", sent_at: new Date().toISOString(),
      subject: "🔴 P1 Escalation: Cascade Polymers — InfinityQS Outage | ISO Audit Tomorrow",
      message_preview: "Hi James — Atlas has opened Salesforce Case #00074821 for Cascade Polymers (Priya Nair). InfinityQS v9.3 SPC chart outage affecting 47 control charts. ISO 9001 audit is tomorrow at 09:00. T2 specialist Marcus Chen assigned, response within 90 minutes.",
      notification_status: "delivered",
    },
    notified_at: new Date().toISOString(),
  });
});

router.post("/log-audit", (_req: Request, res: Response) => {
  const s = getAdvScenario();
  const baseAudit = {
    tamper_proof: true,
    audit_hash: "sha256:f4a2b1c9e8d7…",
  };
  if (s === "C") {
    res.json({
      audit_log: {
        ...baseAudit,
        audit_id: "AUDIT-REG-2026-04-17-061244",
        case_id: "SF-CASE-2026-078034",
        session_id: "AIVA-SESSION-20260417-061244",
        pipeline_events: [
          { agent: "SUP-001", action: "intent_classified", result: "compliance_critical (0.99)", timestamp: new Date(Date.now() - 240000).toISOString() },
          { agent: "SUP-001", action: "product_detected",  result: "ParityFactory v8.2.1",       timestamp: new Date(Date.now() - 230000).toISOString() },
          { agent: "SUP-001", action: "tier_read",         result: "Enterprise + Compliance SLA", timestamp: new Date(Date.now() - 220000).toISOString() },
          { agent: "SUP-001", action: "routing_decision",  result: "SUP-003 via SUP-002 check",   timestamp: new Date(Date.now() - 210000).toISOString() },
          { agent: "SUP-002", action: "kb_search",         result: "4 results, max relevance 0.63", timestamp: new Date(Date.now() - 180000).toISOString() },
          { agent: "SUP-002", action: "confidence_scored", result: "0.52 — below 0.65 + regulatory protocol", timestamp: new Date(Date.now() - 160000).toISOString() },
          { agent: "SUP-003", action: "error_ingested",    result: "PF-SYNC-DAEMON-EXIT-0 normalized", timestamp: new Date(Date.now() - 120000).toISOString() },
          { agent: "SUP-003", action: "logs_queried",      result: "Root cause: PF-BUG-821-0033", timestamp: new Date(Date.now() - 100000).toISOString() },
          { agent: "SUP-003", action: "resolution_built",  result: "5-step recovery, compliance supervised", timestamp: new Date(Date.now() - 80000).toISOString() },
          { agent: "SUP-003", action: "escalation_assessed", result: "P0 Regulatory Mandatory — legal hold", timestamp: new Date(Date.now() - 60000).toISOString() },
          { agent: "SUP-004", action: "package_built",     result: "ESC-REG-2026-04-17-0614",   timestamp: new Date(Date.now() - 40000).toISOString() },
          { agent: "SUP-004", action: "salesforce_case",   result: "SF-CASE-2026-078034 created", timestamp: new Date(Date.now() - 30000).toISOString() },
          { agent: "SUP-004", action: "t2_routed",         result: "Sofia Rodriguez / PF-COMP-T2-REGULATORY", timestamp: new Date(Date.now() - 20000).toISOString() },
          { agent: "SUP-004", action: "am_notified",       result: "Tyler Brooks + compliance@advantive.com — delivered", timestamp: new Date(Date.now() - 10000).toISOString() },
          { agent: "SUP-004", action: "legal_hold_filed",  result: "FDA-ADV-2026-04-17-001 — regulatory advisory filed", timestamp: new Date().toISOString() },
        ],
        policies_applied: ["Confidence Gate Policy: 0.52 → diagnostic route (PASS)", "Regulatory Hold Policy: 21 CFR Part 11 active → legal hold (PASS)", "Enterprise SLA: 1h response + P0 override applied (PASS)"],
        compliance_tags: ["21-CFR-PART-11-FLAG", "FDA-AUDIT-ACTIVE", "LEGAL-HOLD", "ENTERPRISE-SLA", "P0-REGULATORY"],
        regulatory_advisory: "FDA-ADV-2026-04-17-001",
      },
      logged_at: new Date().toISOString(),
    });
    return;
  }
  // Scenario A
  res.json({
    audit_log: {
      ...baseAudit,
      audit_id: "AUDIT-2026-04-17-083112",
      case_id: "SF-CASE-2026-074821",
      session_id: "AIVA-SESSION-20260417-083112",
      pipeline_events: [
        { agent: "SUP-001", action: "intent_classified", result: "technical_troubleshooting (0.97)", timestamp: new Date(Date.now() - 240000).toISOString() },
        { agent: "SUP-001", action: "product_detected",  result: "InfinityQS v9.3",                  timestamp: new Date(Date.now() - 230000).toISOString() },
        { agent: "SUP-001", action: "tier_read",         result: "Enterprise",                        timestamp: new Date(Date.now() - 220000).toISOString() },
        { agent: "SUP-001", action: "routing_decision",  result: "SUP-003 via SUP-002 check",         timestamp: new Date(Date.now() - 210000).toISOString() },
        { agent: "SUP-002", action: "kb_search",         result: "5 results, max relevance 0.74",     timestamp: new Date(Date.now() - 180000).toISOString() },
        { agent: "SUP-002", action: "confidence_scored", result: "0.58 — below threshold",            timestamp: new Date(Date.now() - 160000).toISOString() },
        { agent: "SUP-002", action: "additional_search", result: "0.61 — still below threshold",      timestamp: new Date(Date.now() - 140000).toISOString() },
        { agent: "SUP-003", action: "error_ingested",    result: "IQS-SQL-TMO-7891 normalized",       timestamp: new Date(Date.now() - 120000).toISOString() },
        { agent: "SUP-003", action: "logs_queried",      result: "Root cause: IQS-BUG-930-0042",      timestamp: new Date(Date.now() - 100000).toISOString() },
        { agent: "SUP-003", action: "resolution_built",  result: "5-step path, 15 mins",              timestamp: new Date(Date.now() - 80000).toISOString() },
        { agent: "SUP-003", action: "escalation_assessed", result: "Escalate — T2 standby",          timestamp: new Date(Date.now() - 60000).toISOString() },
        { agent: "SUP-004", action: "package_built",     result: "ESC-PKG-2026-04-17-0831",           timestamp: new Date(Date.now() - 40000).toISOString() },
        { agent: "SUP-004", action: "salesforce_case",   result: "SF-CASE-2026-074821 created",       timestamp: new Date(Date.now() - 30000).toISOString() },
        { agent: "SUP-004", action: "t2_routed",         result: "Marcus Chen / IQS-DB-T2-URGENT",    timestamp: new Date(Date.now() - 20000).toISOString() },
        { agent: "SUP-004", action: "am_notified",       result: "James Whitfield — delivered",       timestamp: new Date(Date.now() - 10000).toISOString() },
      ],
      policies_applied: ["Confidence Gate Policy: 0.58 → diagnostic route (PASS)", "Customer Privacy Policy: PII redacted (PASS)", "Enterprise Tier SLA: 4h response override (PASS)"],
      compliance_tags: ["ISO-9001-AUDIT-FLAG", "ENTERPRISE-SLA", "P1-ESCALATION"],
    },
    logged_at: new Date().toISOString(),
  });
});

export default router;
