/**
 * Built-in calculations: arithmetic the platform does, so an agent reports a
 * number it computed rather than one it recalled.
 *
 * The first tool is loss_forecast, the three techniques of a risk manager's
 * loss forecast: probability analysis (chance of loss and the rules for
 * combining events), least-squares regression with its fit and a prediction
 * interval, and a distribution forecast with a confidence interval. Every
 * answer carries the arithmetic as lines of text, so the agent can show its
 * working and a reviewer can check it.
 *
 * Same shape as the document tools: a synthetic server on the ordinary tool
 * surface, dispatched in-process by tool-dispatcher.ts after every gate has
 * run, and offered only to an agent whose skill asks for it. The grant is the
 * skill naming the tool: a skill whose procedure says "call loss_forecast" is
 * granting it, and no agent's tool surface changes until a skill does.
 */
import type { AvailableTool } from "./tool-dispatcher";
import type { Skill } from "@shared/schema";

export const BUILTIN_CALCULATION_SERVER_ID = "builtin:calculations";
const BUILTIN_CALCULATION_SERVER_NAME = "Calculations";
export const LOSS_FORECAST_TOOL = "loss_forecast";

/** A skill grants the calculation tools by naming one in its procedure. */
export function skillGrantsCalculationTools(skill: Skill): boolean {
  if (skill.status !== "active") return false;
  return new RegExp(`\\b${LOSS_FORECAST_TOOL}\\b`).test(String(skill.markdownBody ?? ""));
}

const LOSS_FORECAST_SCHEMA = {
  type: "object",
  properties: {
    method: { type: "string", enum: ["probability", "regression", "distribution"], description: "Which forecast to compute." },
    events: { type: "number", description: "probability: X, the number of events expected in the period (e.g. 100 damaged vehicles)." },
    exposureUnits: { type: "number", description: "probability: N, the number of exposure units (e.g. 500 vehicles). P = X / N." },
    rule: { type: "string", enum: ["independent_product", "conditional_product", "exclusive_sum", "union"], description: "probability: how to combine the probabilities given. independent_product = P(A)xP(B); conditional_product = P(A)xP(B given A); exclusive_sum = P(A)+P(B) for mutually exclusive events; union = P(A)+P(B)-P(A)xP(B) for independent events that can both occur." },
    probabilities: { type: "array", items: { type: "number" }, description: "probability: the probabilities to combine, as fractions (0.05) or percents (5); two or more." },
    conditionalProbability: { type: "number", description: "probability, conditional_product: P(B given A), fraction or percent." },
    x: { type: "array", items: { type: "number" }, description: "regression: the independent variable, one per period (payroll, fleet size, miles)." },
    y: { type: "array", items: { type: "number" }, description: "regression: the dependent variable, one per period (claims)." },
    predictAt: { type: "array", items: { type: "number" }, description: "regression: the x values to forecast for (next year's payroll)." },
    mean: { type: "number", description: "distribution: the mean of the loss count or severity." },
    standardDeviation: { type: "number", description: "distribution: its standard deviation." },
    confidence: { type: "number", enum: [90, 95, 99], description: "distribution or regression: the confidence level for the interval; default 95." },
    severity: { type: "number", description: "distribution, optional: average severity per event, to turn a count interval into a loss interval." },
    sampleSize: { type: "number", description: "distribution, optional: how many observations the mean and standard deviation rest on; echoed so the forecast can state it." },
  },
  required: ["method"],
} as const;

