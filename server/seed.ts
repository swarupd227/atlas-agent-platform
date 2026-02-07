import { db } from "./db";
import { 
  outcomeContracts, kpiDefinitions, agents, deployments, 
  runTraces, evalSuites, policies, approvals, auditEvents, invoices,
  agentTemplates, evalTestCases, evalRuns,
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

  // Support Triage Agent — 10 traces
  const supportTraceData = [
    {
      status: traceStatuses[0], costUsd: 0.062, latencyMs: 1820,
      inputSummary: traceInputs[0], outputSummary: "Resolved: sent password reset link with step-by-step instructions from KB article #1247",
      modelId: "gpt-4.1", timeOffsetMs: 3 * 3600000,
      promptInputs: { systemPrompt: "You are a tier-1 support agent. Resolve tickets using the knowledge base. Escalate billing disputes over $500 and legal issues.", userMessage: "Customer unable to reset password", contextVariables: { customerId: "cust_8a3f2c", tier: "premium", previousTickets: 2, accountAge: "14 months" } },
      toolCalls: [
        { name: "search_knowledge_base", arguments: { query: "password reset instructions", limit: 5 }, result: { articlesFound: 3, topArticleId: "kb-1247" }, latencyMs: 245, status: "success" },
        { name: "classify_ticket", arguments: { text: "Customer unable to reset password", categories: ["billing", "technical", "account", "general"] }, result: { category: "account", confidence: 0.94 }, latencyMs: 180, status: "success" },
        { name: "send_response", arguments: { ticketId: "tkt_29301", responseTemplate: "password_reset_v3", includeArticle: "kb-1247" }, result: "Response sent successfully", latencyMs: 320, status: "success" },
      ],
      retrievedDocs: [
        { source: "knowledge_base", title: "How to Reset Your Password", relevanceScore: 0.96, snippet: "Navigate to Settings > Security > Reset Password. Click the reset link sent to your registered email." },
        { source: "knowledge_base", title: "Account Recovery Options", relevanceScore: 0.82, snippet: "If you cannot access your email, contact support with your account ID and verification documents." },
      ],
      decisions: [
        { step: "classification", reasoning: "Keywords 'reset password' strongly indicate account access issue, not billing or technical", confidence: 0.94, outcome: "classified_as_account" },
        { step: "resolution_strategy", reasoning: "Standard password reset flow applies. Customer is premium tier, no escalation needed.", confidence: 0.91, outcome: "self_service_resolution" },
      ],
      policyChecks: [
        { policyName: "PII Redaction", passed: true, details: "No PII detected in response draft", checkedAt: "2026-02-07T04:00:12Z" },
        { policyName: "Professional Tone", passed: true, details: "Tone score: 0.93 (empathetic, professional)", checkedAt: "2026-02-07T04:00:13Z" },
      ],
      tokenUsage: { promptTokens: 1245, completionTokens: 387, totalTokens: 1632 },
    },
    {
      status: traceStatuses[1], costUsd: 0.085, latencyMs: 2340,
      inputSummary: traceInputs[1], outputSummary: "Resolved: applied $15.99 credit for duplicate charge and sent confirmation",
      modelId: "gpt-4.1", timeOffsetMs: 5 * 3600000,
      promptInputs: { systemPrompt: "You are a tier-1 support agent. Resolve tickets using the knowledge base. Escalate billing disputes over $500 and legal issues.", userMessage: "Billing dispute for subscription charge", contextVariables: { customerId: "cust_4b7e9d", tier: "standard", disputeAmount: 15.99, subscriptionPlan: "monthly_pro" } },
      toolCalls: [
        { name: "search_knowledge_base", arguments: { query: "billing dispute duplicate charge refund", limit: 5 }, result: { articlesFound: 4, topArticleId: "kb-892" }, latencyMs: 210, status: "success" },
        { name: "classify_ticket", arguments: { text: "Billing dispute for subscription charge", categories: ["billing", "technical", "account", "general"] }, result: { category: "billing", confidence: 0.98 }, latencyMs: 155, status: "success" },
        { name: "route_ticket", arguments: { ticketId: "tkt_29405", department: "billing", priority: "normal" }, result: "Routed to billing queue", latencyMs: 95, status: "success" },
        { name: "send_response", arguments: { ticketId: "tkt_29405", responseTemplate: "billing_credit_applied", amount: 15.99 }, result: "Response sent successfully", latencyMs: 340, status: "success" },
      ],
      retrievedDocs: [
        { source: "knowledge_base", title: "Duplicate Charge Resolution", relevanceScore: 0.94, snippet: "For duplicate charges under $50, apply automatic credit. Over $50 requires manager approval." },
        { source: "support_policies", title: "Refund Policy v3.2", relevanceScore: 0.88, snippet: "Standard refunds processed within 5-7 business days. Immediate credits available for amounts under $100." },
      ],
      decisions: [
        { step: "classification", reasoning: "Clear billing dispute mention with subscription context", confidence: 0.98, outcome: "classified_as_billing" },
        { step: "escalation_check", reasoning: "Dispute amount $15.99 is under $500 threshold, no escalation required", confidence: 0.99, outcome: "no_escalation" },
        { step: "resolution_strategy", reasoning: "Amount under $50 qualifies for automatic credit per refund policy", confidence: 0.95, outcome: "auto_credit_applied" },
      ],
      policyChecks: [
        { policyName: "PII Redaction", passed: true, details: "Credit card last 4 digits redacted from response", checkedAt: "2026-02-07T02:15:30Z" },
        { policyName: "Professional Tone", passed: true, details: "Tone score: 0.95 (apologetic, helpful)", checkedAt: "2026-02-07T02:15:31Z" },
        { policyName: "No Legal Advice", passed: true, details: "No legal language detected", checkedAt: "2026-02-07T02:15:31Z" },
      ],
      tokenUsage: { promptTokens: 1580, completionTokens: 452, totalTokens: 2032 },
    },
    {
      status: traceStatuses[2], costUsd: 0.048, latencyMs: 1450,
      inputSummary: traceInputs[2], outputSummary: "Resolved: logged feature request and sent acknowledgment with roadmap link",
      modelId: "gpt-4.1", timeOffsetMs: 8 * 3600000,
      promptInputs: { systemPrompt: "You are a tier-1 support agent. Resolve tickets using the knowledge base. Escalate billing disputes over $500 and legal issues.", userMessage: "Feature request: dark mode support", contextVariables: { customerId: "cust_1c5d8f", tier: "enterprise", featureRequestCount: 1, accountAge: "26 months" } },
      toolCalls: [
        { name: "classify_ticket", arguments: { text: "Feature request: dark mode support", categories: ["billing", "technical", "account", "general"] }, result: { category: "general", confidence: 0.87 }, latencyMs: 165, status: "success" },
        { name: "search_knowledge_base", arguments: { query: "dark mode feature request roadmap", limit: 3 }, result: { articlesFound: 1, topArticleId: "kb-2103" }, latencyMs: 198, status: "success" },
        { name: "send_response", arguments: { ticketId: "tkt_29512", responseTemplate: "feature_request_ack", roadmapLink: "https://roadmap.example.com/dark-mode" }, result: "Response sent successfully", latencyMs: 285, status: "success" },
      ],
      retrievedDocs: [
        { source: "knowledge_base", title: "Product Roadmap FAQ", relevanceScore: 0.79, snippet: "Dark mode is planned for Q3 2026. Users can vote on feature priorities at roadmap.example.com." },
      ],
      decisions: [
        { step: "classification", reasoning: "Feature request identified, not a support issue requiring troubleshooting", confidence: 0.87, outcome: "classified_as_general" },
        { step: "resolution_strategy", reasoning: "Log feature request and provide roadmap link. Enterprise customer gets priority acknowledgment.", confidence: 0.92, outcome: "feature_request_logged" },
      ],
      policyChecks: [
        { policyName: "PII Redaction", passed: true, details: "No PII detected", checkedAt: "2026-02-06T23:10:05Z" },
        { policyName: "Professional Tone", passed: true, details: "Tone score: 0.91 (encouraging, professional)", checkedAt: "2026-02-06T23:10:06Z" },
      ],
      tokenUsage: { promptTokens: 980, completionTokens: 312, totalTokens: 1292 },
    },
    {
      status: traceStatuses[3], costUsd: 0.091, latencyMs: 2780,
      inputSummary: traceInputs[3], outputSummary: "Resolved: identified API version mismatch and provided migration guide",
      modelId: "gpt-4.1", timeOffsetMs: 12 * 3600000,
      promptInputs: { systemPrompt: "You are a tier-1 support agent. Resolve tickets using the knowledge base. Escalate billing disputes over $500 and legal issues.", userMessage: "Integration error with Salesforce API", contextVariables: { customerId: "cust_9e2a7b", tier: "enterprise", integrationName: "Salesforce", errorCode: "SF_API_VERSION_MISMATCH" } },
      toolCalls: [
        { name: "classify_ticket", arguments: { text: "Integration error with Salesforce API", categories: ["billing", "technical", "account", "general"] }, result: { category: "technical", confidence: 0.96 }, latencyMs: 140, status: "success" },
        { name: "search_knowledge_base", arguments: { query: "Salesforce API integration error version mismatch", limit: 5 }, result: { articlesFound: 5, topArticleId: "kb-1876" }, latencyMs: 312, status: "success" },
        { name: "route_ticket", arguments: { ticketId: "tkt_29588", department: "integrations", priority: "high" }, result: "Routed to integrations team", latencyMs: 88, status: "success" },
        { name: "send_response", arguments: { ticketId: "tkt_29588", responseTemplate: "api_troubleshooting", articleId: "kb-1876" }, result: "Response sent successfully", latencyMs: 295, status: "success" },
      ],
      retrievedDocs: [
        { source: "knowledge_base", title: "Salesforce API v58 Migration Guide", relevanceScore: 0.95, snippet: "API v55 deprecated as of Jan 2026. Update your integration to use v58 endpoints." },
        { source: "knowledge_base", title: "Common Integration Errors", relevanceScore: 0.87, snippet: "SF_API_VERSION_MISMATCH indicates the connected app is using a deprecated API version." },
        { source: "past_tickets", title: "Similar Issue: Acme Corp SF Integration", relevanceScore: 0.81, snippet: "Resolved by updating API version in connection settings and re-authenticating OAuth." },
      ],
      decisions: [
        { step: "classification", reasoning: "Error code and 'integration error' keyword strongly indicate technical issue", confidence: 0.96, outcome: "classified_as_technical" },
        { step: "severity_assessment", reasoning: "Enterprise customer with integration blocker, high priority routing", confidence: 0.93, outcome: "priority_high" },
        { step: "resolution_strategy", reasoning: "Known issue with SF API deprecation, provide migration guide and route to integrations team", confidence: 0.90, outcome: "guide_and_route" },
      ],
      policyChecks: [
        { policyName: "PII Redaction", passed: true, details: "API keys redacted from diagnostic info", checkedAt: "2026-02-06T19:22:41Z" },
        { policyName: "Professional Tone", passed: true, details: "Tone score: 0.89 (technical, helpful)", checkedAt: "2026-02-06T19:22:42Z" },
      ],
      tokenUsage: { promptTokens: 2105, completionTokens: 623, totalTokens: 2728 },
    },
    {
      status: traceStatuses[4], costUsd: 0.074, latencyMs: 2100,
      inputSummary: traceInputs[4], outputSummary: "Resolved: verified identity and sent account recovery email to alternate address",
      modelId: "gpt-4.1", timeOffsetMs: 18 * 3600000,
      promptInputs: { systemPrompt: "You are a tier-1 support agent. Resolve tickets using the knowledge base. Escalate billing disputes over $500 and legal issues.", userMessage: "Account access recovery request", contextVariables: { customerId: "cust_3f8b1e", tier: "premium", lastLogin: "2026-01-15", mfaEnabled: true } },
      toolCalls: [
        { name: "classify_ticket", arguments: { text: "Account access recovery request", categories: ["billing", "technical", "account", "general"] }, result: { category: "account", confidence: 0.97 }, latencyMs: 132, status: "success" },
        { name: "search_knowledge_base", arguments: { query: "account recovery MFA locked out", limit: 4 }, result: { articlesFound: 3, topArticleId: "kb-1102" }, latencyMs: 228, status: "success" },
        { name: "send_response", arguments: { ticketId: "tkt_29644", responseTemplate: "account_recovery_mfa", verificationRequired: true }, result: "Response sent successfully", latencyMs: 310, status: "success" },
      ],
      retrievedDocs: [
        { source: "knowledge_base", title: "Account Recovery with MFA", relevanceScore: 0.97, snippet: "For MFA-locked accounts, verify identity with security questions and send recovery to alternate email." },
        { source: "support_policies", title: "Identity Verification Requirements", relevanceScore: 0.91, snippet: "Require 2 of 3: security questions, government ID, previous billing info." },
      ],
      decisions: [
        { step: "classification", reasoning: "Account access recovery is a clear account-type issue", confidence: 0.97, outcome: "classified_as_account" },
        { step: "identity_verification", reasoning: "MFA-enabled account requires enhanced verification before recovery", confidence: 0.95, outcome: "verification_required" },
        { step: "resolution_strategy", reasoning: "Standard MFA recovery flow, premium tier gets expedited handling", confidence: 0.93, outcome: "mfa_recovery_flow" },
      ],
      policyChecks: [
        { policyName: "PII Redaction", passed: true, details: "Email addresses partially masked in response", checkedAt: "2026-02-06T13:45:18Z" },
        { policyName: "Escalation Path", passed: true, details: "No escalation triggers detected", checkedAt: "2026-02-06T13:45:19Z" },
      ],
      tokenUsage: { promptTokens: 1420, completionTokens: 398, totalTokens: 1818 },
    },
    {
      status: traceStatuses[5], costUsd: 0.031, latencyMs: 950,
      inputSummary: traceInputs[5], outputSummary: "Failed: ticket rejected due to missing required fields (subject, category)",
      modelId: "gpt-4.1", timeOffsetMs: 24 * 3600000,
      promptInputs: { systemPrompt: "You are a tier-1 support agent. Resolve tickets using the knowledge base. Escalate billing disputes over $500 and legal issues.", userMessage: "Malformed ticket - missing required fields", contextVariables: { customerId: "unknown", tier: "unknown", rawPayload: "{ subject: null, body: 'help' }" } },
      toolCalls: [
        { name: "classify_ticket", arguments: { text: "help", categories: ["billing", "technical", "account", "general"] }, result: { error: "Insufficient input for classification", code: "INVALID_INPUT" }, latencyMs: 120, status: "error" },
      ],
      retrievedDocs: [],
      decisions: [
        { step: "input_validation", reasoning: "Ticket missing subject and category fields, cannot proceed with standard flow", confidence: 0.99, outcome: "validation_failed" },
        { step: "error_handling", reasoning: "Return structured error to upstream system with missing field details", confidence: 0.98, outcome: "reject_with_error" },
      ],
      policyChecks: [
        { policyName: "PII Redaction", passed: true, details: "No PII in error response", checkedAt: "2026-02-06T07:33:55Z" },
      ],
      tokenUsage: { promptTokens: 580, completionTokens: 145, totalTokens: 725 },
    },
    {
      status: traceStatuses[6], costUsd: 0.058, latencyMs: 1680,
      inputSummary: traceInputs[6], outputSummary: "Resolved: provided return shipping label and RMA number RMA-48291",
      modelId: "gpt-4.1", timeOffsetMs: 30 * 3600000,
      promptInputs: { systemPrompt: "You are a tier-1 support agent. Resolve tickets using the knowledge base. Escalate billing disputes over $500 and legal issues.", userMessage: "Product return inquiry", contextVariables: { customerId: "cust_7d4e2a", tier: "standard", orderId: "ord_18472", orderDate: "2026-01-28", returnWindow: "30 days" } },
      toolCalls: [
        { name: "classify_ticket", arguments: { text: "Product return inquiry", categories: ["billing", "technical", "account", "general"] }, result: { category: "billing", confidence: 0.82 }, latencyMs: 148, status: "success" },
        { name: "search_knowledge_base", arguments: { query: "product return policy RMA shipping label", limit: 4 }, result: { articlesFound: 3, topArticleId: "kb-567" }, latencyMs: 235, status: "success" },
        { name: "send_response", arguments: { ticketId: "tkt_29701", responseTemplate: "return_initiated", rmaNumber: "RMA-48291" }, result: "Response sent with shipping label", latencyMs: 380, status: "success" },
      ],
      retrievedDocs: [
        { source: "knowledge_base", title: "Return & Refund Policy", relevanceScore: 0.95, snippet: "Items eligible for return within 30 days of purchase. Free return shipping for defective items." },
        { source: "knowledge_base", title: "How to Generate RMA", relevanceScore: 0.88, snippet: "System auto-generates RMA numbers. Include RMA on outer packaging for processing." },
      ],
      decisions: [
        { step: "classification", reasoning: "Product return falls under billing/commerce category", confidence: 0.82, outcome: "classified_as_billing" },
        { step: "return_eligibility", reasoning: "Order date 2026-01-28 is within 30-day return window", confidence: 0.99, outcome: "eligible_for_return" },
        { step: "resolution_strategy", reasoning: "Generate RMA and provide prepaid shipping label per standard return flow", confidence: 0.96, outcome: "return_initiated" },
      ],
      policyChecks: [
        { policyName: "PII Redaction", passed: true, details: "Shipping address not included in ticket response", checkedAt: "2026-02-06T01:12:40Z" },
        { policyName: "Professional Tone", passed: true, details: "Tone score: 0.92 (empathetic, clear)", checkedAt: "2026-02-06T01:12:41Z" },
      ],
      tokenUsage: { promptTokens: 1310, completionTokens: 365, totalTokens: 1675 },
    },
    {
      status: traceStatuses[7], costUsd: 0.044, latencyMs: 1250,
      inputSummary: traceInputs[7], outputSummary: "Resolved: provided real-time tracking link and estimated delivery date Feb 10",
      modelId: "gpt-4.1", timeOffsetMs: 36 * 3600000,
      promptInputs: { systemPrompt: "You are a tier-1 support agent. Resolve tickets using the knowledge base. Escalate billing disputes over $500 and legal issues.", userMessage: "Shipping status check", contextVariables: { customerId: "cust_2b6f9c", tier: "standard", orderId: "ord_19283", trackingNumber: "1Z999AA10123456784" } },
      toolCalls: [
        { name: "classify_ticket", arguments: { text: "Shipping status check", categories: ["billing", "technical", "account", "general"] }, result: { category: "general", confidence: 0.85 }, latencyMs: 128, status: "success" },
        { name: "search_knowledge_base", arguments: { query: "shipping tracking status delivery estimate", limit: 3 }, result: { articlesFound: 2, topArticleId: "kb-445" }, latencyMs: 195, status: "success" },
        { name: "send_response", arguments: { ticketId: "tkt_29756", responseTemplate: "shipping_status", trackingUrl: "https://track.example.com/1Z999AA10123456784" }, result: "Response sent successfully", latencyMs: 275, status: "success" },
      ],
      retrievedDocs: [
        { source: "knowledge_base", title: "Shipping & Delivery FAQ", relevanceScore: 0.90, snippet: "Standard shipping takes 5-7 business days. Track your order at track.example.com." },
      ],
      decisions: [
        { step: "classification", reasoning: "Shipping inquiry is a general support question", confidence: 0.85, outcome: "classified_as_general" },
        { step: "resolution_strategy", reasoning: "Provide tracking link and estimated delivery date from carrier API", confidence: 0.94, outcome: "tracking_info_provided" },
      ],
      policyChecks: [
        { policyName: "PII Redaction", passed: true, details: "Full address not disclosed, only city-level location", checkedAt: "2026-02-05T19:28:10Z" },
        { policyName: "Professional Tone", passed: true, details: "Tone score: 0.90 (informative, concise)", checkedAt: "2026-02-05T19:28:11Z" },
      ],
      tokenUsage: { promptTokens: 890, completionTokens: 268, totalTokens: 1158 },
    },
    {
      status: traceStatuses[8], costUsd: 0.072, latencyMs: 1920,
      inputSummary: traceInputs[8], outputSummary: "Blocked: PII detected in draft response, escalated for human review",
      modelId: "gpt-4.1", timeOffsetMs: 42 * 3600000,
      promptInputs: { systemPrompt: "You are a tier-1 support agent. Resolve tickets using the knowledge base. Escalate billing disputes over $500 and legal issues.", userMessage: "PII detected in response draft", contextVariables: { customerId: "cust_5a8c3d", tier: "enterprise", piiTypes: ["ssn", "credit_card"], draftId: "draft_7821" } },
      toolCalls: [
        { name: "classify_ticket", arguments: { text: "Customer requesting account details with SSN verification", categories: ["billing", "technical", "account", "general"] }, result: { category: "account", confidence: 0.91 }, latencyMs: 152, status: "success" },
        { name: "search_knowledge_base", arguments: { query: "PII handling sensitive data customer verification", limit: 4 }, result: { articlesFound: 4, topArticleId: "kb-2001" }, latencyMs: 267, status: "success" },
        { name: "route_ticket", arguments: { ticketId: "tkt_29812", department: "security", priority: "critical", reason: "pii_detected" }, result: "Escalated to security team", latencyMs: 105, status: "success" },
      ],
      retrievedDocs: [
        { source: "support_policies", title: "PII Handling Policy", relevanceScore: 0.99, snippet: "Never include SSN, full credit card numbers, or government IDs in any customer-facing response." },
        { source: "knowledge_base", title: "Secure Verification Procedures", relevanceScore: 0.92, snippet: "Use tokenized verification links instead of requesting sensitive data via ticket." },
      ],
      decisions: [
        { step: "pii_detection", reasoning: "Draft response contained SSN pattern (XXX-XX-XXXX) and credit card number", confidence: 0.99, outcome: "pii_detected" },
        { step: "escalation_decision", reasoning: "PII in response is a hard block per policy, must escalate to human for safe handling", confidence: 1.0, outcome: "escalate_to_human" },
      ],
      policyChecks: [
        { policyName: "PII Redaction", passed: false, details: "SSN pattern detected in response draft. Credit card number found. Blocked.", checkedAt: "2026-02-05T13:55:02Z" },
        { policyName: "Escalation Path", passed: true, details: "Correctly escalated to security team for PII incident", checkedAt: "2026-02-05T13:55:03Z" },
      ],
      tokenUsage: { promptTokens: 1680, completionTokens: 412, totalTokens: 2092 },
    },
    {
      status: traceStatuses[9], costUsd: 0.079, latencyMs: 2450,
      inputSummary: traceInputs[9], outputSummary: "Resolved: provided license comparison table and upgrade pricing for Enterprise plan",
      modelId: "gpt-4.1", timeOffsetMs: 48 * 3600000,
      promptInputs: { systemPrompt: "You are a tier-1 support agent. Resolve tickets using the knowledge base. Escalate billing disputes over $500 and legal issues.", userMessage: "License upgrade consultation", contextVariables: { customerId: "cust_6e1d4b", tier: "standard", currentPlan: "pro_monthly", interestedIn: "enterprise" } },
      toolCalls: [
        { name: "classify_ticket", arguments: { text: "License upgrade consultation", categories: ["billing", "technical", "account", "general"] }, result: { category: "billing", confidence: 0.88 }, latencyMs: 138, status: "success" },
        { name: "search_knowledge_base", arguments: { query: "license upgrade enterprise plan pricing comparison", limit: 5 }, result: { articlesFound: 4, topArticleId: "kb-330" }, latencyMs: 252, status: "success" },
        { name: "route_ticket", arguments: { ticketId: "tkt_29868", department: "sales", priority: "normal" }, result: "Routed to sales team", latencyMs: 92, status: "success" },
        { name: "send_response", arguments: { ticketId: "tkt_29868", responseTemplate: "upgrade_consultation", comparisonTable: true }, result: "Response sent with pricing details", latencyMs: 345, status: "success" },
      ],
      retrievedDocs: [
        { source: "knowledge_base", title: "Plan Comparison Guide", relevanceScore: 0.96, snippet: "Enterprise plan includes unlimited users, SSO, dedicated support, and custom integrations." },
        { source: "knowledge_base", title: "Enterprise Pricing", relevanceScore: 0.93, snippet: "Enterprise starts at $499/mo for up to 50 users. Volume discounts available for 100+ seats." },
        { source: "knowledge_base", title: "Upgrade Process", relevanceScore: 0.85, snippet: "Upgrades are prorated. Contact sales for enterprise customization and annual billing options." },
      ],
      decisions: [
        { step: "classification", reasoning: "License upgrade inquiry relates to billing and sales", confidence: 0.88, outcome: "classified_as_billing" },
        { step: "resolution_strategy", reasoning: "Provide comparison info and route to sales for enterprise consultation", confidence: 0.94, outcome: "info_and_sales_route" },
      ],
      policyChecks: [
        { policyName: "PII Redaction", passed: true, details: "No PII detected in response", checkedAt: "2026-02-05T07:42:30Z" },
        { policyName: "Professional Tone", passed: true, details: "Tone score: 0.94 (consultative, professional)", checkedAt: "2026-02-05T07:42:31Z" },
        { policyName: "No Legal Advice", passed: true, details: "Pricing presented as informational, no contractual commitments made", checkedAt: "2026-02-05T07:42:31Z" },
      ],
      tokenUsage: { promptTokens: 1750, completionTokens: 520, totalTokens: 2270 },
    },
  ];

  for (const trace of supportTraceData) {
    const startedAt = new Date(Date.now() - trace.timeOffsetMs);
    const endedAt = new Date(startedAt.getTime() + trace.latencyMs);
    await db.insert(runTraces).values({
      agentId: agent1.id,
      environment: "prod",
      status: trace.status,
      costUsd: trace.costUsd,
      latencyMs: trace.latencyMs,
      inputSummary: trace.inputSummary,
      outputSummary: trace.outputSummary,
      modelId: trace.modelId,
      promptInputs: trace.promptInputs,
      toolCalls: trace.toolCalls,
      retrievedDocs: trace.retrievedDocs,
      decisions: trace.decisions,
      policyChecks: trace.policyChecks,
      tokenUsage: trace.tokenUsage,
      startedAt,
      endedAt,
    });
  }

  // Invoice Extractor — 6 traces
  const invoiceTraceData = [
    {
      status: "completed", costUsd: 0.045, latencyMs: 3100,
      inputSummary: "Invoice #10000 - Acme Corp monthly services payment",
      outputSummary: "Extracted 12 fields with 99.1% confidence, matched PO-2024-0892, created SF record",
      modelId: "gpt-4o", timeOffsetMs: 4 * 3600000,
      promptInputs: { systemPrompt: "Extract all structured fields from the provided invoice document. Validate against vendor database and match purchase orders.", userMessage: "Process invoice from Acme Corp for $8,450.00", contextVariables: { documentType: "pdf", pageCount: 2, vendorId: "vnd_acme_001", currency: "USD" } },
      toolCalls: [
        { name: "extract_fields", arguments: { documentId: "doc_28401", schema: "InvoiceV2", ocrModel: "gpt-4o" }, result: { fieldsExtracted: 12, confidence: 0.991, invoiceNumber: "INV-2026-0147", amount: 8450.00 }, latencyMs: 1450, status: "success" },
        { name: "validate_vendor", arguments: { vendorName: "Acme Corp", taxId: "XX-XXXXXXX" }, result: { verified: true, vendorId: "vnd_acme_001", riskLevel: "low" }, latencyMs: 380, status: "success" },
        { name: "match_po", arguments: { vendorId: "vnd_acme_001", amount: 8450.00, dateRange: "2026-01" }, result: { matched: true, poNumber: "PO-2024-0892", variance: 0.0 }, latencyMs: 290, status: "success" },
        { name: "create_salesforce_record", arguments: { type: "Invoice__c", invoiceNumber: "INV-2026-0147", amount: 8450.00, vendorId: "vnd_acme_001" }, result: { recordId: "a0B5e00000XYZ123", status: "created" }, latencyMs: 520, status: "success" },
      ],
      retrievedDocs: [
        { source: "vendor_database", title: "Acme Corp Vendor Profile", relevanceScore: 0.98, snippet: "Verified vendor since 2022. Payment terms: Net 30. Primary contact: accounts@acme.com" },
        { source: "invoice_templates", title: "Acme Corp Invoice Template", relevanceScore: 0.94, snippet: "Standard layout: header with logo, itemized table, tax line, total at bottom right." },
      ],
      decisions: [
        { step: "field_extraction", reasoning: "All 12 required fields extracted with high confidence from clean PDF", confidence: 0.991, outcome: "extraction_complete" },
        { step: "vendor_validation", reasoning: "Acme Corp matched to known vendor with valid tax ID", confidence: 0.99, outcome: "vendor_verified" },
        { step: "po_matching", reasoning: "Amount exactly matches PO-2024-0892 with zero variance", confidence: 1.0, outcome: "po_matched" },
        { step: "approval_routing", reasoning: "Amount $8,450 under $10,000 threshold, standard approval flow", confidence: 0.98, outcome: "standard_approval" },
      ],
      policyChecks: [
        { policyName: "Financial Accuracy", passed: true, details: "Extracted amount $8,450.00 matches source document", checkedAt: "2026-02-07T03:15:22Z" },
        { policyName: "Audit Trail", passed: true, details: "All extraction decisions logged with confidence scores", checkedAt: "2026-02-07T03:15:23Z" },
      ],
      tokenUsage: { promptTokens: 3200, completionTokens: 890, totalTokens: 4090 },
    },
    {
      status: "completed", costUsd: 0.052, latencyMs: 3650,
      inputSummary: "Invoice #10001 - GlobalTech quarterly license renewal",
      outputSummary: "Extracted 14 fields with 97.8% confidence, matched PO-2024-1105, routed to CFO for approval (>$10k)",
      modelId: "gpt-4o", timeOffsetMs: 10 * 3600000,
      promptInputs: { systemPrompt: "Extract all structured fields from the provided invoice document. Validate against vendor database and match purchase orders.", userMessage: "Process invoice from GlobalTech Solutions for $24,500.00", contextVariables: { documentType: "pdf", pageCount: 3, vendorId: "vnd_globaltech_042", currency: "USD" } },
      toolCalls: [
        { name: "extract_fields", arguments: { documentId: "doc_28455", schema: "InvoiceV2", ocrModel: "gpt-4o" }, result: { fieldsExtracted: 14, confidence: 0.978, invoiceNumber: "GT-INV-8821", amount: 24500.00 }, latencyMs: 1680, status: "success" },
        { name: "validate_vendor", arguments: { vendorName: "GlobalTech Solutions", taxId: "YY-YYYYYYY" }, result: { verified: true, vendorId: "vnd_globaltech_042", riskLevel: "low" }, latencyMs: 410, status: "success" },
        { name: "match_po", arguments: { vendorId: "vnd_globaltech_042", amount: 24500.00, dateRange: "2026-Q1" }, result: { matched: true, poNumber: "PO-2024-1105", variance: 0.0 }, latencyMs: 310, status: "success" },
        { name: "create_salesforce_record", arguments: { type: "Invoice__c", invoiceNumber: "GT-INV-8821", amount: 24500.00, vendorId: "vnd_globaltech_042", approvalRequired: true }, result: { recordId: "a0B5e00000ABC456", status: "pending_approval" }, latencyMs: 580, status: "success" },
      ],
      retrievedDocs: [
        { source: "vendor_database", title: "GlobalTech Solutions Vendor Profile", relevanceScore: 0.97, snippet: "Enterprise software vendor. Payment terms: Net 45. Annual contract renewal in Q1." },
      ],
      decisions: [
        { step: "field_extraction", reasoning: "14 fields extracted from multi-page PDF, line items parsed correctly", confidence: 0.978, outcome: "extraction_complete" },
        { step: "vendor_validation", reasoning: "GlobalTech matched to existing vendor record with valid credentials", confidence: 0.98, outcome: "vendor_verified" },
        { step: "approval_routing", reasoning: "Amount $24,500 exceeds $10,000 threshold, routing to CFO", confidence: 0.99, outcome: "cfo_approval_required" },
      ],
      policyChecks: [
        { policyName: "Financial Accuracy", passed: true, details: "Extracted total matches sum of line items", checkedAt: "2026-02-06T21:08:15Z" },
        { policyName: "PII Redaction", passed: true, details: "Bank account details redacted from logs", checkedAt: "2026-02-06T21:08:16Z" },
        { policyName: "Audit Trail", passed: true, details: "Full extraction trace recorded", checkedAt: "2026-02-06T21:08:16Z" },
      ],
      tokenUsage: { promptTokens: 4100, completionTokens: 1120, totalTokens: 5220 },
    },
    {
      status: "completed", costUsd: 0.038, latencyMs: 2800,
      inputSummary: "Invoice #10002 - Office Supplies Direct recurring order",
      outputSummary: "Extracted 10 fields with 98.5% confidence, matched PO-2025-0334, auto-approved under $5k",
      modelId: "gpt-4o", timeOffsetMs: 16 * 3600000,
      promptInputs: { systemPrompt: "Extract all structured fields from the provided invoice document. Validate against vendor database and match purchase orders.", userMessage: "Process invoice from Office Supplies Direct for $1,247.50", contextVariables: { documentType: "pdf", pageCount: 1, vendorId: "vnd_osd_118", currency: "USD" } },
      toolCalls: [
        { name: "extract_fields", arguments: { documentId: "doc_28510", schema: "InvoiceV2", ocrModel: "gpt-4o" }, result: { fieldsExtracted: 10, confidence: 0.985, invoiceNumber: "OSD-67442", amount: 1247.50 }, latencyMs: 1100, status: "success" },
        { name: "validate_vendor", arguments: { vendorName: "Office Supplies Direct", taxId: "ZZ-ZZZZZZZ" }, result: { verified: true, vendorId: "vnd_osd_118", riskLevel: "low" }, latencyMs: 340, status: "success" },
        { name: "match_po", arguments: { vendorId: "vnd_osd_118", amount: 1247.50, dateRange: "2026-02" }, result: { matched: true, poNumber: "PO-2025-0334", variance: 0.0 }, latencyMs: 260, status: "success" },
        { name: "create_salesforce_record", arguments: { type: "Invoice__c", invoiceNumber: "OSD-67442", amount: 1247.50, vendorId: "vnd_osd_118" }, result: { recordId: "a0B5e00000DEF789", status: "auto_approved" }, latencyMs: 480, status: "success" },
      ],
      retrievedDocs: [
        { source: "vendor_database", title: "Office Supplies Direct Profile", relevanceScore: 0.96, snippet: "Recurring vendor, monthly orders. Payment terms: Net 15. Auto-approve threshold: $5,000." },
      ],
      decisions: [
        { step: "field_extraction", reasoning: "Simple single-page invoice, all standard fields present", confidence: 0.985, outcome: "extraction_complete" },
        { step: "approval_routing", reasoning: "Amount $1,247.50 under $5,000 auto-approve threshold for recurring vendor", confidence: 0.99, outcome: "auto_approved" },
      ],
      policyChecks: [
        { policyName: "Financial Accuracy", passed: true, details: "Amount validated against line items and tax calculation", checkedAt: "2026-02-06T15:30:44Z" },
        { policyName: "Audit Trail", passed: true, details: "Auto-approval logged with justification", checkedAt: "2026-02-06T15:30:45Z" },
      ],
      tokenUsage: { promptTokens: 2400, completionTokens: 650, totalTokens: 3050 },
    },
    {
      status: "completed", costUsd: 0.061, latencyMs: 4200,
      inputSummary: "Invoice #10003 - New vendor CloudScale Infrastructure first invoice",
      outputSummary: "Extracted 11 fields with 95.2% confidence, new vendor flagged for finance lead review",
      modelId: "gpt-4o", timeOffsetMs: 22 * 3600000,
      promptInputs: { systemPrompt: "Extract all structured fields from the provided invoice document. Validate against vendor database and match purchase orders.", userMessage: "Process invoice from CloudScale Infrastructure for $15,780.00", contextVariables: { documentType: "png", pageCount: 1, vendorId: null, currency: "USD" } },
      toolCalls: [
        { name: "extract_fields", arguments: { documentId: "doc_28567", schema: "InvoiceV2", ocrModel: "gpt-4o" }, result: { fieldsExtracted: 11, confidence: 0.952, invoiceNumber: "CSI-2026-001", amount: 15780.00 }, latencyMs: 1890, status: "success" },
        { name: "validate_vendor", arguments: { vendorName: "CloudScale Infrastructure", taxId: "AA-AAAAAAA" }, result: { verified: false, reason: "new_vendor_not_in_system", riskLevel: "medium" }, latencyMs: 450, status: "success" },
        { name: "match_po", arguments: { vendorName: "CloudScale Infrastructure", amount: 15780.00, dateRange: "2026-01" }, result: { matched: false, reason: "no_matching_po_found" }, latencyMs: 320, status: "success" },
      ],
      retrievedDocs: [
        { source: "invoice_templates", title: "Unknown Vendor Template Matching", relevanceScore: 0.72, snippet: "When vendor is not in the system, flag for manual review. Collect W-9 before payment." },
      ],
      decisions: [
        { step: "field_extraction", reasoning: "Image-based invoice required enhanced OCR, slightly lower confidence on handwritten fields", confidence: 0.952, outcome: "extraction_complete" },
        { step: "vendor_validation", reasoning: "Vendor not found in database, first-time invoice, requires onboarding", confidence: 0.95, outcome: "new_vendor_flagged" },
        { step: "po_matching", reasoning: "No matching PO found for this vendor, manual matching required", confidence: 0.90, outcome: "no_po_match" },
        { step: "approval_routing", reasoning: "New vendor + no PO + amount over $10k = finance lead review required", confidence: 0.99, outcome: "finance_lead_review" },
      ],
      policyChecks: [
        { policyName: "Financial Accuracy", passed: true, details: "Extracted amount consistent across invoice locations", checkedAt: "2026-02-06T09:44:18Z" },
        { policyName: "Audit Trail", passed: true, details: "New vendor flag and missing PO documented", checkedAt: "2026-02-06T09:44:19Z" },
      ],
      tokenUsage: { promptTokens: 3800, completionTokens: 980, totalTokens: 4780 },
    },
    {
      status: "completed", costUsd: 0.041, latencyMs: 2950,
      inputSummary: "Invoice #10004 - TechParts Inc hardware components",
      outputSummary: "Extracted 13 fields with 98.9% confidence, PO matched with 2.1% variance flagged",
      modelId: "gpt-4o", timeOffsetMs: 28 * 3600000,
      promptInputs: { systemPrompt: "Extract all structured fields from the provided invoice document. Validate against vendor database and match purchase orders.", userMessage: "Process invoice from TechParts Inc for $6,230.75", contextVariables: { documentType: "pdf", pageCount: 2, vendorId: "vnd_techparts_067", currency: "USD" } },
      toolCalls: [
        { name: "extract_fields", arguments: { documentId: "doc_28612", schema: "InvoiceV2", ocrModel: "gpt-4o" }, result: { fieldsExtracted: 13, confidence: 0.989, invoiceNumber: "TP-88921", amount: 6230.75 }, latencyMs: 1320, status: "success" },
        { name: "validate_vendor", arguments: { vendorName: "TechParts Inc", taxId: "BB-BBBBBBB" }, result: { verified: true, vendorId: "vnd_techparts_067", riskLevel: "low" }, latencyMs: 360, status: "success" },
        { name: "match_po", arguments: { vendorId: "vnd_techparts_067", amount: 6230.75, dateRange: "2026-01" }, result: { matched: true, poNumber: "PO-2025-0781", variance: 0.021, originalAmount: 6100.00 }, latencyMs: 280, status: "success" },
        { name: "create_salesforce_record", arguments: { type: "Invoice__c", invoiceNumber: "TP-88921", amount: 6230.75, vendorId: "vnd_techparts_067", varianceFlag: true }, result: { recordId: "a0B5e00000GHI012", status: "created_with_flag" }, latencyMs: 510, status: "success" },
      ],
      retrievedDocs: [
        { source: "vendor_database", title: "TechParts Inc Vendor Profile", relevanceScore: 0.95, snippet: "Hardware components vendor. Payment terms: Net 30. Variance tolerance: 5%." },
      ],
      decisions: [
        { step: "field_extraction", reasoning: "Clean multi-page PDF with itemized hardware components", confidence: 0.989, outcome: "extraction_complete" },
        { step: "po_matching", reasoning: "PO matched but 2.1% variance ($130.75) due to shipping surcharge, within 5% tolerance", confidence: 0.94, outcome: "po_matched_with_variance" },
        { step: "approval_routing", reasoning: "Variance within tolerance but flagged for visibility. Standard approval flow.", confidence: 0.96, outcome: "standard_with_flag" },
      ],
      policyChecks: [
        { policyName: "Financial Accuracy", passed: true, details: "Variance 2.1% within 5% tolerance, shipping surcharge identified", checkedAt: "2026-02-05T23:18:05Z" },
        { policyName: "Audit Trail", passed: true, details: "Variance details and surcharge explanation logged", checkedAt: "2026-02-05T23:18:06Z" },
      ],
      tokenUsage: { promptTokens: 3450, completionTokens: 870, totalTokens: 4320 },
    },
    {
      status: "failed", costUsd: 0.028, latencyMs: 1800,
      inputSummary: "Invoice #10005 - Corrupted scan from DataServices Ltd",
      outputSummary: "Failed: OCR extraction failed on corrupted scan, only 4 of 12 required fields extracted (33% confidence)",
      modelId: "gpt-4o", timeOffsetMs: 34 * 3600000,
      promptInputs: { systemPrompt: "Extract all structured fields from the provided invoice document. Validate against vendor database and match purchase orders.", userMessage: "Process invoice from DataServices Ltd", contextVariables: { documentType: "jpg", pageCount: 1, vendorId: "vnd_dataservices_091", currency: "USD", scanQuality: "poor" } },
      toolCalls: [
        { name: "extract_fields", arguments: { documentId: "doc_28670", schema: "InvoiceV2", ocrModel: "gpt-4o" }, result: { fieldsExtracted: 4, confidence: 0.33, error: "Low quality scan - multiple fields unreadable", invoiceNumber: null, amount: null }, latencyMs: 1420, status: "error" },
      ],
      retrievedDocs: [],
      decisions: [
        { step: "field_extraction", reasoning: "Corrupted/low-quality scan resulted in only 4 of 12 fields extracted, below 80% minimum threshold", confidence: 0.33, outcome: "extraction_failed" },
        { step: "error_handling", reasoning: "Confidence below minimum threshold, requesting rescan from submitter", confidence: 0.99, outcome: "rescan_requested" },
      ],
      policyChecks: [
        { policyName: "Financial Accuracy", passed: false, details: "Cannot verify extracted amount against source - document unreadable", checkedAt: "2026-02-05T17:05:30Z" },
        { policyName: "Audit Trail", passed: true, details: "Extraction failure logged with scan quality metrics", checkedAt: "2026-02-05T17:05:31Z" },
      ],
      tokenUsage: { promptTokens: 2800, completionTokens: 420, totalTokens: 3220 },
    },
  ];

  for (const trace of invoiceTraceData) {
    const startedAt = new Date(Date.now() - trace.timeOffsetMs);
    const endedAt = new Date(startedAt.getTime() + trace.latencyMs);
    await db.insert(runTraces).values({
      agentId: agent2.id,
      environment: "prod",
      status: trace.status,
      costUsd: trace.costUsd,
      latencyMs: trace.latencyMs,
      inputSummary: trace.inputSummary,
      outputSummary: trace.outputSummary,
      modelId: trace.modelId,
      promptInputs: trace.promptInputs,
      toolCalls: trace.toolCalls,
      retrievedDocs: trace.retrievedDocs,
      decisions: trace.decisions,
      policyChecks: trace.policyChecks,
      tokenUsage: trace.tokenUsage,
      startedAt,
      endedAt,
    });
  }

  // Lead Scorer — 3 traces
  const leadScorerTraces = [
    {
      status: "completed", costUsd: 0.089, latencyMs: 4200,
      inputSummary: "Inbound lead: Sarah Chen, VP Engineering at Nexus Dynamics (Series B, 120 employees)",
      outputSummary: "Lead scored 87/100 (Hot), enriched with firmographics, routed to enterprise sales rep",
      modelId: "claude-3.5-sonnet", timeOffsetMs: 6 * 3600000,
      promptInputs: { systemPrompt: "Score inbound leads based on ICP fit, firmographic data, and behavioral signals. Provide detailed reasoning for each score component.", userMessage: "Score and route new lead: Sarah Chen from Nexus Dynamics", contextVariables: { leadSource: "demo_request", companySize: 120, fundingStage: "Series B", industry: "SaaS", title: "VP Engineering" } },
      toolCalls: [
        { name: "enrich_company", arguments: { companyName: "Nexus Dynamics", domain: "nexusdynamics.io" }, result: { employees: 120, revenue: "$18M ARR", funding: "Series B ($35M)", industry: "B2B SaaS", techStack: ["AWS", "React", "Python"] }, latencyMs: 1850, status: "success" },
        { name: "check_crm", arguments: { email: "sarah.chen@nexusdynamics.io", companyName: "Nexus Dynamics" }, result: { existingAccount: false, previousInteractions: 0, competitorCustomer: false }, latencyMs: 620, status: "success" },
        { name: "score_lead", arguments: { icpProfile: "enterprise_saas_v3", firmographics: { employees: 120, revenue: "18M", funding: "Series B" }, behavioral: { source: "demo_request", pageViews: 12, contentDownloads: 2 } }, result: { totalScore: 87, components: { icpFit: 92, timing: 85, engagement: 78 } }, latencyMs: 980, status: "success" },
      ],
      retrievedDocs: [
        { source: "icp_profiles", title: "Enterprise SaaS ICP v3", relevanceScore: 0.94, snippet: "Ideal profile: 50-500 employees, Series A-C, B2B SaaS, VP+ decision maker." },
        { source: "win_loss_reports", title: "Q4 2025 Win Analysis", relevanceScore: 0.82, snippet: "Companies in 100-200 employee range converted at 28% rate, highest among segments." },
      ],
      decisions: [
        { step: "icp_scoring", reasoning: "120 employees (ideal range), Series B funded, B2B SaaS matches ICP perfectly. VP Engineering is a key decision maker.", confidence: 0.94, outcome: "icp_fit_high" },
        { step: "lead_classification", reasoning: "Score 87 exceeds hot threshold of 80. Demo request shows strong buying intent.", confidence: 0.91, outcome: "classified_hot" },
        { step: "routing", reasoning: "Enterprise-grade lead with high score, route to dedicated enterprise sales rep", confidence: 0.95, outcome: "route_enterprise_sales" },
      ],
      policyChecks: [
        { policyName: "Score Explainability", passed: true, details: "Score breakdown provided: ICP Fit 92, Timing 85, Engagement 78", checkedAt: "2026-02-07T01:22:10Z" },
        { policyName: "Data Freshness", passed: true, details: "Enrichment data fetched live, less than 1 hour old", checkedAt: "2026-02-07T01:22:11Z" },
      ],
      tokenUsage: { promptTokens: 1890, completionTokens: 545, totalTokens: 2435 },
    },
    {
      status: "completed", costUsd: 0.072, latencyMs: 3800,
      inputSummary: "Inbound lead: Mike Rodriguez, Marketing Manager at BrightPath (Seed, 25 employees)",
      outputSummary: "Lead scored 42/100 (Nurture), small company below ICP threshold, added to nurture sequence",
      modelId: "claude-3.5-sonnet", timeOffsetMs: 15 * 3600000,
      promptInputs: { systemPrompt: "Score inbound leads based on ICP fit, firmographic data, and behavioral signals. Provide detailed reasoning for each score component.", userMessage: "Score and route new lead: Mike Rodriguez from BrightPath", contextVariables: { leadSource: "blog_signup", companySize: 25, fundingStage: "Seed", industry: "EdTech", title: "Marketing Manager" } },
      toolCalls: [
        { name: "enrich_company", arguments: { companyName: "BrightPath", domain: "brightpath.co" }, result: { employees: 25, revenue: "$1.2M ARR", funding: "Seed ($2M)", industry: "EdTech", techStack: ["Heroku", "Rails"] }, latencyMs: 1920, status: "success" },
        { name: "check_crm", arguments: { email: "mike@brightpath.co", companyName: "BrightPath" }, result: { existingAccount: false, previousInteractions: 0, competitorCustomer: false }, latencyMs: 580, status: "success" },
        { name: "score_lead", arguments: { icpProfile: "enterprise_saas_v3", firmographics: { employees: 25, revenue: "1.2M", funding: "Seed" }, behavioral: { source: "blog_signup", pageViews: 3, contentDownloads: 0 } }, result: { totalScore: 42, components: { icpFit: 35, timing: 48, engagement: 45 } }, latencyMs: 850, status: "success" },
      ],
      retrievedDocs: [
        { source: "icp_profiles", title: "Enterprise SaaS ICP v3", relevanceScore: 0.94, snippet: "Ideal profile: 50-500 employees, Series A-C, B2B SaaS, VP+ decision maker." },
      ],
      decisions: [
        { step: "icp_scoring", reasoning: "25 employees below 50 minimum ICP threshold. Seed stage too early. EdTech not core vertical.", confidence: 0.88, outcome: "icp_fit_low" },
        { step: "lead_classification", reasoning: "Score 42 below warm threshold of 50. Blog signup is low-intent signal.", confidence: 0.90, outcome: "classified_nurture" },
        { step: "routing", reasoning: "Low-score lead added to automated nurture email sequence for future re-engagement", confidence: 0.93, outcome: "route_nurture_sequence" },
      ],
      policyChecks: [
        { policyName: "Score Explainability", passed: true, details: "Score breakdown provided: ICP Fit 35, Timing 48, Engagement 45", checkedAt: "2026-02-06T16:40:05Z" },
        { policyName: "Data Freshness", passed: true, details: "Enrichment data is current", checkedAt: "2026-02-06T16:40:06Z" },
      ],
      tokenUsage: { promptTokens: 1650, completionTokens: 480, totalTokens: 2130 },
    },
    {
      status: "completed", costUsd: 0.095, latencyMs: 4500,
      inputSummary: "Inbound lead: Priya Sharma, CTO at Quantum Analytics (Series A, 85 employees)",
      outputSummary: "Lead scored 74/100 (Warm), strong ICP fit but competitor customer, flagged for strategic outreach",
      modelId: "claude-3.5-sonnet", timeOffsetMs: 26 * 3600000,
      promptInputs: { systemPrompt: "Score inbound leads based on ICP fit, firmographic data, and behavioral signals. Provide detailed reasoning for each score component.", userMessage: "Score and route new lead: Priya Sharma from Quantum Analytics", contextVariables: { leadSource: "pricing_page", companySize: 85, fundingStage: "Series A", industry: "Data Analytics", title: "CTO" } },
      toolCalls: [
        { name: "enrich_company", arguments: { companyName: "Quantum Analytics", domain: "quantumanalytics.com" }, result: { employees: 85, revenue: "$9M ARR", funding: "Series A ($15M)", industry: "Data Analytics", techStack: ["GCP", "Python", "Snowflake"] }, latencyMs: 2100, status: "success" },
        { name: "check_crm", arguments: { email: "priya@quantumanalytics.com", companyName: "Quantum Analytics" }, result: { existingAccount: false, previousInteractions: 1, competitorCustomer: true, competitor: "CompetitorX" }, latencyMs: 650, status: "success" },
        { name: "score_lead", arguments: { icpProfile: "enterprise_saas_v3", firmographics: { employees: 85, revenue: "9M", funding: "Series A" }, behavioral: { source: "pricing_page", pageViews: 8, contentDownloads: 1 }, modifiers: { competitorCustomer: true } }, result: { totalScore: 74, components: { icpFit: 82, timing: 75, engagement: 68, competitorPenalty: -5 } }, latencyMs: 1050, status: "success" },
      ],
      retrievedDocs: [
        { source: "icp_profiles", title: "Enterprise SaaS ICP v3", relevanceScore: 0.94, snippet: "Ideal profile: 50-500 employees, Series A-C, B2B SaaS, VP+ decision maker." },
        { source: "win_loss_reports", title: "CompetitorX Displacement Playbook", relevanceScore: 0.88, snippet: "Competitor displacement requires ROI-focused messaging. Average sales cycle: 45 days longer." },
      ],
      decisions: [
        { step: "icp_scoring", reasoning: "85 employees in ideal range, Series A funded, CTO is key buyer. Industry adjacent to core vertical.", confidence: 0.89, outcome: "icp_fit_good" },
        { step: "competitor_assessment", reasoning: "Currently using CompetitorX, pricing page visit suggests evaluating switch", confidence: 0.85, outcome: "competitor_displacement_opportunity" },
        { step: "lead_classification", reasoning: "Score 74 in warm range (50-80). Good fit but competitor displacement adds complexity.", confidence: 0.87, outcome: "classified_warm" },
        { step: "routing", reasoning: "Flag for strategic sales outreach with competitor displacement playbook", confidence: 0.92, outcome: "route_strategic_sales" },
      ],
      policyChecks: [
        { policyName: "Score Explainability", passed: true, details: "Score breakdown with competitor modifier: ICP 82, Timing 75, Engagement 68, Competitor -5", checkedAt: "2026-02-05T21:15:33Z" },
        { policyName: "Data Freshness", passed: true, details: "CRM data shows 1 prior interaction from 3 months ago", checkedAt: "2026-02-05T21:15:34Z" },
      ],
      tokenUsage: { promptTokens: 2200, completionTokens: 620, totalTokens: 2820 },
    },
  ];

  for (const trace of leadScorerTraces) {
    const startedAt = new Date(Date.now() - trace.timeOffsetMs);
    const endedAt = new Date(startedAt.getTime() + trace.latencyMs);
    await db.insert(runTraces).values({
      agentId: agent3.id,
      environment: "prod",
      status: trace.status,
      costUsd: trace.costUsd,
      latencyMs: trace.latencyMs,
      inputSummary: trace.inputSummary,
      outputSummary: trace.outputSummary,
      modelId: trace.modelId,
      promptInputs: trace.promptInputs,
      toolCalls: trace.toolCalls,
      retrievedDocs: trace.retrievedDocs,
      decisions: trace.decisions,
      policyChecks: trace.policyChecks,
      tokenUsage: trace.tokenUsage,
      startedAt,
      endedAt,
    });
  }

  // Content Moderator — 3 traces
  const moderatorTraces = [
    {
      status: "completed", costUsd: 0.008, latencyMs: 380,
      inputSummary: "User post: Product review with mild profanity in gaming forum",
      outputSummary: "Classified as borderline, profanity filter applied, post approved with edit",
      modelId: "gpt-4o-mini", timeOffsetMs: 2 * 3600000,
      promptInputs: { systemPrompt: "Classify user-generated content for policy violations. Categories: safe, borderline, violation, severe. Apply content policies strictly.", userMessage: "Review user post for content policy compliance", contextVariables: { contentType: "forum_post", forumCategory: "gaming", userId: "usr_gaming_4821", contentLength: 245, reportCount: 0 } },
      toolCalls: [
        { name: "classify_content", arguments: { text: "[redacted user post]", categories: ["safe", "borderline", "violation", "severe"], context: "gaming_forum" }, result: { classification: "borderline", confidence: 0.87, flags: ["mild_profanity"] }, latencyMs: 145, status: "success" },
        { name: "check_toxicity", arguments: { text: "[redacted user post]", threshold: 0.7 }, result: { toxicityScore: 0.42, categories: { profanity: 0.65, threat: 0.02, harassment: 0.05 } }, latencyMs: 98, status: "success" },
      ],
      retrievedDocs: [],
      decisions: [
        { step: "content_classification", reasoning: "Mild profanity detected but in gaming context where community standards are more relaxed", confidence: 0.87, outcome: "borderline" },
        { step: "action_decision", reasoning: "Toxicity score 0.42 below 0.7 auto-remove threshold. Apply profanity filter and approve.", confidence: 0.91, outcome: "approve_with_filter" },
      ],
      policyChecks: [
        { policyName: "Community Guidelines", passed: true, details: "Post meets gaming forum community standards after profanity filter", checkedAt: "2026-02-07T05:30:01Z" },
        { policyName: "Hate Speech Policy", passed: true, details: "No hate speech or discrimination detected", checkedAt: "2026-02-07T05:30:01Z" },
        { policyName: "Minor Safety", passed: true, details: "No content harmful to minors detected", checkedAt: "2026-02-07T05:30:02Z" },
      ],
      tokenUsage: { promptTokens: 420, completionTokens: 125, totalTokens: 545 },
    },
    {
      status: "completed", costUsd: 0.009, latencyMs: 450,
      inputSummary: "User comment: Harassment and personal attack on another user",
      outputSummary: "Classified as violation, auto-removed, user warned, evidence package created",
      modelId: "gpt-4o-mini", timeOffsetMs: 7 * 3600000,
      promptInputs: { systemPrompt: "Classify user-generated content for policy violations. Categories: safe, borderline, violation, severe. Apply content policies strictly.", userMessage: "Review reported comment for harassment", contextVariables: { contentType: "comment", forumCategory: "general", userId: "usr_gen_9102", contentLength: 89, reportCount: 3, previousWarnings: 1 } },
      toolCalls: [
        { name: "classify_content", arguments: { text: "[redacted comment]", categories: ["safe", "borderline", "violation", "severe"], context: "general" }, result: { classification: "violation", confidence: 0.95, flags: ["harassment", "personal_attack"] }, latencyMs: 138, status: "success" },
        { name: "check_toxicity", arguments: { text: "[redacted comment]", threshold: 0.7 }, result: { toxicityScore: 0.88, categories: { profanity: 0.45, threat: 0.15, harassment: 0.92 } }, latencyMs: 105, status: "success" },
        { name: "flag_review", arguments: { contentId: "cmt_77291", action: "remove", reason: "harassment", userId: "usr_gen_9102", previousWarnings: 1 }, result: { actionTaken: "removed", userWarningIssued: true, warningCount: 2 }, latencyMs: 85, status: "success" },
      ],
      retrievedDocs: [],
      decisions: [
        { step: "content_classification", reasoning: "Clear personal attack targeting another user with harassment language", confidence: 0.95, outcome: "violation" },
        { step: "action_decision", reasoning: "Toxicity 0.88 exceeds threshold. Harassment score 0.92 is high. Auto-remove per policy.", confidence: 0.97, outcome: "auto_remove" },
        { step: "user_action", reasoning: "User has 1 previous warning. Issue second warning. Next violation triggers temp ban.", confidence: 0.99, outcome: "warning_issued" },
      ],
      policyChecks: [
        { policyName: "Anti-Harassment Policy", passed: false, details: "Harassment detected with 0.92 confidence, content removed", checkedAt: "2026-02-07T00:15:44Z" },
        { policyName: "Community Guidelines", passed: false, details: "Personal attacks violate community guidelines section 3.2", checkedAt: "2026-02-07T00:15:44Z" },
        { policyName: "Progressive Discipline", passed: true, details: "Warning #2 issued per progressive discipline policy", checkedAt: "2026-02-07T00:15:45Z" },
      ],
      tokenUsage: { promptTokens: 380, completionTokens: 140, totalTokens: 520 },
    },
    {
      status: "completed", costUsd: 0.007, latencyMs: 320,
      inputSummary: "User post: Legitimate product question in marketplace forum",
      outputSummary: "Classified as safe, no policy violations, post approved",
      modelId: "gpt-4o-mini", timeOffsetMs: 11 * 3600000,
      promptInputs: { systemPrompt: "Classify user-generated content for policy violations. Categories: safe, borderline, violation, severe. Apply content policies strictly.", userMessage: "Review new marketplace post for compliance", contextVariables: { contentType: "marketplace_post", forumCategory: "marketplace", userId: "usr_mkt_2244", contentLength: 312, reportCount: 0, previousWarnings: 0 } },
      toolCalls: [
        { name: "classify_content", arguments: { text: "[redacted marketplace post]", categories: ["safe", "borderline", "violation", "severe"], context: "marketplace" }, result: { classification: "safe", confidence: 0.98, flags: [] }, latencyMs: 130, status: "success" },
        { name: "check_toxicity", arguments: { text: "[redacted marketplace post]", threshold: 0.7 }, result: { toxicityScore: 0.03, categories: { profanity: 0.01, threat: 0.0, harassment: 0.01 } }, latencyMs: 88, status: "success" },
      ],
      retrievedDocs: [],
      decisions: [
        { step: "content_classification", reasoning: "Standard product question with no policy-violating language", confidence: 0.98, outcome: "safe" },
        { step: "action_decision", reasoning: "Toxicity score 0.03 well below any threshold. Approve immediately.", confidence: 0.99, outcome: "approve" },
      ],
      policyChecks: [
        { policyName: "Community Guidelines", passed: true, details: "Post fully compliant with all community guidelines", checkedAt: "2026-02-06T20:45:12Z" },
        { policyName: "Spam Detection", passed: true, details: "No spam indicators detected, genuine product inquiry", checkedAt: "2026-02-06T20:45:12Z" },
        { policyName: "Marketplace Rules", passed: true, details: "Post follows marketplace posting format and rules", checkedAt: "2026-02-06T20:45:13Z" },
      ],
      tokenUsage: { promptTokens: 350, completionTokens: 95, totalTokens: 445 },
    },
  ];

  for (const trace of moderatorTraces) {
    const startedAt = new Date(Date.now() - trace.timeOffsetMs);
    const endedAt = new Date(startedAt.getTime() + trace.latencyMs);
    await db.insert(runTraces).values({
      agentId: agent4.id,
      environment: "prod",
      status: trace.status,
      costUsd: trace.costUsd,
      latencyMs: trace.latencyMs,
      inputSummary: trace.inputSummary,
      outputSummary: trace.outputSummary,
      modelId: trace.modelId,
      promptInputs: trace.promptInputs,
      toolCalls: trace.toolCalls,
      retrievedDocs: trace.retrievedDocs,
      decisions: trace.decisions,
      policyChecks: trace.policyChecks,
      tokenUsage: trace.tokenUsage,
      startedAt,
      endedAt,
    });
  }

  // Knowledge Base Updater — 2 traces
  const kbUpdaterTraces = [
    {
      status: "completed", costUsd: 0.055, latencyMs: 5200,
      inputSummary: "Drift detected: API documentation outdated for v58 endpoints",
      outputSummary: "Updated 3 KB articles with new API v58 endpoints, validated links, published changes",
      modelId: "claude-3-haiku", timeOffsetMs: 9 * 3600000,
      promptInputs: { systemPrompt: "Monitor knowledge base articles for drift and outdated information. Fetch authoritative sources and update articles while maintaining accuracy.", userMessage: "Drift alert: API documentation references deprecated v55 endpoints", contextVariables: { articleIds: ["kb-1876", "kb-1901", "kb-1923"], driftScore: 0.72, lastUpdated: "2025-11-15", sourceUrl: "https://docs.example.com/api/v58" } },
      toolCalls: [
        { name: "detect_drift", arguments: { articleIds: ["kb-1876", "kb-1901", "kb-1923"], checkAgainst: "source_docs" }, result: { driftDetected: true, articlesAffected: 3, driftScore: 0.72, details: "API v55 references deprecated, v58 is current" }, latencyMs: 1200, status: "success" },
        { name: "fetch_source", arguments: { url: "https://docs.example.com/api/v58", format: "markdown" }, result: { content: "[API v58 documentation content]", lastModified: "2026-01-28", wordCount: 4500 }, latencyMs: 1800, status: "success" },
        { name: "update_article", arguments: { articleId: "kb-1876", changes: { replaceRefs: "v55->v58", updateEndpoints: true, validateLinks: true } }, result: { updated: true, changesApplied: 8, linksValidated: 12, brokenLinksFixed: 2 }, latencyMs: 950, status: "success" },
        { name: "update_article", arguments: { articleId: "kb-1901", changes: { replaceRefs: "v55->v58", updateCodeSamples: true } }, result: { updated: true, changesApplied: 5, codeSamplesUpdated: 3 }, latencyMs: 820, status: "success" },
      ],
      retrievedDocs: [
        { source: "external_docs", title: "API v58 Migration Guide", relevanceScore: 0.97, snippet: "v58 introduces new authentication flow and deprecates legacy endpoints. All v55 endpoints sunset Feb 28, 2026." },
        { source: "knowledge_base", title: "Salesforce API v58 Migration Guide (current)", relevanceScore: 0.95, snippet: "API v55 deprecated as of Jan 2026. Update your integration to use v58 endpoints." },
        { source: "external_docs", title: "API v58 Changelog", relevanceScore: 0.89, snippet: "Breaking changes: /api/v55/records -> /api/v58/records, new OAuth 2.1 required." },
      ],
      decisions: [
        { step: "drift_assessment", reasoning: "Drift score 0.72 exceeds 0.5 threshold. 3 articles reference deprecated v55 API.", confidence: 0.95, outcome: "drift_confirmed" },
        { step: "source_validation", reasoning: "Official API docs updated Jan 28, 2026. KB articles last updated Nov 2025.", confidence: 0.98, outcome: "source_more_current" },
        { step: "update_scope", reasoning: "All 3 articles need endpoint references updated. 2 need code sample changes.", confidence: 0.93, outcome: "batch_update" },
      ],
      policyChecks: [
        { policyName: "Source Authority", passed: true, details: "Updates sourced from official API documentation", checkedAt: "2026-02-06T22:10:05Z" },
        { policyName: "Change Review", passed: true, details: "Automated updates within scope of approved drift correction", checkedAt: "2026-02-06T22:10:06Z" },
      ],
      tokenUsage: { promptTokens: 3800, completionTokens: 1200, totalTokens: 5000 },
    },
    {
      status: "completed", costUsd: 0.042, latencyMs: 3800,
      inputSummary: "Scheduled sync: Checking support policy documents for recent updates",
      outputSummary: "Synced 2 policy documents, no drift detected in remaining 87 articles",
      modelId: "claude-3-haiku", timeOffsetMs: 20 * 3600000,
      promptInputs: { systemPrompt: "Monitor knowledge base articles for drift and outdated information. Fetch authoritative sources and update articles while maintaining accuracy.", userMessage: "Scheduled daily sync check for support policy documents", contextVariables: { syncType: "scheduled", sourceCategory: "support_policies", totalArticles: 89, lastSyncAt: "2026-02-05T08:00:00Z" } },
      toolCalls: [
        { name: "detect_drift", arguments: { category: "support_policies", checkAgainst: "source_docs", fullScan: true }, result: { driftDetected: true, articlesAffected: 2, totalScanned: 89, driftScore: 0.31 }, latencyMs: 2100, status: "success" },
        { name: "fetch_source", arguments: { category: "support_policies", lastModifiedAfter: "2026-02-05T08:00:00Z" }, result: { documentsFound: 2, documents: ["refund_policy_v3.3", "escalation_matrix_v2.1"] }, latencyMs: 850, status: "success" },
        { name: "update_article", arguments: { articleId: "kb-892", changes: { source: "refund_policy_v3.3", updateSections: ["refund_amounts", "processing_time"] } }, result: { updated: true, changesApplied: 3, sectionsUpdated: 2 }, latencyMs: 620, status: "success" },
      ],
      retrievedDocs: [
        { source: "support_policies", title: "Refund Policy v3.3", relevanceScore: 0.96, snippet: "Updated refund processing time from 5-7 to 3-5 business days effective Feb 2026." },
        { source: "support_policies", title: "Escalation Matrix v2.1", relevanceScore: 0.91, snippet: "Added new escalation path for enterprise accounts with dedicated support managers." },
      ],
      decisions: [
        { step: "drift_scan", reasoning: "89 articles scanned, 2 have source document updates since last sync", confidence: 0.97, outcome: "minor_drift_detected" },
        { step: "update_priority", reasoning: "Refund policy change affects customer-facing responses, prioritize update", confidence: 0.94, outcome: "priority_update" },
        { step: "sync_status", reasoning: "All 87 remaining articles current with sources. Sync complete.", confidence: 0.99, outcome: "sync_complete" },
      ],
      policyChecks: [
        { policyName: "Source Authority", passed: true, details: "Updates from authorized internal policy documents", checkedAt: "2026-02-06T11:00:22Z" },
        { policyName: "Change Review", passed: true, details: "Policy document changes auto-approved for KB sync", checkedAt: "2026-02-06T11:00:23Z" },
      ],
      tokenUsage: { promptTokens: 2900, completionTokens: 850, totalTokens: 3750 },
    },
  ];

  for (const trace of kbUpdaterTraces) {
    const startedAt = new Date(Date.now() - trace.timeOffsetMs);
    const endedAt = new Date(startedAt.getTime() + trace.latencyMs);
    await db.insert(runTraces).values({
      agentId: agent5.id,
      environment: "prod",
      status: trace.status,
      costUsd: trace.costUsd,
      latencyMs: trace.latencyMs,
      inputSummary: trace.inputSummary,
      outputSummary: trace.outputSummary,
      modelId: trace.modelId,
      promptInputs: trace.promptInputs,
      toolCalls: trace.toolCalls,
      retrievedDocs: trace.retrievedDocs,
      decisions: trace.decisions,
      policyChecks: trace.policyChecks,
      tokenUsage: trace.tokenUsage,
      startedAt,
      endedAt,
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

  // Agent Templates
  await db.insert(agentTemplates).values([
    {
      name: "Customer Support Triage",
      description: "Autonomous tier-1 support agent that classifies tickets, searches knowledge base, and routes or resolves issues",
      category: "support",
      icon: "headphones",
      complexity: "high",
      modelProvider: "openai",
      modelName: "gpt-4.1",
      defaultRiskTier: "HIGH",
      defaultAutonomyMode: "autonomous",
      toolsConfig: [
        { name: "search_knowledge_base", description: "Search internal KB for relevant articles", permissions: ["kb:read"] },
        { name: "classify_ticket", description: "Classify ticket priority and category", permissions: ["tickets:read"] },
        { name: "route_ticket", description: "Route ticket to appropriate team", permissions: ["tickets:write"] },
        { name: "send_response", description: "Send automated response to customer", permissions: ["comms:write"] },
      ],
      permissionsConfig: { dataAccess: ["tickets", "knowledge_base", "customer_profiles"], apiAccess: ["crm", "helpdesk"], writeAccess: ["tickets", "responses"] },
      memoryRagConfig: { vectorStore: "pinecone", retrievalStrategy: "hybrid", chunkSize: 512, embeddingModel: "text-embedding-3-small", topK: 5 },
      blueprintJson: {
        nodes: [
          { id: "validate", type: "schema_validate", label: "Validate Input" },
          { id: "retrieve", type: "rag", label: "KB Retrieval" },
          { id: "classify", type: "classifier", label: "Classify Intent" },
          { id: "route", type: "router", label: "Route Decision" },
          { id: "respond", type: "llm_call", label: "Generate Response" },
        ],
      },
      policyBindings: [{ policyName: "PII Redaction", enforcement: "hard" }, { policyName: "Tone & Language", enforcement: "soft" }],
      evalBindings: [{ suiteName: "Support Quality Regression", schedule: "nightly" }],
      rollbackPlan: { triggerConditions: ["success_rate < 0.90", "p95_latency > 10000"], rollbackTargetVersion: "previous_stable" },
    },
    {
      name: "Document Extractor",
      description: "Extract structured data from invoices, receipts, and contracts using vision + NLP",
      category: "data_processing",
      icon: "file-text",
      complexity: "medium",
      modelProvider: "openai",
      modelName: "gpt-4.1",
      defaultRiskTier: "MEDIUM",
      defaultAutonomyMode: "assisted",
      toolsConfig: [
        { name: "ocr_extract", description: "Extract text from document images", permissions: ["docs:read"] },
        { name: "validate_fields", description: "Validate extracted fields against schema", permissions: ["schema:read"] },
        { name: "store_result", description: "Store structured extraction result", permissions: ["storage:write"] },
      ],
      permissionsConfig: { dataAccess: ["documents", "schemas"], apiAccess: ["ocr_service"], writeAccess: ["extractions"] },
      memoryRagConfig: { vectorStore: "chromadb", retrievalStrategy: "similarity", chunkSize: 1024, embeddingModel: "text-embedding-3-small", topK: 3 },
      blueprintJson: {
        nodes: [
          { id: "ingest", type: "schema_validate", label: "Ingest Document" },
          { id: "extract", type: "tool_call", label: "OCR Extract" },
          { id: "structure", type: "llm_call", label: "Structure Data" },
          { id: "validate", type: "schema_validate", label: "Validate Output" },
        ],
      },
      policyBindings: [{ policyName: "Data Retention", enforcement: "hard" }],
      evalBindings: [{ suiteName: "Extraction Accuracy", schedule: "weekly" }],
      rollbackPlan: { triggerConditions: ["accuracy < 0.95"], rollbackTargetVersion: "previous_stable" },
    },
    {
      name: "Lead Scoring Agent",
      description: "Score and qualify inbound leads using firmographic data, engagement signals, and predictive models",
      category: "sales",
      icon: "trending-up",
      complexity: "medium",
      modelProvider: "openai",
      modelName: "gpt-4.1",
      defaultRiskTier: "MEDIUM",
      defaultAutonomyMode: "autonomous",
      toolsConfig: [
        { name: "enrich_lead", description: "Enrich lead with firmographic data", permissions: ["leads:read", "enrichment:read"] },
        { name: "score_lead", description: "Calculate lead score based on signals", permissions: ["leads:read"] },
        { name: "update_crm", description: "Update lead score in CRM", permissions: ["crm:write"] },
      ],
      permissionsConfig: { dataAccess: ["leads", "firmographic_data", "engagement_events"], apiAccess: ["crm", "enrichment_api"], writeAccess: ["lead_scores"] },
      memoryRagConfig: { vectorStore: "pinecone", retrievalStrategy: "similarity", chunkSize: 256, embeddingModel: "text-embedding-3-small", topK: 10 },
      blueprintJson: {
        nodes: [
          { id: "ingest", type: "schema_validate", label: "Ingest Lead" },
          { id: "enrich", type: "tool_call", label: "Enrich Data" },
          { id: "score", type: "llm_call", label: "Score Lead" },
          { id: "route", type: "router", label: "Route by Score" },
        ],
      },
      policyBindings: [{ policyName: "Fair Scoring", enforcement: "hard" }],
      evalBindings: [{ suiteName: "Scoring Accuracy", schedule: "weekly" }],
      rollbackPlan: { triggerConditions: ["conversion_rate_delta > -10%"], rollbackTargetVersion: "previous_stable" },
    },
    {
      name: "Content Moderator",
      description: "Real-time content moderation for UGC platforms with multi-modal analysis",
      category: "trust_safety",
      icon: "shield",
      complexity: "high",
      modelProvider: "openai",
      modelName: "gpt-4.1",
      defaultRiskTier: "HIGH",
      defaultAutonomyMode: "autonomous",
      toolsConfig: [
        { name: "analyze_text", description: "Analyze text for policy violations", permissions: ["content:read"] },
        { name: "analyze_image", description: "Analyze images for policy violations", permissions: ["content:read"] },
        { name: "take_action", description: "Apply moderation action", permissions: ["content:write", "users:write"] },
      ],
      permissionsConfig: { dataAccess: ["user_content", "user_profiles", "moderation_rules"], apiAccess: ["vision_api"], writeAccess: ["moderation_actions", "user_flags"] },
      memoryRagConfig: null,
      blueprintJson: {
        nodes: [
          { id: "ingest", type: "schema_validate", label: "Ingest Content" },
          { id: "classify", type: "classifier", label: "Classify Risk" },
          { id: "review", type: "llm_call", label: "Deep Review" },
          { id: "action", type: "router", label: "Action Decision" },
        ],
      },
      policyBindings: [{ policyName: "Moderation Policy", enforcement: "hard" }, { policyName: "Appeal Rights", enforcement: "hard" }],
      evalBindings: [{ suiteName: "Moderation Accuracy", schedule: "daily" }],
      rollbackPlan: { triggerConditions: ["false_positive_rate > 0.05"], rollbackTargetVersion: "previous_stable" },
    },
    {
      name: "Knowledge Base Updater",
      description: "Automatically maintain and update knowledge bases from source documents and feedback loops",
      category: "knowledge_management",
      icon: "book-open",
      complexity: "low",
      modelProvider: "openai",
      modelName: "gpt-4.1",
      defaultRiskTier: "LOW",
      defaultAutonomyMode: "assisted",
      toolsConfig: [
        { name: "fetch_sources", description: "Fetch new source documents", permissions: ["docs:read"] },
        { name: "chunk_embed", description: "Chunk and embed documents", permissions: ["vectors:write"] },
        { name: "update_index", description: "Update search index", permissions: ["search:write"] },
      ],
      permissionsConfig: { dataAccess: ["source_documents", "feedback"], apiAccess: ["embedding_api"], writeAccess: ["knowledge_base", "search_index"] },
      memoryRagConfig: { vectorStore: "pinecone", retrievalStrategy: "hybrid", chunkSize: 512, embeddingModel: "text-embedding-3-small", topK: 5 },
      blueprintJson: {
        nodes: [
          { id: "fetch", type: "tool_call", label: "Fetch Sources" },
          { id: "process", type: "llm_call", label: "Process & Chunk" },
          { id: "embed", type: "tool_call", label: "Generate Embeddings" },
          { id: "index", type: "tool_call", label: "Update Index" },
        ],
      },
      policyBindings: [{ policyName: "Source Verification", enforcement: "soft" }],
      evalBindings: [{ suiteName: "Retrieval Quality", schedule: "weekly" }],
      rollbackPlan: { triggerConditions: ["retrieval_quality < 0.85"], rollbackTargetVersion: "previous_stable" },
    },
    {
      name: "Compliance Monitor",
      description: "Continuous compliance monitoring agent that checks regulatory requirements and flags violations",
      category: "governance",
      icon: "scale",
      complexity: "high",
      modelProvider: "openai",
      modelName: "gpt-4.1",
      defaultRiskTier: "HIGH",
      defaultAutonomyMode: "manual",
      toolsConfig: [
        { name: "scan_transactions", description: "Scan transactions for compliance issues", permissions: ["transactions:read"] },
        { name: "check_regulations", description: "Check against regulatory database", permissions: ["regulations:read"] },
        { name: "file_report", description: "File compliance report", permissions: ["reports:write"] },
      ],
      permissionsConfig: { dataAccess: ["transactions", "regulations", "audit_logs"], apiAccess: ["regulatory_db"], writeAccess: ["compliance_reports", "alerts"] },
      memoryRagConfig: { vectorStore: "pinecone", retrievalStrategy: "hybrid", chunkSize: 1024, embeddingModel: "text-embedding-3-small", topK: 10 },
      blueprintJson: {
        nodes: [
          { id: "scan", type: "tool_call", label: "Scan Data" },
          { id: "analyze", type: "llm_call", label: "Analyze Compliance" },
          { id: "classify", type: "classifier", label: "Risk Classification" },
          { id: "report", type: "tool_call", label: "Generate Report" },
          { id: "escalate", type: "human_review", label: "Expert Review" },
        ],
      },
      policyBindings: [{ policyName: "Regulatory Compliance", enforcement: "hard" }, { policyName: "Audit Trail", enforcement: "hard" }],
      evalBindings: [{ suiteName: "Compliance Detection", schedule: "daily" }],
      rollbackPlan: { triggerConditions: ["missed_violation_rate > 0.01"], rollbackTargetVersion: "previous_stable" },
    },
  ]);

  // Eval Test Cases and Runs for existing eval suites
  const existingEvals = await db.select().from(evalSuites);
  for (const suite of existingEvals) {
    const testCaseData = [];
    if (suite.name.includes("Regression") || suite.name.includes("Quality")) {
      testCaseData.push(
        { suiteId: suite.id, name: "Standard ticket classification", inputData: { ticket: "My order hasn't arrived", category: "shipping" }, expectedOutput: { classification: "shipping_issue", priority: "medium" }, tags: ["classification", "core"], weight: 1 },
        { suiteId: suite.id, name: "Escalation detection", inputData: { ticket: "I want to speak to a manager NOW", sentiment: "angry" }, expectedOutput: { shouldEscalate: true, reason: "customer_request" }, tags: ["escalation", "critical"], weight: 2 },
        { suiteId: suite.id, name: "KB retrieval accuracy", inputData: { query: "How to reset password" }, expectedOutput: { topArticle: "password-reset-guide", relevanceScore: 0.9 }, tags: ["retrieval", "core"], weight: 1.5 },
        { suiteId: suite.id, name: "Response tone check", inputData: { ticket: "This is frustrating", draft: "I understand your frustration" }, expectedOutput: { toneScore: 0.85, isProfessional: true }, tags: ["tone", "quality"], weight: 1 },
        { suiteId: suite.id, name: "Multi-language support", inputData: { ticket: "Mi pedido no ha llegado", language: "es" }, expectedOutput: { detectedLanguage: "es", canHandle: true }, tags: ["i18n", "edge_case"], weight: 1 },
      );
    } else if (suite.name.includes("Accuracy") || suite.name.includes("Extraction")) {
      testCaseData.push(
        { suiteId: suite.id, name: "Invoice total extraction", inputData: { documentType: "invoice", field: "total" }, expectedOutput: { value: "1234.56", confidence: 0.98 }, tags: ["extraction", "core"], weight: 2 },
        { suiteId: suite.id, name: "Date format handling", inputData: { documentType: "invoice", field: "date", format: "DD/MM/YYYY" }, expectedOutput: { normalizedDate: "2025-01-15", format: "ISO" }, tags: ["normalization", "core"], weight: 1 },
        { suiteId: suite.id, name: "Missing field detection", inputData: { documentType: "invoice", field: "po_number", present: false }, expectedOutput: { detected: false, fallback: "N/A" }, tags: ["edge_case"], weight: 1.5 },
        { suiteId: suite.id, name: "Currency detection", inputData: { text: "EUR 500.00" }, expectedOutput: { currency: "EUR", amount: 500.0 }, tags: ["extraction", "core"], weight: 1 },
      );
    } else {
      testCaseData.push(
        { suiteId: suite.id, name: "Basic functionality test", inputData: { input: "standard_input" }, expectedOutput: { status: "success" }, tags: ["core"], weight: 1 },
        { suiteId: suite.id, name: "Edge case handling", inputData: { input: "edge_case_input" }, expectedOutput: { status: "handled" }, tags: ["edge_case"], weight: 1.5 },
        { suiteId: suite.id, name: "Performance threshold", inputData: { input: "perf_test" }, expectedOutput: { latencyMs: 500, withinThreshold: true }, tags: ["performance"], weight: 1 },
      );
    }

    if (testCaseData.length > 0) {
      await db.insert(evalTestCases).values(testCaseData);
    }

    // Add eval runs for each suite
    const runData = [];
    const now2 = new Date();
    for (let r = 0; r < 5; r++) {
      const passed = Math.floor(Math.random() * 3) + (testCaseData.length - 2);
      const failed = testCaseData.length - passed;
      runData.push({
        suiteId: suite.id,
        agentId: suite.agentId,
        status: "completed" as const,
        totalCases: testCaseData.length,
        passedCases: Math.max(0, passed),
        failedCases: Math.max(0, failed),
        passRate: Math.max(0, passed) / testCaseData.length,
        avgLatencyMs: Math.floor(Math.random() * 2000) + 500,
        avgCostUsd: Math.random() * 0.05 + 0.01,
        triggeredBy: r === 0 ? "manual" : "scheduled",
        resultsJson: testCaseData.map((tc, i) => ({
          testCaseId: `tc-${i}`,
          testCaseName: tc.name,
          passed: i < passed,
          actualOutput: tc.expectedOutput,
          latencyMs: Math.floor(Math.random() * 3000) + 200,
          costUsd: Math.random() * 0.02 + 0.005,
        })),
        startedAt: new Date(now2.getTime() - (r * 24 * 60 * 60 * 1000)),
        completedAt: new Date(now2.getTime() - (r * 24 * 60 * 60 * 1000) + 60000),
      });
    }
    await db.insert(evalRuns).values(runData);
  }

  console.log("Database seeded successfully");
}
