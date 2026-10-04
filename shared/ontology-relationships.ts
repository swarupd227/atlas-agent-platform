/**
 * Ontology relationships with meaning.
 *
 * A concept's `relationships` column has always been a JSON list of
 * `{ type, targetId, label }`. The page rendered whatever `type` said and
 * nothing else on the platform read it, so the ontology could show a term's
 * neighbours but could not answer "what does a policy consist of" or "who may
 * play the mortgagee role". This module gives the list a shape the platform can
 * read: a predicate from a known vocabulary (with its inverse and a display
 * group), a target that must be a concept id, and an optional cardinality.
 *
 * Nothing stored before this module existed is invalidated. `normalizeRelationship`
 * reads the old shape (`type`, including the four legacy values) and the new one,
 * and writes a row that carries BOTH `predicate` and `type` (equal), so a reader
 * that still looks at `type` keeps working. Unknown predicates are kept and
 * reported as warnings, never refused: the vocabulary grows from the data.
 */

export type PredicateGroup = "structure" | "parties" | "coverage" | "money" | "process" | "provenance" | "general";

export interface PredicateDefinition {
  predicate: string;
  inverse: string;
  group: PredicateGroup;
  /** How the link reads from the source's side, e.g. "is part of". */
  reads: string;
}

export interface OntologyRelationship {
  predicate: string;
  /** Mirrors `predicate`, kept so readers of the old shape keep working. */
  type: string;
  targetId: string;
  label?: string;
  cardinality?: "one" | "many";
  inverse?: string;
}

export interface SystemOfRecord {
  name: string;
  connectorId?: string;
  role: "master" | "copy" | "derived";
}

