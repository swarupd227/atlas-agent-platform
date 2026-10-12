/**
 * Kearney's data platform -- pipelines, datasets, reports, figures and the
 * lineage between them.
 *
 * **Read this before showing anything from here to the client.**
 *
 * The applications are real: every system named below appears in Attachment C.4
 * "Application Listing", with the criticality and user count the client stated.
 * Azure Data Factory / R&A Hub, the Cloud hosted datamart and the Oracle datamart
 * are their platform; SAP S/4 HANA, Workday, Salesforce, SAP Concur and SAP
 * SuccessFactors are their sources; Microsoft PowerBI, Anaplan, Alteryx and KNIME
 * are their consumers. Nothing here invents a system Kearney does not run.
 *
 * **The lineage is not.** The extracts carry no integration or dependency
 * records at all -- the estate connector says so in its own /gaps output, and the
 * release-scope journey reports it as a finding. So the pipelines, datasets,
 * reports and the edges between them are constructed: a plausible estate for
 * these applications, not a discovered one. /provenance says this in the
 * connector's own words, and every impact and trace answer carries the same
 * caveat in its payload, so a journey cannot quote a number from here without
 * also carrying where it came from.
 *
 * Why build it at all: three of the four live demonstrations turn on being able
 * to answer "what does this figure depend on" and "what breaks if this fails
 * tonight". Those questions have no answer in the supplied data. Seeding them
 * behind the integration point shows the capability and keeps the honest finding
 * -- that Kearney cannot answer them today -- intact and separately reportable.
 *
 * The estate keeps defects on purpose, the way the ITSM extract does: two
 * reports have no owner, one dataset is consumed but produced by no pipeline,
 * and one figure has never been verified. A journey that glosses over those is
 * doing the wrong thing, and these are what let a demonstration show it noticing.
 */
import { Router, type Request, type Response } from "express";

const router = Router();
const nowIso = () => new Date().toISOString();

// ── helpers ───────────────────────────────────────────────────────────────────
const str = (v: unknown): string => (v == null ? "" : String(v).trim());
const lower = (v: unknown): string => str(v).toLowerCase();
const clamp = (v: unknown, dflt: number, max: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), max) : dflt;
};

/** Said on every answer that rests on the constructed edges rather than on C.4. */
const LINEAGE_CAVEAT =
  "The applications here are Kearney's own, from Attachment C.4. The pipelines, datasets, reports and the lineage between them are constructed for this environment: the supplied extracts carry no integration or dependency records, so this estate shows what the capability looks like rather than what was discovered.";

// ── the estate ────────────────────────────────────────────────────────────────

interface Pipeline {
  name: string;
  /** The C.4 application that runs it. */
  platform: string;
  /** The C.4 application the data comes from. */
  source: string;
  /** Dataset names this pipeline produces. */
  produces: string[];
  schedule: string;
  owner_group: string;
  /** Minutes the run usually takes, for judging a late run. */
  typical_minutes: number;
}

interface Dataset {
  name: string;
  /** The C.4 application that stores it. */
  store: string;
  description: string;
  rows: number;
}

interface Report {
  name: string;
  /** The C.4 application it is built in. */
  tool: string;
  /** Dataset names it reads. */
  reads: string[];
  /** Null where the estate genuinely has no owner recorded -- two of these. */
  owner_group: string | null;
  audience: string;
}

interface Figure {
  name: string;
  /** The dataset the number is computed from. */
  dataset: string;
  unit: string;
  /** What the figure currently reads. */
  value: number;
  /** The last value a person signed off, and when. Null where never verified. */
  last_verified_value: number | null;
  last_verified_at: string | null;
  appears_in: string[];
}

