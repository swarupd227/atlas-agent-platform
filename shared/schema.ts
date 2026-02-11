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
  agentType: text("agent_type").default("single"),
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
  shadowEnabled: boolean("shadow_enabled").default(false),
  canaryConfig: jsonb("canary_config"),
  rollbackConfig: jsonb("rollback_config"),
  autopromoteConfig: jsonb("autopromote_config"),
  incidentId: varchar("incident_id"),
  patchId: varchar("patch_id"),
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
  versionHistory: jsonb("version_history"),
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
  requesterType: text("requester_type").default("system"),
  decidedBy: text("decided_by"),
  description: text("description"),
  evidenceJson: jsonb("evidence_json"),
  constraintsJson: jsonb("constraints_json"),
  followUpTaskId: varchar("follow_up_task_id"),
  dueDate: timestamp("due_date"),
  escalationLevel: integer("escalation_level").default(0),
  agentId: varchar("agent_id"),
  outcomeId: varchar("outcome_id"),
  environment: text("environment"),
  changeType: text("change_type"),
  toolPermissionClass: text("tool_permission_class"),
  recommendedAction: text("recommended_action"),
  diffSummary: text("diff_summary"),
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
  justification: text("justification"),
  compensatingControls: text("compensating_controls"),
  requiresExpertValidation: boolean("requires_expert_validation").default(false),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPolicyExceptionSchema = createInsertSchema(policyExceptions).omit({ id: true, createdAt: true });
export type InsertPolicyException = z.infer<typeof insertPolicyExceptionSchema>;
export type PolicyException = typeof policyExceptions.$inferSelect;