const DEFS: PredicateDefinition[] = [
  // structure
  { predicate: "partOf", inverse: "contains", group: "structure", reads: "is part of" },
  { predicate: "contains", inverse: "partOf", group: "structure", reads: "contains" },
  { predicate: "specializes", inverse: "specializedBy", group: "structure", reads: "is a kind of" },
  { predicate: "specializedBy", inverse: "specializes", group: "structure", reads: "has the kind" },
  { predicate: "attachedTo", inverse: "hasAttachment", group: "structure", reads: "is attached to" },
  { predicate: "hasAttachment", inverse: "attachedTo", group: "structure", reads: "has attached" },
  { predicate: "listedOn", inverse: "lists", group: "structure", reads: "is listed on" },
  { predicate: "lists", inverse: "listedOn", group: "structure", reads: "lists" },
  { predicate: "transactionOf", inverse: "hasTransaction", group: "structure", reads: "is a transaction of" },
  { predicate: "hasTransaction", inverse: "transactionOf", group: "structure", reads: "has the transaction" },
  // parties
  { predicate: "playsRole", inverse: "rolePlayedBy", group: "parties", reads: "plays the role" },
  { predicate: "rolePlayedBy", inverse: "playsRole", group: "parties", reads: "is played by" },
  { predicate: "heldBy", inverse: "holds", group: "parties", reads: "is held by" },
  { predicate: "holds", inverse: "heldBy", group: "parties", reads: "holds" },
  { predicate: "grantedBy", inverse: "grants", group: "parties", reads: "is granted by" },
  { predicate: "grants", inverse: "grantedBy", group: "parties", reads: "grants" },
  { predicate: "grantedTo", inverse: "receivesGrant", group: "parties", reads: "is granted to" },
  { predicate: "receivesGrant", inverse: "grantedTo", group: "parties", reads: "receives" },
  { predicate: "appointedBy", inverse: "appoints", group: "parties", reads: "is appointed by" },
  { predicate: "appoints", inverse: "appointedBy", group: "parties", reads: "appoints" },
  { predicate: "onContract", inverse: "hasParty", group: "parties", reads: "is on the contract" },
  { predicate: "hasParty", inverse: "onContract", group: "parties", reads: "has the party" },
  { predicate: "onClaim", inverse: "hasClaimParty", group: "parties", reads: "is on the claim" },
  { predicate: "hasClaimParty", inverse: "onClaim", group: "parties", reads: "has on it" },
  { predicate: "decidedBy", inverse: "decides", group: "parties", reads: "is decided by" },
  { predicate: "decides", inverse: "decidedBy", group: "parties", reads: "decides" },
  // coverage and exposure
  { predicate: "coveredBy", inverse: "covers", group: "coverage", reads: "is covered by" },
  { predicate: "covers", inverse: "coveredBy", group: "coverage", reads: "covers" },
  { predicate: "limits", inverse: "limitedBy", group: "coverage", reads: "limits" },
  { predicate: "limitedBy", inverse: "limits", group: "coverage", reads: "is limited by" },
  { predicate: "capsPeril", inverse: "cappedBy", group: "coverage", reads: "caps the peril" },
  { predicate: "cappedBy", inverse: "capsPeril", group: "coverage", reads: "is capped by" },
  { predicate: "locatedAt", inverse: "hosts", group: "coverage", reads: "is located at" },
  { predicate: "hosts", inverse: "locatedAt", group: "coverage", reads: "hosts" },
  { predicate: "inJurisdiction", inverse: "governs", group: "coverage", reads: "is in the jurisdiction" },
  { predicate: "governs", inverse: "inJurisdiction", group: "coverage", reads: "governs" },
  { predicate: "classifies", inverse: "classifiedBy", group: "coverage", reads: "classifies" },
  { predicate: "classifiedBy", inverse: "classifies", group: "coverage", reads: "is classified by" },
  // money
  { predicate: "leviedOn", inverse: "bears", group: "money", reads: "is levied on" },
  { predicate: "bears", inverse: "leviedOn", group: "money", reads: "bears" },
  { predicate: "computedOn", inverse: "basisFor", group: "money", reads: "is computed on" },
  { predicate: "basisFor", inverse: "computedOn", group: "money", reads: "is the basis for" },
  { predicate: "settledVia", inverse: "settles", group: "money", reads: "is settled via" },
  { predicate: "settles", inverse: "settledVia", group: "money", reads: "settles" },
  { predicate: "reportedIn", inverse: "reports", group: "money", reads: "is reported in" },
  { predicate: "reports", inverse: "reportedIn", group: "money", reads: "reports" },
  { predicate: "hasReserve", inverse: "reserveOn", group: "money", reads: "has the reserve" },
  { predicate: "reserveOn", inverse: "hasReserve", group: "money", reads: "is a reserve on" },
  { predicate: "hasPayment", inverse: "paymentOn", group: "money", reads: "has the payment" },
  { predicate: "paymentOn", inverse: "hasPayment", group: "money", reads: "is a payment on" },
  { predicate: "cededBy", inverse: "cedes", group: "money", reads: "is ceded by" },
  { predicate: "cedes", inverse: "cededBy", group: "money", reads: "cedes" },
  { predicate: "assumedBy", inverse: "assumes", group: "money", reads: "is assumed by" },
  { predicate: "assumes", inverse: "assumedBy", group: "money", reads: "assumes" },
  // process
  { predicate: "opens", inverse: "openedBy", group: "process", reads: "opens" },
  { predicate: "openedBy", inverse: "opens", group: "process", reads: "is opened by" },
  { predicate: "raises", inverse: "raisedBy", group: "process", reads: "raises" },
  { predicate: "raisedBy", inverse: "raises", group: "process", reads: "is raised by" },
  { predicate: "gates", inverse: "gatedBy", group: "process", reads: "gates" },
  { predicate: "gatedBy", inverse: "gates", group: "process", reads: "is gated by" },
  { predicate: "blocks", inverse: "blockedBy", group: "process", reads: "blocks" },
  { predicate: "blockedBy", inverse: "blocks", group: "process", reads: "is blocked by" },
  { predicate: "producedBy", inverse: "produces", group: "process", reads: "is produced by" },
  { predicate: "produces", inverse: "producedBy", group: "process", reads: "produces" },
  { predicate: "informs", inverse: "informedBy", group: "process", reads: "informs" },
  { predicate: "informedBy", inverse: "informs", group: "process", reads: "is informed by" },
  { predicate: "triggers", inverse: "triggeredBy", group: "process", reads: "triggers" },
  { predicate: "triggeredBy", inverse: "triggers", group: "process", reads: "is triggered by" },
  { predicate: "becomes", inverse: "arisesFrom", group: "process", reads: "becomes" },
  { predicate: "arisesFrom", inverse: "becomes", group: "process", reads: "arises from" },
  // provenance
  { predicate: "derivedFrom", inverse: "derives", group: "provenance", reads: "is derived from" },
  { predicate: "derives", inverse: "derivedFrom", group: "provenance", reads: "derives" },
  { predicate: "summarises", inverse: "summarisedBy", group: "provenance", reads: "summarises" },
  { predicate: "summarisedBy", inverse: "summarises", group: "provenance", reads: "is summarised by" },
  { predicate: "documentedBy", inverse: "documents", group: "provenance", reads: "is documented by" },
  { predicate: "documents", inverse: "documentedBy", group: "provenance", reads: "documents" },
  // general (the legacy four live here, with their inverses)
  { predicate: "related", inverse: "related", group: "general", reads: "is related to" },
  { predicate: "dependsOn", inverse: "dependedOnBy", group: "general", reads: "depends on" },
  { predicate: "dependedOnBy", inverse: "dependsOn", group: "general", reads: "is depended on by" },
];

