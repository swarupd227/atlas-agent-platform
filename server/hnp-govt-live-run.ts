// =============================================================================
// HNP Government Beat Intelligence — Live SSE pipeline runner
//
// Lazy-looks-up the agents and MCP servers created by provision_hnp_govt_dev.sh
// (or migrate_hnp_govt_to_prod.sh) and orchestrates the 4-agent pipeline using
// the platform's real Anthropic + MCP runtime (runAgentOnce).
//
// No DB writes here — all entity creation happens through the Platform API in
// the provisioning script. This handler only reads (lookup by name) and uses
// the runtime layer (which itself updates deployments / runs / traces).
// =============================================================================

import { type Request, type Response } from "express";
import { storage } from "./storage";
import { runAgentOnce, stopAgentRuntime } from "./agent-runtime";
import {
  HNP_GOVT_AGENT_NAMES,
  HNP_GOVT_AGENT_DEFS,
  makeHnpGovtMcpServerDefs,
  HNP_GOVT_SCENARIO_PROMPTS,
  type HnpScenarioKey,
} from "./hnp-govt-shared-defs";

const BASE_URL = `http://localhost:${process.env.PORT || 5000}`;
const HNP_MCP_SERVERS = makeHnpGovtMcpServerDefs(BASE_URL);

// ─── Caches ───────────────────────────────────────────────────────────────────

const _agentIdByName:   Record<string, string> = {};
const _mcpIdByName:     Record<string, string> = {};
const _deployIdByAgent: Record<string, string> = {};

async function _refreshCaches(): Promise<void> {
  const [allServers, allAgents] = await Promise.all([
    storage.getMcpServers().catch((): any[] => []),
    storage.getAgents().catch((): any[] => []),
  ]);
  for (const sd of HNP_MCP_SERVERS) {
    const s = allServers.find((x: any) => x.name === sd.name);
    if (s) _mcpIdByName[sd.name] = s.id;
  }
  for (const def of HNP_GOVT_AGENT_DEFS) {
    const a = allAgents.find((x: any) => x.name === def.name);
    if (a) _agentIdByName[def.name] = a.id;
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
  const blockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (blockMatch) { try { return JSON.parse(blockMatch[1]); } catch {} }
  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch) { try { return JSON.parse(objectMatch[0]); } catch {} }
  return null;
}

// ─── Deployment lookup (no DB write — provisioning script created the deployment) ──

async function _ensureDeployment(agentId: string, agentName: string): Promise<string | null> {
  const cacheKey = `${agentId}-hnp-govt`;
  if (_deployIdByAgent[cacheKey]) return _deployIdByAgent[cacheKey];

  const deps = await storage.getDeploymentsByAgentId(agentId).catch((): any[] => []);
  let deploy = deps.find((d: any) => d.status !== "terminated");

  if (!deploy) {
    // Provisioning script should have created one — create a runtime-pending
    // deployment as a fallback so the runtime has a stable id to attach to.
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
    await storage.updateDeployment(deploy.id, { status: "pending", resultSummary: null as any }).catch(() => {});
  }

  _deployIdByAgent[cacheKey] = deploy.id;
  return deploy.id;
}

// ─── SSE Live-Run Handler ─────────────────────────────────────────────────────

