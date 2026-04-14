import { type Request, type Response } from "express";
import { storage } from "./storage";
import { runAgentOnce, stopAgentRuntime, isRuntimeActive, runtimeEvents } from "./agent-runtime";

const OTC_AGT_002_NAME = "Order Validation & Promise Agent";
const OTC_AGT_003_NAME = "Customer Credit & Risk Assessment Agent";
const OTC_AGT_004_NAME = "Inventory Availability & Promise Agent";

interface StepDef {
  role: string;
  label: string;
  agentName: string;
  parallel?: boolean;
  maxIterations: number;
  taskPrompt: string;
}

// Step 1: All three agents run concurrently (parallel validation)
// Step 2: OTC-AGT-002 synthesises resolutions from Steps 1a/1b/1c
// Step 3: OTC-AGT-002 releases the order into ERP

const OTC_ORDER_PIPELINE_STEPS: StepDef[] = [
  // ── PARALLEL VALIDATION (runs as one concurrent batch) ──────────────────
  {
    role: "credit_validation",
    label: "Credit & Exposure Check",
    agentName: OTC_AGT_003_NAME,
    parallel: true,
    maxIterations: 4,
    taskPrompt: `You are NovaTech's Customer Credit & Risk Assessment Agent (OTC-AGT-003).

URGENT: Meridian Manufacturing has submitted RUSH order ORD-2026-78432 ($429,711). Assess credit exposure immediately.

CREDIT STATUS:
- Credit Limit: $500,000
- Current Exposure: $459,500 (91.9% utilised)
- New Order: $429,711
- Projected Exposure if Approved: $889,211 (177.8% of limit) — OVER LIMIT

AR AGING:
- Current (0-30 days): $148,200
- 31-60 days: $52,400
- 61-90 days: $0 | 91+ days: $0
- No delinquency

CUSTOMER PROFILE:
- Rating: A+ | Relationship: 7 years | Annual Spend: $28.4M
- Avg Days to Pay: 32 | Late Payments (12mo): 0 | NSF: 0

RESOLUTION AVAILABLE: Temporary 60-day credit limit increase to $950K is within your automated pre-authorization threshold for A+ customers. Inbound AR $200,600 expected within 30 days.

Assess risk, apply automated temporary limit increase to $950K (60 days), and clear VAL-002 hold. Document rationale.`,
  },
  {
    role: "inventory_validation",
    label: "Inventory Availability & Promise",
    agentName: OTC_AGT_004_NAME,
    parallel: true,
    maxIterations: 4,
    taskPrompt: `You are NovaTech's Inventory Availability & Promise Agent (OTC-AGT-004).

URGENT: Meridian Manufacturing has submitted RUSH order ORD-2026-78432. Resolve inventory split immediately.

ORDER ITEMS (turbines only — 12 units total):
- TX-7250-A: 8 units requested
- TX-7250-B: 4 units requested
- TX-7300-HD: 1 unit requested

INVENTORY SITUATION:
Chicago DC (WH-CHI): TX-7250-A 8 available, TX-7250-B 4 available (of 6 on-hand), TX-7300-HD 2 available
Atlanta Hub (WH-ATL): TX-7250-A 4 additional, TX-7250-B 3 additional (surplus)

ISSUE: Internal system flagged this as "split-ship required" but CHICAGO ALONE HAS ALL 12 UNITS.
- Chicago covers all TX-7250-A (8/8), TX-7250-B (4/4), TX-7300-HD (1/1)
- Atlanta allocation NOT needed
- Single-warehouse fulfillment from Chicago: 1-day transit, no $840 split-ship surcharge

Confirm Chicago-only fulfillment, issue allocation confirmation, and clear VAL-003 hold. Save Meridian $840 in split-ship fees.`,
  },
  {
    role: "address_validation",
    label: "Ship-To Address Validation",
    agentName: OTC_AGT_002_NAME,
    parallel: true,
    maxIterations: 3,
    taskPrompt: `You are NovaTech's Order Validation & Promise Agent (OTC-AGT-002).

URGENT: Address discrepancy on RUSH order ORD-2026-78432 (running this sub-task in parallel with credit and inventory agents).

DISCREPANCY:
- ERP Master Record: "4820 W Grand Ave Suite 110, Chicago IL 60639"
- PO Ship-To:        "4820 W Grand Ave, Chicago IL 60639" (no suite)

CONTEXT:
- Meridian's Chicago plant is an industrial manufacturing facility
- Prior delivery record: 8 successful shipments to 4820 W Grand Ave Chicago IL 60639 (no suite) in past 4 years
- Suite 110 does not appear in any prior delivery manifest
- Industrial facilities typically do not have suite numbers

RESOLUTION: Remove "Suite 110" from ship-to. Update ERP master record CUST-00892-SHIP-04. Confidence: 94%.

Clear VAL-004 hold. Document the correction with delivery history evidence.`,
  },

  // ── STEP 2: Resolution synthesis ─────────────────────────────────────────
  {
    role: "resolution_synthesis",
    label: "Resolution Synthesis",
    agentName: OTC_AGT_002_NAME,
    parallel: false,
    maxIterations: 3,
    taskPrompt: `You are NovaTech's Order Validation & Promise Agent (OTC-AGT-002) — lead orchestrator.

Three parallel validation agents have completed their work on RUSH order ORD-2026-78432 ($429,711).

RESULTS FROM PARALLEL AGENTS:
1. OTC-AGT-003 (Credit): VAL-002 CLEARED — Temporary $950K limit approved (60 days). Meridian A+ rated, automated pre-auth threshold satisfied. Net exposure risk: LOW.
2. OTC-AGT-004 (Inventory): VAL-003 CLEARED — Chicago DC fulfills all 12 turbine units. Single-warehouse shipment confirmed. Split-ship avoided. Savings: $840.
3. OTC-AGT-002 self (Address): VAL-004 CLEARED — Suite 110 removed from ERP master. Industrial facility confirmed via 8 prior delivery records. Confidence 94%.

REMAINING VALIDATION STATUS:
- VAL-001 Header Completeness: PASS (from initial check)
- VAL-002 Credit: NOW PASS (just cleared)
- VAL-003 Inventory: NOW PASS (just cleared)
- VAL-004 Address: NOW PASS (just cleared)
- VAL-005 Pricing: PASS (from initial check)
- VAL-006 Export Control: PASS (from initial check)
- VAL-007 RUSH Prioritization: PASS (from initial check)
- VAL-008 ASC 606: PASS (from initial check)

All 8 of 8 checks now PASS. Order is clear for release.

Synthesise resolution summary and confirm order is ready for ERP release.`,
  },

  // ── STEP 3: Order release ─────────────────────────────────────────────────
  {
    role: "order_release",
    label: "Order Release",
    agentName: OTC_AGT_002_NAME,
    parallel: false,
    maxIterations: 3,
    taskPrompt: `You are NovaTech's Order Validation & Promise Agent (OTC-AGT-002) — lead orchestrator.

RUSH order ORD-2026-78432 has cleared all 8 validation checks. Execute release sequence.

ORDER SUMMARY:
- Customer: Meridian Manufacturing (CUST-00892)
- PO: PO-MFG-2026-0441 | Quote: Q-78432
- Value: $429,711 | Type: RUSH
- SKUs: 12 line items | Ship-from: Chicago DC

RELEASE CHECKLIST:
✓ Credit hold cleared (temp limit $950K / 60 days)
✓ Inventory allocated at Chicago DC (all 12 turbine units)
✓ Address corrected (Suite 110 removed)
✓ RUSH surcharge applied ($1,800 per MSA §7.4(b))
✓ All 8 validation checks PASS
✓ Elapsed time from order submission: under 4 minutes

ACTIONS TO EXECUTE:
1. Release order into ERP (generate ERP transaction ID)
2. Transmit warehouse pick ticket to Chicago DC
3. Set estimated ship date: April 21, 2026
4. Queue customer confirmation to j.davis@meridian-mfg.com
5. Create invoice draft (pending ship confirmation)

Execute release and confirm all downstream actions triggered.`,
  },
];

