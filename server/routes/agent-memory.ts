// Governed agent memory: what an agent has been allowed to remember, and the
// requests waiting for a person (server/agent-memory.ts). Deciding a request is
// the ordinary approval route (PATCH /api/approvals/:id, type "memory_write");
// these routes are for looking, and for a person taking a note out.
import { Router } from "express";
import { storage } from "../storage";
import { getOrgId } from "../auth";
import { checkPermission, getRequestActorLabel } from "../permissions";
import { memoryOverview, removeNoteByPerson } from "../agent-memory";
import { skillProposalOverview } from "../agent-skill-proposals";
import { runReviewOverview } from "../agent-run-review";

const router = Router();

// An agent's live notes, the proposals waiting, and what was decided recently.
// 404 for an agent outside the caller's organization.
router.get("/api/agents/:id/memory", async (req, res) => {
  try {
    const agent = await storage.getAgent(String(req.params.id), getOrgId(req));
    if (!agent) return res.status(404).json({ message: "Agent not found" });
    res.json(await memoryOverview(agent.organizationId, agent.id));
  } catch (e: any) {
    res.status(500).json({ message: e?.message ?? "Could not read the agent's memory" });
  }
});

// A person removes a live note. Takes effect at once: removing is never the risky direction.
router.delete("/api/agents/:id/memory/:noteId", checkPermission("manage_agents"), async (req, res) => {
  try {
    const agent = await storage.getAgent(String(req.params.id), getOrgId(req));
    if (!agent) return res.status(404).json({ message: "Agent not found" });
    const r = await removeNoteByPerson({ orgId: agent.organizationId, agentId: agent.id, noteId: String(req.params.noteId), userId: getRequestActorLabel(req) });
    if (!r.applied) return res.status(r.reason === "no such note" ? 404 : 409).json({ message: r.reason });
    res.json({ removed: true, purgedEpisodic: r.purgedEpisodic ?? 0 });
  } catch (e: any) {
    res.status(500).json({ message: e?.message ?? "Could not remove the note" });
  }
});

// The skills an agent has proposed: waiting for a person, and the recently decided.
// Deciding one is the ordinary approval route (type "skill_proposal"). 404 for an
// agent outside the caller's organization.
router.get("/api/agents/:id/skill-proposals", async (req, res) => {
  try {
    const agent = await storage.getAgent(String(req.params.id), getOrgId(req));
    if (!agent) return res.status(404).json({ message: "Agent not found" });
    res.json(await skillProposalOverview(agent.organizationId, agent.id));
  } catch (e: any) {
    res.status(500).json({ message: e?.message ?? "Could not read the agent's skill proposals" });
  }
});

// The after-run reviewer's ledger for an agent: what it looked at, what it filed or
// why it did not, and what it cost (server/agent-run-review.ts). 404 for an agent
// outside the caller's organization.
router.get("/api/agents/:id/run-reviews", async (req, res) => {
  try {
    const agent = await storage.getAgent(String(req.params.id), getOrgId(req));
    if (!agent) return res.status(404).json({ message: "Agent not found" });
    res.json(await runReviewOverview(agent.organizationId, agent.id));
  } catch (e: any) {
    res.status(500).json({ message: e?.message ?? "Could not read the agent's run reviews" });
  }
});

export default router;
