import { db } from "./db";
import { 
  outcomeContracts, kpiDefinitions, agents, deployments, 
  runTraces, evalSuites, policies, approvals, auditEvents, invoices
} from "@shared/schema";

export async function seedDatabase() {
  const existingAgents = await db.select().from(agents);
  if (existingAgents.length > 0) return;

  // Outcome Contracts
  const [outcome1] = await db.insert(outcomeContracts).values({
    name: "Reduce Support Load",
    description: "Automate tier-1 customer support to reduce human agent workload by 40%",
    riskTier: "HIGH",
    status: "active",
    pricingModel: "PER_OUTCOME_EVENT",
    pricePerUnit: 2.50,
    currency: "USD",
    pricingTiers: [
      { minVolume: 0, maxVolume: 500, pricePerUnit: 2.50 },
      { minVolume: 501, maxVolume: 2000, pricePerUnit: 2.10 },
      { minVolume: 2001, maxVolume: null, pricePerUnit: 1.80 },
    ],
    volumeCap: 10000,
    slaConfig: {
      minSuccessRate: 0.92,
      maxP95LatencyMs: 8000,
      maxPolicyViolationRate: 0.001,
      uptimePercent: 99.5,
      breachPenaltyPercent: 15,
    },
    attributionRules: {
      model: "last_touch",
      windowHours: 24,
      requireTraceLink: true,
      excludeEscalated: false,
      description: "Attribute to last agent that handled the ticket before resolution",
    },
    approvalGates: [
      { stage: "contract_activation", required: true, approverRole: "business_owner" },
      { stage: "pilot_promotion", required: true, approverRole: "expert_validator" },
      { stage: "production_release", required: true, approverRole: "expert_validator" },
      { stage: "pricing_change", required: true, approverRole: "finance_lead" },
    ],
    riskThreshold: 0.75,
    maxDriftPercent: 8,
    autoPauseTrigger: true,
  }).returning();

  const [outcome2] = await db.insert(outcomeContracts).values({
    name: "Invoice Processing Automation",
    description: "Extract, validate and route invoices with 98% accuracy",
    riskTier: "MEDIUM",
    status: "active",
    pricingModel: "PER_OUTCOME_EVENT",
    pricePerUnit: 1.75,
    currency: "USD",
    pricingTiers: [
      { minVolume: 0, maxVolume: 1000, pricePerUnit: 1.75 },
      { minVolume: 1001, maxVolume: 5000, pricePerUnit: 1.50 },
    ],
    volumeCap: 20000,
    slaConfig: {
      minSuccessRate: 0.98,
      maxP95LatencyMs: 5000,
      uptimePercent: 99.9,
      breachPenaltyPercent: 10,
    },
    attributionRules: {
      model: "direct",
      windowHours: 1,
      requireTraceLink: true,
      excludeEscalated: true,
      description: "Direct 1:1 attribution - each invoice processing run maps to one outcome event",
    },
    approvalGates: [
      { stage: "contract_activation", required: true, approverRole: "finance_lead" },
      { stage: "production_release", required: true, approverRole: "expert_validator" },
    ],
    riskThreshold: 0.85,
    maxDriftPercent: 5,
    autoPauseTrigger: false,
  }).returning();

  const [outcome3] = await db.insert(outcomeContracts).values({
    name: "Lead Qualification Pipeline",
    description: "Score and qualify inbound leads with enrichment and routing",
    riskTier: "LOW",
    status: "active",
    pricingModel: "PER_OUTCOME_EVENT",
    pricePerUnit: 3.00,
    currency: "USD",
    pricingTiers: [
      { minVolume: 0, maxVolume: 200, pricePerUnit: 3.00 },
      { minVolume: 201, maxVolume: null, pricePerUnit: 2.50 },
    ],
    volumeCap: 5000,
    slaConfig: {
      minSuccessRate: 0.85,
      maxP95LatencyMs: 12000,
      uptimePercent: 99.0,
      breachPenaltyPercent: 5,
    },
    attributionRules: {
      model: "weighted_multi_touch",
      windowHours: 72,
      requireTraceLink: false,
      excludeEscalated: false,
      description: "Weighted multi-touch: scoring run gets 60%, enrichment gets 40% of outcome credit",
    },
    approvalGates: [
      { stage: "contract_activation", required: true, approverRole: "business_owner" },
      { stage: "production_release", required: false, approverRole: "expert_validator" },
    ],
    riskThreshold: 0.90,
    maxDriftPercent: 15,
    autoPauseTrigger: false,
  }).returning();

  const [outcome4] = await db.insert(outcomeContracts).values({
    name: "Content Moderation",
    description: "Automated content moderation for user-generated content platforms",
    riskTier: "HIGH",
    status: "active",
    pricingModel: "TIERED",
    pricePerUnit: 0.50,
    currency: "USD",
    pricingTiers: [
      { minVolume: 0, maxVolume: 10000, pricePerUnit: 0.50 },
      { minVolume: 10001, maxVolume: 50000, pricePerUnit: 0.35 },
      { minVolume: 50001, maxVolume: null, pricePerUnit: 0.20 },
    ],
    volumeCap: 500000,
    slaConfig: {
      minSuccessRate: 0.99,
      maxP95LatencyMs: 2000,
      uptimePercent: 99.99,
      breachPenaltyPercent: 20,
    },
    attributionRules: {
      model: "direct",
      windowHours: 0.5,
      requireTraceLink: true,
      excludeEscalated: false,
      description: "Direct attribution - each moderation decision is one outcome event",
    },
    approvalGates: [
      { stage: "contract_activation", required: true, approverRole: "legal" },
      { stage: "pilot_promotion", required: true, approverRole: "trust_safety_lead" },
      { stage: "production_release", required: true, approverRole: "expert_validator" },
      { stage: "model_change", required: true, approverRole: "trust_safety_lead" },
      { stage: "pricing_change", required: true, approverRole: "finance_lead" },
    ],
    riskThreshold: 0.70,
    maxDriftPercent: 3,
    autoPauseTrigger: true,
  }).returning();

  // KPI Definitions
  await db.insert(kpiDefinitions).values([
    { outcomeId: outcome1.id, name: "Autonomous Resolutions", unit: "count", baseline: 120, target: 500, currentValue: 423, weight: 0.4, slaThreshold: 400, breachLevel: "critical", confidence: 0.89, trend: "up", expression: "count(tickets WHERE resolved_by='agent' AND escalated=false)" },
    { outcomeId: outcome1.id, name: "Customer Satisfaction", unit: "score", baseline: 3.8, target: 4.5, currentValue: 4.3, weight: 0.35, slaThreshold: 4.0, breachLevel: "warning", confidence: 0.92, trend: "stable", expression: "avg(csat_score WHERE source='post_resolution_survey')" },
    { outcomeId: outcome1.id, name: "Avg Response Time", unit: "seconds", baseline: 120, target: 30, currentValue: 22, weight: 0.25, slaThreshold: 45, breachLevel: "warning", confidence: 0.95, trend: "up", expression: "avg(first_response_time_seconds)" },
    { outcomeId: outcome2.id, name: "Invoices Processed", unit: "count", baseline: 300, target: 1200, currentValue: 1087, weight: 0.5, slaThreshold: 1000, breachLevel: "critical", confidence: 0.94, trend: "up", expression: "count(invoices WHERE status='processed')" },
    { outcomeId: outcome2.id, name: "Extraction Accuracy", unit: "percent", baseline: 88, target: 98, currentValue: 97.2, weight: 0.5, slaThreshold: 95, breachLevel: "critical", confidence: 0.91, trend: "stable", expression: "avg(field_accuracy_score) * 100" },
    { outcomeId: outcome3.id, name: "Leads Qualified", unit: "count", baseline: 80, target: 300, currentValue: 267, weight: 0.6, slaThreshold: 200, breachLevel: "warning", confidence: 0.87, trend: "up", expression: "count(leads WHERE qualification_status='qualified')" },
    { outcomeId: outcome3.id, name: "Conversion Rate", unit: "percent", baseline: 8, target: 15, currentValue: 13.8, weight: 0.4, slaThreshold: 10, breachLevel: "warning", confidence: 0.82, trend: "up", expression: "count(leads WHERE converted=true) / count(leads) * 100" },
    { outcomeId: outcome4.id, name: "Items Moderated", unit: "count", baseline: 15000, target: 50000, currentValue: 47823, weight: 1.0, slaThreshold: 40000, breachLevel: "critical", confidence: 0.96, trend: "up", expression: "count(content_items WHERE moderation_decision IS NOT NULL)" },
  ]);

  // Agents
  const [agent1] = await db.insert(agents).values({
    name: "Support Triage Agent",
    description: "Routes and resolves tier-1 support tickets autonomously using knowledge base and CRM data",
    owner: "Support Engineering",
    outcomeId: outcome1.id,
    status: "active",
    riskTier: "HIGH",
    autonomyMode: "autonomous",
    currentVersion: "2.3.1",
    environment: "prod",
    healthScore: 92,
    successRate: 0.947,
    avgLatencyMs: 1850,
    costPerRun: 0.065,
    monthlyCost: 4250,
    monthlyRevenue: 12500,
    totalRuns: 18432,
    modelProvider: "openai",
    modelName: "gpt-4.1",
    blueprintJson: {
      nodes: [
        { id: "validate", type: "schema_validate", label: "Validate Input", schema: "SupportTicketV1" },
        { id: "retrieve", type: "rag", label: "KB Retrieval", sourceIds: ["kb", "policies"], citationsRequired: true },
        { id: "classify", type: "llm_classify", label: "Intent Classification", classes: ["billing", "technical", "account", "general"] },
        { id: "plan", type: "llm_plan", label: "Response Planning" },
        { id: "act", type: "tool_call", label: "Execute Action", tool: "zendesk.create_reply", dryRunInShadow: true },
        { id: "policy", type: "policy_check", label: "Policy Gate", bundle: "support_default" },
        { id: "format", type: "response_format", label: "Format Output", schema: "SupportReplyV1" },
      ],
      edges: [
        { from: "validate", to: "retrieve" },
        { from: "retrieve", to: "classify" },
        { from: "classify", to: "plan" },
        { from: "plan", to: "act" },
        { from: "act", to: "policy" },
        { from: "policy", to: "format" },
      ],
    },
    toolsConfig: [
      { name: "zendesk.create_reply", type: "write", description: "Create a reply on a Zendesk ticket", rateLimit: "100/min", timeout: 5000 },
      { name: "zendesk.get_ticket", type: "read", description: "Fetch ticket details from Zendesk", rateLimit: "200/min", timeout: 3000 },
      { name: "zendesk.update_status", type: "write", description: "Update ticket status and tags", rateLimit: "100/min", timeout: 3000 },
      { name: "crm.lookup_customer", type: "read", description: "Look up customer info from CRM", rateLimit: "150/min", timeout: 2000 },
      { name: "kb.search", type: "read", description: "Search knowledge base articles", rateLimit: "500/min", timeout: 1500 },
    ],
    permissionsConfig: {
      allowedActions: ["read_ticket", "reply_ticket", "update_tags", "close_ticket"],
      deniedActions: ["delete_ticket", "reassign_agent", "modify_sla", "access_billing"],
      escalationTriggers: ["customer_angry", "legal_mention", "refund_request_over_500"],
      maxTokenBudget: 6000,
      maxCostPerRun: 0.10,
      requireHumanApproval: ["refund_actions", "account_deletion"],
    },
    memoryRagConfig: {
      embeddingModel: "text-embedding-3-small",
      chunkStrategy: "semantic",
      chunkSize: 512,
      chunkOverlap: 64,
      vectorStore: "pgvector",
      sources: [
        { id: "kb", name: "Knowledge Base", type: "document_store", docCount: 2450, lastSynced: "2026-02-06T12:00:00Z" },
        { id: "policies", name: "Support Policies", type: "document_store", docCount: 89, lastSynced: "2026-02-05T08:00:00Z" },
        { id: "past_tickets", name: "Resolved Tickets", type: "conversation_history", docCount: 45000, lastSynced: "2026-02-07T01:00:00Z" },
      ],
      citationsRequired: true,
      maxRetrievedChunks: 8,
      similarityThreshold: 0.78,
    },
    policyBindings: [
      { policyId: "pol_pii_redaction", name: "PII Redaction", enforcement: "hard_block", description: "Redact all PII before sending responses" },
      { policyId: "pol_tone_professional", name: "Professional Tone", enforcement: "soft_warn", description: "Ensure professional and empathetic tone" },
      { policyId: "pol_no_legal_advice", name: "No Legal Advice", enforcement: "hard_block", description: "Never provide legal advice or liability statements" },
      { policyId: "pol_escalation_path", name: "Escalation Path", enforcement: "hard_block", description: "Escalate high-risk or angry customers to human agents" },
    ],
    evalBindings: [
      { suiteId: "eval_response_quality", name: "Response Quality Suite", type: "llm_judge", passThreshold: 0.85, schedule: "hourly", lastRun: "2026-02-07T06:00:00Z", lastPassRate: 0.91 },
      { suiteId: "eval_resolution_accuracy", name: "Resolution Accuracy", type: "golden_dataset", passThreshold: 0.90, schedule: "daily", lastRun: "2026-02-06T23:00:00Z", lastPassRate: 0.94 },
      { suiteId: "eval_policy_compliance", name: "Policy Compliance", type: "rule_based", passThreshold: 0.99, schedule: "continuous", lastRun: "2026-02-07T07:00:00Z", lastPassRate: 0.997 },
    ],
    rollbackPlan: {
      previousVersion: "2.2.8",
      rollbackStrategy: "instant_swap",
      autoRollbackTriggers: [
        { metric: "success_rate", operator: "below", threshold: 0.90, window: "15m" },
        { metric: "p95_latency_ms", operator: "above", threshold: 5000, window: "10m" },
        { metric: "policy_violation_rate", operator: "above", threshold: 0.005, window: "5m" },
      ],
      healthCheckInterval: "30s",
      rollbackApprover: "auto",
      lastRollbackAt: null,
      canaryConfig: { startPercent: 5, stepPercent: 10, stepInterval: "10m", maxPercent: 100 },
    },
  }).returning();

  const [agent2] = await db.insert(agents).values({
    name: "Invoice Extractor",
    description: "Extracts structured data from PDF/image invoices and routes for approval",
    owner: "Finance Ops",
    outcomeId: outcome2.id,
    status: "active",
    riskTier: "MEDIUM",
    autonomyMode: "assisted",
    currentVersion: "1.8.0",
    environment: "prod",
    healthScore: 96,
    successRate: 0.982,
    avgLatencyMs: 3200,
    costPerRun: 0.042,
    monthlyCost: 2100,
    monthlyRevenue: 8750,
    totalRuns: 12890,
    modelProvider: "openai",
    modelName: "gpt-4o",
    blueprintJson: {
      nodes: [
        { id: "ingest", type: "file_intake", label: "Document Intake", formats: ["pdf", "png", "jpg"] },
        { id: "ocr", type: "vision_extract", label: "OCR Extraction", model: "gpt-4o" },
        { id: "structure", type: "schema_map", label: "Field Mapping", schema: "InvoiceV2" },
        { id: "validate", type: "rule_validate", label: "Business Rules", rules: ["amount_check", "vendor_match", "duplicate_detect"] },
        { id: "enrich", type: "lookup", label: "Vendor Enrichment", source: "vendor_db" },
        { id: "route", type: "conditional", label: "Approval Routing", conditions: ["amount > 10000 -> cfo", "new_vendor -> finance_lead"] },
      ],
      edges: [
        { from: "ingest", to: "ocr" },
        { from: "ocr", to: "structure" },
        { from: "structure", to: "validate" },
        { from: "validate", to: "enrich" },
        { from: "enrich", to: "route" },
      ],
    },
    toolsConfig: [
      { name: "salesforce.create_record", type: "write", description: "Create invoice record in Salesforce", rateLimit: "50/min", timeout: 8000 },
      { name: "salesforce.query", type: "read", description: "Query Salesforce for vendor/PO data", rateLimit: "100/min", timeout: 5000 },
      { name: "s3.upload", type: "write", description: "Upload processed documents to S3", rateLimit: "200/min", timeout: 10000 },
      { name: "email.send_notification", type: "write", description: "Send approval notification emails", rateLimit: "20/min", timeout: 3000 },
    ],
    permissionsConfig: {
      allowedActions: ["read_invoice", "extract_fields", "create_record", "send_notification"],
      deniedActions: ["approve_payment", "modify_vendor", "delete_record"],
      escalationTriggers: ["amount_over_50000", "new_vendor_first_invoice", "duplicate_detected"],
      maxTokenBudget: 8000,
      maxCostPerRun: 0.08,
      requireHumanApproval: ["payment_approval", "vendor_onboarding"],
    },
    memoryRagConfig: {
      embeddingModel: "text-embedding-3-small",
      chunkStrategy: "fixed",
      chunkSize: 1024,
      chunkOverlap: 128,
      vectorStore: "pgvector",
      sources: [
        { id: "vendor_db", name: "Vendor Database", type: "structured_db", docCount: 3200, lastSynced: "2026-02-07T00:00:00Z" },
        { id: "invoice_templates", name: "Invoice Templates", type: "document_store", docCount: 156, lastSynced: "2026-02-01T00:00:00Z" },
      ],
      citationsRequired: false,
      maxRetrievedChunks: 5,
      similarityThreshold: 0.82,
    },
    policyBindings: [
      { policyId: "pol_financial_accuracy", name: "Financial Accuracy", enforcement: "hard_block", description: "Ensure extracted amounts match source document" },
      { policyId: "pol_pii_redaction", name: "PII Redaction", enforcement: "hard_block", description: "Redact sensitive financial data from logs" },
      { policyId: "pol_audit_trail", name: "Audit Trail", enforcement: "hard_block", description: "Log every extraction decision for compliance" },
    ],
    evalBindings: [
      { suiteId: "eval_extraction_acc", name: "Field Extraction Accuracy", type: "golden_dataset", passThreshold: 0.96, schedule: "daily", lastRun: "2026-02-06T22:00:00Z", lastPassRate: 0.98 },
      { suiteId: "eval_duplicate_detect", name: "Duplicate Detection", type: "rule_based", passThreshold: 0.99, schedule: "hourly", lastRun: "2026-02-07T06:00:00Z", lastPassRate: 0.995 },
    ],
    rollbackPlan: {
      previousVersion: "1.7.3",
      rollbackStrategy: "blue_green",
      autoRollbackTriggers: [
        { metric: "extraction_accuracy", operator: "below", threshold: 0.95, window: "30m" },
        { metric: "error_rate", operator: "above", threshold: 0.05, window: "15m" },
      ],
      healthCheckInterval: "1m",
      rollbackApprover: "finance_lead",
      lastRollbackAt: "2026-01-15T14:30:00Z",
      canaryConfig: { startPercent: 10, stepPercent: 20, stepInterval: "30m", maxPercent: 100 },
    },
  }).returning();

  const [agent3] = await db.insert(agents).values({
    name: "Lead Scorer",
    description: "Enriches and scores inbound leads with firmographic and behavioral data",
    owner: "Revenue Ops",
    outcomeId: outcome3.id,
    status: "active",
    riskTier: "LOW",
    autonomyMode: "autonomous",
    currentVersion: "3.1.2",
    environment: "prod",
    healthScore: 88,
    successRate: 0.921,
    avgLatencyMs: 4100,
    costPerRun: 0.078,
    monthlyCost: 3600,
    monthlyRevenue: 9200,
    totalRuns: 8540,
    modelProvider: "anthropic",
    modelName: "claude-3.5-sonnet",
    blueprintJson: {
      nodes: [
        { id: "intake", type: "webhook", label: "Lead Intake", source: "hubspot_webhook" },
        { id: "enrich", type: "api_call", label: "Firmographic Enrichment", apis: ["clearbit", "zoominfo"] },
        { id: "behavioral", type: "data_aggregate", label: "Behavioral Signals", sources: ["web_analytics", "email_engagement"] },
        { id: "score", type: "llm_score", label: "Lead Scoring", model: "claude-3.5-sonnet", scoringRubric: "icp_fit_v3" },
        { id: "segment", type: "conditional", label: "Segment & Route", conditions: ["score >= 80 -> hot", "score >= 50 -> warm", "score < 50 -> nurture"] },
        { id: "notify", type: "notification", label: "Sales Alert", channels: ["slack", "hubspot_task"] },
      ],
      edges: [
        { from: "intake", to: "enrich" },
        { from: "enrich", to: "behavioral" },
        { from: "behavioral", to: "score" },
        { from: "score", to: "segment" },
        { from: "segment", to: "notify" },
      ],
    },
    toolsConfig: [
      { name: "hubspot.update_contact", type: "write", description: "Update lead score and properties in HubSpot", rateLimit: "100/min", timeout: 4000 },
      { name: "hubspot.create_task", type: "write", description: "Create follow-up task for sales rep", rateLimit: "50/min", timeout: 3000 },
      { name: "clearbit.enrich", type: "read", description: "Enrich contact with firmographic data", rateLimit: "30/min", timeout: 5000 },
      { name: "slack.send_message", type: "write", description: "Send hot lead alert to Slack channel", rateLimit: "60/min", timeout: 2000 },
    ],
    permissionsConfig: {
      allowedActions: ["read_lead", "update_score", "create_task", "send_alert"],
      deniedActions: ["delete_lead", "modify_pipeline", "change_ownership"],
      escalationTriggers: ["enterprise_lead", "competitor_mention"],
      maxTokenBudget: 4000,
      maxCostPerRun: 0.12,
      requireHumanApproval: ["pipeline_stage_change"],
    },
    memoryRagConfig: {
      embeddingModel: "text-embedding-3-small",
      chunkStrategy: "semantic",
      chunkSize: 256,
      chunkOverlap: 32,
      vectorStore: "pgvector",
      sources: [
        { id: "icp_profiles", name: "ICP Profiles", type: "document_store", docCount: 45, lastSynced: "2026-02-01T00:00:00Z" },
        { id: "win_loss_reports", name: "Win/Loss Reports", type: "document_store", docCount: 320, lastSynced: "2026-02-05T00:00:00Z" },
      ],
      citationsRequired: false,
      maxRetrievedChunks: 4,
      similarityThreshold: 0.75,
    },
    policyBindings: [
      { policyId: "pol_data_freshness", name: "Data Freshness", enforcement: "soft_warn", description: "Warn if enrichment data is older than 90 days" },
      { policyId: "pol_score_explainability", name: "Score Explainability", enforcement: "hard_block", description: "Every score must include reasoning factors" },
    ],
    evalBindings: [
      { suiteId: "eval_scoring_accuracy", name: "Scoring vs Outcomes", type: "backtesting", passThreshold: 0.80, schedule: "weekly", lastRun: "2026-02-03T00:00:00Z", lastPassRate: 0.84 },
      { suiteId: "eval_enrichment_coverage", name: "Enrichment Coverage", type: "rule_based", passThreshold: 0.90, schedule: "daily", lastRun: "2026-02-06T12:00:00Z", lastPassRate: 0.93 },
    ],
    rollbackPlan: {
      previousVersion: "3.0.9",
      rollbackStrategy: "instant_swap",
      autoRollbackTriggers: [
        { metric: "scoring_accuracy", operator: "below", threshold: 0.75, window: "1h" },
        { metric: "enrichment_failure_rate", operator: "above", threshold: 0.10, window: "30m" },
      ],
      healthCheckInterval: "2m",
      rollbackApprover: "auto",
      lastRollbackAt: null,
      canaryConfig: { startPercent: 25, stepPercent: 25, stepInterval: "15m", maxPercent: 100 },
    },
  }).returning();

  const [agent4] = await db.insert(agents).values({
    name: "Content Moderator",
    description: "Classifies and flags user-generated content for policy violations",
    owner: "Trust & Safety",
    outcomeId: outcome4.id,
    status: "active",
    riskTier: "HIGH",
    autonomyMode: "autonomous",
    currentVersion: "4.0.0",
    environment: "prod",
    healthScore: 94,
    successRate: 0.993,
    avgLatencyMs: 420,
    costPerRun: 0.008,
    monthlyCost: 1800,
    monthlyRevenue: 15000,
    totalRuns: 47823,
    modelProvider: "openai",
    modelName: "gpt-4o-mini",
    blueprintJson: {
      nodes: [
        { id: "intake", type: "queue_consumer", label: "Content Queue", queue: "ugc_moderation" },
        { id: "prefilter", type: "rule_filter", label: "Keyword Filter", lists: ["blocklist_v4", "regex_patterns"] },
        { id: "classify", type: "llm_classify", label: "Content Classification", classes: ["safe", "borderline", "violation", "severe"] },
        { id: "evidence", type: "evidence_collect", label: "Evidence Package", includeScreenshot: true },
        { id: "decide", type: "conditional", label: "Decision Gate", conditions: ["severe -> auto_remove", "violation -> review_queue", "borderline -> human_review", "safe -> approve"] },
        { id: "action", type: "tool_call", label: "Execute Decision", tool: "platform.moderate_content" },
        { id: "log", type: "audit_log", label: "Audit Record" },
      ],
      edges: [
        { from: "intake", to: "prefilter" },
        { from: "prefilter", to: "classify" },
        { from: "classify", to: "evidence" },
        { from: "evidence", to: "decide" },
        { from: "decide", to: "action" },
        { from: "action", to: "log" },
      ],
    },
    toolsConfig: [
      { name: "platform.moderate_content", type: "write", description: "Apply moderation decision to content", rateLimit: "1000/min", timeout: 1000 },
      { name: "platform.flag_user", type: "write", description: "Flag user account for review", rateLimit: "100/min", timeout: 2000 },
      { name: "platform.get_content", type: "read", description: "Fetch content and metadata", rateLimit: "2000/min", timeout: 500 },
      { name: "screenshot.capture", type: "read", description: "Capture content screenshot for evidence", rateLimit: "500/min", timeout: 3000 },
      { name: "notification.alert_trust", type: "write", description: "Alert Trust & Safety team for severe cases", rateLimit: "50/min", timeout: 2000 },
    ],
    permissionsConfig: {
      allowedActions: ["classify_content", "remove_content", "flag_user", "capture_evidence"],
      deniedActions: ["ban_user", "delete_account", "modify_policy", "access_user_data"],
      escalationTriggers: ["csam_detected", "threat_of_violence", "legal_request", "public_figure"],
      maxTokenBudget: 2000,
      maxCostPerRun: 0.015,
      requireHumanApproval: ["user_ban", "account_suspension", "legal_escalation"],
    },
    memoryRagConfig: {
      embeddingModel: "text-embedding-3-small",
      chunkStrategy: "fixed",
      chunkSize: 256,
      chunkOverlap: 0,
      vectorStore: "pgvector",
      sources: [
        { id: "policy_docs", name: "Content Policy", type: "document_store", docCount: 42, lastSynced: "2026-02-06T00:00:00Z" },
        { id: "precedent_db", name: "Moderation Precedents", type: "structured_db", docCount: 15000, lastSynced: "2026-02-07T00:00:00Z" },
      ],
      citationsRequired: true,
      maxRetrievedChunks: 3,
      similarityThreshold: 0.85,
    },
    policyBindings: [
      { policyId: "pol_content_safety", name: "Content Safety Standards", enforcement: "hard_block", description: "Enforce platform content safety guidelines" },
      { policyId: "pol_transparency", name: "Decision Transparency", enforcement: "hard_block", description: "Every decision must include human-readable reasoning" },
      { policyId: "pol_appeal_rights", name: "User Appeal Rights", enforcement: "hard_block", description: "Removed content must allow user appeal within 24h" },
      { policyId: "pol_bias_check", name: "Bias Detection", enforcement: "soft_warn", description: "Flag potential demographic bias in decisions" },
      { policyId: "pol_evidence_retention", name: "Evidence Retention", enforcement: "hard_block", description: "Retain evidence packages for 90 days minimum" },
    ],
    evalBindings: [
      { suiteId: "eval_false_positive", name: "False Positive Rate", type: "golden_dataset", passThreshold: 0.98, schedule: "hourly", lastRun: "2026-02-07T06:00:00Z", lastPassRate: 0.992 },
      { suiteId: "eval_severity_accuracy", name: "Severity Classification", type: "llm_judge", passThreshold: 0.95, schedule: "daily", lastRun: "2026-02-06T23:00:00Z", lastPassRate: 0.97 },
      { suiteId: "eval_latency_budget", name: "Latency Budget", type: "rule_based", passThreshold: 0.99, schedule: "continuous", lastRun: "2026-02-07T07:00:00Z", lastPassRate: 0.998 },
      { suiteId: "eval_bias_audit", name: "Bias Audit", type: "statistical", passThreshold: 0.95, schedule: "weekly", lastRun: "2026-02-03T00:00:00Z", lastPassRate: 0.96 },
    ],
    rollbackPlan: {
      previousVersion: "3.9.2",
      rollbackStrategy: "instant_swap",
      autoRollbackTriggers: [
        { metric: "false_positive_rate", operator: "above", threshold: 0.03, window: "5m" },
        { metric: "p95_latency_ms", operator: "above", threshold: 1000, window: "5m" },
        { metric: "error_rate", operator: "above", threshold: 0.01, window: "3m" },
      ],
      healthCheckInterval: "15s",
      rollbackApprover: "auto",
      lastRollbackAt: "2026-01-28T09:15:00Z",
      canaryConfig: { startPercent: 1, stepPercent: 5, stepInterval: "5m", maxPercent: 100 },
    },
  }).returning();

  const [agent5] = await db.insert(agents).values({
    name: "Knowledge Base Updater",
    description: "Monitors resolved tickets and updates KB articles automatically",
    owner: "Support Engineering",
    outcomeId: outcome1.id,
    status: "active",
    riskTier: "MEDIUM",
    autonomyMode: "assisted",
    currentVersion: "1.2.0",
    environment: "staging",
    healthScore: 79,
    successRate: 0.856,
    avgLatencyMs: 8500,
    costPerRun: 0.12,
    monthlyCost: 950,
    monthlyRevenue: 0,
    totalRuns: 2340,
    modelProvider: "openai",
    modelName: "gpt-4.1",
    blueprintJson: {
      nodes: [
        { id: "monitor", type: "event_listener", label: "Ticket Monitor", event: "ticket.resolved" },
        { id: "analyze", type: "llm_analyze", label: "Gap Analysis", description: "Compare resolution with existing KB" },
        { id: "draft", type: "llm_generate", label: "Draft Article", templates: ["how_to", "troubleshoot", "faq"] },
        { id: "review", type: "human_review", label: "Expert Review", approverRole: "kb_editor" },
        { id: "publish", type: "tool_call", label: "Publish Article", tool: "kb.publish_article" },
      ],
      edges: [
        { from: "monitor", to: "analyze" },
        { from: "analyze", to: "draft" },
        { from: "draft", to: "review" },
        { from: "review", to: "publish" },
      ],
    },
    toolsConfig: [
      { name: "kb.search_articles", type: "read", description: "Search existing KB articles", rateLimit: "200/min", timeout: 2000 },
      { name: "kb.publish_article", type: "write", description: "Publish new or updated KB article", rateLimit: "10/min", timeout: 5000 },
      { name: "kb.update_article", type: "write", description: "Update an existing KB article", rateLimit: "20/min", timeout: 5000 },
      { name: "zendesk.get_resolution", type: "read", description: "Fetch ticket resolution details", rateLimit: "100/min", timeout: 3000 },
    ],
    permissionsConfig: {
      allowedActions: ["read_tickets", "search_kb", "draft_article", "submit_for_review"],
      deniedActions: ["publish_without_review", "delete_article", "modify_categories"],
      escalationTriggers: ["conflicting_information", "security_related_content"],
      maxTokenBudget: 10000,
      maxCostPerRun: 0.15,
      requireHumanApproval: ["article_publish", "article_major_update"],
    },
    memoryRagConfig: {
      embeddingModel: "text-embedding-3-small",
      chunkStrategy: "semantic",
      chunkSize: 768,
      chunkOverlap: 96,
      vectorStore: "pgvector",
      sources: [
        { id: "kb_articles", name: "KB Articles", type: "document_store", docCount: 2450, lastSynced: "2026-02-07T02:00:00Z" },
        { id: "resolved_tickets", name: "Resolved Tickets (90d)", type: "conversation_history", docCount: 8900, lastSynced: "2026-02-07T01:00:00Z" },
        { id: "style_guide", name: "Writing Style Guide", type: "document_store", docCount: 12, lastSynced: "2026-01-15T00:00:00Z" },
      ],
      citationsRequired: true,
      maxRetrievedChunks: 10,
      similarityThreshold: 0.72,
    },
    policyBindings: [
      { policyId: "pol_content_accuracy", name: "Content Accuracy", enforcement: "hard_block", description: "All KB content must be factually verified" },
      { policyId: "pol_style_consistency", name: "Style Consistency", enforcement: "soft_warn", description: "Follow KB writing style guide" },
      { policyId: "pol_no_internal_info", name: "No Internal Info", enforcement: "hard_block", description: "Never expose internal processes or tooling" },
    ],
    evalBindings: [
      { suiteId: "eval_article_quality", name: "Article Quality", type: "llm_judge", passThreshold: 0.85, schedule: "per_run", lastRun: "2026-02-06T18:00:00Z", lastPassRate: 0.82 },
      { suiteId: "eval_gap_detection", name: "Gap Detection Recall", type: "golden_dataset", passThreshold: 0.80, schedule: "weekly", lastRun: "2026-02-03T00:00:00Z", lastPassRate: 0.78 },
    ],
    rollbackPlan: {
      previousVersion: "1.1.4",
      rollbackStrategy: "blue_green",
      autoRollbackTriggers: [
        { metric: "article_quality_score", operator: "below", threshold: 0.70, window: "1h" },
        { metric: "error_rate", operator: "above", threshold: 0.15, window: "30m" },
      ],
      healthCheckInterval: "5m",
      rollbackApprover: "support_engineering_lead",
      lastRollbackAt: null,
      canaryConfig: { startPercent: 50, stepPercent: 50, stepInterval: "1h", maxPercent: 100 },
    },
  }).returning();

  // Deployments - with promotion chains, signatures, canary & rollback configs
  const canaryDefault = {
    startPercent: 5,
    stepPercent: 15,
    intervalMinutes: 30,
    healthCheckUrl: "/health",
    successThreshold: 0.995,
    maxErrorRate: 0.02,
  };

  const rollbackDefault = {
    autoRollbackEnabled: true,
    errorRateThreshold: 0.05,
    latencyP99Threshold: 5000,
    rollbackToVersion: "previous",
    cooldownMinutes: 15,
    triggers: [
      { metric: "error_rate", operator: ">", value: 0.05, windowMinutes: 10 },
      { metric: "p99_latency_ms", operator: ">", value: 5000, windowMinutes: 5 },
      { metric: "success_rate", operator: "<", value: 0.95, windowMinutes: 15 },
    ],
  };

  // Agent 1: Support Triage — full promotion chain staging → pilot → prod (v2.3.1)
  const [dep1staging] = await db.insert(deployments).values({
    agentId: agent1.id, agentName: "Support Triage Agent", environment: "staging", version: "2.3.1",
    status: "promoted", rolloutStrategy: "canary", canaryPercent: 100,
    signatureHash: "sha256:a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
    canaryConfig: canaryDefault,
    rollbackConfig: rollbackDefault,
    approvedBy: "CI Pipeline",
    deployedAt: new Date(Date.now() - 14 * 86400000),
    promotedAt: new Date(Date.now() - 10 * 86400000),
    createdAt: new Date(Date.now() - 14 * 86400000),
  }).returning();

  const [dep1pilot] = await db.insert(deployments).values({
    agentId: agent1.id, agentName: "Support Triage Agent", environment: "pilot", version: "2.3.1",
    status: "promoted", rolloutStrategy: "canary", canaryPercent: 100,
    signatureHash: "sha256:a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
    promotedFrom: dep1staging.id,
    canaryConfig: { ...canaryDefault, startPercent: 10, stepPercent: 20, intervalMinutes: 60 },
    rollbackConfig: rollbackDefault,
    approvedBy: "Expert Validator",
    deployedAt: new Date(Date.now() - 10 * 86400000),
    promotedAt: new Date(Date.now() - 7 * 86400000),
    createdAt: new Date(Date.now() - 10 * 86400000),
  }).returning();

  await db.insert(deployments).values({
    agentId: agent1.id, agentName: "Support Triage Agent", environment: "prod", version: "2.3.1",
    status: "deployed", rolloutStrategy: "canary", canaryPercent: 100,
    signatureHash: "sha256:a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
    promotedFrom: dep1pilot.id,
    canaryConfig: { ...canaryDefault, startPercent: 2, stepPercent: 5, intervalMinutes: 120, successThreshold: 0.999 },
    rollbackConfig: { ...rollbackDefault, errorRateThreshold: 0.02, latencyP99Threshold: 3000, triggers: [
      { metric: "error_rate", operator: ">", value: 0.02, windowMinutes: 5 },
      { metric: "p99_latency_ms", operator: ">", value: 3000, windowMinutes: 5 },
      { metric: "success_rate", operator: "<", value: 0.98, windowMinutes: 10 },
      { metric: "human_escalation_rate", operator: ">", value: 0.30, windowMinutes: 15 },
    ]},
    approvedBy: "Expert Validator",
    deployedAt: new Date(Date.now() - 7 * 86400000),
    createdAt: new Date(Date.now() - 7 * 86400000),
  });

  // Agent 1: v2.4.0-beta in staging (not yet promoted)
  await db.insert(deployments).values({
    agentId: agent1.id, agentName: "Support Triage Agent", environment: "staging", version: "2.4.0-beta",
    status: "deployed", rolloutStrategy: "canary", canaryPercent: 60,
    signatureHash: "sha256:f1e2d3c4b5a6f7e8d9c0b1a2f3e4d5c6b7a8f9e0d1c2b3a4f5e6d7c8b9a0f1e2",
    canaryConfig: canaryDefault,
    rollbackConfig: rollbackDefault,
    deployedAt: new Date(Date.now() - 2 * 86400000),
    createdAt: new Date(Date.now() - 2 * 86400000),
  });

  // Agent 2: Invoice Extractor — in pilot with canary at 25%
  const [dep2staging] = await db.insert(deployments).values({
    agentId: agent2.id, agentName: "Invoice Extractor", environment: "staging", version: "1.9.0-rc1",
    status: "promoted", rolloutStrategy: "canary", canaryPercent: 100,
    signatureHash: "sha256:b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3",
    canaryConfig: canaryDefault,
    rollbackConfig: { ...rollbackDefault, triggers: [
      { metric: "extraction_accuracy", operator: "<", value: 0.95, windowMinutes: 15 },
      { metric: "error_rate", operator: ">", value: 0.03, windowMinutes: 10 },
      { metric: "p99_latency_ms", operator: ">", value: 8000, windowMinutes: 5 },
    ]},
    approvedBy: "Finance Lead",
    deployedAt: new Date(Date.now() - 5 * 86400000),
    promotedAt: new Date(Date.now() - 3 * 86400000),
    createdAt: new Date(Date.now() - 5 * 86400000),
  }).returning();

  await db.insert(deployments).values({
    agentId: agent2.id, agentName: "Invoice Extractor", environment: "pilot", version: "1.9.0-rc1",
    status: "canary", rolloutStrategy: "canary", canaryPercent: 25,
    signatureHash: "sha256:b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3",
    promotedFrom: dep2staging.id,
    canaryConfig: { ...canaryDefault, startPercent: 10, stepPercent: 15, intervalMinutes: 45 },
    rollbackConfig: { ...rollbackDefault, triggers: [
      { metric: "extraction_accuracy", operator: "<", value: 0.95, windowMinutes: 15 },
      { metric: "error_rate", operator: ">", value: 0.03, windowMinutes: 10 },
    ]},
    approvedBy: "Finance Lead",
    deployedAt: new Date(Date.now() - 3 * 86400000),
    createdAt: new Date(Date.now() - 3 * 86400000),
  });

  // Agent 2: prod still on 1.8.0
  await db.insert(deployments).values({
    agentId: agent2.id, agentName: "Invoice Extractor", environment: "prod", version: "1.8.0",
    status: "deployed", rolloutStrategy: "canary", canaryPercent: 100,
    signatureHash: "sha256:c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4",
    canaryConfig: canaryDefault,
    rollbackConfig: rollbackDefault,
    approvedBy: "Finance Lead",
    deployedAt: new Date(Date.now() - 30 * 86400000),
    createdAt: new Date(Date.now() - 30 * 86400000),
  });

  // Agent 3: Lead Scorer — direct deploy to prod
  await db.insert(deployments).values({
    agentId: agent3.id, agentName: "Lead Scorer", environment: "prod", version: "3.1.2",
    status: "deployed", rolloutStrategy: "direct", canaryPercent: 100,
    signatureHash: "sha256:d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5",
    canaryConfig: null,
    rollbackConfig: { ...rollbackDefault, triggers: [
      { metric: "lead_score_drift", operator: ">", value: 0.15, windowMinutes: 60 },
      { metric: "error_rate", operator: ">", value: 0.05, windowMinutes: 10 },
    ]},
    approvedBy: "Revenue Ops Lead",
    deployedAt: new Date(Date.now() - 21 * 86400000),
    createdAt: new Date(Date.now() - 21 * 86400000),
  });

  // Agent 4: Content Moderator — rolled back release
  await db.insert(deployments).values({
    agentId: agent4.id, agentName: "Content Moderator", environment: "prod", version: "4.0.0",
    status: "deployed", rolloutStrategy: "canary", canaryPercent: 100,
    signatureHash: "sha256:e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6",
    canaryConfig: canaryDefault,
    rollbackConfig: rollbackDefault,
    approvedBy: "Trust & Safety Lead",
    deployedAt: new Date(Date.now() - 45 * 86400000),
    createdAt: new Date(Date.now() - 45 * 86400000),
  });

  await db.insert(deployments).values({
    agentId: agent4.id, agentName: "Content Moderator", environment: "staging", version: "4.1.0-alpha",
    status: "rolled_back", rolloutStrategy: "shadow", canaryPercent: 0,
    signatureHash: "sha256:f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7",
    canaryConfig: canaryDefault,
    rollbackConfig: rollbackDefault,
    completedAt: new Date(Date.now() - 1 * 86400000),
    deployedAt: new Date(Date.now() - 3 * 86400000),
    createdAt: new Date(Date.now() - 3 * 86400000),
  });

  // Agent 5: Knowledge Base Updater — pending in staging
  await db.insert(deployments).values({
    agentId: agent5.id, agentName: "Knowledge Base Updater", environment: "staging", version: "1.2.0",
    status: "pending", rolloutStrategy: "shadow", canaryPercent: 0,
    signatureHash: "sha256:a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8",
    canaryConfig: { ...canaryDefault, startPercent: 0, stepPercent: 10, intervalMinutes: 60 },
    rollbackConfig: { ...rollbackDefault, triggers: [
      { metric: "kb_sync_failure_rate", operator: ">", value: 0.10, windowMinutes: 30 },
      { metric: "error_rate", operator: ">", value: 0.05, windowMinutes: 10 },
    ]},
    createdAt: new Date(Date.now() - 1 * 86400000),
  });

  // Run Traces
  const traceStatuses = ["completed", "completed", "completed", "completed", "completed", "failed", "completed", "completed", "blocked", "completed"];
  const traceInputs = [
    "Customer unable to reset password",
    "Billing dispute for subscription charge",
    "Feature request: dark mode support",
    "Integration error with Salesforce API",
    "Account access recovery request",
    "Malformed ticket - missing required fields",
    "Product return inquiry",
    "Shipping status check",
    "PII detected in response draft",
    "License upgrade consultation",
  ];

  for (let i = 0; i < 10; i++) {
    await db.insert(runTraces).values({
      agentId: agent1.id,
      environment: "prod",
      status: traceStatuses[i],
      costUsd: parseFloat((Math.random() * 0.1 + 0.02).toFixed(4)),
      latencyMs: Math.floor(Math.random() * 3000 + 800),
      inputSummary: traceInputs[i],
      outputSummary: traceStatuses[i] === "completed" ? "Resolved with KB article reference" : "Escalated to human",
    });
  }

  for (let i = 0; i < 6; i++) {
    await db.insert(runTraces).values({
      agentId: agent2.id,
      environment: "prod",
      status: i < 5 ? "completed" : "failed",
      costUsd: parseFloat((Math.random() * 0.06 + 0.01).toFixed(4)),
      latencyMs: Math.floor(Math.random() * 4000 + 1500),
      inputSummary: `Invoice #${10000 + i} - Vendor payment processing`,
      outputSummary: "Data extracted and routed for approval",
    });
  }

  // Eval Suites
  await db.insert(evalSuites).values([
    { agentId: agent1.id, name: "Core Regression Suite", type: "regression", passRate: 0.94, totalCases: 156, lastRunAt: new Date() },
    { agentId: agent1.id, name: "Safety & Compliance", type: "safety", passRate: 0.99, totalCases: 48, lastRunAt: new Date() },
    { agentId: agent1.id, name: "Edge Cases & Adversarial", type: "adversarial", passRate: 0.87, totalCases: 32, lastRunAt: new Date() },
    { agentId: agent2.id, name: "Extraction Accuracy Suite", type: "regression", passRate: 0.97, totalCases: 200, lastRunAt: new Date() },
    { agentId: agent2.id, name: "Multi-format Handling", type: "regression", passRate: 0.92, totalCases: 85, lastRunAt: new Date() },
    { agentId: agent3.id, name: "Scoring Calibration", type: "regression", passRate: 0.91, totalCases: 120, lastRunAt: new Date() },
    { agentId: agent4.id, name: "Content Policy Tests", type: "safety", passRate: 0.995, totalCases: 500, lastRunAt: new Date() },
  ]);

  // Policies
  await db.insert(policies).values([
    { name: "No PII in Response", domain: "data_handling", scopeType: "org", version: 3, status: "active", description: "Blocks any agent response that contains personally identifiable information", policyJson: { rules: [{ id: "no_pii_in_response", when: "output.contains_pii == true", action: "block", escalation: "human_required" }] } },
    { name: "Restricted Tool Write Access", domain: "tool_permissions", scopeType: "org", version: 2, status: "active", description: "Requires expert approval for write actions to external systems in production", policyJson: { rules: [{ id: "restricted_tool_write", when: "tool.action_type == 'write' and env == 'prod'", action: "require_approval", approvers: ["EXPERT_VALIDATOR"] }] } },
    { name: "Mandatory Citation", domain: "content_boundaries", scopeType: "outcome", version: 1, status: "active", description: "All agent responses must include citations from the knowledge base" },
    { name: "Cost Budget Enforcement", domain: "allowed_actions", scopeType: "agent", version: 1, status: "active", description: "Prevents agent runs from exceeding per-run cost budget" },
    { name: "Audit Log Redaction Rules", domain: "logging", scopeType: "org", version: 4, status: "active", description: "Defines which fields are redacted in audit logs for compliance" },
    { name: "Model Downgrade Fallback", domain: "allowed_actions", scopeType: "agent", version: 1, status: "active", description: "Allows automatic fallback to cheaper models when primary model is unavailable" },
  ]);

  // Approvals
  await db.insert(approvals).values([
    { type: "deployment", objectType: "agent", objectName: "Support Triage Agent v2.4.0", riskScore: 7.5, status: "pending", requestedBy: "CI Pipeline", description: "New version with improved RAG retrieval and updated prompt templates" },
    { type: "tool_permission", objectType: "agent", objectName: "Invoice Extractor - Salesforce Write", riskScore: 8.2, status: "pending", requestedBy: "Finance Ops", description: "Grant write access to Salesforce for automated invoice record creation" },
    { type: "policy_exception", objectType: "policy", objectName: "PII Policy Exception - Support Agent", riskScore: 6.0, status: "pending", requestedBy: "Support Engineering", description: "Temporary exception to include customer name in personalized responses" },
    { type: "deployment", objectType: "agent", objectName: "Content Moderator v4.1.0", riskScore: 5.0, status: "approved", requestedBy: "Trust & Safety", decidedBy: "Expert Validator", description: "Updated classification model with improved multi-language support", decidedAt: new Date(Date.now() - 86400000) },
    { type: "model_upgrade", objectType: "agent", objectName: "Lead Scorer - Claude 3.5 Upgrade", riskScore: 4.5, status: "approved", requestedBy: "Revenue Ops", decidedBy: "Expert Validator", description: "Upgrade from Claude 3 to Claude 3.5 Sonnet for better scoring accuracy", decidedAt: new Date(Date.now() - 172800000) },
  ]);

  // Audit Events
  await db.insert(auditEvents).values([
    { actorType: "system", actorId: "ci-pipeline", action: "deployment.created", objectType: "deployment", objectId: agent1.id, details: "Created deployment v2.4.0-beta to staging" },
    { actorType: "user", actorId: "expert-validator", action: "approval.approved", objectType: "agent", objectId: agent4.id, details: "Approved Content Moderator v4.1.0 deployment" },
    { actorType: "system", actorId: "autopatch-engine", action: "patch.proposed", objectType: "agent", objectId: agent3.id, details: "Proposed prompt optimization for Lead Scorer" },
    { actorType: "user", actorId: "finance-lead", action: "outcome.updated", objectType: "outcome", objectId: outcome2.id, details: "Updated pricing model for Invoice Processing" },
    { actorType: "system", actorId: "eval-runner", action: "eval.completed", objectType: "eval_suite", details: "Nightly regression suite completed: 94% pass rate" },
    { actorType: "system", actorId: "monitor", action: "alert.triggered", objectType: "agent", objectId: agent5.id, details: "Health score dropped below 80% threshold" },
    { actorType: "user", actorId: "support-eng", action: "policy.created", objectType: "policy", details: "Created new citation policy for support agents" },
  ]);

  // Invoices
  const now = new Date();
  await db.insert(invoices).values([
    { outcomeId: outcome1.id, outcomeName: "Reduce Support Load", periodStart: new Date(now.getFullYear(), now.getMonth() - 1, 1), periodEnd: new Date(now.getFullYear(), now.getMonth(), 0), totalUnits: 423, unitPrice: 2.50, amount: 1057.50, status: "paid" },
    { outcomeId: outcome2.id, outcomeName: "Invoice Processing Automation", periodStart: new Date(now.getFullYear(), now.getMonth() - 1, 1), periodEnd: new Date(now.getFullYear(), now.getMonth(), 0), totalUnits: 1087, unitPrice: 1.75, amount: 1902.25, status: "paid" },
    { outcomeId: outcome3.id, outcomeName: "Lead Qualification Pipeline", periodStart: new Date(now.getFullYear(), now.getMonth() - 1, 1), periodEnd: new Date(now.getFullYear(), now.getMonth(), 0), totalUnits: 267, unitPrice: 3.00, amount: 801.00, status: "paid" },
    { outcomeId: outcome4.id, outcomeName: "Content Moderation", periodStart: new Date(now.getFullYear(), now.getMonth() - 1, 1), periodEnd: new Date(now.getFullYear(), now.getMonth(), 0), totalUnits: 47823, unitPrice: 0.50, amount: 23911.50, status: "paid" },
    { outcomeId: outcome1.id, outcomeName: "Reduce Support Load", periodStart: new Date(now.getFullYear(), now.getMonth(), 1), periodEnd: new Date(now.getFullYear(), now.getMonth() + 1, 0), totalUnits: 198, unitPrice: 2.50, amount: 495.00, status: "pending" },
    { outcomeId: outcome2.id, outcomeName: "Invoice Processing Automation", periodStart: new Date(now.getFullYear(), now.getMonth(), 1), periodEnd: new Date(now.getFullYear(), now.getMonth() + 1, 0), totalUnits: 534, unitPrice: 1.75, amount: 934.50, status: "pending" },
  ]);

  console.log("Database seeded successfully");
}
