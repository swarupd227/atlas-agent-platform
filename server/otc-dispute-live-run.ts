import { type Request, type Response } from "express";
import { storage } from "./storage";
import { db } from "./db";
import { organizations } from "@shared/schema";
import { runAgentOnce, stopAgentRuntime, runtimeEvents } from "./agent-runtime";
import {
  OTC_AGT_008_NAME, OTC_AGT_011_NAME, OTC_AGT_006_NAME,
  makeOtcDisputeMcpServerDefs,
  OTC_DISPUTE_KB_DEFS,
  OTC_DISPUTE_AGENT_DEFS,
  OTC_DISPUTE_POLICY_DEFS,
  OTC_DISPUTE_SKILLS,
  OTC_DISPUTE_BLUEPRINTS,
  OTC_DISPUTE_ONTOLOGY_CONCEPTS,
  OTC_DISPUTE_SYSTEM_PROMPTS,
} from "./otc-dispute-shared-defs";

const BASE_URL = `http://localhost:${process.env.PORT || 5000}`;
const OTC_DISPUTE_MCP_SERVERS = makeOtcDisputeMcpServerDefs(BASE_URL);

// ─── Module-level caches ──────────────────────────────────────────────────────
let _setupDone = false;
const _agentIdByName:   Record<string, string> = {};
const _mcpIdByName:     Record<string, string> = {};
const _deployIdByAgent: Record<string, string> = {};

// ─── JSON extraction helper ───────────────────────────────────────────────────
function extractJson(text: string): Record<string, any> | null {
  const blockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (blockMatch) { try { return JSON.parse(blockMatch[1]); } catch {} }
  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch) { try { return JSON.parse(objectMatch[0]); } catch {} }
  return null;
}

// ─── SSE helper ───────────────────────────────────────────────────────────────
function sse(res: Response, event: string, data: object) {
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    if ((res as any).flush) (res as any).flush();
  } catch {}
}

// ─── Cache refresh ────────────────────────────────────────────────────────────
async function _refreshCaches(): Promise<void> {
  const [allServers, allAgents] = await Promise.all([
    storage.getMcpServers().catch((): any[] => []),
    storage.getAgents().catch((): any[] => []),
  ]);
  for (const sd of OTC_DISPUTE_MCP_SERVERS) {
    const s = allServers.find((x: any) => x.name === sd.name);
    if (s) _mcpIdByName[sd.name] = s.id;
  }
  for (const name of [OTC_AGT_008_NAME, OTC_AGT_011_NAME, OTC_AGT_006_NAME]) {
    const a = allAgents.find((x: any) => x.name === name);
    if (a) _agentIdByName[name] = a.id;
  }
}

