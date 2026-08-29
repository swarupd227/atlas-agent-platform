import { Router, type Request, type Response } from "express";
import { z, ZodError } from "zod";
import { storage } from "../storage";
import { getOrgId } from "../auth";
import { checkPermission } from "../permissions";
import { insertAgentTaskClassSchema } from "@shared/schema";

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
    res.json({ mandate: mandate ?? null, taskClasses });
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
    res.json(mandate);
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
    res.json(approved);
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

export default router;
