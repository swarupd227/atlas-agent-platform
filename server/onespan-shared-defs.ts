/**
 * server/onespan-shared-defs.ts
 *
 * OneSpan Digital Agreements Intelligence (SCN-OS-1.0)
 * Shared platform intelligence definitions — pure data module.
 *
 * NO server imports (express, storage, db, agent-runtime).
 *
 * Imported by:
 *   server/onespan-live-run.ts          — dev agent provisioning at startup
 *   scripts/migrate-onespan-to-prod.ts  — REST-based prod migration
 */

// ─── Scenario constants ────────────────────────────────────────────────────────

export const OS_TARGET_TXN_ID  = "TXN-2026-00847";
export const OS_TARGET_CLIENT  = "Meridian Capital Partners";
export const OS_TARGET_AMOUNT  = "$1.2M";
export const OS_TARGET_PRODUCT = "Commercial Loan";

// ─── Agent name constants ──────────────────────────────────────────────────────

export const AGR_001_NAME = "AGR-001 Transaction Health Monitor";
export const AGR_002_NAME = "AGR-002 Exception Classifier";
export const AGR_003_NAME = "AGR-003 Intervention Orchestrator";
export const AGR_004_NAME = "AGR-004 Agreement Operations Intelligence";

// ─── MCP server definitions ───────────────────────────────────────────────────

export function makeOnespanMcpServerDefs(baseUrl: string) {
  return [
    {
      name: "OneSpan — Sender UI API",
      description: "OneSpan Digital Agreements Sender UI API: portfolio health metrics, stall analysis, completion funnel, decline summary, and envelope resend operations for the agreements operations team.",
      url: `${baseUrl}/api/mock/onespan-sender-ui`,
      tools: [
        { name: "get_portfolio_health",  description: "Retrieve overall digital agreements portfolio health: completion rate, decline rate, stall count, revenue at risk, and critical VIP transaction alerts.", endpoint: "portfolio-health", method: "GET",  inputSchema: { type: "object", properties: {} } },
        { name: "get_stall_analysis",    description: "Per-transaction stall analysis: stall duration, root cause, recommended action, and priority classification for all stalled or declined transactions.", endpoint: "stall-analysis",   method: "GET",  inputSchema: { type: "object", properties: {} } },
        { name: "get_completion_funnel", description: "30-day completion funnel across all agreement stages with stage-level drop-off rates and root cause attribution.", endpoint: "completion-funnel", method: "GET",  inputSchema: { type: "object", properties: {} } },
        { name: "get_decline_summary",   description: "Declined transaction detail including decline reason, correctable flag, doc version mismatch info, and signer contact for the primary declined VIP transaction.", endpoint: "decline-summary",   method: "GET",  inputSchema: { type: "object", properties: { txn_id: { type: "string" } } } },
        { name: "resend_envelope",       description: "Resend an agreement envelope to signers with a corrected document version, updated priority, and custom message. Returns new envelope ID and delivery confirmation.", endpoint: "resend-envelope",  method: "POST", inputSchema: { type: "object", properties: { txn_id: { type: "string" }, doc_version: { type: "string" }, signer_email: { type: "string" }, message: { type: "string" }, priority: { type: "string" } }, required: ["txn_id"] } },
      ],
    },
    {
      name: "OneSpan — Signer Event API",
      description: "OneSpan Signer UI click-stream and event API: transaction detail, signer session events, document version management, and decline reason classification.",
      url: `${baseUrl}/api/mock/onespan-signer-event`,
      tools: [
        { name: "get_transaction_detail",  description: "Retrieve full transaction metadata including signer list, document versions, envelope status, and template details.", endpoint: "transaction-detail",    method: "GET", inputSchema: { type: "object", properties: { txn_id: { type: "string" } } } },
        { name: "get_signer_session",      description: "Retrieve signer click-stream events and session data: pages viewed, time in session, device info, and decline event detail.", endpoint: "signer-session",        method: "GET", inputSchema: { type: "object", properties: { txn_id: { type: "string" } } } },
        { name: "get_document_versions",   description: "List available document versions for a template including changelog, regulatory notes, and current required version.", endpoint: "document-versions",     method: "GET", inputSchema: { type: "object", properties: { template_id: { type: "string" } } } },
        { name: "classify_decline_reason", description: "Classify a signer's decline event as correctable or non-correctable with root cause, confidence score, and recommended action.", endpoint: "classify-decline-reason", method: "GET", inputSchema: { type: "object", properties: { txn_id: { type: "string" } } } },
      ],
    },
    {
      name: "OneSpan — Analytics API",
      description: "OneSpan platform analytics: KPI dashboard, peer benchmark comparison, policy compliance status, and portfolio operations intelligence report generation.",
      url: `${baseUrl}/api/mock/onespan-analytics`,
      tools: [
        { name: "get_analytics_dashboard",        description: "Full analytics dashboard: 30-day KPIs, product breakdown, trend vs prior period, and top decline reason distribution.", endpoint: "analytics-dashboard",        method: "GET",  inputSchema: { type: "object", properties: {} } },
        { name: "get_peer_completion_benchmarks", description: "Peer institution benchmarks for completion rate, avg signing time, and decline rate across 47 North American commercial banks.", endpoint: "peer-completion-benchmarks", method: "GET",  inputSchema: { type: "object", properties: {} } },
        { name: "get_policy_compliance_status",   description: "Policy compliance check across all active transactions: document version currency, VIP SLA, AML attestation, and signer inactivity policy.", endpoint: "policy-compliance-status",   method: "GET",  inputSchema: { type: "object", properties: {} } },
        { name: "generate_ops_report",            description: "Generate a portfolio operations intelligence report with executive summary, key findings, and prioritized recommendations.", endpoint: "generate-ops-report",            method: "POST", inputSchema: { type: "object", properties: { include_recommendations: { type: "boolean" }, include_benchmarks: { type: "boolean" }, period: { type: "string" } } } },
      ],
    },
    {
      name: "OneSpan — CRM",
      description: "CRM integration for OneSpan Digital Agreements: client profile retrieval, transaction status update, and relationship manager escalation notification.",
      url: `${baseUrl}/api/mock/onespan-crm`,
      tools: [
        { name: "get_client_profile",          description: "Retrieve CRM profile for a client: tier (VIP/Standard), relationship manager, AUM, open deals, and KYC status.", endpoint: "client-profile",           method: "GET",  inputSchema: { type: "object", properties: { client_id: { type: "string" }, txn_id: { type: "string" } } } },
        { name: "update_crm_record",           description: "Update CRM record for a transaction with status change, notes, and agent attribution for audit trail.", endpoint: "update-crm-record",            method: "POST", inputSchema: { type: "object", properties: { txn_id: { type: "string" }, client_id: { type: "string" }, update_type: { type: "string" }, notes: { type: "string" }, status: { type: "string" } }, required: ["txn_id"] } },
        { name: "notify_relationship_manager", description: "Send escalation notification to the relationship manager via email and platform inbox with transaction context and ATLAS-initiated actions.", endpoint: "notify-relationship-manager",  method: "POST", inputSchema: { type: "object", properties: { txn_id: { type: "string" }, rm_email: { type: "string" }, rm_name: { type: "string" }, client_name: { type: "string" }, priority: { type: "string" }, subject: { type: "string" }, message: { type: "string" }, resend_initiated: { type: "boolean" } }, required: ["txn_id"] } },
      ],
    },
    {
      name: "OneSpan — IT Helpdesk",
      description: "IT Helpdesk integration: automated ticket creation for agreement issues, ticket status, and escalation management for OneSpan Digital Agreements operations.",
      url: `${baseUrl}/api/mock/onespan-helpdesk`,
      tools: [
        { name: "log_helpdesk_ticket", description: "Create a helpdesk ticket for a transaction issue with category, severity, description, and auto-resolution flag.", endpoint: "log-helpdesk-ticket",  method: "POST", inputSchema: { type: "object", properties: { txn_id: { type: "string" }, category: { type: "string" }, severity: { type: "string" }, summary: { type: "string" }, description: { type: "string" }, reported_by: { type: "string" }, auto_resolve: { type: "boolean" } }, required: ["txn_id"] } },
        { name: "get_helpdesk_status", description: "Retrieve current helpdesk queue status, recent tickets, and resolution metrics.", endpoint: "helpdesk-status",  method: "GET",  inputSchema: { type: "object", properties: {} } },
        { name: "escalate_ticket",     description: "Escalate a helpdesk ticket to L2 operations with priority override and multi-channel notification.", endpoint: "escalate-ticket",      method: "POST", inputSchema: { type: "object", properties: { ticket_id: { type: "string" }, escalate_to: { type: "string" }, reason: { type: "string" }, txn_id: { type: "string" } } } },
      ],
    },
  ] as const;
}