export const policyTestCases = pgTable("policy_test_cases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  policyId: varchar("policy_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  inputScenario: jsonb("input_scenario").notNull(),
  expectedOutcome: text("expected_outcome").notNull().default("pass"),
  status: text("status").notNull().default("untested"),
  lastRunAt: timestamp("last_run_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPolicyTestCaseSchema = createInsertSchema(policyTestCases).omit({ id: true, createdAt: true, lastRunAt: true });
export type InsertPolicyTestCase = z.infer<typeof insertPolicyTestCaseSchema>;
export type PolicyTestCase = typeof policyTestCases.$inferSelect;

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
  billableUnits: integer("billable_units").default(0),
  excludedUnits: integer("excluded_units").default(0),
  unitPrice: real("unit_price").default(0),
  amount: real("amount").default(0),
  status: text("status").notNull().default("pending"),
  stripeInvoiceId: text("stripe_invoice_id"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true, createdAt: true });
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoices.$inferSelect;

export const outcomeEvents = pgTable("outcome_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  outcomeId: varchar("outcome_id").notNull(),
  agentId: varchar("agent_id"),
  invoiceId: varchar("invoice_id"),
  traceId: varchar("trace_id"),
  type: text("type").notNull(),
  billable: boolean("billable").default(true),
  excludeReason: text("exclude_reason"),
  unitCount: integer("unit_count").default(1),
  unitValue: real("unit_value"),
  signedHash: text("signed_hash"),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertOutcomeEventSchema = createInsertSchema(outcomeEvents).omit({ id: true, createdAt: true });
export type InsertOutcomeEvent = z.infer<typeof insertOutcomeEventSchema>;
export type OutcomeEvent = typeof outcomeEvents.$inferSelect;

export const billingDisputes = pgTable("billing_disputes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: varchar("invoice_id").notNull(),
  outcomeEventId: varchar("outcome_event_id"),
  outcomeId: varchar("outcome_id"),
  reason: text("reason").notNull(),
  category: text("category").notNull().default("quality"),
  amount: real("amount").default(0),
  status: text("status").notNull().default("open"),
  resolution: text("resolution"),
  resolvedAt: timestamp("resolved_at"),
  submittedBy: text("submitted_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertBillingDisputeSchema = createInsertSchema(billingDisputes).omit({ id: true, createdAt: true });
export type InsertBillingDispute = z.infer<typeof insertBillingDisputeSchema>;
export type BillingDispute = typeof billingDisputes.$inferSelect;

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

export const patches = pgTable("patches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id").notNull(),
  incidentId: varchar("incident_id"),
  changeType: text("change_type").notNull().default("prompt_tweak"),
  title: text("title").notNull(),
  description: text("description"),
  diff: jsonb("diff"),
  evidenceBundle: jsonb("evidence_bundle"),
  evalBundle: jsonb("eval_bundle"),
  rolloutPlan: jsonb("rollout_plan"),
  expectedKpiImpact: text("expected_kpi_impact"),
  expectedCostImpact: text("expected_cost_impact"),
  riskLevel: text("risk_level").notNull().default("low"),
  requiredApprovals: integer("required_approvals").default(0),
  status: text("status").notNull().default("proposed"),
  sandboxId: varchar("sandbox_id"),
  simulationResult: jsonb("simulation_result"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPatchSchema = createInsertSchema(patches).omit({ id: true, createdAt: true });
export type InsertPatch = z.infer<typeof insertPatchSchema>;
export type Patch = typeof patches.$inferSelect;

export const experiments = pgTable("experiments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id").notNull(),
  patchId: varchar("patch_id"),
  name: text("name").notNull(),
  description: text("description"),
  trafficPercent: integer("traffic_percent").notNull().default(10),
  successMetric: text("success_metric").notNull().default("success_rate"),
  evalGate: text("eval_gate"),
  guardrails: jsonb("guardrails"),
  status: text("status").notNull().default("draft"),
  results: jsonb("results"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertExperimentSchema = createInsertSchema(experiments).omit({ id: true, createdAt: true });
export type InsertExperiment = z.infer<typeof insertExperimentSchema>;
export type Experiment = typeof experiments.$inferSelect;

export const blueprints = pgTable("blueprints", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  agentId: varchar("agent_id"),
  status: text("status").notNull().default("draft"),
  blueprintJson: jsonb("blueprint_json"),
  validationResults: jsonb("validation_results"),
  version: integer("version").notNull().default(0),
  versionHistory: jsonb("version_history"),
  signedBy: text("signed_by"),
  signedAt: timestamp("signed_at"),
  lastEvalAt: timestamp("last_eval_at"),
  lastDeployAt: timestamp("last_deploy_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertBlueprintSchema = createInsertSchema(blueprints).omit({ id: true, createdAt: true });
export type InsertBlueprint = z.infer<typeof insertBlueprintSchema>;
export type Blueprint = typeof blueprints.$inferSelect;

export const toolConnectors = pgTable("tool_connectors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull(),
  icon: text("icon"),
  permissions: text("permissions").array().notNull(),
  requiredSecrets: text("required_secrets").array().notNull(),
  configuredSecrets: jsonb("configured_secrets"),
  status: text("status").notNull().default("disconnected"),
  rateLimitRequests: integer("rate_limit_requests"),
  rateLimitWindow: text("rate_limit_window"),
  retryPolicy: jsonb("retry_policy"),
  dataClassificationTags: text("data_classification_tags").array(),
  uptimePercent: real("uptime_percent"),
  errorRate: real("error_rate"),
  latencyP50: integer("latency_p50"),
  latencyP95: integer("latency_p95"),
  latencyP99: integer("latency_p99"),
  recentSchemaChanges: jsonb("recent_schema_changes"),
  lastTestedAt: timestamp("last_tested_at"),
  lastTestResult: text("last_test_result"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertToolConnectorSchema = createInsertSchema(toolConnectors).omit({ id: true, createdAt: true, lastTestedAt: true, lastTestResult: true });
export type InsertToolConnector = z.infer<typeof insertToolConnectorSchema>;
export type ToolConnector = typeof toolConnectors.$inferSelect;

export const loggingIntegrations = pgTable("logging_integrations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  provider: text("provider").notNull(),
  endpointUrl: text("endpoint_url"),
  eventTypes: text("event_types").array().notNull(),
  status: text("status").notNull().default("active"),
  lastDeliveryAt: timestamp("last_delivery_at"),
  lastDeliveryStatus: text("last_delivery_status"),
  deliveredCount: integer("delivered_count").default(0),
  failedCount: integer("failed_count").default(0),
  configJson: jsonb("config_json"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertLoggingIntegrationSchema = createInsertSchema(loggingIntegrations).omit({ id: true, createdAt: true, lastDeliveryAt: true, lastDeliveryStatus: true, deliveredCount: true, failedCount: true });
export type InsertLoggingIntegration = z.infer<typeof insertLoggingIntegrationSchema>;
export type LoggingIntegration = typeof loggingIntegrations.$inferSelect;

export const orgSettings = pgTable("org_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  defaultPolicies: text("default_policies").array(),
  defaultRedactionProfile: text("default_redaction_profile").default("pii"),
  approvalSlaTimers: jsonb("approval_sla_timers"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertOrgSettingsSchema = createInsertSchema(orgSettings).omit({ id: true, updatedAt: true });
export type InsertOrgSettings = z.infer<typeof insertOrgSettingsSchema>;
export type OrgSettings = typeof orgSettings.$inferSelect;

export const adminUsers = pgTable("admin_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull().default("ai_engineer"),
  status: text("status").notNull().default("active"),
  lastLoginAt: timestamp("last_login_at"),
  invitedAt: timestamp("invited_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAdminUserSchema = createInsertSchema(adminUsers).omit({ id: true, createdAt: true, lastLoginAt: true, invitedAt: true });
export type InsertAdminUser = z.infer<typeof insertAdminUserSchema>;
export type AdminUser = typeof adminUsers.$inferSelect;

export const environmentConfigs = pgTable("environment_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  displayName: text("display_name").notNull(),
  deploymentFreeze: boolean("deployment_freeze").default(false),
  autoPromoteRules: jsonb("auto_promote_rules"),
  requiredApprovals: integer("required_approvals").default(1),
  maxCanaryPercent: integer("max_canary_percent").default(25),
  description: text("description"),
  status: text("status").notNull().default("active"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertEnvironmentConfigSchema = createInsertSchema(environmentConfigs).omit({ id: true, updatedAt: true });
export type InsertEnvironmentConfig = z.infer<typeof insertEnvironmentConfigSchema>;
export type EnvironmentConfig = typeof environmentConfigs.$inferSelect;

export const secretRotationPolicies = pgTable("secret_rotation_policies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  secretName: text("secret_name").notNull(),
  rotationIntervalDays: integer("rotation_interval_days").notNull().default(90),
  autoRotate: boolean("auto_rotate").default(false),
  lastRotatedAt: timestamp("last_rotated_at"),
  nextRotationAt: timestamp("next_rotation_at"),
  notificationChannels: text("notification_channels").array(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSecretRotationPolicySchema = createInsertSchema(secretRotationPolicies).omit({ id: true, createdAt: true, lastRotatedAt: true, nextRotationAt: true });
export type InsertSecretRotationPolicy = z.infer<typeof insertSecretRotationPolicySchema>;
export type SecretRotationPolicy = typeof secretRotationPolicies.$inferSelect;

export const adminWebhooks = pgTable("admin_webhooks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  url: text("url").notNull(),
  subscribedEvents: text("subscribed_events").array().notNull(),
  status: text("status").notNull().default("active"),
  secret: text("secret"),
  deliveredCount: integer("delivered_count").default(0),
  failedCount: integer("failed_count").default(0),
  lastDeliveryAt: timestamp("last_delivery_at"),
  lastDeliveryStatus: text("last_delivery_status"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAdminWebhookSchema = createInsertSchema(adminWebhooks).omit({ id: true, createdAt: true, lastDeliveryAt: true, lastDeliveryStatus: true, deliveredCount: true, failedCount: true });
export type InsertAdminWebhook = z.infer<typeof insertAdminWebhookSchema>;
export type AdminWebhook = typeof adminWebhooks.$inferSelect;

export const jobs = pgTable("jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull(),
  status: text("status").notNull().default("queued"),
  agentId: varchar("agent_id"),
  payload: jsonb("payload"),
  result: jsonb("result"),
  progress: integer("progress").default(0),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
});

export const insertJobSchema = createInsertSchema(jobs).omit({ id: true, createdAt: true, startedAt: true, completedAt: true });
export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobs.$inferSelect;

export const runSteps = pgTable("run_steps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  runId: varchar("run_id").notNull(),
  stepIndex: integer("step_index").notNull().default(0),
  type: text("type").notNull(),
  status: text("status").notNull().default("pending"),
  input: jsonb("input"),
  output: jsonb("output"),
  toolName: text("tool_name"),
  policyResult: jsonb("policy_result"),
  durationMs: integer("duration_ms").default(0),
  tokenUsage: jsonb("token_usage"),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertRunStepSchema = createInsertSchema(runSteps).omit({ id: true, createdAt: true });
export type InsertRunStep = z.infer<typeof insertRunStepSchema>;
export type RunStep = typeof runSteps.$inferSelect;

export const incidents = pgTable("incidents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id").notNull(),
  agentName: text("agent_name"),
  severity: text("severity").notNull().default("medium"),
  status: text("status").notNull().default("open"),
  sourceMetric: text("source_metric"),
  sourceDetails: jsonb("source_details"),
  evidenceWindow: jsonb("evidence_window"),
  patchId: varchar("patch_id"),
  deploymentId: varchar("deployment_id"),
  remediationRecord: jsonb("remediation_record"),
  resolvedAt: timestamp("resolved_at"),
  closedAt: timestamp("closed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertIncidentSchema = createInsertSchema(incidents).omit({ id: true, createdAt: true });
export type InsertIncident = z.infer<typeof insertIncidentSchema>;
export type Incident = typeof incidents.$inferSelect;

export const mcpServers = pgTable("mcp_servers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  transportType: text("transport_type").notNull().default("streamable-http"),
  url: text("url"),
  command: text("command"),
  args: text("args").array().default(sql`'{}'::text[]`),
  expectedProtocolVersion: text("expected_protocol_version").default("2025-03-26"),
  negotiatedProtocolVersion: text("negotiated_protocol_version"),
  status: text("status").notNull().default("registered"),
  riskTier: text("risk_tier").notNull().default("MEDIUM"),
  allowlisted: boolean("allowlisted").default(false),
  capabilities: jsonb("capabilities"),
  serverInfo: jsonb("server_info"),
  healthStatus: text("health_status").default("unknown"),
  lastHealthCheck: timestamp("last_health_check"),
  addedBy: text("added_by"),
  approvedBy: text("approved_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertMcpServerSchema = createInsertSchema(mcpServers).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMcpServer = z.infer<typeof insertMcpServerSchema>;
export type McpServer = typeof mcpServers.$inferSelect;

export const mcpServerTools = pgTable("mcp_server_tools", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serverId: varchar("server_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  inputSchema: jsonb("input_schema"),
  outputSchema: jsonb("output_schema"),
  annotations: jsonb("annotations"),
  fingerprintHash: varchar("fingerprint_hash", { length: 64 }),
  riskClassification: varchar("risk_classification", { length: 20 }).default("low"),
  owner: varchar("owner", { length: 255 }),
  enabled: boolean("enabled").default(false),
  usageCount: integer("usage_count").default(0),
  lastUsedAt: timestamp("last_used_at"),
  lastDriftAt: timestamp("last_drift_at"),
  driftStatus: varchar("drift_status", { length: 20 }).default("stable"),
  syncedAt: timestamp("synced_at").defaultNow(),
});

export const insertMcpServerToolSchema = createInsertSchema(mcpServerTools).omit({ id: true, syncedAt: true, fingerprintHash: true, usageCount: true, lastUsedAt: true, lastDriftAt: true, driftStatus: true });
export type InsertMcpServerTool = z.infer<typeof insertMcpServerToolSchema>;
export type McpServerTool = typeof mcpServerTools.$inferSelect;

export const mcpServerResources = pgTable("mcp_server_resources", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serverId: varchar("server_id").notNull(),
  uri: text("uri").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  mimeType: text("mime_type"),
  annotations: jsonb("annotations"),
  size: integer("size"),
  sensitivityLevel: varchar("sensitivity_level", { length: 20 }).default("public"),
  approvalStatus: varchar("approval_status", { length: 20 }).default("auto_approved"),
  approvedBy: varchar("approved_by", { length: 255 }),
  approvedAt: timestamp("approved_at"),
  freshnessStatus: varchar("freshness_status", { length: 20 }).default("fresh"),
  lastCheckedAt: timestamp("last_checked_at"),
  subscribed: boolean("subscribed").default(false),
  contentType: varchar("content_type", { length: 20 }).default("text"),
  owner: varchar("owner", { length: 255 }),
  syncedAt: timestamp("synced_at").defaultNow(),
});

export const insertMcpServerResourceSchema = createInsertSchema(mcpServerResources).omit({ id: true, syncedAt: true, approvedBy: true, approvedAt: true, lastCheckedAt: true });
export type InsertMcpServerResource = z.infer<typeof insertMcpServerResourceSchema>;
export type McpServerResource = typeof mcpServerResources.$inferSelect;

export const mcpServerPrompts = pgTable("mcp_server_prompts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serverId: varchar("server_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  arguments: jsonb("arguments"),
  messages: jsonb("messages"),
  publishedStatus: varchar("published_status", { length: 20 }).default("draft"),
  publishedBy: varchar("published_by", { length: 255 }),
  approvalStatus: varchar("approval_status", { length: 20 }).default("not_required"),
  approvedBy: varchar("approved_by", { length: 255 }),
  approvedAt: timestamp("approved_at"),
  embeddedResourceRefs: jsonb("embedded_resource_refs"),
  owner: varchar("owner", { length: 255 }),
  syncedAt: timestamp("synced_at").defaultNow(),
});

export const insertMcpServerPromptSchema = createInsertSchema(mcpServerPrompts).omit({ id: true, syncedAt: true, approvedBy: true, approvedAt: true });
export type InsertMcpServerPrompt = z.infer<typeof insertMcpServerPromptSchema>;
export type McpServerPrompt = typeof mcpServerPrompts.$inferSelect;

export const mcpServerAuth = pgTable("mcp_server_auth", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serverId: varchar("server_id").notNull(),
  authType: text("auth_type").notNull().default("none"),
  config: jsonb("config"),
  lastRotated: timestamp("last_rotated"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMcpServerAuthSchema = createInsertSchema(mcpServerAuth).omit({ id: true, createdAt: true });
export type InsertMcpServerAuth = z.infer<typeof insertMcpServerAuthSchema>;
export type McpServerAuth = typeof mcpServerAuth.$inferSelect;

export const remoteAgents = pgTable("remote_agents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id"),
  agentCardUrl: text("agent_card_url"),
  agentCardData: jsonb("agent_card_data"),
  trustTier: text("trust_tier").default("basic"),
  connectivityStatus: text("connectivity_status").default("unknown"),
  allowedSkills: text("allowed_skills").array().default(sql`'{}'::text[]`),
  securityRequirements: jsonb("security_requirements"),
  defaultInputModes: text("default_input_modes").array().default(sql`'{}'::text[]`),
  defaultOutputModes: text("default_output_modes").array().default(sql`'{}'::text[]`),
  providerInfo: jsonb("provider_info"),
  lastHealthCheckAt: timestamp("last_health_check_at"),
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertRemoteAgentSchema = createInsertSchema(remoteAgents).omit({ id: true, createdAt: true });
export type InsertRemoteAgent = z.infer<typeof insertRemoteAgentSchema>;
export type RemoteAgent = typeof remoteAgents.$inferSelect;

export const agentTeams = pgTable("agent_teams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamAgentId: varchar("team_agent_id").notNull(),
  memberAgentId: varchar("member_agent_id").notNull(),
  role: text("role").default("member"),
  addedAt: timestamp("added_at").defaultNow(),
});

export const insertAgentTeamSchema = createInsertSchema(agentTeams).omit({ id: true, addedAt: true });
export type InsertAgentTeam = z.infer<typeof insertAgentTeamSchema>;
export type AgentTeam = typeof agentTeams.$inferSelect;

export const mcpElicitations = pgTable("mcp_elicitations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  mode: text("mode").notNull().default("form"),
  serverId: varchar("server_id"),
  serverName: text("server_name"),
  toolName: text("tool_name"),
  proposedArgs: jsonb("proposed_args"),
  riskFlags: text("risk_flags").array(),
  gateType: text("gate_type").notNull().default("tool_approval"),
  status: text("status").notNull().default("pending"),
  urlTarget: text("url_target"),
  formSchema: jsonb("form_schema"),
  responseData: jsonb("response_data"),
  linkedApprovalId: varchar("linked_approval_id"),
  reason: text("reason"),
  requestedBy: text("requested_by"),
  decidedBy: text("decided_by"),
  decidedAt: timestamp("decided_at"),
  agentId: varchar("agent_id"),
  runTraceId: varchar("run_trace_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMcpElicitationSchema = createInsertSchema(mcpElicitations).omit({ id: true, createdAt: true });
export type InsertMcpElicitation = z.infer<typeof insertMcpElicitationSchema>;
export type McpElicitation = typeof mcpElicitations.$inferSelect;

export const teamBlueprintNodes = pgTable("team_blueprint_nodes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  blueprintId: varchar("blueprint_id").notNull(),
  nodeType: text("node_type").notNull(),
  label: text("label").notNull(),
  positionX: integer("position_x").default(0),
  positionY: integer("position_y").default(0),
  refAgentId: varchar("ref_agent_id"),
  refRemoteAgentId: varchar("ref_remote_agent_id"),
  refToolIds: text("ref_tool_ids").array().default(sql`'{}'::text[]`),
  refPolicyId: varchar("ref_policy_id"),
  gateType: text("gate_type"),
  config: jsonb("config"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTeamBlueprintNodeSchema = createInsertSchema(teamBlueprintNodes).omit({ id: true, createdAt: true });
export type InsertTeamBlueprintNode = z.infer<typeof insertTeamBlueprintNodeSchema>;
export type TeamBlueprintNode = typeof teamBlueprintNodes.$inferSelect;

export const teamBlueprintEdges = pgTable("team_blueprint_edges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  blueprintId: varchar("blueprint_id").notNull(),
  sourceNodeId: varchar("source_node_id").notNull(),
  targetNodeId: varchar("target_node_id").notNull(),
  label: text("label"),
  contentPartTypes: text("content_part_types").array().default(sql`'{}'::text[]`),
  allowedMetadata: jsonb("allowed_metadata"),
  slaTimeoutMs: integer("sla_timeout_ms"),
  failureMode: text("failure_mode").default("escalate"),
  retryPolicy: jsonb("retry_policy"),
  condition: text("condition"),
  config: jsonb("config"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTeamBlueprintEdgeSchema = createInsertSchema(teamBlueprintEdges).omit({ id: true, createdAt: true });
export type InsertTeamBlueprintEdge = z.infer<typeof insertTeamBlueprintEdgeSchema>;
export type TeamBlueprintEdge = typeof teamBlueprintEdges.$inferSelect;

export * from "./models/chat";
