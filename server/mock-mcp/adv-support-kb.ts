import { Router, type Request, type Response } from "express";
import { getAdvScenario } from "../advantive-support-shared-defs";

const router = Router();

router.post("/search-docs", (_req: Request, res: Response) => {
  const s = getAdvScenario();

  if (s === "B") {
    res.json({
      search: {
        query_expanded: "InfinityQS SPC alarm email SMTP notification v9.3",
        product_filter: "INFINITYQS", version_filter: "9.x", results_returned: 5,
        top_results: [
          { doc_id: "IQS-KB-9302-ALM", title: "InfinityQS v9.3 Alarm & Notification Configuration Guide", relevance: 0.91, chunk_excerpt: "InfinityQS v9.3 introduces a refactored SMTP alarm dispatcher. Customers upgrading from v9.2 must re-enter SMTP credentials under Admin → Alarm Settings → Email Server Configuration, as credentials are not migrated automatically.", version_match: "9.3.0", citation: "InfinityQS v9.3 Alarm Guide, published 2026-04-10", critical_note: "v9.3 credential migration break — directly applicable" },
          { doc_id: "IQS-KB-9201-ALM", title: "InfinityQS v9.2 Alarm Email Setup Reference", relevance: 0.84, chunk_excerpt: "SMTP configuration requires valid host, port, and authenticated credentials. Test the connection using Admin → Alarm Settings → Test Email. Common failure mode: SMTP password not persisted after service restart.", version_match: "9.2.x", citation: "InfinityQS KB Article #9201" },
          { doc_id: "IQS-RN-930",      title: "InfinityQS v9.3 Release Notes", relevance: 0.79, chunk_excerpt: "v9.3 alarm engine: SMTP credentials are now stored in the encrypted credential vault. Legacy plaintext passwords from v9.2 are not automatically migrated. See KB IQS-KB-9302-ALM for migration steps.", version_match: "9.3.0", citation: "InfinityQS v9.3 Release Notes, 2026-04-10" },
          { doc_id: "IQS-KB-9300-UPG", title: "InfinityQS v9.3 Upgrade Checklist", relevance: 0.76, chunk_excerpt: "Post-upgrade: verify SMTP alarm configuration under Admin → Alarm Settings → Email Server. Re-enter credentials if alarm emails are not dispatching.", version_match: "9.3.0", citation: "InfinityQS v9.3 Upgrade Checklist, 2026-04-10" },
          { doc_id: "IQS-KB-8821-ALM", title: "Troubleshooting InfinityQS Alarm Notifications", relevance: 0.71, chunk_excerpt: "Alarm emails not sending: 1) Check SMTP connectivity (Admin → Test Email), 2) Verify service account has Send As permission on mail server, 3) Check Windows Event Log for SMTPDispatcher errors.", version_match: "8.x–9.x", citation: "InfinityQS KB Article #8821" },
        ],
      },
      searched_at: new Date().toISOString(),
    });
    return;
  }

  if (s === "C") {
    res.json({
      search: {
        query_expanded: "ParityFactory FDA 21 CFR Part 11 data sync batch record failure",
        product_filter: "PARITYFACTORY", version_filter: "8.x", results_returned: 4,
        top_results: [
          { doc_id: "PF-KB-0821-SYNC", title: "ParityFactory v8.2 Data Sync Engine Reference", relevance: 0.63, chunk_excerpt: "The ParityFactory sync daemon runs as a Windows service. If the daemon exits unexpectedly, batch records in the active sync window may not be written to the validated repository. Manual recovery requires re-triggering sync from the administration console.", version_match: "8.2.x", citation: "ParityFactory KB Article #PF-0821, updated 2026-02-08" },
          { doc_id: "PF-KB-FDA-CFR11", title: "ParityFactory 21 CFR Part 11 Compliance Guide", relevance: 0.58, chunk_excerpt: "Under 21 CFR Part 11 validation, any interruption to the batch record sync must be documented and the audit trail preserved. Consult your compliance officer before re-running sync operations in an active validation window.", version_match: "8.x–9.x", citation: "ParityFactory FDA Compliance Guide, v3.2" },
          { doc_id: "PF-KB-0719-DR",   title: "ParityFactory Disaster Recovery Procedures", relevance: 0.47, chunk_excerpt: "In the event of sync daemon failure during production: (1) do not restart the daemon — consult T2 first; (2) preserve all sync logs; (3) engage compliance officer for FDA data integrity assessment.", version_match: "7.x–8.x", citation: "ParityFactory KB Article #PF-0719" },
          { doc_id: "PF-RN-821",       title: "ParityFactory v8.2.1 Release Notes", relevance: 0.41, chunk_excerpt: "v8.2.1 fixes a race condition in the sync daemon that could cause silent failures when the SPC_Integration_DB connection pool was exhausted. Customers on SQL Server 2019 with >500 active batch records should apply this patch.", version_match: "8.2.1", citation: "ParityFactory v8.2.1 Release Notes, 2026-01-15" },
        ],
      },
      searched_at: new Date().toISOString(),
    });
    return;
  }

  // Scenario A
  res.json({
    search: {
      query_expanded: "InfinityQS SPC Xbar-R SQL timeout IQS-SQL-TMO-7891 v9.3",
      product_filter: "INFINITYQS", version_filter: "9.x", results_returned: 5,
      top_results: [
        { doc_id: "IQS-KB-9201-SQL", title: "InfinityQS v9.2 SQL Adapter Performance Tuning Guide", relevance: 0.74, chunk_excerpt: "SQL timeout errors in the SPC Chart Engine (error prefix IQS-SQL-TMO) are commonly caused by missing database index entries after schema migration.", version_match: "9.2.x", version_note: "Written for v9.2 — applicability to v9.3 unconfirmed", citation: "InfinityQS KB Article #9201, last updated 2026-02-14" },
        { doc_id: "IQS-KB-8944-XR",  title: "Xbar-R Chart Configuration Reference", relevance: 0.62, chunk_excerpt: "Xbar-R chart data binding requires the SPC_Measurement table to have a valid connection pool assignment.", version_match: "8.x–9.x", citation: "InfinityQS KB Article #8944, last updated 2025-11-03" },
        { doc_id: "IQS-RN-930",      title: "InfinityQS v9.3 Release Notes", relevance: 0.58, chunk_excerpt: "v9.3 introduces a refactored SQL Data Adapter. Customers upgrading from v9.2 must run the post-upgrade schema migration script IQS-MIGRATE-930.sql before starting the SPC services.", version_match: "9.3.0", citation: "InfinityQS v9.3 Release Notes, published 2026-04-10", critical_note: "Migration script reference — potentially critical" },
        { doc_id: "IQS-KB-9300-UPG", title: "InfinityQS v9.3 Upgrade Checklist", relevance: 0.55, chunk_excerpt: "Post-upgrade validation: confirm IQS-MIGRATE-930.sql completed successfully. Verify SQL service account has db_owner on SPC_Analytics database.", version_match: "9.3.0", citation: "InfinityQS v9.3 Upgrade Checklist, published 2026-04-10" },
        { doc_id: "IQS-KB-7832-ISO", title: "InfinityQS ISO 9001 Audit Preparation Guide", relevance: 0.42, chunk_excerpt: "Ensure all SPC chart history exports are accessible before audit window.", version_match: "7.x–9.x", citation: "InfinityQS KB Article #7832" },
      ],
    },
    searched_at: new Date().toISOString(),
  });
});

