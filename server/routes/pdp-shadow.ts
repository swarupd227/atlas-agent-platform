/**
 * Read-only report over the policy decision point shadow comparison
 * (server/pdp-shadow.ts): how many tool-call decisions were compared, how they
 * fell into categories, the differences worth reading, decide() latency, and
 * whether the flip criteria for making the PDP authoritative are met.
 *
 * Mounted at /api/pdp. Platform admins only: the comparison tables are
 * platform-wide, like the setting that switches the comparison on.
 *
 * "Not measured" is never a pass: with nothing compared, measured is false and
 * every flip check fails with the value "not measured".
 */
import { Router, type Request, type Response } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { checkPermission, platformOnly } from "../permissions";
import { getPdpSettings } from "../pdp-mode";
import { pdpShadowStats } from "../pdp-shadow";

const DAY_MS = 86_400_000;
export const FLIP = { days: 7, nativeComparisons: 2000, unexpected: 0, p95Ms: 20, minLatencySamples: 100 } as const;

export interface CountRow { actor_kind: string; category: string; n: number; us_sum: number; us_max: number }
export interface DiffRow {
  category: string; actor_kind: string; agent_id: string; tool_name: string; legacy_class: string; unified_class: string;
  unified_gate: string | null; rows: number; legacy_reason: string | null; unified_reason: string | null; last_at: string;
}

/** The report, from the rows the two queries return. Pure, so it is tested without a database. */
export function summarise(input: {
  counts: CountRow[]; diffs: DiffRow[]; firstComparisonAt: string | null; now: Date; hours: number;
  settings: { mode: string; sample: number }; process: ReturnType<typeof pdpShadowStats>;
}) {
  const { counts, diffs, now, hours } = input;
  const byActor: Record<string, Record<string, number>> = {};
  const byCategory: Record<string, number> = {};
  let compared = 0, usSum = 0, usMax = 0;
  for (const r of counts) {
    const n = Number(r.n);
    compared += n;
    usSum += Number(r.us_sum);
    usMax = Math.max(usMax, Number(r.us_max));
    (byActor[r.actor_kind] ??= {})[r.category] = ((byActor[r.actor_kind] ?? {})[r.category] ?? 0) + n;
    byCategory[r.category] = (byCategory[r.category] ?? 0) + n;
  }
  const measured = compared > 0;
  const native = Object.values(byActor.native ?? {}).reduce((a, b) => a + b, 0);
  const unexpected = byCategory.unexpected ?? 0;
  const p95 = input.process.latency.samples >= FLIP.minLatencySamples ? input.process.latency.p95Ms : null;
  const daysCovered = input.firstComparisonAt ? (now.getTime() - new Date(input.firstComparisonAt).getTime()) / DAY_MS : 0;
  const notMeasured = "not measured";

  const checks = [
    { name: `>= ${FLIP.days} days of comparisons`, ok: measured && daysCovered >= FLIP.days, value: measured ? `${daysCovered.toFixed(1)} days` : notMeasured },
    { name: `>= ${FLIP.nativeComparisons} native comparisons`, ok: native >= FLIP.nativeComparisons, value: measured ? String(native) : notMeasured },
    { name: `${FLIP.unexpected} unexpected`, ok: measured && unexpected === 0, value: measured ? String(unexpected) : notMeasured },
    { name: `decide() p95 < ${FLIP.p95Ms} ms`, ok: p95 !== null && p95 < FLIP.p95Ms,
      value: p95 === null ? `${notMeasured} (${input.process.latency.samples} of ${FLIP.minLatencySamples} samples since process start)` : `${p95} ms` },
  ];

  return {
    mode: input.settings.mode,
    sample: input.settings.sample,
    window: { from: new Date(now.getTime() - hours * 3_600_000).toISOString(), to: now.toISOString(), hours, firstComparisonAt: input.firstComparisonAt },
    measured,
    totals: { compared, byActor, byCategory },
    top: diffs.map(d => ({
      category: d.category, actor: d.actor_kind, agentId: d.agent_id, tool: d.tool_name, legacy: d.legacy_class,
      unified: d.unified_class, gate: d.unified_gate, detailRows: Number(d.rows), lastAt: d.last_at,
      example: { legacyReason: d.legacy_reason, unifiedReason: d.unified_reason },
    })),
    latency: {
      meanMs: compared ? Math.round(usSum / compared) / 1000 : null, maxMs: compared ? usMax / 1000 : null,
      p50Ms: input.process.latency.p50Ms, p95Ms: input.process.latency.p95Ms,
      p95Samples: input.process.latency.samples, p95SinceProcessStart: input.process.since,
    },
    process: { inFlight: input.process.inFlight, compared: input.process.compared, dropped: input.process.dropped,
      sampledOut: input.process.sampledOut, failed: input.process.failed, since: input.process.since },
    limitations: [
      "A dispatch whose legacy policy read threw never reaches finish(), so it is not compared (parity rule R7 covers it).",
      "detailRows is capped at 20 per key per hour; the totals carry the full volume.",
    ],
    flip: { met: checks.every(c => c.ok), checks },
  };
}

export function createPdpShadowRouter(): Router {
  const router = Router();

  router.get("/shadow-summary", platformOnly(checkPermission("manage_platform_settings")), async (req: Request, res: Response) => {
    try {
      const hoursParam = Number(req.query.hours ?? 168);
      const hours = Number.isFinite(hoursParam) && hoursParam > 0 ? Math.min(hoursParam, 24 * 90) : 168;
      const now = new Date();
      const from = new Date(now.getTime() - hours * 3_600_000).toISOString();
      const [counts, diffs, first, settings] = await Promise.all([
        db.execute(sql`
          SELECT actor_kind, category, SUM(n)::int AS n, SUM(decide_us_sum)::bigint AS us_sum, MAX(decide_us_max)::int AS us_max
          FROM pdp_shadow_counts WHERE hour >= date_trunc('hour', ${from}::timestamp)
          GROUP BY actor_kind, category ORDER BY actor_kind, category`),
        db.execute(sql`
          SELECT category, actor_kind, agent_id, tool_name, legacy_class, unified_class, unified_gate,
            COUNT(*)::int AS rows, MAX(legacy_reason) AS legacy_reason, MAX(unified_reason) AS unified_reason, MAX(created_at) AS last_at
          FROM pdp_shadow_diffs WHERE created_at >= ${from}::timestamp
          GROUP BY category, actor_kind, agent_id, tool_name, legacy_class, unified_class, unified_gate
          ORDER BY (category = 'unexpected') DESC, COUNT(*) DESC LIMIT 20`),
        db.execute(sql`SELECT MIN(hour) AS first_at FROM pdp_shadow_counts`),
        getPdpSettings(),
      ]);
      const firstAt = (first.rows as any[])[0]?.first_at;
      res.json(summarise({
        counts: counts.rows as unknown as CountRow[], diffs: diffs.rows as unknown as DiffRow[],
        firstComparisonAt: firstAt ? new Date(firstAt).toISOString() : null,
        now, hours, settings, process: pdpShadowStats(),
      }));
    } catch (err: any) {
      res.status(500).json({ message: `PDP shadow summary failed: ${err?.message ?? err}` });
    }
  });

  return router;
}
