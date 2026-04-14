import { Router } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { eq, inArray } from "drizzle-orm";
import { agentAlerts, agents, improvementRecommendations } from "@shared/schema";
import { getOrgId } from "../auth";

const router = Router();

function translateApprovalType(type: string, objectName: string | null): { title: string; context: string } {
  const name = objectName || "this item";
  const t = type.toLowerCase();
  if (t === "blueprint_review" || t.includes("blueprint")) {
    return {
      title: `Approve improvement plan for "${name}"`,
      context: "Your Digital Worker proposed a change to how it works. Review and approve to activate it.",
    };
  }
  if (t === "deployment" || t.includes("deploy")) {
    return {
      title: `Approve go-live for "${name}"`,
      context: "A change is ready to go live. Review it before it reaches your customers.",
    };
  }
  if (t === "policy_exception" || t.includes("policy")) {
    return {
      title: `Confirm safety rule update for "${name}"`,
      context: "A guardrail has changed — confirm it still matches your expectations.",
    };
  }
  if (t === "auto_patch" || t === "patch_approval" || t.includes("patch")) {
    return {
      title: `Review proposed fix for "${name}"`,
      context: "Your Digital Worker spotted an issue and prepared a fix. Approve it to apply automatically.",
    };
  }
  if (t === "tool-invocation" || t === "tool_permission") {
    return {
      title: `Approve tool access for "${name}"`,
      context: "A Digital Worker is requesting permission to use a tool. Review and approve if this looks right.",
    };
  }
  if (t === "model_upgrade") {
    return {
      title: `Approve model upgrade for "${name}"`,
      context: "A Digital Worker is requesting to use an upgraded model. Approving may improve results.",
    };
  }
  if (t === "outcome_review") {
    return {
      title: `Review goal contract: "${name}"`,
      context: "A goal contract needs your confirmation before it takes effect.",
    };
  }
  if (t === "agent_change") {
    return {
      title: `Approve change to Digital Worker: "${name}"`,
      context: "A change to one of your Digital Workers needs your sign-off.",
    };
  }
  if (t === "export_review") {
    return {
      title: `Review data export: "${name}"`,
      context: "A data export was requested and needs your approval.",
    };
  }
  return {
    title: `Decision needed: "${name}"`,
    context: "Something needs your approval before it can continue.",
  };
}

function translateAlertType(alertType: string, agentName: string, message: string): { title: string; context: string } {
  const t = alertType.toLowerCase();
  if (t.includes("success_rate")) {
    return {
      title: `"${agentName}" is completing fewer tasks than usual`,
      context: message || "Success rate has dropped below the expected level. Your Digital Worker may need attention.",
    };
  }
  if (t.includes("latency") || t.includes("slow")) {
    return {
      title: `"${agentName}" is responding more slowly than expected`,
      context: message || "Response time has increased. This may impact customer experience.",
    };
  }
  if (t.includes("cost") || t.includes("token")) {
    return {
      title: `"${agentName}" is spending more than budgeted`,
      context: message || "Costs have spiked above baseline. Review to make sure this is expected.",
    };
  }
  if (t.includes("error") || t.includes("failure")) {
    return {
      title: `"${agentName}" ran into repeated errors`,
      context: message || "Your Digital Worker is experiencing failures that may affect your goals.",
    };
  }
  if (t.includes("drift")) {
    return {
      title: `"${agentName}" is behaving differently than before`,
      context: message || "Something changed in how this Digital Worker responds. Worth a quick review.",
    };
  }
  return {
    title: `"${agentName}" flagged something for you`,
    context: message || "Your Digital Worker flagged an unusual condition.",
  };
}

function translateRecommendationType(title: string, source: string, description: string): { title: string; context: string } {
  const s = source.toLowerCase();
  if (s === "cost") {
    return {
      title: `Save money: ${title}`,
      context: description || "Your Digital Workers found a way to cut costs without affecting results.",
    };
  }
  if (s === "drift") {
    return {
      title: `Fix a performance gap: ${title}`,
      context: description || "Results have drifted from the goal. Applying this fix can get things back on track.",
    };
  }
  if (s === "eval") {
    return {
      title: `Improve accuracy: ${title}`,
      context: description || "Testing found a way to make your Digital Worker more reliable.",
    };
  }
  if (s === "policy") {
    return {
      title: `Update a guardrail: ${title}`,
      context: description || "A safety rule can be tuned to better fit your current needs.",
    };
  }
  return {
    title: `Suggested improvement: ${title}`,
    context: description || "Your Digital Workers proposed an improvement you can apply.",
  };
}

function severityToUrgency(severity: string): "urgent" | "today" | "this_week" {
  if (severity === "critical") return "urgent";
  if (severity === "high") return "today";
  return "this_week";
}

