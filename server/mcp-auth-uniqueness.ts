/**
 * One credential row per MCP server (mcp_server_auth.server_id), enforced by the database.
 *
 * The table had no uniqueness on server_id and saves were not serialized, so saving a new server's
 * credentials several times at once left several rows, and which one a connector read was arbitrary
 * (upsertMcpServerAuth now takes a per-server lock; this makes the database refuse a second row).
 *
 * Run at start-up, before the index is created, because a unique index cannot be built over duplicates. It
 * removes a duplicate only when it is provably the same credential as the row kept (same auth type, same
 * decrypted values): saving credentials updates every row of a server, so duplicates that have been saved
 * since they were made are identical, and these are the ones it removes. It never removes a row it cannot
 * read (a different key), a row whose values differ, or one that lives in an external secret store (its
 * secret would be left behind): those it leaves, says so, and does not create the index, so nothing is lost
 * and the next start tries again. Saving that server's credentials once more makes its rows identical.
 *
 * Idempotent, and cheap once the index exists: it checks for the index first.
 */
import { decryptCredentialMap } from "./credential-vault";

export interface Queryable {
  query(text: string, params?: unknown[]): Promise<{ rows: any[]; rowCount?: number | null }>;
}

export interface UniquenessResult {
  /** Servers that had more than one row when this ran. */
  duplicateServers: number;
  /** Rows removed because they were provably the same credential as the one kept. */
  removed: number;
  /** Servers still holding rows that differ, are unreadable, or live in an external store. */
  unresolved: number;
  /** Whether the unique index is there now. */
  indexed: boolean;
}

export const INDEX_NAME = "idx_mcp_server_auth_server";

/** What a row holds, as text that is equal exactly when the credential is: null when it cannot be read. */
function contentOf(row: { auth_type: string | null; config: unknown; config_encrypted: string | null }): string | null {
  let values: unknown;
  if (row.config_encrypted) {
    try {
      const p = JSON.parse(row.config_encrypted);
      if (p && p.v === 2) return null; // kept in an external secret store: not ours to compare or to delete
    } catch { return null; }
    try { values = decryptCredentialMap(row.config_encrypted); } catch { return null; }
  } else {
    values = row.config ?? {};
  }
  const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical)
    : v && typeof v === "object" ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, canonical(x)]))
    : v;
  return JSON.stringify({ authType: row.auth_type ?? "none", values: canonical(values) });
}

export async function ensureMcpServerAuthUnique(client: Queryable, log: Pick<Console, "log" | "warn"> = console): Promise<UniquenessResult> {
  const indexed = async () => (await client.query("SELECT 1 FROM pg_indexes WHERE indexname = $1", [INDEX_NAME])).rows.length > 0;
  if (await indexed()) return { duplicateServers: 0, removed: 0, unresolved: 0, indexed: true };

  const dups = (await client.query("SELECT server_id FROM mcp_server_auth GROUP BY server_id HAVING count(*) > 1 ORDER BY server_id")).rows;
  let removed = 0;
  let unresolved = 0;
  for (const { server_id: serverId } of dups) {
    // Newest first: the one kept is the one a sequence of saves one after another would have left.
    const rows = (await client.query(
      "SELECT id, server_id, auth_type, config, config_encrypted, last_rotated, created_at FROM mcp_server_auth WHERE server_id = $1 ORDER BY last_rotated DESC NULLS LAST, created_at DESC NULLS LAST, id DESC",
      [serverId],
    )).rows;
    const kept = contentOf(rows[0]);
    const extras = rows.slice(1);
    const removable = kept === null ? [] : extras.filter((r) => contentOf(r) === kept);
    if (removable.length > 0) {
      await client.query("BEGIN");
      try {
        for (const r of removable) await client.query("DELETE FROM mcp_server_auth WHERE id = $1", [r.id]);
        await client.query("COMMIT");
        removed += removable.length;
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        throw e;
      }
    }
    if (extras.length - removable.length > 0) unresolved++;
  }
  if (removed > 0) log.log(`[mcp-auth] removed ${removed} duplicate credential row(s) that held exactly the same credential as the one kept, for ${dups.length - unresolved} server(s)`);

  if (unresolved > 0) {
    log.warn(`[mcp-auth] ${unresolved} MCP server(s) have more than one credential row that cannot be told apart safely (they differ, cannot be read, or live in an external secret store), so the unique index on server_id was NOT created and nothing was removed for them. Save those servers' credentials once more (that updates every row, making them identical) and the next start removes the extras.`);
    return { duplicateServers: dups.length, removed, unresolved, indexed: false };
  }
  try {
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS ${INDEX_NAME} ON mcp_server_auth (server_id)`);
  } catch (e: any) {
    // Two servers starting at the same moment: the other one built it.
    if (!(await indexed())) throw e;
  }
  return { duplicateServers: dups.length, removed, unresolved, indexed: true };
}