const PIPELINES: Pipeline[] = [
  { name: "sap_finance_forecast_load", platform: "Azure Data Factory / R&A Hub / Cloud Datamart", source: "SAP S/4 HANA", produces: ["fct_revenue_forecast"], schedule: "daily 03:15 UTC", owner_group: "WW_SRVCNOW_AG_ADV_ANALYTICS_GG", typical_minutes: 38 },
  { name: "sap_actuals_daily", platform: "Azure Data Factory / R&A Hub / Cloud Datamart", source: "SAP S/4 HANA", produces: ["fct_revenue_actuals", "dim_client"], schedule: "daily 02:00 UTC", owner_group: "WW_SRVCNOW_AG_ADV_ANALYTICS_GG", typical_minutes: 52 },
  { name: "workday_headcount_daily", platform: "Azure Data Factory / R&A Hub / Cloud Datamart", source: "Workday", produces: ["fct_headcount", "dim_employee"], schedule: "daily 04:00 UTC", owner_group: "WW_SRVCNOW_AG_ADV_ANALYTICS_GG", typical_minutes: 21 },
  { name: "salesforce_pipeline_hourly", platform: "Azure Data Factory / R&A Hub / Cloud Datamart", source: "Salesforce", produces: ["fct_opportunity"], schedule: "hourly", owner_group: "WW_SRVCNOW_AG_ADV_ANALYTICS_GG", typical_minutes: 7 },
  { name: "concur_expense_daily", platform: "Azure Data Factory / R&A Hub / Cloud Datamart", source: "SAP Concur", produces: ["fct_expense"], schedule: "daily 05:30 UTC", owner_group: "WW_SRVCNOW_AG_GSCGHD_GG", typical_minutes: 16 },
  { name: "successfactors_talent_weekly", platform: "Azure Data Factory / R&A Hub / Cloud Datamart", source: "SAP SuccessFactors", produces: ["fct_talent_review"], schedule: "weekly Sun 06:00 UTC", owner_group: "WW_SRVCNOW_AG_ADV_ANALYTICS_GG", typical_minutes: 29 },
  { name: "alteryx_margin_prep", platform: "Alteryx", source: "Oracle datamart", produces: ["agg_margin_by_practice"], schedule: "daily 06:00 UTC", owner_group: "WW_SRVCNOW_AG_ADV_ANALYTICS_GG", typical_minutes: 24 },
  { name: "knime_attrition_model", platform: "KNIME", source: "Cloud hosted datamart", produces: ["agg_attrition_risk"], schedule: "weekly Mon 07:00 UTC", owner_group: "WW_SRVCNOW_AG_ADV_ANALYTICS_GG", typical_minutes: 41 },
  { name: "datamart_replication", platform: "Oracle datamart", source: "Cloud hosted datamart", produces: ["fct_revenue_actuals_replica"], schedule: "daily 07:00 UTC", owner_group: "WW_SRVCNOW_AG_GSAC_GG", typical_minutes: 33 },
  { name: "anaplan_plan_sync", platform: "Anaplan", source: "Cloud hosted datamart", produces: ["fct_plan_version"], schedule: "daily 08:00 UTC", owner_group: "WW_SRVCNOW_AG_GSCGHD_GG", typical_minutes: 12 },
];

const DATASETS: Dataset[] = [
  { name: "fct_revenue_forecast", store: "Cloud hosted datamart", description: "Forecast revenue by client and practice, current and prior version.", rows: 1_284_900 },
  { name: "fct_revenue_actuals", store: "Cloud hosted datamart", description: "Booked revenue by client, practice and period.", rows: 3_915_220 },
  { name: "fct_revenue_actuals_replica", store: "Oracle datamart", description: "Replica of booked revenue, served to the Oracle-side reports.", rows: 3_915_220 },
  { name: "dim_client", store: "Cloud hosted datamart", description: "Client master, with practice and region.", rows: 11_402 },
  { name: "dim_employee", store: "Cloud hosted datamart", description: "Employee master, with grade, office and practice.", rows: 9_815 },
  { name: "fct_headcount", store: "Cloud hosted datamart", description: "Headcount by office, practice and month.", rows: 412_880 },
  { name: "fct_opportunity", store: "Cloud hosted datamart", description: "Open and closed opportunities from Salesforce.", rows: 288_410 },
  { name: "fct_expense", store: "Oracle datamart", description: "Expense claims by employee and client code.", rows: 1_902_775 },
  { name: "fct_talent_review", store: "Cloud hosted datamart", description: "Talent review outcomes by employee and cycle.", rows: 48_220 },
  { name: "agg_margin_by_practice", store: "Cloud hosted datamart", description: "Margin by practice and month, prepared in Alteryx.", rows: 24_600 },
  { name: "agg_attrition_risk", store: "Cloud hosted datamart", description: "Modelled attrition risk by employee, scored weekly in KNIME.", rows: 9_815 },
  { name: "fct_plan_version", store: "Anaplan", description: "Plan versions synced back from Anaplan.", rows: 76_300 },
  // Consumed by a report, produced by no pipeline in this estate. Left in on
  // purpose: an impact answer that silently ignores it would be wrong, and a
  // journey that notices is doing the job.
  { name: "ref_fx_rates", store: "Cloud hosted datamart", description: "Currency rates. No pipeline in this estate produces it; it is understood to be loaded by hand.", rows: 4_380 },
];