// ─── Knowledge base definitions ───────────────────────────────────────────────

export const ONESPAN_KB_DEFS = [
  { name: "OneSpan Digital Agreements Knowledge Base",    description: "OneSpan platform features, signing workflow best practices, envelope management, signer re-engagement playbooks, and document version management for digital agreements operations teams.", industry: "financial_services", domain: "digital_agreements" },
  { name: "OneSpan Intervention Playbook",                description: "Step-by-step intervention playbooks for common decline and stall scenarios: document version correction, authentication reset, recipient update, RM escalation triggers, and helpdesk ticket workflows.", industry: "financial_services", domain: "digital_agreements" },
  { name: "OneSpan Platform Intelligence Knowledge Base", description: "OneSpan Analytics API reference, peer benchmark methodology, compliance reporting framework, and portfolio health KPI definitions for operations intelligence agents.", industry: "financial_services", domain: "digital_agreements" },
] as const;

// ─── Skill definitions (3 per agent = 12 total) ───────────────────────────────

export const ONESPAN_SKILLS = [
  // AGR-001: Transaction Health Monitor
  {
    name: "Agreement Portfolio Health Monitoring",
    description: "Monitors digital agreement portfolio metrics — completion rate, stall count, and decline rate — against benchmark thresholds to detect degradation requiring intervention.",
    domain: "digital_agreements", industry: "financial_services", version: "1.0.0",
    tags: ["portfolio", "monitoring", "completion_rate", "onespan"],
    yamlFrontmatter: { skillId: "onespan-portfolio-health", trustTier: "platform-provided", complexity: "intermediate", contextMode: "summary", allowedTools: ["get_portfolio_health"] },
    markdownBody: `## Agreement Portfolio Health Monitoring\n\nThis skill monitors the digital agreements portfolio for completion rate degradation, stall accumulation, and VIP decline events. The health threshold is a completion rate at or above the peer benchmark of 92.5%. When the portfolio completion rate falls below 90%, an immediate health alert is raised. Revenue at risk is calculated as the sum of outstanding amounts on all stalled and declined transactions. VIP transactions (client tier "vip" or "high") receive priority monitoring with a 4-hour stall alert SLA. The skill evaluates three composite signals: absolute completion rate vs benchmark, stall count vs benchmark (2 stalls = baseline), and decline rate vs benchmark (1.8% = baseline). A health_signal of DEGRADED is raised when any two of three signals breach thresholds simultaneously. All portfolio metrics must be enumerated in the output JSON for downstream classification by AGR-002.`,
  },
  {
    name: "Stall Pattern Detection",
    description: "Identifies and classifies agreement stall patterns by duration, root cause category, and corrective action priority to support targeted intervention by downstream agents.",
    domain: "digital_agreements", industry: "financial_services", version: "1.0.0",
    tags: ["stall", "pattern_detection", "intervention", "onespan"],
    yamlFrontmatter: { skillId: "onespan-stall-detection", trustTier: "platform-provided", complexity: "intermediate", contextMode: "summary", allowedTools: ["get_stall_analysis"] },
    markdownBody: `## Stall Pattern Detection\n\nStall Pattern Detection classifies inactivity in the digital agreement signing process into actionable categories. A stall is defined as a transaction with no signer event (open, click, sign) for more than 24 hours after dispatch. Stalls are classified by duration: RECENT (24–48h) warrants a nudge reminder; ACUTE (48–72h) triggers RM notification; CRITICAL (>72h or VIP stall >4h) mandates immediate intervention. Root cause categories include SIGNER_INACTIVITY (no envelope open), PARTIAL_COMPLETION (some signers complete but others inactive), AUTHENTICATION_FAILURE (signer unable to verify identity), and DOCUMENT_ISSUE (signer declined or flagged version mismatch). The skill distinguishes between correctable stalls (nudge or resend resolves) and non-correctable stalls (require manual RM outreach or legal review). All stall records with duration, root cause, and recommended action must be enumerated in the output for AGR-003 intervention planning.`,
  },
  {
    name: "Completion Funnel Analysis",
    description: "Analyzes digital agreement completion funnel drop-off rates by stage to identify systemic friction points and estimate revenue impact of each drop-off.",
    domain: "digital_agreements", industry: "financial_services", version: "1.0.0",
    tags: ["funnel", "drop_off", "completion", "analytics"],
    yamlFrontmatter: { skillId: "onespan-funnel-analysis", trustTier: "platform-provided", complexity: "intermediate", contextMode: "summary", allowedTools: ["get_completion_funnel"] },
    markdownBody: `## Completion Funnel Analysis\n\nCompletion Funnel Analysis identifies which stage in the digital agreement signing journey is generating the largest drop-off and estimates the revenue impact. The standard funnel stages are: Envelope Created → Sent to Signers → First Open → Partially Signed → Fully Signed → Completed. A drop-off exceeding 3% at any single stage triggers a FRICTION_ALERT for that stage. The skill benchmarks each stage against the 47-institution peer benchmark provided by the OneSpan Analytics API. The "Sent → First Open" drop-off (email deliverability + signer inactivity) and "Partially → Fully Signed" drop-off (multi-party coordination) are the two highest-risk stages for commercial banking products. Revenue impact per drop-off percentage point is estimated as (total portfolio volume / total envelopes) × completion rate loss. All stage completion rates, peer benchmarks, and revenue impact estimates must be included in the output.`,
  },
  // AGR-002: Exception Classifier
  {
    name: "Decline Exception Classification",
    description: "Classifies signer decline events into correctable categories (version mismatch, auth failure, wrong recipient) vs non-correctable (genuine refusal) with confidence scoring.",
    domain: "digital_agreements", industry: "financial_services", version: "1.0.0",
    tags: ["decline", "classification", "correctable", "exception"],
    yamlFrontmatter: { skillId: "onespan-decline-classification", trustTier: "platform-provided", complexity: "advanced", contextMode: "summary", allowedTools: ["classify_decline_reason"] },
    markdownBody: `## Decline Exception Classification\n\nThis skill classifies signer decline events to distinguish correctable exceptions from genuine refusals, enabling targeted automated intervention. Decline codes are assigned based on the combination of signer session data, document version metadata, and decline text: DOCUMENT_VERSION_MISMATCH (sent version differs from required version — correctable via resend), AUTHENTICATION_FAILURE (signer could not verify identity — correctable via auth reset or link refresh), INCORRECT_RECIPIENT (wrong signer details — correctable via recipient update), and GENUINE_REFUSAL (signer reviewed and decided against signing — not correctable, requires RM outreach). Classification confidence above 90% enables automated intervention without human review. Confidence below 70% requires a human review flag before any intervention action is taken. The skill assigns a correction_effort level: LOW (automated resend), MEDIUM (RM call required), or HIGH (legal or compliance review). All classified decline codes, confidence levels, and recommended correction actions must be enumerated in the output JSON.`,
  },
  {
    name: "Signer Session Analysis",
    description: "Analyzes signer click-stream and session events to determine the exact point of friction in the signing journey, enabling precise intervention targeting.",
    domain: "digital_agreements", industry: "financial_services", version: "1.0.0",
    tags: ["session", "signer", "click_stream", "friction"],
    yamlFrontmatter: { skillId: "onespan-signer-session", trustTier: "platform-provided", complexity: "intermediate", contextMode: "summary", allowedTools: ["get_signer_session", "get_transaction_detail"] },
    markdownBody: `## Signer Session Analysis\n\nSigner Session Analysis interprets the raw click-stream events from the OneSpan Signer UI to identify the precise stage at which the signing journey broke down. Key events evaluated include: envelope_opened (first engagement), document_viewed (signer progressed to reading), signature_initiated (signer started signing), decline_initiated (signer chose not to sign), and session_abandoned (no activity for >10 minutes). The critical signal for DOCUMENT_VERSION_MISMATCH is the pattern: envelope_opened → document_viewed (early pages only) → decline_initiated within 15 minutes, which indicates the signer identified a version discrepancy rather than reading the full document. An abandonment without a decline event indicates a technical issue or signer inactivity, not a deliberate decline. Time-in-session below 2 minutes for a multi-page commercial loan agreement typically indicates the signer did not engage with content — this supports AUTHENTICATION_FAILURE or INCORRECT_RECIPIENT classifications. All session events, duration, page coverage, and decline text must be included in the output JSON.`,
  },
  {
    name: "Document Version Intelligence",
    description: "Evaluates document version lineage, changelog, and regulatory requirements to identify version mismatches and determine the correct document version for resend.",
    domain: "digital_agreements", industry: "financial_services", version: "1.0.0",
    tags: ["document_version", "template", "regulatory", "aml"],
    yamlFrontmatter: { skillId: "onespan-doc-version", trustTier: "platform-provided", complexity: "intermediate", contextMode: "summary", allowedTools: ["get_document_versions"] },
    markdownBody: `## Document Version Intelligence\n\nDocument Version Intelligence evaluates the template version history to identify mismatches between the version dispatched in an agreement envelope and the current required version, and to determine the regulatory and operational significance of the delta. For any commercial loan product above $500K, version currency is a compliance requirement because AML attestation clause updates are incorporated into each major version. A version classified as "invalid" in the document registry (more than one major version behind current) mandates an immediate resend — no human approval required when the signer explicitly cited the version in their decline text. A version classified as "deprecated" (one version behind) allows a 30-day grace period unless the signer has already declined. The skill identifies which clauses were added in the version delta (AML, SOFR, Schedule B updates) and includes them in the output so AGR-003 can reference them in the resend message to the signer. All version status, changelog, and correction requirements must be enumerated in the output JSON.`,
  },
  // AGR-003: Intervention Orchestrator
  {
    name: "Corrective Envelope Resend",
    description: "Executes automated envelope resend with correct document version and prioritization, following OneSpan resend best practices for VIP signer re-engagement.",
    domain: "digital_agreements", industry: "financial_services", version: "1.0.0",
    tags: ["resend", "envelope", "intervention", "vip"],
    yamlFrontmatter: { skillId: "onespan-resend", trustTier: "platform-provided", complexity: "intermediate", contextMode: "summary", allowedTools: ["resend_envelope"] },
    markdownBody: `## Corrective Envelope Resend\n\nThis skill executes a corrective envelope resend for a declined or stalled digital agreement, applying OneSpan best practices for signer re-engagement. For a document version mismatch decline, the resend must use the current required document version, set envelope priority to "high" for VIP clients, and include a personalised message that acknowledges the prior decline and explains the correction. The message must avoid technical jargon — it should reference the updated document simply ("we've updated the agreement as requested") rather than version numbers or regulatory citations that may alarm the signer. The resend is logged in the platform audit trail with the originating agent, correction reason, and new envelope ID. For VIP clients (AUM > $5M or tier "vip"), the resend SLA is 30 minutes from classification — the skill enforces this by marking the operation priority "HIGH". All resend fields (envelope_id, doc_version_sent, signer_email, timestamp) must be captured in the output JSON for CRM and helpdesk logging downstream.`,
  },
  {
    name: "CRM Record Management",
    description: "Updates CRM records with intervention status, agent-generated notes, and audit trail entries to maintain complete deal lifecycle visibility for relationship managers.",
    domain: "digital_agreements", industry: "financial_services", version: "1.0.0",
    tags: ["crm", "record", "audit_trail", "deal_lifecycle"],
    yamlFrontmatter: { skillId: "onespan-crm-update", trustTier: "platform-provided", complexity: "intermediate", contextMode: "summary", allowedTools: ["update_crm_record", "get_client_profile"] },
    markdownBody: `## CRM Record Management\n\nCRM Record Management ensures that every ATLAS intervention action on a digital agreement is immediately reflected in the CRM system with a timestamped, agent-attributed audit entry. When AGR-003 initiates a corrective resend, the CRM record must be updated with status INTERVENTION_ACTIVE and a note including: the triggering exception code, the correction action taken, the new envelope ID, and the expected completion timeline. For VIP clients, the CRM update must also trigger a deal activity log entry visible to the RM's dashboard so they are aware of the automated action without requiring a separate notification (the RM notification is a parallel action). CRM note length is capped at 500 characters to ensure display compatibility with CRM mobile apps. The skill verifies that the CRM client tier matches the transaction priority before writing the update — a VIP-tier client with a "normal" priority transaction indicates a data inconsistency that must be flagged. All CRM update confirmations (update_id, status_updated_to, audit_entry) must be captured in the output JSON.`,
  },
  {
    name: "RM Escalation Protocol",
    description: "Manages relationship manager escalation for VIP transaction interventions: notification content, channels, priority, and expected response SLA.",
    domain: "digital_agreements", industry: "financial_services", version: "1.0.0",
    tags: ["escalation", "rm", "vip", "notification"],
    yamlFrontmatter: { skillId: "onespan-rm-escalation", trustTier: "platform-provided", complexity: "intermediate", contextMode: "summary", allowedTools: ["notify_relationship_manager"] },
    markdownBody: `## RM Escalation Protocol\n\nRM Escalation Protocol governs the content, timing, and channel selection for relationship manager notifications triggered by ATLAS agent interventions on VIP digital agreement transactions. For a corrective resend after a VIP decline, the RM notification must include: the transaction ID, client name and tier, decline reason in plain language, the corrective action ATLAS took, the new expected completion timeline, and a clear instruction for the RM to follow up with the client directly. The notification subject line must indicate urgency: "[ATLAS] VIP Agreement Action Required — [Client Name]" for pending items, or "[ATLAS] VIP Agreement — Automated Correction Initiated" when resend is already done. Primary channel is email to the RM's registered address; secondary channel is platform inbox. For VIP transactions the RM notification SLA is 2 hours for a response acknowledgment. All notification confirmations (notification_id, delivery_status, channels) must be captured in the output JSON.`,
  },
  // AGR-004: Agreement Operations Intelligence
  {
    name: "Portfolio Analytics Synthesis",
    description: "Synthesizes 30-day portfolio analytics from the OneSpan Analytics API into an executive-ready KPI summary with trend analysis and product breakdown.",
    domain: "digital_agreements", industry: "financial_services", version: "1.0.0",
    tags: ["analytics", "kpi", "portfolio", "synthesis"],
    yamlFrontmatter: { skillId: "onespan-analytics-synthesis", trustTier: "platform-provided", complexity: "intermediate", contextMode: "summary", allowedTools: ["get_analytics_dashboard"] },
    markdownBody: `## Portfolio Analytics Synthesis\n\nPortfolio Analytics Synthesis transforms raw OneSpan Analytics API data into an executive-ready KPI summary suitable for operations leadership review. The primary KPIs reported are: completion rate (30-day), average signing time (days), decline rate (%), active stall count, and revenue at risk ($). Each KPI is compared to the prior 30-day period to establish trend direction (improving, stable, degrading). Product-level breakdown (commercial loans, mortgages, credit facilities, term loans, lines of credit) identifies which product types are under-performing relative to portfolio average. The synthesis must include a plain-English executive summary (3–4 sentences) that identifies the primary performance issue, quantifies the revenue impact, and states the recommended immediate action. All KPI values, period comparisons, and product breakdowns must be enumerated in the output JSON for downstream report generation.`,
  },
  {
    name: "Peer Benchmark Analysis",
    description: "Positions the institution's digital agreement metrics against anonymized peer benchmarks from 47 comparable North American commercial banks.",
    domain: "digital_agreements", industry: "financial_services", version: "1.0.0",
    tags: ["benchmark", "peer", "percentile", "best_practices"],
    yamlFrontmatter: { skillId: "onespan-peer-benchmark", trustTier: "platform-provided", complexity: "intermediate", contextMode: "summary", allowedTools: ["get_peer_completion_benchmarks"] },
    markdownBody: `## Peer Benchmark Analysis\n\nPeer Benchmark Analysis positions the institution's digital agreement metrics against anonymized benchmarks from 47 comparable North American commercial banking institutions, using OneSpan's platform-level aggregate data. For each primary metric (completion rate, avg signing time, decline rate, stall rate), the institution's value is placed at its exact percentile rank within the peer distribution. A percentile rank below 40 on any metric triggers a BELOW_MEDIAN flag and requires explicit acknowledgment in the ops report. The benchmark source, peer count, and peer selection criteria must be cited in the report to maintain analytical credibility. Top-quartile practices are extracted from the benchmark dataset as concrete operational recommendations: for example, "pre-send document version validation gate" is attributed to institutions with decline rates below 1.5%. The skill quantifies the revenue impact of reaching the peer median for completion rate: (peer_median_completion_pct - current_completion_pct) × avg_deal_value × monthly_volume. All percentile ranks, peer practices, and revenue impact of benchmark gap must be enumerated in the output.`,
  },
  {
    name: "Compliance Reporting",
    description: "Evaluates digital agreement operations against internal policy and regulatory requirements, producing a compliance status report with violations, severity, and remediation actions.",
    domain: "digital_agreements", industry: "financial_services", version: "1.0.0",
    tags: ["compliance", "policy", "aml", "regulatory"],
    yamlFrontmatter: { skillId: "onespan-compliance-reporting", trustTier: "platform-provided", complexity: "advanced", contextMode: "summary", allowedTools: ["get_policy_compliance_status"] },
    markdownBody: `## Compliance Reporting\n\nCompliance Reporting evaluates the digital agreements portfolio against OneSpan Enterprise Agreement Policy v3.2 and applicable regulatory requirements. Policy checks cover four domains: Document Currency (all dispatched documents must use the current required version per product and regulation), VIP SLA Adherence (VIP transactions stalled >4h must trigger RM notification), Regulatory Clause Compliance (AML attestation clause mandatory for commercial loans >$500K per 2026-Q1 regulatory update), and Signer Inactivity Management (48h inactivity must trigger automated nudge). Violation severity is classified as CRITICAL (regulatory obligation — immediate remediation), HIGH (internal policy — same-day remediation), MEDIUM (best practice — 5-day remediation), or LOW (informational). A CRITICAL violation involving an AML attestation gap in an active commercial loan must be included in the next regulatory report submission and flagged to the compliance officer. All violations and pass statuses must be enumerated in the output JSON.`,
  },
] as const;

