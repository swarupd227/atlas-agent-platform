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

/** Who owns a plan made from a description of the work. */
export function threadOwnerId(threadId: string): string {
  return `${PREFIX}${threadId}`;
}

export function isThreadOwned(ownerId: string | null | undefined): boolean {
  return !!ownerId && ownerId.startsWith(PREFIX);
}

/** The thread that owns it, or null when the plan belongs to an outcome. */
export function threadIdOf(ownerId: string | null | undefined): string | null {
  return isThreadOwned(ownerId) ? ownerId!.slice(PREFIX.length) : null;
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
