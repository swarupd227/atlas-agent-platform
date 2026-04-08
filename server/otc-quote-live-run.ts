import { type Request, type Response } from "express";
import { storage } from "./storage";
import { runAgentOnce, stopAgentRuntime, isRuntimeActive, runtimeEvents } from "./agent-runtime";

// ─── Agent names (as created in the system) ───────────────────────────────
const OTC_AGT_001_NAME = "Quote & Configuration Agent";
const OTC_AGT_011_NAME = "Contract & Pricing Compliance Agent";

// ─── 4 Pipeline Step Definitions ─────────────────────────────────────────
const OTC_QUOTE_PIPELINE_STEPS = [
  {
    role: "rfq_intake",
    label: "RFQ Parsing & Customer Context",
    agentName: OTC_AGT_001_NAME,
    maxIterations: 3,
    taskPrompt: `You are the NovaTech Industries Quote & Configuration Agent (OTC-AGT-001). You are working alongside the Contract & Pricing Compliance Agent (OTC-AGT-011) to process an RFQ from Meridian Manufacturing.

CUSTOMER: Meridian Manufacturing (Tier 1 — $28.4M annual spend)
CONTRACT: MSA-2024-0892 (expires December 2026)
CONTRACT DISCOUNT SCHEDULE:
  - Standard: 8% (rep authority)
  - $30M+ YTD: 10% (regional authority)
  - $35M+ YTD: 12% (VP authority)
CURRENT YTD SPEND: $21.7M (projected $29M — below 12% tier by $6M)

RFQ SUMMARY:
- 47 SKUs across 3 product families: Turbine Assemblies, Filtration Systems, Control Electronics
- Total list price: $487,200
- Customer requesting: 12% discount (effective $428,736)
- Delivery: 4 plants (Detroit, Houston, Phoenix, Portland)
- Timeline: Q3 FY26 (by September 30, 2026)

Parse the RFQ, extract all line items, confirm customer context, and flag the pricing authority gap. Identify that OTC-AGT-011 should validate the discount against contract MSA-2024-0892.`,
  },
  {
    role: "product_config",
    label: "Product Configuration & Compatibility",
    agentName: OTC_AGT_001_NAME,
    maxIterations: 4,
    taskPrompt: `You are the NovaTech Industries Quote & Configuration Agent (OTC-AGT-001). Configure the 47-SKU equipment package for Meridian Manufacturing.

PRIOR CONTEXT: RFQ parsed — 47 SKUs identified across Turbine Assemblies (12 line items), Filtration Systems (30 line items), and Control Electronics (5 line items). Total list: $487,200.

CONFIGURATION TASKS:
1. COMPATIBILITY CHECK: Run compatibility engine across all 47 SKUs.
   - Flag: CE-CX440-STD is incompatible with TX-7200 firmware v3.2+
   - Recommendation: Substitute CE-CX440-STD → CE-CX450-ENH (fully compatible, same price, 6-week vs 8-week lead time)
   - Result: 45/47 items natively compatible, 2 substitutions recommended

2. BUNDLE IDENTIFICATION: Turbine Assemblies + Series K Filtration qualifies for Package Discount P-220 (additional 2% off list after volume discount).

3. MOQ VALIDATION: All 47 line items meet minimum order quantity thresholds.

4. AI RECOMMENDATION: Add FK-ACS-SPR (Filter Cartridge Spare Set, $950) to increase contract value by $950 and reduce future re-order friction. This brings total SKUs to 48.

5. LEAD TIME: CX-450-ENH (substituted controller) has 6-week lead time. Order placement by April 15, 2026 required for Q3 delivery.

Configure the full bundle and report compatibility results.`,
  },
  {
    role: "pricing_optimisation",
    label: "Pricing & Discount Optimisation",
    agentName: OTC_AGT_011_NAME,
    maxIterations: 4,
    taskPrompt: `You are the NovaTech Industries Contract & Pricing Compliance Agent (OTC-AGT-011). Apply waterfall pricing to the configured 48-SKU Meridian Manufacturing quote.

PRIOR CONTEXT: 48 SKUs configured (47 original + 1 AI-recommended spare). Total list price: $487,200.

CONTRACT: MSA-2024-0892 — Meridian is at $21.7M YTD, projected $29M — NOT at the 12% tier ($35M).

PRICING WATERFALL:
1. List Price: $487,200
2. Volume Discount: 10% (Meridian Tier 1 standard volume) → -$48,720 → Subtotal: $438,480
3. Bundle Discount P-220: 2% off (Turbine + Filtration bundle) → -$8,769 → Net: $429,711
4. Contract Pricing Adjustment: $0 (already at applicable tier)
5. EFFECTIVE DISCOUNT: ($487,200 - $429,711) / $487,200 = 11.8%

COMPARISON:
- Customer Requested: $428,736 (12% off list)
- Atlas Optimised: $429,711 (effective 11.8% via bundle mechanism)
- Delta: $975 in NovaTech's favour

APPROVAL ROUTING:
- 11.8% effective discount EXCEEDS rep authority (8%)
- 11.8% is WITHIN Regional VP authority (15%)
- Recommend routing to: Sarah Chen, Regional VP
- Approval authority: Regional VP (no board escalation required)
- ASC 606 / Robinson-Patman: pricing consistent with other Tier 1 customers at comparable volume

ROBINSON-PATMAN: Discount justified by volume and competitive conditions. Document for audit trail.

Validate pricing, generate approval recommendation, and confirm ASC 606 compliance.`,
  },
  {
    role: "quote_generation",
    label: "Quote Document Generation",
    agentName: OTC_AGT_001_NAME,
    maxIterations: 3,
    taskPrompt: `You are the NovaTech Industries Quote & Configuration Agent (OTC-AGT-001). Generate the formal quote document for Meridian Manufacturing.

PRIOR CONTEXT: Pricing approved at $429,711 (11.8% effective discount) by Sarah Chen, Regional VP. All 48 SKUs configured and compatible.

QUOTE DOCUMENT Q-78432:
- Customer: Meridian Manufacturing
- Contact: Jim Davis, Procurement Director
- Quote Number: Q-78432
- Issue Date: April 8, 2026
- Valid Until: May 8, 2026 (30 days)
- Total: $429,711 (11.8% effective discount off $487,200 list)
- Approval: APPROVED — Sarah Chen, Regional VP

CONTENT SECTIONS:
1. Cover Page with quote number, customer, and validity
2. Executive Summary: pricing, key terms, delivery overview
3. Line Items: all 48 SKUs with unit price, qty, extended, discount%, margin%
4. Delivery Schedule: 4-plant split
   - Detroit, MI: 18 SKUs, $172,400, August 15, 2026
   - Houston, TX: 12 SKUs, $98,200, August 29, 2026
   - Phoenix, AZ: 10 SKUs, $86,700, September 12, 2026
   - Portland, OR: 8 SKUs, $72,411, September 26, 2026
5. Terms & Conditions (standard NovaTech B2B)
6. Signature Block

Generate a comprehensive, professional quote document ready for delivery to Jim Davis at Meridian Manufacturing.`,
  },
];

