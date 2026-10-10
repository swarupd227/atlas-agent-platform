/**
 * Pure "changed since cursor" query builders for connector polling. Kept
 * dependency-free (no storage/db imports) so they're cheaply unit-testable —
 * the string surgery here (SOQL WHERE/FROM insertion, JQL date formatting)
 * is exactly the kind of logic that's easy to get subtly wrong.
 */

export const MIN_POLL_INTERVAL_MS = 60_000; // floor: never poll a connector more than once/minute
export const DEFAULT_POLL_INTERVAL_MS = 5 * 60_000;

// Page-size caps applied to each poll's query (Jira max_results / Salesforce
// limit below). A poll can match more records than a single page holds; see
// resolveNextPollCursor for how the cursor must respond to that.
export const JIRA_PAGE_SIZE = 20;
export const SALESFORCE_PAGE_SIZE = 50;

// Integrations with a confirmed "list records changed since X" query primitive
// (Jira JQL `updated >=`, Salesforce SOQL `LastModifiedDate >=`). Other enterprise
// connectors are registered but not wired for polling yet — triggers pointing at
// them are skipped (logged), not silently dropped or errored.
const SUPPORTED_INTEGRATIONS = new Set(["jira", "salesforce"]);

/**
 * A connector that is not one of the two vendors above can still be polled, if
 * the trigger says HOW to ask it: which tool to call, which argument carries the
 * "changed since" bound, where the records sit in the reply, and which field on a
 * record is its changed-at time. Hardcoding a third vendor would have been
 * quicker and would have left the fourth one stuck in exactly the same way.
 *
 * Nothing here is guessed. A spec without a tool or a changed-since argument is
 * an error rather than a default, and a reply whose records cannot be found is
 * an error rather than zero: a poll that quietly asks the wrong question returns
 * no records forever and is indistinguishable from an estate where nothing
 * happened.
 */
export const DEFAULT_GENERIC_PAGE_SIZE = 50;

export interface GenericPollSpec {
  /** The connector tool to call, e.g. "search_incidents". */
  tool: string;
  /** Base arguments sent on every poll, e.g. a filter the trigger watches. */
  args: Record<string, unknown>;
  /** The argument that carries the cursor, e.g. "updated_since". */
  changedSinceParam: string;
  /** The argument that caps the page, when the connector takes one. */
  pageSizeParam?: string;
  pageSize: number;
  /** Dotted path to the records array in the reply, e.g. "result.incidents". */
  recordsPath?: string;
  /** Dotted path, within one record, to its changed-at timestamp. */
  timestampField?: string;
}

export function parseGenericPollSpec(raw: unknown): GenericPollSpec {
  const spec = (raw ?? {}) as Record<string, unknown>;
  const tool = typeof spec.tool === "string" ? spec.tool.trim() : "";
  const changedSinceParam = typeof spec.changedSinceParam === "string" ? spec.changedSinceParam.trim() : "";
  if (!tool) throw new Error("generic polling needs config.poll.tool: the connector tool to call");
  if (!changedSinceParam) {
    throw new Error("generic polling needs config.poll.changedSinceParam: the argument that carries the changed-since bound");
  }
  const size = Number(spec.pageSize);
  const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  return {
    tool,
    args: spec.args && typeof spec.args === "object" && !Array.isArray(spec.args) ? { ...(spec.args as Record<string, unknown>) } : {},
    changedSinceParam,
    pageSizeParam: str(spec.pageSizeParam),
    pageSize: Number.isFinite(size) && size > 0 ? Math.floor(size) : DEFAULT_GENERIC_PAGE_SIZE,
    recordsPath: str(spec.recordsPath),
    timestampField: str(spec.timestampField),
  };
}

export function buildGenericArgs(spec: GenericPollSpec, cursorIso: string | null): Record<string, unknown> {
  const args: Record<string, unknown> = { ...spec.args };
  if (spec.pageSizeParam) args[spec.pageSizeParam] = spec.pageSize;
  // No cursor on the baseline poll: the first cycle establishes where "since"
  // starts and deliberately does not fire, so it asks the unbounded question.
  if (cursorIso) args[spec.changedSinceParam] = cursorIso;
  return args;
}