// ─── Agent provisioning ───────────────────────────────────────────────────────
export async function ensureOtcDisputeAgents(): Promise<void> {
  if (_setupDone) { await _refreshCaches(); return; }

  console.log("[otc-dispute] Ensuring agents and MCP servers…");

  try {
    // 0. Resolve org ID (same pattern as bb-live-run)
    const [firstOrg] = await db.select({ id: organizations.id }).from(organizations).limit(1);
    const orgId = firstOrg?.id;

    // 1. Knowledge Bases
    const kbIdByName: Record<string, string> = {};
    const allKbs = await storage.getKnowledgeBases().catch((): any[] => []);
    for (const kbDef of OTC_DISPUTE_KB_DEFS) {
      let kb = allKbs.find((k: any) => k.name === kbDef.name);
      if (!kb) {
        kb = await storage.createKnowledgeBase({
          name:                kbDef.name,
          description:         kbDef.description,
          industry:            "manufacturing",
          status:              "active",
          embeddingModel:      "text-embedding-3-small",
          embeddingDimensions: 1536,
          chunkSize:           512,
          chunkOverlap:        50,
          organizationId:      orgId,
        } as any);
      }
      kbIdByName[kbDef.name] = kb.id;
    }

    // 2. MCP Servers + Tools
    const allServers = await storage.getMcpServers().catch((): any[] => []);
    for (const sd of OTC_DISPUTE_MCP_SERVERS) {
      let server = allServers.find((s: any) => s.name === sd.name);
      if (!server) {
        server = await storage.createMcpServer({
          name:          sd.name,
          description:   sd.description,
          transportType: "streamable-http",
          url:           sd.url,
          status:        "registered",
          riskTier:      "MEDIUM",
          allowlisted:   true,
          addedBy:       "otc-dispute-live-demo",
          capabilities:  { tools: true, resources: false, prompts: false, sampling: false },
          serverInfo:    { vendor: "NovaTech Industries / ATLAS Demo", version: "1.0.0" },
        });
      } else if (server.url !== sd.url) {
        await storage.updateMcpServer(server.id, { url: sd.url });
      }
      _mcpIdByName[sd.name] = server.id;

      const existingTools = await storage.getMcpServerTools(server.id).catch((): any[] => []);
      const existingNames = new Set(existingTools.map((t: any) => t.name));
      for (const tool of sd.tools) {
        if (existingNames.has(tool.name)) continue;
        await storage.createMcpServerTool({
          serverId:           server.id,
          name:               tool.name,
          description:        tool.description,
          inputSchema:        { type: "object", properties: {}, required: [] },
          annotations:        { endpoint: tool.endpoint, method: tool.method },
          enabled:            true,
          riskClassification: "low",
        });
      }
    }

    // 3. Skills
    const allSkills = await storage.getSkills().catch((): any[] => []);
    const skillIdByName: Record<string, string> = {};
    for (const skillDef of OTC_DISPUTE_SKILLS) {
      let skill = allSkills.find((s: any) => s.name === skillDef.name);
      if (!skill) {
        skill = await storage.createSkill({
          name:        skillDef.name,
          description: skillDef.description,
          domain:      skillDef.domain,
          industry:    skillDef.industry,
          version:     skillDef.version,
          tags:        skillDef.tags,
          status:      "active",
          author:      "NovaTech Industries / Atlas Demo",
        } as any);
      }
      skillIdByName[skillDef.name] = skill.id;
    }

    // 4. Agents (create OTC-AGT-008; ensure 006 & 011 exist)
    const allAgents = await storage.getAgents().catch((): any[] => []);
    for (const def of OTC_DISPUTE_AGENT_DEFS) {
      let agent = allAgents.find((a: any) => a.name === def.name);
      const systemPrompt = OTC_DISPUTE_SYSTEM_PROMPTS[def.externalId];
      const mcpServerId  = _mcpIdByName[def.mcpServerName];
      const kbId         = kbIdByName[def.kbName];

      if (!agent) {
        agent = await storage.createAgent({
          name:              def.name,
          description:       def.description,
          systemPrompt,
          runtimeConfig:     { scheduleIntervalMinutes: 0 },
          agentType:         "operational",
          status:            "active",
          environment:       "production",
          modelProvider:     "anthropic",
          modelName:         "claude-opus-4-5",
          riskTier:          "MEDIUM",
          autonomyMode:      "autonomous",
          currentVersion:    "1.0.0",
          maxToolIterations: 10,
          toolAccessClass:   "standard",
          department:        def.department,
          owner:             "NovaTech Industries / Atlas Demo",
          healthScore:       97,
          successRate:       0.97,
          maturityFactors:   {},
          organizationId:    orgId,
        } as any);
        console.log(`[otc-dispute] ${def.externalId} (${def.name}) created → ${agent.id}`);
      } else if (def.externalId === "OTC-AGT-008") {
        await storage.updateAgent(agent.id, { systemPrompt, description: def.description } as any);
      }

      _agentIdByName[def.name] = agent.id;

      // Link KB
      if (kbId) {
        const existing = await storage.getAgentKnowledgeBases(agent.id).catch((): any[] => []);
        if (!existing.some((l: any) => l.knowledgeBaseId === kbId)) {
          await storage.createAgentKnowledgeBase({ agentId: agent.id, knowledgeBaseId: kbId }).catch(() => {});
        }
      }

      // Note: skill linking is handled by the provisioning script (bb-ext1-provision-dev.mjs / create-otc-agt-008-dev.mjs)
      // agentSkills is a JSONB column on the agents table — not a join table — skip here.

      // Link MCP server
      if (mcpServerId) {
        const linkedMcps = await storage.getAgentMcpServers(agent.id).catch((): any[] => []);
        if (!linkedMcps.some((l: any) => l.serverId === mcpServerId)) {
          await storage.createAgentMcpServer({ agentId: agent.id, serverId: mcpServerId }).catch(() => {});
        }
      }
    }

    _setupDone = true;
    console.log("[otc-dispute] Setup complete");
  } catch (err: any) {
    console.error("[otc-dispute] ensureOtcDisputeAgents error:", err?.message);
  }
}