export const PREDICATES: ReadonlyMap<string, PredicateDefinition> = new Map(DEFS.map((d) => [d.predicate, d]));
export const PREDICATE_GROUPS: readonly PredicateGroup[] = ["structure", "parties", "coverage", "money", "process", "provenance", "general"];

/** The four values the column held before this module, and what they mean now. */
const LEGACY: Record<string, string> = { related: "related", depends_on: "dependsOn", parent: "partOf", child: "contains" };

export function isKnownPredicate(p: string): boolean {
  return PREDICATES.has(p);
}

export function inverseOf(predicate: string): string | undefined {
  return PREDICATES.get(predicate)?.inverse;
}

export function groupOf(predicate: string): PredicateGroup {
  return PREDICATES.get(predicate)?.group ?? "general";
}

/** How the link reads from the source's side; an unknown predicate reads as its own words. */
export function readsAs(predicate: string): string {
  const d = PREDICATES.get(predicate);
  if (d) return d.reads;
  return predicate.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").toLowerCase();
}

/**
 * Read a stored or submitted relationship in either shape and return the
 * canonical one. Returns null when there is no target at all, which is the only
 * thing that makes a relationship meaningless.
 */
export function normalizeRelationship(raw: unknown): OntologyRelationship | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const targetId = typeof r.targetId === "string" ? r.targetId.trim() : typeof r.target === "string" ? r.target.trim() : "";
  if (!targetId) return null;
  const given = typeof r.predicate === "string" && r.predicate.trim() ? r.predicate.trim() : typeof r.type === "string" && r.type.trim() ? r.type.trim() : "related";
  const predicate = LEGACY[given] ?? given;
  const out: OntologyRelationship = { predicate, type: predicate, targetId };
  if (typeof r.label === "string" && r.label.trim()) out.label = r.label.trim();
  if (r.cardinality === "one" || r.cardinality === "many") out.cardinality = r.cardinality;
  const inv = typeof r.inverse === "string" && r.inverse.trim() ? r.inverse.trim() : inverseOf(predicate);
  if (inv) out.inverse = inv;
  return out;
}

export interface RelationshipValidation {
  normalized: OntologyRelationship[];
  /** Refusals: a target that is not a concept id the caller may link to. */
  errors: string[];
  /** Advisories: a predicate outside the vocabulary. Stored anyway. */
  warnings: string[];
}

/**
 * Normalise a submitted list and check every target against the ids the
 * caller may link to (the concepts of the same industry). A label in place of
 * an id is resolved when it names exactly one concept, which is what the old
 * reconcile route did after the fact; here it happens on the way in.
 */
export function validateRelationships(
  raw: unknown,
  known: { ids: Iterable<string>; labels?: Map<string, string> },
): RelationshipValidation {
  const ids = new Set(known.ids);
  const labels = known.labels ?? new Map<string, string>();
  const out: RelationshipValidation = { normalized: [], errors: [], warnings: [] };
  if (!Array.isArray(raw)) return out;
  raw.forEach((item, i) => {
    const rel = normalizeRelationship(item);
    if (!rel) { out.errors.push(`relationships[${i}] has no target`); return; }
    if (!ids.has(rel.targetId)) {
      const byLabel = labels.get(rel.targetId.toLowerCase());
      if (byLabel) rel.targetId = byLabel;
      else { out.errors.push(`relationships[${i}] (${rel.predicate}) points at "${rel.targetId}", which is not a concept in this industry`); return; }
    }
    if (!isKnownPredicate(rel.predicate)) out.warnings.push(`relationships[${i}] uses the predicate "${rel.predicate}", which is not in the vocabulary; stored as given`);
    out.normalized.push(rel);
  });
  return out;
}

export function normalizeSystemsOfRecord(raw: unknown): SystemOfRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: SystemOfRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name.trim() : "";
    if (!name) continue;
    const role = r.role === "copy" || r.role === "derived" ? r.role : "master";
    const sor: SystemOfRecord = { name, role };
    if (typeof r.connectorId === "string" && r.connectorId.trim()) sor.connectorId = r.connectorId.trim();
    out.push(sor);
  }
  return out;
}

/** Tier C left provenance as `sor:<name>` tags until this field existed; this reads them back. */
export function systemsOfRecordFromTags(tags: readonly string[] | null | undefined): { systems: SystemOfRecord[]; remainingTags: string[] } {
  const systems: SystemOfRecord[] = [];
  const remainingTags: string[] = [];
  for (const t of tags ?? []) {
    const m = /^sor:(.+)$/.exec(t);
    if (m) systems.push({ name: m[1].replace(/-/g, " "), role: "master" });
    else remainingTags.push(t);
  }
  return { systems, remainingTags };
}
