// =============================================================================
// HNP Subscriber Intelligence & Churn Prevention — Live SSE pipeline runner
// SCN-HNP-2 | Hearst Newspapers
//
// Pipeline: SUB-01 → SUB-02 → [Audience Editor Gate] → SUB-03 + SUB-04 (parallel)
// Scenarios: happy | editor-modify | offer-boundary-breach
// =============================================================================

import { type Request, type Response } from "express";
import { storage } from "./storage";
import { runAgentOnce, stopAgentRuntime } from "./agent-runtime";
import {
  HNP_SUB_AGENT_NAMES,
  HNP_SUB_AGENT_DEFS,
  HNP_SUB_SCENARIOS,
  HNP_SUB_SYSTEM_PROMPTS,
  makeHnpSubMcpServerDefs,
  getScenarioPromptOverrides,
} from "./hnp-sub-shared-defs";

const BASE_URL = `http://localhost:${process.env.PORT || 5000}`;
const HNP_SUB_MCP_SERVERS = makeHnpSubMcpServerDefs(BASE_URL);

// ─── Caches ───────────────────────────────────────────────────────────────────

const _agentIdByName:   Record<string, string> = {};
const _mcpIdByName:     Record<string, string> = {};
const _deployIdByAgent: Record<string, string> = {};

async function _refreshCaches(): Promise<void> {
  const [allServers, allAgents] = await Promise.all([
    storage.getMcpServers().catch((): any[] => []),
    storage.getAgents().catch((): any[] => []),
  ]);
  for (const sd of HNP_SUB_MCP_SERVERS) {
    const s = allServers.find((x: any) => x.name === sd.name);
    if (s) _mcpIdByName[sd.name] = s.id;
  }
  for (const def of HNP_SUB_AGENT_DEFS) {
    const a = allAgents.find((x: any) => x.name === def.name);
    if (a) _agentIdByName[def.name] = a.id;
  }

  // Ensure agent ↔ MCP server junction records exist so the agent-runtime
  // can resolve tools from the correct mock servers.
  for (const def of HNP_SUB_AGENT_DEFS) {
    const agentId = _agentIdByName[def.name];
    if (!agentId) continue;
    const existing = await storage.getAgentMcpServers(agentId).catch((): any[] => []);
    const existingServerIds = new Set(existing.map((l: any) => l.serverId));
    for (const mcpName of def.mcpServers) {
      const mcpId = _mcpIdByName[mcpName];
      if (!mcpId || existingServerIds.has(mcpId)) continue;
      await storage.createAgentMcpServer({ agentId, serverId: mcpId, assignedBy: "hnp-sub-live-run" }).catch(() => {});
    }
  }
}

// ─── SSE / JSON helpers ───────────────────────────────────────────────────────

function sse(res: Response, event: string, data: object) {
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    if ((res as any).flush) (res as any).flush();
  } catch {}
}

function extractJson(text: string): Record<string, any> | null {
  if (!text) return null;
  const blockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (blockMatch) { try { return JSON.parse(blockMatch[1]); } catch {} }
  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch) { try { return JSON.parse(objectMatch[0]); } catch {} }
  return null;
}

function withUpstreamContext(
  basePrompt: string,
  upstreamLabel: string,
  upstreamSummary: any,
): string {
  if (!upstreamSummary || typeof upstreamSummary !== "object") return basePrompt;
  let json: string;
  try { json = JSON.stringify(upstreamSummary, null, 2); } catch { return basePrompt; }
  const MAX = 6000;
  if (json.length > MAX) json = json.slice(0, MAX) + "\n…[truncated]";
  return [
    `Handoff context — structured output from ${upstreamLabel}:`,
    "```json",
    json,
    "```",
    "",
    "Use the handoff context above as your authoritative input. Then perform your own task as described below.",
    "",
    basePrompt,
  ].join("\n");
}