/** Reads a dotted path, returning undefined on any gap rather than throwing. */
export function readPath(source: unknown, path: string | undefined): unknown {
  if (!path) return undefined;
  let cursor: unknown = source;
  for (const part of path.split(".")) {
    if (cursor === null || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor;
}

/**
 * The records a poll returned, and the latest changed-at among them.
 *
 * The count comes from the array itself, never from a total the connector
 * reports about its own reply: the two disagree whenever the connector pages,
 * and the cursor logic above has to know how many records actually arrived.
 */
export function extractGenericRecords(
  parsed: unknown,
  spec: GenericPollSpec,
): { recordCount: number; lastRecordTimestampIso: string | null; error?: string } {
  // Typed through each branch rather than narrowed inside them: a narrowing on a
  // let declared as unknown does not survive the if/else, and the loop below
  // needs the array.
  let rows: unknown[];
  if (spec.recordsPath) {
    const found = readPath(parsed, spec.recordsPath);
    if (!Array.isArray(found)) {
      return { recordCount: 0, lastRecordTimestampIso: null, error: `config.poll.recordsPath "${spec.recordsPath}" is not an array in the connector's reply` };
    }
    rows = found;
  } else if (Array.isArray(parsed)) {
    rows = parsed;
  } else {
    return { recordCount: 0, lastRecordTimestampIso: null, error: "the connector replied with an object, so config.poll.recordsPath must say where the records are" };
  }

  let latest: string | null = null;
  for (const record of rows) {
    const raw = readPath(record, spec.timestampField);
    if (typeof raw !== "string") continue;
    const at = new Date(raw);
    // A timestamp nobody can parse must never become the cursor: it would
    // either freeze the poll or skip the window between the two polls.
    if (Number.isNaN(at.getTime())) continue;
    if (!latest || at > new Date(latest)) latest = raw;
  }
  return { recordCount: rows.length, lastRecordTimestampIso: latest };
}


export function isPollableIntegration(integrationId: string | null | undefined): boolean {
  return !!integrationId && SUPPORTED_INTEGRATIONS.has(integrationId);
}

export function formatJqlDate(iso: string): string {
  // Jira JQL datetime literal format: "yyyy-MM-dd HH:mm" — no seconds, no T/Z.
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function buildJiraArgs(baseQuery: string, cursorIso: string | null): Record<string, unknown> {
  const trimmed = (baseQuery || "").trim();
  if (!cursorIso) {
    return trimmed ? { jql: trimmed, max_results: JIRA_PAGE_SIZE } : { max_results: JIRA_PAGE_SIZE };
  }
  const cursorClause = `updated >= "${formatJqlDate(cursorIso)}"`;
  const jql = trimmed ? `(${trimmed}) AND ${cursorClause} ORDER BY updated ASC` : `${cursorClause} ORDER BY updated ASC`;
  return { jql, max_results: JIRA_PAGE_SIZE };
}

export function buildSalesforceArgs(baseQuery: string, cursorIso: string | null): Record<string, unknown> {
  const trimmed = (baseQuery || "").trim();
  if (!trimmed) throw new Error("Salesforce polling requires a full SOQL SELECT query in config.query");
  if (!cursorIso) {
    return { soql: trimmed, limit: SALESFORCE_PAGE_SIZE };
  }
  const filter = `LastModifiedDate >= ${cursorIso}`;
  let soql: string;
  if (/\bWHERE\b/i.test(trimmed)) {
    soql = trimmed.replace(/\bWHERE\b/i, `WHERE ${filter} AND`);
  } else {
    const fromMatch = trimmed.match(/\bFROM\s+\w+/i);
    if (!fromMatch || fromMatch.index === undefined) {
      throw new Error("Salesforce polling query must contain a FROM clause");
    }
    const insertAt = fromMatch.index + fromMatch[0].length;
    soql = `${trimmed.slice(0, insertAt)} WHERE ${filter}${trimmed.slice(insertAt)}`;
  }
  return { soql, limit: SALESFORCE_PAGE_SIZE };
}

/**
 * Determines the cursor to persist after one poll cycle.
 *
 * The bug this fixes: a page is capped at JIRA_PAGE_SIZE / SALESFORCE_PAGE_SIZE
 * records, but the caller (connector-poller.ts) was unconditionally advancing
 * the "changed since" cursor to "now" after every poll — including when the
 * page hit its cap and there were more matching records beyond it. Those
 * overflow records fall before the new cursor on the *next* poll's
 * `updated >= cursor` filter, so they're never fetched: silently dropped
 * forever, not just delayed.
 *
 * Correct behavior:
 *  - Page did NOT hit the cap → every matching record was fetched this poll,
 *    so it's safe to advance the cursor all the way to `requestedAtIso`.
 *  - Page DID hit the cap → there may be unfetched overflow. Advance the
 *    cursor only to `lastRecordTimestampIso` (the last fetched record's own
 *    changed-at timestamp), never past it, so the next poll's `>=` filter
 *    still picks up the overflow. If no per-record timestamp is available,
 *    make no progress at all (fall back to `previousCursorIso`) rather than
 *    guess — re-fetching the same page is safe, skipping records is not.
 */
export function resolveNextPollCursor(params: {
  previousCursorIso: string | null;
  requestedAtIso: string;
  recordCount: number;
  pageSize: number;
  lastRecordTimestampIso?: string | null;
}): string {
  const { previousCursorIso, requestedAtIso, recordCount, pageSize, lastRecordTimestampIso } = params;
  const pageHitCap = recordCount >= pageSize;
  if (!pageHitCap) return requestedAtIso;
  return lastRecordTimestampIso ?? previousCursorIso ?? requestedAtIso;
}
