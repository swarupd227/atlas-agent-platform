import { Router } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { eq, inArray } from "drizzle-orm";
import { agentAlerts, agents, improvementRecommendations, policyExceptions, mcpElicitations } from "@shared/schema";
import { getOrgId, getDefaultOrgId } from "../auth";
import { buildMyActions, loadMyActionsRows } from "../my-actions-build";
import { getRequestRole, hasPermission } from "../permissions";

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

router.post("/api/my-actions/decide", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const { source, sourceId, decision } = req.body as {
      source: "approval" | "alert" | "recommendation" | "governance" | "autonomy";
      sourceId: string;
      decision: "approved" | "rejected" | "dismissed" | "acknowledged";
    };

    if (!source || !sourceId || !decision) {
      return res.status(400).json({ error: "source, sourceId, and decision are required" });
    }

    if (source === "approval" || source === "governance" || source === "autonomy") {
      const role = getRequestRole(req);
      if (!hasPermission(role, "approve_changes")) {
        return res.status(403).json({ error: "Insufficient permissions to decide on this item" });
      }
    }

    if (source === "approval") {
      const approval = await storage.getApproval(sourceId);
      if (!approval) return res.status(404).json({ error: "Approval not found" });
      if (orgId && approval.organizationId !== orgId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const status = decision === "approved" ? "approved" : "rejected";
      await storage.updateApproval(sourceId, {
        status,
        decidedBy: "outcome_owner",
        decidedAt: new Date(),
      });
      return res.json({ ok: true });
    }

    if (source === "alert") {
      const rows = await db
        .select()
        .from(agentAlerts)
        .where(eq(agentAlerts.id, sourceId));
      const alert = rows[0];
      if (!alert) return res.status(404).json({ error: "Alert not found" });
      if (orgId && alert.orgId !== orgId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      await db
        .update(agentAlerts)
        .set({ acknowledgedAt: new Date() })
        .where(eq(agentAlerts.id, sourceId));
      return res.json({ ok: true });
    }

    if (source === "recommendation") {
      const rows = await db
        .select()
        .from(improvementRecommendations)
        .where(eq(improvementRecommendations.id, sourceId));
      const rec = rows[0];
      if (!rec) return res.status(404).json({ error: "Recommendation not found" });

      if (orgId) {
        const orgAgents = await db
          .select({ id: agents.id })
          .from(agents)
          .where(eq(agents.organizationId, orgId));
        const orgAgentIds = new Set(orgAgents.map((a) => a.id));
        if (!orgAgentIds.has(rec.agentId ?? "")) {
          return res.status(403).json({ error: "Forbidden" });
        }
      }

      const now = new Date();
      const status = decision === "approved" ? "applied" : "dismissed";
      await db
        .update(improvementRecommendations)
        .set({
          status,
          appliedAt: decision === "approved" ? now : undefined,
          dismissedAt: decision !== "approved" ? now : undefined,
        })
        .where(eq(improvementRecommendations.id, sourceId));
      return res.json({ ok: true });
    }

    if (source === "governance") {
      const rows = await db
        .select()
        .from(policyExceptions)
        .where(eq(policyExceptions.id, sourceId));
      const pe = rows[0];
      if (!pe) return res.status(404).json({ error: "Policy exception not found" });

      if (orgId && pe.agentId) {
        const ownerRows = await db
          .select({ id: agents.id })
          .from(agents)
          .where(eq(agents.organizationId, orgId));
        const ownerIds = new Set(ownerRows.map((a) => a.id));
        if (!ownerIds.has(pe.agentId)) {
          return res.status(403).json({ error: "Forbidden" });
        }
      }

      const status = decision === "approved" ? "approved" : "rejected";
      await db
        .update(policyExceptions)
        .set({ status, approvedBy: decision === "approved" ? "outcome_owner" : undefined })
        .where(eq(policyExceptions.id, sourceId));
      return res.json({ ok: true });
    }

    if (source === "autonomy") {
      const rows = await db
        .select()
        .from(mcpElicitations)
        .where(eq(mcpElicitations.id, sourceId));
      const me = rows[0];
      if (!me) return res.status(404).json({ error: "Elicitation not found" });

      if (orgId && me.agentId) {
        const ownerRows = await db
          .select({ id: agents.id })
          .from(agents)
          .where(eq(agents.organizationId, orgId));
        const ownerIds = new Set(ownerRows.map((a) => a.id));
        if (!ownerIds.has(me.agentId)) {
          return res.status(403).json({ error: "Forbidden" });
        }
      }

      const status = decision === "approved" ? "approved" : "rejected";
      await db
        .update(mcpElicitations)
        .set({ status, decidedBy: "outcome_owner", decidedAt: new Date() })
        .where(eq(mcpElicitations.id, sourceId));
      return res.json({ ok: true });
    }

    return res.status(400).json({ error: "Unknown source type" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[my-actions/decide] Error:", message);
    res.status(500).json({ error: "Failed to record decision" });
  }
});

export default router;
