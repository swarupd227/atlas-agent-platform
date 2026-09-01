import { Router, type Request, type Response } from "express";
import { z, ZodError } from "zod";
import { storage } from "../storage";
import { getOrgId } from "../auth";
import { checkPermission } from "../permissions";
import { insertAgentTaskClassSchema } from "@shared/schema";
import { syncMandateToGit } from "../mandate-git-sync";
import { deriveFromMandate } from "../mandate-derivation";
import { gatherAvailableTools } from "../tool-dispatcher";
import { lintMandate } from "../mandate-lint";

const router = Router();

/**
 * Mandate + task class + warrant (server/db.ts's agent_mandates /
 * agent_task_classes / agent_warrants): the written job description an
 * agent's accountable owner authors, the discrete kinds of decisions derived
 * from it, and the time-boxed grants of authority scoped to one of those task
 * classes. A task class only participates in the tool-dispatcher warrant gate
 * (server/tool-dispatcher.ts's evaluateWarrantCondition) once its author
 * explicitly lists a tool in coveredTools -- empty by default, so issuing a
 * warrant here has zero effect on any agent that hasn't opted in.
 */

// Body for PUT /api/agents/:id/mandate -- every section optional so a draft
// can be saved incrementally; approve() is what actually requires content.
const mandateUpsertSchema = z.object({
  accountableOwnerUserId: z.string().nullable().optional(),
  whatItDoes: z.string().max(4000).nullable().optional(),
  mustNever: z.string().max(4000).nullable().optional(),
  whenToAskAHuman: z.string().max(4000).nullable().optional(),
  whenToStop: z.string().max(4000).nullable().optional(),
  fallbackBehavior: z.string().max(4000).nullable().optional(),
  howWeKnowItsWorking: z.string().max(4000).nullable().optional(),
});

router.get("/api/agents/:id/mandate", async (req: Request<{ id: string }>, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const agent = await storage.getAgent(req.params.id, orgId);
    if (!agent) return res.status(404).json({ message: "Agent not found" });
    const mandate = await storage.getAgentMandate(req.params.id, orgId);
    const taskClasses = await storage.listAgentTaskClasses(req.params.id, orgId);
    // Preview only -- read-only, never blocks this GET. The actual gate is
    // on warrant issuance below (POST /api/task-classes/:id/warrants).
    const lint = await lintMandate(mandate ?? undefined);
    res.json({ mandate: mandate ?? null, taskClasses, lint });
  } catch (e: any) {
    res.status(500).json({ message: e.message || "Failed to load mandate" });
  }
});

router.put("/api/agents/:id/mandate", checkPermission("create_modify_blueprints"), async (req: Request<{ id: string }>, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const agent = await storage.getAgent(req.params.id, orgId);
    if (!agent) return res.status(404).json({ message: "Agent not found" });

    const body = mandateUpsertSchema.parse(req.body);
    // Same demo-mode fallback as the approve route below -- authMiddleware
    // skips entirely in demo mode, so authUser is routinely absent.
    const authorId = (req as any).authUser?.userId ?? "system";
    const mandate = await storage.upsertAgentMandate(
      req.params.id,
      { ...body, createdBy: authorId },
      orgId,
    );
    // Best-effort mirror to the client's own repo (server/mandate-git-sync.ts)
    // -- never throws, no-ops silently when the agent has no gitConfig.repoUrl
    // set (true for essentially every agent today), so this never changes
    // whether a mandate save succeeds.
    const gitSync = await syncMandateToGit(agent, mandate);
    // Fire-and-forget (server/mandate-derivation.ts): an LLM call is
    // multi-second and must never slow this response. The review UI polls
    // the derivations list separately -- see GET .../mandate-derivations.
    deriveFromMandate(agent, mandate, "save").catch(() => {});
    res.json({ ...mandate, gitSync });
  } catch (e: any) {
    if (e instanceof ZodError) return res.status(400).json({ message: "Validation error", errors: e.errors });
    res.status(500).json({ message: e.message || "Failed to save mandate" });
  }
});

