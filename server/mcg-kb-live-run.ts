// =============================================================================
// MCG Health — Knowledge Base Onboarding (SCN-MCG-1) — Live SSE Pipeline Runner
//
// Single-agent pipeline: MCG-KB-INGEST-001
// Scenario-aware: happy | prohibited-term | missing-hash
//
// Looks up the agent created by provision_mcg_kb_dev.sh (by name), runs it
// via runAgentOnce with real Claude (claude-haiku-4-5), and streams SSE events
// to the demo frontend. After QA completes the frontend shows a human
// Promote gate.
// =============================================================================

import { type Request, type Response } from "express";
import { storage } from "./storage";
import { runAgentOnce, stopAgentRuntime } from "./agent-runtime";
import {
  MCG_KB_AGENT_NAME,
  MCG_KB_AGENT_DEF,
  makeMcgKbMcpServerDefs,
  MCG_KB_SCENARIO_PROMPTS,
  type McgScenarioKey,
} from "./mcg-kb-shared-defs";
import { setMcgKbScenario } from "./mock-mcp/mcg-knowledge-base";
import { setMcgBundleStoreScenario } from "./mock-mcp/mcg-bundle-store";

const BASE_URL = `http://localhost:${process.env.PORT || 5000}`;
const MCG_MCP_SERVERS = makeMcgKbMcpServerDefs(BASE_URL);

// ─── Caches ───────────────────────────────────────────────────────────────────
let _agentId: string | null = null;
let _deployId: string | null = null;
const _mcpIdByName: Record<string, string> = {};

async function _refreshCaches(): Promise<void> {
  const [allAgents, allServers] = await Promise.all([
    storage.getAgents().catch((): any[] => []),
    storage.getMcpServers().catch((): any[] => []),
  ]);
  const match = allAgents.find((a: any) => a.name === MCG_KB_AGENT_NAME);
  if (match) _agentId = match.id;
  for (const def of MCG_MCP_SERVERS) {
    const s = allServers.find((x: any) => x.name === def.name);
    if (s) _mcpIdByName[def.name] = s.id;
  }
}

// ─── SSE helpers ──────────────────────────────────────────────────────────────

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

