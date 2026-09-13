// Explainability (Initiative 05): turn a DAG run's own recorded facts — wave
// results, per-node status/errors, cost, final status — into a grounded,
// citeable summary and an LLM prompt that must explain the run using ONLY those
// facts. Pure and dependency-free so it unit-tests without a DB or an LLM; the
// route feeds it a run and hands the prompt to callClaude. Read-only: nothing
// here (or in the route that uses it) mutates a run.

export interface NodeFact {
  wave: number;
  nodeId: string;
  label?: string;
  status: string;            // completed | failed | skipped | timeout
  error?: string;
  truncated?: boolean;
  durationMs?: number;
  outputPreview?: string;
}

export interface RunExplanationContext {
  runId: string;
  status: string;
  totalWaves: number;
  completedWaves: number;
  error?: string;
  costUsd?: number;
  totalToolCalls?: number;
  nodes: NodeFact[];
  failedNodeIds: string[];
  skippedNodeIds: string[];
  firstFailure?: NodeFact;
}

function previewOutput(output: unknown, max = 240): string | undefined {
  if (output === null || output === undefined) return undefined;
  let s: string;
  if (typeof output === "string") s = output;
  else { try { s = JSON.stringify(output); } catch { return undefined; } }
  s = s.replace(/\s+/g, " ").trim();
  if (!s) return undefined;
  return s.length > max ? s.slice(0, max) + "…" : s;
}

/** Build the grounded fact set from a run's own recorded results. `labels` maps
 *  a node id to its human label when available (optional). */
export function buildRunExplanationContext(
  run: {
    id: string;
    status?: string | null;
    totalWaves?: number | null;
    error?: string | null;
    totalCostUsd?: number | null;
    totalToolCalls?: number | null;
    waveResults?: any;
  },
  labels: Record<string, string> = {},
): RunExplanationContext {
  const waves: any[] = Array.isArray(run.waveResults) ? run.waveResults : [];
  const nodes: NodeFact[] = [];
  for (const w of waves) {
    const waveNo = w?.waveNumber ?? 0;
    for (const n of (Array.isArray(w?.nodes) ? w.nodes : [])) {
      nodes.push({
        wave: waveNo,
        nodeId: n?.nodeId,
        label: labels[n?.nodeId],
        status: n?.status ?? "unknown",
        error: n?.error || undefined,
        truncated: n?.truncated || undefined,
        durationMs: typeof n?.durationMs === "number" ? n.durationMs : undefined,
        outputPreview: previewOutput(n?.output),
      });
    }
  }
  const failed = nodes.filter(n => n.status === "failed" || n.status === "timeout");
  const skipped = nodes.filter(n => n.status === "skipped");
  return {
    runId: run.id,
    status: run.status ?? "unknown",
    totalWaves: run.totalWaves ?? waves.length,
    completedWaves: waves.length,
    error: run.error || undefined,
    costUsd: typeof run.totalCostUsd === "number" ? run.totalCostUsd : undefined,
    totalToolCalls: typeof run.totalToolCalls === "number" ? run.totalToolCalls : undefined,
    nodes,
    failedNodeIds: failed.map(n => n.nodeId),
    skippedNodeIds: skipped.map(n => n.nodeId),
    firstFailure: failed[0],
  };
}

const ref = (n: NodeFact) => n.label ? `"${n.label}" (${n.nodeId})` : n.nodeId;

/** Render the facts as compact, citeable lines for the prompt. */
export function renderFactsForPrompt(ctx: RunExplanationContext): string {
  const lines: string[] = [];
  lines.push(`Run ${ctx.runId}: status=${ctx.status}, waves ${ctx.completedWaves}/${ctx.totalWaves}` +
    (ctx.costUsd != null ? `, cost $${ctx.costUsd.toFixed(4)}` : "") +
    (ctx.totalToolCalls != null ? `, ${ctx.totalToolCalls} tool calls` : ""));
  if (ctx.error) lines.push(`Run-level error: ${ctx.error}`);
  for (const n of ctx.nodes) {
    let l = `- wave ${n.wave} · ${ref(n)}: ${n.status}`;
    if (n.durationMs != null) l += ` (${Math.round(n.durationMs)}ms)`;
    if (n.truncated) l += " [output truncated at model limit]";
    if (n.error) l += ` — error: ${n.error}`;
    else if (n.outputPreview) l += ` — output: ${n.outputPreview}`;
    lines.push(l);
  }
  if (ctx.skippedNodeIds.length) lines.push(`Skipped (untaken branches, normal): ${ctx.skippedNodeIds.join(", ")}`);
  return lines.join("\n");
}

export const RUN_EXPLAINER_SYSTEM =
  "You are a run-diagnostics assistant. Explain what happened in an agent DAG run in plain, business-readable English, in 3-6 sentences. " +
  "Use ONLY the facts provided — never invent steps, numbers, causes, or outputs. Cite the specific step(s) by name/id when you refer to them. " +
  "If the run failed, name the first failing step and what its error says; if it completed with skips, note that untaken branches are normal, not errors. " +
  "Do not speculate beyond the recorded facts.";

export function buildExplanationPrompt(ctx: RunExplanationContext): string {
  return `Explain this run for a reviewer. Facts (the only source of truth):\n\n${renderFactsForPrompt(ctx)}`;
}
