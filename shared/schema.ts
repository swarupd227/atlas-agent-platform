import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, real, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email"),
  role: text("role").default("agent_engineer"),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const outcomeContracts = pgTable("outcome_contracts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  riskTier: text("risk_tier").notNull().default("MEDIUM"),
  status: text("status").notNull().default("active"),
  version: integer("version").notNull().default(1),
  pricingModel: text("pricing_model").default("PER_OUTCOME_EVENT"),
  pricePerUnit: real("price_per_unit").default(0),
  currency: text("currency").default("USD"),
  pricingTiers: jsonb("pricing_tiers"),
  volumeCap: integer("volume_cap"),
  slaConfig: jsonb("sla_config"),
  attributionRules: jsonb("attribution_rules"),
  approvalGates: jsonb("approval_gates"),
  riskThreshold: real("risk_threshold").default(0.8),
  maxDriftPercent: real("max_drift_percent").default(10),
  autoPauseTrigger: boolean("auto_pause_trigger").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertOutcomeContractSchema = createInsertSchema(outcomeContracts).omit({ id: true, createdAt: true });
export type InsertOutcomeContract = z.infer<typeof insertOutcomeContractSchema>;
export type OutcomeContract = typeof outcomeContracts.$inferSelect;

export const kpiDefinitions = pgTable("kpi_definitions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  outcomeId: varchar("outcome_id").notNull(),
  name: text("name").notNull(),
  unit: text("unit").notNull().default("count"),
  baseline: real("baseline").default(0),
  target: real("target").notNull(),
  currentValue: real("current_value").default(0),
  weight: real("weight").default(1),
  slaThreshold: real("sla_threshold"),
  breachLevel: text("breach_level").default("warning"),
  confidence: real("confidence").default(0),
  trend: text("trend").default("stable"),
  expression: text("expression"),
});

export const insertKpiDefinitionSchema = createInsertSchema(kpiDefinitions).omit({ id: true });
export type InsertKpiDefinition = z.infer<typeof insertKpiDefinitionSchema>;
export type KpiDefinition = typeof kpiDefinitions.$inferSelect;