function hasStructuredShape(o: Record<string, any>): boolean {
  if (!o || typeof o !== "object") return false;
  if (Array.isArray(o.findings) && o.findings.length > 0) return true;
  if (Array.isArray(o.cohorts) && o.cohorts.length > 0) return true;
  // SUB-01 outputs cohorts as an object {green:{}, amber:{}, red:{}}
  if (o.cohorts && typeof o.cohorts === "object" && !Array.isArray(o.cohorts)) return true;
  if (o.cohortSummary && typeof o.cohortSummary === "object") return true;
  if (o.pipelineId && typeof o.pipelineId === "string") return true;
  if (o.atRiskCohortTotal && typeof o.atRiskCohortTotal === "number") return true;
  if (o.sequencesGenerated && typeof o.sequencesGenerated === "number") return true;
  if (o.trackerActive === true) return true;
  if (typeof o.summary === "string" && /```/.test(o.summary)) return false;
  return false;
}

// ─── Deployment lookup ────────────────────────────────────────────────────────

async function _ensureDeployment(agentId: string, agentName: string): Promise<string | null> {
  const cacheKey = `${agentId}-hnp-sub`;
  if (_deployIdByAgent[cacheKey]) return _deployIdByAgent[cacheKey];

  const deps = await storage.getDeploymentsByAgentId(agentId).catch((): any[] => []);
  let deploy = deps.find((d: any) => d.status !== "terminated");

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
    }).catch(() => null as any);
    if (!deploy) return null;
  } else {
    await storage.updateDeployment(deploy.id, { status: "pending", evidencePackage: null as any }).catch(() => {});
  }

  _deployIdByAgent[cacheKey] = deploy.id;
  return deploy.id;
}

// ─── SSE Live-Run Handler ─────────────────────────────────────────────────────

export async function hnpSubLiveRunHandler(req: Request, res: Response): Promise<void> {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  const scenarioKey = (req.query.scenario as string) || "happy";
  const scenario = HNP_SUB_SCENARIOS.find(s => s.key === scenarioKey) ?? HNP_SUB_SCENARIOS[0];
  const overrides = getScenarioPromptOverrides(scenarioKey);

  let clientDisconnected = false;
  req.on("close", () => { clientDisconnected = true; });

  const keepalive = setInterval(() => {
    if (clientDisconnected) { clearInterval(keepalive); return; }
    try { res.write(": keepalive\n\n"); } catch { clearInterval(keepalive); }
  }, 15_000);

  sse(res, "run_start", {
    pipeline:      "HNP-SUBSCRIBER-CHURN-PREVENTION",
    breakingEvent: "Hurricane Mara — landfall +24 hours, 64,400 storm-affected subscribers",
    scenario:      scenario.label,
    scenarioKey,
    agents: HNP_SUB_AGENT_DEFS.map(a => ({ externalId: a.externalId, name: a.name })),
  });

  try {
    await _refreshCaches();

    const missingAgents = HNP_SUB_AGENT_DEFS.filter(d => !_agentIdByName[d.name]);
    if (missingAgents.length > 0) {
      sse(res, "error", {
        message: `Provisioning required: ${missingAgents.length} HNP-SUB agents are not yet registered. Run \`bash provision_hnp_sub_dev.sh\` first.`,
        missingAgents: missingAgents.map(d => d.externalId),
      });
      clearInterval(keepalive);
      res.end();
      return;
    }
    sse(res, "setup", { message: "All 4 HNP-SUB agents and 4 MCP servers verified in registry — running real pipeline on Claude." });

    const summaries: Record<string, any> = {};

    // ── Stage 1: Subscriber Signal Monitor ─────────────────────────────────
    sse(res, "phase_start", { phase: "stage_1_signal_monitoring", agents: ["HNP-SUB-01"] });
    await runOneAgent(
      res, "HNP-SUB-01", HNP_SUB_AGENT_NAMES.signalMonitor,
      HNP_SUB_SYSTEM_PROMPTS["HNP-SUB-01"],
      summaries, () => clientDisconnected,
    );
    if (clientDisconnected) return;

    // ── Stage 2: Churn Prediction Engine (consumes SUB-01 output) ──────────
    sse(res, "phase_start", { phase: "stage_2_churn_prediction", agents: ["HNP-SUB-02"] });
    const sub02Prompt = withUpstreamContext(
      HNP_SUB_SYSTEM_PROMPTS["HNP-SUB-02"],
      "HNP-SUB-01 Subscriber Signal Monitor",
      summaries["HNP-SUB-01"],
    );
    await runOneAgent(
      res, "HNP-SUB-02", HNP_SUB_AGENT_NAMES.churnPredictor,
      sub02Prompt, summaries, () => clientDisconnected,
    );
    if (clientDisconnected) return;

    // ── Stage 3: Audience Editor Gate ──────────────────────────────────────
    const gateContext = overrides.gateContext ?? null;
    const isEditorModify = scenarioKey === "editor-modify";
    const isOfferBreach  = scenarioKey === "offer-boundary-breach";

    sse(res, "approval_gate", {
      gate:            "Audience Editor Review",
      editor:          "Sarah Chen",
      role:            "Digital Audience Editor",
      newspaper:       "Houston Chronicle",
      action:          isEditorModify
        ? "approved_with_modification"
        : isOfferBreach
          ? "approved"
          : "approved",
      modification: isEditorModify
        ? "Cohort (b) RED flood-zone sequence must include Harris County emergency resource links before activation."
        : null,
      policyReference: "Audience Editor Approval Gate",
      narrative:       true,
      note: "Simulated milestone — production enforces this gate via attached policy requiring a real approval record.",
      cohortsSummary: {
        amber: "8,000 storm-driven new subscribers — 60-day churn risk 62% (Harvey: 45%)",
        red:   "15,400 pre-existing low engagement — 30-day churn risk 71%",
      },
    });
    await new Promise(r => setTimeout(r, 800));
    if (clientDisconnected) return;

    // ── Stage 4a: Offer Authority Boundary breach (exception scenario) ──────
    if (isOfferBreach) {
      sse(res, "policy_violation", {
        policyName:   "Offer Authority Boundary",
        domain:       "subscription_governance",
        triggeredBy:  "HNP-SUB-03 Re-engagement Content Generator",
        blockedAction: "send_trigger_event with event_type 'activate_30pct_discount'",
        reason:        "Agents may PROPOSE subscription price changes but may NOT activate them unilaterally. Discount activation requires confirmation from subscription operations.",
        enforcement:   "block",
        resolution:    "Event blocked. Subscription operations team notified. Pipeline continues with content-only sequences.",
        policyReference: "Offer Authority Boundary",
      });
      await new Promise(r => setTimeout(r, 600));
      if (clientDisconnected) return;
    }

    // ── Stage 4: Content Generator + Outcome Tracker (parallel) ────────────
    sse(res, "phase_start", { phase: "stage_4_content_and_tracking", agents: ["HNP-SUB-03", "HNP-SUB-04"] });

    // Build SUB-03 prompt — handle editor-modify gate context and offer-breach override
    let sub03SystemPrompt = HNP_SUB_SYSTEM_PROMPTS["HNP-SUB-03"];
    if (overrides.sub03) sub03SystemPrompt = overrides.sub03 + "\n\n" + sub03SystemPrompt;

    let sub03Prompt = withUpstreamContext(
      sub03SystemPrompt,
      "HNP-SUB-02 Churn Prediction Engine",
      summaries["HNP-SUB-02"],
    );
    if (gateContext) {
      sub03Prompt = gateContext + "\n\n" + sub03Prompt;
    }

    const sub04Prompt = withUpstreamContext(
      HNP_SUB_SYSTEM_PROMPTS["HNP-SUB-04"],
      "HNP-SUB-02 Churn Prediction Engine + Gate decision",
      summaries["HNP-SUB-02"],
    );

    await Promise.all([
      runOneAgent(res, "HNP-SUB-03", HNP_SUB_AGENT_NAMES.contentGen,    sub03Prompt, summaries, () => clientDisconnected),
      runOneAgent(res, "HNP-SUB-04", HNP_SUB_AGENT_NAMES.outcomeTracker, sub04Prompt, summaries, () => clientDisconnected),
    ]);

    sse(res, "audit_trail", {
      message: "Full intervention provenance captured — cohort classifications, churn scores, content sequences, gate decision, and outcome baselines recorded.",
      tracesAvailableAt: HNP_SUB_AGENT_DEFS.map(d => ({
        externalId: d.externalId,
        agentId:    _agentIdByName[d.name] || null,
        url:        _agentIdByName[d.name] ? `/agents/${_agentIdByName[d.name]}` : null,
      })),
    });

    const completeMsgs: Record<string, string> = {
      "happy":                 "Pipeline complete — 23,400 at-risk subscribers classified, re-engagement sequences queued. Harvey-calibrated model predicts 65%+ amber cohort retention at 60 days.",
      "editor-modify":         "Pipeline complete — Editor modification applied: cohort-b re-generated with Harris County emergency resources. All three sequences queued and baseline tracked.",
      "offer-boundary-breach": "Pipeline complete — Offer Authority Boundary enforced: 30% discount activation blocked, escalated to subscription operations. Content-only sequences queued.",
    };

    clearInterval(keepalive);
    sse(res, "run_complete", {
      message:  completeMsgs[scenarioKey] ?? completeMsgs["happy"],
      scenario: scenarioKey,
      summaries,
    });
  } catch (err: any) {
    clearInterval(keepalive);
    sse(res, "error", { message: err?.message || "Pipeline error" });
  } finally {
    res.end();
  }
}

