import { Router, type Request, type Response } from "express";
import { getAdvScenario } from "../advantive-support-shared-defs";

const router = Router();

router.post("/ingest-error", (_req: Request, res: Response) => {
  const s = getAdvScenario();
  if (s === "C") {
    res.json({
      error_profile: {
        error_code: "PF-SYNC-DAEMON-CRASH", error_class: "PROCESS_FAILURE",
        error_namespace: "ParityFactory.DataSyncEngine.FDAConnector",
        product: "ParityFactory", version: "8.2.1", version_age_days: 92,
        component: "Data Sync Engine → FDA-Validated Repository Connector",
        environment: { os: "Windows Server 2022", sql_server: "SQL Server 2019", pf_db: "PF_BatchRecords", deployment: "on-premises" },
        trigger: "Scheduled DB maintenance window (04:00–06:00) completed — sync daemon did not recover",
        first_error: "2026-04-17T06:12:44Z",
        batch_records_affected: 6,
        lot_range: "BNX-2026-0417-LOT089 through LOT094",
        validation_window_active: true,
        fda_auditors_onsite: true,
        fda_audit_start: "2026-04-17T10:00:00Z",
        hours_to_audit: 4,
        severity: "P0 — Regulatory Emergency",
        regulatory_framework: "21 CFR Part 11",
      },
      ingested_at: new Date().toISOString(),
    });
    return;
  }
  // Scenario A
  res.json({
    error_profile: {
      error_code: "IQS-SQL-TMO-7891", error_class: "SQL_TIMEOUT",
      error_namespace: "InfinityQS.SpcChartEngine.SqlDataAdapter",
      product: "InfinityQS SPC Pro", version: "9.3.0", version_age_days: 7,
      component: "SPC Chart Engine → SQL Data Adapter → Xbar-R renderer",
      environment: { os: "Windows Server 2022", sql_server: "SQL Server 2019 (15.0.4375)", iqs_db: "SPC_Analytics", deployment: "on-premises" },
      trigger: "v9.3 patch applied 2026-04-17 at 06:22 local time",
      first_error: "2026-04-17T06:48:11Z",
      charts_affected: 47, chart_types_affected: ["Xbar-R"],
      iso_audit_deadline: "2026-04-18T09:00:00Z", hours_to_deadline: 26,
      severity: "P1 — Production Blocked",
    },
    ingested_at: new Date().toISOString(),
  });
});

router.post("/query-logs", (_req: Request, res: Response) => {
  const s = getAdvScenario();
  if (s === "C") {
    res.json({
      log_query: {
        product: "ParityFactory", account_id: "ACC-01234",
        time_window: "last 8 hours", log_entries_scanned: 22140,
      },
      findings: {
        error_frequency: {
          "PF-SYNC-DAEMON-EXIT-0":   { count: 1,   first_seen: "2026-04-17T06:12:44Z", rate_per_min: null, note: "Sync daemon process exited — code 0 (silent)" },
          "PF-DB-CONN-TIMEOUT-0041": { count: 1847, first_seen: "2026-04-17T06:12:45Z", rate_per_min: 3.8, note: "FDA Connector attempting reconnect after daemon exit" },
          "PF-BATCH-WRITE-FAIL-0019":{ count: 6,   first_seen: "2026-04-17T06:13:02Z", rate_per_min: null, note: "One per missing batch record LOT089-094" },
        },
        affected_modules: ["DataSyncEngine.FDAConnector", "BatchRecord.ValidationWriter"],
        correlation: {
          common_thread: "Sync daemon exited immediately after DB maintenance window completed at 06:00",
          timing: "Daemon exit at 06:12:44 — exactly 12 minutes after DB maintenance completed (connection pool recycled)",
          pattern: "DB maintenance recycled all SQL connections. Sync daemon's connection pool was not configured to reconnect automatically — daemon exited with code 0.",
          root_cause_signal: "ParityFactory v8.2.1 sync daemon uses a persistent connection pool. When SQL Server 2019 connection pool was recycled during maintenance, the daemon received graceful shutdown signal and exited without writing LOT089-094 records to the FDA-validated repository.",
        },
        pre_error_events: [
          { time: "04:00:00", event: "Scheduled DB maintenance window started — SQL Server connection pool recycle initiated" },
          { time: "06:00:03", event: "DB maintenance completed — SQL Server 2019 connection pool recycled" },
          { time: "06:12:44", event: "ParityFactory sync daemon received connection pool reset — exited with code 0 (silent, no restart)" },
          { time: "06:13:02", event: "Batch records LOT089-094 write failed — FDA Connector could not reconnect" },
        ],
        confirmed_root_cause: "ParityFactory sync daemon is not configured for automatic restart after graceful shutdown triggered by SQL Server connection pool recycle. This is a known v8.2.1 configuration gap (PF-BUG-821-0033) — DB maintenance windows must set DaemonAutoRestart=true in ParityFactory.config. Batch records LOT089-094 were in the sync buffer but not committed to the FDA-validated repository before daemon exit.",
      },
      queried_at: new Date().toISOString(),
    });
    return;
  }
  // Scenario A
  res.json({
    log_query: {
      product: "InfinityQS", account_id: "ACC-00741",
      time_window: "last 6 hours", log_entries_scanned: 14820,
    },
    findings: {
      error_frequency: {
        "IQS-SQL-TMO-7891": { count: 847, first_seen: "2026-04-17T06:48:11Z", rate_per_min: 2.4 },
        "IQS-SQL-CON-0019": { count: 312, first_seen: "2026-04-17T06:48:14Z", rate_per_min: 0.9, note: "Connection pool exhaustion — secondary error" },
      },
      affected_modules: ["SpcChartEngine.SqlDataAdapter (IQS-SQL-TMO-7891)", "SpcChartEngine.ConnectionPool (IQS-SQL-CON-0019)"],
      correlation: {
        common_thread: "All IQS-SQL-TMO-7891 errors originate from Xbar-R chart type renderer",
        timing: "Errors begin exactly 26 minutes after v9.3 service restart",
        pattern: "SQL query timeout on table SPC_Analytics.dbo.IQS_Measurement_930",
        root_cause_signal: "IQS_Measurement_930 is a NEW table introduced in v9.3 schema migration. It is missing index IX_IQS_Meas_ChartId_Timestamp that was supposed to be created by IQS-MIGRATE-930.sql.",
      },
      pre_error_events: [
        { time: "06:22:04", event: "InfinityQS v9.3 services started" },
        { time: "06:22:11", event: "IQS-MIGRATE-930.sql execution — SKIPPED (automatic execution failed silently)" },
        { time: "06:48:11", event: "First chart refresh — IQS-SQL-TMO-7891 triggered on all 47 Xbar-R charts" },
      ],
      confirmed_root_cause: "IQS-MIGRATE-930.sql failed to execute automatically during v9.3 startup. Missing index IX_IQS_Meas_ChartId_Timestamp on IQS_Measurement_930 causes all Xbar-R SQL queries to time out. Confirmed v9.3 regression: IQS-BUG-930-0042.",
    },
    queried_at: new Date().toISOString(),
  });
});