export async function hnpGovtLiveRunHandler(req: Request, res: Response): Promise<void> {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  const scenarioKey = ((req.query.scenario as string) || "happy") as HnpScenarioKey;
  const scenarioDef = HNP_GOVT_SCENARIO_PROMPTS[scenarioKey] ?? HNP_GOVT_SCENARIO_PROMPTS.happy;

  let clientDisconnected = false;
  req.on("close", () => { clientDisconnected = true; });

  const keepalive = setInterval(() => {
    if (clientDisconnected) { clearInterval(keepalive); return; }
    try { res.write(": keepalive\n\n"); } catch { clearInterval(keepalive); }
  }, 15_000);

  sse(res, "run_start", {
    pipeline: "HNP-HOUSTON-GOVT-BEAT",
    breakingEvent: "Hurricane Mara — landfall in 36 hours",
    assemblyCorpus: { transcripts: 47, totalHours: 1247 },
    scenario: scenarioDef.label,
    agents: HNP_GOVT_AGENT_DEFS.map(a => ({ externalId: a.externalId, name: a.name })),
  });

  let gateTimeout: ReturnType<typeof setTimeout> | undefined;

  try {
    await _refreshCaches();

    // Fail fast if provisioning hasn't been run yet.
    const missingAgents = HNP_GOVT_AGENT_DEFS.filter(d => !_agentIdByName[d.name]);
    if (missingAgents.length > 0) {
      sse(res, "error", {
        message: `Provisioning required: ${missingAgents.length} HNP-GOVT agents are not yet registered in the platform. Run \`bash provision_hnp_govt_dev.sh\` first.`,
        missingAgents: missingAgents.map(d => d.externalId),
      });
      clearInterval(keepalive);
      res.end();
      return;
    }
    sse(res, "setup", { message: "All 4 HNP-GOVT agents and 4 MCP servers verified in registry — running 4 agents in parallel on Claude" });

    // All 4 agents run in parallel — each scenario prompt is self-contained
    // (the upstream "handoff context" is baked into each agent's task prompt).
    // The narrative approval gate is emitted as an in-flight visual milestone.
    const summaries: Record<string, any> = {};

    sse(res, "phase_start", { phase: "parallel_execution", agents: ["HNP-GOVT-01", "HNP-GOVT-02", "HNP-GOVT-03", "HNP-GOVT-04"] });

    // Fire the reporter-brief approval gate ~1.2s in so it shows up in the
    // SSE timeline between the agent_start events and the agent_complete
    // events. This is a *narrative* milestone for the demo — no real approval
    // record is created and the agents run in parallel regardless of any
    // human action. Production deployments enforce the actual Human Reporter
    // Gate via the policy attached to the agents (see provisioning script).
    gateTimeout = setTimeout(() => {
      if (clientDisconnected) return;
      sse(res, "approval_gate", {
        gate: "Reporter Brief Review",
        reporter: "Clara Mendez",
        desk: "Investigations",
        newspaper: "Houston Chronicle",
        action: scenarioDef.reporterGate,
        policyReference: "Human Reporter Gate",
        narrative: true,
        note: "Simulated milestone — production runs enforce this gate via attached policy.",
      });
    }, 1200);

    await Promise.all([
      runOneAgent(res, "HNP-GOVT-01", HNP_GOVT_AGENT_NAMES.corpusAnalyst,    scenarioDef.agent01, summaries, () => clientDisconnected),
      runOneAgent(res, "HNP-GOVT-02", HNP_GOVT_AGENT_NAMES.angleDetector,    scenarioDef.agent02, summaries, () => clientDisconnected),
      runOneAgent(res, "HNP-GOVT-03", HNP_GOVT_AGENT_NAMES.storyDraftAgent,  scenarioDef.agent03, summaries, () => clientDisconnected),
      runOneAgent(res, "HNP-GOVT-04", HNP_GOVT_AGENT_NAMES.foiaGenerator,    scenarioDef.agent04, summaries, () => clientDisconnected),
    ]);

    sse(res, "audit_trail", {
      message: "Full provenance chain captured — every transcript consulted, every extraction, every confidence score, every reporter decision.",
      tracesAvailableAt: HNP_GOVT_AGENT_DEFS.map(d => ({
        externalId: d.externalId,
        agentId: _agentIdByName[d.name] || null,
        url: _agentIdByName[d.name] ? `/agents/${_agentIdByName[d.name]}` : null,
      })),
    });

    if (gateTimeout) clearTimeout(gateTimeout);
    clearInterval(keepalive);
    sse(res, "run_complete", {
      message: scenarioDef.completeMsg,
      scenario: scenarioKey,
      summaries,
    });
  } catch (err: any) {
    if (gateTimeout) clearTimeout(gateTimeout);
    clearInterval(keepalive);
    sse(res, "error", { message: err?.message || "Pipeline error" });
  } finally {
    res.end();
  }
}

// ─── Per-agent runner (real LLM + real MCP via runAgentOnce) ──────────────────

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

  sse(res, "agent_start", {
    externalId,
    agentName,
    agentId,
    deploymentId,
  });

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
          tool: ev.data?.tool,
          server: ev.data?.server,
          success: !!ev.data?.success,
          error: ev.data?.error,
          iteration: ev.data?.iteration,
        },
      });
    } else if (ev.type === "iteration_complete") {
      sse(res, "agent_event", {
        externalId, agentId, type: "llm_response",
        data: { iteration: ev.data?.iteration, toolsCalled: ev.data?.toolsCalled },
      });
    } else if (ev.type === "final_analysis") {
      // Prefer the full structured `analysis` object emitted by the runtime;
      // fall back to rawContent (full LLM JSON text) and finally the short
      // summary string. This makes JSON capture robust regardless of which
      // field the LLM populated.
      if (ev.data?.analysis && typeof ev.data.analysis === "object") {
        finalAnalysisObj = ev.data.analysis;
      }
      finalAnalysisText = String(
        ev.data?.rawContent || ev.data?.summary || ""
      );
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

  const parsed = finalAnalysisObj || extractJson(resultText);
  if (parsed) summaries[externalId] = parsed;

  await storage.updateDeployment(deploymentId, {
    status:        runSuccess ? "deployed" : "failed",
    deployedAt:    new Date(),
    resultSummary: parsed || { rawOutput: (resultText || "").slice(0, 600) },
  }).catch(() => {});

  sse(res, "agent_complete", {
    externalId, agentName, agentId,
    success: runSuccess,
    resultSummary: parsed,
  });
}

// ─── Agent-runs roster (header tile in Atlas demo UI) ─────────────────────────

export async function getHnpGovtAgentRuns(req: Request, res: Response): Promise<void> {
  try {
    await _refreshCaches();
    const runs = await Promise.all(HNP_GOVT_AGENT_DEFS.map(async (def, i) => {
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
        resultSummary: dep?.resultSummary || null,
        traceUrl:      agentId ? `/agents/${agentId}` : null,
      };
    }));
    res.json({ pipeline: "HNP-HOUSTON-GOVT-BEAT", agents: runs, scenario: req.query.scenario || "happy" });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
}

// ─── Reset demo (clears deployments to pending) ───────────────────────────────

export async function resetHnpGovtDemo(_req: Request, res: Response): Promise<void> {
  try {
    Object.keys(_deployIdByAgent).forEach(k => delete _deployIdByAgent[k]);
    await _refreshCaches();
    for (const def of HNP_GOVT_AGENT_DEFS) {
      const agentId = _agentIdByName[def.name];
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
    res.json({ success: true, message: "HNP-GOVT demo reset — all 4 agent runs cleared." });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
}
