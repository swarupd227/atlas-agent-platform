/**
 * Astra Workspace routes (docs/ux/agentic-modernization.md).
 *
 * Behind the ASTRA_WORKSPACE_ENABLED platform setting: when it isn't "true"
 * every route answers 404, whatever the client thinks the flag is. Every
 * route needs the use_astra permission (all roles have it; what each role can
 * actually do is decided per tool). Threads are scoped to the caller's
 * organization and to the user who started them.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { getDefaultOrgId, getOrgId } from "../auth";
import { checkPermission, getRequestActorLabel, getRequestRole, hasPermission } from "../permissions";
import { ThreadRemovalError, planThreadRemoval, removeThread } from "../astra/thread-actions";
import { requestStop } from "../astra/stop-turn";
import { MessageFeedbackError, recordMessageFeedback } from "../astra/message-feedback";
import { llmInvokeRateLimiter } from "../rate-limits";
import { openSse as openSseStream } from "../sse";
import { storage } from "../storage";
import { AstraBusyError, AstraNotFoundError, resolveAction, runTurn } from "../astra/engine";
import { getAstraRuntime } from "../astra/wiring";
import { getTenantIndustry, resolveIndustry } from "../industry-context";
import { buildHome, type HomeSection } from "../astra/home";
import { loadActivity } from "../astra/home-activity";
import { LIBRARY_ELSEWHERE, buildLibrarySection, normalizeQuery, visibleLibrarySections, type LibraryItem, type LibrarySection, type LibrarySectionId } from "../astra/library";
import type { AstraContext, AstraEvent } from "../astra/types";

const router = Router();

export const ASTRA_FLAG_KEY = "ASTRA_WORKSPACE_ENABLED";
const FLAG_CACHE_MS = 30_000;
let flagCache: { value: boolean; at: number } | null = null;

async function astraEnabled(): Promise<boolean> {
  if (flagCache && Date.now() - flagCache.at < FLAG_CACHE_MS) return flagCache.value;
  const setting = await storage.getPlatformSetting(ASTRA_FLAG_KEY).catch(() => undefined);
  const value = String(setting?.value ?? "").toLowerCase() === "true";
  flagCache = { value, at: Date.now() };
  return value;
}

async function requireAstraEnabled(_req: Request, res: Response, next: NextFunction) {
  if (await astraEnabled()) return next();
  res.status(404).json({ message: "Astra Workspace is not enabled for this deployment." });
}

router.use("/api/astra", requireAstraEnabled);

async function callerContext(req: Request, requestedIndustryId?: string | null): Promise<AstraContext | null> {
  const orgId = getOrgId(req) ?? getDefaultOrgId();
  if (!orgId) return null;
  // The organization's industry is the default; the browser's value only counts as a personal view.
  const [selection, tenant] = await Promise.all([resolveIndustry(req, requestedIndustryId), getTenantIndustry(orgId)]);
  return {
    orgId,
    userId: req.authUser?.userId ?? null,
    role: getRequestRole(req),
    industryId: selection.industryId,
    subVertical: selection.subVertical,
    industrySource: selection.source,
    organizationIndustryId: tenant.industryId,
  };
}

/** This route's own view of the shared SSE writer (server/sse.ts). */
const openSse = (res: Response): ((event: AstraEvent) => void) => openSseStream<AstraEvent>(res);

function streamError(send: (e: AstraEvent) => void, err: unknown) {
  const message = err instanceof Error ? err.message : "Something went wrong.";
  send({ type: "error", message });
}

router.get("/api/astra/status", checkPermission("use_astra"), (_req, res) => {
  res.json({ enabled: true });
});

router.get("/api/astra/threads", checkPermission("use_astra"), async (req, res) => {
  const ctx = await callerContext(req);
  if (!ctx) return res.status(403).json({ message: "No organization context." });
  const { store } = getAstraRuntime();
  res.json(await store.listThreads(ctx.orgId, ctx.userId));
});

const createThreadSchema = z.object({ title: z.string().max(200).optional() });

router.post("/api/astra/threads", checkPermission("use_astra"), async (req, res) => {
  const ctx = await callerContext(req);
  if (!ctx) return res.status(403).json({ message: "No organization context." });
  const parsed = createThreadSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ message: "Invalid request", errors: parsed.error.issues });
  const { store } = getAstraRuntime();
  res.status(201).json(await store.createThread(ctx.orgId, ctx.userId, parsed.data.title));
});