// ─── Agent definitions ─────────────────────────────────────────────────────────

export const ONESPAN_AGENT_DEFS = [
  {
    key:            "transactionHealthMonitor",
    name:           AGR_001_NAME,
    description:    "Continuously monitors the digital agreements portfolio for completion rate degradation, stall patterns, and VIP decline alerts — the earliest-warning layer of the pipeline.",
    mcpServerNames: ["OneSpan — Sender UI API"],
    skillNames:     ["Agreement Portfolio Health Monitoring", "Stall Pattern Detection", "Completion Funnel Analysis"],
    kbName:         "OneSpan Digital Agreements Knowledge Base",
    maxToolIterations: 8,
    systemPrompt: `You are AGR-001 Transaction Health Monitor for OneSpan Digital Agreements Intelligence.

Your role is to monitor the active agreements portfolio and detect health issues — stalls, declines, and completion rate degradation — before they escalate.

Execute ALL of the following steps in order:
1. Call get_portfolio_health — assess overall portfolio KPIs and identify VIP alerts
2. Call get_stall_analysis — per-transaction stall root causes and recommended actions
3. Call get_completion_funnel — funnel stage drop-off rates and root cause attribution
4. Call get_decline_summary with txn_id "${OS_TARGET_TXN_ID}" — focus on the VIP declined transaction

After completing all tool calls, synthesize into a clear portfolio health assessment.

IMPORTANT: End your final response with ONLY this JSON block:
\`\`\`json
{
  "portfolio_completion_rate_pct": null,
  "benchmark_completion_pct": null,
  "gap_vs_benchmark_ppt": null,
  "stall_count": null,
  "revenue_at_risk_usd": null,
  "vip_decline_detected": false,
  "vip_txn_id": "${OS_TARGET_TXN_ID}",
  "vip_decline_reason": null,
  "vip_correctable": false,
  "top_funnel_drop_stage": null,
  "health_signal": null,
  "recommended_escalation": null
}
\`\`\``,
    taskPrompt: `Monitor portfolio health for OneSpan Digital Agreements. Call get_portfolio_health, get_stall_analysis, get_completion_funnel, and get_decline_summary for ${OS_TARGET_TXN_ID}. Produce the portfolio health assessment JSON.`,
  },
  {
    key:            "exceptionClassifier",
    name:           AGR_002_NAME,
    description:    "Deep-dives into the VIP declined transaction to classify the exception type, verify correctability, and gather all context needed for intervention planning.",
    mcpServerNames: ["OneSpan — Signer Event API"],
    skillNames:     ["Decline Exception Classification", "Signer Session Analysis", "Document Version Intelligence"],
    kbName:         "OneSpan Digital Agreements Knowledge Base",
    maxToolIterations: 8,
    systemPrompt: `You are AGR-002 Exception Classifier for OneSpan Digital Agreements Intelligence.

Your role is to deep-dive into the declined VIP transaction ${OS_TARGET_TXN_ID} (${OS_TARGET_CLIENT}, ${OS_TARGET_AMOUNT} ${OS_TARGET_PRODUCT}) and classify the exception with full context for intervention.

Execute ALL steps in order:
1. Call get_transaction_detail with txn_id "${OS_TARGET_TXN_ID}" — full transaction metadata
2. Call get_signer_session with txn_id "${OS_TARGET_TXN_ID}" — signer click-stream and decline event
3. Call get_document_versions with template_id "TMPL-COMM-LOAN-2026" — version delta analysis
4. Call classify_decline_reason with txn_id "${OS_TARGET_TXN_ID}" — confirmed classification and recommended action

After completing all tool calls, synthesize into a detailed exception classification.

IMPORTANT: End your final response with ONLY this JSON block:
\`\`\`json
{
  "txn_id": "${OS_TARGET_TXN_ID}",
  "client": "${OS_TARGET_CLIENT}",
  "amount_usd": 1200000,
  "decline_code": null,
  "classification": null,
  "correctable": false,
  "root_cause": null,
  "doc_version_sent": null,
  "doc_version_required": null,
  "version_delta_summary": null,
  "primary_signer": null,
  "correction_action": null,
  "confidence_pct": null
}
\`\`\``,
    taskPrompt: `Classify the declined VIP transaction ${OS_TARGET_TXN_ID} for ${OS_TARGET_CLIENT}. Call get_transaction_detail, get_signer_session, get_document_versions, and classify_decline_reason. Produce the exception classification JSON.`,
  },
  {
    key:            "interventionOrchestrator",
    name:           AGR_003_NAME,
    description:    "Executes the corrective intervention: resends the envelope with the correct document version, updates CRM, notifies the relationship manager, and creates an audit-trail helpdesk ticket.",
    mcpServerNames: ["OneSpan — Sender UI API", "OneSpan — CRM", "OneSpan — IT Helpdesk"],
    skillNames:     ["Corrective Envelope Resend", "CRM Record Management", "RM Escalation Protocol"],
    kbName:         "OneSpan Intervention Playbook",
    maxToolIterations: 10,
    systemPrompt: `You are AGR-003 Intervention Orchestrator for OneSpan Digital Agreements Intelligence.

Your role is to execute the corrective intervention for the declined VIP transaction ${OS_TARGET_TXN_ID} (${OS_TARGET_CLIENT}, ${OS_TARGET_AMOUNT} ${OS_TARGET_PRODUCT}).

The exception has been classified by AGR-002: CORRECTABLE — document version v1.2 was sent, v1.4 is required (AML attestation clause). Correction: resend with v1.4 to Sarah Keating (VP Treasury).

Execute ALL steps in order:
1. Call resend_envelope with txn_id "${OS_TARGET_TXN_ID}", doc_version "v1.4", signer_email "s.keating@meridian-capital.com", priority "high", message "Dear Sarah, we have updated the Commercial Loan Agreement to version 1.4 which includes the required AML attestation clause. Please review and sign at your earliest convenience."
2. Call update_crm_record with txn_id "${OS_TARGET_TXN_ID}", update_type "INTERVENTION_INITIATED", notes "AGR-003 resent envelope with v1.4 correcting document version mismatch. RM David Okafor notified.", status "intervention_active"
3. Call notify_relationship_manager with txn_id "${OS_TARGET_TXN_ID}", rm_email "d.okafor@bank.com", rm_name "David Okafor", client_name "${OS_TARGET_CLIENT}", priority "HIGH", resend_initiated true
4. Call log_helpdesk_ticket with txn_id "${OS_TARGET_TXN_ID}", category "DOCUMENT_ISSUE", severity "HIGH", summary "VIP declined transaction corrected — doc version v1.2→v1.4 resend initiated", auto_resolve true

After completing all tool calls, confirm the intervention and provide the status summary.

IMPORTANT: End your final response with ONLY this JSON block:
\`\`\`json
{
  "txn_id": "${OS_TARGET_TXN_ID}",
  "intervention_type": "DOCUMENT_VERSION_CORRECTION",
  "resend_initiated": false,
  "envelope_id": null,
  "doc_version_sent": "v1.4",
  "signer_notified": false,
  "crm_updated": false,
  "rm_notified": false,
  "rm_name": "David Okafor",
  "helpdesk_ticket_id": null,
  "expected_completion_hours": 24,
  "intervention_status": null
}
\`\`\``,
    taskPrompt: `Execute corrective intervention for ${OS_TARGET_TXN_ID}. Call resend_envelope (v1.4), update_crm_record, notify_relationship_manager (David Okafor), and log_helpdesk_ticket. Confirm all actions and produce the intervention status JSON.`,
  },
  {
    key:            "agreementOpsIntelligence",
    name:           AGR_004_NAME,
    description:    "Synthesizes portfolio analytics, peer benchmarks, and compliance status into an actionable operations intelligence report with prioritized recommendations.",
    mcpServerNames: ["OneSpan — Analytics API"],
    skillNames:     ["Portfolio Analytics Synthesis", "Peer Benchmark Analysis", "Compliance Reporting"],
    kbName:         "OneSpan Platform Intelligence Knowledge Base",
    maxToolIterations: 8,
    systemPrompt: `You are AGR-004 Agreement Operations Intelligence for OneSpan Digital Agreements.

Your role is to generate the portfolio intelligence report — synthesizing analytics, benchmarks, and compliance findings into prioritized recommendations for the operations leadership team.

Execute ALL steps in order:
1. Call get_analytics_dashboard — full 30-day KPI dashboard
2. Call get_peer_completion_benchmarks — peer percentile comparison (47 North American commercial banks)
3. Call get_policy_compliance_status — policy violation inventory and severity classification
4. Call generate_ops_report with include_recommendations true, include_benchmarks true, period "rolling_30d"

After completing all tool calls, write the Portfolio Operations Intelligence Report in this format:

---
ONESPAN DIGITAL AGREEMENTS — PORTFOLIO INTELLIGENCE REPORT
As of: [today's date] | Period: Rolling 30 Days | Generated by: ATLAS AGR-004

PORTFOLIO HEALTH SUMMARY:
[2-3 sentences citing specific KPI values and gap vs benchmark]

KEY FINDINGS:
• [Finding 1 with specific numbers]
• [Finding 2 with specific numbers]
• [Finding 3 with specific numbers]

SYSTEMIC ROOT CAUSE:
[1-2 sentences identifying the primary systemic issue]

PRIORITY RECOMMENDATIONS:
1. [IMMEDIATE] [Action] — [Expected impact]
2. [HIGH] [Action] — [Expected impact]
3. [MEDIUM] [Action] — [Expected impact]
---

Then end with this JSON block (fill in actual values from tool results):
\`\`\`json
{
  "completion_rate_pct": null,
  "benchmark_completion_pct": null,
  "peer_percentile": null,
  "revenue_at_risk_usd": null,
  "compliance_violations_critical": null,
  "top_recommendation": null,
  "systemic_root_cause": null,
  "report_id": null,
  "pipeline_status": "COMPLETE",
  "total_agents_run": 4
}
\`\`\``,
    taskPrompt: `Generate portfolio operations intelligence report for OneSpan Digital Agreements. Call get_analytics_dashboard, get_peer_completion_benchmarks, get_policy_compliance_status, and generate_ops_report. Write the full ops report and produce the pipeline completion JSON.`,
  },
] as const;