// ─── Agent & Deployment lookup ───────────────────────────────────────────────
const _otcAgentIdByName: Record<string, string> = {};
const _otcDeploymentIdByRole: Record<string, string> = {};

async function ensureOtcQuoteAgents(): Promise<void> {
  const allAgents = await storage.getAgents().catch(() => [] as any[]);
  const agentNames = [OTC_AGT_001_NAME, OTC_AGT_011_NAME];
  for (const name of agentNames) {
    const agent = allAgents.find((a: any) => a.name === name);
    if (agent) _otcAgentIdByName[name] = (agent as any).id;
  }
  const found = agentNames.filter(n => _otcAgentIdByName[n]);
  console.log(`[otc-quote-live] Found ${found.length}/${agentNames.length} OTC agents:`, found);
}

async function ensureOtcDeployment(agentId: string, agentName: string, role: string): Promise<string> {
  const deps = await storage.getDeploymentsByAgentId(agentId).catch(() => [] as any[]);
  let deployment = deps[0];

  if (!deployment) {
    deployment = await storage.createDeployment({
      agentId,
      agentName,
      environment: "production",
      status: "pending",
      version: "1.0.0",
      rolloutStrategy: "canary",
      canaryPercent: 100,
      pipelineComplete: true,
      deployedAt: new Date(),
    });
  } else if (deployment.status === "deployed") {
    await storage.updateDeployment(deployment.id, { status: "pending" });
  }

  _otcDeploymentIdByRole[role] = deployment.id;
  return deployment.id;
}

