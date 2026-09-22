import { Router } from "express";
import { getOrgId, getDefaultOrgId } from "../auth";
import { buildMyActions, loadMyActionsRows } from "../my-actions-build";
import { getRequestActorLabel, getRequestRole, hasPermission } from "../permissions";
import { ApprovalDecisionError, decideApproval } from "../approval-decision";
import { ActionDecisionError, acknowledgeAlert, decidePolicyException, decideRecommendation, respondToToolRequest } from "../action-decisions";

const router = Router();

router.get("/api/my-actions", async (req, res) => {
  try {
    // Always one organization: the caller's, or the default one when no organization is resolved.
    const orgId = getOrgId(req) ?? getDefaultOrgId();
    if (!orgId) return res.json(buildMyActions({ approvals: [], alerts: [], recommendations: [], policyExceptions: [], elicitations: [] }));
    res.json(buildMyActions(await loadMyActionsRows(orgId)));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[my-actions] Error:", message);
    res.status(500).json({ error: "Failed to fetch actions" });
  }
});

/**
 * Every kind of item is decided by the same code as its own page and the
 * Astra Cowork tools: checked against the organization, decided once, and
 * audited under the person who decided it.
 */
router.post("/api/my-actions/decide", async (req, res) => {
  try {
    const { source, sourceId, decision, note } = req.body as {
      source: "approval" | "alert" | "recommendation" | "governance" | "autonomy";
      sourceId: string;
      decision: "approved" | "rejected" | "dismissed" | "acknowledged";
      note?: string;
    };
    if (!source || !sourceId || !decision) {
      return res.status(400).json({ error: "source, sourceId, and decision are required" });
    }

    const orgId = getOrgId(req) ?? getDefaultOrgId();
    if (!orgId) return res.status(403).json({ error: "No organization context." });
    const role = getRequestRole(req);
    const actorLabel = getRequestActorLabel(req);
    const actor = { orgId, actorId: req.authUser?.userId ?? actorLabel, actorLabel, via: "My Actions" };
    const approve = decision === "approved";
    const text = typeof note === "string" && note.trim() ? note.trim().slice(0, 1000) : undefined;

    // Exceptions and tool requests need the same permission as approvals.
    if ((source === "governance" || source === "autonomy") && !hasPermission(role, "approve_changes")) {
      return res.status(403).json({ error: "Your role can't decide this." });
    }

    try {
      switch (source) {
        case "approval":
          await decideApproval({
            orgId,
            role,
            userId: req.authUser?.userId ?? null,
            decidedBy: actorLabel,
            approvalId: sourceId,
            decision: approve ? "approved" : "rejected",
            note: text,
            via: "My Actions",
          });
          return res.json({ ok: true });
        case "alert":
          return res.json({ ok: true, ...(await acknowledgeAlert({ ...actor, alertId: sourceId, note: text })) });
        case "recommendation":
          return res.json({ ok: true, ...(await decideRecommendation({ ...actor, recommendationId: sourceId, decision: approve ? "accept" : "dismiss", note: text })) });
        case "governance":
          return res.json({ ok: true, ...(await decidePolicyException({ ...actor, exceptionId: sourceId, decision: approve ? "approve" : "reject", note: text })) });
        case "autonomy":
          return res.json({ ok: true, ...(await respondToToolRequest({ ...actor, elicitationId: sourceId, decision: approve ? "approve" : "decline", note: text })) });
        default:
          return res.status(400).json({ error: "Unknown source type" });
      }
    } catch (err) {
      if (err instanceof ApprovalDecisionError || err instanceof ActionDecisionError) {
        const status = err.code === "not_found" ? 404 : err.code === "not_allowed" ? 403 : 409;
        return res.status(status).json({ error: err.message });
      }
      throw err;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[my-actions/decide] Error:", message);
    res.status(500).json({ error: "Failed to record decision" });
  }
});

export default router;