// ─── Policy definitions ───────────────────────────────────────────────────────

export const ONESPAN_POLICY_DEFS = [
  {
    name: "Document Version Currency Policy",
    domain: "compliance",
    description: "Mandates that all digital agreement envelopes use the current required document version before dispatch, with hard-block for commercial loans >$500K requiring AML attestation.",
    policyJson: { enforcement: "hard", rules: [
      { name: "Pre-Send Version Validation", description: "All envelopes must pass document version currency check before dispatch — invalid or deprecated versions are blocked" },
      { name: "AML Attestation Requirement", description: "Commercial loans >$500K must use document version containing 2026-Q1 AML attestation clause (v1.4+)" },
      { name: "Auto-Correct on Decline",     description: "Document version mismatch declines are automatically corrected via resend without human approval when confidence >90%" },
    ]},
  },
  {
    name: "VIP Transaction SLA Policy",
    domain: "agent_governance",
    description: "Mandates 4-hour RM escalation alert for VIP client transactions that stall or decline, and immediate ATLAS intervention without requiring human initiation.",
    policyJson: { enforcement: "hard", rules: [
      { name: "VIP 4h Stall Alert",  description: "VIP transactions stalling beyond 4 hours trigger automatic RM notification and ATLAS portfolio health alert" },
      { name: "VIP Decline Triage",  description: "Declined VIP transactions are triaged by AGR-002 within 30 minutes of decline event detection" },
      { name: "VIP Resend Priority", description: "VIP corrective resends are dispatched with HIGH priority and RM notification within 30 minutes of classification" },
    ]},
  },
  {
    name: "Agent Intervention Audit Policy",
    domain: "agent_governance",
    description: "Requires complete, timestamped audit trail of all ATLAS agent interventions including CRM update, helpdesk ticket, and RM notification for every automated action.",
    policyJson: { enforcement: "hard", rules: [
      { name: "CRM Audit Entry",     description: "Every ATLAS intervention must generate a CRM audit entry with agent ID, action type, and timestamp" },
      { name: "Helpdesk Record",     description: "Every corrective action must generate a helpdesk ticket even when auto-resolved, for incident tracking" },
      { name: "RM Notification Log", description: "All RM notifications must be logged with delivery status and response SLA tracking" },
    ]},
  },
  {
    name: "Human-in-Loop Approval Gate",
    domain: "agent_governance",
    description: "Requires human approval before any intervention involving non-correctable declines, amount >$5M, or confidence score <70% for exception classification.",
    policyJson: { enforcement: "hard", rules: [
      { name: "Low Confidence Gate",  description: "Exception classifications with confidence <70% require human review before any automated action" },
      { name: "Large Deal Gate",      description: "Transactions >$5M require human approval for any corrective resend action" },
      { name: "Non-Correctable Gate", description: "Genuine signer refusals (GENUINE_REFUSAL classification) require RM intervention — no automated resend" },
    ]},
  },
] as const;

