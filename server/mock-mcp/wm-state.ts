import { AS_OF, now } from "./wm-seed";
import { ONBOARDING_CASES } from "./wm-onboarding-seed";

/**
 * The mutable side of the Harborview Wealth Partners fixture world, shared by
 * the six WM systems so a decision recorded in one is what the others check:
 * the custodian opens an account only when the onboarding system shows the
 * case screened and confirmed, and the trading system releases orders only
 * with the approvals recorded here. One reset clears all six.
 */

export interface Order { orderId: string; proposalId: string | null; accountId: string; symbol: string; side: "buy" | "sell"; quantity: number; lotId: string | null; status: "staged" | "approved_by_client" | "submitted" | "filled"; stagedAt: string; fillPrice?: number; realizedGainLoss?: number; checks: unknown[] }
export interface CaseState {
  caseId: string;
  stage: string;
  documentsAdded: string[];
  cip: Record<string, { result: "verified" | "failed"; at: string }>;
  screenings: Record<string, { disposition: "false_positive" | "escalated" | "clear"; identifiersCompared: unknown[]; by: string; at: string }>;
  amlDisposition: null | { outcome: "approved_with_edd" | "declined"; by: string; approvalId: string; at: string; note: string };
  suitability: { proposed: null | Record<string, unknown>; confirmed: null | { by: string; approvalId: string; at: string; modelId: string } };
  accountsOpened: string[];
  transfers: Array<{ transferId: string; accountId: string; method: string; contraFirm: string; titleSubmitted: string; status: "rejected" | "completed" | "pending"; rejectReason: string | null; history: Array<{ at: string; status: string; note: string }> }>;
  records: Array<{ recordId: string; kind: string; at: string; summary: string }>;
}

export interface WmState {
  orders: Map<string, Order>;
  clientApprovals: Array<{ accountId: string; orderIds: string[]; by: string; approvalId: string; at: string }>;
  activities: Array<{ activityId: string; householdId: string; type: string; subject: string; body: string; by: string; at: string }>;
  tasks: Array<{ taskId: string; householdId: string; subject: string; dueDate: string | null; owner: string; at: string }>;
  communications: Array<{ communicationId: string; householdId: string; subject: string; body: string; sentBy: string; approvalId: string; marketingReviewId: string; at: string }>;
  marketingReviews: Map<string, { reviewId: string; householdId: string; findings: Array<{ rule: string; text: string }>; verdict: "pass" | "flagged"; at: string }>;
  cases: Map<string, CaseState>;
  activity: Array<{ at: string; actor: string; action: string; detail: string }>;
}

let state: WmState;
let seq = 1;

export function resetWmState(): void {
  state = {
    orders: new Map(), clientApprovals: [], activities: [], tasks: [], communications: [], marketingReviews: new Map(),
    cases: new Map(ONBOARDING_CASES.map((c) => [c.caseId, { caseId: c.caseId, stage: "documentation", documentsAdded: [], cip: {}, screenings: {}, amlDisposition: null, suitability: { proposed: null, confirmed: null }, accountsOpened: [], transfers: [], records: [] } as CaseState])),
    activity: [{ at: now(), actor: "system", action: "book_loaded", detail: `Harborview Wealth Partners fixture as of ${AS_OF}` }],
  };
  seq = 1;
}
resetWmState();

export const wm = () => state;
export const caseOf = (id: unknown) => state.cases.get(String(id ?? "").trim().toUpperCase());
export const nextWmId = (prefix: string) => `${prefix}-${String(seq++).padStart(4, "0")}`;
export const logWm = (actor: string, action: string, detail: string) => { state.activity.push({ at: now(), actor, action, detail }); };
export const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean)
    : typeof v === "string" ? v.split(",").map((x) => x.trim()).filter(Boolean) : [];

/** A decision must come from a person in an allowed role, under a named approval. */
export function humanActor(b: Record<string, any>, roles: string[]): { ok: true; actorId: string; actorRole: string; approvalId: string } | { ok: false; status: number; error: string } {
  const actorId = String(b.actorId || b.decidedBy || "").trim();
  const actorRole = String(b.actorRole || "").trim();
  const approvalId = String(b.approvalId || "").trim();
  if (!actorId || !actorRole || !approvalId) return { ok: false, status: 422, error: "A decision needs actorId, actorRole and approvalId -- the identity and approval recorded by the approval step." };
  if (/agent|bot|assistant|copilot|orchestrator|automation/i.test(actorRole) || !roles.includes(actorRole)) return { ok: false, status: 403, error: `Role "${actorRole}" cannot make this decision; allowed: ${roles.join(", ")}. Agents propose; people decide.` };
  return { ok: true, actorId, actorRole, approvalId };
}
