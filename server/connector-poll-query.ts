/**
 * Pure "changed since cursor" query builders for connector polling. Kept
 * dependency-free (no storage/db imports) so they're cheaply unit-testable —
 * the string surgery here (SOQL WHERE/FROM insertion, JQL date formatting)
 * is exactly the kind of logic that's easy to get subtly wrong.
 */

export const MIN_POLL_INTERVAL_MS = 60_000; // floor: never poll a connector more than once/minute
export const DEFAULT_POLL_INTERVAL_MS = 5 * 60_000;

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
    return trimmed ? { jql: trimmed, max_results: 20 } : { max_results: 20 };
  }
  const cursorClause = `updated >= "${formatJqlDate(cursorIso)}"`;
  const jql = trimmed ? `(${trimmed}) AND ${cursorClause} ORDER BY updated ASC` : `${cursorClause} ORDER BY updated ASC`;
  return { jql, max_results: 20 };
}

export function buildSalesforceArgs(baseQuery: string, cursorIso: string | null): Record<string, unknown> {
  const trimmed = (baseQuery || "").trim();
  if (!trimmed) throw new Error("Salesforce polling requires a full SOQL SELECT query in config.query");
  if (!cursorIso) {
    return { soql: trimmed, limit: 50 };
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
  return { soql, limit: 50 };
}
