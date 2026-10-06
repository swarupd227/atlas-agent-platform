/**
 * Anything that judges an agent from an eval suite's run history takes ORDINARY runs only.
 *
 * A repeated suite run (each case answered several times) scores strictly, so its pass rate is lower and
 * not on an ordinary run's scale. In "the latest run", "the previous run" or an average it shows as drift,
 * a regression, a failed canary stage, a blocked promotion or a critical KPI breach that is not real. It marks
 * itself in resultsJson.repeats (from the moment it is created), and the readers that judge go through
 * gradedSuiteRuns. These pin:
 *   - the rule itself (the marker, its absence, odd shapes);
 *   - one real route end to end: an outcome's eval pass rate on the flywheel page comes from the latest
 *     ORDINARY run of its suites, not from a newer repeated one, and not from one still running;
 *   - that every reader of eval_runs history in the server either filters or is a known display-only one, so a
 *     new unfiltered reader fails here instead of quietly joining the problem.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { gradedSuiteRuns, isGradedSuiteRun } from "../server/eval-run-scope";

const db = vi.hoisted(() => ({ suites: [] as any[], outcomes: [] as any[], agents: [] as any[], runs: [] as any[] }));

vi.mock("../server/storage", () => ({
  storage: {
    getEvalSuites: vi.fn(async () => db.suites),
    getOutcomes: vi.fn(async () => db.outcomes),
    getAgents: vi.fn(async () => db.agents),
    getOutcomeEvents: vi.fn(async () => []),
    getGoldenDatasets: vi.fn(async () => []),
    getAllEvalRuns: vi.fn(async () => db.runs),
    getEvalTestCases: vi.fn(async () => []),
    getGoldenTestCases: vi.fn(async () => []),
  },
}));
vi.mock("../server/auth", () => ({ getOrgId: () => "org1" }));
vi.mock("../server/permissions", () => ({ checkPermission: () => (_req: any, _res: any, next: any) => next() }));
vi.mock("../server/routes/helpers", () => ({ generateKpiAlignedEvalSuite: vi.fn() }));

const billing = (await import("../server/routes/billing")).default as any;

let server: Server;
let base = "";
const getJson = async (path: string) => (await fetch(`${base}${path}`)).json();

beforeEach(async () => {
  db.suites = [{ id: "s1", agentId: "a1" }];
  db.outcomes = [{ id: "o1", name: "Claims triage" }];
  db.agents = [{ id: "a1", outcomeId: "o1" }];
  db.runs = [];
  if (!server) {
    const app = express();
    app.use(express.json());
    app.use(billing);
    await new Promise<void>(res => { server = app.listen(0, () => { base = `http://127.0.0.1:${(server.address() as any).port}`; res(); }); });
  }
});
afterAll(() => { server?.close(); });

let n = 0;
const run = (over: Record<string, any> = {}) => ({ id: `r${++n}`, suiteId: "s1", agentId: "a1", status: "completed", passRate: 0.9, startedAt: "2026-10-01T00:00:00Z", resultsJson: {}, ...over });

describe("isGradedSuiteRun / gradedSuiteRuns", () => {
  it("keeps an ordinary run and sets a repeated one aside, in order", () => {
    const a = run(), b = run({ resultsJson: { repeats: 3 } }), c = run({ resultsJson: { repeats: 1 } }), d = run({ resultsJson: { repeats: 10 } });
    expect(gradedSuiteRuns([a, b, c, d]).map(r => r.id)).toEqual([a.id, c.id]);
  });

  it("treats a run with no marker, or an odd one, as ordinary", () => {
    for (const resultsJson of [null, undefined, {}, { mode: "prompt_level" }, { repeats: null }, { repeats: "3" }, "text", 7]) {
      expect(isGradedSuiteRun({ resultsJson })).toBe(true);
    }
    expect(isGradedSuiteRun({})).toBe(true);
  });

  it("sets aside a repeated run whichever state it is in: running, failed or completed", () => {
    for (const status of ["running", "failed", "completed"]) {
      expect(isGradedSuiteRun(run({ status, resultsJson: { repeats: 2 } }))).toBe(false);
    }
  });
});

describe("the flywheel page's eval pass rate for an outcome", () => {
  const evalPassRate = async () => (await getJson("/api/flywheel/metrics")).outcomeStatus[0].evalPassRate;

  it("comes from the latest ordinary run, not from a newer repeated run at a lower strict rate", async () => {
    db.runs = [
      run({ passRate: 0.9, startedAt: "2026-10-01T00:00:00Z" }),
      run({ passRate: 0.4, startedAt: "2026-10-03T00:00:00Z", resultsJson: { repeats: 3, stability: {} } }),
    ];
    expect(await evalPassRate()).toBe(0.9);
  });

  it("is not pulled to zero by a repeated run that is still running or failed", async () => {
    db.runs = [
      run({ passRate: 0.8, startedAt: "2026-10-01T00:00:00Z" }),
      run({ passRate: 0, status: "running", startedAt: "2026-10-04T00:00:00Z", resultsJson: { repeats: 5 } }),
      run({ passRate: 0, status: "failed", startedAt: "2026-10-05T00:00:00Z", resultsJson: { repeats: 5, error: "x" } }),
    ];
    expect(await evalPassRate()).toBe(0.8);
  });

  it("still takes the newest ordinary run", async () => {
    db.runs = [run({ passRate: 0.5, startedAt: "2026-09-01T00:00:00Z" }), run({ passRate: 0.7, startedAt: "2026-10-01T00:00:00Z" })];
    expect(await evalPassRate()).toBe(0.7);
  });

  it("is zero when the suite has only ever had repeated runs, as when it has had none", async () => {
    db.runs = [run({ passRate: 0.4, resultsJson: { repeats: 3 } })];
    expect(await evalPassRate()).toBe(0);
  });

  it("is a 0-1 fraction, rounded to two decimals, and the page shows it as a whole percent", async () => {
    db.runs = [run({ passRate: 11 / 12 })];
    expect(await evalPassRate()).toBe(0.92); // a fraction, not 91.67
    // The page scales it. Printed as it came, a 90% outcome read "0.9%".
    const page = readFileSync(new URL("../client/src/pages/billing.tsx", import.meta.url), "utf8");
    expect(page).toContain("{Math.round(os.evalPassRate * 100)}%");
    expect(page).not.toContain("os.evalPassRate.toFixed(1)");
    expect(Math.round(0.92 * 100)).toBe(92);
    expect(Math.round(0.9 * 100)).toBe(90);
  });
});

describe("every reader of eval_runs history either filters or is a known display-only one", () => {
  const serverDir = join(__dirname, "..", "server");
  const walk = (dir: string): string[] => readdirSync(dir).flatMap(f => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : [];
  });

  /** Reads that only list or look up runs for a person or a scope check, so they keep every run. */
  const displayOnly: Array<{ file: string; text: string; why: string }> = [
    { file: "tenant-scope.ts", text: "getAllEvalRuns()).find(", why: "looks one run up by id to scope it to an organization" },
    { file: "routes/agents.ts", text: "filterEvalRunsForOrg(await storage.getAllEvalRuns()", why: "GET /api/eval-runs lists the runs" },
    { file: "routes/evaluations.ts", text: "const runs = await storage.getEvalRuns(req.params.id)", why: "GET /api/evals/:id/runs lists the runs" },
  ];
  /** Reads that fetch everything and then filter the list before judging; the file must say so. */
  const filteredLater: Array<{ file: string; text: string; mustContain: string }> = [
    { file: "routes/billing.ts", text: "storage.getAllEvalRuns(),", mustContain: "gradedSuiteRuns(allEvalRuns)" },
    { file: "routes/improvements.ts", text: "const allEvalRuns = await storage.getAllEvalRuns();", mustContain: "gradedSuiteRuns(allEvalRuns)" },
    { file: "routes/runtime.ts", text: "const allEvalRuns = await storage.getAllEvalRuns();", mustContain: "gradedSuiteRuns(allEvalRuns)" },
  ];

  const reads = walk(serverDir)
    .filter(p => !p.endsWith("storage.ts"))
    .flatMap(p => readFileSync(p, "utf8").split(/\r?\n/).map((line, i) => ({ file: relative(serverDir, p).replace(/\\/g, "/"), line, no: i + 1 })))
    .filter(({ line }) => /\b(getEvalRuns|getEvalRunsBySuite|getAllEvalRuns)\(/.test(line) && !line.trim().startsWith("//") && !line.trim().startsWith("*"));

  it("finds the readers it is checking (so an empty scan cannot pass)", () => {
    expect(reads.length).toBeGreaterThanOrEqual(15);
  });

  it("has no reader that is neither filtered nor listed", () => {
    const unknown = reads.filter(({ file, line }) =>
      !line.includes("gradedSuiteRuns(")
      && !displayOnly.some(d => d.file === file && line.includes(d.text))
      && !filteredLater.some(d => d.file === file && line.includes(d.text)));
    expect(unknown.map(u => `${u.file}:${u.no}  ${u.line.trim()}`)).toEqual([]);
  });

  it("filters, further down, every list it fetched whole", () => {
    for (const f of filteredLater) {
      expect(readFileSync(join(serverDir, f.file), "utf8"), `${f.file} must call ${f.mustContain}`).toContain(f.mustContain);
    }
  });

  it("keeps the overview's backlog count over every run, since a repeated run in flight is real backlog", () => {
    const src = readFileSync(join(serverDir, "routes/runtime.ts"), "utf8");
    expect(src).toContain('const evalBacklog = allEvalRuns.filter((r) => r.status === "running" || r.status === "pending").length;');
  });
});