// Deliberately the same permission approving anything else governed today
// (Warrant Gap Analysis: "reuse, don't reinvent") -- not a new capability,
// the same one that already approves policy/blueprint changes.
router.post("/api/agents/:id/mandate/approve", checkPermission("approve_changes"), async (req: Request<{ id: string }>, res: Response) => {
  try {
    const orgId = getOrgId(req);
    // authMiddleware skips entirely in demo mode (server/auth.ts), so
    // authUser is routinely absent there -- fall back rather than 401,
    // matching agent-files.ts's actorId convention for the same reason.
    const approverId = (req as any).authUser?.userId ?? "system";
    const approved = await storage.approveAgentMandate(req.params.id, approverId, orgId);
    if (!approved) return res.status(404).json({ message: "No mandate to approve for this agent -- save one first" });
    const agent = await storage.getAgent(req.params.id, orgId);
    const gitSync = agent ? await syncMandateToGit(agent, approved) : { pushed: false, reason: "agent not found" };
    if (agent) deriveFromMandate(agent, approved, "approve").catch(() => {});
    res.json({ ...approved, gitSync });
  } catch (e: any) {
    // approveAgentMandate throws a readable message for the missing-fields
    // case (S1.1.3's lint) -- surface it as a 400, not a 500.
    res.status(400).json({ message: e.message || "Failed to approve mandate" });
  }
});

router.get("/api/agents/:id/task-classes", async (req: Request<{ id: string }>, res: Response) => {
  try {
    const taskClasses = await storage.listAgentTaskClasses(req.params.id, getOrgId(req));
    res.json(taskClasses);
  } catch (e: any) {
    res.status(500).json({ message: e.message || "Failed to list task classes" });
  }
});

router.post("/api/agents/:id/task-classes", checkPermission("create_modify_blueprints"), async (req: Request<{ id: string }>, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const agent = await storage.getAgent(req.params.id, orgId);
    if (!agent) return res.status(404).json({ message: "Agent not found" });
    const mandate = await storage.getAgentMandate(req.params.id, orgId);

    const parsed = insertAgentTaskClassSchema
      .omit({ agentId: true, organizationId: true, mandateId: true, derivedFrom: true, sourceRef: true })
      .parse(req.body);
    const taskClass = await storage.createAgentTaskClass({
      ...parsed,
      agentId: req.params.id,
      organizationId: orgId,
      mandateId: mandate?.id ?? null,
      derivedFrom: "manual",
    } as any);
    res.status(201).json(taskClass);
  } catch (e: any) {
    if (e instanceof ZodError) return res.status(400).json({ message: "Validation error", errors: e.errors });
    res.status(500).json({ message: e.message || "Failed to create task class" });
  }
});

router.patch("/api/task-classes/:id", checkPermission("create_modify_blueprints"), async (req: Request<{ id: string }>, res: Response) => {
  try {
    const parsed = insertAgentTaskClassSchema
      .omit({ agentId: true, organizationId: true, mandateId: true, derivedFrom: true, sourceRef: true })
      .partial()
      .parse(req.body);
    const updated = await storage.updateAgentTaskClass(req.params.id, parsed, getOrgId(req));
    if (!updated) return res.status(404).json({ message: "Task class not found" });
    res.json(updated);
  } catch (e: any) {
    if (e instanceof ZodError) return res.status(400).json({ message: "Validation error", errors: e.errors });
    res.status(500).json({ message: e.message || "Failed to update task class" });
  }
});

router.delete("/api/task-classes/:id", checkPermission("create_modify_blueprints"), async (req: Request<{ id: string }>, res: Response) => {
  try {
    const ok = await storage.deleteAgentTaskClass(req.params.id, getOrgId(req));
    if (!ok) return res.status(404).json({ message: "Task class not found" });
    res.status(204).end();
  } catch (e: any) {
    if (/warrant history/.test(e.message || "")) return res.status(409).json({ message: e.message });
    res.status(500).json({ message: e.message || "Failed to delete task class" });
  }
});

const warrantIssueSchema = z.object({
  grants: z.enum(["autonomous", "requires_approval", "denied"]),
  basis: z.string().max(4000).nullable().optional(),
  expiresAt: z.coerce.date(),
});

router.get("/api/task-classes/:id/warrants", async (req: Request<{ id: string }>, res: Response) => {
  try {
    const warrants = await storage.listWarrantsForTaskClass(req.params.id, getOrgId(req));
    res.json(warrants);
  } catch (e: any) {
    res.status(500).json({ message: e.message || "Failed to list warrants" });
  }
});

