/**
 * Astra services for the Evaluation pack, over Eval Studio only (the
 * organization-scoped eval system). Every read keeps rows whose organization
 * is the caller's: stricter than the routes, which also show records with no
 * organization.
 */
import { storage } from "../storage";
import { startEvalRun, summarizeMetrics } from "../eval-runs";
import { pickRegressionBaseline, regressionCheck } from "../eval-regression";

const TERMINAL = new Set(["completed", "failed", "cancelled"]);

const runView = (r: any) => ({
  id: r.id,
  agentId: r.agentId,
  datasetId: r.datasetId,
  status: r.status,
  totalGoldens: r.totalGoldens ?? 0,
  passed: r.passedCount ?? 0,
  failed: r.failedCount ?? 0,
  pending: r.pendingCount ?? 0,
  running: r.runningCount ?? 0,
  passRate: r.passRate ?? null,
  gate: ((r.tags as string[] | null) ?? []).find((t) => t.startsWith("gate:")) ?? null,
  costUsd: r.costUsd ?? null,
  avgLatencyMs: r.avgLatencyMs ?? null,
  startedAt: r.startedAt ? new Date(r.startedAt).toISOString() : null,
  completedAt: r.completedAt ? new Date(r.completedAt).toISOString() : null,
});

async function datasetInOrg(orgId: string, datasetId: string) {
  const d = await storage.getEvalDataset(datasetId);
  return d && d.organizationId === orgId ? d : null;
}

async function runInOrg(orgId: string, runId: string) {
  const r = await storage.getEvalTestRun(runId);
  return r && r.organizationId === orgId ? r : null;
}

async function listEvalDatasets(orgId: string, agentId?: string) {
  const rows = await storage.getEvalDatasets({ organizationId: orgId, ...(agentId ? { agentId } : {}) });
  return rows
    .filter((d) => d.organizationId === orgId)
    .map((d) => ({ id: d.id, name: d.name, agentId: d.agentId ?? null, goldenCount: d.goldenCount ?? 0, version: d.version, description: d.description ?? null }));
}

async function listEvalRuns(orgId: string, agentId: string, limit = 10) {
  const rows = (await storage.getEvalTestRuns({ organizationId: orgId, agentId })).filter((r) => r.organizationId === orgId);
  return rows
    .sort((a, b) => new Date(b.startedAt ?? 0).getTime() - new Date(a.startedAt ?? 0).getTime())
    .slice(0, limit)
    .map(runView);
}

async function getEvalRunSummary(orgId: string, runId: string) {
  const run = await runInOrg(orgId, runId);
  if (!run) return null;
  const traces = await storage.getEvalTraces({ runId: run.id, limit: 500 });
  const dataset = await storage.getEvalDataset(run.datasetId);
  const agent = await storage.getAgent(run.agentId, orgId);
  return { run: runView(run), metrics: summarizeMetrics(traces), dataset: dataset ? { id: dataset.id, name: dataset.name } : null, agent: agent ? { id: agent.id, name: agent.name } : null };
}

async function startEvalRunAs(orgId: string, agentId: string, datasetId: string, actor: string) {
  const [agent, dataset] = await Promise.all([storage.getAgent(agentId, orgId), datasetInOrg(orgId, datasetId)]);
  if (!agent || agent.organizationId !== orgId) throw new Error("No agent with that id in this organization.");
  if (!dataset) throw new Error("No eval dataset with that id in this organization.");
  if (!dataset.goldenCount) throw new Error(`The dataset ${dataset.name} has no cases to run.`);
  const run = await startEvalRun({ orgId, agentId: agent.id, dataset, triggeredBy: `${actor} (Astra Workspace)` });
  await storage.createAuditEvent({
    organizationId: orgId,
    actorType: "user",
    actorId: actor,
    action: "eval_run_started",
    objectType: "eval_test_run",
    objectId: run.id,
    details: `Eval run of ${agent.name} on ${dataset.name} (${dataset.goldenCount} cases) started by ${actor} (via Astra Workspace)`,
  });
  return runView(run);
}

/**
 * Follow a run until it finishes or the cap passes, reporting progress when the
 * counts change. The run keeps going in the worker either way.
 */
