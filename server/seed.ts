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
        { id: "validate", type: "schema_validate", schema: "SupportTicketV1" },
        { id: "retrieve", type: "rag", sourceIds: ["kb", "policies"], citationsRequired: true },
        { id: "plan", type: "llm_plan" },
        { id: "act", type: "tool_call", tool: "zendesk.create_reply", dryRunInShadow: true },
        { id: "policy", type: "policy_check", bundle: "support_default" },
        { id: "format", type: "response_format", schema: "SupportReplyV1" },
      ],
      edges: [
        { from: "validate", to: "retrieve" },
        { from: "retrieve", to: "plan" },
        { from: "plan", to: "act" },
        { from: "act", to: "policy" },
        { from: "policy", to: "format" },
      ],
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
  }).returning();

  // Deployments
  await db.insert(deployments).values([
    { agentId: agent1.id, agentName: "Support Triage Agent", environment: "prod", version: "2.3.1", status: "deployed", rolloutStrategy: "canary", canaryPercent: 100, approvedBy: "Expert Validator" },
    { agentId: agent1.id, agentName: "Support Triage Agent", environment: "staging", version: "2.4.0-beta", status: "deployed", rolloutStrategy: "direct", canaryPercent: 0 },
    { agentId: agent2.id, agentName: "Invoice Extractor", environment: "prod", version: "1.8.0", status: "deployed", rolloutStrategy: "canary", canaryPercent: 100, approvedBy: "Finance Lead" },
    { agentId: agent2.id, agentName: "Invoice Extractor", environment: "pilot", version: "1.9.0-rc1", status: "canary", rolloutStrategy: "canary", canaryPercent: 25 },
    { agentId: agent3.id, agentName: "Lead Scorer", environment: "prod", version: "3.1.2", status: "deployed", rolloutStrategy: "direct", canaryPercent: 100, approvedBy: "Revenue Ops Lead" },
    { agentId: agent4.id, agentName: "Content Moderator", environment: "prod", version: "4.0.0", status: "deployed", rolloutStrategy: "canary", canaryPercent: 100 },
    { agentId: agent5.id, agentName: "Knowledge Base Updater", environment: "staging", version: "1.2.0", status: "deployed", rolloutStrategy: "shadow", canaryPercent: 0 },
    { agentId: agent4.id, agentName: "Content Moderator", environment: "staging", version: "4.1.0-alpha", status: "pending", rolloutStrategy: "shadow", canaryPercent: 0 },
  ]);

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