// Same permission as anything else that grants or withdraws an agent's
// standing autonomy -- issuing a warrant IS a manage_autonomy action, not a
// new capability of its own.
router.post("/api/task-classes/:id/warrants", checkPermission("manage_autonomy"), async (req: Request<{ id: string }>, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const taskClass = await storage.getAgentTaskClass(req.params.id, orgId);
    if (!taskClass) return res.status(404).json({ message: "Task class not found" });

    const body = warrantIssueSchema.parse(req.body);
    if (body.expiresAt.getTime() <= Date.now()) {
      return res.status(400).json({ message: "expiresAt must be in the future -- a warrant that starts already expired grants nothing" });
    }

    // S1.1.3: a vague or unapproved mandate cannot back real authority.
    // Skipped only for grants:"denied" -- withholding authority is itself
    // the safe, restrictive action this story exists to protect, so a lint
    // failure should never block someone from making a task class MORE
    // restrictive, only from granting it real autonomy or approval-gated access.
    if (body.grants !== "denied") {
      const mandate = await storage.getAgentMandate(taskClass.agentId, orgId);
      const lint = await lintMandate(mandate ?? undefined);
      if (!lint.ok) {
        return res.status(409).json({
          message: "Mandate fails lint -- fix these before a warrant can be issued for this task class.",
          lint,
        });
      }
    }

    const issuedBy = (req as any).authUser?.userId ?? "system";
    const warrant = await storage.issueWarrant({
      organizationId: orgId,
      agentId: taskClass.agentId,
      taskClassId: taskClass.id,
      grants: body.grants,
      basis: body.basis ?? null,
      issuedBy,
      expiresAt: body.expiresAt,
    } as any);
    res.status(201).json(warrant);
  } catch (e: any) {
    if (e instanceof ZodError) return res.status(400).json({ message: "Validation error", errors: e.errors });
    res.status(500).json({ message: e.message || "Failed to issue warrant" });
  }
});

router.post("/api/warrants/:id/revoke", checkPermission("manage_autonomy"), async (req: Request<{ id: string }>, res: Response) => {
  try {
    const revokedBy = (req as any).authUser?.userId ?? "system";
    const reason = typeof req.body?.reason === "string" ? req.body.reason.slice(0, 2000) : undefined;
    const revoked = await storage.revokeWarrant(req.params.id, revokedBy, reason, getOrgId(req));
    if (!revoked) return res.status(404).json({ message: "Warrant not found" });
    res.json(revoked);
  } catch (e: any) {
    res.status(500).json({ message: e.message || "Failed to revoke warrant" });
  }
});

// ── Mandate derivation review (S1.1.2) ───────────────────────────────────────
// Nothing here ever applies a proposal automatically. GET routes are
// read-only; the only route that writes to a real agent_task_classes row or
// agents.policyBindings is /decide, and only on an explicit accept.

async function computeOverlapWarnings(agentId: string, orgId: string | undefined, pendingTaskClassItems: Array<{ id: string; proposedContent: any; correctedContent: any }>) {
  if (!pendingTaskClassItems.length) return {} as Record<string, string[]>;
  const existing = await storage.listAgentTaskClasses(agentId, orgId);
  const warnings: Record<string, string[]> = {};
  for (const item of pendingTaskClassItems) {
    const content = item.correctedContent ?? item.proposedContent;
    const suggested: string[] = Array.isArray(content?.suggestedCoveredTools) ? content.suggestedCoveredTools : [];
    if (!suggested.length) continue;
    const itemWarnings: string[] = [];
    for (const tc of existing) {
      const overlap = (tc.coveredTools || []).filter(t => suggested.includes(t));
      if (!overlap.length) continue;
      const activeWarrant = await storage.getActiveWarrant(tc.id, orgId);
      if (activeWarrant?.grants === "autonomous") {
        itemWarnings.push(`Tool${overlap.length > 1 ? "s" : ""} ${overlap.join(", ")} also covered by task class "${tc.name}", which has an autonomous warrant -- accepting this will additionally require a warrant here. This also affects Playground and Run Test calls, not just production.`);
      }
    }
    if (itemWarnings.length) warnings[item.id] = itemWarnings;
  }
  return warnings;
}

router.get("/api/agents/:id/mandate-derivations", async (req: Request<{ id: string }>, res: Response) => {
  try {
    const runs = await storage.listMandateDerivationsForAgent(req.params.id, getOrgId(req));
    res.json(runs);
  } catch (e: any) {
    res.status(500).json({ message: e.message || "Failed to list mandate derivations" });
  }
});

router.get("/api/agents/:id/mandate-derivations/latest", async (req: Request<{ id: string }>, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const runs = await storage.listMandateDerivationsForAgent(req.params.id, orgId);
    const latest = runs[0];
    if (!latest) return res.json(null);
    const mandate = await storage.getAgentMandate(req.params.id, orgId);
    const stale = !!mandate && mandate.version > latest.mandateVersion;
    const pendingTaskClassItems = latest.items.filter(i => i.kind === "task_class" && i.status === "pending");
    const overlapWarnings = await computeOverlapWarnings(req.params.id, orgId, pendingTaskClassItems);
    res.json({ ...latest, stale, overlapWarnings });
  } catch (e: any) {
    res.status(500).json({ message: e.message || "Failed to load the latest mandate derivation" });
  }
});