router.post("/query-resolutions", (_req: Request, res: Response) => {
  const s = getAdvScenario();

  if (s === "B") {
    res.json({
      resolution_search: {
        similarity_query: "InfinityQS alarm email SMTP not sending after upgrade",
        corpus_size_tickets: 18400, matches_found: 4,
        top_resolutions: [
          { ticket_id: "TKT-2025-21034", similarity: 0.91, product: "InfinityQS", version: "9.2.0", intent: "configuration_issue", issue_summary: "Alarm emails stopped after v9.2 upgrade — SMTP password not migrated", resolution_steps: ["1. Go to Admin → Alarm Settings → Email Server", "2. Re-enter SMTP password", "3. Click Test Email to verify", "4. Save configuration"], time_to_resolve_mins: 8, csat: 5.0, resolved_by: "T1 autonomous", version_note: "v9.2 fix — same root cause pattern applies to v9.3 per Release Notes" },
          { ticket_id: "TKT-2026-00108", similarity: 0.87, product: "InfinityQS", version: "9.3.0", intent: "configuration_issue", issue_summary: "v9.3 SMTP credentials not migrated — alarm emails silent", resolution_steps: ["1. Admin → Alarm Settings → Email Server Configuration", "2. Re-enter SMTP host, port, username, password", "3. Test Email button confirms delivery", "4. Restart Alarm Engine service if test passes but live alarms still fail"], time_to_resolve_mins: 12, csat: 4.9, resolved_by: "T1 autonomous", version_note: "Same version — confirmed v9.3 fix" },
          { ticket_id: "TKT-2025-18203", similarity: 0.78, product: "InfinityQS", version: "9.1.4", intent: "configuration_issue", issue_summary: "SMTP dispatcher error after service restart — credential vault issue", resolution_steps: ["1. Verify SMTP credentials in Admin settings", "2. Grant 'Log on as a service' to IQS service account", "3. Restart InfinityQS Alarm Service"], time_to_resolve_mins: 22, csat: 4.6, resolved_by: "T1 autonomous", version_note: "Older version — partial match" },
        ],
      },
      queried_at: new Date().toISOString(),
    });
    return;
  }

  if (s === "C") {
    res.json({
      resolution_search: {
        similarity_query: "ParityFactory sync daemon failure FDA batch record missing 21 CFR Part 11",
        corpus_size_tickets: 18400, matches_found: 2,
        top_resolutions: [
          { ticket_id: "TKT-2025-14892", similarity: 0.58, product: "ParityFactory", version: "8.1.3", intent: "technical_troubleshooting", issue_summary: "ParityFactory sync daemon crashed — batch records not written", resolution_steps: ["Escalated to T2 — FDA compliance team engaged"], time_to_resolve_mins: null, csat: null, resolved_by: "T2 escalation + regulatory review", version_note: "Older version — T2 engaged given FDA context" },
          { ticket_id: "TKT-2024-09341", similarity: 0.44, product: "ParityFactory", version: "7.4.2", intent: "compliance_critical", issue_summary: "FDA audit window sync failure — records held pending compliance review", resolution_steps: ["Regulatory hold placed", "Compliance officer engaged", "T2 recovered records under audit supervision"], time_to_resolve_mins: null, csat: null, resolved_by: "T2 + compliance team", version_note: "Older version — pattern similar but version gap significant" },
        ],
      },
      queried_at: new Date().toISOString(),
    });
    return;
  }

  // Scenario A
  res.json({
    resolution_search: {
      similarity_query: "InfinityQS SQL timeout SPC chart Xbar-R upgrade",
      corpus_size_tickets: 18400, matches_found: 3,
      top_resolutions: [
        { ticket_id: "TKT-2025-18847", similarity: 0.81, product: "InfinityQS", version: "9.2.1", intent: "technical_troubleshooting", issue_summary: "SQL timeout errors after v9.2 patch — missing index on SPC_Chart_Adapter", resolution_steps: ["1. Run IQS-MIGRATE-921.sql", "2. Grant db_owner to SQL service account", "3. Restart InfinityQS SPC Engine", "4. Validate Xbar-R charts"], time_to_resolve_mins: 34, csat: 4.8, resolved_by: "T1 autonomous", version_note: "v9.2 fix — may not apply directly to v9.3" },
        { ticket_id: "TKT-2025-16302", similarity: 0.71, product: "InfinityQS", version: "9.1.4", intent: "bug_report", issue_summary: "IQS-SQL-TMO-7842 timeout on chart load — connection pool exhausted", resolution_steps: ["1. Increase SQL connection pool size", "2. Restart SQL adapter service"], time_to_resolve_mins: 18, csat: 4.5, resolved_by: "T1 autonomous", version_note: "Different error code — partial match" },
        { ticket_id: "TKT-2026-00412", similarity: 0.64, product: "InfinityQS", version: "9.3.0", intent: "technical_troubleshooting", issue_summary: "IQS-SQL-TMO-7891 after v9.3 upgrade", resolution_steps: ["Escalated to T2 — root cause under investigation"], time_to_resolve_mins: null, csat: null, resolved_by: "T2 escalation", version_note: "Same error code + version — was escalated", critical_note: "ONLY prior v9.3 case with this exact error — escalated to T2" },
      ],
    },
    queried_at: new Date().toISOString(),
  });
});

