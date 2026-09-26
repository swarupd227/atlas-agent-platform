/**
 * A team plan that belongs to a conversation rather than to an outcome.
 *
 * The classic Teams page offers a path the conversation didn't have: describe
 * a process, get a team, no KPI commitment. A saved proposal has to belong to
 * something (agent_proposals.outcome_id is NOT NULL), so a plan made this way
 * is owned by the Astra thread that produced it, written as "thread:<id>".
 * Nothing else reads that id as an outcome: getOutcome never matches it, and
 * the planner's own save/overwrite path works unchanged, so proposing again
 * with feedback replaces the draft exactly as it does for an outcome.
 */

const PREFIX = "thread:";
const FROM_FLOW = "#flow:";

/** Who owns a plan made from a description of the work. */
export function threadOwnerId(threadId: string): string {
  return `${PREFIX}${threadId}`;
}

/**
 * Who owns a plan made from a saved process flow: the conversation, plus the
 * flow it was planned from. The flow travels here rather than in a new column
 * because the build step needs it -- it is what links the flow to the team it
 * becomes, and what lets the confirm card say which flow the team mirrors.
 */
export function flowOwnerId(threadId: string, flowId: string): string {
  return `${PREFIX}${threadId}${FROM_FLOW}${flowId}`;
}

export function isThreadOwned(ownerId: string | null | undefined): boolean {
  return !!ownerId && ownerId.startsWith(PREFIX);
}

/** The thread that owns it, or null when the plan belongs to an outcome. */
export function threadIdOf(ownerId: string | null | undefined): string | null {
  if (!isThreadOwned(ownerId)) return null;
  const rest = ownerId!.slice(PREFIX.length);
  const at = rest.indexOf(FROM_FLOW);
  return at >= 0 ? rest.slice(0, at) : rest;
}

/** The process flow a plan was made from, or null when it wasn't made from one. */
export function flowIdOf(ownerId: string | null | undefined): string | null {
  if (!isThreadOwned(ownerId)) return null;
  const at = ownerId!.indexOf(FROM_FLOW);
  return at >= 0 ? ownerId!.slice(at + FROM_FLOW.length) || null : null;
}

/**
 * A short name for the work, for the plan the planner writes. The first
 * sentence or line, trimmed; the whole description travels separately.
 */
export function workTitle(work: string, max = 80): string {
  const first = work.trim().split(/[.\n]/)[0]?.trim() ?? "";
  const text = first || work.trim();
  if (!text) return "Team for this work";
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
