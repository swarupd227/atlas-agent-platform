/**
 * Recover a team plan from the model's reply: strip a code fence (closed or
 * not) and a trailing comma, then parse; if that fails, close unbalanced
 * braces and brackets, and failing that keep the orchestrator and agents
 * when only the pipeline section was cut off.
 *
 * Moved unchanged from the propose-agents flow (server/team-proposal.ts).
 * Pure, so it can be tested on its own.
 */
export function parseProposalContent(content: string): { ok: boolean; value: any } {
  let jsonStr = content;
  const fencedMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fencedMatch) {
    jsonStr = fencedMatch[1].trim();
  } else {
    const openFence = content.match(/```(?:json)?\s*([\s\S]*)/);
    if (openFence) {
      jsonStr = openFence[1].trim();
    }
  }
  if (jsonStr.endsWith(",") || jsonStr.endsWith(",\n")) {
    jsonStr = jsonStr.replace(/,\s*$/, "");
  }

  let parsed: any = null;
  try {
    return { ok: true, value: JSON.parse(jsonStr) };
  } catch {
    // Phase 1: brace-counting repair
    const braceStart = jsonStr.indexOf("{");
    if (braceStart >= 0) {
      let truncated = jsonStr.slice(braceStart);
      let openBraces = 0, openBrackets = 0;
      for (const ch of truncated) {
        if (ch === "{") openBraces++;
        if (ch === "}") openBraces--;
        if (ch === "[") openBrackets++;
        if (ch === "]") openBrackets--;
      }
      while (openBrackets > 0) { truncated += "]"; openBrackets--; }
      while (openBraces > 0) { truncated += "}"; openBraces--; }
      truncated = truncated.replace(/,\s*([}\]])/g, "$1");
      try {
        parsed = JSON.parse(truncated);
      } catch {
        // Phase 2: pipeline section is likely what's truncated — extract orchestrator + agents slice
        // The JSON structure is always { "orchestrator": {...}, "agents": [...], "pipeline": {...} }
        // If pipeline is cut off, recover the parts that completed before it.
        try {
          const pipelineIdx = jsonStr.lastIndexOf('"pipeline"');
          const slice = pipelineIdx > 0
            ? jsonStr.slice(braceStart, pipelineIdx).trimEnd().replace(/,\s*$/, "") + ', "pipeline": null }'
            : null;
          if (slice) {
            const repaired = slice.replace(/,\s*([}\]])/g, "$1");
            parsed = JSON.parse(repaired);
            console.warn("[propose-agents] Pipeline section truncated — returned orchestrator + agents without pipeline");
          }
        } catch {
          console.error("Could not repair truncated JSON from AI response");
        }
      }        // close Phase 1 catch
    }          // close if (braceStart >= 0)
  }
  return parsed ? { ok: true, value: parsed } : { ok: false, value: null };
}
