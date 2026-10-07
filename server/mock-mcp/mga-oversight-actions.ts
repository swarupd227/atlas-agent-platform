/**
 * Simulated action ledger and outbox for the Delegated Authority Review journey: where a review's proposed
 * follow-up is drafted, approved, routed and closed.
 *
 * It behaves like a system that will not let the process cut corners, because these are the controls the review
 * depends on and a prompt cannot hold them:
 *  - a draft is VERSIONED and carries a content hash; a material edit makes a new version and voids any approval of
 *    the old one;
 *  - an approval is recorded against one version and its hash, and only from someone whose role the action needs;
 *    a stale version, a changed hash or an unauthorised approver is refused;
 *  - routing needs an approval of the CURRENT version, only for an allowlisted action type and recipient, and is
 *    idempotent: a repeat with the same key returns the same receipt, a second key for the same version is
 *    refused, and a call that timed out AFTER writing can be reconciled by repeating it;
 *  - closing needs a stated disposition and reason, so a reply alone does not close an obligation;
 *  - every call, including every refusal, is an append-only audit event. (Append-only in this process; not claimed
 *    to be tamper-proof storage.)
 * Nothing leaves the process: routing writes to a simulated outbox. There is no tool here to change an MGA's
 * authority, impose a sanction or send a real message.
 */
import { Router, type Request, type Response } from "express";
import { createHash } from "node:crypto";
import { REVIEWERS, isMga, mgaOf, nowIso } from "./mga-oversight-seed";

const router = Router();

const ALLOWED_ACTION_TYPES = ["request_missing_evidence"];

interface Version { version: number; contentHash: string; savedAt: string; content: Content }
interface Content { actionType: string; owner: string; dueAt: string; recipient: string; evidenceRefs: string[]; subject: string; body: string }
interface Approval { approvalId: string; version: number; contentHash: string; decidedBy: string; decision: "approved" | "rejected"; decidedAt: string }
interface Action {
  actionId: string; mgaId: string; reviewId: string; requiredApproverRole: string; status: string;
  versions: Version[]; approvals: Approval[];
  route: { idempotencyKey: string; version: number; receipt: { receiptId: string; messageId: string; deliveredTo: string; at: string } } | null;
  response: { receivedAt: string; text: string; attachments: string[] } | null;
  closure: { closedBy: string; disposition: string; reason: string; at: string } | null;
}
interface AuditEvent { seq: number; at: string; actor: string; tool: string; transition: string; actionId: string | null; version: number | null; outcome: "ok" | "refused"; detail: string; correlationId: string }

let actions = new Map<string, Action>();
let outbox: Array<{ messageId: string; actionId: string; version: number; to: string; subject: string; body: string; attachments: string[]; sentAt: string }> = [];
let audit: AuditEvent[] = [];
let seq = 1;

export function resetOversightActions(): void { actions = new Map(); outbox = []; audit = []; seq = 1; }

const hashOf = (c: Content) => "sha256:" + createHash("sha256").update(JSON.stringify({ ...c, evidenceRefs: [...c.evidenceRefs].sort() })).digest("hex").slice(0, 32);
const latest = (a: Action) => a.versions[a.versions.length - 1];
const record = (e: Omit<AuditEvent, "seq" | "at">) => { audit.push({ seq: seq++, at: nowIso(), ...e }); };
const refuse = (res: Response, status: number, code: string, error: string, e: Omit<AuditEvent, "seq" | "at" | "outcome" | "detail">) => {
  record({ ...e, outcome: "refused", detail: `${code}: ${error}` });
  return res.status(status).json({ error, code });
};
const view = (a: Action) => ({
  actionId: a.actionId, mgaId: a.mgaId, reviewId: a.reviewId, status: a.status, requiredApproverRole: a.requiredApproverRole,
  currentVersion: latest(a).version, currentHash: latest(a).contentHash, content: latest(a).content,
  approvals: a.approvals, route: a.route, response: a.response, closure: a.closure,
});