// ─── Deployment helper ────────────────────────────────────────────────────────
async function _ensureDeployment(agentId: string, agentName: string, mcpServerId: string): Promise<string> {
  const cacheKey = `${agentName}-dispute`;
  if (_deployIdByAgent[cacheKey]) return _deployIdByAgent[cacheKey];

  const allDeploys = await storage.getDeployments().catch((): any[] => []);
  let deploy = allDeploys.find((d: any) => d.agentId === agentId && d.status !== "terminated");

  if (!deploy) {
    deploy = await storage.createDeployment({
      agentId,
      agentName,
      environment:      "production",
      status:           "pending",
      version:          "1.0.0",
      rolloutStrategy:  "canary",
      canaryPercent:    100,
      pipelineComplete: true,
      deployedAt:       new Date(),
    });
  } else {
    await storage.updateDeployment(deploy.id, { status: "pending", resultSummary: null as any }).catch(() => {});
  }

  // Ensure MCP server is linked to this deployment's agent
  if (mcpServerId) {
    const linkedMcps = await storage.getAgentMcpServers(agentId).catch((): any[] => []);
    if (!linkedMcps.some((l: any) => l.serverId === mcpServerId)) {
      await storage.createAgentMcpServer({ agentId, serverId: mcpServerId }).catch(() => {});
    }
  }

  await storage.updateAgent(agentId, { status: "active" } as any).catch(() => {});
  _deployIdByAgent[cacheKey] = deploy.id;
  return deploy.id;
}

// ─── Scenario task prompts ────────────────────────────────────────────────────
type DisputeScenario = "happy" | "legal-hold" | "erp-fail";

