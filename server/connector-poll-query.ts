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
