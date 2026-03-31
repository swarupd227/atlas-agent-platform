import type { Express } from "express";
import { createServer, type Server } from "http";
import { startWorker, enqueueAuditChainCheck } from "./worker";
import { runStartupMigrations } from "./db";
import authRouter from "./routes/auth";
import toolConnectorsRouter from "./routes/tool-connectors";
import governanceProxyRouter from "./routes/governance-proxy";
import llmProvidersRouter from "./routes/llm-providers";
import demoRouter from "./routes/demo";
import createEvaluationsRouter from "./routes/evaluations";
import skillsRouter from "./routes/skills";
import autonomyRouter from "./routes/autonomy";
import shadowCanaryRouter from "./routes/shadow-canary";
import outcomesRouter from "./routes/outcomes";
import agentsRouter from "./routes/agents";
import governanceRouter from "./routes/governance";
import improvementsRouter from "./routes/improvements";
import runtimeRouter from "./routes/runtime";
import playgroundRouter from "./routes/playground";
import {
  computeConstraintGraph,
  recomputeOutcomeKpis,
  type KpiReEvalResult,
} from "./routes/helpers";
import { ensureHearstAgents } from "./hearst-live-run";
import { ensureFitchAgents } from "./fitch-live-run";
import { registerKnowledgeBaseRoutes } from "./kb-routes";
import adobeAnalyticsRouter from "./mock-mcp/adobe-analytics";
import marketoRouter from "./mock-mcp/marketo";
import salesforceRouter from "./mock-mcp/salesforce";
import hearstDataPlatformRouter from "./mock-mcp/hearst-data-platform";
import hearstCmsRouter from "./mock-mcp/hearst-cms";
import hearstEmailQueueRouter from "./mock-mcp/hearst-email-queue";
import hearstAnalyticsRouter from "./mock-mcp/hearst-analytics";
import blackrock2AimRouter from "./mock-mcp/blackrock2-aim";
import fitchFfiecDataRouter from "./mock-mcp/fitch-ffiec-data";
import fitchNlpEngineRouter from "./mock-mcp/fitch-nlp-engine";
import fitchAnalyticsRouter from "./mock-mcp/fitch-analytics";
import fitchReportEngineRouter from "./mock-mcp/fitch-report-engine";
import { registerMockMcpServers } from "./mock-mcp/register";

export { computeConstraintGraph, recomputeOutcomeKpis };
export type { KpiReEvalResult };