function isToday(date: Date | string | null | undefined): boolean {
  if (!date) return false;
  const d = new Date(date);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

interface ActionItem {
  id: string;
  source: "approval" | "alert" | "recommendation";
  sourceId: string;
  title: string;
  context: string;
  urgency: "urgent" | "today" | "this_week";
  agentAttribution: string | null;
  agentId: string | null;
  outcomeId: string | null;
  createdAt: string | null;
}

interface CompletedItem extends ActionItem {
  decidedAt: string | null;
  decision: "approved" | "dismissed";
}

const URGENCY_ORDER: Record<string, number> = { urgent: 0, today: 1, this_week: 2 };

router.get("/api/my-actions", async (req, res) => {
  try {
    const orgId = getOrgId(req);

    const [approvals, allAlerts] = await Promise.all([
      storage.getApprovals(orgId),
      db
        .select()
        .from(agentAlerts)
        .where(orgId ? eq(agentAlerts.orgId, orgId) : undefined)
        .orderBy(agentAlerts.triggeredAt),
    ]);

    let orgRecommendations: typeof improvementRecommendations.$inferSelect[] = [];
    if (orgId) {
      const orgAgents = await db
        .select({ id: agents.id })
        .from(agents)
        .where(eq(agents.organizationId, orgId));
      const orgAgentIds = orgAgents.map((a) => a.id);
      if (orgAgentIds.length > 0) {
        orgRecommendations = await db
          .select()
          .from(improvementRecommendations)
          .where(inArray(improvementRecommendations.agentId, orgAgentIds));
      }
    } else {
      orgRecommendations = await db.select().from(improvementRecommendations);
    }

    const needsDecision: ActionItem[] = [];
    const fyi: ActionItem[] = [];
    const completedToday: CompletedItem[] = [];

    for (const approval of approvals) {
      const { title, context } = translateApprovalType(approval.type, approval.objectName);
      const item: ActionItem = {
        id: `approval-${approval.id}`,
        source: "approval",
        sourceId: approval.id,
        title,
        context,
        urgency: approval.riskScore != null && approval.riskScore >= 0.8 ? "urgent" : "today",
        agentAttribution: approval.objectName || null,
        agentId: approval.agentId || null,
        outcomeId: approval.outcomeId || null,
        createdAt: approval.createdAt ? approval.createdAt.toISOString() : null,
      };

      if (approval.status === "pending") {
        needsDecision.push(item);
      } else if (
        (approval.status === "approved" || approval.status === "rejected") &&
        isToday(approval.decidedAt)
      ) {
        completedToday.push({
          ...item,
          decidedAt: approval.decidedAt ? approval.decidedAt.toISOString() : null,
          decision: approval.status === "approved" ? "approved" : "dismissed",
        });
      }
    }

    const unacknowledgedAlerts = allAlerts.filter((a) => !a.acknowledgedAt);
    for (const alert of unacknowledgedAlerts) {
      const { title, context } = translateAlertType(alert.alertType, alert.agentName, alert.message);
      const urgency = severityToUrgency(alert.severity);
      const item: ActionItem = {
        id: `alert-${alert.id}`,
        source: "alert",
        sourceId: alert.id,
        title,
        context,
        urgency,
        agentAttribution: alert.agentName,
        agentId: alert.agentId,
        outcomeId: null,
        createdAt: alert.triggeredAt ? alert.triggeredAt.toISOString() : null,
      };
      if (urgency === "urgent") {
        needsDecision.push(item);
      } else {
        fyi.push(item);
      }
    }

    const pendingRecs = orgRecommendations.filter((r) => r.status === "pending");
    for (const rec of pendingRecs) {
      const { title, context } = translateRecommendationType(rec.title, rec.source, rec.description || "");
      const urgency = severityToUrgency(rec.severity);
      const item: ActionItem = {
        id: `rec-${rec.id}`,
        source: "recommendation",
        sourceId: rec.id,
        title,
        context,
        urgency,
        agentAttribution: null,
        agentId: rec.agentId || null,
        outcomeId: null,
        createdAt: rec.createdAt ? rec.createdAt.toISOString() : null,
      };
      if (urgency === "urgent" || urgency === "today") {
        needsDecision.push(item);
      } else {
        fyi.push(item);
      }
    }

    needsDecision.sort(
      (a, b) =>
        URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency] ||
        new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
    );
    fyi.sort(
      (a, b) =>
        URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency] ||
        new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
    );

    res.json({
      needsDecisionCount: needsDecision.length,
      fyiCount: fyi.length,
      completedTodayCount: completedToday.length,
      needsDecision,
      fyi,
      completedToday,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[my-actions] Error:", message);
    res.status(500).json({ error: "Failed to fetch actions" });
  }
});

export default router;