const SCENARIO_PROMPTS: Record<DisputeScenario, {
  label: string;
  agent008: string;
  agent011: string;
  agent006: string;
  completeMsg: string;
}> = {
  "happy": {
    label: "Happy Path — Full Systemic Resolution",
    agent008: `You are the Dispute Resolution Agent (OTC-AGT-008) for NovaTech Industries.

Apex Industries (Tier 1, $12M/year customer) has filed 12 disputes totalling $380K in the last 45 days — a sudden 400% spike above their historical baseline of 1 dispute per quarter. All disputes cite pricing discrepancies on their invoices.

Your job: investigate this dispute cluster and determine whether it is a systemic issue.

You have tools to:
1. Call get_customer_dispute_queue to load all 12 open disputes
2. Call analyze_dispute_patterns to identify clustering, category concentration, and statistical anomalies
3. Call classify_dispute_root_cause to trace the pattern to a specific event (contract effective date, ERP data, or process error)
4. Call get_dispute_invoice_details to verify the per-invoice overcharge amounts
5. Call check_legal_hold_status to identify any invoices blocked from automatic credit

Work through each step methodically. If pattern analysis confirms a systemic issue, escalate to systemic classification and prepare findings for OTC-AGT-011 (contract compliance investigation).

When complete, output your findings in this JSON block:
\`\`\`json
{"status":"SYSTEMIC_CONFIRMED","customer":"Apex Industries","disputes":12,"totalDisputed":380000,"rootCause":"PRICE_LIST_ACTIVATION_ERROR","contract":"MSA-2025-1104","priceListError":"PL-2024-C","correctPriceList":"PL-2025-C-APEX","overchargePct":4.7,"apexInvoicesAffected":34,"apexExposure":38300,"legalHoldFound":true,"legalHoldInvoice":"CRN-2026-AX-0005","legalHoldRef":"REF-LEGAL-2026-047","handoffToAgent011":true}
\`\`\``,

    agent011: `You are the Contract & Pricing Compliance Agent (OTC-AGT-011) for NovaTech Industries.

OTC-AGT-008 has confirmed a systemic pricing dispute: contract MSA-2025-1104 (Apex Industries, effective Feb 12, 2026) introduced new Category C pricing, but ERP price list PL-2024-C was never replaced by PL-2025-C-APEX — causing a 4.7% systematic overcharge.

Your job: quantify the full enterprise-wide exposure and prepare corrective action.

1. Call pull_contract_pricing_schedule to extract MSA-2025-1104 contracted rates and confirm the 4.7% overcharge on all Category C SKUs
2. Call scan_invoices_for_overcharge to identify all 34 Apex Industries invoices affected since Feb 12, 2026
3. Call identify_affected_customers to scan the full customer portfolio for similar contract structures
4. Call calculate_systemic_exposure to quantify total overcharge across all customers
5. Call validate_erp_price_list to confirm PL-2024-C is still active and generate change request CR-2026-PL-0047

Be specific about the number of customers, invoice counts, and dollar amounts. Flag that Meridian, Cascade, and Stonebridge have not filed disputes and require proactive outreach.

When complete, output:
\`\`\`json
{"status":"EXPOSURE_QUANTIFIED","totalCustomers":4,"totalInvoices":123,"totalOvercharge":165300,"apexExposure":38300,"meridianExposure":54000,"cascadeExposure":38000,"stonebridgeExposure":35000,"priceListError":"PL-2024-C","erpCorrectionRequest":"CR-2026-PL-0047","proactiveOutreachRequired":true,"handoffToAgent006":true}
\`\`\``,

    agent006: `You are the Billing & Collections Agent (OTC-AGT-006) for NovaTech Industries.

OTC-AGT-008 and OTC-AGT-011 have completed the investigation:
- Root cause: ERP price list PL-2024-C active instead of PL-2025-C-APEX for contract MSA-2025-1104
- Total exposure: $165,300 across 4 customers, 123 invoices
- Legal hold: Invoice CRN-2026-AX-0005 is excluded (REF-LEGAL-2026-047) — do NOT include in credits
- ERP change request CR-2026-PL-0047 submitted by OTC-AGT-011

Your job: execute the bulk resolution.

1. Call recommend_bulk_resolution to generate the complete resolution plan for 123 invoices across 4 customers (excluding the held invoice)
2. Issue credit memos for all eligible invoices — Apex Industries (11 eligible, $13.4K credit), Meridian Manufacturing ($54K), Cascade Dynamics ($38K), Stonebridge Industries ($35K)
3. Note the ERP correction change request CR-2026-PL-0047 has been submitted for approval
4. Confirm that proactive notifications will go to all 4 customers

Output your completion summary:
\`\`\`json
{"status":"RESOLUTION_COMPLETE","creditsIssued":122,"legalHoldExcluded":1,"totalCreditAmount":140400,"erpCorrectionRef":"CR-2026-PL-0047","customersNotified":4,"apexCredit":13400,"meridianCredit":54000,"cascadeCredit":38000,"stonebridgeCredit":35000,"preventionRuleRecommended":true,"processingTimeHours":2}
\`\`\``,

    completeMsg: "OTC-AGT-008 + 011 + 006 completed — $165K systemic dispute resolved across 4 customers. Traces available in Runs & Traces.",
  },

  "legal-hold": {
    label: "Exception: Legal Hold — Invoice CRN-2026-AX-0005",
    agent008: `You are the Dispute Resolution Agent (OTC-AGT-008) for NovaTech Industries.

Apex Industries has filed 12 disputes ($380K). You have already run pattern analysis and confirmed the root cause. Now focus specifically on the legal hold check — this is critical before any credits can be issued.

1. Call get_customer_dispute_queue to load all open disputes
2. Call check_legal_hold_status on the dispute portfolio
3. Identify which invoice is on legal hold and what clearance is required
4. Recommend how to proceed: issue credits for all eligible invoices, route held invoice to Legal

\`\`\`json
{"status":"PARTIAL_RESOLUTION","legalHoldFound":true,"holdInvoice":"CRN-2026-AX-0005","holdRef":"REF-LEGAL-2026-047","holdType":"ACTIVE_LITIGATION","creditBlockedAmount":24900,"eligibleCreditAmount":355100,"escalatedToLegal":true,"legalClearanceRequired":true,"estimatedResolution":"2026-04-15"}
\`\`\``,

    agent011: `You are the Contract & Pricing Compliance Agent (OTC-AGT-011) for NovaTech Industries.

OTC-AGT-008 has confirmed the legal hold exception — invoice CRN-2026-AX-0005 is under legal hold REF-LEGAL-2026-047. Your job is to:

1. Call pull_contract_pricing_schedule to confirm the pricing discrepancy
2. Call calculate_systemic_exposure excluding the held invoice amount
3. Call validate_erp_price_list and generate the ERP correction request

\`\`\`json
{"status":"EXPOSURE_QUANTIFIED_EXCLUDING_HOLD","totalCustomers":4,"totalInvoices":122,"heldInvoices":1,"adjustedExposure":140400,"erpCorrectionRequest":"CR-2026-PL-0047","legalHoldCarveOut":24900}
\`\`\``,

    agent006: `You are the Billing & Collections Agent (OTC-AGT-006) for NovaTech Industries.

Legal hold confirmed on CRN-2026-AX-0005. You must:
1. Call recommend_bulk_resolution for the adjusted credit plan (122 invoices, excluding held invoice)
2. Confirm Legal escalation for CRN-2026-AX-0005
3. Proceed with credits for all 122 eligible invoices

\`\`\`json
{"status":"RESOLUTION_PARTIAL","creditsIssued":122,"legalHoldExcluded":1,"holdInvoice":"CRN-2026-AX-0005","holdRef":"REF-LEGAL-2026-047","totalCreditAmount":140400,"legalEscalationCreated":true,"estimatedLegalClearance":"2026-04-15"}
\`\`\``,

    completeMsg: "Legal hold exception handled — 122 invoices credited ($140.4K). Invoice CRN-2026-AX-0005 routed to Legal (REF-LEGAL-2026-047). Traces available.",
  },

  "erp-fail": {
    label: "Exception: ERP Price List Validation Failure",
    agent008: `You are the Dispute Resolution Agent (OTC-AGT-008) for NovaTech Industries.

Run the standard dispute analysis for Apex Industries (12 disputes, $380K). Focus on confirming the pricing root cause and preparing the handoff to OTC-AGT-011 for the ERP correction.

1. Call get_customer_dispute_queue
2. Call analyze_dispute_patterns
3. Call classify_dispute_root_cause
4. Call check_legal_hold_status

\`\`\`json
{"status":"SYSTEMIC_CONFIRMED","customer":"Apex Industries","disputes":12,"totalDisputed":380000,"rootCause":"PRICE_LIST_ACTIVATION_ERROR","contract":"MSA-2025-1104","priceListError":"PL-2024-C","overchargePct":4.7,"handoffToAgent011":true}
\`\`\``,

    agent011: `You are the Contract & Pricing Compliance Agent (OTC-AGT-011) for NovaTech Industries.

OTC-AGT-008 confirmed the root cause. Run the systemic scan, then attempt the ERP price list correction — but be aware: the ERP validation may fail due to open orders referencing PL-2024-C.

1. Call pull_contract_pricing_schedule
2. Call scan_invoices_for_overcharge
3. Call identify_affected_customers
4. Call calculate_systemic_exposure
5. Call validate_erp_price_list
6. Call generate_erp_correction_request — if validation fails, document the failure and the required manual resolution steps

\`\`\`json
{"status":"EXPOSURE_QUANTIFIED_ERP_BLOCKED","totalCustomers":4,"totalInvoices":123,"totalOvercharge":165300,"erpCorrectionRequest":"CR-2026-PL-0047","erpValidationStatus":"FAILED","erpFailureReason":"8 open orders reference PL-2024-C — manual order re-pricing required before price list switch","openOrdersBlocking":8,"estimatedResolutionDays":3,"handoffToAgent006":true}
\`\`\``,

    agent006: `You are the Billing & Collections Agent (OTC-AGT-006) for NovaTech Industries.

ERP price list correction has failed validation — 8 open orders reference PL-2024-C. Credits can still be issued for completed invoices. ERP correction will require manual order re-pricing (3 business days).

1. Call recommend_bulk_resolution — credits for completed invoices are unaffected by the ERP validation failure
2. Document ERP correction is in manual resolution (CR-2026-PL-0047, blocked by open orders)
3. Confirm interim protection: apply correct rates manually for the 8 open orders pending CR approval

\`\`\`json
{"status":"RESOLUTION_COMPLETE_ERP_PENDING","creditsIssued":122,"totalCreditAmount":140400,"erpCorrectionStatus":"MANUAL_REQUIRED","openOrdersBlocking":8,"erpResolutionDays":3,"erpCorrectionRef":"CR-2026-PL-0047","interimManualPricing":true}
\`\`\``,

    completeMsg: "Exception scenario: ERP validation failed (8 open orders blocking). Credits issued for completed invoices. ERP correction routed to manual process. Traces available.",
  },
};