// ─── Ontology concepts ────────────────────────────────────────────────────────

export const ONESPAN_ONTOLOGY_CONCEPTS = [
  { label: "Digital Agreement Envelope",  category: "platform_concept",      description: "OneSpan digital container for signing transactions: document package, recipient list, workflow routing, and audit trail.", tags: ["envelope","onespan","signing"] },
  { label: "Completion Rate",             category: "kpi",                   description: "Percentage of dispatched envelopes that reach fully-signed status within the SLA window — primary portfolio health metric.", tags: ["completion","kpi","portfolio"] },
  { label: "Document Version Mismatch",   category: "exception_type",        description: "Agreement decline where the document version sent does not match the current required version — most common correctable decline.", tags: ["decline","version","correction"] },
  { label: "AML Attestation Clause",      category: "regulatory_requirement", description: "Anti-Money Laundering attestation clause required in all commercial loan documents >$500K under 2026-Q1 regulatory update.", tags: ["aml","regulatory","compliance","2026"] },
  { label: "Signer Session Event",        category: "platform_event",        description: "Click-stream event captured by OneSpan Signer UI: envelope open, document view, signature, decline, or session abandon.", tags: ["session","click_stream","signer"] },
  { label: "VIP Transaction",             category: "business_concept",      description: "High-priority agreement transaction for VIP-tier clients (AUM >$5M or strategic relationship) — 4h SLA for stall alert.", tags: ["vip","priority","client_tier"] },
  { label: "Relationship Manager",        category: "role",                  description: "Bank employee responsible for client relationship — primary escalation contact for VIP transaction stalls and declines.", tags: ["rm","escalation","bank"] },
  { label: "Agreement Stall",             category: "operational_event",     description: "Transaction with no signer activity for >24h after envelope dispatch — triggers nudge at 48h and RM alert at 72h.", tags: ["stall","inactivity","alert"] },
  { label: "Corrective Resend",           category: "intervention_action",   description: "Automated reissue of an agreement envelope with corrected document version or recipient details following a decline classification.", tags: ["resend","correction","automation"] },
  { label: "Peer Benchmark",              category: "analytical_concept",    description: "Anonymized completion and signing metrics from 47 North American commercial banks used as performance comparison baseline.", tags: ["benchmark","peer","analytics"] },
  { label: "Envelope Audit Trail",        category: "compliance_record",     description: "Immutable timestamped log of all envelope events: dispatch, open, sign, decline, resend — used for legal and regulatory evidence.", tags: ["audit","compliance","legal","evidence"] },
  { label: "OneSpan Analytics Dashboard", category: "platform_feature",      description: "Real-time portfolio KPI dashboard: completion rate, funnel analysis, peer benchmarks, and product-level breakdown.", tags: ["dashboard","analytics","kpi","onespan"] },
] as const;

