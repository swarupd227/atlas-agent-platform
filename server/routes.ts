import type { Express } from "express";
import { createServer, type Server } from "http";
import { startWorker, enqueueAuditChainCheck, enqueueOtcSmokeTest, enqueueOtcSmokeTestNow, enqueueReportScheduleCheck } from "./worker";
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
import aarRouter, { backfillAarConfigs } from "./routes/aar";
import observabilityRouter from "./routes/observability";
import {
  computeConstraintGraph,
  recomputeOutcomeKpis,
  type KpiReEvalResult,
} from "./routes/helpers";
import { ensureHearstAgents } from "./hearst-live-run";
import { ensureFitchAgents } from "./fitch-live-run";
import { ensureOnespanAgents } from "./onespan-live-run";
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
import bbAuctionDataRouter from "./mock-mcp/bb-auction-data";
import bbMarketDataRouter from "./mock-mcp/bb-market-data";
import bbReportEngineRouter from "./mock-mcp/bb-report-engine";
import bbOdometerVerifyRouter from "./mock-mcp/bb-odometer-verify";
import fitchRwBloombergRouter from "./mock-mcp/fitch-rw-bloomberg";
import fitchRwSecEdgarRouter from "./mock-mcp/fitch-rw-sec-edgar";
import fitchRwAnalyticsRouter from "./mock-mcp/fitch-rw-analytics";
import fitchRwApprovalGateRouter from "./mock-mcp/fitch-rw-approval-gate";
import otcOrderOmsRouter from "./mock-mcp/otc-order-oms";
import otcOrderCreditRouter from "./mock-mcp/otc-order-credit";
import otcOrderInventoryRouter from "./mock-mcp/otc-order-inventory";
import pkgKiwiplanEspRouter from "./mock-mcp/pkg-kiwiplan-esp";
import pkgKiwiplanMachineRouter from "./mock-mcp/pkg-kiwiplan-machine";
import pkgScheduleOptimizerRouter from "./mock-mcp/pkg-schedule-optimizer";
import pkgScheduleProposalRouter from "./mock-mcp/pkg-schedule-proposal";
import onespanSenderUiRouter    from "./mock-mcp/onespan-sender-ui";
import onespanSignerEventRouter from "./mock-mcp/onespan-signer-event";
import onespanAnalyticsRouter   from "./mock-mcp/onespan-analytics";
import onespanCrmRouter         from "./mock-mcp/onespan-crm";
import onespanHelpdeskRouter    from "./mock-mcp/onespan-helpdesk";
import otcFulfillmentDisruptionRouter from "./mock-mcp/otc-fulfillment-disruption";
import otcFulfillmentTrackingRouter   from "./mock-mcp/otc-fulfillment-tracking";
import otcFulfillmentCommsRouter      from "./mock-mcp/otc-fulfillment-comms";
import advSupportTriageRouter         from "./mock-mcp/adv-support-triage";
import advSupportKbRouter             from "./mock-mcp/adv-support-kb";
import advSupportDiagnosticRouter     from "./mock-mcp/adv-support-diagnostic";
import advSupportEscalationRouter     from "./mock-mcp/adv-support-escalation";
import otcCashPaymentEngineRouter     from "./mock-mcp/otc-cash-payment-engine";
import otcCashArPostingRouter         from "./mock-mcp/otc-cash-ar-posting";
import otcDisputeResolutionRouter     from "./mock-mcp/otc-dispute-resolution";
import otcDisputeContractRouter       from "./mock-mcp/otc-dispute-contract";
import { ensureAdvSupportAgents }     from "./advantive-support-live-run";
import { otcDisputeLiveRunHandler, getOtcDisputeAgentRuns, resetOtcDisputeDemo, ensureOtcDisputeAgents } from "./otc-dispute-live-run";
import hnpAssemblyRouter      from "./mock-mcp/hnp-assembly";
import hnpKnowledgeBaseRouter from "./mock-mcp/hnp-knowledge-base";
import hnpPublicRecordsRouter from "./mock-mcp/hnp-public-records";
import hnpCmsRouter           from "./mock-mcp/hnp-cms";
import hnpSubscriberRouter    from "./mock-mcp/hnp-subscriber";
import hnpChurnModelRouter    from "./mock-mcp/hnp-churn-model";
import hnpGeoRouter           from "./mock-mcp/hnp-geo";
import hnpContentApiRouter    from "./mock-mcp/hnp-content-api";
import { hnpGovtLiveRunHandler, getHnpGovtAgentRuns, resetHnpGovtDemo } from "./hnp-govt-live-run";
import { hnpSubLiveRunHandler, getHnpSubAgentRuns, resetHnpSubDemo } from "./hnp-sub-live-run";
import mcgKnowledgeBaseRouter from "./mock-mcp/mcg-knowledge-base";
import mcgBundleStoreRouter   from "./mock-mcp/mcg-bundle-store";
import { mcgKbLiveRunHandler, getMcgKbAgentRuns, resetMcgKbDemo } from "./mcg-kb-live-run";
import { bbLiveRunHandler, getBBAgentRuns, getBBOutcomeData, getBBSelfHealingStatus, resetBBDemo, ensureBBAgents } from "./blackbook-live-run";
import solifiDehRouter from "./mock-mcp/solifi-deh";
import { dehEnsureAgentsHandler } from "./demo-routes";
import glSyncGatewayRouter       from "./mock-mcp/gl-sync-gateway";
import glSyncIntacctRouter       from "./mock-mcp/gl-sync-intacct";
import glSyncReconciliationRouter from "./mock-mcp/gl-sync-reconciliation";
import glSyncFileDeliveryRouter  from "./mock-mcp/gl-sync-file-delivery";
import glSyncNotificationRouter  from "./mock-mcp/gl-sync-notification";
import { glSyncLiveRunHandler, resetGlSyncHandler, getGlSyncStatusHandler } from "./gl-sync-live-run";
import { registerMockMcpServers } from "./mock-mcp/register";
import piiRouter from "./routes/pii";
import feedbackRouter from "./routes/feedback";
import myActionsRouter from "./routes/my-actions";
import outputContractsRouter from "./routes/output-contracts";
import generationMetadataRouter from "./routes/generation-metadata";
import evalStudioRouter from "./routes/eval-studio";
import enterpriseIntegrationsRouter, { startTokenRefreshDaemon } from "./routes/enterprise-integrations";
import { registerEnterpriseIntegrations } from "./integrations/register";
import { createSalesforceRouter } from "./integrations/salesforce/mcp-server";
import { createHubSpotRouter } from "./integrations/hubspot/mcp-server";
import { createServiceNowRouter } from "./integrations/servicenow/mcp-server";
import { createJiraRouter } from "./integrations/jira/mcp-server";
import { createGitHubRouter } from "./integrations/github/mcp-server";
import { createSlackRouter } from "./integrations/slack/mcp-server";
import { createMicrosoftGraphRouter } from "./integrations/msgraph/mcp-server";
import { createSnowflakeRouter } from "./integrations/snowflake/mcp-server";
import { createWorkdayRouter } from "./integrations/workday/mcp-server";
import { createSapRouter } from "./integrations/sap/mcp-server";

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
  app.use("/api/mock/bb-auction-data", bbAuctionDataRouter);
  app.use("/api/mock/bb-market-data", bbMarketDataRouter);
  app.use("/api/mock/bb-report-engine", bbReportEngineRouter);
  app.use("/api/mock/bb-odometer-verify", bbOdometerVerifyRouter);
  app.use("/api/mock/fitch-rw-bloomberg", fitchRwBloombergRouter);
  app.use("/api/mock/fitch-rw-sec-edgar", fitchRwSecEdgarRouter);
  app.use("/api/mock/fitch-rw-analytics", fitchRwAnalyticsRouter);
  app.use("/api/mock/fitch-rw-approval-gate", fitchRwApprovalGateRouter);
  app.use("/api/mock/otc-order-oms", otcOrderOmsRouter);
  app.use("/api/mock/otc-order-credit", otcOrderCreditRouter);
  app.use("/api/mock/otc-order-inventory", otcOrderInventoryRouter);
  app.use("/api/mock/pkg-kiwiplan-esp", pkgKiwiplanEspRouter);
  app.use("/api/mock/pkg-kiwiplan-machine", pkgKiwiplanMachineRouter);
  app.use("/api/mock/pkg-schedule-optimizer", pkgScheduleOptimizerRouter);
  app.use("/api/mock/pkg-schedule-proposal", pkgScheduleProposalRouter);
  app.use("/api/mock/onespan-sender-ui",    onespanSenderUiRouter);
  app.use("/api/mock/onespan-signer-event", onespanSignerEventRouter);
  app.use("/api/mock/onespan-analytics",   onespanAnalyticsRouter);
  app.use("/api/mock/onespan-crm",         onespanCrmRouter);
  app.use("/api/mock/onespan-helpdesk",    onespanHelpdeskRouter);
  app.use("/api/mock/otc-fulfillment-disruption", otcFulfillmentDisruptionRouter);
  app.use("/api/mock/otc-fulfillment-tracking",   otcFulfillmentTrackingRouter);
  app.use("/api/mock/otc-fulfillment-comms",      otcFulfillmentCommsRouter);

  app.post("/api/otc-fulfillment/smoke-test", async (_req, res) => {
    try {
      const { jobId } = await enqueueOtcSmokeTestNow();
      res.json({ ok: true, jobId, message: "OTC smoke test job queued" });
    } catch (err: unknown) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : "Failed to enqueue smoke test" });
    }
  });
  app.use("/api/mock/adv-support-triage",         advSupportTriageRouter);
  app.use("/api/mock/adv-support-kb",             advSupportKbRouter);
  app.use("/api/mock/adv-support-diagnostic",     advSupportDiagnosticRouter);
  app.use("/api/mock/adv-support-escalation",     advSupportEscalationRouter);
  // OTC Cash Application Demo 4 — AI-Powered Cash Application
  app.use("/api/mock/otc-cash-payment-engine",    otcCashPaymentEngineRouter);
  app.use("/api/mock/otc-cash-ar-posting",        otcCashArPostingRouter);

  // OTC Dispute Resolution Demo 5 — Dispute Resolution Intelligence
  app.use("/api/mock/otc-dispute-resolution",     otcDisputeResolutionRouter);
  app.use("/api/mock/otc-dispute-contract",       otcDisputeContractRouter);
  app.get("/demo-api/otc-dispute/live-run",       otcDisputeLiveRunHandler);
  app.get("/demo-api/otc-dispute/agent-runs",     getOtcDisputeAgentRuns);
  app.post("/demo-api/otc-dispute/reset",         resetOtcDisputeDemo);

  // HNP Government Beat Intelligence (HNP-GOVT) — Hearst Newspapers demo
  app.use("/api/mock/hnp-assembly",        hnpAssemblyRouter);
  app.use("/api/mock/hnp-knowledge-base",  hnpKnowledgeBaseRouter);
  app.use("/api/mock/hnp-public-records",  hnpPublicRecordsRouter);
  app.use("/api/mock/hnp-cms",             hnpCmsRouter);
  app.get("/demo-api/hnp-govt/live-run",   hnpGovtLiveRunHandler);
  app.get("/demo-api/hnp-govt/agent-runs", getHnpGovtAgentRuns);
  app.post("/demo-api/hnp-govt/reset",     resetHnpGovtDemo);

  // MCG Health — Knowledge Base Onboarding (SCN-MCG-1)
  app.use("/api/mock/mcg-knowledge-base",  mcgKnowledgeBaseRouter);
  app.use("/api/mock/mcg-bundle-store",    mcgBundleStoreRouter);
  app.get("/demo-api/mcg-kb/live-run",     mcgKbLiveRunHandler);
  app.get("/demo-api/mcg-kb/agent-runs",   getMcgKbAgentRuns);
  app.post("/demo-api/mcg-kb/reset",       resetMcgKbDemo);

  // Solifi — Dealer Experience Hub (SCN-SOLIFI-DEH-1)
  app.use("/api/mock/solifi-deh",                    solifiDehRouter);
  app.post("/demo-api/solifi-dealer/ensure-agents",  dehEnsureAgentsHandler);

  // Kinective — Prior-Day GL Synchronization (SCN-KINECTIVE-GL-1)
  app.use("/api/mock/kinective-gateway-gl",    glSyncGatewayRouter);
  app.use("/api/mock/sage-intacct",            glSyncIntacctRouter);
  app.use("/api/mock/reconciliation-ledger",   glSyncReconciliationRouter);
  app.use("/api/mock/file-delivery",           glSyncFileDeliveryRouter);
  app.use("/api/mock/gl-notification",         glSyncNotificationRouter);
  app.get("/demo-api/kinective-gl/stream",     glSyncLiveRunHandler);
  app.post("/demo-api/kinective-gl/reset",     resetGlSyncHandler);
  app.get("/demo-api/kinective-gl/status",     getGlSyncStatusHandler);

  // HNP Subscriber Intelligence & Churn Prevention (HNP-SUB) — Hearst Newspapers demo
  app.use("/api/mock/hnp-subscriber",      hnpSubscriberRouter);
  app.use("/api/mock/hnp-churn-model",     hnpChurnModelRouter);
  app.use("/api/mock/hnp-geo",             hnpGeoRouter);
  app.use("/api/mock/hnp-content-api",     hnpContentApiRouter);
  app.get("/demo-api/hnp-sub/live-run",    hnpSubLiveRunHandler);
  app.get("/demo-api/hnp-sub/agent-runs",  getHnpSubAgentRuns);
  app.post("/demo-api/hnp-sub/reset",      resetHnpSubDemo);

  app.get("/demo-api/blackbook/live-run",    bbLiveRunHandler);
  app.get("/demo-api/blackbook/agent-runs",  getBBAgentRuns);
  app.get("/demo-api/blackbook/outcome",     getBBOutcomeData);
  app.get("/demo-api/blackbook/self-healing", getBBSelfHealingStatus);
  app.post("/demo-api/blackbook/reset",      resetBBDemo);

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
  app.use(aarRouter);
  app.use(observabilityRouter);

  // ── Remaining router modules ─────────────────────────────────
  app.use(llmProvidersRouter);
  app.use(demoRouter);
  app.use(createEvaluationsRouter(industryEvalFrameworks));
  app.use(skillsRouter);
  app.use(autonomyRouter);
  app.use(shadowCanaryRouter);
  app.use(piiRouter);
  app.use(feedbackRouter);
  app.use(myActionsRouter);
  app.use(outputContractsRouter);
  app.use(generationMetadataRouter);
  app.use(evalStudioRouter);
  app.use(enterpriseIntegrationsRouter);

  // ── Enterprise Integration routers (Wave 1: CRM, Wave 2: ITSM + DevOps) ────
  app.use("/api/integrations/salesforce", createSalesforceRouter());
  app.use("/api/integrations/hubspot", createHubSpotRouter());
  app.use("/api/integrations/servicenow", createServiceNowRouter());
  app.use("/api/integrations/jira", createJiraRouter());
  app.use("/api/integrations/github", createGitHubRouter());
  app.use("/api/integrations/slack", createSlackRouter());
  app.use("/api/integrations/msgraph", createMicrosoftGraphRouter());
  // ── Enterprise Integration routers (Wave 4: Data & ERP) ──────────────────
  app.use("/api/integrations/snowflake", createSnowflakeRouter());
  app.use("/api/integrations/workday", createWorkdayRouter());
  app.use("/api/integrations/sap", createSapRouter());

  // ── Enterprise integration catalog endpoint ──────────────────────────────────
  app.post("/api/integrations/register", async (_req, res) => {
    try {
      const result = await registerEnterpriseIntegrations();
      res.json({ success: true, ...result, message: `Registered ${result.servers.length} enterprise integration MCP servers with ${result.tools} tools` });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Run idempotent startup SQL migrations (CREATE TABLE IF NOT EXISTS).
  // Awaited before starting the worker so tables are guaranteed to exist before
  // any jobs are dequeued and attempt to write to them. Errors are NOT caught here
  // so migration failures are fatal and prevent degraded operation.
  await runStartupMigrations();

  // Start the job worker
  startWorker();

  // Enqueue initial audit chain integrity check (idempotent, errors logged internally).
  await enqueueAuditChainCheck();

  // Enqueue initial OTC Fulfillment smoke test (runs weekly, idempotent).
  await enqueueOtcSmokeTest();

  // Enqueue compliance report schedule checker (runs hourly, idempotent).
  await enqueueReportScheduleCheck();

  // Ensure Hearst NBA agents + MCP servers are registered
  ensureHearstAgents().catch((err: any) => console.error("[startup] ensureHearstAgents:", err?.message));
  ensureFitchAgents().catch((err: any) => console.error("[startup] ensureFitchAgents:", err?.message));
  ensureBBAgents().catch((err: any) => console.error("[startup] ensureBBAgents:", err?.message));
  ensureOnespanAgents().catch((err: any) => console.error("[startup] ensureOnespanAgents:", err?.message));
  // OTC Dispute agents use lazy initialization (ensureOtcDisputeAgents is called inside otcDisputeLiveRunHandler)
  // OTC Order agents use lazy initialization (ensureOtcOrderAgents is called inside the live-run handler)
  // PKG Sched agents use lazy initialization (ensurePackagingSchedAgents is called inside pkgSchedLiveRunHandler)
  // OTC Fulfillment agents use lazy initialization (ensureOtcFulfillmentAgents is called inside the live-run handler)
  // Advantive Support agents use lazy initialization (ensureAdvSupportAgents is called inside advSupportLiveRunHandler)

  // Backfill AAR configs for all already-deployed agents
  backfillAarConfigs().catch((err: any) => console.error("[startup] backfillAarConfigs:", err?.message));

  // Start OAuth token refresh daemon (refreshes tokens expiring in next 5 min, runs every 4 min)
  startTokenRefreshDaemon();

  // Register enterprise CRM integration MCP servers in catalog (idempotent)
  registerEnterpriseIntegrations().catch((err: any) =>
    console.error("[startup] registerEnterpriseIntegrations:", err?.message)
  );

  return httpServer;
}