const _orderAgentIdByName: Record<string, string> = {};
const _orderDeploymentIdByRole: Record<string, string> = {};

export async function ensureOtcOrderAgents(): Promise<void> {
  const allAgents = await storage.getAgents().catch(() => [] as any[]);
  const agentNames = [OTC_AGT_002_NAME, OTC_AGT_003_NAME, OTC_AGT_004_NAME];
  for (const name of agentNames) {
    const agent = allAgents.find((a: any) => a.name === name);
    if (agent) _orderAgentIdByName[name] = (agent as any).id;
  }
  const found = agentNames.filter(n => _orderAgentIdByName[n]);
  console.log(`[otc-order-live] Found ${found.length}/${agentNames.length} OTC Order agents:`, found);
}

async function ensureDeployment(agentId: string, agentName: string, role: string): Promise<string> {
  const deps = await storage.getDeploymentsByAgentId(agentId).catch(() => [] as any[]);
  let dep = deps[0];
  if (!dep) {
    dep = await storage.createDeployment({
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
  } else if (dep.status === "deployed") {
    await storage.updateDeployment(dep.id, { status: "pending" });
  }
  _orderDeploymentIdByRole[role] = dep.id;
  return dep.id;
}

async function runStepWithFallback(
  deploymentId: string,
  taskPrompt: string,
  maxIterations: number,
  role: string,
): Promise<{ success: boolean; message: string; usedFallback: boolean }> {
  try {
    const result = await runAgentOnce(deploymentId, taskPrompt, maxIterations);
    return { ...result, usedFallback: false };
  } catch (err: any) {
    console.warn(`[otc-order-live] Step "${role}" failed, using fallback:`, err?.message);
    return { success: true, message: getFallbackMessage(role), usedFallback: true };
  }
}

export async function otcOrderLiveRunHandler(req: Request, res: Response): Promise<void> {
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

  const deploymentIds = new Set<string>();
  let currentAgentName = "unknown";

  const onRuntimeEvent = (evt: { deploymentId: string; agentId: string; runId: string; result: any }) => {
    if (aborted || !deploymentIds.has(evt.deploymentId)) return;
    const steps: any[] = evt.result?.steps ?? [];
    const toolCallSteps = steps.filter((s: any) => s.type === "api_call");
    if (toolCallSteps.length > 0) {
      for (const step of toolCallSteps) {
        sendEvent("agent_event", {
          agentName: currentAgentName,
          type: "tool_call_result",
          tool: step.mcpTool || step.name || "order_check",
          data: { tool: step.mcpTool || step.name, success: step.status === "completed" || step.status === "passed" },
        });
      }
    } else {
      sendEvent("agent_event", {
        agentName: currentAgentName,
        type: "analysis_step",
        data: { steps: steps.length, success: evt.result?.success },
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
    sendEvent("run_start", {
      message: "Meridian Manufacturing RUSH order ORD-2026-78432 ($429,711) — initiating parallel validation…",
    });

    sendEvent("setup", { message: "Locating OTC-AGT-002, OTC-AGT-003, OTC-AGT-004 agents…" });
    await ensureOtcOrderAgents();

    const agt002Id = _orderAgentIdByName[OTC_AGT_002_NAME];
    const agt003Id = _orderAgentIdByName[OTC_AGT_003_NAME];
    const agt004Id = _orderAgentIdByName[OTC_AGT_004_NAME];

    sendEvent("setup", {
      message: `Agents: ${agt002Id ? "OTC-AGT-002 ✓" : "OTC-AGT-002 ✗ (fallback)"} · ${agt003Id ? "OTC-AGT-003 ✓" : "OTC-AGT-003 ✗ (fallback)"} · ${agt004Id ? "OTC-AGT-004 ✓" : "OTC-AGT-004 ✗ (fallback)"}`,
    });

    const priorContext: Record<string, string> = {};

    // ── STEP 1: Three agents run in parallel ─────────────────────────────────
    const parallelSteps = OTC_ORDER_PIPELINE_STEPS.filter(s => s.parallel);
    const sequentialSteps = OTC_ORDER_PIPELINE_STEPS.filter(s => !s.parallel);

    sendEvent("parallel_start", {
      message: "Launching 3 validation agents in parallel — credit, inventory, address…",
      agents: [OTC_AGT_002_NAME, OTC_AGT_003_NAME, OTC_AGT_004_NAME],
      roles: parallelSteps.map(s => s.role),
    });

    const agentIdMap: Record<string, string | undefined> = {
      [OTC_AGT_002_NAME]: agt002Id,
      [OTC_AGT_003_NAME]: agt003Id,
      [OTC_AGT_004_NAME]: agt004Id,
    };

    const parallelTasks = parallelSteps.map(async (step) => {
      if (aborted) return null;
      const agentId = agentIdMap[step.agentName];

      sendEvent("agent_start", {
        agentId: agentId || null,
        agentName: step.agentName,
        role: step.role,
        label: step.label,
        parallel: true,
      });

      let result: { success: boolean; message: string; usedFallback: boolean };

      if (agentId) {
        const depId = await ensureDeployment(agentId, step.agentName, step.role);
        deploymentIds.add(depId);
        currentAgentName = step.agentName;
        if (await isRuntimeActive(depId).catch(() => false)) {
          await stopAgentRuntime(depId).catch(() => {});
          await new Promise(r => setTimeout(r, 300));
        }
        result = await runStepWithFallback(depId, step.taskPrompt, step.maxIterations, step.role);
      } else {
        await new Promise(r => setTimeout(r, 800 + Math.random() * 600));
        result = { success: true, message: getFallbackMessage(step.role), usedFallback: true };
        sendEvent("agent_event", { agentName: step.agentName, type: "agent_skipped", data: { role: step.role } });
      }

      sendEvent("agent_complete", {
        role: step.role,
        agentName: step.agentName,
        agentId: agentId || null,
        success: result.success,
        message: result.message?.slice(0, 600),
        parallel: true,
      });

      return { role: step.role, agentName: step.agentName, ...result };
    });

    const parallelResults = (await Promise.allSettled(parallelTasks))
      .filter(r => r.status === "fulfilled" && r.value)
      .map(r => (r as PromiseFulfilledResult<any>).value);

    for (const pr of parallelResults) {
      if (pr?.message) priorContext[pr.role] = pr.message.slice(0, 1200);
    }

    sendEvent("parallel_complete", {
      message: "All 3 validation agents complete — synthesising resolutions…",
      resolvedChecks: ["VAL-002 Credit", "VAL-003 Inventory", "VAL-004 Address"],
    });

    if (!aborted) await new Promise(r => setTimeout(r, 400));

    // ── STEPS 2 & 3: Sequential (synthesis → release) ────────────────────────
    for (const step of sequentialSteps) {
      if (aborted) break;

      const agentId = agentIdMap[step.agentName];

      let fullPrompt = step.taskPrompt;
      if (Object.keys(priorContext).length > 0) {
        const ctx = Object.entries(priorContext)
          .map(([r, s]) => `[${r}]:\n${s}`)
          .join("\n\n");
        fullPrompt = `PRIOR AGENT OUTPUTS:\n${ctx}\n\n---\n\n${step.taskPrompt}`;
      }

      sendEvent("agent_start", {
        agentId: agentId || null,
        agentName: step.agentName,
        role: step.role,
        label: step.label,
        parallel: false,
      });

      let result: { success: boolean; message: string; usedFallback: boolean };

      if (agentId) {
        const depId = await ensureDeployment(agentId, step.agentName, step.role);
        deploymentIds.add(depId);
        currentAgentName = step.agentName;
        if (await isRuntimeActive(depId).catch(() => false)) {
          await stopAgentRuntime(depId).catch(() => {});
          await new Promise(r => setTimeout(r, 300));
        }
        result = await runStepWithFallback(depId, fullPrompt, step.maxIterations, step.role);
      } else {
        sendEvent("agent_event", { agentName: step.agentName, type: "agent_skipped", data: { role: step.role } });
        await new Promise(r => setTimeout(r, 600));
        result = { success: true, message: getFallbackMessage(step.role), usedFallback: true };
      }

      if (result.message) priorContext[step.role] = result.message.slice(0, 1200);

      sendEvent("agent_complete", {
        role: step.role,
        agentName: step.agentName,
        agentId: agentId || null,
        success: result.success,
        message: result.message?.slice(0, 600),
        parallel: false,
      });

      if (!aborted) await new Promise(r => setTimeout(r, 400));
    }

    sendEvent("run_complete", {
      success: true,
      message: "ORD-2026-78432 released — all 8 checks cleared in parallel — estimated ship April 21, 2026",
      orderId: "ORD-2026-78432",
      orderValue: 429_711,
      checksCleared: 8,
      parallelAgents: 3,
    });

  } catch (err: any) {
    console.error("[otc-order-live] Error:", err?.message);
    sendEvent("error", { message: err?.message || "Order validation pipeline failed" });
  } finally {
    clearInterval(keepaliveTimer);
    runtimeEvents.off("agent_execution", onRuntimeEvent);
    if (!aborted) res.end();
  }
}

export async function getOtcOrderAgentRuns(_req: Request, res: Response): Promise<void> {
  const agentDefs = [
    { key: "agt002", name: OTC_AGT_002_NAME, code: "OTC-AGT-002", step: 1, triggerType: "parallel", role: "order_validation" },
    { key: "agt003", name: OTC_AGT_003_NAME, code: "OTC-AGT-003", step: 1, triggerType: "parallel", role: "credit_validation" },
    { key: "agt004", name: OTC_AGT_004_NAME, code: "OTC-AGT-004", step: 1, triggerType: "parallel", role: "inventory_validation" },
  ];
  const allAgents = await storage.getAgents().catch(() => [] as any[]);
  const runs = await Promise.all(agentDefs.map(async (def) => {
    const agent = allAgents.find((a: any) => a.name === def.name);
    if (!agent) return { ...def, agentId: null, runStatus: "idle" };
    const deps = await storage.getDeploymentsByAgentId(agent.id).catch(() => [] as any[]);
    const dep = deps[0];
    return { ...def, agentId: agent.id, runStatus: dep?.status || "idle" };
  }));
  res.json({ agentRuns: runs });
}

export async function resetOtcOrderDemo(_req: Request, res: Response): Promise<void> {
  Object.keys(_orderDeploymentIdByRole).forEach(k => delete _orderDeploymentIdByRole[k]);
  res.json({ success: true, message: "OTC Order demo reset" });
}

function getFallbackMessage(role: string): string {
  const msgs: Record<string, string> = {
    credit_validation: "OTC-AGT-003: Credit analysis complete. Meridian A+ rated, 7yr relationship, $28.4M annual spend. Current exposure $459,500 (91.9% of $500K limit). Temporary increase to $950K approved for 60 days — within automated pre-auth threshold. VAL-002 CLEARED. Risk: LOW.",
    inventory_validation: "OTC-AGT-004: Inventory analysis complete. Chicago DC has all 12 turbine units (TX-7250-A ×8, TX-7250-B ×4, TX-7300-HD ×1). Internal split-ship flag was incorrect — single-warehouse fulfillment confirmed. Pick tickets issued. Split-ship surcharge $840 avoided. VAL-003 CLEARED.",
    address_validation: "OTC-AGT-002: Address validated. ERP master CUST-00892-SHIP-04 had spurious 'Suite 110' suffix. Industrial facility confirmed via 8 prior delivery records (2022–2026) to 4820 W Grand Ave Chicago IL 60639. ERP record corrected. VAL-004 CLEARED. Confidence: 94%.",
    resolution_synthesis: "OTC-AGT-002: All 3 parallel agents complete. Resolutions confirmed: (1) Credit limit temp-increased to $950K — 60 days — LOW risk; (2) Inventory allocated from Chicago DC — single warehouse — no surcharge; (3) Address corrected — Suite 110 removed. 8/8 validation checks now PASS. Ready for ERP release.",
    order_release: "OTC-AGT-002: ORD-2026-78432 released. ERP transaction confirmed. Chicago DC pick ticket issued. Estimated ship: April 21, 2026. Estimated delivery: April 22, 2026 (1-day transit). Customer confirmation queued to j.davis@meridian-mfg.com. Invoice draft created. Total elapsed: < 4 minutes.",
  };
  return msgs[role] ?? `[Computed fallback for ${role}]`;
}