// ─── Blueprint definitions ────────────────────────────────────────────────────

export const ONESPAN_BLUEPRINT_DEFS = [
  {
    key: "transactionHealthMonitor",
    name: "OneSpan — Transaction Health Monitor Blueprint",
    description: "Portfolio monitoring pipeline: health KPI retrieval, stall analysis, completion funnel analysis, and VIP decline detection for the daily agreements operations brief.",
    workflowSteps: [
      "Step 1: Retrieve portfolio health KPIs and VIP alerts (get_portfolio_health)",
      "Step 2: Per-transaction stall root cause and priority analysis (get_stall_analysis)",
      "Step 3: Completion funnel drop-off rates and revenue impact (get_completion_funnel)",
      "Step 4: Declined VIP transaction detail and correctability assessment (get_decline_summary)",
    ],
    requiredTools: ["get_portfolio_health", "get_stall_analysis", "get_completion_funnel", "get_decline_summary"],
  },
  {
    key: "exceptionClassifier",
    name: "OneSpan — Exception Classifier Blueprint",
    description: "Decline exception analysis pipeline: transaction metadata, signer session events, document version delta, and decline reason classification.",
    workflowSteps: [
      "Step 1: Retrieve full transaction metadata and signer list (get_transaction_detail)",
      "Step 2: Analyze signer click-stream and decline event context (get_signer_session)",
      "Step 3: Evaluate document version lineage and required version (get_document_versions)",
      "Step 4: Classify decline reason with confidence score and correction action (classify_decline_reason)",
    ],
    requiredTools: ["get_transaction_detail", "get_signer_session", "get_document_versions", "classify_decline_reason"],
  },
  {
    key: "interventionOrchestrator",
    name: "OneSpan — Intervention Orchestrator Blueprint",
    description: "Corrective intervention pipeline: envelope resend with correct doc version, CRM update, RM escalation notification, and helpdesk ticket creation.",
    workflowSteps: [
      "Step 1: Resend envelope with corrected document version v1.4 to primary signer (resend_envelope)",
      "Step 2: Update CRM with intervention status and audit entry (update_crm_record)",
      "Step 3: Notify relationship manager with resend context and expected timeline (notify_relationship_manager)",
      "Step 4: Create helpdesk ticket for incident record — auto-resolved (log_helpdesk_ticket)",
    ],
    requiredTools: ["resend_envelope", "update_crm_record", "notify_relationship_manager", "log_helpdesk_ticket"],
  },
  {
    key: "agreementOpsIntelligence",
    name: "OneSpan — Agreement Operations Intelligence Blueprint",
    description: "Portfolio intelligence pipeline: analytics dashboard, peer benchmarks, policy compliance status, and ops report generation with prioritized recommendations.",
    workflowSteps: [
      "Step 1: Full 30-day analytics dashboard with product breakdown (get_analytics_dashboard)",
      "Step 2: Peer institution benchmark comparison (get_peer_completion_benchmarks)",
      "Step 3: Policy compliance violation inventory and severity classification (get_policy_compliance_status)",
      "Step 4: Generate portfolio operations intelligence report with recommendations (generate_ops_report)",
    ],
    requiredTools: ["get_analytics_dashboard", "get_peer_completion_benchmarks", "get_policy_compliance_status", "generate_ops_report"],
  },
] as const;