async function watchEvalRun(orgId: string, runId: string, onProgress: (label: string) => void, capMs = 4 * 60_000, everyMs = 5_000) {
  const until = Date.now() + capMs;
  let last = "";
  while (true) {
    const run = await runInOrg(orgId, runId);
    if (!run) throw new Error("That eval run isn't in this organization.");
    const view = runView(run);
    const done = view.passed + view.failed;
    const label = `${done} of ${view.totalGoldens} cases scored (${view.passed} passed)`;
    if (label !== last) {
      onProgress(label);
      last = label;
    }
    if (TERMINAL.has(view.status)) return { ...view, finished: true };
    if (Date.now() >= until) return { ...view, finished: false };
    await new Promise((r) => setTimeout(r, everyMs));
  }
}

/** A run against the previous completed run for the same agent (or a named one), per metric. */
async function compareEvalRuns(orgId: string, runId: string, againstId?: string, windowPct = 5) {
  const run = await runInOrg(orgId, runId);
  if (!run) return null;
  let baseline = againstId ? await runInOrg(orgId, againstId) : null;
  if (!againstId) {
    const history = (await storage.getEvalTestRuns({ organizationId: orgId, agentId: run.agentId })).filter((r) => r.organizationId === orgId);
    baseline = pickRegressionBaseline(history, run.id);
  }
  if (!baseline) return { run: runView(run), baseline: null };
  const [a, b] = await Promise.all([storage.getEvalTraces({ runId: run.id, limit: 500 }), storage.getEvalTraces({ runId: baseline.id, limit: 500 })]);
  const now = summarizeMetrics(a);
  const before = new Map(summarizeMetrics(b).map((m) => [m.metric, m]));
  const metrics = now.map((m) => ({
    metric: m.metric,
    passRate: m.passRate,
    baselinePassRate: before.get(m.metric)?.passRate ?? null,
    deltaPct: m.passRate != null && before.get(m.metric)?.passRate != null ? Math.round((m.passRate - before.get(m.metric)!.passRate!) * 1000) / 10 : null,
  }));
  const check = regressionCheck(baseline.passRate, run.passRate, windowPct);
  return {
    run: runView(run),
    baseline: runView(baseline),
    passRateDeltaPct: check.dropPct == null ? null : Math.round(-check.dropPct * 10) / 10,
    regressed: check.regressed,
    windowPct,
    sameDataset: run.datasetId === baseline.datasetId,
    metrics,
  };
}

/** Failed cases with the judge's reasoning per metric, from the run's traces and spans. */
async function evalFailures(orgId: string, runId: string, limit = 8) {
  const run = await runInOrg(orgId, runId);
  if (!run) return null;
  const failed = await storage.getEvalTraces({ runId: run.id, limit, passFail: false });
  const cases = await Promise.all(
    failed.map(async (t) => {
      const [golden, spans] = await Promise.all([storage.getEvalGolden(t.goldenId).catch(() => undefined), storage.getEvalSpans(t.id).catch(() => [])]);
      const metrics = spans
        .filter((s) => s.name.startsWith("metric:") || s.name === "overall")
        .map((s) => {
          const at = (s.attributes ?? {}) as Record<string, any>;
          return { metric: at.metricName ?? s.name.replace(/^metric:/, ""), score: (s.outputs as any)?.score ?? null, threshold: at.threshold ?? null, pass: at.pass ?? null, reason: typeof at.reason === "string" ? at.reason.slice(0, 600) : null };
        });
      return {
        traceId: t.id,
        input: golden?.input?.slice(0, 500) ?? null,
        expectedOutput: golden?.expectedOutput?.slice(0, 500) ?? null,
        agentFailed: !!t.agentFailed,
        agentFailureReason: t.agentFailureReason ?? null,
        scores: t.scores ?? null,
        metrics,
      };
    }),
  );
  return { run: runView(run), shown: cases.length, failedTotal: run.failedCount ?? cases.length, cases };
}

export const evalServices = {
  listEvalDatasets,
  listEvalRuns,
  getEvalRunSummary,
  startEvalRunAs,
  watchEvalRun,
  compareEvalRuns,
  evalFailures,
};