// ─── SSE Live-Run Handler ─────────────────────────────────────────────────────
export async function otcDisputeLiveRunHandler(req: Request, res: Response): Promise<void> {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  const scenarioKey = ((req.query.scenario as string) || "happy") as DisputeScenario;
  const scenarioDef = SCENARIO_PROMPTS[scenarioKey] ?? SCENARIO_PROMPTS.happy;

  let clientDisconnected = false;
  req.on("close", () => { clientDisconnected = true; });

  const keepalive = setInterval(() => {
    if (clientDisconnected) { clearInterval(keepalive); return; }
    try { res.write(": keepalive\n\n"); } catch { clearInterval(keepalive); }
  }, 15_000);

  sse(res, "run_start", {
    message: `Dispute Resolution Intelligence pipeline initializing — 3 agents (OTC-AGT-008, 011, 006) | Scenario: ${scenarioDef.label}`,
  });

  try {
    await ensureOtcDisputeAgents();
    sse(res, "setup", { message: "OTC dispute agents and MCP servers verified" });

    const pipeline: { name: string; code: string; prompt: string }[] = [
      { name: OTC_AGT_008_NAME, code: "OTC-AGT-008", prompt: scenarioDef.agent008 },
      { name: OTC_AGT_011_NAME, code: "OTC-AGT-011", prompt: scenarioDef.agent011 },
      { name: OTC_AGT_006_NAME, code: "OTC-AGT-006", prompt: scenarioDef.agent006 },
    ];

    const resultSummaries: Record<string, any> = {};

    for (const step of pipeline) {
      if (clientDisconnected) break;

      const agentId = _agentIdByName[step.name];
      if (!agentId) {
        sse(res, "error", { message: `Agent not found: ${step.name}. Run provisioning script first.` });
        clearInterval(keepalive);
        res.end();
        return;
      }

      const agentDef  = OTC_DISPUTE_AGENT_DEFS.find(d => d.name === step.name);
      const mcpId     = agentDef ? _mcpIdByName[agentDef.mcpServerName] : "";
      const deploymentId = await _ensureDeployment(agentId, step.name, mcpId);

      sse(res, "agent_start", { agentId, agentName: step.name, agentCode: step.code, deploymentId });

      await stopAgentRuntime(deploymentId).catch(() => {});
      await new Promise(r => setTimeout(r, 300));

      const toolEventHandler = (ev: any) => {
        if (ev.agentId !== agentId && ev.deploymentId !== deploymentId) return;
        if (ev.type === "tool_call_result") {
          sse(res, "agent_event", {
            type:      "tool_call_result",
            agentId,
            agentName: step.name,
            success:   ev.success,
            data: {
              tool:        ev.toolName,
              recordCount: ev.recordCount,
              error:       ev.error,
            },
          });
        } else if (ev.type === "llm_response") {
          sse(res, "agent_event", {
            type:      "llm_response",
            agentId,
            agentName: step.name,
            data:      { message: "Agent reasoning…" },
          });
        }
      };

      runtimeEvents.on("agent_execution", toolEventHandler);

      let runSuccess = false;
      let resultText = "";

      try {
        const result = await runAgentOnce(deploymentId, step.prompt);
        runSuccess = result.success;
        resultText = result.message || "";
      } catch (err: any) {
        runSuccess = false;
        resultText = err?.message || "Agent run failed";
      } finally {
        runtimeEvents.off("agent_execution", toolEventHandler);
      }

      const parsed = extractJson(resultText);
      if (parsed) resultSummaries[step.code] = parsed;

      await storage.updateDeployment(deploymentId, {
        status:        runSuccess ? "deployed" : "failed",
        deployedAt:    new Date(),
        resultSummary: parsed || { rawOutput: resultText.slice(0, 500) },
      }).catch(() => {});

      sse(res, "agent_complete", {
        agentId,
        agentName:     step.name,
        agentCode:     step.code,
        success:       runSuccess,
        resultSummary: parsed,
      });

      if (!clientDisconnected) await new Promise(r => setTimeout(r, 500));
    }

    clearInterval(keepalive);
    sse(res, "run_complete", {
      message:   scenarioDef.completeMsg,
      scenario:  scenarioKey,
      summaries: resultSummaries,
    });
  } catch (err: any) {
    clearInterval(keepalive);
    sse(res, "error", { message: err?.message || "Pipeline error" });
  } finally {
    res.end();
  }
}

