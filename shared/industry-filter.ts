/**
 * The rules for "which industry applies here", shared by the server and the
 * client. Pure: no storage, no request.
 *
 * An organization's industry is the default; a value the caller supplies
 * explicitly (a page that passes ?industryId=, a person viewing another
 * industry) wins over it. Rows that belong to no particular industry are
 * always included when filtering, so a filter narrows a catalogue and never
 * hides the general-purpose entries in it.
 */
import { PACK_INDUSTRY_IDS } from "./industry-packs";

/** Built-in verticals. Mirrors BUILT_IN_INDUSTRY_IDS in client/src/components/industry-provider.tsx (a test keeps them equal). */
export const BUILT_IN_INDUSTRY_IDS = [
  "financial_services", "insurance", "healthcare", "manufacturing",
  "retail", "technology_saas", "legal_services", "custom",
] as const;

/** Values stored on rows that mean "not specific to one industry". */
export const UNIVERSAL_INDUSTRY_IDS = ["cross_industry", "general", "all", ""];

/** Requested values that mean "don't filter". */
export const NO_FILTER_INDUSTRY_IDS = ["custom", "cross_industry"];

const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

export function isKnownIndustry(id: string | null | undefined): boolean {
  const v = norm(id);
  return !!v && ((BUILT_IN_INDUSTRY_IDS as readonly string[]).includes(v) || PACK_INDUSTRY_IDS.map(norm).includes(v));
}

/** Does a row tagged `rowIndustry` belong in a view filtered to `wanted`? */
export function industryMatches(rowIndustry: string | null | undefined, wanted: string | null | undefined): boolean {
  const w = norm(wanted);
  if (!w || NO_FILTER_INDUSTRY_IDS.includes(w)) return true;
  const r = norm(rowIndustry);
  if (UNIVERSAL_INDUSTRY_IDS.includes(r)) return true;
  return r === w;
}

export function filterByIndustry<T>(rows: T[], wanted: string | null | undefined, pick: (row: T) => string | null | undefined): T[] {
  if (!norm(wanted) || NO_FILTER_INDUSTRY_IDS.includes(norm(wanted))) return rows;
  return rows.filter((row) => industryMatches(pick(row), wanted));
}

export type IndustrySource = "request" | "tenant" | "none";

export interface IndustrySelection {
  industryId: string | null;
  subVertical: string | null;
  source: IndustrySource;
}

/**
 * The industry in effect: an explicitly requested one wins; otherwise the
 * organization's. A requested industry that differs from the organization's
 * doesn't inherit the organization's sub-vertical.
 */
export function resolveIndustrySelection(input: {
  requested?: string | null;
  requestedSubVertical?: string | null;
  tenantIndustryId?: string | null;
  tenantSubVertical?: string | null;
}): IndustrySelection {
  const requested = input.requested?.trim() || null;
  const tenant = input.tenantIndustryId?.trim() || null;
  if (requested) {
    const sameAsTenant = !!tenant && norm(requested) === norm(tenant);
    return {
      industryId: requested,
      subVertical: input.requestedSubVertical?.trim() || (sameAsTenant ? input.tenantSubVertical ?? null : null),
      source: "request",
    };
  }
  if (tenant) return { industryId: tenant, subVertical: input.tenantSubVertical ?? null, source: "tenant" };
  return { industryId: null, subVertical: null, source: "none" };
}

/**
 * An agent's industry: its own, else the organization's. A deployment's
 * industry is used only when it is a real industry id -- deployments have
 * been written with invented values (e.g. "technology").
 */
export function pickAgentIndustry(input: {
  agentIndustryId?: string | null;
  deploymentIndustry?: string | null;
  tenantIndustryId?: string | null;
}): string | null {
  if (input.agentIndustryId?.trim()) return input.agentIndustryId.trim();
  if (input.tenantIndustryId?.trim()) return input.tenantIndustryId.trim();
  if (isKnownIndustry(input.deploymentIndustry)) return input.deploymentIndustry!.trim();
  return null;
}

/**
 * Should a browser adopt its organization's industry? Yes, unless the person
 * is deliberately viewing another industry, or has just cleared their view to
 * pick a new one (the setup wizard is open). Returns the industry to adopt.
 */
export function industryToAdopt(input: {
  tenantIndustryId?: string | null;
  localIndustryId?: string | null;
  personalIndustryId?: string | null;
  choosing?: boolean;
}): string | null {
  const tenant = input.tenantIndustryId?.trim();
  if (!tenant || input.choosing) return null;
  const local = input.localIndustryId?.trim() || null;
  if (local === tenant) return null;
  if (input.personalIndustryId && local && input.personalIndustryId === local) return null;
  return tenant;
}

/** Where the industry a person sees comes from. */
export function industrySourceOf(localIndustryId: string | null | undefined, tenantIndustryId: string | null | undefined): "tenant" | "local" | "none" {
  if (!localIndustryId) return "none";
  return tenantIndustryId && localIndustryId === tenantIndustryId ? "tenant" : "local";
}