export function calculationToolsForSkills(skills: Skill[]): AvailableTool[] {
  if (!skills.some(skillGrantsCalculationTools)) return [];
  return [{
    serverId: BUILTIN_CALCULATION_SERVER_ID,
    serverName: BUILTIN_CALCULATION_SERVER_NAME,
    serverUrl: "",
    toolName: LOSS_FORECAST_TOOL,
    toolDescription:
      "Compute a loss forecast deterministically and get the arithmetic back. method=probability: chance of loss from events and exposure units (P = X/N) and the combination of two or more probabilities by rule (independent product, conditional product, mutually exclusive sum, or the at-least-one union that subtracts the overlap). " +
      "method=regression: least-squares fit of y on x with slope, intercept, R-square and a prediction with its interval at the x values asked for. method=distribution: a normal-distribution interval around a mean with a standard deviation at 90, 95 or 99 percent, and the loss interval when a severity is given. " +
      "Use it for every probability, forecast or expected-loss figure instead of computing in prose; report the arithmetic lines it returns.",
    toolInputSchema: LOSS_FORECAST_SCHEMA,
  }];
}

export function isBuiltinCalculationTool(tool: AvailableTool): boolean {
  return tool.serverId === BUILTIN_CALCULATION_SERVER_ID;
}

// ---- the arithmetic, pure and exported for tests ----------------------------

const round = (v: number, places = 6): number => Number(v.toFixed(places));
const pct = (v: number): string => `${round(v * 100, 4)} percent`;

/** Accepts 0.05 or 5 (read as a percent) and returns a fraction; rejects anything else. */
export function asFraction(value: unknown, label: string): { value: number; note?: string } | { error: string } {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return { error: `${label} must be a number from 0 to 1 (or 0 to 100 as a percent); got ${String(value)}.` };
  if (n <= 1) return { value: n };
  if (n <= 100) return { value: n / 100, note: `${label} ${n} read as ${n} percent (${n / 100}).` };
  return { error: `${label} is ${n}; a probability cannot exceed 100 percent.` };
}

export function probabilityOfLoss(events: number, exposureUnits: number): { probability: number; arithmetic: string[] } | { error: string } {
  if (!Number.isFinite(events) || !Number.isFinite(exposureUnits) || exposureUnits <= 0 || events < 0) return { error: "events must be 0 or more and exposureUnits must be above 0." };
  if (events > exposureUnits) return { error: `events (${events}) exceed exposure units (${exposureUnits}); a probability cannot exceed 1. If more than one event per unit is possible, forecast the count with method=distribution.` };
  const p = events / exposureUnits;
  return { probability: round(p), arithmetic: [`P = X / N = ${events} / ${exposureUnits} = ${round(p)} (${pct(p)})`] };
}

export type CombineRule = "independent_product" | "conditional_product" | "exclusive_sum" | "union";

