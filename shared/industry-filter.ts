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
import { PACK_INDUSTRY_IDS, packIndustryLabels } from "./industry-packs";
import { getBuiltInIndustry } from "./built-in-industries";

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

/**
 * The industry ids a request for `id` should read rows under.
 *
 * The cross-industry workspace is spelled two ways and both are live: the
 * industry picker's entry has id "custom" (industry-provider.tsx), while rows
 * are written with "cross_industry" by the agent detail, canary and eval
 * surfaces, and by anything posting industryId directly. Code that needed both
 * has so far bridged them one site at a time -- the workspace selector remaps
 * template counts inline, the agent wizard tests for each spelling separately
 * -- and a reader that forgets simply shows nothing: the ontology page asked
 * for "custom", got the 18 concepts filed that way, and could not reach the 91
 * filed under "cross_industry".
 *
 * This is deliberately NARROWER than NO_FILTER_INDUSTRY_IDS. Those ids mean
 * "don't filter this catalogue at all"; for a bucket of rows that each belong
 * to one industry, not filtering would return every industry's rows. The
 * cross-industry bucket is both of its spellings, not everything.
 *
 * Every other id is returned exactly as it came in, not normalised: callers
 * match it against stored values, and lower-casing here would quietly widen
 * what those lookups find.
 */
export function industryIdAliases(id: string | null | undefined): string[] {
  if (NO_FILTER_INDUSTRY_IDS.includes(norm(id))) return [...NO_FILTER_INDUSTRY_IDS];
  return [id ?? ""];
}

/**
 * What to call an industry in text a person will read.
 *
 * Industry ids are machine tokens — `financial_services`, `technology_saas`, `custom` — and they
 * were reaching model prompts verbatim, which put them in generated prose: "in the context of
 * custom operations", "within custom operations environments". Twenty-five ontology concepts were
 * written that way before anyone noticed, and `custom` is the worst of the set because it reads as
 * the ordinary English word rather than as an obviously wrong token.
 *
 * Falls back through built-ins, then packs, then a readable form of the id itself, so an industry
 * nobody has registered still produces words rather than a token. The cross-industry ids get the
 * name people actually use for that workspace, not "Custom".
 */
export function industryDisplayName(id: string | null | undefined): string {
  const v = norm(id);
  if (!v) return "enterprise";
  if (NO_FILTER_INDUSTRY_IDS.includes(v)) return "cross-industry";
  const builtIn = getBuiltInIndustry(v);
  if (builtIn?.label) return builtIn.label;
  const pack = packIndustryLabels[v];
  if (pack) return pack;
  return v.replace(/[_-]+/g, " ").trim() || "enterprise";
}

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

/** "request": the caller asked for an industry other than the organization's (a personal view). */
/**
 * Filter rows tagged with several industries (or none). A row with no industries
 * applies to every industry and is always kept.
 */
export function filterByIndustries<T>(rows: T[], wanted: string | null | undefined, pick: (row: T) => string[] | null | undefined): T[] {
  if (!norm(wanted) || NO_FILTER_INDUSTRY_IDS.includes(norm(wanted))) return rows;
  return rows.filter((row) => {
    const tags = pick(row);
    return !tags?.length || tags.some((t) => industryMatches(t, wanted));
  });
}

/** An optional ?industryId= query value. */
export function industryQuery(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
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
  if (requested && !(tenant && norm(requested) === norm(tenant))) {
    return { industryId: requested, subVertical: input.requestedSubVertical?.trim() || null, source: "request" };
  }
  if (requested && tenant) {
    // Asking for the organization's own industry isn't an override.
    return { industryId: tenant, subVertical: input.requestedSubVertical?.trim() || input.tenantSubVertical || null, source: "tenant" };
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