function hasStructuredShape(o: Record<string, any>): boolean {
  if (!o || typeof o !== "object") return false;
  if (typeof o.bundle_id === "string") return true;
  if (typeof o.qa_score === "number") return true;
  if (typeof o.passed_qa === "boolean") return true;
  if (Array.isArray(o.hard_violations)) return true;
  if (typeof o.summary === "string" && /```/.test(o.summary)) return false;
  return false;
}

// ─── Deployment helper ────────────────────────────────────────────────────────

async function _ensureDeployment(agentId: string): Promise<string | null> {
  if (_deployId) return _deployId;
  const deps = await storage.getDeploymentsByAgentId(agentId).catch((): any[] => []);
  let deploy = deps.find((d: any) => d.status !== "terminated");
  if (!deploy) {
    deploy = await storage.createDeployment({
      agentId,
      agentName:        MCG_KB_AGENT_NAME,
      environment:      "production",
      status:           "active",       // "active" is not picked up by the auto-run scheduler
      version:          "1.0.0",
      rolloutStrategy:  "canary",
      canaryPercent:    100,
      pipelineComplete: false,           // must stay false — true triggers background auto-execution
      deployedAt:       new Date(),
    }).catch(() => null as any);
    if (!deploy) return null;
  }
  // Ensure existing deployments don't get picked up by the background scheduler
  if (deploy.pipelineComplete) {
    await storage.updateDeployment(deploy.id, { pipelineComplete: false } as any).catch(() => {});
  }
  _deployId = deploy.id;
  return deploy.id;
}

// ─── Live-Run Handler ─────────────────────────────────────────────────────────

export async function mcgKbLiveRunHandler(req: Request, res: Response): Promise<void> {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  const scenarioKey = ((req.query.scenario as string) || "happy") as McgScenarioKey;
  const scenarioDef = MCG_KB_SCENARIO_PROMPTS[scenarioKey] ?? MCG_KB_SCENARIO_PROMPTS.happy;

  // Arm the mock MCPs with the current scenario so they return scenario-specific data
  setMcgKbScenario(scenarioKey);
  setMcgBundleStoreScenario(scenarioKey);

  let clientDisconnected = false;
  req.on("close", () => { clientDisconnected = true; });

  const keepalive = setInterval(() => {
    if (clientDisconnected) { clearInterval(keepalive); return; }
    try { res.write(": keepalive\n\n"); } catch { clearInterval(keepalive); }
  }, 15_000);

  sse(res, "run_start", {
    pipeline: "MCG-HEALTH-KB-INGEST",
    scenario: scenarioDef.label,
    agent: { externalId: MCG_KB_AGENT_DEF.externalId, name: MCG_KB_AGENT_DEF.name },
    sources: [
      { filename: "MCG_Brand_Style_Guide_2024.pdf", pages: 48 },
      { filename: "MCG_Clinical_Dictionary_2024.pdf", pages: 312 },
    ],
    extraction_nodes: 7,
    bundle_artifacts: 12,
  });

  try {
    await _refreshCaches();

    if (!_agentId) {
      sse(res, "error", {
        message: "Provisioning required: MCG-KB-INGEST-001 agent is not registered. Run `bash provision_mcg_kb_dev.sh` first.",
        missingAgent: MCG_KB_AGENT_DEF.externalId,
      });
      clearInterval(keepalive);
      res.end();
      return;
    }

    sse(res, "setup", {
      message: "MCG-KB-INGEST-001 verified in registry — running live ingestion pipeline on Claude (claude-haiku-4-5).",
      agentId: _agentId,
    });
    if (clientDisconnected) return;

    // ── Single-agent pipeline ─────────────────────────────────────────────────
    sse(res, "phase_start", { phase: "kb_ingestion", agent: MCG_KB_AGENT_DEF.externalId });

    const deploymentId = await _ensureDeployment(_agentId);
    if (!deploymentId) {
      sse(res, "error", { message: "Deployment unavailable for MCG-KB-INGEST-001" });
      clearInterval(keepalive);
      res.end();
      return;
    }

    sse(res, "agent_start", {
      externalId:   MCG_KB_AGENT_DEF.externalId,
      agentName:    MCG_KB_AGENT_NAME,
      agentId:      _agentId,
      deploymentId,
      model:        MCG_KB_AGENT_DEF.modelName,
    });

    await stopAgentRuntime(deploymentId).catch(() => {});
    await new Promise(r => setTimeout(r, 200));

    let toolCallCount = 0;
    let finalAnalysisText = "";
    let finalAnalysisObj: Record<string, any> | null = null;

    const onProgress = (ev: any) => {
      if (!ev?.type) return;
      const externalId = MCG_KB_AGENT_DEF.externalId;
      const agentId    = _agentId;

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
      const result = await runAgentOnce(deploymentId, scenarioDef.prompt, undefined, onProgress);
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

    await storage.updateDeployment(deploymentId, {
      status:        runSuccess ? "deployed" : "failed",
      deployedAt:    new Date(),
      resultSummary: parsed || { rawOutput: (resultText || "").slice(0, 600) },
    }).catch(() => {});

    sse(res, "agent_complete", {
      externalId:    MCG_KB_AGENT_DEF.externalId,
      agentName:     MCG_KB_AGENT_NAME,
      agentId:       _agentId,
      success:       runSuccess,
      toolCalls:     toolCallCount,
      resultSummary: parsed,
    });

    if (clientDisconnected) return;

    // ── QA Gate event ─────────────────────────────────────────────────────────
    const qaScore     = parsed?.qa_score ?? null;
    const passedQa    = parsed?.passed_qa ?? null;
    const bundleId    = parsed?.bundle_id ?? null;
    const hardCount   = parsed?.hard_violations_count ?? (parsed?.hard_violations?.length ?? 0);
    const warnCount   = parsed?.soft_warnings_count   ?? (parsed?.soft_warnings?.length   ?? 0);
    const promotable  = parsed?.promotable ?? (passedQa === true);
    const requiresAck = parsed?.promotion_requires_acknowledgement ?? false;
    const status      = parsed?.status ?? (passedQa === false ? "QA_BLOCKED" : "QA_PASSED");

    sse(res, "qa_gate", {
      bundle_id:      bundleId,
      qa_score:       qaScore,
      passed_qa:      passedQa,
      status,
      hard_violations_count: hardCount,
      soft_warnings_count:   warnCount,
      promotable,
      promotion_requires_acknowledgement: requiresAck,
      agentId:   _agentId,
      scenario:  scenarioKey,
      narrative: passedQa === false
        ? "QA BLOCKED — bundle cannot be promoted until all hard violations are resolved."
        : requiresAck
          ? "QA passed with warnings. Human must acknowledge reduced reproducibility guarantee before promotion."
          : "QA passed. Bundle is ready for human promotion.",
    });

    await new Promise(r => setTimeout(r, 600));
    if (clientDisconnected) return;

    // ── Human Promotion Gate (only when promotable) ───────────────────────────
    if (promotable) {
      sse(res, "promotion_gate", {
        gate:        "Human Bundle Promotion",
        bundle_id:   bundleId,
        qa_score:    qaScore,
        reviewer:    "Knowledge Management Lead",
        policy_ref:  "Human Promotion Gate",
        requires_acknowledgement: requiresAck,
        note:        "Requires human review and promotion action. Until promoted, no agent can be bound to this bundle.",
        narrative:   true,
      });
    }

    sse(res, "audit_trail", {
      message:       "Full ingestion provenance captured — every extraction node, every tool call, every QA rule evaluated.",
      agentId:       _agentId,
      deploymentId,
      traceUrl:      _agentId ? `/agents/${_agentId}` : null,
    });

    clearInterval(keepalive);
    sse(res, "run_complete", {
      message:   scenarioDef.completeMsg,
      scenario:  scenarioKey,
      bundle_id: bundleId,
      qa_score:  qaScore,
      passed_qa: passedQa,
      summary:   parsed,
    });

  } catch (err: any) {
    clearInterval(keepalive);
    sse(res, "error", { message: err?.message || "Pipeline error" });
  } finally {
    res.end();
  }
}

// ─── Agent-runs roster ─────────────────────────────────────────────────────────

export async function getMcgKbAgentRuns(_req: Request, res: Response): Promise<void> {
  try {
    await _refreshCaches();
    const agentId = _agentId;
    const deps = agentId
      ? await storage.getDeploymentsByAgentId(agentId).catch((): any[] => [])
      : [];
    const dep = deps[0];
    res.json([{
      externalId:   MCG_KB_AGENT_DEF.externalId,
      name:         MCG_KB_AGENT_NAME,
      agentId,
      deploymentId: dep?.id ?? null,
      status:       dep?.status ?? "idle",
      lastRun:      dep?.deployedAt ?? null,
    }]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// ─── Demo reset ────────────────────────────────────────────────────────────────

export async function resetMcgKbDemo(_req: Request, res: Response): Promise<void> {
  try {
    _deployId = null;
    await _refreshCaches();
    if (_agentId) {
      const deps = await storage.getDeploymentsByAgentId(_agentId).catch((): any[] => []);
      for (const d of deps) {
        await storage.updateDeployment(d.id, { status: "pending", resultSummary: null as any }).catch(() => {});
      }
    }
    setMcgKbScenario("happy");
    setMcgBundleStoreScenario("happy");
    res.json({ success: true, message: "MCG KB demo reset — agent run cleared." });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}