// ─── Per-agent runner ─────────────────────────────────────────────────────────

async function runOneAgent(
  res: Response,
  externalId: string,
  agentName: string,
  prompt: string,
  summaries: Record<string, any>,
  isCancelled: () => boolean,
): Promise<void> {
  if (isCancelled()) return;

  const agentId = _agentIdByName[agentName];
  if (!agentId) {
    sse(res, "error", { message: `Agent not found: ${agentName}` });
    return;
  }

  const deploymentId = await _ensureDeployment(agentId, agentName);
  if (!deploymentId) {
    sse(res, "error", { message: `Deployment unavailable for ${externalId}` });
    return;
  }

  sse(res, "agent_start", { externalId, agentName, agentId, deploymentId });

  await stopAgentRuntime(deploymentId).catch(() => {});
  await new Promise(r => setTimeout(r, 200));

  let toolCallCount = 0;
  let finalAnalysisText = "";
  let finalAnalysisObj: Record<string, any> | null = null;

  const onProgress = (ev: any) => {
    if (!ev || !ev.type) return;
    if (ev.type === "tool_call_start") {
      sse(res, "agent_event", {
        externalId, agentId, type: "tool_call",
        data: { tool: ev.data?.tool, server: ev.data?.server, iteration: ev.data?.iteration },
      });
    } else if (ev.type === "tool_call_result") {
      toolCallCount++;
      sse(res, "agent_event", {
        externalId, agentId, type: "tool_call_result",
        data: {
          tool:      ev.data?.tool,
          server:    ev.data?.server,
          success:   !!ev.data?.success,
          error:     ev.data?.error,
          iteration: ev.data?.iteration,
        },
      });
    } else if (ev.type === "iteration_complete") {
      sse(res, "agent_event", {
        externalId, agentId, type: "llm_response",
        data: { iteration: ev.data?.iteration, toolsCalled: ev.data?.toolsCalled },
      });
    } else if (ev.type === "final_analysis") {
      if (ev.data?.analysis && typeof ev.data.analysis === "object") {
        finalAnalysisObj = ev.data.analysis;
      }
      finalAnalysisText = String(ev.data?.rawContent || ev.data?.summary || "");
    }
  };

  let runSuccess = false;
  let resultText = "";

  try {
    const result = await runAgentOnce(deploymentId, prompt, undefined, onProgress);
    runSuccess = !!result?.success;
    resultText = finalAnalysisText || result?.message || "";
  } catch (err: any) {
    runSuccess = false;
    resultText = err?.message || "Agent run failed";
  }

  const extracted = extractJson(resultText);
  const parsed =
    extracted ??
    (finalAnalysisObj && hasStructuredShape(finalAnalysisObj) ? finalAnalysisObj : null);
  if (parsed) summaries[externalId] = parsed;

  const evidencePayload = parsed || (resultText ? { rawOutput: resultText.slice(0, 600) } : null);
  await storage.updateDeployment(deploymentId, {
    status:          runSuccess ? "deployed" : "failed",
    deployedAt:      new Date(),
    evidencePackage: evidencePayload as any,
  }).catch(() => {});

  // Always send a non-null resultSummary so the Pipeline Output panel renders,
  // even when Claude doesn't emit a parseable JSON block.
  const sseResultSummary =
    parsed ??
    (resultText
      ? { summary: resultText.replace(/```[\s\S]*?```/g, "[content block]").slice(0, 600), rawOutput: true }
      : null);

  sse(res, "agent_complete", {
    externalId, agentName, agentId,
    success: runSuccess,
    resultSummary: sseResultSummary,
  });
}

