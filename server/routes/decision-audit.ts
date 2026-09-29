/**
 * Read-only report over decision_audit, the Jev shadow-measurement table
 * (server/decision-shadow.ts). Two views: a per-site summary that answers the
 * Phase 0 gate ("do Jev and the incumbent LLM agree, and how often is Jev sure
 * enough to have been trusted?"), and the recent disagreements so a person can
 * read what the two engines disagreed about. Aggregates and subjects only --
 * the judged state itself is never stored, only its hash.
 *
 * Mounted at /api/decision-audit. Admin-only: the table is platform-wide, not
 * organization-scoped, because evaluateCondition has no organization context.
 */
import { Router, type Request, type Response } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { checkPermission } from "../permissions";
import { storage } from "../storage";
import { shadowDecisionStats, shadowDecisionsEnabled } from "../decision-shadow";
import { computeWaves } from "../dag-execution-engine";
import { evaluateCondition } from "../agent-runtime";

/**
 * Every (condition, worker output) pair a team's stored runs would have handed
 * to evaluateCondition: the "ai"-mode edges of its blueprint, paired with the
 * last completed output of each edge's source node in each run, read from the
 * run's wave results exactly as the engine read them (output[stateKey]). Gate
 * sources are left out because the engine routes on their {approved} directly.
 */
async function collectConditionPairs(teamAgentId: string, runsPerTeam: number) {
  const pairs: Array<{ runId: string; startedAt: string; edgeId: string; condition: string; text: string }> = [];
  const agent = await storage.getAgent(teamAgentId);
  const blueprintId = (agent as any)?.blueprintId as string | undefined;
  if (!agent || !blueprintId) return { pairs, aiEdges: 0, runs: 0, note: "no team agent or blueprint" };
  const [nodes, edges] = await Promise.all([storage.getTeamBlueprintNodes(blueprintId), storage.getTeamBlueprintEdges(blueprintId)]);
  let plan;
  try { plan = computeWaves(nodes, edges); } catch (err: any) { return { pairs, aiEdges: 0, runs: 0, note: `plan: ${err?.message ?? err}` }; }
  const isGate = (nodeId: string) => { const nc = plan.nodeConfig[nodeId]; return !!nc && (nc.nodeType === "edge_gate" || !!nc.gateType); };
  const aiEdges = edges.filter(e =>
    (e.condition || "").trim().length > 0
    && !(e.evaluationMode === "deterministic" && e.rule)
    && e.evaluationMode !== "handoff"
    && !isGate(e.sourceNodeId),
  );
  if (aiEdges.length === 0) return { pairs, aiEdges: 0, runs: 0, note: "no ai-mode edges" };
  const runs = await storage.listDagExecutionRunsByTeamAgent(teamAgentId, runsPerTeam);
  for (const run of runs) {
    const waves = Array.isArray(run.waveResults) ? (run.waveResults as any[]) : [];
    const lastOutput = new Map<string, string>();
    for (const wr of waves) for (const nr of (wr?.nodes || [])) {
      const nc = plan.nodeConfig[nr.nodeId];
      if (!nc || nr.status !== "completed") continue;
      const value = nr.output?.[nc.stateKey];
      if (value != null) lastOutput.set(nr.nodeId, typeof value === "string" ? value : JSON.stringify(value));
    }
    for (const e of aiEdges) {
      const text = lastOutput.get(e.sourceNodeId);
      if (text == null) continue;
      pairs.push({ runId: run.id, startedAt: String(run.startedAt ?? run.createdAt ?? ""), edgeId: e.id, condition: String(e.condition), text });
    }
  }
  pairs.sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.runId.localeCompare(b.runId) || a.edgeId.localeCompare(b.edgeId));
  return { pairs, aiEdges: aiEdges.length, runs: runs.length, note: null as string | null };
}

// The two thresholds the evaluation doc proposes: 0.60 for a review-only
// signal, 0.85 for anything that would act. A noul's `margin` stands in for
// confidence (see decision-shadow.ts).
const THRESHOLDS = [0.6, 0.85] as const;

function sinceClause(req: Request) {
  const since = typeof req.query.since === "string" ? new Date(req.query.since) : null;
  return since && !Number.isNaN(since.getTime()) ? sql`created_at >= ${since.toISOString()}::timestamp` : sql`TRUE`;
}