/**
 * Ask the turn running in this conversation to stop. Cooperative: the engine
 * checks between model calls and between tool calls, so a tool already running
 * finishes and records its result.
 */
router.post("/api/astra/threads/:id/stop", checkPermission("use_astra"), async (req, res) => {
  const ctx = await callerContext(req);
  if (!ctx) return res.status(403).json({ message: "No organization context." });
  const { store } = getAstraRuntime();
  const found = await store.getThreadForCaller(req.params.id as string, ctx.orgId, ctx.userId);
  if (!found) return res.status(404).json({ error: "No conversation with that id that you can open." });
  if (found.thread.status !== "running") {
    return res.status(409).json({ error: "Nothing is running in this conversation." });
  }
  requestStop(found.thread.id);
  res.json({ stopping: true });
});

const messageFeedbackSchema = z.object({
  rating: z.enum(["up", "down"]),
  note: z.string().max(2000).optional(),
});

/**
 * Rate one of Astra's answers. It goes to the platform's Feedback store --
 * the same one the Feedback page reads -- with the exchange it is about.
 */
router.post("/api/astra/threads/:id/messages/:messageId/feedback", checkPermission("use_astra"), async (req, res) => {
  const ctx = await callerContext(req);
  if (!ctx) return res.status(403).json({ message: "No organization context." });
  const parsed = messageFeedbackSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "A rating is \"up\" or \"down\", with an optional note." });
  const { store } = getAstraRuntime();
  try {
    res.status(201).json(await recordMessageFeedback(store, { ...ctx, actorLabel: getRequestActorLabel(req) }, {
      threadId: req.params.id as string,
      messageId: req.params.messageId as string,
      rating: parsed.data.rating,
      note: parsed.data.note ?? null,
    }));
  } catch (e) {
    if (e instanceof MessageFeedbackError) return res.status(e.status).json({ error: e.message });
    throw e;
  }
});

/** Find a phrase in the conversations you can open. */
router.get("/api/astra/search", checkPermission("use_astra"), async (req, res) => {
  const ctx = await callerContext(req);
  if (!ctx) return res.status(403).json({ message: "No organization context." });
  const q = typeof req.query.q === "string" ? req.query.q : "";
  const { store } = getAstraRuntime();
  res.json({ q, hits: await store.searchMessages(ctx.orgId, ctx.userId, q) });
});

const renameThreadSchema = z.object({ title: z.string().min(1).max(200) });

/** Rename a conversation; its auto-title is only the first thing you typed. */
router.patch("/api/astra/threads/:id", checkPermission("use_astra"), async (req, res) => {
  const ctx = await callerContext(req);
  if (!ctx) return res.status(403).json({ message: "No organization context." });
  const parsed = renameThreadSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "A conversation needs a name of 1 to 200 characters." });
  const { store } = getAstraRuntime();
  const renamed = await store.renameThread(req.params.id as string, ctx.orgId, ctx.userId, parsed.data.title);
  if (!renamed) return res.status(404).json({ error: "No conversation with that id that you can rename." });
  res.json(renamed);
});

/** What deleting this conversation would take. */
router.get("/api/astra/threads/:id/removal", checkPermission("use_astra"), async (req, res) => {
  const ctx = await callerContext(req);
  if (!ctx) return res.status(403).json({ message: "No organization context." });
  const { store } = getAstraRuntime();
  try {
    res.json(await planThreadRemoval(store, { ...ctx, actorLabel: getRequestActorLabel(req) }, req.params.id as string));
  } catch (e) {
    if (e instanceof ThreadRemovalError) return res.status(e.status).json({ error: e.message });
    throw e;
  }
});

/** Delete a conversation. What Astra did in it is not undone. */
router.delete("/api/astra/threads/:id", checkPermission("use_astra"), async (req, res) => {
  const ctx = await callerContext(req);
  if (!ctx) return res.status(403).json({ message: "No organization context." });
  const { store } = getAstraRuntime();
  try {
    res.json(await removeThread(store, { ...ctx, actorLabel: getRequestActorLabel(req) }, req.params.id as string));
  } catch (e) {
    if (e instanceof ThreadRemovalError) return res.status(e.status).json({ error: e.message });
    throw e;
  }
});

router.get("/api/astra/threads/:id", checkPermission("use_astra"), async (req, res) => {
  const ctx = await callerContext(req);
  if (!ctx) return res.status(403).json({ message: "No organization context." });
  const { store } = getAstraRuntime();
  const found = await store.getThreadForCaller(String(req.params.id), ctx.orgId, ctx.userId);
  if (!found) return res.status(404).json({ message: "Thread not found" });
  res.json(found);
});