/** Save a draft. A new draft opens version 1; the same action with changed content opens a new version and voids approvals of the old one. */
router.post("/action-draft", (req: Request, res: Response) => {
  const b = req.body ?? {};
  const actor = String(b.reviewer ?? "");
  const corr = String(b.review_id ?? "");
  const ev = { actor, tool: "save_action_draft", transition: "draft", actionId: (b.action_id as string) ?? null, version: null as number | null, correlationId: corr };
  const reviewer = REVIEWERS[actor];
  if (!reviewer) return refuse(res, 403, "access_denied", `"${actor || "(none)"}" is not a known reviewer.`, ev);
  if (!b.mga_id || !isMga(String(b.mga_id))) return refuse(res, 422, "validation_failed", "A known MGA is required.", ev);
  if (!reviewer.mgaScope.includes(String(b.mga_id))) return refuse(res, 403, "access_denied", `${actor} has no access to ${b.mga_id}.`, ev);
  if (!ALLOWED_ACTION_TYPES.includes(String(b.action_type))) return refuse(res, 422, "validation_failed", `Action type "${b.action_type}" is not allowed. Allowed: ${ALLOWED_ACTION_TYPES.join(", ")}.`, ev);
  const mga = mgaOf(String(b.mga_id))!;
  if (String(b.recipient) !== mga.contact) return refuse(res, 422, "validation_failed", `Recipient "${b.recipient}" is not the contact on file for ${mga.id}.`, ev);
  const refs = Array.isArray(b.evidence_refs) ? b.evidence_refs.map(String) : [];
  if (!refs.length) return refuse(res, 422, "validation_failed", "An action needs at least one supporting evidence reference.", ev);
  if (!/^20\d\d-\d\d-\d\d$/.test(String(b.due_at ?? ""))) return refuse(res, 422, "validation_failed", "due_at must be a date like 2026-03-31.", ev);
  if (!b.owner || !b.subject || !b.body) return refuse(res, 422, "validation_failed", "owner, subject and body are required.", ev);
  const content: Content = { actionType: String(b.action_type), owner: String(b.owner), dueAt: String(b.due_at), recipient: String(b.recipient), evidenceRefs: refs, subject: String(b.subject), body: String(b.body) };
  const contentHash = hashOf(content);

  let a = b.action_id ? actions.get(String(b.action_id)) : undefined;
  if (b.action_id && !a) return refuse(res, 404, "validation_failed", `No action matches "${b.action_id}".`, ev);
  let voided = 0;
  if (!a) {
    const actionId = `ACT-${String(actions.size + 1).padStart(4, "0")}`;
    a = { actionId, mgaId: String(b.mga_id), reviewId: corr, requiredApproverRole: String(b.required_approver_role ?? "oversight_approver"), status: "pending_approval", versions: [], approvals: [], route: null, response: null, closure: null };
    actions.set(actionId, a);
  } else if (a.versions.length && latest(a).contentHash === contentHash) {
    record({ ...ev, actionId: a.actionId, version: latest(a).version, outcome: "ok", detail: "Same content; no new version." });
    return res.json({ saved: false, unchanged: true, ...view(a) });
  } else if (a.route) {
    return refuse(res, 409, "conflict", `${a.actionId} was already routed; a routed action cannot be edited.`, { ...ev, actionId: a.actionId });
  } else {
    const previous = latest(a);
    voided = a.approvals.filter((p) => p.version === previous.version && p.decision === "approved").length;
  }
  const version = a.versions.length + 1;
  a.versions.push({ version, contentHash, savedAt: nowIso(), content });
  a.status = "pending_approval";
  record({ ...ev, actionId: a.actionId, version, outcome: "ok", detail: `Version ${version} saved, pending approval${voided ? `; ${voided} approval(s) of the earlier version no longer apply` : ""}.` });
  res.json({ saved: true, supersededApprovals: voided, ...view(a) });
});

