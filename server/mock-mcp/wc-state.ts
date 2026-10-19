import { createHash } from "crypto";
import {
  SUBMISSIONS, initialSubjectivities, now, type PayrollAllocation, type SubmissionSeed,
} from "./wc-seed";

/**
 * The mutable side of the Workers' Compensation fixture world, shared by the
 * five WC systems so that a decision recorded in one is what the others check.
 *
 * Every submission carries a revision. A material change -- a class allocation
 * accepted -- increments it, and anything recorded against an older revision
 * (a rating, a memo approval, a sign-off) stops counting. That is the whole
 * stale-write discipline of the design: an old answer cannot quietly stand in
 * for a new question.
 *
 * One reset clears all five systems, because they describe one world.
 */

export interface Finding {
  findingId: string;
  producerNodeId: string;
  category: string;
  status: "proposed" | "needs_information" | "accepted" | "overridden" | "dismissed" | "resolved";
  severity: "low" | "medium" | "high" | "critical";
  summary: string;
  evidenceRefs: string[];
  ruleRefs: string[];
  proposedAction: Record<string, unknown> | null;
  uncertainty: string;
  blockingStage: string | null;
  ownerRole: string;
  inputRevision: number;
  acknowledged: boolean;
  supportedByEvidence: boolean;
  submittedAt: string;
  events: Array<{ type: string; actorId: string; at: string; rationale?: string; approvalId?: string }>;
}

export interface Subjectivity {
  id: string;
  requirement: string;
  ownerRole: string;
  dueStage: "pre_quote" | "pre_bind" | string;
  status: "open" | "resolved" | "waived";
  evidenceRefs: string[];
  resolutionActor: string | null;
  resolvedAt: string | null;
  approvalId: string | null;
  approvedWaiverRef: string | null;
}

export interface SubmissionState {
  submissionId: string;
  revision: number;
  status: string;
  allocations: PayrollAllocation[];
  findings: Map<string, Finding>;
  subjectivities: Subjectivity[];
  /** Mandatory class rules an override left unresolved; each forces a referral. */
  unresolvedClassRules: Array<{ ruleId: string; findingId: string; reason: string }>;
  modVerification: null | { verificationId: string; worksheetId: string; modValue: number; effectiveDate: string; verifiedBy: string; approvalId: string; revision: number; at: string };
  authority: null | { decisionId: string; outcome: string; ruleRefs: string[]; revision: number; inputs: Record<string, unknown>; at: string };
  referral: null | { referralId: string; outcome: "approved" | "rejected" | "information_requested"; approver: string; approvalId: string; scope: string; revision: number; at: string };
  memos: Array<{ version: number; basisRevision: number; ratingId: string | null; sections: Record<string, unknown>; draftedBy: string; status: "draft" | "approved"; approvedBy: string | null; approvalId: string | null; at: string }>;
  signoff: null | { signoffId: string; revision: number; signedBy: string; approvalId: string; ratingId: string; memoVersion: number; at: string };
  informationRequests: Array<{ requestId: string; subject: string; detail: string; addressedTo: string; status: "open" | "answered"; at: string; answeredWith?: string[] }>;
  brokerDocuments: Array<{ documentId: string; type: string; title: string; content: Record<string, unknown>; receivedAt: string }>;
  history: Array<{ revision: number; change: string; actorId: string; at: string }>;
}

export interface Rating {
  ratingId: string;
  submissionId: string;
  revision: number;
  requestHash: string;
  quotable: boolean;
  result: Record<string, unknown>;
  ratedAt: string;
}

export interface Operation {
  operationId: string;
  kind: "upsert_quote" | "attach_document" | "request_bind";
  idempotencyKey: string;
  requestHash: string;
  status: "completed" | "pending_confirmation" | "rejected";
  externalRef: string | null;
  response: Record<string, unknown>;
  createdAt: string;
  confirmedAt: string | null;
}

export interface Quote {
  externalQuoteRef: string;
  submissionId: string;
  revision: number;
  ratingId: string;
  premium: number;
  status: "quoted" | "bound";
  attachments: Array<{ attachmentRef: string; documentRef: string; contentHash: string; at: string }>;
  policyNumber: string | null;
  binderRef: string | null;
  boundAt: string | null;
  boundBy: string | null;
}

export interface BordereauReport {
  reportId: string;
  status: "queued" | "sent" | "acknowledged" | "rejected";
  records: Array<Record<string, unknown>>;
  totals: { grossPremium: number; commission: number; netPremium: number };
  receiptId: string | null;
  history: Array<{ status: string; at: string; note?: string }>;
}

let submissions = new Map<string, SubmissionState>();
let ratings = new Map<string, Rating>();
let operations = new Map<string, Operation>();
let quotes = new Map<string, Quote>();
let reports = new Map<string, BordereauReport>();
let seq = 1;

const fresh = (s: SubmissionSeed): SubmissionState => ({
  submissionId: s.submissionId,
  revision: 1,
  status: "received",
  allocations: s.allocations.map((a) => ({ ...a })),
  findings: new Map(),
  subjectivities: initialSubjectivities(s).map((x) => ({
    ...x, status: "open" as const, evidenceRefs: [], resolutionActor: null, resolvedAt: null, approvalId: null, approvedWaiverRef: null,
  })),
  unresolvedClassRules: [],
  modVerification: null,
  authority: null,
  referral: null,
  memos: [],
  signoff: null,
  informationRequests: [],
  brokerDocuments: [],
  history: [{ revision: 1, change: "submission received", actorId: "system", at: now() }],
});

