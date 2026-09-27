/**
 * One set of words for a connector's health, used by the page and by Cowork.
 *
 * The audit this came from (2026-09-27): 113 of 131 connectors displayed
 * "healthy" while 129 of them had not been probed for over a week and 18 had
 * never been probed at all. The defect was not the colour, it was the tense — the
 * platform said "is healthy" about something it measured once, weeks ago, and
 * nothing re-probes a connector on its own.
 *
 * So every phrase here is past tense and carries the age of its measurement, and
 * an unprobed connector says so rather than falling through to a state. The page
 * and the conversation import the same functions, because a green badge and a
 * sentence that disagree are worse than either alone.
 */

export type ConnectorHealthState = "reachable" | "unreachable" | "never_checked";

/** How long ago the measurement was taken, in the words a person would use. */
export function checkedAgo(ageDays: number | null): string {
  if (ageDays == null) return "never checked";
  if (ageDays <= 0) return "checked today";
  if (ageDays === 1) return "checked yesterday";
  return `checked ${ageDays} days ago`;
}

/** The whole claim: what was measured, and when. Never "is healthy". */
export function healthWords(state: ConnectorHealthState, ageDays: number | null): string {
  if (state === "never_checked") return "never checked — nothing has probed it, so its state is unknown";
  if (state === "reachable") return `reachable when last probed, ${checkedAgo(ageDays)}`;
  return `failing its check as of ${checkedAgo(ageDays)}`;
}

/** Two or three words for a badge, still tensed. */
export function healthBadge(state: ConnectorHealthState): string {
  if (state === "never_checked") return "Not verified";
  return state === "reachable" ? "Reachable" : "Last call failed";
}

/**
 * A measurement older than this is history rather than news. A week is the point
 * at which nobody would defend showing it as current.
 */
export const STALE_AFTER_DAYS = 7;

export const isStale = (ageDays: number | null) => ageDays != null && ageDays >= STALE_AFTER_DAYS;

/** Semantic role for a state, so a caller's palette never leaves one uncoloured. */
export function healthTone(state: ConnectorHealthState, ageDays: number | null): "good" | "warn" | "bad" {
  if (state === "unreachable") return "bad";
  if (state === "never_checked") return "warn";
  return isStale(ageDays) ? "warn" : "good";
}