export const industryEvalFrameworks: Record<string, {
  id: string;
  label: string;
  description: string;
  dimensions: Array<{
    id: string;
    name: string;
    description: string;
    weight: number;
    scoringCriteria: string[];
  }>;
}> = {
  healthcare: {
    id: "healthcare",
    label: "Healthcare",
    description: "Clinical accuracy, medication safety, PHI redaction, diagnostic reasoning, clinical guideline adherence",
    dimensions: [
      { id: "clinical_accuracy", name: "Clinical Accuracy", description: "Validated against clinical guidelines and medical references", weight: 2, scoringCriteria: ["Correct medical terminology", "Evidence-based recommendations", "Guideline-aligned treatment suggestions"] },
      { id: "medication_safety", name: "Medication Safety", description: "Detects unsafe medical advice, contraindication misses, dosage errors", weight: 3, scoringCriteria: ["Dosage within safe range", "Contraindication detection", "Drug interaction warnings", "Allergy cross-reference"] },
      { id: "phi_redaction", name: "PHI Redaction Completeness", description: "Tests PHI handling per HIPAA minimum necessary standard", weight: 2.5, scoringCriteria: ["Names redacted", "Dates generalized", "SSN/MRN removed", "Address/phone stripped"] },
      { id: "diagnostic_reasoning", name: "Diagnostic Reasoning Quality", description: "Evaluates differential diagnosis logic and clinical reasoning chains", weight: 2, scoringCriteria: ["Differential diagnosis considered", "Red flags identified", "Appropriate referral triggers"] },
      { id: "guideline_adherence", name: "Clinical Guideline Adherence", description: "Adherence to published clinical practice guidelines (CPGs)", weight: 1.5, scoringCriteria: ["CPG reference cited", "Recommendation matches guideline", "Deviation justified"] },
    ],
  },
  financial_services: {
    id: "financial_services",
    label: "Financial Services",
    description: "Regulatory compliance (GLBA, BSA/AML, SOX), calculation accuracy, disclosure completeness, fiduciary duty alignment",
    dimensions: [
      { id: "regulatory_compliance", name: "Regulatory Compliance Scoring", description: "BSA/AML, KYC, Fair Lending, Reg E/Z compliance checks", weight: 2.5, scoringCriteria: ["SAR filing triggers identified", "KYC verification complete", "Fair lending language used", "Reg E/Z disclosures included"] },
      { id: "calculation_accuracy", name: "Calculation Accuracy", description: "Critical financial calculations: interest rates, APR, fees, amortization", weight: 3, scoringCriteria: ["APR within 0.01% tolerance", "Amortization schedule correct", "Fee calculations accurate", "Tax implications noted"] },
      { id: "disclosure_completeness", name: "Disclosure Completeness", description: "Ensures all required disclosures are present and accurate", weight: 2, scoringCriteria: ["TILA disclosures present", "APR disclosed", "Total cost of credit stated", "Penalty terms explained"] },
      { id: "fiduciary_alignment", name: "Fiduciary Duty Alignment", description: "Validates recommendations align with client best interest", weight: 2, scoringCriteria: ["Suitability assessment performed", "Conflicts disclosed", "Best interest standard met", "Risk tolerance matched"] },
    ],
  },
  insurance: {
    id: "insurance",
    label: "Insurance",
    description: "Claims processing accuracy, underwriting guideline adherence, NAIC compliance, policyholder communication quality",
    dimensions: [
      { id: "claims_accuracy", name: "Claims Processing Accuracy", description: "Validates claim assessment accuracy, coverage determination, policy interpretation", weight: 2, scoringCriteria: ["Coverage correctly determined", "Policy exclusions applied", "Deductible calculated", "Benefit limits enforced"] },
      { id: "underwriting_adherence", name: "Underwriting Guideline Adherence", description: "Fair underwriting practices, anti-discrimination, actuarial soundness", weight: 2.5, scoringCriteria: ["Risk classification appropriate", "No prohibited factor usage", "Actuarial justification present", "Rate filing compliance"] },
      { id: "naic_compliance", name: "NAIC Compliance", description: "Adherence to National Association of Insurance Commissioners model regulations", weight: 2, scoringCriteria: ["Model law requirements met", "Consumer protection standards", "Market conduct compliance"] },
      { id: "policyholder_communication", name: "Policyholder Communication Quality", description: "Clear, accurate, and compliant policyholder communications", weight: 1.5, scoringCriteria: ["Plain language used", "Required notices included", "Response timeframes met", "Appeal rights explained"] },
    ],
  },
  manufacturing: {
    id: "manufacturing",
    label: "Manufacturing",
    description: "Safety protocol adherence, quality control precision, supply chain risk assessment accuracy",
    dimensions: [
      { id: "safety_protocol", name: "Safety Protocol Adherence", description: "Ensures compliance with OSHA, ISO 45001, machine safety standards", weight: 3, scoringCriteria: ["OSHA requirements referenced", "PPE requirements stated", "Lockout/tagout procedures", "Hazard communication complete"] },
      { id: "quality_control", name: "Quality Control Precision", description: "Validates dimensional accuracy, tolerances, and QC checkpoint adherence", weight: 2, scoringCriteria: ["Tolerance class appropriate", "Measurement units correct", "QC checkpoint documented", "Non-conformance flagged"] },
      { id: "supply_chain_risk", name: "Supply Chain Risk Assessment", description: "Accuracy of supply chain risk identification and mitigation recommendations", weight: 1.5, scoringCriteria: ["Single-source risks identified", "Lead time impacts assessed", "Alternative suppliers noted", "Geopolitical risks flagged"] },
    ],
  },
  retail: {
    id: "retail",
    label: "Retail",
    description: "Customer sentiment preservation, product recommendation relevance, return policy compliance",
    dimensions: [
      { id: "sentiment_preservation", name: "Customer Sentiment Preservation", description: "Maintains positive customer experience while enforcing policies", weight: 1.5, scoringCriteria: ["Empathetic language used", "Resolution offered", "Escalation path available", "Brand voice maintained"] },
      { id: "recommendation_relevance", name: "Product Recommendation Relevance", description: "Accuracy and relevance of product recommendations", weight: 2, scoringCriteria: ["Preference matching", "Price range appropriate", "Availability confirmed", "Complementary items relevant"] },
      { id: "return_policy_compliance", name: "Return Policy Compliance", description: "Accurate application of return and exchange policies", weight: 2, scoringCriteria: ["Return window verified", "Condition requirements stated", "Refund method correct", "Exceptions applied properly"] },
    ],
  },
  technology_saas: {
    id: "technology_saas",
    label: "Technology / SaaS",
    description: "API accuracy, error handling quality, documentation completeness, security best practices",
    dimensions: [
      { id: "api_accuracy", name: "API Accuracy", description: "Validates API response correctness, schema compliance, and error codes", weight: 2.5, scoringCriteria: ["Response schema valid", "Status codes correct", "Error messages descriptive", "Pagination handled"] },
      { id: "error_handling", name: "Error Handling Quality", description: "Graceful degradation, meaningful error messages, retry logic", weight: 2, scoringCriteria: ["Graceful degradation", "Retry logic appropriate", "Error categorization correct", "User-friendly messages"] },
      { id: "documentation_completeness", name: "Documentation Completeness", description: "Completeness and accuracy of generated documentation", weight: 1.5, scoringCriteria: ["All endpoints documented", "Examples provided", "Edge cases noted", "Authentication explained"] },
      { id: "security_practices", name: "Security Best Practices", description: "Authentication, authorization, input sanitization, and secret management", weight: 3, scoringCriteria: ["Input sanitized", "Auth tokens validated", "Secrets not exposed", "OWASP Top 10 addressed"] },
    ],
  },
};

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // ── Auth & OpenAPI router ─────────────────────────────────────
  app.use(authRouter);

  registerKnowledgeBaseRoutes(app);
  app.use("/api/mock/adobe", adobeAnalyticsRouter);
  app.use("/api/mock/marketo", marketoRouter);
  app.use("/api/mock/salesforce", salesforceRouter);
  app.use("/api/mock/hearst-data-platform", hearstDataPlatformRouter);
  app.use("/api/mock/hearst-cms", hearstCmsRouter);
  app.use("/api/mock/hearst-email-queue", hearstEmailQueueRouter);
  app.use("/api/mock/hearst-analytics", hearstAnalyticsRouter);
  app.use("/api/mock/bk2-aim", blackrock2AimRouter);
  app.use("/api/mock/fitch-ffiec-data", fitchFfiecDataRouter);
  app.use("/api/mock/fitch-nlp-engine", fitchNlpEngineRouter);
  app.use("/api/mock/fitch-analytics", fitchAnalyticsRouter);
  app.use("/api/mock/fitch-report-engine", fitchReportEngineRouter);

  app.post("/api/mock-mcp/register", async (_req, res) => {
    try {
      const result = await registerMockMcpServers();
      res.json({ success: true, ...result, message: `Registered ${result.servers.length} MCP servers with ${result.tools} tools` });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/mock-mcp/seed-demo", async (_req, res) => {
    try {
      const result = await registerMockMcpServers();
      res.json({
        success: true,
        message: `Registered ${result.servers.length} mock MCP servers with ${result.tools} tools`,
        servers: result.servers.map((s: any) => ({ id: s.id, name: s.name, url: s.url })),
        tools: result.tools,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ── Phase 1 & 2 router modules ──────────────────────────────
  app.use(toolConnectorsRouter);
  app.use(governanceProxyRouter);

  // ── Phase 3 router modules ───────────────────────────────────
  app.use(outcomesRouter);
  app.use(agentsRouter);
  app.use(governanceRouter);    // includes billingRouter + governance domain routes
  app.use(improvementsRouter);
  app.use(runtimeRouter);
  app.use(playgroundRouter);

  // ── Remaining router modules ─────────────────────────────────
  app.use(llmProvidersRouter);
  app.use(demoRouter);
  app.use(createEvaluationsRouter(industryEvalFrameworks));
  app.use(skillsRouter);
  app.use(autonomyRouter);
  app.use(shadowCanaryRouter);

  // Run idempotent startup SQL migrations (CREATE TABLE IF NOT EXISTS).
  // Awaited before starting the worker so tables are guaranteed to exist before
  // any jobs are dequeued and attempt to write to them. Errors are NOT caught here
  // so migration failures are fatal and prevent degraded operation.
  await runStartupMigrations();

  // Start the job worker
  startWorker();

  // Enqueue initial audit chain integrity check (idempotent, errors logged internally).
  await enqueueAuditChainCheck();

  // Ensure Hearst NBA agents + MCP servers are registered
  ensureHearstAgents().catch((err: any) => console.error("[startup] ensureHearstAgents:", err?.message));
  ensureFitchAgents().catch((err: any) => console.error("[startup] ensureFitchAgents:", err?.message));

  return httpServer;
}