export function resetWcState(): void {
  submissions = new Map(Object.values(SUBMISSIONS).map((s) => [s.submissionId, fresh(s)]));
  ratings = new Map();
  operations = new Map();
  quotes = new Map();
  reports = new Map();
  seq = 1;
}
resetWcState();

export const nextId = (prefix: string) => `${prefix}-${String(seq++).padStart(4, "0")}`;

export const stateOf = (submissionId: unknown): SubmissionState | undefined =>
  typeof submissionId === "string" ? submissions.get(submissionId.trim()) : undefined;

/** Deterministic hash of a request body, key order independent. */
export function hashOf(value: unknown): string {
  const canon = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(canon);
    if (v && typeof v === "object") return Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, canon((v as any)[k])]));
    return v;
  };
  return createHash("sha256").update(JSON.stringify(canon(value))).digest("hex").slice(0, 16);
}

export function bumpRevision(st: SubmissionState, change: string, actorId: string): number {
  st.revision += 1;
  st.history.push({ revision: st.revision, change, actorId, at: now() });
  return st.revision;
}

export const ratingStore = {
  get: (id: unknown) => (typeof id === "string" ? ratings.get(id.trim()) : undefined),
  put: (r: Rating) => { ratings.set(r.ratingId, r); },
  forSubmission: (submissionId: string) => [...ratings.values()].filter((r) => r.submissionId === submissionId),
};

export const operationStore = {
  byKey: (kind: Operation["kind"], key: string) => [...operations.values()].find((o) => o.kind === kind && o.idempotencyKey === key),
  get: (id: unknown) => (typeof id === "string" ? operations.get(id.trim()) : undefined),
  byExternalRef: (ref: string) => [...operations.values()].filter((o) => o.externalRef === ref),
  put: (o: Operation) => { operations.set(o.operationId, o); },
  all: () => [...operations.values()],
};

export const quoteStore = {
  get: (ref: unknown) => (typeof ref === "string" ? quotes.get(ref.trim()) : undefined),
  byPolicy: (policyNumber: unknown) => [...quotes.values()].find((q) => q.policyNumber === String(policyNumber ?? "").trim()),
  forSubmission: (submissionId: string) => [...quotes.values()].filter((q) => q.submissionId === submissionId),
  put: (q: Quote) => { quotes.set(q.externalQuoteRef, q); },
};

export const reportStore = {
  get: (id: unknown) => (typeof id === "string" ? reports.get(id.trim()) : undefined),
  put: (r: BordereauReport) => { reports.set(r.reportId, r); },
  all: () => [...reports.values()],
};

/** Whether everything a quote write-back needs is in place for the CURRENT revision, with every gap named. */
export function quotePreconditions(st: SubmissionState, ratingId: string | undefined) {
  const gaps: string[] = [];
  const rating = ratingStore.get(ratingId);
  if (!rating) gaps.push(`No rating ${ratingId ? `"${ratingId}"` : "named"}.`);
  else {
    if (rating.submissionId !== st.submissionId) gaps.push(`Rating ${rating.ratingId} belongs to ${rating.submissionId}.`);
    if (rating.revision !== st.revision) gaps.push(`Rating ${rating.ratingId} was made against revision ${rating.revision}; the submission is now at revision ${st.revision}. Re-rate.`);
    if (!rating.quotable) gaps.push(`Rating ${rating.ratingId} is a non-quotable estimate.`);
  }
  for (const s of st.subjectivities.filter((x) => x.dueStage === "pre_quote" && x.status === "open")) gaps.push(`Pre-quote subjectivity ${s.id} is open: ${s.requirement}`);
  const memo = st.memos.filter((m) => m.status === "approved").at(-1);
  if (!memo) gaps.push("No approved underwriting memo.");
  else if (memo.basisRevision !== st.revision) gaps.push(`The approved memo (version ${memo.version}) was based on revision ${memo.basisRevision}; the submission is at revision ${st.revision}. The memo is stale.`);
  if (!st.authority || st.authority.revision !== st.revision) gaps.push("The authority gateway has not been evaluated for the current revision.");
  else {
    if (st.authority.outcome === "blocked") gaps.push(`The authority gateway blocked this submission (${st.authority.ruleRefs.join(", ")}).`);
    if (st.authority.outcome === "information_required") gaps.push("The authority gateway requires more information.");
    if (st.authority.outcome === "referral_required" && !(st.referral && st.referral.outcome === "approved" && st.referral.revision === st.revision)) {
      gaps.push(`A carrier referral is required (${st.authority.ruleRefs.join(", ")}) and has not been approved for the current revision.`);
    }
  }
  // An override cannot set aside a mandatory rule; only an approved referral can carry it.
  if (st.unresolvedClassRules.length && !(st.referral && st.referral.outcome === "approved" && st.referral.revision === st.revision)) {
    gaps.push(`Mandatory class rule${st.unresolvedClassRules.length > 1 ? "s" : ""} ${st.unresolvedClassRules.map((r) => r.ruleId).join(", ")} unresolved after an override; a carrier referral must approve the exception.`);
  }
  if (!st.signoff || st.signoff.revision !== st.revision) gaps.push("No underwriter sign-off for the current revision.");
  return { ok: gaps.length === 0, gaps, rating };
}
