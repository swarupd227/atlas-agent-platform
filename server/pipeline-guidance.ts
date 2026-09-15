/**
 * What a team step is told about the graph around it. Shared by both team
 * engines -- the Workspace DAG engine (dag-execution-engine.ts) and the
 * Playground tier pipeline (agent-runtime.ts executeTeamPipeline) -- so a team
 * behaves the same wherever it is run.
 */
import type { RuleGroup, RuleLeaf } from "@shared/schema";

export interface GuidanceEdge {
  sourceNodeId: string;
  targetNodeId: string;
  evaluationMode: string | null;
  rule: RuleGroup | null;
}

// A deterministic branch rule tests fields of the pipeline state, and those
// fields only exist if some step's output carries them as JSON. Nothing told
// the step before the branch which fields its successors test: a team whose
// proposer wrote `resolutionDecision == "create"` got a search agent that
// reported its finding in prose, so every branch past it was skipped as "no
// incoming edge condition was satisfied" and the rest of the journey never
// ran. The source node of each rule-gated edge is the natural producer, so it
// is told -- the same way HANDOFF ROUTING names valid handoff targets.
export interface RoutingFieldSpec {
  field: string;
  routes: Array<{ targetLabel: string; operator: string; value: string | number | boolean }>;
}

export function collectRuleLeaves(rule: RuleGroup | null | undefined): RuleLeaf[] {
  if (!rule || !Array.isArray(rule.conditions)) return [];
  const leaves: RuleLeaf[] = [];
  for (const c of rule.conditions) {
    if (c && typeof c === "object" && "field" in c) leaves.push(c as RuleLeaf);
    else leaves.push(...collectRuleLeaves(c as RuleGroup));
  }
  return leaves;
}

export function routingFieldSpecsFor(nodeId: string, edges: GuidanceEdge[], labelOf: (id: string) => string): RoutingFieldSpec[] {
  const byField = new Map<string, RoutingFieldSpec>();
  for (const edge of edges) {
    if (edge.sourceNodeId !== nodeId || edge.evaluationMode !== "deterministic") continue;
    for (const leaf of collectRuleLeaves(edge.rule)) {
      if (!byField.has(leaf.field)) byField.set(leaf.field, { field: leaf.field, routes: [] });
      byField.get(leaf.field)!.routes.push({ targetLabel: labelOf(edge.targetNodeId), operator: leaf.operator, value: leaf.value });
    }
  }
  return Array.from(byField.values());
}

export function renderRoutingFields(specs: RoutingFieldSpec[]): string[] {
  if (specs.length === 0) return [];
  const lines = [
    `## ROUTING FIELDS (required)`,
    `The next steps are chosen by exact rules on fields of your output. End your response with a \`\`\`json block containing every field below, set to the value that reflects your actual finding (a dot in a name means a nested object). Use one of the values the rules test whenever it describes your finding; a missing field means the steps that depend on it do not run.`,
  ];
  for (const spec of specs) {
    const routes = spec.routes.map((r) => `runs "${r.targetLabel}" when ${r.operator} ${JSON.stringify(r.value)}`).join("; ");
    lines.push(`- "${spec.field}": ${routes}`);
  }
  lines.push(``);
  return lines;
}

// A team's first step (typically its orchestrator) receives the whole request
// and, unless told otherwise, narrates the entire journey as done: "no
// agent-of-record conflicts", "account flagged for review" -- before the steps
// that establish those facts have run. Later steps read that narrative from
// shared state and repeat it, so an invented result reads as corroborated.
// Naming the steps still to come, and saying their results are not yet known,
// keeps each step to what it actually did.
export function laterStepIds(nodeId: string, edges: GuidanceEdge[]): string[] {
  const seen = new Set<string>();
  const queue = [nodeId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of edges) {
      if (edge.sourceNodeId !== current || seen.has(edge.targetNodeId) || edge.targetNodeId === nodeId) continue;
      seen.add(edge.targetNodeId);
      queue.push(edge.targetNodeId);
    }
  }
  return Array.from(seen);
}

export function renderLaterSteps(labels: string[]): string[] {
  if (labels.length === 0) return [];
  return [
    `## STEPS AFTER YOURS`,
    `These steps run after yours, as separate agents, and have not run yet: ${labels.map((l) => `"${l}"`).join(", ")}. Do not state, assume or predict what they will find or decide, and do not describe their work as done. Report only what you did and found; where the outcome depends on them, say what they still need to determine.`,
    ``,
  ];
}

/** Both sections for one step, as text to add to its input ("" when neither applies). */
export function pipelineGuidanceFor(nodeId: string, edges: GuidanceEdge[], labelOf: (id: string) => string): string {
  const lines = [
    ...renderRoutingFields(routingFieldSpecsFor(nodeId, edges, labelOf)),
    ...renderLaterSteps(laterStepIds(nodeId, edges).map(labelOf)),
  ];
  return lines.join("\n");
}