export function combineProbabilities(rule: CombineRule, probabilities: number[], conditional?: number): { probability: number; arithmetic: string[]; meaning: string } | { error: string } {
  const ps = probabilities.map((v, i) => asFraction(v, `probability ${i + 1}`));
  const bad = ps.find((x): x is { error: string } => "error" in x); if (bad) return bad;
  const vals = ps.map((x) => (x as { value: number }).value); const notes = ps.map((x) => (x as { note?: string }).note).filter(Boolean) as string[];
  if (vals.length < 2 && rule !== "conditional_product") return { error: "give two or more probabilities to combine." };
  const f = (v: number) => round(v);
  switch (rule) {
    case "independent_product": {
      const p = vals.reduce((a, b) => a * b, 1);
      return { probability: f(p), meaning: "the probability that all the events occur, for independent events", arithmetic: [...notes, `P(all) = ${vals.map(f).join(" x ")} = ${f(p)} (${pct(p)})`] };
    }
    case "conditional_product": {
      const c = asFraction(conditional, "conditionalProbability"); if ("error" in c) return { error: `conditional_product needs conditionalProbability, P(B given A): ${c.error}` };
      const a = vals[0]; const p = a * c.value;
      return { probability: f(p), meaning: "the probability that both dependent events occur: P(A) x P(B given A)", arithmetic: [...notes, ...(c.note ? [c.note] : []), `P(both) = P(A) x P(B given A) = ${f(a)} x ${f(c.value)} = ${f(p)} (${pct(p)})`, ...(vals[1] !== undefined ? [`Note: the unconditional P(B) = ${f(vals[1])} is NOT used; multiplying ${f(a)} x ${f(vals[1])} = ${f(a * vals[1])} would understate dependent events.`] : [])] };
    }
    case "exclusive_sum": {
      const p = vals.reduce((a, b) => a + b, 0);
      if (p > 1) return { error: `the probabilities sum to ${f(p)}, above 1, so the events cannot be mutually exclusive as given.` };
      return { probability: f(p), meaning: "the probability that one of the mutually exclusive events occurs: the probabilities add", arithmetic: [...notes, `P(either) = ${vals.map(f).join(" + ")} = ${f(p)} (${pct(p)})`, "Valid only because the events exclude each other; if both could occur, use rule=union."] };
    }
    case "union": {
      const noneHappen = vals.reduce((a, b) => a * (1 - b), 1); const p = 1 - noneHappen;
      const lines = [...notes];
      if (vals.length === 2) { const both = vals[0] * vals[1]; lines.push(`P(both) = ${f(vals[0])} x ${f(vals[1])} = ${f(both)}`, `P(at least one) = ${f(vals[0])} + ${f(vals[1])} - ${f(both)} = ${f(p)} (${pct(p)})`, `Adding alone (${f(vals[0] + vals[1])}) would double count the ${f(both)} where both occur.`); }
      else lines.push(`P(at least one) = 1 - product of (1 - p) = 1 - ${vals.map((v) => f(1 - v)).join(" x ")} = ${f(p)} (${pct(p)})`);
      return { probability: f(p), meaning: "the probability that at least one of the independent, non-exclusive events occurs", arithmetic: lines };
    }
    default: return { error: `unknown rule ${String(rule)}` };
  }
}

/** Two-sided 95 percent t critical values by degrees of freedom; 1.96 beyond 30. */
const T95: Record<number, number> = { 1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228, 11: 2.201, 12: 2.179, 13: 2.160, 14: 2.145, 15: 2.131, 16: 2.120, 17: 2.110, 18: 2.101, 19: 2.093, 20: 2.086, 21: 2.080, 22: 2.074, 23: 2.069, 24: 2.064, 25: 2.060, 26: 2.056, 27: 2.052, 28: 2.048, 29: 2.045, 30: 2.042 };
const T90: Record<number, number> = { 1: 6.314, 2: 2.920, 3: 2.353, 4: 2.132, 5: 2.015, 6: 1.943, 7: 1.895, 8: 1.860, 9: 1.833, 10: 1.812, 11: 1.796, 12: 1.782, 13: 1.771, 14: 1.761, 15: 1.753, 16: 1.746, 17: 1.740, 18: 1.734, 19: 1.729, 20: 1.725, 21: 1.721, 22: 1.717, 23: 1.714, 24: 1.711, 25: 1.708, 26: 1.706, 27: 1.703, 28: 1.701, 29: 1.699, 30: 1.697 };
const T99: Record<number, number> = { 1: 63.657, 2: 9.925, 3: 5.841, 4: 4.604, 5: 4.032, 6: 3.707, 7: 3.499, 8: 3.355, 9: 3.250, 10: 3.169, 11: 3.106, 12: 3.055, 13: 3.012, 14: 2.977, 15: 2.947, 16: 2.921, 17: 2.898, 18: 2.878, 19: 2.861, 20: 2.845, 21: 2.831, 22: 2.819, 23: 2.807, 24: 2.797, 25: 2.787, 26: 2.779, 27: 2.771, 28: 2.763, 29: 2.756, 30: 2.750 };
const Z: Record<number, number> = { 90: 1.645, 95: 1.96, 99: 2.576 };
const tCritical = (df: number, confidence: 90 | 95 | 99): number => { const table = confidence === 90 ? T90 : confidence === 99 ? T99 : T95; return df <= 30 ? table[Math.max(1, df)] : Z[confidence]; };