/** Record a decision on one version. The version and hash must be the current ones, and the decider must hold the role the action needs. */
router.post("/approval", (req: Request, res: Response) => {
  const b = req.body ?? {};
  const a = actions.get(String(b.action_id ?? ""));
  const ev = { actor: String(b.decided_by ?? ""), tool: "record_approval", transition: "approval", actionId: a?.actionId ?? (String(b.action_id ?? "") || null), version: Number(b.version) || null, correlationId: a?.reviewId ?? "" };
  if (!a) return refuse(res, 404, "approval_invalid", `No action matches "${b.action_id}".`, ev);
  if (!b.approval_id || !b.decided_by) return refuse(res, 422, "validation_failed", "approval_id and decided_by are required.", ev);
  if (!["approved", "rejected"].includes(String(b.decision))) return refuse(res, 422, "validation_failed", "decision must be approved or rejected.", ev);
  const dup = a.approvals.find((p) => p.approvalId === String(b.approval_id));
  if (dup) { record({ ...ev, outcome: "ok", detail: "Repeat of an approval already recorded." }); return res.json({ recorded: false, duplicate: true, ...view(a) }); }
  const cur = latest(a);
  if (Number(b.version) !== cur.version || String(b.content_hash) !== cur.contentHash) {
    return refuse(res, 409, "approval_invalid", `That approval is for version ${b.version}; the current version is ${cur.version} (${cur.contentHash}). A changed action needs a new approval.`, ev);
  }
  const decider = REVIEWERS[String(b.decided_by)];
  if (!decider || !decider.approverRoles.includes(a.requiredApproverRole)) {
    return refuse(res, 403, "approval_invalid", `${b.decided_by} does not hold the ${a.requiredApproverRole} role this action needs.`, ev);
  }
  a.approvals.push({ approvalId: String(b.approval_id), version: cur.version, contentHash: cur.contentHash, decidedBy: String(b.decided_by), decision: b.decision, decidedAt: nowIso() });
  a.status = b.decision === "approved" ? "approved" : "rejected";
  record({ ...ev, outcome: "ok", detail: `Version ${cur.version} ${b.decision} by ${b.decided_by}.` });
  res.json({ recorded: true, ...view(a) });
});

/** Route an approved action to the simulated outbox. Idempotent, allowlisted, and reconcilable after a timeout. */
router.post("/route", (req: Request, res: Response) => {
  const b = req.body ?? {};
  const a = actions.get(String(b.action_id ?? ""));
  const ev = { actor: String(b.routed_by ?? "workflow"), tool: "route_approved_action", transition: "routing", actionId: a?.actionId ?? (String(b.action_id ?? "") || null), version: Number(b.version) || null, correlationId: a?.reviewId ?? "" };
  if (!a) return refuse(res, 404, "validation_failed", `No action matches "${b.action_id}".`, ev);
  if (!b.idempotency_key) return refuse(res, 422, "validation_failed", "An idempotency_key is required.", ev);
  const cur = latest(a);
  if (a.route) {
    if (a.route.idempotencyKey === String(b.idempotency_key) && a.route.version === Number(b.version)) {
      record({ ...ev, outcome: "ok", detail: "Repeat with the same key; returned the existing receipt." });
      return res.json({ routed: true, duplicate: true, receipt: a.route.receipt, ...view(a) });
    }
    return refuse(res, 409, "conflict", `${a.actionId} version ${a.route.version} was already routed (receipt ${a.route.receipt.receiptId}); a second delivery is not allowed.`, ev);
  }
  const ok = a.approvals.find((p) => p.decision === "approved" && p.version === Number(b.version) && p.contentHash === cur.contentHash && p.version === cur.version);
  if (!ok) return refuse(res, 409, "approval_invalid", `Version ${b.version} of ${a.actionId} has no valid approval; the current version is ${cur.version}.`, ev);
  if (!ALLOWED_ACTION_TYPES.includes(cur.content.actionType)) return refuse(res, 422, "validation_failed", `Action type "${cur.content.actionType}" is not allowed.`, ev);
  const mga = mgaOf(a.mgaId)!;
  if (cur.content.recipient !== mga.contact) return refuse(res, 422, "validation_failed", "The recipient is not the contact on file.", ev);

  const messageId = `MSG-${String(outbox.length + 1).padStart(4, "0")}`;
  const at = nowIso();
  outbox.push({ messageId, actionId: a.actionId, version: cur.version, to: cur.content.recipient, subject: cur.content.subject, body: cur.content.body, attachments: cur.content.evidenceRefs, sentAt: at });
  const receipt = { receiptId: `RCPT-${messageId}`, messageId, deliveredTo: cur.content.recipient, at };
  a.route = { idempotencyKey: String(b.idempotency_key), version: cur.version, receipt };
  a.status = "awaiting_response";
  record({ ...ev, outcome: "ok", detail: `Delivered to the simulated outbox as ${messageId}.` });
  // The write happened; only the answer is lost. The caller repeats the call with the same key and gets the receipt.
  if (b.simulate_timeout) return res.status(504).json({ error: "The routing call timed out after the write.", code: "timeout" });
  res.json({ routed: true, duplicate: false, receipt, ...view(a) });
});

