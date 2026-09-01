/**
 * Deterministic mandate quality checks (PRD S1.1.3: "vague mandates rejected
 * before deployment"). No LLM, no network call -- cheap enough to run on
 * every warrant-issuance attempt and every Mandate-tab page load.
 *
 * report.ok is true only when EVERY check passes, regardless of its
 * `severity` label. Severity is for human legibility (which issues are more
 * serious), not a signal that "warning"-labeled checks are optional -- the
 * story's own 4th criterion is explicit that a lint failure of any kind must
 * block warrant issuance, "not just raise a warning."
 */
import type { AgentMandate } from "@shared/schema";
import { storage } from "./storage";

export type MandateLintCheckId =
  | "mandate_approved"
  | "must_never_present"
  | "scope_names_ontology_entity"
  | "termination_or_compensation_stated";

export interface MandateLintCheck {
  id: MandateLintCheckId;
  severity: "error" | "warning";
  ok: boolean;
  reason: string;
}

export interface MandateLintReport {
  ok: boolean;
  checks: MandateLintCheck[];
}

// Mirrors the exact cache pattern getOntologySensitivityKeys already uses in
// server/permissions.ts for this same table -- ~110 rows, cheap to hold
// whole, refreshed at most once a minute. ontology_concepts is not org-scoped
// (no organizationId column), so this cache is process-wide, not per-org.
const CACHE_TTL_MS = 60_000;
let cachedConcepts: { concepts: Array<{ label: string; synonyms: string[] | null }>; cachedAt: number } | null = null;

async function getCachedOntologyConcepts() {
  if (cachedConcepts && Date.now() - cachedConcepts.cachedAt < CACHE_TTL_MS) {
    return cachedConcepts.concepts;
  }
  const rows = await storage.getAllOntologyConcepts();
  const concepts = rows.map(c => ({ label: c.label, synonyms: c.synonyms }));
  cachedConcepts = { concepts, cachedAt: Date.now() };
  return concepts;
}

// Mirrors invalidateOntologySensitivityCache (server/permissions.ts) for the
// same table -- real production purpose (call after an ontology concept is
// edited/created so the next lint sees it within the request, not up to 60s
// later), and what tests use to avoid cross-test cache bleed.
export function invalidateMandateLintOntologyCache() {
  cachedConcepts = null;
}

export async function lintMandate(mandate: AgentMandate | undefined): Promise<MandateLintReport> {
  const checks: MandateLintCheck[] = [];

  const approved = mandate?.status === "active";
  checks.push({
    id: "mandate_approved",
    severity: "error",
    ok: approved,
    reason: approved ? "Mandate is approved." : "Mandate has not been approved -- nobody has signed off on it yet.",
  });

  const mustNever = mandate?.mustNever?.trim();
  checks.push({
    id: "must_never_present",
    severity: "error",
    ok: !!mustNever,
    reason: mustNever
      ? "\"Must never\" is stated."
      : "Mandate has no \"must never\" section -- an agent with no stated limits cannot be trusted with authority.",
  });

  const scopeText = `${mandate?.whatItDoes || ""} ${mandate?.mustNever || ""}`.toLowerCase();
  let matchedLabel: string | undefined;
  if (scopeText.trim()) {
    const concepts = await getCachedOntologyConcepts();
    const match = concepts.find(c =>
      scopeText.includes(c.label.toLowerCase()) ||
      (c.synonyms || []).some(s => scopeText.includes(s.toLowerCase()))
    );
    matchedLabel = match?.label;
  }
  checks.push({
    id: "scope_names_ontology_entity",
    severity: "warning",
    ok: !!matchedLabel,
    reason: matchedLabel
      ? `Scope references "${matchedLabel}".`
      : "Scope statement doesn't name any recognized domain entity -- consider grounding it in specific data or processes this agent touches.",
  });

  const hasTermination = !!(mandate?.whenToStop?.trim() || mandate?.fallbackBehavior?.trim());
  checks.push({
    id: "termination_or_compensation_stated",
    severity: "warning",
    ok: hasTermination,
    reason: hasTermination
      ? "Termination or compensation behavior is stated."
      : "No termination or compensation behavior stated (\"when it should stop\" / \"if it can't finish\") -- unclear what happens when this agent can't complete its work.",
  });

  return { ok: checks.every(c => c.ok), checks };
}

export interface MandateLintSummary {
  agentId: string;
  ok: boolean;
  hasMandate: boolean;
}

// Fleet-wide summary for the Agents-list Mandate column (S1.1.4). One bulk
// mandate query, then per-agent lintMandate() calls reuse the same
// process-wide ontology cache above -- so this is one DB round trip for
// mandates plus at most one for concepts, not N sequential lint passes.
export async function lintMandatesForAgents(agentIds: string[], orgId?: string): Promise<Record<string, MandateLintSummary>> {
  const results: Record<string, MandateLintSummary> = {};
  if (!agentIds.length) return results;
  const mandates = await storage.getAgentMandatesForAgents(agentIds, orgId);
  const byAgentId = new Map(mandates.map(m => [m.agentId, m]));
  for (const agentId of agentIds) {
    const mandate = byAgentId.get(agentId);
    const report = await lintMandate(mandate);
    results[agentId] = { agentId, ok: report.ok, hasMandate: !!mandate };
  }
  return results;
}
