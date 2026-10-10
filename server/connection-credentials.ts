/**
 * Writing connector credentials to their rows, one at a time per connection type.
 *
 * Where a credential lives (the database, or a secret in the external secret store: server/credential-store.ts) is
 * decided as it is written, and writing it can make a secret. Two writers at once, each reading the row, each making a
 * secret and each writing its own reference, would leave one of those secrets with nothing referring to it: a stored
 * credential no one can see or delete. So every write here runs in one transaction under a lock for the
 * (organization, integration type) it belongs to, reads the row as it is once it holds the lock, and removes the secret it
 * made if the write does not happen. (The same shape as the one-row-per-server rule for MCP server credentials.)
 *
 * The lock is held across the call to the secret store: some milliseconds, and at worst that store's own timeout when it is
 * unreachable. A save of one connection type never waits for another type's. Everything inside the transaction uses the
 * transaction's own connection, so no writer waits for a second connection from the pool while it holds one.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { integrationConnections, integrationOAuthApps, type InsertIntegrationConnection, type IntegrationConnection, type IntegrationOAuthApp } from "@shared/schema";
import { db } from "./db";
import { discardNewCredentials, openCredentialMap, sealCredentialMap } from "./credential-store";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const lock = (tx: Tx, kind: string, organizationId: string, integrationId: string) =>
  tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${kind}:${organizationId}:${integrationId}`}))`);

/** The organization's default connection of a type, resolved as storage.getIntegrationConnection does. */
async function defaultOf(tx: Tx, organizationId: string, integrationId: string): Promise<IntegrationConnection | null> {
  const [row] = await tx.select().from(integrationConnections)
    .where(and(eq(integrationConnections.organizationId, organizationId), eq(integrationConnections.integrationId, integrationId)))
    .orderBy(desc(integrationConnections.isDefault), integrationConnections.createdAt)
    .limit(1);
  return row ?? null;
}

async function inOrg(tx: Tx, organizationId: string, connectionId: string): Promise<IntegrationConnection | null> {
  const [row] = await tx.select().from(integrationConnections)
    .where(and(eq(integrationConnections.organizationId, organizationId), eq(integrationConnections.id, connectionId)));
  return row ?? null;
}

/**
 * Saves the credentials of a connection: the one `connectionId` names, else the default of the type (as
 * storage.upsertIntegrationConnection chooses), else a new one; `createNew` always adds one. A new connection is the
 * default of its type unless one already is. The credentials are sealed against what the row holds, so one kept in
 * the secret store is updated in place there.
 */
export async function saveConnectionCredentials(
  data: Omit<InsertIntegrationConnection, "credentialBlob">,
  credentials: Record<string, string>,
  opts: { connectionId?: string; createNew?: boolean } = {},
): Promise<IntegrationConnection> {
  let written: string | undefined;
  let previous: string | null | undefined;
  try {
    return await db.transaction(async (tx) => {
      await lock(tx, "integration_connection", data.organizationId, data.integrationId);
      const target = opts.createNew ? null
        : opts.connectionId ? await inOrg(tx, data.organizationId, opts.connectionId)
        : await defaultOf(tx, data.organizationId, data.integrationId);
      previous = target?.credentialBlob ?? null;
      written = await sealCredentialMap(credentials, { kind: "connection", existing: previous });
      if (target) {
        const [row] = await tx.update(integrationConnections)
          .set({
            credentialBlob: written,
            oauthScopes: data.oauthScopes,
            tokenExpiresAt: data.tokenExpiresAt,
            status: data.status,
            lastTestResult: data.lastTestResult,
            lastError: data.lastError,
            mcpServerId: data.mcpServerId,
            // Only overwrite the instance label when the caller actually supplied one.
            ...(data.name != null ? { name: data.name } : {}),
            updatedAt: new Date(),
          })
          .where(eq(integrationConnections.id, target.id))
          .returning();
        return row;
      }
      // idx_int_conn_one_default is unique, so a new connection is the default only when nothing else is.
      const siblingDefault = await defaultOf(tx, data.organizationId, data.integrationId);
      const [row] = await tx.insert(integrationConnections)
        .values({ ...data, credentialBlob: written, ...(siblingDefault ? { isDefault: false } : {}) })
        .returning();
      return row;
    });
  } catch (e) {
    // The transaction did not commit, so nothing refers to a secret this save made.
    await discardNewCredentials(written, previous);
    throw e;
  }
}