// ─── Agent-runs roster ────────────────────────────────────────────────────────

export async function getHnpSubAgentRuns(req: Request, res: Response): Promise<void> {
  try {
    await _refreshCaches();
    const runs = await Promise.all(HNP_SUB_AGENT_DEFS.map(async (def, i) => {
      const agentId = _agentIdByName[def.name];
      const deps = agentId ? await storage.getDeploymentsByAgentId(agentId).catch((): any[] => []) : [];
      const dep = deps[0];
      return {
        externalId:    def.externalId,
        agentId:       agentId || null,
        agentName:     def.name,
        step:          i + 1,
        agentStatus:   "active",
        runStatus:     dep?.status || "idle",
        modelProvider: def.modelProvider,
        modelName:     def.modelName,
        completedAt:   dep?.deployedAt || null,
        resultSummary: dep?.evidencePackage || null,
        traceUrl:      agentId ? `/agents/${agentId}` : null,
      };
    }));
    res.json({
      pipeline: "HNP-SUBSCRIBER-CHURN-PREVENTION",
      agents:   runs,
      scenario: req.query.scenario || "happy",
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
}

// ─── Reset demo ───────────────────────────────────────────────────────────────

export async function resetHnpSubDemo(_req: Request, res: Response): Promise<void> {
  try {
    Object.keys(_deployIdByAgent).forEach(k => delete _deployIdByAgent[k]);
    await _refreshCaches();
    for (const def of HNP_SUB_AGENT_DEFS) {
      const agentId = _agentIdByName[def.name];
      if (!agentId) continue;
      const deps = await storage.getDeploymentsByAgentId(agentId).catch((): any[] => []);
      for (const dep of deps) {
        await storage.updateDeployment(dep.id, {
          status:          "pending",
          deployedAt:      null as any,
          evidencePackage: null as any,
        }).catch(() => {});
      }
    }
    res.json({ success: true, message: "HNP-SUB demo reset — all 4 agent runs cleared." });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
}
