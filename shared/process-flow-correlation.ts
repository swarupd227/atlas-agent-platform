/**
 * What a blueprint node remembers about the process-flow step it was built
 * from, and which step types never become one.
 *
 * This is the only thing that makes a flow and the automation built from it
 * reconcilable later: a sync correlates by the persisted step id, never by
 * matching labels, because a label match is a guess presented as certainty.
 *
 * It lives here, with no imports of its own, because both writers need it --
 * the build (server/team-build.ts, via the steps the author drew) and the sync
 * (server/process-flow-sync.ts) -- and neither should import the other.
 */

/** Drawn to explain the flow, not to run: these become no blueprint node. */
export const STRUCTURAL_NODE_TYPES = new Set(["trigger", "end"]);

/**
 * Types that become a pause-and-wait gate node (a real human decision) instead
 * of an agent -- the same convention as the build's isHumanCheckpoint flag.
 */
export const HUMAN_CHECKPOINT_NODE_TYPES = new Set(["expert_approval"]);

export interface CorrelatableStep {
  id: string;
  label?: string;
  description?: string;
  type?: string;
  actor?: string;
  config?: Record<string, unknown> | null;
}

export interface StepCorrelation {
  sourceProcessNodeId: string;
  sourceLabel: string;
  sourceDescription: string;
  sourceType: string;
  sourceActor: string;
  sourceRefTeamAgentId: string | null;
  sourceExpression: string | null;
  /**
   * What a decision step asks and answers with, when the author set any of it:
   * answer type, question, options or levels, threshold, unsure, classifier.
   * Without it an edit confined to those keys was not a change the sync could
   * see, so a re-worded question or a new level never reached the team.
   */
  sourceDecision: string | null;
  /**
   * What the step does when its verdict disagrees with the run's verified
   * facts: flag it and go on, or fail the step (config.factsCheck). The engine
   * reads it from the node's config, so it is carried here by both writers and
   * a change to it is a change the sync can see.
   */
  factsCheck: "flag" | "fail";
  /**
   * Which tool the step calls, on which server, with which arguments.
   *
   * Without it, binding a tool to an existing step was invisible: the label,
   * description, type and actor were all untouched, so the step read as
   * unchanged, the planner found no drift, and the automation went on running
   * the tool-less agent. The sync could already BUILD a tool_call node; it
   * never decided to, because the binding was not something it compared.
   * Found on the Account Establishment journey, where three bound steps
   * produced a sync that correctly reported "nothing to do".
   */
  sourceTool: string | null;
}

const DECISION_KEYS = ["answerType", "question", "options", "levels", "confidenceThreshold", "unsure", "classifierId"] as const;

const TOOL_KEYS = ["toolName", "toolServerId", "toolArgs"] as const;

function toolFingerprint(config: Record<string, any>): string | null {
  const picked: Record<string, unknown> = {};
  for (const k of TOOL_KEYS) if (config[k] !== undefined && config[k] !== null && config[k] !== "") picked[k] = config[k];
  // Only a named tool is a binding. A stray toolArgs with no tool is not one,
  // and treating it as a change would rebuild steps nobody touched.
  return picked.toolName ? JSON.stringify(picked) : null;
}

function decisionFingerprint(step: CorrelatableStep, config: Record<string, any>): string | null {
  if (step.type !== "make_decision") return null;
  const picked: Record<string, unknown> = {};
  for (const k of DECISION_KEYS) if (config[k] !== undefined && config[k] !== null && config[k] !== "") picked[k] = config[k];
  return Object.keys(picked).length > 0 ? JSON.stringify(picked) : null;
}

/** The correlation a blueprint node carries for the step it came from. */
export function stepCorrelation(step: CorrelatableStep): StepCorrelation {
  const config = (step.config ?? {}) as Record<string, any>;
  return {
    sourceProcessNodeId: step.id,
    sourceLabel: step.label ?? "",
    sourceDescription: step.description || "",
    sourceType: step.type ?? "",
    sourceActor: step.actor || "",
    // Persisted so a re-sync can tell "the referenced flow changed" apart from
    // "nothing changed" -- the label/description/type/actor comparison alone
    // can't see a change confined to config.refTeamAgentId.
    sourceRefTeamAgentId: config.refTeamAgentId || null,
    sourceExpression: config.expression || null,
    sourceDecision: decisionFingerprint(step, config),
    factsCheck: config.factsCheck === "fail" ? "fail" : "flag",
    sourceTool: toolFingerprint(config),
  };
}

/** True when a blueprint node's stored correlation still matches the step. */
export function stepUnchanged(storedConfig: unknown, step: CorrelatableStep): boolean {
  const cfg = (storedConfig ?? {}) as Record<string, any>;
  const now = stepCorrelation(step);
  return cfg.sourceLabel === now.sourceLabel
    && (cfg.sourceDescription || "") === now.sourceDescription
    && cfg.sourceType === now.sourceType
    && (cfg.sourceActor || "") === now.sourceActor
    && (cfg.sourceRefTeamAgentId || null) === now.sourceRefTeamAgentId
    && (cfg.sourceExpression || null) === now.sourceExpression
    && (cfg.sourceDecision || null) === now.sourceDecision
    // A node written before the setting existed reads as the default.
    && (cfg.factsCheck === "fail" ? "fail" : "flag") === now.factsCheck
    // A node written before tool bindings were compared carries no
    // sourceTool, which reads as null -- the same as a step with no tool, so
    // nothing that was genuinely unbound is rebuilt.
    && (cfg.sourceTool || null) === now.sourceTool;
}
