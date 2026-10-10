/**
 * Moves connector credentials between the database and the external secret store (server/credential-store.ts), in
 * either direction, for rows that already exist. Nothing here runs by itself: an administrator asks for it
 * (POST /api/admin/credential-store/migrate), and the default request changes nothing and only reports.
 *
 *   to-store     a row holding a vault blob gets a secret made for it, read back, and the row then holds the
 *                reference. The old blob is overwritten by the reference, so the database no longer has the secret.
 *   to-database  a row holding a reference gets the vault blob made from the secret, and the secret is released
 *                (it stays restorable for 7 days). This is how a deployment goes back, or leaves the store.
 *
 * Each row is changed only if it still holds exactly what was read (a conditional update): a credential saved by
 * someone else in the meantime wins, and the secret made for the lost race is removed. One run at a time, and a
 * run changes at most `limit` rows, so a request stays short; asking again continues where it left off.
 */
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { agentIntegrationCredentials, integrationConnections, integrationOAuthApps, mcpServerAuth } from "@shared/schema";
import { db } from "./db";
import { decryptCredentialMap, encryptCredentialMap } from "./credential-vault";
import { parseReference, releaseCredentials } from "./credential-store";
import { CREDENTIAL_KINDS, getSecretStore, type CredentialKind, type SecretStore } from "./secret-store";

export type MigrationDirection = "to-store" | "to-database";

export const DEFAULT_MIGRATION_LIMIT = 100;
export const MAX_MIGRATION_LIMIT = 1000;
const MAX_REPORTED_FAILURES = 50;
/** A run that has failed this many rows stops: a store that is down would otherwise be asked for every row in turn. */
const STOP_AFTER_FAILURES = 25;

export class MigrationError extends Error {
  constructor(readonly status: number, message: string) { super(message); this.name = "MigrationError"; }
}

interface Place { table: any; id: any; column: any; prop: string }
const PLACES: Record<CredentialKind, Place> = {
  "mcp-auth": { table: mcpServerAuth, id: mcpServerAuth.id, column: mcpServerAuth.configEncrypted, prop: "configEncrypted" },
  connection: { table: integrationConnections, id: integrationConnections.id, column: integrationConnections.credentialBlob, prop: "credentialBlob" },
  "agent-connection": { table: agentIntegrationCredentials, id: agentIntegrationCredentials.id, column: agentIntegrationCredentials.credentialBlob, prop: "credentialBlob" },
  "oauth-app": { table: integrationOAuthApps, id: integrationOAuthApps.id, column: integrationOAuthApps.clientSecretEncrypted, prop: "clientSecretEncrypted" },
};

type Form = "store" | "database" | "other";
/** Where a column's value lives: a reference, a vault blob, or something that is neither (empty, damaged). */
function formOf(blob: string): Form {
  if (parseReference(blob)) return "store";
  try {
    const p = JSON.parse(blob);
    if (p && p.v === 1 && typeof p.iv === "string" && typeof p.ciphertext === "string") return "database";
  } catch { /* not JSON */ }
  return "other";
}

async function rowsOf(kind: CredentialKind): Promise<Array<{ id: string; blob: string }>> {
  const place = PLACES[kind];
  const rows = await db.select({ id: place.id, blob: place.column }).from(place.table).where(isNotNull(place.column)).orderBy(asc(place.id));
  return (rows as Array<{ id: string; blob: string | null }>).filter((r): r is { id: string; blob: string } => typeof r.blob === "string" && r.blob.length > 0);
}

export interface KindCounts { database: number; store: number; unrecognized: number }

export interface CredentialStoreStatus {
  configured: boolean;
  /** The kinds a new credential is written to the store for. Rows of any kind can already be references. */
  kinds: CredentialKind[];
  prefix: string | null;
  counts: Record<CredentialKind, KindCounts>;
  /** Credentials the store was asked for or gave, and how many requests failed, since this server started. */
  store: { reads: number; cacheHits: number; writes: number; failures: number; lastError: string | null; lastErrorAt: string | null } | null;
}

/** Counts only: nothing is decrypted and no secret is read. */
export async function credentialStoreStatus(): Promise<CredentialStoreStatus> {
  const store = await getSecretStore();
  const counts = {} as Record<CredentialKind, KindCounts>;
  for (const kind of CREDENTIAL_KINDS) {
    const c: KindCounts = { database: 0, store: 0, unrecognized: 0 };
    for (const r of await rowsOf(kind)) {
      const f = formOf(r.blob);
      if (f === "store") c.store++; else if (f === "database") c.database++; else c.unrecognized++;
    }
    counts[kind] = c;
  }
  return { configured: !!store, kinds: store ? [...store.config.kinds] : [], prefix: store ? store.config.prefix : null, counts, store: store ? store.stats() : null };
}

export interface KindReport { eligible: number; checked: number; wouldFail: number; moved: number; skipped: number; failed: number }
export interface MigrationReport {
  direction: MigrationDirection;
  dryRun: boolean;
  limit: number;
  byKind: Partial<Record<CredentialKind, KindReport>>;
  /** Rows still in the form being moved away from, after this run. */
  remaining: number;
  /** Secrets that were released but could not be marked for deletion (they stay in the store, unreferenced). */
  releaseFailed: number;
  /** What went wrong, by row id and kind: never a credential. */
  failures: Array<{ kind: CredentialKind; id: string; reason: string }>;
  /** Why the run ended before it had been through every row, if it did. */
  stoppedEarly: string | null;
}

let running = false;

const brief = (e: any): string => String(e?.message ?? e).replace(/\s+/g, " ").slice(0, 160);