router.post("/generate-answer", (_req: Request, res: Response) => {
  const s = getAdvScenario();

  if (s === "B") {
    res.json({
      generated_answer: {
        answer_text: "InfinityQS v9.3 does not automatically migrate SMTP credentials from v9.2 — they are stored in a new encrypted credential vault. Alarm email notifications will be silent until credentials are re-entered. Resolution: navigate to Admin → Alarm Settings → Email Server Configuration, re-enter the SMTP host, port, username, and password, then click Test Email to confirm. Two resolved v9.3 cases confirm this is the root cause.",
        citations: ["InfinityQS v9.3 Release Notes (2026-04-10)", "InfinityQS v9.3 Alarm Configuration Guide (2026-04-10)", "TKT-2026-00108: v9.3 SMTP credential migration — T1 resolved in 12 min"],
        confidence_preliminary: 0.89,
        coverage_gaps: [],
      },
      generated_at: new Date().toISOString(),
    });
    return;
  }

  if (s === "C") {
    res.json({
      generated_answer: {
        answer_text: "ParityFactory sync daemon failure during an active FDA 21 CFR Part 11 validation window represents a regulatory data integrity event. KB documentation indicates that manual recovery requires T2 engagement and compliance officer review before any sync re-run. Only 2 similar historical cases exist and both required T2 escalation. The specific pattern for v8.2.1 under active FDA audit conditions is not documented with sufficient specificity to allow autonomous resolution.",
        citations: ["ParityFactory Data Sync Reference (PF-KB-0821)", "ParityFactory 21 CFR Part 11 Compliance Guide", "ParityFactory Disaster Recovery Procedures"],
        confidence_preliminary: 0.52,
        coverage_gaps: ["No confirmed autonomous resolution path for FDA validation window sync failure", "21 CFR Part 11 compliance requirement mandates documented recovery under human oversight", "Both prior cases required T2 and compliance team engagement"],
      },
      generated_at: new Date().toISOString(),
    });
    return;
  }

  // Scenario A
  res.json({
    generated_answer: {
      answer_text: "Based on the v9.3 Release Notes and Upgrade Checklist, error IQS-SQL-TMO-7891 after a v9.3 patch is consistent with an incomplete post-upgrade schema migration. However, only one prior v9.3 case with this exact error exists and it was escalated to T2.",
      citations: ["InfinityQS v9.3 Release Notes (2026-04-10)", "InfinityQS v9.3 Upgrade Checklist (2026-04-10)", "InfinityQS KB Article #9201 (v9.2 SQL Adapter Tuning)"],
      confidence_preliminary: 0.61,
      coverage_gaps: ["Only 1 prior v9.3/IQS-SQL-TMO-7891 case exists — escalated", "v9.3 is 7 days old — KB content is sparse"],
    },
    generated_at: new Date().toISOString(),
  });
});

