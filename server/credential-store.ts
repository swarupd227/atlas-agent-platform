/**
 * Where a set of connector credentials is kept, decided per credential, behind one small async API.
 *
 *   sealCredentialMap(map, { kind, existing })  ->  the text the database column keeps
 *   openCredentialMap(blob)                     ->  the map back
 *   releaseCredentials(blob)                    ->  let go of what the blob refers to, if anything
 *
 * With no external store configured (the default) these are exactly encryptCredentialMap and
 * decryptCredentialMap from server/credential-vault.ts: the same blob, written and read the same way, and
 * an existing row is never touched. With the store configured, a credential of a kind that is switched on
 * is written to it and the column keeps only a reference, {"v":2,"store":"aws-sm","name":"..."}, which
 * holds no secret. A reference is always read from the store, whichever kinds are switched on now; if the
 * store is not configured when one is met it is an error, never a guess: there is nothing in the
 * database to fall back to. Rows made before the store was configured keep working and move to it the
 * next time they are written, or all at once when an administrator migrates them.
 */
import { decryptCredentialMap, encryptCredentialMap } from "./credential-vault";
import { getSecretStore, SecretStoreError, type CredentialKind } from "./secret-store";

export type { CredentialKind } from "./secret-store";

export interface ReferenceBlob { v: 2; store: "aws-sm"; name: string }

/** The reference a column holds, or null for anything else (a vault blob, empty, not JSON). */
export function parseReference(blob: string | null | undefined): ReferenceBlob | null {
  if (!blob || blob[0] !== "{") return null;
  try {
    const p = JSON.parse(blob);
    if (p && p.v === 2 && p.store === "aws-sm" && typeof p.name === "string" && p.name.length > 0 && p.name.length <= 512) return { v: 2, store: "aws-sm", name: p.name };
  } catch { /* not a reference */ }
  return null;
}

export const isReferenceBlob = (blob: string | null | undefined): boolean => parseReference(blob) !== null;

const referenceText = (name: string): string => JSON.stringify({ v: 2, store: "aws-sm", name } satisfies ReferenceBlob);

const notConfigured = () => new SecretStoreError("unavailable", "these credentials are kept in AWS Secrets Manager, but no secret store is configured on this server (ASTRA_SECRETS_MANAGER_PREFIX)");

export async function sealCredentialMap(
  map: Record<string, string>,
  opts: { kind: CredentialKind; existing?: string | null },
): Promise<string> {
  const store = await getSecretStore();
  const ref = parseReference(opts.existing);
  if (!store) {
    if (ref) throw notConfigured();
    return encryptCredentialMap(map);
  }
  if (ref) {
    // Already out there: update that secret in place, whatever kinds are switched on now.
    await store.put(ref.name, map);
    return referenceText(ref.name);
  }
  if (!store.config.kinds.includes(opts.kind)) return encryptCredentialMap(map);
  return referenceText(await store.create(opts.kind, map));
}

export async function openCredentialMap(blob: string): Promise<Record<string, string>> {
  const ref = parseReference(blob);
  if (!ref) return decryptCredentialMap(blob);
  const store = await getSecretStore();
  if (!store) throw notConfigured();
  return store.get(ref.name);
}

/**
 * Let go of what a blob refers to, when the row that held it is removed or its credentials are replaced. The
 * secret stays restorable for DELETE_RECOVERY_DAYS; `immediately` is for one that nothing ever referred to
 * (a secret made for a row whose write then failed), which no one could want back.
 */
export async function releaseCredentials(blob: string | null | undefined, opts: { immediately?: boolean } = {}): Promise<void> {
  const ref = parseReference(blob);
  if (!ref) return;
  const store = await getSecretStore();
  if (!store) throw notConfigured();
  await store.remove(ref.name, opts.immediately ? { forceNow: true } : undefined);
}

/**
 * releaseCredentials for several blobs after the row change that made them unreachable has already happened:
 * a failure is logged and not thrown, since undoing the change is worse than a secret left behind (it is
 * recoverable, and shows in the migration status as one nothing refers to).
 */
export async function releaseCredentialsQuietly(blobs: Array<string | null | undefined>, opts: { immediately?: boolean } = {}): Promise<void> {
  for (const blob of blobs) {
    if (!isReferenceBlob(blob)) continue;
    try { await releaseCredentials(blob, opts); } catch (e: any) {
      console.warn(`[credential-store] could not release a secret nothing refers to any more (${e?.code ?? "error"}): ${String(e?.message ?? e).slice(0, 200)}`);
    }
  }
}

/**
 * After a failed write of a row: remove the secret made for it, if this write made one. A blob that is the same
 * reference the row already had (an update in place) is not new and is left alone.
 */
export async function discardNewCredentials(written: string | null | undefined, previous: string | null | undefined): Promise<void> {
  if (!written || written === previous) return;
  await releaseCredentialsQuietly([written], { immediately: true });
}
