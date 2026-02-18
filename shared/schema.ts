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
  ontologyTags: jsonb("ontology_tags"),
  systemPrompt: text("system_prompt"),
  department: text("department"),
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
  industry: text("industry"),
  pipelineStages: jsonb("pipeline_stages"),
  industryRollbackTriggers: jsonb("industry_rollback_triggers"),
  evidencePackage: jsonb("evidence_package"),
  pipelineComplete: boolean("pipeline_complete").default(false),
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
  industry: text("industry"),
  goldenDatasetId: varchar("golden_dataset_id"),
  ontologyTags: jsonb("ontology_tags").default(sql`'[]'::jsonb`),
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
  ontologyRefs: jsonb("ontology_refs").default(sql`'[]'::jsonb`),
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
  complianceFrameworks: jsonb("compliance_frameworks"),
  retentionPolicy: jsonb("retention_policy"),
  correlationId: varchar("correlation_id"),
  traceId: varchar("trace_id"),
  industryId: text("industry_id"),
  ontologyTags: jsonb("ontology_tags"),
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
  complianceCertifications: text("compliance_certifications").array().default(sql`'{}'::text[]`),
  deploymentCount: integer("deployment_count").default(0),
  avgKpiDelivery: integer("avg_kpi_delivery").default(0),
  estimatedTimeToProd: text("estimated_time_to_prod").default("2-4 weeks"),
  costProfile: jsonb("cost_profile"),
  preloadedSkills: jsonb("preloaded_skills").default(sql`'[]'::jsonb`),
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
  origin: text("origin").default("custom"),
  regulationRef: text("regulation_ref"),
  industryCategory: text("industry_category"),
  severity: text("severity"),
  locked: boolean("locked").default(false),
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
  ontologyTags: jsonb("ontology_tags").default(sql`'[]'::jsonb`),
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
  invocationType: text("invocation_type").default("mcp_tool"),
  remoteAgentId: varchar("remote_agent_id"),
  a2aTaskId: varchar("a2a_task_id"),
  a2aInterruptionState: text("a2a_interruption_state"),
  a2aInterruptionContext: jsonb("a2a_interruption_context"),
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

export const traceSpans = pgTable("trace_spans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  runId: varchar("run_id").notNull(),
  parentSpanId: varchar("parent_span_id"),
  spanName: text("span_name").notNull(),
  spanKind: text("span_kind").notNull().default("internal"),
  invocationType: text("invocation_type").default("mcp_tool"),
  mcpMethod: text("mcp_method"),
  mcpServerId: varchar("mcp_server_id"),
  mcpServerName: text("mcp_server_name"),
  mcpToolName: text("mcp_tool_name"),
  mcpResourceUri: text("mcp_resource_uri"),
  a2aRemoteAgentId: varchar("a2a_remote_agent_id"),
  a2aRemoteAgentName: text("a2a_remote_agent_name"),
  a2aTaskState: text("a2a_task_state"),
  a2aSkillName: text("a2a_skill_name"),
  a2aMessageRole: text("a2a_message_role"),
  a2aMessageId: varchar("a2a_message_id"),
  a2aArtifactId: varchar("a2a_artifact_id"),
  linkedTraceId: varchar("linked_trace_id"),
  linkedSpanId: varchar("linked_span_id"),
  messagingSemconv: jsonb("messaging_semconv"),
  status: text("status").notNull().default("ok"),
  statusMessage: text("status_message"),
  durationMs: integer("duration_ms").default(0),
  attributes: jsonb("attributes"),
  events: jsonb("events"),
  startedAt: timestamp("started_at").defaultNow(),
  endedAt: timestamp("ended_at"),
});

export const insertTraceSpanSchema = createInsertSchema(traceSpans).omit({ id: true, startedAt: true });
export type InsertTraceSpan = z.infer<typeof insertTraceSpanSchema>;
export type TraceSpan = typeof traceSpans.$inferSelect;