/** A section that fails says so on its row; the rest of the briefing still loads. */
async function section<T>(load: () => Promise<T>, timings?: string[], name?: string): Promise<HomeSection<T>> {
  const started = Date.now();
  try {
    return { ok: true, data: await load() };
  } catch (err) {
    console.error("[astra] home section failed:", err instanceof Error ? err.message : err);
    return { ok: false, reason: "the data isn't available right now" };
  } finally {
    if (timings && name) timings.push(`${name};dur=${Date.now() - started}`);
  }
}

/**
 * The home briefing. Each section reads the same service as the tool its row
 * asks, and is left out when the role can't use that tool.
 */
router.get("/api/astra/home", checkPermission("use_astra"), async (req, res) => {
  const requested = typeof req.query.industryId === "string" ? req.query.industryId : null;
  const ctx = await callerContext(req, requested);
  if (!ctx) return res.status(403).json({ message: "No organization context." });
  const { services } = getAstraRuntime().deps;
  const can = (p: Parameters<typeof hasPermission>[1]) => hasPermission(ctx.role, p);
  const labelOf = async (id: string | null | undefined) => {
    if (!id) return null;
    const c = await services.getIndustryContext(id);
    return c.selected ? (c.pack || c.builtIn ? c.label : String(c.industryId)) : null;
  };

  // Per-section timings go out as a Server-Timing header, so a slow briefing says which part is slow.
  const timings: string[] = [];
  const [organizationName, industryLabel, organizationLabel, needs, agents, outcomes, connectors] = await Promise.all([
    services.getOrganizationName(ctx.orgId).catch(() => null),
    labelOf(ctx.industryId).catch(() => null),
    (ctx.industrySource === "request" ? labelOf(ctx.organizationIndustryId) : Promise.resolve(null)).catch(() => null),
    section(async () => {
      const d = await services.needsMe(ctx.orgId, ctx.role);
      const items = d.needsDecision as Array<{ urgency: string; canDecideHere: boolean }>;
      return {
        needsDecisionCount: d.needsDecisionCount as number,
        urgentCount: items.filter((i) => i.urgency === "urgent").length,
        decidableHere: items.filter((i) => i.canDecideHere).length,
      };
    }, timings, "needs"),
    section(async () => ({ runnable: (await services.listRunnableAgents(ctx.orgId, ctx.role)).length }), timings, "agents"),
    section(() => services.outcomeCounts(ctx.orgId), timings, "outcomes"),
    can("view_agents")
      ? section(async () => {
          const list = (await services.listConnectors(ctx.orgId)) as Array<{ connected: boolean | null }>;
          return { total: list.length, connected: list.filter((c) => c.connected === true).length, notConnected: list.filter((c) => c.connected === false).length };
        }, timings, "connectors")
      : Promise.resolve(null),
  ]);
  res.setHeader("Server-Timing", timings.join(", "));

  res.json(
    buildHome({
      organizationName,
      industry: { label: industryLabel, source: ctx.industrySource ?? "none", organizationLabel },
      needs,
      agents,
      outcomes,
      connectors,
    }),
  );
});

/**
 * What is running, what finished this week and what it cost, for the home.
 * Separate from /home so a slow run table never holds up the briefing.
 */
router.get("/api/astra/home/activity", checkPermission("use_astra"), async (req, res) => {
  const ctx = await callerContext(req);
  if (!ctx) return res.status(403).json({ message: "No organization context." });
  try {
    res.json(await loadActivity(ctx.orgId, { includeSpend: hasPermission(ctx.role, "view_traces") }));
  } catch (err) {
    res.status(500).json({ message: err instanceof Error ? err.message : "Couldn't load activity." });
  }
});

/**
 * The Library: what the organization has, per section, for this role. Each
 * section is organization-scoped and left out entirely when the role can't
 * see it. At most 50 items per section, with the true number of matches.
 */
