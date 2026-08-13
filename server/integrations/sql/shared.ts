/**
 * Dialect-independent safety helpers shared by every SQL connector client.
 */

const DEFAULT_BLOCKED_KEYWORDS =
  /\b(INSERT|UPDATE|DELETE|DROP|CREATE|TRUNCATE|MERGE|REPLACE|GRANT|REVOKE|ALTER|EXEC|EXECUTE|CALL)\b/i;

/**
 * Blocks DDL/DML before a query ever reaches the database. This is
 * defense-in-depth, not the only safeguard -- each provider's client also
 * connects with a read-only credential where the dialect supports it.
 */
export function guardReadOnly(sql: string, extraBlocked?: RegExp): void {
  const re = extraBlocked ?? DEFAULT_BLOCKED_KEYWORDS;
  const match = sql.match(re);
  if (match) {
    throw new Error(
      `Read-only enforcement: ${match[0].toUpperCase()} statements are blocked. ` +
      "This connection is configured for read-only access. Use SELECT queries only."
    );
  }
}

const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_$]*$/;

/**
 * Schema/table/column names can't be parameterized as SQL values (only
 * literals can use placeholders), so every identifier that reaches raw SQL
 * text is validated against a strict allowlist first -- rejecting anything
 * outside it rather than trying to escape special characters, since these
 * names come from agent tool-call args and could be adversarially crafted
 * via prompt injection.
 */
export function assertSafeIdentifier(name: string, kind: "schema" | "table" | "column"): string {
  if (!SAFE_IDENTIFIER.test(name)) {
    throw new Error(`Invalid ${kind} name: "${name}". Only letters, digits, underscore, and $ are allowed.`);
  }
  return name;
}

export function truncate<T>(rows: T[], maxRows: number): { rows: T[]; truncated: boolean } {
  if (rows.length <= maxRows) return { rows, truncated: false };
  return { rows: rows.slice(0, maxRows), truncated: true };
}