export const mcpTranscripts = pgTable("mcp_transcripts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  runId: varchar("run_id").notNull(),
  spanId: varchar("span_id"),
  sequenceNum: integer("sequence_num").notNull().default(0),
  direction: text("direction").notNull().default("request"),
  mcpMethod: text("mcp_method").notNull(),
  mcpServerId: varchar("mcp_server_id"),
  mcpServerName: text("mcp_server_name"),
  jsonrpcId: text("jsonrpc_id"),
  params: jsonb("params"),
  result: jsonb("result"),
  error: jsonb("error"),
  durationMs: integer("duration_ms"),
  sessionId: text("session_id"),
  protocolVersion: text("protocol_version"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMcpTranscriptSchema = createInsertSchema(mcpTranscripts).omit({ id: true, createdAt: true });
export type InsertMcpTranscript = z.infer<typeof insertMcpTranscriptSchema>;
export type McpTranscript = typeof mcpTranscripts.$inferSelect;

export const registrySources = pgTable("registry_sources", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  apiUrl: text("api_url").notNull(),
  apiType: text("api_type").notNull().default("openapi"),
  authType: text("auth_type").default("none"),
  authConfig: jsonb("auth_config"),
  syncIntervalMinutes: integer("sync_interval_minutes").default(60),
  lastSyncAt: timestamp("last_sync_at"),
  lastSyncStatus: text("last_sync_status").default("never"),
  serverCount: integer("server_count").default(0),
  enabled: boolean("enabled").default(true),
  addedBy: text("added_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertRegistrySourceSchema = createInsertSchema(registrySources).omit({ id: true, createdAt: true });
export type InsertRegistrySource = z.infer<typeof insertRegistrySourceSchema>;
export type RegistrySource = typeof registrySources.$inferSelect;

export const marketplaceServers = pgTable("marketplace_servers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  registrySourceId: varchar("registry_source_id").notNull(),
  namespace: text("namespace").notNull(),
  name: text("name").notNull(),
  displayName: text("display_name"),
  description: text("description"),
  version: text("version").default("1.0.0"),
  category: text("category").default("general"),
  publisher: text("publisher"),
  publisherVerified: boolean("publisher_verified").default(false),
  iconUrl: text("icon_url"),
  transportType: text("transport_type").default("streamable-http"),
  url: text("url"),
  capabilities: jsonb("capabilities"),
  toolCount: integer("tool_count").default(0),
  resourceCount: integer("resource_count").default(0),
  promptCount: integer("prompt_count").default(0),
  downloads: integer("downloads").default(0),
  rating: real("rating"),
  tags: text("tags").array().default(sql`'{}'::text[]`),
  serverJson: jsonb("server_json"),
  riskTier: text("risk_tier").default("MEDIUM"),
  installStatus: text("install_status").default("available"),
  installedServerId: varchar("installed_server_id"),
  lastSyncedAt: timestamp("last_synced_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMarketplaceServerSchema = createInsertSchema(marketplaceServers).omit({ id: true, createdAt: true });
export type InsertMarketplaceServer = z.infer<typeof insertMarketplaceServerSchema>;
export type MarketplaceServer = typeof marketplaceServers.$inferSelect;

export const trustedPublishers = pgTable("trusted_publishers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  namespace: text("namespace").notNull(),
  displayName: text("display_name").notNull(),
  description: text("description"),
  trustLevel: text("trust_level").notNull().default("verified"),
  isInternal: boolean("is_internal").default(false),
  autoApprove: boolean("auto_approve").default(false),
  verifiedAt: timestamp("verified_at"),
  verifiedBy: text("verified_by"),
  serverCount: integer("server_count").default(0),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTrustedPublisherSchema = createInsertSchema(trustedPublishers).omit({ id: true, createdAt: true });
export type InsertTrustedPublisher = z.infer<typeof insertTrustedPublisherSchema>;
export type TrustedPublisher = typeof trustedPublishers.$inferSelect;

export const marketplaceInstallRequests = pgTable("marketplace_install_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  marketplaceServerId: varchar("marketplace_server_id").notNull(),
  serverName: text("server_name").notNull(),
  namespace: text("namespace").notNull(),
  publisher: text("publisher"),
  requestedBy: text("requested_by"),
  status: text("status").notNull().default("pending"),
  approvalRequired: boolean("approval_required").default(true),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at"),
  rejectedReason: text("rejected_reason"),
  handshakeStatus: text("handshake_status").default("pending"),
  handshakeResult: jsonb("handshake_result"),
  installedServerId: varchar("installed_server_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMarketplaceInstallRequestSchema = createInsertSchema(marketplaceInstallRequests).omit({ id: true, createdAt: true });
export type InsertMarketplaceInstallRequest = z.infer<typeof insertMarketplaceInstallRequestSchema>;
export type MarketplaceInstallRequest = typeof marketplaceInstallRequests.$inferSelect;

export const platformSettings = pgTable("platform_settings", {
  key: varchar("key").primaryKey(),
  value: text("value").notNull(),
  description: text("description"),
  category: text("category").default("general"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPlatformSettingSchema = createInsertSchema(platformSettings);
export type InsertPlatformSetting = z.infer<typeof insertPlatformSettingSchema>;
export type PlatformSetting = typeof platformSettings.$inferSelect;

export const mcpApps = pgTable("mcp_apps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serverId: varchar("server_id").notNull(),
  toolId: varchar("tool_id"),
  name: text("name").notNull(),
  description: text("description"),
  resourceUri: text("resource_uri").notNull(),
  sandboxPolicy: jsonb("sandbox_policy").default(sql`'{"allowScripts":true,"allowForms":false,"allowPopups":false,"allowModals":false,"csp":"default-src ''self''"}'::jsonb`),
  requiredCapabilities: text("required_capabilities").array().default(sql`'{}'::text[]`),
  grantedCapabilities: text("granted_capabilities").array().default(sql`'{}'::text[]`),
  trustRequired: text("trust_required").notNull().default("trusted"),
  status: text("status").notNull().default("registered"),
  appType: text("app_type").notNull().default("tool_output"),
  version: text("version").default("1.0.0"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertMcpAppSchema = createInsertSchema(mcpApps).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMcpApp = z.infer<typeof insertMcpAppSchema>;
export type McpApp = typeof mcpApps.$inferSelect;

export const mcpAppConsents = pgTable("mcp_app_consents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  appId: varchar("app_id").notNull(),
  userId: varchar("user_id").notNull(),
  consentedCapabilities: text("consented_capabilities").array().default(sql`'{}'::text[]`),
  consentedAt: timestamp("consented_at").defaultNow(),
  revokedAt: timestamp("revoked_at"),
  status: text("status").notNull().default("active"),
});

export const insertMcpAppConsentSchema = createInsertSchema(mcpAppConsents).omit({ id: true, consentedAt: true });
export type InsertMcpAppConsent = z.infer<typeof insertMcpAppConsentSchema>;
export type McpAppConsent = typeof mcpAppConsents.$inferSelect;

export const mcpAppSessions = pgTable("mcp_app_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  appId: varchar("app_id").notNull(),
  userId: varchar("user_id").notNull(),
  contextType: text("context_type").notNull().default("run"),
  contextId: varchar("context_id"),
  bridgeMessages: jsonb("bridge_messages").default(sql`'[]'::jsonb`),
  status: text("status").notNull().default("active"),
  startedAt: timestamp("started_at").defaultNow(),
  endedAt: timestamp("ended_at"),
});

export const insertMcpAppSessionSchema = createInsertSchema(mcpAppSessions).omit({ id: true, startedAt: true });
export type InsertMcpAppSession = z.infer<typeof insertMcpAppSessionSchema>;
export type McpAppSession = typeof mcpAppSessions.$inferSelect;

export const regulations = pgTable("regulations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  fullName: text("full_name").notNull(),
  description: text("description"),
  jurisdiction: text("jurisdiction").notNull(),
  industry: text("industry").notNull(),
  category: text("category").notNull().default("general"),
  effectiveDate: timestamp("effective_date"),
  enforcementStatus: text("enforcement_status").notNull().default("active"),
  modulesAffected: text("modules_affected").array().default(sql`'{}'::text[]`),
  encodedPolicyCount: integer("encoded_policy_count").default(0),
  sourceUrl: text("source_url"),
  version: text("version").default("1.0"),
  aiEnrichment: jsonb("ai_enrichment"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertRegulationSchema = createInsertSchema(regulations).omit({ id: true, createdAt: true });
export type InsertRegulation = z.infer<typeof insertRegulationSchema>;
export type Regulation = typeof regulations.$inferSelect;

export const regulatoryPolicies = pgTable("regulatory_policies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  regulationId: varchar("regulation_id").notNull(),
  articleRef: text("article_ref").notNull(),
  title: text("title").notNull(),
  naturalLanguage: text("natural_language").notNull(),
  policyLanguage: text("policy_language").notNull().default("rego"),
  policyCode: text("policy_code").notNull(),
  enforcementPoint: text("enforcement_point").notNull(),
  violationAction: text("violation_action").notNull().default("warn"),
  evidenceRequired: text("evidence_required").array().default(sql`'{}'::text[]`),
  severity: text("severity").notNull().default("high"),
  enabled: boolean("enabled").default(true),
  lastTestedAt: timestamp("last_tested_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertRegulatoryPolicySchema = createInsertSchema(regulatoryPolicies).omit({ id: true, createdAt: true });
export type InsertRegulatoryPolicy = z.infer<typeof insertRegulatoryPolicySchema>;
export type RegulatoryPolicy = typeof regulatoryPolicies.$inferSelect;

export const complianceControls = pgTable("compliance_controls", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  regulationId: varchar("regulation_id").notNull(),
  requirementRef: text("requirement_ref").notNull(),
  requirementTitle: text("requirement_title").notNull(),
  almpControl: text("almp_control").notNull(),
  controlModule: text("control_module").notNull(),
  evidenceArtifact: text("evidence_artifact").notNull(),
  coverageStatus: text("coverage_status").notNull().default("full"),
  gapDescription: text("gap_description"),
  customerActionRequired: text("customer_action_required"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertComplianceControlSchema = createInsertSchema(complianceControls).omit({ id: true, createdAt: true });
export type InsertComplianceControl = z.infer<typeof insertComplianceControlSchema>;
export type ComplianceControl = typeof complianceControls.$inferSelect;

export const regulatoryChanges = pgTable("regulatory_changes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  regulationId: varchar("regulation_id").notNull(),
  changeTitle: text("change_title").notNull(),
  changeDescription: text("change_description").notNull(),
  changeType: text("change_type").notNull().default("amendment"),
  impactLevel: text("impact_level").notNull().default("medium"),
  affectedAgentCount: integer("affected_agent_count").default(0),
  affectedOutcomeCount: integer("affected_outcome_count").default(0),
  recommendedUpdates: jsonb("recommended_updates"),
  status: text("status").notNull().default("pending_review"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  effectiveDate: timestamp("effective_date"),
  detectedAt: timestamp("detected_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertRegulatoryChangeSchema = createInsertSchema(regulatoryChanges).omit({ id: true, createdAt: true });
export type InsertRegulatoryChange = z.infer<typeof insertRegulatoryChangeSchema>;
export type RegulatoryChange = typeof regulatoryChanges.$inferSelect;

export const ontologyConcepts = pgTable("ontology_concepts", {
  id: varchar("id").primaryKey(),
  industryId: text("industry_id").notNull(),
  ontologyName: text("ontology_name").notNull(),
  label: text("label").notNull(),
  category: text("category").notNull(),
  description: text("description").notNull(),
  properties: jsonb("properties").notNull().default(sql`'[]'::jsonb`),
  relationships: jsonb("relationships").notNull().default(sql`'[]'::jsonb`),
  tags: text("tags").array().default(sql`'{}'::text[]`),
  synonyms: text("synonyms").array().default(sql`'{}'::text[]`),
  industryRelevance: text("industry_relevance"),
  source: text("source").notNull().default("industry-standard"),
  usageCount: integer("usage_count").notNull().default(0),
  linkedRegulations: jsonb("linked_regulations").default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertOntologyConceptSchema = createInsertSchema(ontologyConcepts).omit({ createdAt: true });
export type InsertOntologyConcept = z.infer<typeof insertOntologyConceptSchema>;
export type OntologyConcept = typeof ontologyConcepts.$inferSelect;

export const ontologyEnhancements = pgTable("ontology_enhancements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conceptId: varchar("concept_id").notNull(),
  enrichedDescription: text("enriched_description"),
  agentUseCases: jsonb("agent_use_cases").default(sql`'[]'::jsonb`),
  regulatoryRelevance: text("regulatory_relevance"),
  riskFactors: jsonb("risk_factors").default(sql`'[]'::jsonb`),
  relatedStandards: jsonb("related_standards").default(sql`'[]'::jsonb`),
  dataHandlingConsiderations: text("data_handling_considerations"),
  implementationGuidance: text("implementation_guidance"),
  suggestedProperties: jsonb("suggested_properties").default(sql`'[]'::jsonb`),
  suggestedRelationships: jsonb("suggested_relationships").default(sql`'[]'::jsonb`),
  suggestedTags: jsonb("suggested_tags").default(sql`'[]'::jsonb`),
  agentSkills: jsonb("agent_skills").default(sql`'[]'::jsonb`),
  agentTypes: jsonb("agent_types").default(sql`'[]'::jsonb`),
  applied: boolean("applied").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertOntologyEnhancementSchema = createInsertSchema(ontologyEnhancements).omit({ id: true, createdAt: true });
export type InsertOntologyEnhancement = z.infer<typeof insertOntologyEnhancementSchema>;
export type OntologyEnhancement = typeof ontologyEnhancements.$inferSelect;

export const skills = pgTable("skills", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description").notNull(),
  industry: text("industry").notNull(),
  domain: text("domain").notNull(),
  version: text("version").notNull().default("1.0.0"),
  author: text("author").notNull(),
  trustTier: text("trust_tier").notNull().default("platform-provided"),
  activationCount: integer("activation_count").notNull().default(0),
  performanceScore: real("performance_score").default(0),
  dependencies: jsonb("dependencies").notNull().default(sql`'[]'::jsonb`),
  tags: text("tags").array().default(sql`'{}'::text[]`),
  agentTypeCompatibility: text("agent_type_compatibility").array().default(sql`'{"single","team","remote"}'::text[]`),
  status: text("status").notNull().default("active"),
  complexity: text("complexity").notNull().default("intermediate"),
  aiEnrichment: jsonb("ai_enrichment"),
  yamlFrontmatter: jsonb("yaml_frontmatter"),
  markdownBody: text("markdown_body"),
  allowedTools: text("allowed_tools").array().default(sql`'{}'::text[]`),
  requiredMcpServers: text("required_mcp_servers").array().default(sql`'{}'::text[]`),
  requiredDataClassifications: text("required_data_classifications").array().default(sql`'{}'::text[]`),
  disableModelInvocation: boolean("disable_model_invocation").default(false),
  contextMode: text("context_mode").default("inline"),
  userInvocable: boolean("user_invocable").default(true),
  descriptionQualityScore: real("description_quality_score"),
  industryContextId: text("industry_context_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSkillSchema = createInsertSchema(skills).omit({ id: true, createdAt: true });
export type InsertSkill = z.infer<typeof insertSkillSchema>;
export type Skill = typeof skills.$inferSelect;

export const skillVersions = pgTable("skill_versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  skillId: varchar("skill_id").notNull(),
  version: text("version").notNull(),
  changeLog: text("change_log").notNull().default(""),
  yamlFrontmatter: jsonb("yaml_frontmatter"),
  markdownBody: text("markdown_body"),
  snapshotData: jsonb("snapshot_data"),
  shadowReplayResults: jsonb("shadow_replay_results"),
  promotedToProduction: boolean("promoted_to_production").default(false),
  author: text("author").notNull().default("system"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSkillVersionSchema = createInsertSchema(skillVersions).omit({ id: true, createdAt: true });
export type InsertSkillVersion = z.infer<typeof insertSkillVersionSchema>;
export type SkillVersion = typeof skillVersions.$inferSelect;

export const skillChains = pgTable("skill_chains", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description").default(""),
  nodes: jsonb("nodes").default([]),
  edges: jsonb("edges").default([]),
  conflicts: jsonb("conflicts").default([]),
  contextBudget: jsonb("context_budget"),
  status: text("status").notNull().default("draft"),
  industry: text("industry").default("financial_services"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSkillChainSchema = createInsertSchema(skillChains).omit({ id: true, createdAt: true });
export type InsertSkillChain = z.infer<typeof insertSkillChainSchema>;
export type SkillChain = typeof skillChains.$inferSelect;

// Golden Evaluation Datasets
export const goldenDatasets = pgTable("golden_datasets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description").notNull(),
  industry: text("industry").notNull(),
  useCase: text("use_case").notNull(),
  version: text("version").notNull().default("1.0.0"),
  testCaseCount: integer("test_case_count").notNull().default(0),
  scenarioCategories: jsonb("scenario_categories").notNull().default(sql`'{"happyPath":0,"edgeCases":0,"adversarial":0,"complianceCritical":0}'::jsonb`),
  qualityCoverage: real("quality_coverage").default(0),
  coverageDimensions: jsonb("coverage_dimensions").default(sql`'[]'::jsonb`),
  benchmarkAvg: real("benchmark_avg").default(0),
  benchmarkRange: jsonb("benchmark_range").default(sql`'{"low":0,"high":0}'::jsonb`),
  contributorCount: integer("contributor_count").notNull().default(0),
  contributors: jsonb("contributors").default(sql`'[]'::jsonb`),
  growthHistory: jsonb("growth_history").default(sql`'[]'::jsonb`),
  status: text("status").notNull().default("active"),
  tags: text("tags").array().default(sql`'{}'::text[]`),
  aiGenerated: boolean("ai_generated").default(false),
  lastUpdatedAt: timestamp("last_updated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertGoldenDatasetSchema = createInsertSchema(goldenDatasets).omit({ id: true, createdAt: true, lastUpdatedAt: true });
export type InsertGoldenDataset = z.infer<typeof insertGoldenDatasetSchema>;
export type GoldenDataset = typeof goldenDatasets.$inferSelect;

export const goldenTestCases = pgTable("golden_test_cases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  datasetId: varchar("dataset_id").notNull(),
  name: text("name").notNull(),
  inputScenario: text("input_scenario").notNull(),
  expectedBehavior: text("expected_behavior").notNull(),
  evaluationCriteria: jsonb("evaluation_criteria").notNull().default(sql`'[]'::jsonb`),
  rubricScoring: jsonb("rubric_scoring").default(sql`'{"dimensions":[],"passingScore":0.8}'::jsonb`),
  difficultyTier: text("difficulty_tier").notNull().default("routine"),
  scenarioCategory: text("scenario_category").notNull().default("happy_path"),
  tags: text("tags").array().default(sql`'{}'::text[]`),
  contributorOrg: text("contributor_org"),
  aiGenerated: boolean("ai_generated").default(false),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertGoldenTestCaseSchema = createInsertSchema(goldenTestCases).omit({ id: true, createdAt: true });
export type InsertGoldenTestCase = z.infer<typeof insertGoldenTestCaseSchema>;
export type GoldenTestCase = typeof goldenTestCases.$inferSelect;

export const contextProfiles = pgTable("context_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  industry: text("industry").notNull(),
  agentId: varchar("agent_id"),
  sources: jsonb("sources").notNull().default(sql`'[]'::jsonb`),
  priorityOrder: jsonb("priority_order").notNull().default(sql`'[]'::jsonb`),
  budgetAllocations: jsonb("budget_allocations").notNull().default(sql`'{}'::jsonb`),
  totalCapacity: integer("total_capacity").notNull().default(128000),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertContextProfileSchema = createInsertSchema(contextProfiles).omit({ id: true, createdAt: true });
export type InsertContextProfile = z.infer<typeof insertContextProfileSchema>;
export type ContextProfile = typeof contextProfiles.$inferSelect;

export const memoryProfiles = pgTable("memory_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  industry: text("industry").notNull(),
  agentId: varchar("agent_id"),
  tierConfigs: jsonb("tier_configs").notNull().default(sql`'[]'::jsonb`),
  industryRules: jsonb("industry_rules").notNull().default(sql`'[]'::jsonb`),
  forgettingPolicies: jsonb("forgetting_policies").notNull().default(sql`'[]'::jsonb`),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMemoryProfileSchema = createInsertSchema(memoryProfiles).omit({ id: true, createdAt: true });
export type InsertMemoryProfile = z.infer<typeof insertMemoryProfileSchema>;
export type MemoryProfile = typeof memoryProfiles.$inferSelect;

export const ragPipelines = pgTable("rag_pipelines", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  industry: text("industry").notNull(),
  agentId: varchar("agent_id"),
  knowledgeSources: jsonb("knowledge_sources").notNull().default(sql`'[]'::jsonb`),
  retrievalStrategies: jsonb("retrieval_strategies").notNull().default(sql`'[]'::jsonb`),
  chunkStrategies: jsonb("chunk_strategies").notNull().default(sql`'[]'::jsonb`),
  qualityMetrics: jsonb("quality_metrics").notNull().default(sql`'{}'::jsonb`),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertRagPipelineSchema = createInsertSchema(ragPipelines).omit({ id: true, createdAt: true });
export type InsertRagPipeline = z.infer<typeof insertRagPipelineSchema>;
export type RagPipeline = typeof ragPipelines.$inferSelect;

export const knowledgeConnectors = pgTable("knowledge_connectors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  sourceType: text("source_type").notNull(),
  description: text("description"),
  industry: text("industry").notNull(),
  connectionConfig: jsonb("connection_config").notNull().default(sql`'{}'::jsonb`),
  entitiesIngested: integer("entities_ingested").notNull().default(0),
  relationshipsMapped: integer("relationships_mapped").notNull().default(0),
  lastSyncAt: timestamp("last_sync_at"),
  syncStatus: text("sync_status").notNull().default("idle"),
  qualityMetrics: jsonb("quality_metrics").notNull().default(sql`'{}'::jsonb`),
  errorMessage: text("error_message"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertKnowledgeConnectorSchema = createInsertSchema(knowledgeConnectors).omit({ id: true, createdAt: true });
export type InsertKnowledgeConnector = z.infer<typeof insertKnowledgeConnectorSchema>;
export type KnowledgeConnector = typeof knowledgeConnectors.$inferSelect;

export const entityResolutions = pgTable("entity_resolutions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entityA: text("entity_a").notNull(),
  sourceA: text("source_a").notNull(),
  entityB: text("entity_b").notNull(),
  sourceB: text("source_b").notNull(),
  entityType: text("entity_type").notNull(),
  confidenceScore: real("confidence_score").notNull().default(0),
  resolutionStatus: text("resolution_status").notNull().default("pending"),
  resolvedBy: text("resolved_by"),
  industry: text("industry").notNull(),
  metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEntityResolutionSchema = createInsertSchema(entityResolutions).omit({ id: true, createdAt: true });
export type InsertEntityResolution = z.infer<typeof insertEntityResolutionSchema>;
export type EntityResolution = typeof entityResolutions.$inferSelect;

export const relationshipExtractions = pgTable("relationship_extractions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceDocument: text("source_document").notNull(),
  sourceEntity: text("source_entity").notNull(),
  targetEntity: text("target_entity").notNull(),
  relationshipType: text("relationship_type").notNull(),
  confidence: real("confidence").notNull().default(0),
  extractedText: text("extracted_text"),
  validFrom: timestamp("valid_from"),
  validTo: timestamp("valid_to"),
  status: text("status").notNull().default("extracted"),
  industry: text("industry").notNull(),
  metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertRelationshipExtractionSchema = createInsertSchema(relationshipExtractions).omit({ id: true, createdAt: true });
export type InsertRelationshipExtraction = z.infer<typeof insertRelationshipExtractionSchema>;
export type RelationshipExtraction = typeof relationshipExtractions.$inferSelect;

export const temporalGraphEntries = pgTable("temporal_graph_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entityName: text("entity_name").notNull(),
  entityType: text("entity_type").notNull(),
  relatedEntity: text("related_entity"),
  relationshipType: text("relationship_type"),
  validFrom: timestamp("valid_from").notNull(),
  validTo: timestamp("valid_to"),
  properties: jsonb("properties").notNull().default(sql`'{}'::jsonb`),
  source: text("source"),
  industry: text("industry").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTemporalGraphEntrySchema = createInsertSchema(temporalGraphEntries).omit({ id: true, createdAt: true });
export type InsertTemporalGraphEntry = z.infer<typeof insertTemporalGraphEntrySchema>;
export type TemporalGraphEntry = typeof temporalGraphEntries.$inferSelect;

export const autonomyProfiles = pgTable("autonomy_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  industry: text("industry").notNull(),
  description: text("description"),
  riskDimensions: jsonb("risk_dimensions").notNull().default(sql`'[]'::jsonb`),
  autonomyLevels: jsonb("autonomy_levels").notNull().default(sql`'[]'::jsonb`),
  overrideRules: jsonb("override_rules").notNull().default(sql`'[]'::jsonb`),
  learningData: jsonb("learning_data").notNull().default(sql`'{}'::jsonb`),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAutonomyProfileSchema = createInsertSchema(autonomyProfiles).omit({ id: true, createdAt: true });
export type InsertAutonomyProfile = z.infer<typeof insertAutonomyProfileSchema>;
export type AutonomyProfile = typeof autonomyProfiles.$inferSelect;

export const oversightDecisions = pgTable("oversight_decisions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id"),
  agentName: text("agent_name").notNull(),
  actionType: text("action_type").notNull(),
  actionDescription: text("action_description").notNull(),
  industry: text("industry").notNull(),
  status: text("status").notNull().default("pending"),
  priority: text("priority").notNull().default("medium"),
  compositeRiskScore: real("composite_risk_score").notNull().default(50),
  confidence: real("confidence").notNull().default(0.5),
  reasoningChain: jsonb("reasoning_chain").notNull().default(sql`'[]'::jsonb`),
  industryContext: jsonb("industry_context").notNull().default(sql`'{}'::jsonb`),
  regulatoryPolicies: jsonb("regulatory_policies").notNull().default(sql`'[]'::jsonb`),
  ontologyRefs: jsonb("ontology_refs").notNull().default(sql`'[]'::jsonb`),
  similarDecisions: jsonb("similar_decisions").notNull().default(sql`'[]'::jsonb`),
  riskDimensions: jsonb("risk_dimensions").notNull().default(sql`'{}'::jsonb`),
  requestedAction: jsonb("requested_action").notNull().default(sql`'{}'::jsonb`),
  resolution: text("resolution"),
  resolutionNote: text("resolution_note"),
  resolvedBy: text("resolved_by"),
  resolvedAt: timestamp("resolved_at"),
  precedentRule: jsonb("precedent_rule"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertOversightDecisionSchema = createInsertSchema(oversightDecisions).omit({ id: true, createdAt: true });
export type InsertOversightDecision = z.infer<typeof insertOversightDecisionSchema>;
export type OversightDecision = typeof oversightDecisions.$inferSelect;

export const shadowTraces = pgTable("shadow_traces", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  industry: text("industry").notNull(),
  agentId: varchar("agent_id"),
  agentName: text("agent_name").notNull(),
  agentVersion: text("agent_version").notNull(),
  scenarioCategory: text("scenario_category").notNull(),
  scenarioComplexity: text("scenario_complexity").notNull().default("medium"),
  edgeCaseFrequency: text("edge_case_frequency").notNull().default("rare"),
  riskLevel: text("risk_level").notNull().default("medium"),
  traceInput: jsonb("trace_input").notNull().default(sql`'{}'::jsonb`),
  traceOutput: jsonb("trace_output").notNull().default(sql`'{}'::jsonb`),
  traceMetadata: jsonb("trace_metadata").notNull().default(sql`'{}'::jsonb`),
  regulatoryContext: jsonb("regulatory_context").notNull().default(sql`'[]'::jsonb`),
  duration: real("duration"),
  tokenCount: integer("token_count"),
  status: text("status").notNull().default("captured"),
  tags: text("tags").array().default(sql`ARRAY[]::text[]`),
  capturedAt: timestamp("captured_at").defaultNow(),
});

export const insertShadowTraceSchema = createInsertSchema(shadowTraces).omit({ id: true, capturedAt: true });
export type InsertShadowTrace = z.infer<typeof insertShadowTraceSchema>;
export type ShadowTrace = typeof shadowTraces.$inferSelect;

export const shadowReplaySessions = pgTable("shadow_replay_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  industry: text("industry").notNull(),
  candidateAgentVersion: text("candidate_agent_version").notNull(),
  baselineAgentVersion: text("baseline_agent_version").notNull(),
  traceIds: text("trace_ids").array().default(sql`ARRAY[]::text[]`),
  status: text("status").notNull().default("configured"),
  comparisonCriteria: jsonb("comparison_criteria").notNull().default(sql`'{}'::jsonb`),
  replayResults: jsonb("replay_results").notNull().default(sql`'[]'::jsonb`),
  semanticDiff: jsonb("semantic_diff").notNull().default(sql`'{}'::jsonb`),
  complianceResults: jsonb("compliance_results").notNull().default(sql`'[]'::jsonb`),
  aggregateScores: jsonb("aggregate_scores").notNull().default(sql`'{}'::jsonb`),
  totalTraces: integer("total_traces").notNull().default(0),
  passedTraces: integer("passed_traces").notNull().default(0),
  failedTraces: integer("failed_traces").notNull().default(0),
  regressionCount: integer("regression_count").notNull().default(0),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertShadowReplaySessionSchema = createInsertSchema(shadowReplaySessions).omit({ id: true, createdAt: true });
export type InsertShadowReplaySession = z.infer<typeof insertShadowReplaySessionSchema>;
export type ShadowReplaySession = typeof shadowReplaySessions.$inferSelect;

export const canaryDeployments = pgTable("canary_deployments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  industry: text("industry").notNull(),
  agentName: text("agent_name").notNull(),
  candidateVersion: text("candidate_version").notNull(),
  baselineVersion: text("baseline_version").notNull(),
  currentTrafficPercent: integer("current_traffic_percent").notNull().default(0),
  targetTrafficPercent: integer("target_traffic_percent").notNull().default(100),
  trafficStages: jsonb("traffic_stages").notNull().default(sql`'[1,5,25,50,100]'::jsonb`),
  industrySafetyGates: jsonb("industry_safety_gates").notNull().default(sql`'{}'::jsonb`),
  kpiBaseline: jsonb("kpi_baseline").notNull().default(sql`'{}'::jsonb`),
  kpiCandidate: jsonb("kpi_candidate").notNull().default(sql`'{}'::jsonb`),
  promotionRules: jsonb("promotion_rules").notNull().default(sql`'[]'::jsonb`),
  rollbackRules: jsonb("rollback_rules").notNull().default(sql`'[]'::jsonb`),
  blastRadius: jsonb("blast_radius").notNull().default(sql`'{}'::jsonb`),
  status: text("status").notNull().default("configured"),
  autoPromote: boolean("auto_promote").notNull().default(false),
  lastPromotedAt: timestamp("last_promoted_at"),
  incidentCount: integer("incident_count").notNull().default(0),
  rollbackTriggered: boolean("rollback_triggered").notNull().default(false),
  rollbackReason: text("rollback_reason"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCanaryDeploymentSchema = createInsertSchema(canaryDeployments).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCanaryDeployment = z.infer<typeof insertCanaryDeploymentSchema>;
export type CanaryDeployment = typeof canaryDeployments.$inferSelect;

export const healingPipelines = pgTable("healing_pipelines", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  agentId: varchar("agent_id"),
  agentName: text("agent_name").notNull(),
  industry: text("industry").notNull().default("general"),
  severity: text("severity").notNull().default("medium"),
  stage: text("stage").notNull().default("detected"),
  issueType: text("issue_type").notNull().default("drift"),
  issueDescription: text("issue_description"),
  detectedAt: timestamp("detected_at").defaultNow(),
  diagnosisTemplate: text("diagnosis_template"),
  diagnosisDetails: jsonb("diagnosis_details").notNull().default(sql`'{}'::jsonb`),
  hypothesis: jsonb("hypothesis").notNull().default(sql`'{}'::jsonb`),
  businessImpact: jsonb("business_impact").notNull().default(sql`'{}'::jsonb`),
  remediation: jsonb("remediation").notNull().default(sql`'{}'::jsonb`),
  industryGuardrails: jsonb("industry_guardrails").notNull().default(sql`'[]'::jsonb`),
  experimentConfig: jsonb("experiment_config").notNull().default(sql`'{}'::jsonb`),
  experimentResults: jsonb("experiment_results").notNull().default(sql`'{}'::jsonb`),
  resolution: jsonb("resolution").notNull().default(sql`'{}'::jsonb`),
  status: text("status").notNull().default("active"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertHealingPipelineSchema = createInsertSchema(healingPipelines).omit({ id: true, createdAt: true });
export type InsertHealingPipeline = z.infer<typeof insertHealingPipelineSchema>;
export type HealingPipeline = typeof healingPipelines.$inferSelect;

export const runbooks = pgTable("runbooks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  industry: text("industry").notNull().default("general"),
  category: text("category").notNull().default("incident_response"),
  triggerType: text("trigger_type").notNull().default("manual"),
  triggerConditions: jsonb("trigger_conditions").notNull().default(sql`'[]'::jsonb`),
  steps: jsonb("steps").notNull().default(sql`'[]'::jsonb`),
  approvalGates: jsonb("approval_gates").notNull().default(sql`'[]'::jsonb`),
  autonomyLevel: text("autonomy_level").notNull().default("confirm_before"),
  status: text("status").notNull().default("draft"),
  isPreBuilt: boolean("is_pre_built").notNull().default(false),
  severity: text("severity").notNull().default("medium"),
  estimatedDuration: text("estimated_duration"),
  lastTriggered: timestamp("last_triggered"),
  triggerCount: integer("trigger_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertRunbookSchema = createInsertSchema(runbooks).omit({ id: true, createdAt: true });
export type InsertRunbook = z.infer<typeof insertRunbookSchema>;
export type Runbook = typeof runbooks.$inferSelect;

export const agentMcpServers = pgTable("agent_mcp_servers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id").notNull(),
  serverId: varchar("server_id").notNull(),
  assignedBy: varchar("assigned_by", { length: 255 }),
  assignedAt: timestamp("assigned_at").defaultNow(),
});

export const insertAgentMcpServerSchema = createInsertSchema(agentMcpServers).omit({ id: true, assignedAt: true });
export type InsertAgentMcpServer = z.infer<typeof insertAgentMcpServerSchema>;
export type AgentMcpServer = typeof agentMcpServers.$inferSelect;

export const agentPipelines = pgTable("agent_pipelines", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("draft"),
  stages: jsonb("stages").notNull().default(sql`'[]'::jsonb`),
  connections: jsonb("connections").notNull().default(sql`'[]'::jsonb`),
  triggerConfig: jsonb("trigger_config"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAgentPipelineSchema = createInsertSchema(agentPipelines).omit({ id: true, createdAt: true });
export type InsertAgentPipeline = z.infer<typeof insertAgentPipelineSchema>;
export type AgentPipeline = typeof agentPipelines.$inferSelect;

export const pipelineRuns = pgTable("pipeline_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  pipelineId: varchar("pipeline_id").notNull(),
  status: text("status").notNull().default("pending"),
  scenarioInput: text("scenario_input"),
  stageResults: jsonb("stage_results").notNull().default(sql`'[]'::jsonb`),
  currentStageId: varchar("current_stage_id"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPipelineRunSchema = createInsertSchema(pipelineRuns).omit({ id: true, createdAt: true });
export type InsertPipelineRun = z.infer<typeof insertPipelineRunSchema>;
export type PipelineRun = typeof pipelineRuns.$inferSelect;

export const mcpParameterMatches = pgTable("mcp_parameter_matches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serverId: varchar("server_id").notNull(),
  toolId: varchar("tool_id").notNull(),
  toolName: text("tool_name").notNull(),
  parameterName: text("parameter_name").notNull(),
  parameterPath: text("parameter_path"),
  matchStatus: text("match_status").notNull().default("unmatched"),
  matchedConceptId: varchar("matched_concept_id"),
  matchedConceptLabel: text("matched_concept_label"),
  matchMethod: text("match_method"),
  confidence: real("confidence").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMcpParameterMatchSchema = createInsertSchema(mcpParameterMatches).omit({ id: true, createdAt: true });
export type InsertMcpParameterMatch = z.infer<typeof insertMcpParameterMatchSchema>;
export type McpParameterMatch = typeof mcpParameterMatches.$inferSelect;

export * from "./models/chat";