router.get("/api/astra/library", checkPermission("use_astra"), async (req, res) => {
  const ctx = await callerContext(req);
  if (!ctx) return res.status(403).json({ message: "No organization context." });
  const q = normalizeQuery(req.query.q);
  const { services, store } = { services: getAstraRuntime().deps.services, store: getAstraRuntime().store };
  const can = (p: Parameters<typeof hasPermission>[1]) => hasPermission(ctx.role, p);
  const orgId = ctx.orgId;
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

  const loaders: Record<LibrarySectionId, () => Promise<LibraryItem[]>> = {
    conversations: async () =>
      (await store.listThreads(orgId, ctx.userId, 1000)).map((t) => ({
        id: t.id,
        name: t.title,
        detail: t.pendingAction?.summary ?? null,
        status: t.status === "awaiting_confirmation" ? "waiting on you" : t.status === "failed" ? "failed" : null,
        ask: null,
        href: `/t/${encodeURIComponent(t.id)}`,
        inShell: true,
      })),
    agents: async () => {
      const rows: Array<{ id: string; name: string; description?: string | null; status?: string }> = can("view_agents")
        ? (await storage.getAgents(orgId)).filter((a) => a.agentType !== "team")
        : await services.listRunnableAgents(orgId, ctx.role);
      return rows.map((a) => ({
        id: a.id,
        name: a.name,
        detail: text(a.description),
        status: a.status ?? null,
        ask: can("view_agents") ? `Tell me about the agent "${a.name}".` : null,
        href: `/agents/${encodeURIComponent(a.id)}`,
      }));
    },
    teams: async () =>
      (await services.listTeams(orgId)).map((t: { id: string; name: string; status: string }) => ({
        id: t.id,
        name: t.name,
        detail: null,
        status: t.status,
        ask: `Check the wiring of the team "${t.name}".`,
        href: `/agents/${encodeURIComponent(t.id)}`,
      })),
    outcomes: async () =>
      (await storage.getOutcomes(orgId)).map((o) => ({
        id: o.id,
        name: o.name,
        detail: text(o.description),
        status: o.status ?? null,
        ask: `Show me the outcome "${o.name}" and its KPIs.`,
        href: `/outcomes/${encodeURIComponent(o.id)}`,
      })),
    connectors: async () =>
      (await services.listConnectors(orgId)).map((c: { id: string; name: string; description: string | null; status: string; connected: boolean | null }) => ({
        id: c.id,
        name: c.name,
        detail: text(c.description),
        status: c.connected === false ? "not connected" : c.status,
        ask: `Tell me about the connector "${c.name}" and which agents use it.`,
        href: `/integrations/mcp-servers/${encodeURIComponent(c.id)}`,
      })),
    // No Astra tool reads policies or process flows yet, so these rows only link out.
    policies: async () =>
      (await storage.getPolicies(orgId)).map((p) => ({
        id: p.id,
        name: p.name,
        detail: [p.domain?.replace(/_/g, " "), text(p.description)].filter(Boolean).join(" · ") || null,
        status: p.status ?? null,
        ask: null,
        href: `/governance?policy=${encodeURIComponent(p.id)}`,
      })),
    processFlows: async () =>
      (await storage.getProcessFlows(orgId)).map((f) => ({
        id: f.id,
        name: f.name,
        detail: text(f.description),
        status: null,
        ask: null,
        href: "/process-flows",
      })),
  };

  const sections = await Promise.all(
    visibleLibrarySections(can).map(async (id): Promise<LibrarySection & { error?: string }> => {
      try {
        return buildLibrarySection(id, await loaders[id](), q);
      } catch (err) {
        console.error(`[astra] library section ${id} failed:`, err instanceof Error ? err.message : err);
        return { ...buildLibrarySection(id, [], null), error: "Couldn't load this section." };
      }
    }),
  );
  res.json({ query: q, sections, elsewhere: LIBRARY_ELSEWHERE });
});

/**
 * What the composer's @ menu offers: exactly the agents run_agent accepts for this
 * role, plus -- for roles that may run teams (run_team's permission) -- the
 * organization's teams, marked as such.
 */
/** A team run as the pane beside the conversation shows it; polled while the run is live. Same view as get_team_run. */
router.get("/api/astra/team-runs/:id", checkPermission("use_astra"), async (req, res) => {
  const ctx = await callerContext(req);
  if (!ctx) return res.status(403).json({ message: "No organization context." });
  if (!hasPermission(ctx.role, "view_agents")) return res.status(403).json({ message: "Your role can't view team runs." });
  try {
    const run = await getAstraRuntime().deps.services.getTeamRun(ctx.orgId, ctx.role, String(req.params.id));
    if (!run) return res.status(404).json({ message: "No team run with that id in this organization." });
    res.json(run);
  } catch (err) {
    console.error("[astra] team run failed:", err instanceof Error ? err.message : err);
    res.status(500).json({ message: "Couldn't load that team run." });
  }
});