router.post("/score-confidence", (_req: Request, res: Response) => {
  const s = getAdvScenario();

  if (s === "B") {
    res.json({
      confidence_assessment: {
        confidence_score: 0.89, confidence_tier: "high",
        source_coverage_pct: 91, hallucination_risk: "very_low",
        recommended_action: "autonomous_resolve",
        reasoning: ["v9.3 Release Notes explicitly document SMTP credential migration break", "TKT-2026-00108 confirms identical fix in v9.3 — resolved in 12 minutes", "4 KB sources corroborate the SMTP re-entry resolution path", "No compliance flag — Professional tier — autonomous resolution appropriate", "Confidence 0.89 > 0.65 threshold → T1 autonomous resolution"],
        confidence_gate: "PASSED — 0.89 exceeds 0.65 minimum for autonomous resolution",
        resolution_delivered: true,
      },
      scored_at: new Date().toISOString(),
    });
    return;
  }

  if (s === "C") {
    res.json({
      confidence_assessment: {
        confidence_score: 0.52, confidence_tier: "low",
        source_coverage_pct: 41, hallucination_risk: "high",
        recommended_action: "route_to_diagnostic",
        reasoning: ["FDA 21 CFR Part 11 requires documented compliance recovery — autonomous resolution not appropriate", "Only 2 historical cases — both required T2 and compliance team", "KB documentation explicitly warns against re-running sync without T2 guidance", "Active audit window with auditors on-site — zero tolerance for error", "Confidence 0.52 < 0.65 threshold → route to Diagnostic Agent"],
        confidence_gate: "FAILED — 0.52 below 0.65 minimum + regulatory protocol mandated",
        escalation_target: "SUP-003 Diagnostic Reasoning Agent",
      },
      scored_at: new Date().toISOString(),
    });
    return;
  }

  // Scenario A
  res.json({
    confidence_assessment: {
      confidence_score: 0.58, confidence_tier: "low",
      source_coverage_pct: 52, hallucination_risk: "medium",
      recommended_action: "route_to_diagnostic",
      reasoning: ["Only 1 historical v9.3 case with this error — escalated, not resolved", "KB coverage for v9.3 sparse (released 7 days ago)", "Error code IQS-SQL-TMO-7891 not explicitly documented", "Production impact + ISO audit deadline elevates consequence of wrong answer", "Confidence 0.58 < 0.65 threshold → route to Diagnostic Agent"],
      confidence_gate: "FAILED — below 0.65 minimum for autonomous resolution",
      escalation_target: "SUP-003 Diagnostic Reasoning Agent",
    },
    scored_at: new Date().toISOString(),
  });
});