const decideSchema = z.object({
  decision: z.enum(["accept", "reject"]),
  correctedContent: z.record(z.any()).optional(),
});

router.post("/api/mandate-derived-items/:id/decide", checkPermission("create_modify_blueprints"), async (req: Request<{ id: string }>, res: Response) => {
  try {
    const item = await storage.getMandateDerivedItem(req.params.id);
    if (!item) return res.status(404).json({ message: "Derived item not found" });
    if (item.status !== "pending") return res.status(409).json({ message: `Already decided (${item.status})` });

    const { decision, correctedContent } = decideSchema.parse(req.body);
    const decidedBy = (req as any).authUser?.userId ?? "system";

    if (decision === "reject") {
      const updated = await storage.updateMandateDerivedItem(item.id, { status: "rejected", decidedBy, decidedAt: new Date() });
      return res.json(updated);
    }

    const orgId = getOrgId(req);
    const agent = await storage.getAgent(item.agentId, orgId);
    if (!agent) return res.status(404).json({ message: "Agent not found" });
    const content: any = correctedContent ?? item.proposedContent;
    const wasCorrected = !!correctedContent;

    if (item.kind === "task_class") {
      // Re-validate against REAL current data -- a human correction isn't
      // hallucination risk, but a typo'd tool name silently means "covers
      // nothing," so it gets the exact same check the original proposal did.
      const links = await storage.getAgentMcpServers(agent.id);
      const tools = await gatherAvailableTools(links.map(l => l.serverId));
      const realToolNames = new Set(tools.map(t => t.toolName));
      const validatedTools: string[] = (Array.isArray(content.suggestedCoveredTools) ? content.suggestedCoveredTools : [])
        .filter((t: unknown) => typeof t === "string" && realToolNames.has(t));

      const taskClass = await storage.createAgentTaskClass({
        agentId: agent.id,
        organizationId: orgId,
        mandateId: null,
        name: content.name,
        description: content.description || null,
        requiredReviewerRole: content.suggestedRequiredReviewerRole || null,
        coveredTools: validatedTools,
        evidenceNote: content.suggestedEvidenceNote || null,
        derivedFrom: "mandate_derivation",
        sourceRef: `mandate_derived_items:${item.id}`,
      } as any);

      const updated = await storage.updateMandateDerivedItem(item.id, {
        status: wasCorrected ? "corrected" : "accepted",
        correctedContent: wasCorrected ? correctedContent : item.correctedContent,
        appliedRefId: taskClass.id,
        decidedBy,
        decidedAt: new Date(),
      });
      return res.json({ item: updated, taskClass });
    }

    if (item.kind === "policy_binding") {
      if (!content.policyId) {
        // Acknowledged gap -- nothing to bind, nothing to create.
        const updated = await storage.updateMandateDerivedItem(item.id, {
          status: "noted",
          correctedContent: wasCorrected ? correctedContent : item.correctedContent,
          decidedBy,
          decidedAt: new Date(),
        });
        return res.json({ item: updated });
      }
      const orgPolicies = orgId ? await storage.getPolicies(orgId) : [];
      const policy = orgPolicies.find(p => p.id === content.policyId);
      if (!policy) return res.status(400).json({ message: "That policy no longer exists -- refresh and try again." });

      const currentBindings: Array<{ policyId?: string; enforcement?: string }> = Array.isArray(agent.policyBindings) ? agent.policyBindings as any[] : [];
      if (!currentBindings.some(b => b.policyId === policy.id)) {
        await storage.updateAgent(agent.id, {
          policyBindings: [...currentBindings, { policyId: policy.id, enforcement: "monitor" }],
        } as any);
      }

      const updated = await storage.updateMandateDerivedItem(item.id, {
        status: wasCorrected ? "corrected" : "accepted",
        correctedContent: wasCorrected ? correctedContent : item.correctedContent,
        appliedRefId: policy.id,
        decidedBy,
        decidedAt: new Date(),
      });
      return res.json({ item: updated });
    }

    res.status(400).json({ message: `Unknown item kind "${item.kind}"` });
  } catch (e: any) {
    if (e instanceof ZodError) return res.status(400).json({ message: "Validation error", errors: e.errors });
    res.status(500).json({ message: e.message || "Failed to decide on derived item" });
  }
});

export default router;