const REPORTS: Report[] = [
  { name: "Partner Board Pack", tool: "Microsoft PowerBI", reads: ["fct_revenue_forecast", "fct_revenue_actuals", "agg_margin_by_practice", "ref_fx_rates"], owner_group: "WW_SRVCNOW_AG_ADV_ANALYTICS_GG", audience: "Partners" },
  { name: "Weekly Revenue Forecast", tool: "Microsoft PowerBI", reads: ["fct_revenue_forecast", "dim_client"], owner_group: "WW_SRVCNOW_AG_ADV_ANALYTICS_GG", audience: "Practice leadership" },
  { name: "Practice Margin Review", tool: "Microsoft PowerBI", reads: ["agg_margin_by_practice", "fct_revenue_actuals"], owner_group: "WW_SRVCNOW_AG_ADV_ANALYTICS_GG", audience: "Practice leadership" },
  { name: "Client Pipeline Review", tool: "Microsoft PowerBI", reads: ["fct_opportunity", "dim_client"], owner_group: "WW_SRVCNOW_AG_GSCGHD_GG", audience: "Client service teams" },
  { name: "Headcount and Attrition", tool: "Microsoft PowerBI", reads: ["fct_headcount", "dim_employee", "agg_attrition_risk"], owner_group: null, audience: "HR leadership" },
  { name: "Expense Exceptions", tool: "Microsoft PowerBI", reads: ["fct_expense"], owner_group: "WW_SRVCNOW_AG_GSCGHD_GG", audience: "Finance operations" },
  { name: "Talent Review Summary", tool: "Microsoft PowerBI", reads: ["fct_talent_review", "dim_employee"], owner_group: null, audience: "HR leadership" },
  { name: "Plan vs Actual", tool: "Anaplan", reads: ["fct_plan_version", "fct_revenue_actuals_replica"], owner_group: "WW_SRVCNOW_AG_GSCGHD_GG", audience: "Finance leadership" },
];

const FIGURES: Figure[] = [
  { name: "Q3 revenue forecast", dataset: "fct_revenue_forecast", unit: "USD millions", value: 412.8, last_verified_value: 408.2, last_verified_at: "2026-10-09T06:12:00Z", appears_in: ["Partner Board Pack", "Weekly Revenue Forecast"] },
  { name: "FY actuals to date", dataset: "fct_revenue_actuals", unit: "USD millions", value: 1148.6, last_verified_value: 1148.6, last_verified_at: "2026-10-12T06:40:00Z", appears_in: ["Partner Board Pack", "Practice Margin Review"] },
  { name: "Margin by practice", dataset: "agg_margin_by_practice", unit: "percent", value: 28.4, last_verified_value: 28.1, last_verified_at: "2026-10-11T07:05:00Z", appears_in: ["Partner Board Pack", "Practice Margin Review"] },
  { name: "Open pipeline value", dataset: "fct_opportunity", unit: "USD millions", value: 613.2, last_verified_value: 609.7, last_verified_at: "2026-10-12T05:20:00Z", appears_in: ["Client Pipeline Review"] },
  { name: "Headcount", dataset: "fct_headcount", unit: "people", value: 7042, last_verified_value: 7042, last_verified_at: "2026-10-12T05:00:00Z", appears_in: ["Partner Board Pack", "Headcount and Attrition"] },
  // Never verified by anyone. A journey asked to stand behind this number has
  // nothing to stand on, and should say so rather than quoting it.
  { name: "Modelled attrition risk", dataset: "agg_attrition_risk", unit: "percent", value: 11.6, last_verified_value: null, last_verified_at: null, appears_in: ["Headcount and Attrition"] },
];

// ── run history ───────────────────────────────────────────────────────────────

interface PipelineRun {
  pipeline: string;
  started_at: string;
  finished_at: string | null;
  status: "succeeded" | "failed" | "running";
  rows_written: number | null;
  minutes: number | null;
  message: string | null;
}