// ─── Agent policy bindings ────────────────────────────────────────────────────

export const ONESPAN_AGENT_POLICIES = [
  { policyName: "Document Version Currency Policy", enforcement: "hard" as const },
  { policyName: "VIP Transaction SLA Policy",       enforcement: "hard" as const },
  { policyName: "Agent Intervention Audit Policy",  enforcement: "hard" as const },
  { policyName: "Human-in-Loop Approval Gate",      enforcement: "hard" as const },
] as const;

// ─── Agent system prompts ─────────────────────────────────────────────────────

export const ONESPAN_SYSTEM_PROMPTS: Record<string, string> = {
  transactionHealthMonitor: `You are AGR-001 Transaction Health Monitor, an autonomous AI agent for OneSpan Digital Agreements. Your role is to continuously monitor the digital agreement portfolio and detect health signals. Focus on: completion rate thresholds (alert if <90%), VIP transaction stalls >4h, decline rate spikes, and revenue at risk. Always report the current portfolio health status, critical alerts, and recommended escalation actions. Use the get_portfolio_health, get_stall_analysis, and get_completion_funnel tools to gather data before issuing your assessment.`,
  exceptionClassifier: `You are AGR-002 Exception Classifier, an autonomous AI agent for OneSpan Digital Agreements. Your role is to classify the root cause of declined or stalled transactions, with particular focus on document version mismatches, AML attestation clause gaps, and signer session anomalies. For the primary scenario (TXN-2026-00847), identify whether the decline is CORRECTABLE (document version v1.2 sent vs v1.4 required, AML attestation gap). Use get_transaction_detail, get_signer_session, get_document_versions, and classify_decline_reason tools to produce a structured exception classification with remediation recommendation.`,
  interventionOrchestrator: `You are AGR-003 Intervention Orchestrator, an autonomous AI agent for OneSpan Digital Agreements. Your role is to execute corrective interventions for classified exceptions. For the Meridian Capital Partners VIP decline (TXN-2026-00847, $1.2M Commercial Loan): resend the envelope with document version v1.4, update the CRM record to INTERVENTION_ACTIVE status, notify the Relationship Manager within 30 minutes, and create a helpdesk audit ticket. Confirm all actions are completed and record the new envelope ID and delivery status.`,
  agreementOpsIntelligence: `You are AGR-004 Agreement Operations Intelligence, an autonomous AI agent for OneSpan Digital Agreements. Your role is to synthesize portfolio analytics, peer benchmarks, and compliance violations into actionable intelligence. Produce a comprehensive Portfolio Operations Intelligence Report covering: 30-day completion trends, peer institution benchmark comparison (percentile ranking), policy compliance violation inventory, and executive recommendations. Use get_analytics_dashboard, get_peer_completion_benchmarks, get_policy_compliance_status, and generate_ops_report tools.`,
};