export function linearRegression(x: number[], y: number[], predictAt: number[] = [], confidence: 90 | 95 | 99 = 95) {
  if (!Array.isArray(x) || !Array.isArray(y) || x.length !== y.length) return { error: "x and y must be arrays of the same length." } as const;
  if (x.length < 3) return { error: `at least three points are needed to fit a line and judge its fit; got ${x.length}.` } as const;
  if (![...x, ...y].every((v) => Number.isFinite(v))) return { error: "x and y must hold numbers only." } as const;
  const n = x.length;
  const sx = x.reduce((a, b) => a + b, 0), sy = y.reduce((a, b) => a + b, 0);
  const sxy = x.reduce((a, v, i) => a + v * y[i], 0), sxx = x.reduce((a, v) => a + v * v, 0);
  const denom = n * sxx - sx * sx;
  if (denom === 0) return { error: "x does not vary, so no line can be fitted." } as const;
  const slope = (n * sxy - sx * sy) / denom; const intercept = (sy - slope * sx) / n;
  const xbar = sx / n, ybar = sy / n;
  const fitted = x.map((v) => intercept + slope * v);
  const sse = y.reduce((a, v, i) => a + (v - fitted[i]) ** 2, 0); const sst = y.reduce((a, v) => a + (v - ybar) ** 2, 0);
  const rSquare = sst === 0 ? 1 : 1 - sse / sst;
  const df = n - 2; const s = Math.sqrt(sse / df); const Sxx = x.reduce((a, v) => a + (v - xbar) ** 2, 0);
  const t = tCritical(df, confidence);
  const predictions = predictAt.map((x0) => {
    const yhat = intercept + slope * x0; const sePred = s * Math.sqrt(1 + 1 / n + (x0 - xbar) ** 2 / Sxx);
    return { x: x0, forecast: round(yhat, 3), interval: { confidence, lower: round(yhat - t * sePred, 3), upper: round(yhat + t * sePred, 3) }, extrapolated: x0 < Math.min(...x) || x0 > Math.max(...x) };
  });
  const arithmetic = [
    `n = ${n}; sum x = ${round(sx, 4)}; sum y = ${round(sy, 4)}; sum xy = ${round(sxy, 4)}; sum x^2 = ${round(sxx, 4)}`,
    `slope B1 = (n sum xy - sum x sum y) / (n sum x^2 - (sum x)^2) = ${round(slope, 6)}`,
    `intercept B0 = (sum y - B1 sum x) / n = ${round(intercept, 4)}`,
    `R-square = 1 - SSE/SST = 1 - ${round(sse, 4)}/${round(sst, 4)} = ${round(rSquare, 4)}`,
    `standard error of estimate s = sqrt(SSE/(n-2)) = ${round(s, 4)}; t(${df} df, ${confidence} percent) = ${t}`,
    ...predictions.map((p) => `forecast at x = ${p.x}: ${round(intercept, 4)} + ${round(slope, 6)} x ${p.x} = ${p.forecast}; ${confidence} percent prediction interval ${p.interval.lower} to ${p.interval.upper}${p.extrapolated ? " (outside the fitted range: extrapolation)" : ""}`),
  ];
  return { n, slope: round(slope, 6), intercept: round(intercept, 4), rSquare: round(rSquare, 4), standardError: round(s, 4), predictions, fitQuality: rSquare >= 0.9 ? "close" : rSquare >= 0.5 ? "moderate" : "weak", arithmetic } as const;
}

