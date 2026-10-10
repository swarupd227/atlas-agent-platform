/**
 * Resolves the OAuth application (client id / secret / tenant) used for an
 * integration's authorization-code and refresh-token calls.
 *
 * An organization admin can register its own app from the Integrations screen
 * (integration_oauth_apps); that wins. When none is saved, fall back to the
 * platform-wide OAUTH_<ID>_CLIENT_ID / _CLIENT_SECRET environment variables,
 * exactly as before, so connectors configured that way keep working.
 */
import { storage } from "../storage";
import { isReferenceBlob, openCredentialMap } from "../credential-store";

export interface ResolvedOAuthApp {
  clientId: string;
  clientSecret: string;
  tenantId?: string;
  source: "organization" | "environment" | "none";
}

export async function resolveOAuthApp(
  orgId: string | null | undefined,
  integrationId: string,
): Promise<ResolvedOAuthApp> {
  if (orgId) {
    let row: Awaited<ReturnType<typeof storage.getIntegrationOAuthApp>> | null = null;
    try {
      row = await storage.getIntegrationOAuthApp(orgId, integrationId);
    } catch { /* fall through to the environment */ }
    if (row?.clientId) {
      let clientSecret = "";
      if (row.clientSecretEncrypted) {
        if (isReferenceBlob(row.clientSecretEncrypted)) {
          // Kept in the external secret store (server/credential-store.ts). If it cannot be read this is an error:
          // neither an empty secret nor the platform's own app may stand in for the organization's.
          clientSecret = (await openCredentialMap(row.clientSecretEncrypted)).client_secret ?? "";
        } else {
          try { clientSecret = (await openCredentialMap(row.clientSecretEncrypted)).client_secret ?? ""; } catch { /* unreadable secret: treated as unset */ }
        }
      }
      return { clientId: row.clientId, clientSecret, tenantId: row.tenantId ?? undefined, source: "organization" };
    }
  }
  const envKey = integrationId.toUpperCase();
  const clientId = process.env[`OAUTH_${envKey}_CLIENT_ID`] ?? "";
  const clientSecret = process.env[`OAUTH_${envKey}_CLIENT_SECRET`] ?? "";
  return { clientId, clientSecret, source: clientId ? "environment" : "none" };
}

/**
 * Microsoft's registry URLs use the multi-tenant /common/ endpoint, which
 * rejects single-tenant app registrations (AADSTS50194). When the org saved a
 * tenant, point the authorize/token URL at that tenant instead.
 */
export function withTenant(url: string, tenantId?: string): string {
  if (!tenantId) return url;
  return url.replace("login.microsoftonline.com/common/", `login.microsoftonline.com/${encodeURIComponent(tenantId)}/`);
}