// ─── SSE Live Run Handler ────────────────────────────────────────────────────
export async function otcQuoteLiveRunHandler(req: Request, res: Response): Promise<void> {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  const sendEvent = (eventType: string, payload: object) => {
    try { res.write(`event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`); } catch {}
  };

  let aborted = false;
  const keepaliveTimer = setInterval(() => {
    if (aborted) { clearInterval(keepaliveTimer); return; }
    try { res.write(": keepalive\n\n"); } catch { clearInterval(keepaliveTimer); }
  }, 15_000);

  let currentAgentName = "unknown";
  const otcDeploymentIds = new Set<string>();

  const onRuntimeEvent = (evt: { deploymentId: string; agentId: string; runId: string; result: any }) => {
    if (aborted) return;
    if (!otcDeploymentIds.has(evt.deploymentId)) return;

    const steps: any[] = evt.result?.steps ?? [];
    const toolCallSteps = steps.filter((s: any) => s.type === "api_call");

    if (toolCallSteps.length > 0) {
      for (const step of toolCallSteps) {
        const tool = step.mcpTool || step.name || "catalog_lookup";
        const success = step.status === "completed" || step.status === "passed";
        sendEvent("agent_event", {
          agentName: currentAgentName,
          type: "tool_call_result",
          tool,
          data: { tool, success, serverName: step.mcpServer || "NovaTech CPQ Engine" },
          success,
        });
      }
    } else {
      sendEvent("agent_event", {
        agentName: currentAgentName,
        type: "analysis_step",
        data: { steps: steps.length, success: evt.result?.success },
        success: evt.result?.success,
      });
    }
  };

  runtimeEvents.on("agent_execution", onRuntimeEvent);
  req.on("close", () => {
    aborted = true;
    clearInterval(keepaliveTimer);
    runtimeEvents.off("agent_execution", onRuntimeEvent);
  });

  try {
    sendEvent("run_start", { message: "Starting Meridian Manufacturing Quote Configuration — 47 SKUs, 4 plants…" });

    sendEvent("setup", { message: "Locating OTC-AGT-001 and OTC-AGT-011 agents…" });
    await ensureOtcQuoteAgents();

    const agt001Id = _otcAgentIdByName[OTC_AGT_001_NAME];
    const agt011Id = _otcAgentIdByName[OTC_AGT_011_NAME];

    sendEvent("setup", {
      message: `Agents ready — ${agt001Id ? "OTC-AGT-001 ✓" : "OTC-AGT-001 ✗"} ${agt011Id ? "OTC-AGT-011 ✓" : "OTC-AGT-011 ✗"}`,
    });

    const priorContext: Record<string, string> = {};

    for (const step of OTC_QUOTE_PIPELINE_STEPS) {
      if (aborted) break;

      const agentName = step.agentName;
      const agentId = _otcAgentIdByName[agentName];

      if (!agentId) {
        // Fallback: emit static events so the demo still progresses
        sendEvent("agent_event", {
          agentName: step.agentName,
          type: "agent_skipped",
          data: { role: step.role, reason: `Agent "${agentName}" not found — using computed fallback` },
          success: false,
        });

        // Simulate realistic timing for fallback
        await new Promise(r => setTimeout(r, 800));

        sendEvent("agent_complete", {
          role: step.role,
          agentName: step.agentName,
          agentId: null,
          success: true,
          message: getFallbackMessage(step.role),
          resultSummary: { role: step.role, usedFallback: true },
        });

        if (!aborted) await new Promise(r => setTimeout(r, 400));
        continue;
      }

      currentAgentName = agentName;

      const deploymentId = await ensureOtcDeployment(agentId, agentName, step.role);
      otcDeploymentIds.add(deploymentId);

      sendEvent("agent_start", {
        agentId,
        agentName,
        role: step.role,
        label: step.label,
        deploymentId,
      });

      if (await isRuntimeActive(deploymentId).catch(() => false)) {
        await stopAgentRuntime(deploymentId).catch(() => {});
        await new Promise(r => setTimeout(r, 300));
      }

      // Inject prior step context into downstream steps
      let taskPrompt = step.taskPrompt;
      if (Object.keys(priorContext).length > 0) {
        const ctx = Object.entries(priorContext)
          .map(([r, s]) => `[Prior step — ${r}]:\n${s}`)
          .join("\n\n");
        taskPrompt = `CONTEXT FROM PRIOR STEPS:\n${ctx}\n\n---\n\n${step.taskPrompt}`;
      }

      const result = await runAgentOnce(deploymentId, taskPrompt, step.maxIterations);

      if (result.message) {
        priorContext[step.role] = result.message.slice(0, 1500);
      }

      sendEvent("agent_complete", {
        role: step.role,
        agentName,
        agentId,
        success: result.success,
        message: result.message?.slice(0, 600),
        resultSummary: { role: step.role, success: result.success },
      });

      if (!aborted) await new Promise(r => setTimeout(r, 500));
    }

    sendEvent("run_complete", {
      success: true,
      message: "Quote Q-78432 generated — $429,711 net — approved by Sarah Chen, Regional VP — ready for delivery",
      quoteNumber: "Q-78432",
      totalPrice: 429_711,
      effectiveDiscount: 11.8,
      skuCount: 48,
    });

  } catch (err: any) {
    console.error("[otc-quote-live] Error:", err?.message);
    sendEvent("error", { message: err?.message || "Quote configuration failed" });
  } finally {
    clearInterval(keepaliveTimer);
    runtimeEvents.off("agent_execution", onRuntimeEvent);
    if (!aborted) res.end();
  }
}

function getFallbackMessage(role: string): string {
  const msgs: Record<string, string> = {
    rfq_intake: "RFQ parsed — 47 SKUs identified across 3 product families. Meridian MSA-2024-0892 loaded. Pricing gap flagged: customer requesting 12% ($6M below threshold).",
    product_config: "47 SKUs configured. Compatibility engine: 45/47 native, 2 substitutions (CX-440→CX-450). Bundle P-220 unlocked. AI recommendation: +1 FK-ACS-SPR spare set. Total 48 SKUs.",
    pricing_optimisation: "Waterfall pricing applied. List $487,200 → Vol -10% → Bundle -2% → Net $429,711 (11.8%). Delta vs customer request: $975 in NovaTech favour. Approval routed: Sarah Chen, Regional VP.",
    quote_generation: "Quote Q-78432 generated. 48 SKUs, $429,711 net, 30-day validity. 4-plant delivery schedule committed (Detroit Aug 15, Houston Aug 29, Phoenix Sep 12, Portland Sep 26). APPROVED.",
  };
  return msgs[role] ?? `[Computed fallback for ${role}]`;
}