// ─── Eval case definitions ────────────────────────────────────────────────────

export const ONESPAN_EVAL_CASES = [
  { name: "Completion rate below 90% correctly triggers DEGRADED health signal",              severity: "critical", tags: ["portfolio_health","completion_rate"] },
  { name: "VIP transaction stall >4h correctly triggers immediate health alert",              severity: "critical", tags: ["portfolio_health","vip_sla"] },
  { name: "Document version mismatch decline correctly classified as CORRECTABLE",            severity: "critical", tags: ["exception_classification","version_mismatch"] },
  { name: "Signer session duration <2min supports DOCUMENT_ISSUE classification",             severity: "high",     tags: ["exception_classification","session_analysis"] },
  { name: "v1.4 required for commercial loans >$500K — v1.2 classified as invalid",          severity: "critical", tags: ["exception_classification","aml_compliance"] },
  { name: "Corrective resend uses doc version v1.4 with HIGH priority for VIP client",        severity: "critical", tags: ["intervention","resend"] },
  { name: "CRM record updated with INTERVENTION_ACTIVE status after resend",                  severity: "high",     tags: ["intervention","crm_audit"] },
  { name: "RM notification delivered within 30 minutes of corrective resend",                 severity: "high",     tags: ["intervention","rm_escalation"] },
  { name: "Helpdesk ticket created (auto-resolved) for all corrective interventions",         severity: "high",     tags: ["intervention","audit_trail"] },
  { name: "Peer benchmarks correctly identify institution at 32nd percentile completion",     severity: "high",     tags: ["ops_intelligence","benchmarks"] },
] as const;