export const agents = pgTable("agents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  owner: text("owner"),
  outcomeId: varchar("outcome_id"),
  status: text("status").notNull().default("active"),
  riskTier: text("risk_tier").notNull().default("MEDIUM"),
  autonomyMode: text("autonomy_mode").notNull().default("assisted"),
  currentVersion: text("current_version").default("1.0.0"),
  environment: text("environment").default("staging"),
  healthScore: real("health_score").default(85),
  successRate: real("success_rate").default(0.95),
  avgLatencyMs: integer("avg_latency_ms").default(250),
  costPerRun: real("cost_per_run").default(0.05),
  monthlyCost: real("monthly_cost").default(0),
  monthlyRevenue: real("monthly_revenue").default(0),
  totalRuns: integer("total_runs").default(0),
  modelProvider: text("model_provider").default("openai"),
  modelName: text("model_name").default("gpt-4.1"),
  blueprintJson: jsonb("blueprint_json"),
  toolsConfig: jsonb("tools_config"),
  permissionsConfig: jsonb("permissions_config"),
  memoryRagConfig: jsonb("memory_rag_config"),
  policyBindings: jsonb("policy_bindings"),
  evalBindings: jsonb("eval_bindings"),
  rollbackPlan: jsonb("rollback_plan"),
  toolAccessClass: text("tool_access_class").default("standard"),
  complianceTags: text("compliance_tags").array().default(sql`'{}'::text[]`),
  lastIncidentAt: timestamp("last_incident_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAgentSchema = createInsertSchema(agents).omit({ id: true, createdAt: true });
export type InsertAgent = z.infer<typeof insertAgentSchema>;
export type Agent = typeof agents.$inferSelect;

export const agentVersions = pgTable("agent_versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id").notNull(),
  semver: text("semver").notNull(),
  blueprintHash: text("blueprint_hash"),
  status: text("status").notNull().default("draft"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAgentVersionSchema = createInsertSchema(agentVersions).omit({ id: true, createdAt: true });
export type InsertAgentVersion = z.infer<typeof insertAgentVersionSchema>;
export type AgentVersion = typeof agentVersions.$inferSelect;

export const deployments = pgTable("deployments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id").notNull(),
  agentName: text("agent_name"),
  environment: text("environment").notNull().default("staging"),
  versionId: varchar("version_id"),
  version: text("version"),
  status: text("status").notNull().default("pending"),
  canaryPercent: integer("canary_percent").default(0),
  rolloutStrategy: text("rollout_strategy").default("canary"),
  approvedBy: text("approved_by"),
  signatureHash: text("signature_hash"),
  promotedFrom: varchar("promoted_from"),
  canaryConfig: jsonb("canary_config"),
  rollbackConfig: jsonb("rollback_config"),
  promotedAt: timestamp("promoted_at"),
  deployedAt: timestamp("deployed_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertDeploymentSchema = createInsertSchema(deployments).omit({ id: true, createdAt: true });
export type InsertDeployment = z.infer<typeof insertDeploymentSchema>;
export type Deployment = typeof deployments.$inferSelect;

export const runTraces = pgTable("run_traces", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id").notNull(),
  versionId: varchar("version_id"),
  environment: text("environment").default("prod"),
  status: text("status").notNull().default("completed"),
  costUsd: real("cost_usd").default(0),
  latencyMs: integer("latency_ms").default(0),
  inputSummary: text("input_summary"),
  outputSummary: text("output_summary"),
  stepsJson: jsonb("steps_json"),
  modelId: text("model_id"),
  traceParentId: varchar("trace_parent_id"),
  promptInputs: jsonb("prompt_inputs"),
  toolCalls: jsonb("tool_calls"),
  retrievedDocs: jsonb("retrieved_docs"),
  decisions: jsonb("decisions"),
  policyChecks: jsonb("policy_checks"),
  tokenUsage: jsonb("token_usage"),
  startedAt: timestamp("started_at").defaultNow(),
  endedAt: timestamp("ended_at"),
});

export const insertRunTraceSchema = createInsertSchema(runTraces).omit({ id: true, startedAt: true });
export type InsertRunTrace = z.infer<typeof insertRunTraceSchema>;
export type RunTrace = typeof runTraces.$inferSelect;

export const evalSuites = pgTable("eval_suites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id").notNull(),
  name: text("name").notNull(),
  type: text("type").default("regression"),
  passRate: real("pass_rate").default(0),
  totalCases: integer("total_cases").default(0),
  lastRunAt: timestamp("last_run_at"),
  thresholdConfig: jsonb("threshold_config"),
  scorerConfig: jsonb("scorer_config"),
  coverageTags: text("coverage_tags").array(),
  environmentThresholds: jsonb("environment_thresholds"),
  schedule: text("schedule"),
});

export const insertEvalSuiteSchema = createInsertSchema(evalSuites).omit({ id: true });
export type InsertEvalSuite = z.infer<typeof insertEvalSuiteSchema>;
export type EvalSuite = typeof evalSuites.$inferSelect;

export const policies = pgTable("policies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  domain: text("domain").notNull().default("data_handling"),
  scopeType: text("scope_type").default("org"),
  scopeId: varchar("scope_id"),
  version: integer("version").notNull().default(1),
  status: text("status").notNull().default("active"),
  policyJson: jsonb("policy_json"),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPolicySchema = createInsertSchema(policies).omit({ id: true, createdAt: true });
export type InsertPolicy = z.infer<typeof insertPolicySchema>;
export type Policy = typeof policies.$inferSelect;

export const approvals = pgTable("approvals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull(),
  objectType: text("object_type").notNull(),
  objectId: varchar("object_id"),
  objectName: text("object_name"),
  riskScore: real("risk_score").default(0),
  status: text("status").notNull().default("pending"),
  requestedBy: text("requested_by"),
  decidedBy: text("decided_by"),
  description: text("description"),
  evidenceJson: jsonb("evidence_json"),
  decidedAt: timestamp("decided_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertApprovalSchema = createInsertSchema(approvals).omit({ id: true, createdAt: true });
export type InsertApproval = z.infer<typeof insertApprovalSchema>;
export type Approval = typeof approvals.$inferSelect;

export const auditEvents = pgTable("audit_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  actorType: text("actor_type").notNull().default("user"),
  actorId: varchar("actor_id"),
  action: text("action").notNull(),
  objectType: text("object_type").notNull(),
  objectId: varchar("object_id"),
  details: text("details"),
  sequenceNum: integer("sequence_num"),
  previousHash: text("previous_hash"),
  eventHash: text("event_hash"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAuditEventSchema = createInsertSchema(auditEvents).omit({ id: true, createdAt: true });
export type InsertAuditEvent = z.infer<typeof insertAuditEventSchema>;
export type AuditEvent = typeof auditEvents.$inferSelect;

export const policyExceptions = pgTable("policy_exceptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  policyId: varchar("policy_id").notNull(),
  agentId: varchar("agent_id"),
  requestedBy: text("requested_by").notNull(),
  reason: text("reason").notNull(),
  scope: text("scope").notNull().default("agent"),
  status: text("status").notNull().default("pending"),
  approvedBy: text("approved_by"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPolicyExceptionSchema = createInsertSchema(policyExceptions).omit({ id: true, createdAt: true });
export type InsertPolicyException = z.infer<typeof insertPolicyExceptionSchema>;
export type PolicyException = typeof policyExceptions.$inferSelect;

export const complianceReports = pgTable("compliance_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  framework: text("framework").notNull(),
  title: text("title").notNull(),
  status: text("status").notNull().default("draft"),
  overallScore: real("overall_score"),
  findings: jsonb("findings"),
  evidencePackage: jsonb("evidence_package"),
  generatedBy: text("generated_by").default("system"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertComplianceReportSchema = createInsertSchema(complianceReports).omit({ id: true, createdAt: true });
export type InsertComplianceReport = z.infer<typeof insertComplianceReportSchema>;
export type ComplianceReport = typeof complianceReports.$inferSelect;

export const invoices = pgTable("invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  outcomeId: varchar("outcome_id"),
  outcomeName: text("outcome_name"),
  periodStart: timestamp("period_start"),
  periodEnd: timestamp("period_end"),
  totalUnits: integer("total_units").default(0),
  unitPrice: real("unit_price").default(0),
  amount: real("amount").default(0),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true, createdAt: true });
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoices.$inferSelect;

export const outcomeEvents = pgTable("outcome_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  outcomeId: varchar("outcome_id").notNull(),
  agentId: varchar("agent_id"),
  type: text("type").notNull(),
  billable: boolean("billable").default(true),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertOutcomeEventSchema = createInsertSchema(outcomeEvents).omit({ id: true, createdAt: true });
export type InsertOutcomeEvent = z.infer<typeof insertOutcomeEventSchema>;
export type OutcomeEvent = typeof outcomeEvents.$inferSelect;

export const agentTemplates = pgTable("agent_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull().default("general"),
  industry: text("industry").default("cross_industry"),
  tags: text("tags").array().default(sql`'{}'::text[]`),
  icon: text("icon").default("bot"),
  complexity: text("complexity").default("medium"),
  modelProvider: text("model_provider").default("openai"),
  modelName: text("model_name").default("gpt-4.1"),
  toolsConfig: jsonb("tools_config"),
  permissionsConfig: jsonb("permissions_config"),
  memoryRagConfig: jsonb("memory_rag_config"),
  blueprintJson: jsonb("blueprint_json"),
  policyBindings: jsonb("policy_bindings"),
  evalBindings: jsonb("eval_bindings"),
  rollbackPlan: jsonb("rollback_plan"),
  defaultRiskTier: text("default_risk_tier").default("MEDIUM"),
  defaultAutonomyMode: text("default_autonomy_mode").default("assisted"),
  usageCount: integer("usage_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAgentTemplateSchema = createInsertSchema(agentTemplates).omit({ id: true, createdAt: true });
export type InsertAgentTemplate = z.infer<typeof insertAgentTemplateSchema>;
export type AgentTemplate = typeof agentTemplates.$inferSelect;

export const evalTestCases = pgTable("eval_test_cases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  suiteId: varchar("suite_id").notNull(),
  name: text("name").notNull(),
  inputData: jsonb("input_data"),
  expectedOutput: jsonb("expected_output"),
  tags: text("tags").array(),
  weight: real("weight").default(1),
  status: text("status").default("active"),
});

export const insertEvalTestCaseSchema = createInsertSchema(evalTestCases).omit({ id: true });
export type InsertEvalTestCase = z.infer<typeof insertEvalTestCaseSchema>;
export type EvalTestCase = typeof evalTestCases.$inferSelect;

export const evalRuns = pgTable("eval_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  suiteId: varchar("suite_id").notNull(),
  agentId: varchar("agent_id"),
  versionId: varchar("version_id"),
  status: text("status").notNull().default("running"),
  totalCases: integer("total_cases").default(0),
  passedCases: integer("passed_cases").default(0),
  failedCases: integer("failed_cases").default(0),
  passRate: real("pass_rate").default(0),
  avgLatencyMs: integer("avg_latency_ms").default(0),
  avgCostUsd: real("avg_cost_usd").default(0),
  resultsJson: jsonb("results_json"),
  triggeredBy: text("triggered_by").default("manual"),
  environment: text("environment").default("staging"),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const insertEvalRunSchema = createInsertSchema(evalRuns).omit({ id: true, startedAt: true });
export type InsertEvalRun = z.infer<typeof insertEvalRunSchema>;
export type EvalRun = typeof evalRuns.$inferSelect;

export const evalCaseResults = pgTable("eval_case_results", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  runId: varchar("run_id").notNull(),
  caseId: varchar("case_id").notNull(),
  passed: boolean("passed").notNull().default(false),
  actualOutput: jsonb("actual_output"),
  scorerOutputs: jsonb("scorer_outputs"),
  failingStep: text("failing_step"),
  failingReason: text("failing_reason"),
  latencyMs: integer("latency_ms").default(0),
  costUsd: real("cost_usd").default(0),
  traceId: varchar("trace_id"),
});

export const insertEvalCaseResultSchema = createInsertSchema(evalCaseResults).omit({ id: true });
export type InsertEvalCaseResult = z.infer<typeof insertEvalCaseResultSchema>;
export type EvalCaseResult = typeof evalCaseResults.$inferSelect;

export const improvementRecommendations = pgTable("improvement_recommendations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id").notNull(),
  source: text("source").notNull().default("eval"),
  sourceId: varchar("source_id"),
  type: text("type").notNull().default("config_change"),
  title: text("title").notNull(),
  description: text("description"),
  severity: text("severity").notNull().default("medium"),
  status: text("status").notNull().default("pending"),
  suggestedChanges: jsonb("suggested_changes"),
  impact: text("impact"),
  appliedAt: timestamp("applied_at"),
  dismissedAt: timestamp("dismissed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertImprovementRecommendationSchema = createInsertSchema(improvementRecommendations).omit({ id: true, createdAt: true });
export type InsertImprovementRecommendation = z.infer<typeof insertImprovementRecommendationSchema>;
export type ImprovementRecommendation = typeof improvementRecommendations.$inferSelect;

export const autonomousActionLogs = pgTable("autonomous_action_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id").notNull(),
  deploymentId: varchar("deployment_id"),
  actionType: text("action_type").notNull(),
  trigger: text("trigger").notNull(),
  description: text("description"),
  status: text("status").notNull().default("completed"),
  details: jsonb("details"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAutonomousActionLogSchema = createInsertSchema(autonomousActionLogs).omit({ id: true, createdAt: true });
export type InsertAutonomousActionLog = z.infer<typeof insertAutonomousActionLogSchema>;
export type AutonomousActionLog = typeof autonomousActionLogs.$inferSelect;

export const improvementCycles = pgTable("improvement_cycles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id").notNull(),
  triggerType: text("trigger_type").notNull().default("drift_detected"),
  detectedIssue: text("detected_issue").notNull(),
  issueCategory: text("issue_category").notNull().default("performance"),
  proposedAction: text("proposed_action").notNull(),
  actionType: text("action_type").notNull().default("prompt_optimization"),
  currentConfig: jsonb("current_config"),
  proposedConfig: jsonb("proposed_config"),
  evaluationResult: jsonb("evaluation_result"),
  blastRadius: jsonb("blast_radius"),
  status: text("status").notNull().default("detected"),
  riskLevel: text("risk_level").notNull().default("low"),
  autoApplied: boolean("auto_applied").default(false),
  expertRequired: boolean("expert_required").default(false),
  approvalId: varchar("approval_id"),
  appliedAt: timestamp("applied_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertImprovementCycleSchema = createInsertSchema(improvementCycles).omit({ id: true, createdAt: true });
export type InsertImprovementCycle = z.infer<typeof insertImprovementCycleSchema>;
export type ImprovementCycle = typeof improvementCycles.$inferSelect;

export * from "./models/chat";
