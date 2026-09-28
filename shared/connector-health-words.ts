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

/** Mirrors ProbeMethod in server/connector-health-probe.ts. */
export type ConnectorCheckKind =
  | "health_path"
  | "mcp_tools_list"
  | "vendor_connection_test"
  | "mock_endpoint"
  | "mount_check"
  | "none";

/**
 * What each kind of check actually proves.
 *
 * Needed because the checks are not interchangeable: a tools/list handshake
 * exercises the whole call path a real agent takes, while a health endpoint is
 * only the service's own opinion of itself, and a mock endpoint answering says
 * nothing about any real system. One word — "reachable" — cannot carry that, so
 * the answer says which check ran.
 */
export function checkProves(kind: ConnectorCheckKind): string {
  switch (kind) {
    case "health_path":
      return "its own health endpoint answered";
    case "mcp_tools_list":
      return "it completed an MCP handshake and listed its tools, which is the path an agent's call takes";
    case "vendor_connection_test":
      return "the system it connects to answered a credential test";
    case "mock_endpoint":
      return "one of its read-only endpoints answered, so the backend this platform serves is still mounted";
    case "mount_check":
      return "this build still serves the path it is registered at — which is its route existing, and nothing more";
    case "none":
      return "nothing checked it";
  }
}

/** What the check about to be made would be, phrased as an offer. */
export function checkOffer(kind: ConnectorCheckKind): string {
  switch (kind) {
    case "health_path":
      return "ask its health endpoint";
    case "mcp_tools_list":
      return "open an MCP connection and list its tools";
    case "vendor_connection_test":
      return "make a real call to that system with the credentials stored for it";
    case "mock_endpoint":
      return "call one of its read-only endpoints";
    case "mount_check":
      return "check that this build still serves its path, without calling anything";
    case "none":
      return "nothing";
  }
}

/** How long ago the measurement was taken, in the words a person would use. */
export function checkedAgo(ageDays: number | null): string {
  if (ageDays == null) return "never checked";
  if (ageDays <= 0) return "checked today";
  if (ageDays === 1) return "checked yesterday";
  return `checked ${ageDays} days ago`;
}

/**
 * The whole claim: what was measured, and when. Never "is healthy".
 *
 * `canProbe` false is its own answer, and the common one: measured live on
 * 2026-09-27, 131 of 132 connectors had no health check path, so the scheduled
 * scan covered exactly ONE of them and 112 displayed a state written in a single
 * bulk sweep on 26 August that nothing can refresh. "Never checked" understates
 * that — there is no mechanism by which it ever could be.
 */
export function healthWords(
  state: ConnectorHealthState,
  ageDays: number | null,
  canProbe = true,
  opts: {
    /**
     * Which check produced the state on record. Null means the state predates the
     * platform recording that — as 112 connectors' states do — and a measurement
     * whose method is unknown cannot be read as proof of anything.
     */
    measuredBy?: ConnectorCheckKind | null;
    /** Why nothing can be checked, when that is the case. More specific than the default. */
    why?: string;
  } = {},
): string {
  if (!canProbe) {
    const because = opts.why ? ` — ${opts.why}` : " — no check exists for it, so nothing can probe it";
    return state === "never_checked"
      ? `cannot be checked${because}`
      : `${state === "reachable" ? "recorded as reachable" : "recorded as failing"} ${checkedAgo(ageDays)}, and cannot be re-checked${because}`;
  }
  if (state === "never_checked") return "never checked — nothing has probed it yet, so its state is unknown";
  const provenance =
    opts.measuredBy === undefined
      ? ""
      : opts.measuredBy && opts.measuredBy !== "none"
        ? ` — ${checkProves(opts.measuredBy)}`
        : " — by a check this platform can no longer identify, so what it proved is unknown";
  if (state === "reachable") return `reachable when last probed, ${checkedAgo(ageDays)}${provenance}`;
  return `failing its check as of ${checkedAgo(ageDays)}${provenance}`;
}

/** Two or three words for a badge, still tensed. */
export function healthBadge(state: ConnectorHealthState, canProbe = true): string {
  if (!canProbe) return state === "never_checked" ? "Cannot be verified" : "Recorded, unverifiable";
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
export function healthTone(state: ConnectorHealthState, ageDays: number | null, canProbe = true): "good" | "warn" | "bad" {
  if (state === "unreachable") return "bad";
  // A state nothing can refresh is never "good", however recently it was written.
  if (!canProbe || state === "never_checked") return "warn";
  return isStale(ageDays) ? "warn" : "good";
}