router.post("/match-pattern", (_req: Request, res: Response) => {
  const s = getAdvScenario();
  if (s === "C") {
    res.json({
      pattern_match: {
        error_code: "PF-SYNC-DAEMON-EXIT-0", catalog_entry: "PF-BUG-821-0033",
        match_confidence: 0.94,
        pattern_name: "v8.2 Sync Daemon Non-Restart After DB Maintenance — FDA Data Loss Risk",
        root_cause: "ParityFactory sync daemon not configured for auto-restart (DaemonAutoRestart=false default). DB maintenance connection pool recycle triggers graceful exit without recovery. Batch records in buffer are lost.",
        affected_versions: ["8.2.0", "8.2.1"],
        fix_type: "configuration + batch record recovery",
        requires_compliance_review: true,
        regulatory_protocol: "21 CFR Part 11 data integrity event — recovery must be performed under documented supervision",
        estimated_fix_mins: 20,
        known_since: "2026-02-01",
        patch_available: false, patch_eta: "v8.3.0 scheduled Q3 2026",
        prior_cases_with_fix: 1, similar_case_ids: ["TKT-2025-14892"],
      },
      matched_at: new Date().toISOString(),
    });
    return;
  }
  // Scenario A
  res.json({
    pattern_match: {
      error_code: "IQS-SQL-TMO-7891", catalog_entry: "IQS-BUG-930-0042",
      match_confidence: 0.97,
      pattern_name: "v9.3 Post-Upgrade Migration Failure — Missing Measurement Index",
      root_cause: "IQS-MIGRATE-930.sql silently skipped during v9.3 startup. IQS_Measurement_930 table created without IX_IQS_Meas_ChartId_Timestamp index causing all Xbar-R chart queries to time out.",
      affected_versions: ["9.3.0"],
      fix_type: "configuration + manual migration script",
      requires_remote: false, estimated_fix_mins: 15,
      known_since: "2026-04-12", patch_available: false, patch_eta: "v9.3.1 scheduled 2026-04-28",
      prior_cases_with_fix: 2, similar_case_ids: ["TKT-2026-00412", "TKT-2026-00489"],
    },
    matched_at: new Date().toISOString(),
  });
});