export function normalInterval(mean: number, standardDeviation: number, confidence: 90 | 95 | 99 = 95, severity?: number, sampleSize?: number) {
  if (!Number.isFinite(mean) || !Number.isFinite(standardDeviation) || standardDeviation < 0) return { error: "mean and standardDeviation must be numbers, with the standard deviation 0 or more." } as const;
  const z = Z[confidence] ?? 1.96; const half = z * standardDeviation;
  const lower = round(mean - half, 4), upper = round(mean + half, 4);
  const arithmetic = [
    `${confidence} percent interval = mean +/- z x standard deviation = ${mean} +/- ${z} x ${standardDeviation} = ${mean} +/- ${round(half, 4)}`,
    `interval: ${lower} to ${upper}`,
    ...(severity !== undefined && Number.isFinite(severity) ? [`expected loss = mean x severity = ${mean} x ${severity} = ${round(mean * severity, 2)}; loss interval ${round(Math.max(0, lower) * severity, 2)} to ${round(upper * severity, 2)}`] : []),
    ...(sampleSize !== undefined ? [`parameters rest on ${sampleSize} observations${Number(sampleSize) < 30 ? " (a small sample: treat the interval as approximate)" : ""}`] : ["sample size not given: state it, or say the interval assumes a large sample"]),
    "assumes the normal shape and a stable exposure base",
  ];
  return { confidence, z, mean, standardDeviation, lower, upper, ...(severity !== undefined && Number.isFinite(severity) ? { expectedLoss: round(mean * severity, 2), lossInterval: { lower: round(Math.max(0, lower) * severity, 2), upper: round(upper * severity, 2) } } : {}), sampleSize: sampleSize ?? null, arithmetic } as const;
}

// ---- the tool -------------------------------------------------------------

export async function executeBuiltinCalculationTool(toolName: string, args: Record<string, any>, _ctx: { orgId?: string | null; agentId?: string }): Promise<any> {
  if (toolName !== LOSS_FORECAST_TOOL) throw new Error(`Unknown calculation tool "${toolName}"`);
  const method = String(args?.method ?? "");
  const confidence = ([90, 95, 99] as const).includes(Number(args?.confidence) as 90 | 95 | 99) ? (Number(args.confidence) as 90 | 95 | 99) : 95;
  try {
    if (method === "probability") {
      const out: Record<string, unknown> = { ok: true, method, arithmetic: [] as string[] };
      const lines: string[] = [];
      if (args.events !== undefined || args.exposureUnits !== undefined) {
        const r = probabilityOfLoss(Number(args.events), Number(args.exposureUnits));
        if ("error" in r) return { ok: false, error: r.error };
        out.probability = r.probability; lines.push(...r.arithmetic);
      }
      if (args.rule || Array.isArray(args.probabilities)) {
        const r = combineProbabilities(String(args.rule) as CombineRule, (args.probabilities ?? []).map(Number), args.conditionalProbability);
        if ("error" in r) return { ok: false, error: r.error };
        out.combined = { rule: args.rule, probability: r.probability, meaning: r.meaning }; lines.push(...r.arithmetic);
      }
      if (!lines.length) return { ok: false, error: "method=probability needs events and exposureUnits, or rule and probabilities." };
      out.arithmetic = lines; return out;
    }
    if (method === "regression") {
      const r = linearRegression((args.x ?? []).map(Number), (args.y ?? []).map(Number), (args.predictAt ?? []).map(Number), confidence);
      if ("error" in r) return { ok: false, error: r.error };
      return { ok: true, method, ...r };
    }
    if (method === "distribution") {
      const r = normalInterval(Number(args.mean), Number(args.standardDeviation), confidence, args.severity !== undefined ? Number(args.severity) : undefined, args.sampleSize !== undefined ? Number(args.sampleSize) : undefined);
      if ("error" in r) return { ok: false, error: r.error };
      return { ok: true, method, ...r };
    }
    return { ok: false, error: `method must be probability, regression or distribution; got "${method}".` };
  } catch (err: any) {
    // Returned, not thrown: a bad input is something the model can correct and retry.
    return { ok: false, error: `Could not compute: ${err?.message ?? err}` };
  }
}
