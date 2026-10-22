import { BANKS, LOANS, getLoan, now, ruleById, type LoanSeed } from "./mb-mortgage-seed";

/**
 * The mutable side of the Mutual Bancorp mortgage fixture world, shared by the
 * LOS, the document repository and the guidelines library so that a condition
 * proposed in one is checked against the documents and rules of the others.
 *
 * One reset clears all three systems, because they describe one world.
 */

export interface Citation { ref: string; kind: "package" | "upload"; documentId: string; page: number }

export interface Condition {
  conditionId: string;
  code: string;
  conditionClass: "credit" | "documentary";
  timing: "prior_to_doc" | "prior_to_funding";
  status: "proposed" | "open" | "rejected" | "routed_to_underwriter" | "cleared" | "waived";
  description: string;
  borrowerRequest: string;
  evidenceRefs: string[];
  ruleRefs: string[];
  proposedBy: string;
  events: Array<{ type: string; actorId: string; actorRole?: string; at: string; approvalId?: string; rationale?: string; documentRefs?: string[] }>;
}

export interface Upload {
  documentId: string;
  kind: string;
  title: string;
  receivedAt: string;
  respondsTo: string[];
  pages: Array<{ page: number; text: string }>;
  /** What the LOS checks a documentary clear against. Never returned to callers. */
  facts: Record<string, unknown>;
}

export interface LoanState {
  loanId: string;
  status: "in_processing" | "in_underwriting" | "conditions_set" | "documents_requested" | "clear_to_close";
  classification: null | { at: string; documents: Array<{ documentId: string; type: string; borrower: string; pageFrom: number; pageTo: number; title: string }> };
  extractedFields: Array<{ field: string; value: unknown; borrower?: string; evidenceRef: string; at: string }>;
  reconciliationConflicts: Array<{ conflictId: string; summary: string; evidenceRefs: string[]; at: string }>;
  incomeProposals: Array<{ proposalId: string; at: string; borrowers: unknown[]; totalMonthlyQualifyingIncome: number; method: string; notes: string; evidenceRefs: string[]; ruleRefs: string[] }>;
  conditions: Map<string, Condition>;
  briefs: Array<{ version: number; at: string; summary: string; findings: unknown[]; withheld: unknown[]; proposedConditionIds: string[]; draftedBy: string }>;
  underwriterReview: null | { at: string; underwriter: string; approvalId: string; confirmedMonthlyQualifyingIncome: number | null; acceptedConditionIds: string[]; rejectedConditionIds: string[]; notes: string };
  borrowerRequests: Array<{ requestId: string; at: string; sentBy: string; approvalId: string; conditionIds: string[]; message: string }>;
  uploads: Upload[];
  disclosureAlerts: Array<{ alertId: string; at: string; severity: string; deadline: string; summary: string; basis: string }>;
  hmdaFixProposals: Array<{ proposalId: string; at: string; fixes: unknown[] }>;
  clearToClose: null | { at: string; underwriter: string; approvalId: string; openPriorToFunding: string[] };
  activity: Array<{ at: string; actor: string; action: string; detail: string }>;
}

let loans = new Map<string, LoanState>();
let seq = 1;

const fresh = (l: LoanSeed): LoanState => ({
  loanId: l.loanId,
  status: "in_processing",
  classification: null,
  extractedFields: [],
  reconciliationConflicts: [],
  incomeProposals: [],
  conditions: new Map(),
  briefs: [],
  underwriterReview: null,
  borrowerRequests: [],
  uploads: [],
  disclosureAlerts: [],
  hmdaFixProposals: [],
  clearToClose: null,
  activity: [{ at: now(), actor: "system", action: "file_received", detail: `Loan package ${l.packageId} received (${l.pages.length} pages)` }],
});

export function resetMortgageState(): void {
  loans = new Map(Object.values(LOANS).map((l) => [l.loanId, fresh(l)]));
  seq = 1;
}
resetMortgageState();

export const nextId = (prefix: string) => `${prefix}-${String(seq++).padStart(4, "0")}`;

export const stateOf = (loanId: unknown): LoanState | undefined =>
  typeof loanId === "string" ? loans.get(loanId.trim().toUpperCase()) : undefined;

export function logActivity(st: LoanState, actor: string, action: string, detail: string): void {
  st.activity.push({ at: now(), actor, action, detail });
}

/**
 * Parse a page citation. Canonical forms are `PKG-04417:p22` for a page of the
 * original package and `DOC-04417-R1-03:p1` for a page of a borrower upload;
 * "PKG-04417 p.22" and "PKG-04417 page 22" are read the same way.
 */
export function parseCitation(raw: unknown): { documentId: string; page: number } | null {
  const m = String(raw ?? "").trim().toUpperCase().match(/^((?:PKG-\d{5})|(?:DOC-\d{5}-R\d+-\d{2}))\s*(?::|,)?\s*(?:P\.?|PAGE)?\s*(\d+)$/);
  return m ? { documentId: m[1], page: Number(m[2]) } : null;
}

/** A citation is valid only if it names a page that exists in THIS loan's file. */
export function resolveCitation(l: LoanSeed, st: LoanState, raw: unknown): Citation | { error: string } {
  const c = parseCitation(raw);
  if (!c) return { error: `"${String(raw)}" is not a page citation. Use ${l.packageId}:p<page> or <uploadDocumentId>:p<page>.` };
  if (c.documentId === l.packageId) {
    if (c.page < 1 || c.page > l.pages.length) return { error: `${l.packageId} has pages 1-${l.pages.length}; page ${c.page} does not exist.` };
    return { ref: `${c.documentId}:p${c.page}`, kind: "package", documentId: c.documentId, page: c.page };
  }
  const up = st.uploads.find((u) => u.documentId === c.documentId);
  if (!up) return { error: `${c.documentId} is not part of loan ${l.loanId}'s file.` };
  if (c.page < 1 || c.page > up.pages.length) return { error: `${c.documentId} has ${up.pages.length} page(s); page ${c.page} does not exist.` };
  return { ref: `${c.documentId}:p${c.page}`, kind: "upload", documentId: c.documentId, page: c.page };
}

/**
 * A rule citation is valid only if the rule exists and applies to the loan:
 * investor rules for its investor, overlays only of the bank that owns it.
 */
export function resolveRule(l: LoanSeed, raw: unknown): { ruleId: string } | { error: string } {
  const r = ruleById(raw);
  if (!r) return { error: `"${String(raw)}" is not a rule in the guidelines library.` };
  if (r.overlay && r.bankId !== l.bankId) {
    return { error: `${r.ruleId} is a ${BANKS[r.bankId!].name} overlay; ${l.loanId} is owned by ${BANKS[l.bankId].name} and is checked only against its own overlays.` };
  }
  if (r.investor && r.investor !== l.investor) return { error: `${r.ruleId} is a ${r.investor} rule; this loan is delivered to ${l.investor}.` };
  return { ruleId: r.ruleId };
}

export const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean)
    : typeof v === "string" ? v.split(",").map((x) => x.trim()).filter(Boolean) : [];

export { getLoan };