router.post("/build-resolution", (_req: Request, res: Response) => {
  const s = getAdvScenario();
  if (s === "C") {
    res.json({
      resolution_path: {
        title: "ParityFactory v8.2.1 — FDA Batch Record Recovery (21 CFR Part 11 Protocol)",
        estimated_time_mins: 20,
        requires_remote_access: false,
        customer_executable: false,
        compliance_supervised: true,
        steps: [
          { step: 1, action: "Preserve all sync logs and daemon exit records", detail: "Copy PF_Sync.log and Windows Event Log entries to a compliance-preserved location before any recovery action.", risk: "none", compliance_note: "Required for 21 CFR Part 11 audit trail" },
          { step: 2, action: "Enable DaemonAutoRestart in ParityFactory.config", detail: "Set DaemonAutoRestart=true in C:\\ProgramData\\ParityFactory\\ParityFactory.config. This prevents future silent exits after connection pool recycles.", command: "Set DaemonAutoRestart=true in ParityFactory.config", risk: "low" },
          { step: 3, action: "Restart ParityFactory Sync Service under compliance supervision", detail: "Restart via services.msc. Compliance officer must be present to document the restart action in the validation log.", risk: "low", compliance_note: "Must be documented in validation log" },
          { step: 4, action: "Re-trigger sync for LOT089-LOT094 batch records", detail: "From ParityFactory Admin Console → Data Sync → Manual Sync → select date range 2026-04-17 05:00–06:30 to recover the 6 missing records.", risk: "medium", compliance_note: "Recovery must be documented with reason code FDA-RECOVERY-21CFR11" },
          { step: 5, action: "Validate batch records in FDA repository", detail: "Confirm all 6 records (LOT089-094) appear in the validated repository with correct timestamps and audit trail entries.", risk: "none", compliance_note: "Present validation output to FDA auditors" },
        ],
        rollback_procedure: "If re-sync fails, do NOT attempt further recovery without T2 guidance. Preserve all logs.",
        regulatory_note: "This recovery must be performed under documented compliance supervision per 21 CFR Part 11. Legal hold on all sync logs until audit is complete.",
      },
      built_at: new Date().toISOString(),
    });
    return;
  }
  // Scenario A
  res.json({
    resolution_path: {
      title: "InfinityQS v9.3 — Restore SPC Chart Engine via Manual Migration",
      estimated_time_mins: 15, requires_remote_access: false, customer_executable: true,
      steps: [
        { step: 1, action: "Verify SQL service account permissions", command: "SELECT IS_ROLEMEMBER('db_owner', 'IQS_ServiceAccount') AS has_permission;", risk: "low" },
        { step: 2, action: "Run IQS-MIGRATE-930.sql manually", command: "sqlcmd -S [SQL_SERVER] -d SPC_Analytics -i IQS-MIGRATE-930.sql -E", risk: "low" },
        { step: 3, action: "Restart InfinityQS SPC Engine service", command: "services.msc → InfinityQS SPC Engine → Restart", risk: "low" },
        { step: 4, action: "Validate Xbar-R chart data refresh", command: "Open SPC dashboard → confirm charts load within 30s", risk: "none" },
        { step: 5, action: "Confirm ISO 9001 audit readiness", command: "Export chart summary for QC manager confirmation", risk: "none" },
      ],
      rollback_procedure: "If migration fails: revert to v9.2.1 via Add/Remove Programs → InfinityQS → Change/Repair.",
    },
    built_at: new Date().toISOString(),
  });
});

router.post("/assess-escalation", (_req: Request, res: Response) => {
  const s = getAdvScenario();
  if (s === "C") {
    res.json({
      escalation_assessment: {
        escalate: true, urgency_level: "P0 — REGULATORY EMERGENCY",
        rationale: [
          "21 CFR Part 11 active validation window — autonomous recovery not permitted without documented compliance oversight",
          "FDA auditors on-site in 4 hours — recovery must be fully documented and auditable",
          "6 batch records (LOT089-094) missing from FDA-validated repository — data integrity at stake",
          "Legal hold required on all sync logs per regulatory protocol",
          "Enterprise + Compliance SLA mandates T2 response within 30 minutes",
          "Compliance officer must be present for all recovery steps",
        ],
        autonomous_resolution_possible: false,
        autonomous_confidence: 0.73,
        escalation_type: "REGULATORY MANDATORY — Legal hold + compliance team + FDA advisory",
        recommended_t2_team: "ParityFactory Compliance & Integration Team",
        t2_priority: "P0 — FDA audit on-site",
        legal_hold: true,
        legal_team_cc: "compliance@advantive.com",
        regulatory_advisory: "FDA-ADV-2026-04-17-001",
      },
      assessed_at: new Date().toISOString(),
    });
    return;
  }
  // Scenario A
  res.json({
    escalation_assessment: {
      escalate: true, urgency_level: "P1 — CRITICAL",
      rationale: ["Enterprise tier — 4h SLA response target", "ISO 9001 audit in 26 hours", "Resolution path technically clear and customer-executable", "Enterprise + compliance deadline policy mandates T2 standby"],
      autonomous_resolution_possible: true, autonomous_confidence: 0.91,
      escalation_type: "PARALLEL — T2 on standby while customer attempts self-resolution",
      recommended_t2_team: "InfinityQS Database & Schema Team",
      t2_priority: "URGENT — ISO audit deadline",
    },
    assessed_at: new Date().toISOString(),
  });
});

export default router;