export async function migrateCredentials(opts: { direction: MigrationDirection; dryRun: boolean; kinds?: CredentialKind[]; limit?: number }): Promise<MigrationReport> {
  if (opts.direction !== "to-store" && opts.direction !== "to-database") throw new MigrationError(400, "direction must be to-store or to-database");
  const limit = Math.min(Math.max(Math.trunc(opts.limit ?? DEFAULT_MIGRATION_LIMIT), 1), MAX_MIGRATION_LIMIT);
  const store = await getSecretStore();

  let kinds: CredentialKind[];
  if (opts.direction === "to-store") {
    if (!store) throw new MigrationError(409, "no secret store is configured on this server (ASTRA_SECRETS_MANAGER_PREFIX), so there is nowhere to move credentials to");
    kinds = opts.kinds ?? [...store.config.kinds];
    const off = kinds.filter((k) => !store.config.kinds.includes(k));
    if (off.length > 0) throw new MigrationError(409, `${off.join(", ")} ${off.length > 1 ? "are" : "is"} not switched on for the secret store (ASTRA_SECRETS_MANAGER_KINDS), so new saves would not go there either`);
  } else {
    kinds = opts.kinds ?? [...CREDENTIAL_KINDS];
  }
  for (const k of kinds) if (!(CREDENTIAL_KINDS as readonly string[]).includes(k)) throw new MigrationError(400, `unknown kind: ${String(k).slice(0, 40)}`);

  if (running) throw new MigrationError(409, "a migration is already running; wait for it to finish");
  running = true;
  try {
    const report: MigrationReport = { direction: opts.direction, dryRun: opts.dryRun, limit, byKind: {}, remaining: 0, releaseFailed: 0, failures: [], stoppedEarly: null };
    const from: Form = opts.direction === "to-store" ? "database" : "store";
    // A real run changes at most `limit` rows (failed and skipped rows do not use that up, or a damaged row at the
    // front would keep a run from ever getting past it); a dry run looks at most `limit` rows.
    let budget = limit;
    let failedRows = 0;
    for (const kind of kinds) {
      if (report.stoppedEarly) break;
      const k: KindReport = { eligible: 0, checked: 0, wouldFail: 0, moved: 0, skipped: 0, failed: 0 };
      report.byKind[kind] = k;
      const rows = (await rowsOf(kind)).filter((r) => formOf(r.blob) === from);
      k.eligible = rows.length;
      for (const row of rows) {
        if (budget <= 0) break;
        k.checked++;
        if (opts.dryRun) budget--;
        try {
          // References cannot be read without the store they point into.
          if (!store) throw new Error("the secret store is not configured on this server, so the reference cannot be read");
          const outcome = opts.direction === "to-store"
            ? await moveToStore(store, kind, row, opts.dryRun)
            : await moveToDatabase(store, kind, row, opts.dryRun, report);
          if (outcome === "moved") { k.moved++; budget--; }
          else if (outcome === "would-move") { /* counted in eligible */ }
          else k.skipped++;
        } catch (e: any) {
          if (opts.dryRun) k.wouldFail++; else k.failed++;
          fail(report, kind, row.id, brief(e));
          if (++failedRows >= STOP_AFTER_FAILURES) { report.stoppedEarly = `stopped after ${failedRows} rows failed; fix the cause (see failures) and run again`; break; }
        }
      }
      report.remaining += k.eligible - k.moved;
    }
    return report;
  } finally {
    running = false;
  }
}

function fail(report: MigrationReport, kind: CredentialKind, id: string, reason: string): void {
  if (report.failures.length < MAX_REPORTED_FAILURES) report.failures.push({ kind, id, reason });
}

type Outcome = "moved" | "would-move" | "changed";

async function moveToStore(store: SecretStore, kind: CredentialKind, row: { id: string; blob: string }, dryRun: boolean): Promise<Outcome> {
  let map: Record<string, string>;
  try { map = decryptCredentialMap(row.blob); } catch { throw new Error("the stored credentials cannot be decrypted with this server's vault key"); }
  if (dryRun) return "would-move";

  const name = await store.create(kind, map);
  try {
    // Read back what the store really holds, not what this process just remembered writing.
    store.forget(name);
    const back = await store.get(name);
    const same = Object.keys(map).length === Object.keys(back).length && Object.entries(map).every(([key, v]) => back[key] === v);
    if (!same) throw new Error("the secret read back from the store is not what was written");
    const place = PLACES[kind];
    const reference = JSON.stringify({ v: 2, store: "aws-sm", name });
    const changed = await db.update(place.table).set({ [place.prop]: reference }).where(and(eq(place.id, row.id), eq(place.column, row.blob))).returning({ id: place.id });
    if (changed.length === 0) {
      await store.remove(name, { forceNow: true }).catch(() => {});
      return "changed";
    }
    return "moved";
  } catch (e) {
    await store.remove(name, { forceNow: true }).catch(() => {});
    throw e;
  }
}

async function moveToDatabase(store: SecretStore, kind: CredentialKind, row: { id: string; blob: string }, dryRun: boolean, report: MigrationReport): Promise<Outcome> {
  const ref = parseReference(row.blob)!;
  store.forget(ref.name);
  const map = await store.get(ref.name);
  if (dryRun) return "would-move";

  const place = PLACES[kind];
  const changed = await db.update(place.table).set({ [place.prop]: encryptCredentialMap(map) }).where(and(eq(place.id, row.id), eq(place.column, row.blob))).returning({ id: place.id });
  if (changed.length === 0) return "changed";
  // The row no longer refers to it; the secret stays restorable for the recovery window.
  try { await releaseCredentials(row.blob); } catch { report.releaseFailed++; }
  return "moved";
}
