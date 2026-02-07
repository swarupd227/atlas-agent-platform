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
    slaConfig: { minSuccessRate: 0.92, maxP95LatencyMs: 8000, maxPolicyViolationRate: 0.001 },
  }).returning();

  const [outcome2] = await db.insert(outcomeContracts).values({
    name: "Invoice Processing Automation",
    description: "Extract, validate and route invoices with 98% accuracy",
    riskTier: "MEDIUM",
    status: "active",
    pricingModel: "PER_OUTCOME_EVENT",
    pricePerUnit: 1.75,
    slaConfig: { minSuccessRate: 0.98, maxP95LatencyMs: 5000 },
  }).returning();

  const [outcome3] = await db.insert(outcomeContracts).values({
    name: "Lead Qualification Pipeline",
    description: "Score and qualify inbound leads with enrichment and routing",
    riskTier: "LOW",
    status: "active",
    pricingModel: "PER_OUTCOME_EVENT",
    pricePerUnit: 3.00,
    slaConfig: { minSuccessRate: 0.85, maxP95LatencyMs: 12000 },
  }).returning();

  const [outcome4] = await db.insert(outcomeContracts).values({
    name: "Content Moderation",
    description: "Automated content moderation for user-generated content platforms",
    riskTier: "HIGH",
    status: "active",
    pricingModel: "PER_OUTCOME_EVENT",
    pricePerUnit: 0.50,
    slaConfig: { minSuccessRate: 0.99, maxP95LatencyMs: 2000 },
  }).returning();

  // KPI Definitions
  await db.insert(kpiDefinitions).values([
    { outcomeId: outcome1.id, name: "Autonomous Resolutions", unit: "count", target: 500, currentValue: 423, confidence: 0.89, trend: "up" },
    { outcomeId: outcome1.id, name: "Customer Satisfaction", unit: "score", target: 4.5, currentValue: 4.3, confidence: 0.92, trend: "stable" },
    { outcomeId: outcome1.id, name: "Avg Response Time", unit: "seconds", target: 30, currentValue: 22, confidence: 0.95, trend: "up" },
    { outcomeId: outcome2.id, name: "Invoices Processed", unit: "count", target: 1200, currentValue: 1087, confidence: 0.94, trend: "up" },
    { outcomeId: outcome2.id, name: "Extraction Accuracy", unit: "percent", target: 98, currentValue: 97.2, confidence: 0.91, trend: "stable" },
    { outcomeId: outcome3.id, name: "Leads Qualified", unit: "count", target: 300, currentValue: 267, confidence: 0.87, trend: "up" },
    { outcomeId: outcome3.id, name: "Conversion Rate", unit: "percent", target: 15, currentValue: 13.8, confidence: 0.82, trend: "up" },
    { outcomeId: outcome4.id, name: "Items Moderated", unit: "count", target: 50000, currentValue: 47823, confidence: 0.96, trend: "up" },
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