router.get("/action", (req: Request, res: Response) => {
  const a = actions.get(String(req.query.action_id ?? ""));
  if (!a) return res.status(404).json({ error: `No action matches "${req.query.action_id ?? ""}".`, code: "validation_failed" });
  res.json(view(a));
});

/** Test fixture: the MGA's reply arrives. It does not close anything. */
router.post("/simulate-response", (req: Request, res: Response) => {
  const a = actions.get(String(req.body?.action_id ?? ""));
  if (!a || !a.route) return res.status(409).json({ error: "There is no routed action to respond to.", code: "conflict" });
  a.response = { receivedAt: nowIso(), text: String(req.body?.text ?? ""), attachments: Array.isArray(req.body?.attachments) ? req.body.attachments.map(String) : [] };
  record({ actor: a.mgaId, tool: "response_fixture", transition: "response_received", actionId: a.actionId, version: a.route.version, outcome: "ok", detail: "A reply arrived.", correlationId: a.reviewId });
  res.json({ received: true, ...view(a) });
});

router.get("/pending-responses", (req: Request, res: Response) => {
  const reviewer = REVIEWERS[String(req.query.reviewer ?? "")];
  if (!reviewer) return res.status(403).json({ error: "A known reviewer is required.", code: "access_denied" });
  const rows = Array.from(actions.values()).filter((a) => a.status === "awaiting_response" && a.response && reviewer.mgaScope.includes(a.mgaId))
    .map((a) => ({ actionId: a.actionId, mgaId: a.mgaId, request: latest(a).content.subject, dueAt: latest(a).content.dueAt, response: a.response }));
  res.json({ count: rows.length, rows });
});

/** Close an action. A reply is not evidence by itself: a disposition and a reason are required either way. */
router.post("/close", (req: Request, res: Response) => {
  const b = req.body ?? {};
  const a = actions.get(String(b.action_id ?? ""));
  const ev = { actor: String(b.closed_by ?? ""), tool: "close_action", transition: "close", actionId: a?.actionId ?? (String(b.action_id ?? "") || null), version: a?.route?.version ?? null, correlationId: a?.reviewId ?? "" };
  if (!a) return refuse(res, 404, "validation_failed", `No action matches "${b.action_id}".`, ev);
  const closer = REVIEWERS[String(b.closed_by ?? "")];
  if (!closer || !closer.mgaScope.includes(a.mgaId)) return refuse(res, 403, "access_denied", `${b.closed_by || "(none)"} may not close an action for ${a.mgaId}.`, ev);
  if (a.status !== "awaiting_response") return refuse(res, 409, "conflict", `${a.actionId} is ${a.status}; only an action awaiting a response can be closed.`, ev);
  if (!["evidence_validated", "justified_disposition"].includes(String(b.disposition)) || !String(b.reason ?? "").trim()) {
    return refuse(res, 422, "validation_failed", "Closing needs a disposition (evidence_validated or justified_disposition) and a reason.", ev);
  }
  if (b.disposition === "evidence_validated" && !a.response) return refuse(res, 409, "conflict", "There is no response to validate; record a justified disposition instead.", ev);
  a.closure = { closedBy: String(b.closed_by), disposition: String(b.disposition), reason: String(b.reason), at: nowIso() };
  a.status = "closed";
  record({ ...ev, outcome: "ok", detail: `Closed: ${b.disposition}.` });
  res.json({ closed: true, ...view(a) });
});

router.get("/outbox", (_req: Request, res: Response) => { res.json({ count: outbox.length, messages: outbox }); });
router.get("/audit", (_req: Request, res: Response) => { res.json({ count: audit.length, events: audit }); });
router.post("/reset", (_req: Request, res: Response) => { resetOversightActions(); res.json({ reset: true, resetAt: nowIso() }); });

export default router;