/**
 * Fourteen days of history per pipeline, generated once from a fixed seed so the
 * same question asked twice gets the same answer. A demonstration that moves
 * underneath the person watching it is worse than no demonstration.
 */
let runs: PipelineRun[] = [];
let built = false;

function mulberry(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The clock this estate runs against: fixed, so "last night" is always the same night. */
const TODAY = "2026-10-12";

function ensure(): void {
  if (built) return;
  built = true;
  const rand = mulberry(20261012);
  const out: PipelineRun[] = [];
  for (const p of PIPELINES) {
    const perDay = p.schedule === "hourly" ? 24 : p.schedule.startsWith("weekly") ? 0 : 1;
    const days = 14;
    for (let d = days; d >= 1; d--) {
      const date = new Date(`${TODAY}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() - d + 1);
      const count = perDay === 0 ? (date.getUTCDay() === 1 ? 1 : 0) : perDay;
      for (let k = 0; k < count; k++) {
        const hour = perDay === 24 ? k : Number((p.schedule.match(/(\d{2}):/) ?? [, "03"])[1]);
        const start = new Date(date);
        start.setUTCHours(hour, perDay === 24 ? 5 : Number((p.schedule.match(/:(\d{2})/) ?? [, "00"])[1]), 0, 0);
        const jitter = 0.82 + rand() * 0.5;
        const minutes = Math.max(1, Math.round(p.typical_minutes * jitter));
        const finished = new Date(start.getTime() + minutes * 60000);
        out.push({
          pipeline: p.name,
          started_at: start.toISOString(),
          finished_at: finished.toISOString(),
          status: "succeeded",
          rows_written: Math.round(40_000 + rand() * 900_000),
          minutes,
          message: null,
        });
      }
    }
  }
  runs = out.sort((a, b) => (a.started_at < b.started_at ? 1 : a.started_at > b.started_at ? -1 : 0));
}

// ── injected faults ───────────────────────────────────────────────────────────

/**
 * A demonstration control, not a model of anything.
 *
 * The first live demonstration is "you pick a failure card, we inject it". This
 * is how it is injected: the named pipeline's most recent run becomes a failure,
 * everything downstream of it goes stale, and the figures computed from those
 * datasets stop being safe to quote. /reset puts it all back. Injecting a fault
 * is recorded in the audit like any other write, so nobody can later mistake a
 * demonstrated failure for one the estate actually had.
 */
const injected = new Map<string, { at: string; message: string }>();

interface Write {
  undoId: string;
  kind: "quarantine" | "inject";
  key: string;
  before: Record<string, string>;
  after: Record<string, string>;
  approvalRef: string;
  at: string;
  undone: boolean;
}
const writes: Write[] = [];
const quarantined = new Map<string, { reason: string; at: string; approvalRef: string }>();

const pipelineByName = new Map(PIPELINES.map((p) => [p.name.toLowerCase(), p]));
const datasetByName = new Map(DATASETS.map((d) => [d.name.toLowerCase(), d]));
const figureByName = new Map(FIGURES.map((f) => [f.name.toLowerCase(), f]));
const reportByName = new Map(REPORTS.map((r) => [r.name.toLowerCase(), r]));

/** The pipeline that produces a dataset, or null where nothing in this estate does. */
const producerOf = (dataset: string): Pipeline | null =>
  PIPELINES.find((p) => p.produces.some((d) => d.toLowerCase() === dataset.toLowerCase())) ?? null;

function lastRun(pipeline: string): (PipelineRun & { injected?: boolean }) | null {
  ensure();
  const fault = injected.get(pipeline.toLowerCase());
  const latest = runs.find((r) => r.pipeline.toLowerCase() === pipeline.toLowerCase());
  if (!latest) return null;
  if (!fault) return latest;
  return { ...latest, status: "failed", finished_at: null, rows_written: null, minutes: null, message: fault.message, injected: true };
}

/** A dataset is stale when the pipeline that produces it last failed. */
function freshness(dataset: string) {
  const producer = producerOf(dataset);
  if (!producer) {
    return { dataset, produced_by: null as string | null, state: "unknown" as const, reason: "No pipeline in this estate produces this dataset, so its freshness cannot be established here." };
  }
  const run = lastRun(producer.name);
  if (!run) return { dataset, produced_by: producer.name, state: "unknown" as const, reason: "No run history for the pipeline that produces it." };
  return run.status === "succeeded"
    ? { dataset, produced_by: producer.name, state: "fresh" as const, as_at: run.finished_at, reason: null as string | null }
    : { dataset, produced_by: producer.name, state: "stale" as const, as_at: null, reason: `${producer.name} last run ${run.status}${run.message ? `: ${run.message}` : ""}.` };
}

function requireApproval(body: Record<string, any>, res: Response): string | null {
  const ref = str(body.approvalRef);
  if (!ref) {
    res.status(422).json({
      written: false,
      error: "approvalRef is required: the id of the approval a person gave for this change.",
      guidance: "Take the approval id from the gate that approved this step and pass it.",
    });
    return null;
  }
  return ref;
}

// ── reads ─────────────────────────────────────────────────────────────────────

/** What this connector is and, more importantly, what it is not. */
router.get("/provenance", (_req: Request, res: Response) => {
  res.json({
    applications_are_real: true,
    applications_source: 'Attachment C.4 "Application Listing"',
    lineage_is_constructed: true,
    why: "The supplied extracts carry no integration or dependency records. The estate connector reports that as a structural gap, and the release-scope journey reports it as a finding. This estate shows what the capability looks like once that data exists; it is not a discovery of Kearney's.",
    applications_used: [...new Set([...PIPELINES.map((p) => p.platform), ...PIPELINES.map((p) => p.source), ...REPORTS.map((r) => r.tool), ...DATASETS.map((d) => d.store)])].sort(),
    say_this_when_quoting: LINEAGE_CAVEAT,
  });
});

/** The shape of the estate in one call. */
router.get("/summary", (_req: Request, res: Response) => {
  ensure();
  const failing = PIPELINES.filter((p) => lastRun(p.name)?.status === "failed").map((p) => p.name);
  res.json({
    pipelines: PIPELINES.length,
    datasets: DATASETS.length,
    reports: REPORTS.length,
    figures: FIGURES.length,
    pipeline_runs_held: runs.length,
    pipelines_failing_now: failing,
    known_gaps: {
      reports_with_no_owner: REPORTS.filter((r) => !r.owner_group).map((r) => r.name),
      datasets_with_no_producer: DATASETS.filter((d) => !producerOf(d.name)).map((d) => d.name),
      figures_never_verified: FIGURES.filter((f) => !f.last_verified_at).map((f) => f.name),
    },
    provenance: LINEAGE_CAVEAT,
  });
});

router.get("/pipelines", (req: Request, res: Response) => {
  ensure();
  const status = lower(req.query.status);
  const rows = PIPELINES.map((p) => {
    const run = lastRun(p.name);
    return { ...p, last_run_status: run?.status ?? "unknown", last_run_started: run?.started_at ?? null, last_run_message: run?.message ?? null };
  }).filter((p) => !status || p.last_run_status === status);
  res.json({ matched: rows.length, of: PIPELINES.length, pipelines: rows });
});

router.get("/pipeline", (req: Request, res: Response) => {
  ensure();
  const p = pipelineByName.get(lower(req.query.name));
  if (!p) {
    res.status(404).json({ error: `No pipeline named "${str(req.query.name)}".`, known: PIPELINES.map((x) => x.name) });
    return;
  }
  const history = runs.filter((r) => r.pipeline === p.name).slice(0, clamp(req.query.limit, 10, 60));
  const run = lastRun(p.name);
  res.json({ pipeline: p, last_run: run, recent_runs: run?.injected ? [run, ...history.slice(1)] : history });
});

router.get("/datasets", (_req: Request, res: Response) => {
  ensure();
  res.json({ datasets: DATASETS.map((d) => ({ ...d, produced_by: producerOf(d.name)?.name ?? null, freshness: freshness(d.name) })) });
});

router.get("/reports", (_req: Request, res: Response) => {
  res.json({ reports: REPORTS });
});

/** Every figure, with whether it is currently safe to quote. */
router.get("/figures", (_req: Request, res: Response) => {
  ensure();
  res.json({
    figures: FIGURES.map((f) => {
      const fresh = freshness(f.dataset);
      const q = quarantined.get(f.name.toLowerCase());
      return {
        name: f.name, unit: f.unit, value: f.value, dataset: f.dataset,
        last_verified_value: f.last_verified_value, last_verified_at: f.last_verified_at,
        appears_in: f.appears_in,
        state: q ? "quarantined" : fresh.state === "stale" ? "not_safe_to_quote" : f.last_verified_at ? "safe_to_quote" : "never_verified",
        why: q ? q.reason : fresh.state === "stale" ? fresh.reason : f.last_verified_at ? null : "No one has ever verified this figure, so there is no last known good value to fall back to.",
      };
    }),
    provenance: LINEAGE_CAVEAT,
  });
});

/**
 * One figure, with the chain behind it.
 *
 * This is the "question a number" answer: where it comes from, whether the thing
 * that produces it ran, and what the last value a person actually stood behind
 * was. A figure whose pipeline failed is reported as not safe to quote, with the
 * last verified value beside it, rather than being quietly returned.
 */
router.get("/figure", (req: Request, res: Response) => {
  ensure();
  const f = figureByName.get(lower(req.query.name));
  if (!f) {
    res.status(404).json({ error: `No figure named "${str(req.query.name)}".`, known: FIGURES.map((x) => x.name) });
    return;
  }
  const fresh = freshness(f.dataset);
  const producer = producerOf(f.dataset);
  const run = producer ? lastRun(producer.name) : null;
  const q = quarantined.get(f.name.toLowerCase());
  const safe = !q && fresh.state === "fresh" && Boolean(f.last_verified_at);
  res.json({
    figure: f.name,
    unit: f.unit,
    current_value: f.value,
    safe_to_quote: safe,
    why_not: safe ? null : q ? q.reason : fresh.state === "stale" ? fresh.reason : "This figure has never been verified by anyone.",
    last_verified: f.last_verified_at ? { value: f.last_verified_value, at: f.last_verified_at } : null,
    chain: {
      dataset: f.dataset,
      stored_in: datasetByName.get(f.dataset.toLowerCase())?.store ?? null,
      produced_by: producer?.name ?? null,
      sourced_from: producer?.source ?? null,
      runs_on: producer?.platform ?? null,
      last_run: run ? { status: run.status, started_at: run.started_at, finished_at: run.finished_at, message: run.message } : null,
    },
    appears_in: f.appears_in,
    provenance: LINEAGE_CAVEAT,
  });
});

/**
 * What breaks if a pipeline fails.
 *
 * The "ask the estate" answer: the datasets it produces, the reports that read
 * them, who owns those reports and who reads them. Reports with no owner are
 * returned as such rather than dropped -- the question "who do I tell" has a
 * real answer of "nobody is recorded", and that is the useful finding.
 */
router.get("/impact", (req: Request, res: Response) => {
  ensure();
  const name = str(req.query.pipeline);
  const p = pipelineByName.get(name.toLowerCase());
  if (!p) {
    res.status(404).json({ error: `No pipeline named "${name}".`, known: PIPELINES.map((x) => x.name) });
    return;
  }
  const datasets = p.produces;
  const affectedReports = REPORTS.filter((r) => r.reads.some((d) => datasets.includes(d)));
  // A dataset feeding another pipeline carries the failure one hop further.
  const downstreamPipelines = PIPELINES.filter((x) => x.name !== p.name && datasets.includes(x.source) === false && x.source && datasets.some((d) => datasetByName.get(d.toLowerCase())?.store === x.source));
  const affectedFigures = FIGURES.filter((f) => datasets.includes(f.dataset));
  res.json({
    pipeline: p.name,
    runs_on: p.platform,
    owner_group: p.owner_group,
    datasets_it_produces: datasets,
    reports_affected: affectedReports.map((r) => ({ report: r.name, tool: r.tool, owner_group: r.owner_group, audience: r.audience, owner_recorded: Boolean(r.owner_group) })),
    figures_affected: affectedFigures.map((f) => ({ figure: f.name, appears_in: f.appears_in, last_verified_at: f.last_verified_at })),
    downstream_pipelines: downstreamPipelines.map((x) => x.name),
    reports_with_no_owner: affectedReports.filter((r) => !r.owner_group).map((r) => r.name),
    answered_in_ms_from: "the lineage held here",
    provenance: LINEAGE_CAVEAT,
  });
});

// ── writes ────────────────────────────────────────────────────────────────────

/**
 * Inject a pipeline failure, for a demonstration.
 *
 * Recorded in the audit as a write, so a failure that was staged can never be
 * read afterwards as a failure that happened.
 */
router.post("/inject-failure", (req: Request, res: Response) => {
  ensure();
  const body = (req.body || {}) as Record<string, any>;
  const p = pipelineByName.get(lower(body.pipeline));
  if (!p) {
    res.status(404).json({ injected: false, error: `No pipeline named "${str(body.pipeline)}".`, known: PIPELINES.map((x) => x.name) });
    return;
  }
  const message = str(body.message) || "Source extract did not arrive; the load stopped before writing any rows.";
  injected.set(p.name.toLowerCase(), { at: nowIso(), message });
  const write: Write = { undoId: `undo-${writes.length + 1}`, kind: "inject", key: p.name, before: { status: "succeeded" }, after: { status: "failed", message }, approvalRef: str(body.approvalRef) || "(demonstration control)", at: nowIso(), undone: false };
  writes.push(write);
  res.json({
    injected: true,
    pipeline: p.name,
    message,
    now_stale: p.produces,
    figures_now_unsafe: FIGURES.filter((f) => p.produces.includes(f.dataset)).map((f) => f.name),
    undoId: write.undoId,
    note: "This is a staged failure for a demonstration. It is recorded in /audit as such, and /reset removes it.",
  });
});

/**
 * Stop a figure being quoted, with a reason and a person's approval.
 *
 * What the first demonstration is really about: the assistant refuses the bad
 * number. Refusing in the moment is worth little if the next person asks the
 * same question an hour later, so the refusal is recorded against the figure.
 */
router.post("/figure/quarantine", (req: Request, res: Response) => {
  const body = (req.body || {}) as Record<string, any>;
  const f = figureByName.get(lower(body.figure));
  if (!f) {
    res.status(404).json({ written: false, error: `No figure named "${str(body.figure)}".`, known: FIGURES.map((x) => x.name) });
    return;
  }
  const reason = str(body.reason);
  if (!reason) {
    res.status(422).json({ written: false, error: "reason is required: why this figure must not be quoted.", guidance: "Say what is wrong with it in a sentence the person reading the report would understand." });
    return;
  }
  const approvalRef = requireApproval(body, res);
  if (!approvalRef) return;
  const before = quarantined.get(f.name.toLowerCase());
  quarantined.set(f.name.toLowerCase(), { reason, at: nowIso(), approvalRef });
  const write: Write = { undoId: `undo-${writes.length + 1}`, kind: "quarantine", key: f.name, before: { reason: before?.reason ?? "" }, after: { reason }, approvalRef, at: nowIso(), undone: false };
  writes.push(write);
  res.json({ written: true, figure: f.name, reason, approvalRef, undoId: write.undoId, last_verified: f.last_verified_at ? { value: f.last_verified_value, at: f.last_verified_at } : null, guidance: `Recorded against approval ${approvalRef}. Pass ${write.undoId} to /rollback to lift it.` });
});

router.post("/rollback", (req: Request, res: Response) => {
  const undoId = str((req.body || {}).undoId);
  const write = writes.find((w) => w.undoId === undoId);
  if (!write) {
    res.status(404).json({ undone: false, error: `No write with undo id "${undoId}".`, known: writes.map((w) => w.undoId) });
    return;
  }
  if (write.undone) {
    res.status(409).json({ undone: false, error: `${undoId} has already been rolled back.` });
    return;
  }
  if (write.kind === "inject") injected.delete(write.key.toLowerCase());
  else if (write.before.reason) quarantined.set(write.key.toLowerCase(), { reason: write.before.reason, at: nowIso(), approvalRef: write.approvalRef });
  else quarantined.delete(write.key.toLowerCase());
  write.undone = true;
  res.json({ undone: true, undoId, kind: write.kind, key: write.key });
});

router.get("/audit", (_req: Request, res: Response) => {
  res.json({
    writes: writes.map((w) => ({ undoId: w.undoId, kind: w.kind, key: w.key, before: w.before, after: w.after, approvalRef: w.approvalRef, at: w.at, undone: w.undone })),
    staged_failures: [...injected.entries()].map(([pipeline, v]) => ({ pipeline, ...v })),
    note: "A staged failure is listed here so it cannot later be read as one the estate actually had.",
  });
});

router.post("/reset", (_req: Request, res: Response) => {
  const dropped = { writes: writes.length, staged_failures: injected.size, quarantined: quarantined.size };
  writes.length = 0;
  injected.clear();
  quarantined.clear();
  res.json({ reset: true, dropped });
});

export default router;