const RETIRED_STATUSES = new Set(["archived", "retired", "decommissioned", "deprecated"]);
router.get("/api/astra/mentionables", checkPermission("use_astra"), async (req, res) => {
  const ctx = await callerContext(req);
  if (!ctx) return res.status(403).json({ message: "No organization context." });
  try {
    const services = getAstraRuntime().deps.services;
    const agents = (await services.listRunnableAgents(ctx.orgId, ctx.role)) as Array<{ id: string; name: string; description: string | null }>;
    const allTeams = (await services.listTeams(ctx.orgId)) as Array<{ id: string; name: string; status: string }>;
    const teamIds = new Set(allTeams.map((t) => t.id));
    // The Workspace's offer can itself include teams (and an entry twice): one entry per id, marked for what it is.
    const seen = new Set<string>();
    const out: Array<{ id: string; name: string; description: string | null; kind: "agent" | "team" }> = [];
    for (const a of agents) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      out.push({ id: a.id, name: a.name, description: a.description ?? null, kind: teamIds.has(a.id) ? "team" : "agent" });
    }
    if (hasPermission(ctx.role, "manage_agents")) {
      for (const t of allTeams) {
        if (seen.has(t.id) || RETIRED_STATUSES.has(t.status)) continue;
        seen.add(t.id);
        out.push({ id: t.id, name: t.name, description: null, kind: "team" });
      }
    }
    res.json(out);
  } catch (err) {
    console.error("[astra] mentionables failed:", err instanceof Error ? err.message : err);
    res.status(500).json({ message: "Couldn't load your agents." });
  }
});

/** Exactly what list_needs_me reads, so the rail and the conversation agree. */
router.get("/api/astra/needs-you", checkPermission("use_astra"), async (req, res) => {
  const ctx = await callerContext(req);
  if (!ctx) return res.status(403).json({ message: "No organization context." });
  try {
    res.json(await getAstraRuntime().deps.services.needsMe(ctx.orgId, ctx.role));
  } catch (err) {
    console.error("[astra] needs-you failed:", err instanceof Error ? err.message : err);
    res.status(500).json({ message: "Couldn't load what needs you." });
  }
});

const sendMessageSchema = z.object({
  text: z.string().trim().min(1).max(8000),
  industryId: z.string().max(100).nullable().optional(),
});

router.post("/api/astra/threads/:id/messages/stream", llmInvokeRateLimiter, checkPermission("use_astra"), async (req, res) => {
  const parsed = sendMessageSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ message: "Invalid request", errors: parsed.error.issues });
  const ctx = await callerContext(req, parsed.data.industryId);
  if (!ctx) return res.status(403).json({ message: "No organization context." });
  const threadId = String(req.params.id);
  const { deps, store } = getAstraRuntime();
  if (!(await store.getThreadForCaller(threadId, ctx.orgId, ctx.userId))) {
    return res.status(404).json({ message: "Thread not found" });
  }

  const send = openSse(res);
  try {
    await store.titleIfDefault(threadId, ctx.orgId, parsed.data.text).catch(() => {});
    await runTurn(deps, ctx, threadId, parsed.data.text, send);
  } catch (err) {
    if (err instanceof AstraBusyError || err instanceof AstraNotFoundError) streamError(send, err);
    else {
      console.error("[astra] turn failed:", err);
      streamError(send, err);
    }
  } finally {
    res.end();
  }
});

const decisionSchema = z.object({ decision: z.enum(["confirm", "cancel"]) });

router.post("/api/astra/threads/:id/actions/:actionId/stream", llmInvokeRateLimiter, checkPermission("use_astra"), async (req, res) => {
  const parsed = decisionSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ message: "Invalid request", errors: parsed.error.issues });
  const ctx = await callerContext(req, typeof req.body?.industryId === "string" ? req.body.industryId : null);
  if (!ctx) return res.status(403).json({ message: "No organization context." });
  const threadId = String(req.params.id);
  const { deps, store } = getAstraRuntime();
  if (!(await store.getThreadForCaller(threadId, ctx.orgId, ctx.userId))) {
    return res.status(404).json({ message: "Thread not found" });
  }

  const send = openSse(res);
  try {
    await resolveAction(deps, ctx, threadId, String(req.params.actionId), parsed.data.decision, send);
  } catch (err) {
    if (!(err instanceof AstraNotFoundError)) console.error("[astra] action failed:", err);
    streamError(send, err);
  } finally {
    res.end();
  }
});

export default router;
