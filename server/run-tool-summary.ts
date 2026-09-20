// A team run's final answer is the last step's output, and each step ends with a log of only ITS OWN
// tool calls. A closing step that only writes a report therefore ends with "no tool calls were
// dispatched" under a report of actions an earlier step took. This gathers the per-step dispatcher logs
// (code-generated, not model narrative) into one run-level summary shown next to the answer.
const TOOL_LOG_MARKER = "PLATFORM-VERIFIED TOOL CALL LOG";
const TOOL_LOG_LINE = /^\s*\d+\.\s+(\S+)\s+\[(OK|FAILED)\]/gm;

export interface ToolSummaryPlan {
  waves: Array<{ nodes: string[] }>;
  nodeConfig: Record<string, { stateKey: string; label?: string } | undefined>;
}

export function summarizeRunToolCalls(finalState: Record<string, unknown> | null | undefined, wavePlan: ToolSummaryPlan): string {
  if (!finalState) return "";
  const steps: Array<{ label: string; counts: Map<string, { ok: number; failed: number }> }> = [];
  for (const wave of wavePlan.waves) {
    for (const nodeId of wave.nodes) {
      const nc = wavePlan.nodeConfig[nodeId];
      const value = nc ? finalState[nc.stateKey] : undefined;
      if (typeof value !== "string") continue;
      const at = value.lastIndexOf(TOOL_LOG_MARKER);
      if (at < 0) continue;
      const counts = new Map<string, { ok: number; failed: number }>();
      for (const m of Array.from(value.slice(at).matchAll(TOOL_LOG_LINE))) {
        const c = counts.get(m[1]) ?? { ok: 0, failed: 0 };
        if (m[2] === "OK") c.ok++; else c.failed++;
        counts.set(m[1], c);
      }
      steps.push({ label: nc?.label || nodeId, counts });
    }
  }
  if (steps.length === 0) return "";
  let total = 0;
  const lines = steps.map((s) => {
    if (s.counts.size === 0) return `- ${s.label}: no tool calls`;
    const parts = Array.from(s.counts.entries()).map(([tool, c]) => {
      total += c.ok + c.failed;
      return `${tool} x${c.ok + c.failed}${c.failed ? ` (${c.failed} failed)` : ""}`;
    });
    return `- ${s.label}: ${parts.join(", ")}`;
  });
  return [
    `PLATFORM-VERIFIED TOOL CALLS ACROSS THIS RUN (${total} in total; built from each step's dispatcher log, not the model's narrative):`,
    ...lines,
    "A step listed with no tool calls only reasoned over or wrote up earlier steps' results.",
  ].join("\n");
}
