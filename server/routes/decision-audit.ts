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
import { shadowDecisionStats } from "../decision-shadow";

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

  return router;
}