router.post("/additional-search", (_req: Request, res: Response) => {
  const s = getAdvScenario();
  if (s === "C") {
    res.json({
      additional_search: {
        triggered_by: "confidence 0.52 — regulatory protocol mandates diagnostic routing regardless",
        expanded_sources: ["ParityFactory compliance forums", "FDA 21 CFR Part 11 technical bulletins"],
        new_confidence: 0.52,
        finding: "Regulatory protocol for 21 CFR Part 11 active validation window mandates T2 and compliance team engagement regardless of KB confidence. Additional search did not change routing decision.",
        recommendation: "Route to SUP-003 Diagnostic Reasoning Agent — regulatory escalation mandatory",
      },
      searched_at: new Date().toISOString(),
    });
    return;
  }
  // Scenario A
  res.json({
    additional_search: {
      triggered_by: "confidence 0.58 — below medium threshold",
      expanded_sources: ["v9.3 release notes", "SQL adapter changelog", "InfinityQS support forums index"],
      new_confidence: 0.61,
      finding: "Expanded search confirms v9.3 introduced a new migration requirement but the specific error IQS-SQL-TMO-7891 in Xbar-R charts is not explicitly documented. Still below 0.65 threshold.",
      recommendation: "Route to SUP-003 Diagnostic Reasoning Agent — log analysis required",
    },
    searched_at: new Date().toISOString(),
  });
});

export default router;