/**
 * Changes some fields of a connection's credentials and keeps the rest. The merge is made against the credentials as
 * they are once the lock is held, not as the caller last saw them. Null when the connection is not in the organization.
 */
export async function patchConnectionCredentials(
  organizationId: string,
  connectionId: string,
  changes: Record<string, string>,
): Promise<{ connection: IntegrationConnection; credentials: Record<string, string> } | null> {
  const first = await inOrg(db as unknown as Tx, organizationId, connectionId);
  if (!first) return null;
  let written: string | undefined;
  let previous: string | null | undefined;
  try {
    return await db.transaction(async (tx) => {
      await lock(tx, "integration_connection", organizationId, first.integrationId);
      const conn = await inOrg(tx, organizationId, connectionId);
      if (!conn) return null;
      previous = conn.credentialBlob ?? null;
      const merged = { ...(previous ? await openCredentialMap(previous) : {}), ...changes };
      written = await sealCredentialMap(merged, { kind: "connection", existing: previous });
      const [row] = await tx.update(integrationConnections)
        .set({ credentialBlob: written, updatedAt: new Date() })
        .where(eq(integrationConnections.id, conn.id))
        .returning();
      return { connection: row, credentials: merged };
    });
  } catch (e) {
    await discardNewCredentials(written, previous);
    throw e;
  }
}

/**
 * Stores the tokens an OAuth refresh obtained, on the connection they were read from (by id: never on the default
 * of the type). False, and nothing written, when the connection was deleted or disconnected in the meantime: a refresh
 * does not bring a disconnected connection back.
 */
export async function saveRefreshedConnectionCredentials(
  connectionId: string,
  credentials: Record<string, string>,
  tokenExpiresAt?: Date | null,
): Promise<boolean> {
  const [first] = await db.select().from(integrationConnections).where(eq(integrationConnections.id, connectionId));
  if (!first) return false;
  let written: string | undefined;
  let previous: string | null | undefined;
  try {
    return await db.transaction(async (tx) => {
      await lock(tx, "integration_connection", first.organizationId, first.integrationId);
      const conn = await inOrg(tx, first.organizationId, connectionId);
      if (!conn || !conn.credentialBlob || conn.status === "disconnected") return false;
      previous = conn.credentialBlob;
      written = await sealCredentialMap(credentials, { kind: "connection", existing: previous });
      await tx.update(integrationConnections)
        .set({ credentialBlob: written, ...(tokenExpiresAt !== undefined && tokenExpiresAt !== null ? { tokenExpiresAt } : {}), updatedAt: new Date() })
        .where(eq(integrationConnections.id, conn.id));
      return true;
    });
  } catch (e) {
    await discardNewCredentials(written, previous);
    throw e;
  }
}

/**
 * Saves an organization's OAuth app. `clientSecret` undefined keeps the stored secret; a value replaces it (in place,
 * if it is kept in the secret store).
 */
export async function saveOAuthApp(
  organizationId: string,
  integrationId: string,
  data: { clientId: string; tenantId?: string | null; updatedBy?: string | null },
  clientSecret?: string,
): Promise<IntegrationOAuthApp> {
  let written: string | undefined;
  let previous: string | null | undefined;
  try {
    return await db.transaction(async (tx) => {
      await lock(tx, "integration_oauth_app", organizationId, integrationId);
      const [existing] = await tx.select().from(integrationOAuthApps)
        .where(and(eq(integrationOAuthApps.organizationId, organizationId), eq(integrationOAuthApps.integrationId, integrationId)))
        .limit(1);
      previous = existing?.clientSecretEncrypted ?? null;
      if (clientSecret) written = await sealCredentialMap({ client_secret: clientSecret }, { kind: "oauth-app", existing: previous });
      if (existing) {
        const [row] = await tx.update(integrationOAuthApps)
          .set({
            clientId: data.clientId,
            ...(written !== undefined ? { clientSecretEncrypted: written } : {}),
            tenantId: data.tenantId ?? null,
            updatedBy: data.updatedBy ?? null,
            updatedAt: new Date(),
          })
          .where(eq(integrationOAuthApps.id, existing.id))
          .returning();
        return row;
      }
      const [row] = await tx.insert(integrationOAuthApps).values({
        organizationId,
        integrationId,
        clientId: data.clientId,
        clientSecretEncrypted: written ?? null,
        tenantId: data.tenantId ?? null,
        updatedBy: data.updatedBy ?? null,
      }).returning();
      return row;
    });
  } catch (e) {
    await discardNewCredentials(written, previous);
    throw e;
  }
}