export function createDecisionAuditRouter(): Router {
  const router = Router();

  router.get("/summary", checkPermission("manage_security"), async (req: Request, res: Response) => {
    try {
      const result = await db.execute(sql`
        SELECT site, question_kind,
          COUNT(*)::int AS calls,
          COUNT(*) FILTER (WHERE error IS NOT NULL)::int AS errors,
          COUNT(*) FILTER (WHERE agree IS NOT NULL)::int AS compared,
          COUNT(*) FILTER (WHERE agree)::int AS agreed,
          COUNT(*) FILTER (WHERE agree IS NOT NULL AND COALESCE(confidence, margin) >= ${THRESHOLDS[0]})::int AS compared_at_060,
          COUNT(*) FILTER (WHERE agree AND COALESCE(confidence, margin) >= ${THRESHOLDS[0]})::int AS agreed_at_060,
          COUNT(*) FILTER (WHERE agree IS NOT NULL AND COALESCE(confidence, margin) >= ${THRESHOLDS[1]})::int AS compared_at_085,
          COUNT(*) FILTER (WHERE agree AND COALESCE(confidence, margin) >= ${THRESHOLDS[1]})::int AS agreed_at_085,
          COUNT(*) FILTER (WHERE mode = 'jev')::int AS routed_jev,
          COUNT(*) FILTER (WHERE mode = 'jev' AND fallback_reason IS NOT NULL)::int AS fell_back,
          COUNT(*) FILTER (WHERE mode = 'llm')::int AS routed_llm,
          COALESCE(SUM(llm_cost_usd), 0) AS llm_cost_usd,
          COALESCE(SUM(jev_cost_usd), 0) AS jev_cost_usd,
          COALESCE(SUM(llm_input_tokens), 0)::int AS llm_input_tokens,
          COUNT(*) FILTER (WHERE llm_cost_usd IS NOT NULL)::int AS llm_priced_rows,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms) AS jev_p50_ms,
          percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) AS jev_p95_ms,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY llm_latency_ms) AS llm_p50_ms,
          percentile_cont(0.95) WITHIN GROUP (ORDER BY llm_latency_ms) AS llm_p95_ms,
          COALESCE(SUM(input_tokens), 0)::int AS jev_input_tokens,
          MIN(created_at) AS first_at,
          MAX(created_at) AS last_at
        FROM decision_audit
        WHERE ${sinceClause(req)}
        GROUP BY site, question_kind
        ORDER BY site, question_kind
      `);
      const rate = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 1000 : null);
      const sites = (result.rows as any[]).map(r => ({
        site: r.site,
        questionKind: r.question_kind,
        calls: r.calls,
        errors: r.errors,
        compared: r.compared,
        agreed: r.agreed,
        agreement: rate(r.agreed, r.compared),
        atThreshold: {
          "0.60": { compared: r.compared_at_060, agreed: r.agreed_at_060, agreement: rate(r.agreed_at_060, r.compared_at_060), resolveShare: rate(r.compared_at_060, r.compared) },
          "0.85": { compared: r.compared_at_085, agreed: r.agreed_at_085, agreement: rate(r.agreed_at_085, r.compared_at_085), resolveShare: rate(r.compared_at_085, r.compared) },
        },
        // Once a site routes on Jev for real, the shadow comparison stops
        // covering every call: a decision the model answers with confidence has
        // no LLM answer to compare against. These say how many calls the model
        // decided, how many it handed back to the LLM, and how many never went
        // to it -- the rollout drill's numbers.
        routing: { jev: r.routed_jev, fellBack: r.fell_back, llm: r.routed_llm },
        // What each engine cost on this site, from the rows that carry a price
        // (the live seam's; a shadow hook's row prices Jev only). Per-call cost
        // is llmUsd / llmPricedRows against jevUsd / calls.
        cost: { llmUsd: Number(r.llm_cost_usd), jevUsd: Number(r.jev_cost_usd), llmInputTokens: r.llm_input_tokens, llmPricedRows: r.llm_priced_rows },
        latencyMs: {
          jev: { p50: r.jev_p50_ms === null ? null : Math.round(Number(r.jev_p50_ms)), p95: r.jev_p95_ms === null ? null : Math.round(Number(r.jev_p95_ms)) },
          llm: { p50: r.llm_p50_ms === null ? null : Math.round(Number(r.llm_p50_ms)), p95: r.llm_p95_ms === null ? null : Math.round(Number(r.llm_p95_ms)) },
        },
        jevInputTokens: r.jev_input_tokens,
        firstAt: r.first_at,
        lastAt: r.last_at,
      }));
      res.json({ shadow: shadowDecisionStats(), thresholds: THRESHOLDS, sites });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "summary failed" });
    }
  });

  router.get("/disagreements", checkPermission("manage_security"), async (req: Request, res: Response) => {
    try {
      const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "50"), 10) || 50, 1), 200);
      const site = typeof req.query.site === "string" && req.query.site ? req.query.site : null;
      const result = await db.execute(sql`
        SELECT id, site, question_kind, subject, jev_answer, llm_answer, jev_decision, llm_decision,
               confidence, margin, latency_ms, llm_latency_ms, llm_model, jev_model, state_hash, created_at
        FROM decision_audit
        WHERE agree = FALSE
          AND ${sinceClause(req)}
          AND (${site}::text IS NULL OR site = ${site}::text)
        ORDER BY created_at DESC
        LIMIT ${limit}
      `);
      res.json({ rows: result.rows });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "disagreements failed" });
    }
  });

  /**
   * Replay stored (condition, output) pairs through evaluateCondition with the
   * shadow on, so the condition site reaches a usable sample without paying
   * for whole team runs. Each pair costs one LLM routing call (~$0.002) plus
   * one Jev call; rows land under site "evaluateCondition:replay". Bounded per
   * call (limit <= 100) and paged by offset so a caller stays under the
   * gateway timeout; dryRun only counts.
   */
  router.post("/replay", checkPermission("manage_security"), async (req: Request, res: Response) => {
    const startedAt = Date.now();
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const teamAgentIds = Array.isArray(body.teamAgentIds) ? body.teamAgentIds.map(String).filter(Boolean) : [];
      if (teamAgentIds.length === 0) return res.status(400).json({ error: "teamAgentIds (string[]) is required" });
      const runsPerTeam = Math.min(Math.max(Number(body.runsPerTeam ?? 20) || 20, 1), 100);
      const limit = Math.min(Math.max(Number(body.limit ?? 40) || 40, 1), 100);
      const offset = Math.max(Number(body.offset ?? 0) || 0, 0);
      const concurrency = Math.min(Math.max(Number(body.concurrency ?? 3) || 3, 1), 5);
      const dryRun = body.dryRun === true;
      if (!dryRun && !shadowDecisionsEnabled()) return res.status(409).json({ error: "shadow mode is off (DECISION_PROVIDER=shadow and TYPESAFE_API_KEY required)" });

      const perTeam: Record<string, { pairs: number; aiEdges: number; runs: number; note: string | null }> = {};
      let all: Awaited<ReturnType<typeof collectConditionPairs>>["pairs"] = [];
      for (const teamId of teamAgentIds) {
        const c = await collectConditionPairs(teamId, runsPerTeam);
        perTeam[teamId] = { pairs: c.pairs.length, aiEdges: c.aiEdges, runs: c.runs, note: c.note };
        all = all.concat(c.pairs);
      }
      const page = all.slice(offset, offset + limit);
      let replayed = 0;
      if (!dryRun) {
        let next = 0;
        const worker = async () => {
          while (next < page.length) {
            const p = page[next++];
            await evaluateCondition(p.condition, p.text, { shadowSite: "evaluateCondition:replay" });
            replayed++;
          }
        };
        await Promise.all(Array.from({ length: Math.min(concurrency, page.length) }, worker));
      }
      res.json({
        dryRun,
        pairs: all.length,
        perTeam,
        offset,
        pageSize: page.length,
        replayed,
        nextOffset: offset + page.length < all.length ? offset + page.length : null,
        elapsedMs: Date.now() - startedAt,
        shadow: shadowDecisionStats(),
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "replay failed" });
    }
  });

  return router;
}
