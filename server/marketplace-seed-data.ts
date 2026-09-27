/**
 * Connector Library seed data — real registry sources to replace the fake demo ones
 * ("MCP Official Registry" at registry.mcp.so, "MCP Community Hub", "Acme Corp Internal" —
 * none of these domains are real; POST /registry-sources/:id/sync never fetched anything from
 * them, it just marked lastSyncStatus "success" unconditionally) plus a small, curated catalog
 * of real SaaS OpenAPI specs. Every URL below was fetched and confirmed to parse as real
 * OpenAPI/Swagger before being added here — see the "Connector Library" plan for the specific
 * verification done on each. Kept deliberately short rather than padded with guessed URLs;
 * extend it the same way (verify live, then add) rather than assuming a spec found by memory
 * or search is still at that path.
 */
import { storage } from "./storage";
import type { InsertRegistrySource, InsertMarketplaceServer } from "@shared/schema";

/** Sentinel registrySourceId for the read-only catalog rows server/integrations/register.ts's
 *  hardcoded connectors get upserted into (see upsertNativeCatalogEntry there). Not a real
 *  syncable source -- there is nothing to fetch, the connectors are defined in code. */
export const NATIVE_REGISTRY_SOURCE_ID = "native-connectors";

const FAKE_SEED_REGISTRY_SOURCE_IDS = ["reg-official-001", "reg-community-001", "reg-internal-001"];

const REAL_REGISTRY_SOURCES: InsertRegistrySource[] = [
  {
    name: "Astra Agents Native Connectors",
    description: "Built-in, purpose-written connectors shipped with the platform (Salesforce, HubSpot, ServiceNow, Microsoft Graph, and others in server/integrations/register.ts). Already installed -- not a syncable source.",
    apiUrl: "internal://native-connectors",
    apiType: "native",
    authType: "none",
    syncIntervalMinutes: 0,
    enabled: true,
    addedBy: "platform_admin",
  } as InsertRegistrySource,
  {
    name: "MCP Registry (official)",
    description: "The official Model Context Protocol server registry (registry.modelcontextprotocol.io), maintained by the MCP project.",
    apiUrl: "https://registry.modelcontextprotocol.io/v0/servers",
    apiType: "mcp-registry",
    authType: "none",
    syncIntervalMinutes: 1440,
    enabled: true,
    addedBy: "platform_admin",
  } as InsertRegistrySource,
  {
    name: "Curated OpenAPI Catalog",
    description: "A hand-maintained list of real SaaS OpenAPI/Swagger specs, verified individually before being added, ready to import as connectors on demand.",
    apiUrl: "internal://curated-openapi-catalog",
    apiType: "openapi-catalog",
    authType: "none",
    syncIntervalMinutes: 1440,
    enabled: true,
    addedBy: "platform_admin",
  } as InsertRegistrySource,
];

/** Read by the "openapi-catalog" branch of POST /registry-sources/:id/sync. The spec itself is
 *  fetched and parsed lazily at install time (server/openapi-import.ts's parseOpenApiSpec), not
 *  here -- sync only needs to create the lightweight catalog rows. */
export interface CuratedOpenApiEntry {
  name: string;
  description: string;
  category: string;
  specUrl: string;
  authHint: string;
  riskTier: "LOW" | "MEDIUM" | "HIGH";
}

export const CURATED_OPENAPI_CATALOG: CuratedOpenApiEntry[] = [
  {
    name: "Plaid",
    description: "Bank-account linking and transaction data aggregation. Verified OpenAPI 3.0 spec, ~/asset_report, /transactions, /accounts, /identity endpoints.",
    category: "data",
    specUrl: "https://raw.githubusercontent.com/plaid/plaid-openapi/master/2020-09-14.yml",
    authHint: "api_key (PLAID-CLIENT-ID + PLAID-SECRET headers)",
    riskTier: "HIGH",
  },
  {
    name: "DocuSign eSignature",
    description: "Send, track, and manage electronic signature envelopes. Verified Swagger 2.0 spec, host www.docusign.net.",
    category: "business",
    specUrl: "https://raw.githubusercontent.com/docusign/OpenAPI-Specifications/master/esignature.rest.swagger-v2.1.json",
    authHint: "oauth2",
    riskTier: "MEDIUM",
  },
  {
    name: "Stripe",
    description: "Payments, invoicing, and subscription billing. Verified real OpenAPI 3.0 spec, but it is very large (10MB+) -- confirm the import pipeline's fetch timeout and payload size before relying on a full import; consider trimming to the specific path prefixes actually needed (e.g. /v1/charges, /v1/customers) rather than importing everything.",
    category: "business",
    specUrl: "https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json",
    authHint: "bearer",
    riskTier: "HIGH",
  },
];

/** Idempotent startup step: removes the fake demo registry sources (and any marketplace_servers
 *  rows that pointed at them -- there is nothing else to preserve there, they were never real),
 *  then ensures the native/mcp-registry/openapi-catalog sources exist. Safe to run on every
 *  boot; never touches a marketplace_servers row whose installStatus is not "available" (an
 *  already-installed entry, including anything a customer connected through one of the fake
 *  sources, is left exactly as-is -- see the Connector Library plan's non-disruption section). */
export async function ensureMarketplaceSeedData(): Promise<void> {
  const allServers = await storage.getMarketplaceServers();
  for (const fakeId of FAKE_SEED_REGISTRY_SOURCE_IDS) {
    const orphaned = allServers.filter((s) => s.registrySourceId === fakeId && s.installStatus === "available");
    for (const row of orphaned) {
      await storage.deleteMarketplaceServer(row.id);
    }
    await storage.deleteRegistrySource(fakeId).catch(() => {});
  }

  const existingSources = await storage.getRegistrySources();
  for (const def of REAL_REGISTRY_SOURCES) {
    const existing = existingSources.find((s) => s.name === def.name);
    if (existing) continue;
    // The native-connectors row needs a stable, predictable id -- register.ts's
    // upsertNativeCatalogEntry references NATIVE_REGISTRY_SOURCE_ID as a compile-time constant,
    // independently of whatever order these two startup routines run in (registrySourceId has
    // no DB-level foreign key constraint, so this ordering is safe either way, but the id still
    // needs to actually match once both have run). The other two sources get a normal generated id.
    const values = def.apiType === "native" ? ({ ...def, id: NATIVE_REGISTRY_SOURCE_ID } as any) : def;
    await storage.createRegistrySource(values);
  }
}