// ─── Agent runs for pipeline header ──────────────────────────────────────────
export async function getOtcDisputeAgentRuns(req: Request, res: Response): Promise<void> {
  try {
    await _refreshCaches();
    const agents = [
      { name: OTC_AGT_008_NAME, code: "OTC-AGT-008", step: 1, label: "Dispute Pattern & Root Cause Analysis" },
      { name: OTC_AGT_011_NAME, code: "OTC-AGT-011", step: 2, label: "Contract Compliance & Systemic Exposure" },
      { name: OTC_AGT_006_NAME, code: "OTC-AGT-006", step: 3, label: "Bulk Credit Resolution & ERP Correction" },
    ];

    const runs = await Promise.all(agents.map(async a => {
      const agentId = _agentIdByName[a.name];
      const deps = agentId ? await storage.getDeploymentsByAgentId(agentId).catch((): any[] => []) : [];
      const dep = deps[0];
      return {
        agentId:       agentId || null,
        agentCode:     a.code,
        agentName:     a.name,
        step:          a.step,
        label:         a.label,
        agentStatus:   "active",
        runStatus:     dep?.status || "idle",
        triggerType:   "on_demand",
        completedAt:   dep?.deployedAt || null,
        resultSummary: dep?.resultSummary || null,
        traceUrl:      agentId ? `/agents/${agentId}` : null,
      };
    }));

    res.json({ agents: runs, scenario: req.query.scenario || "happy" });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
}

// ─── Reset demo ───────────────────────────────────────────────────────────────
export async function resetOtcDisputeDemo(_req: Request, res: Response): Promise<void> {
  try {
    _setupDone = false;
    Object.keys(_deployIdByAgent).forEach(k => delete _deployIdByAgent[k]);

    for (const name of [OTC_AGT_008_NAME, OTC_AGT_011_NAME, OTC_AGT_006_NAME]) {
      const agentId = _agentIdByName[name];
      if (!agentId) continue;
      const deps = await storage.getDeploymentsByAgentId(agentId).catch((): any[] => []);
      for (const dep of deps) {
        await storage.updateDeployment(dep.id, {
          status:        "pending",
          deployedAt:    null as any,
          resultSummary: null as any,
        }).catch(() => {});
      }
    }
    res.json({ success: true, message: "Dispute demo reset — all agent runs cleared" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
}
