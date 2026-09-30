/**
 * The Runs surface.
 *
 * Built beside the existing run pages (/monitor, /observability, /dag-runs/:id,
 * /traces/:id), which are untouched — the same approach the connectors page
 * took. What these add is the half the others never showed: how much of a run
 * actually happened, and why the rest did not.
 *
 * Guarded by view_agents, the same permission the Cowork run tools carry, so a
 * role that cannot see agents cannot read their runs by either route. The
 * client's own nav list mirrors it (role-provider.tsx): the two must agree, or
 * the page is either invisible to someone who may read it or offered to
 * someone the server will refuse.
 */
import { Router, type Request, type Response } from "express";
import { getDefaultOrgId, getOrgId } from "../auth";
import { checkPermission } from "../permissions";

const router = Router();

/** Recent runs, each with how much of it ran. */
router.get("/api/runs/overview", checkPermission("view_agents"), async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req) ?? getDefaultOrgId() ?? undefined;
    const limit = Math.min(Math.max(Number(req.query.limit) || 60, 1), 200);
    const { runsOverview } = await import("../run-actions");
    res.json(await runsOverview(orgId, limit));
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to read runs" });
  }
});

/** One run, step by step, with why each step did or did not happen. */
router.get("/api/runs/:id/explain", checkPermission("view_agents"), async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req) ?? getDefaultOrgId() ?? undefined;
    const { explainRun, RunActionError } = await import("../run-actions");
    try {
      res.json(await explainRun(orgId, String(req.params.id)));
    } catch (e) {
      if (e instanceof RunActionError) return res.status(404).json({ error: e.message });
      throw e;
    }
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to explain the run" });
  }
});

/** Steps of a team that have not run in any of its recent runs. */
router.get("/api/teams/:teamAgentId/steps-never-run", checkPermission("view_agents"), async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req) ?? getDefaultOrgId() ?? undefined;
    const { stepsNeverRun, RunActionError } = await import("../run-actions");
    try {
      res.json(await stepsNeverRun(orgId, String(req.params.teamAgentId)));
    } catch (e) {
      if (e instanceof RunActionError) return res.status(404).json({ error: e.message });
      throw e;
    }
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to read the team's runs" });
  }
});

export default router;
