/**
 * Relay agent lifecycle: create (returns the bearer token ONCE), list
 * (never returns the token or its hash), revoke. The agent itself
 * connects over WebSocket (see relay-server.ts), not through these routes.
 */

import { Router, type Request, type Response } from "express";
import { randomBytes, createHash } from "crypto";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "../db";
import { relayAgents } from "@shared/schema";
import { getOrgId, getDefaultOrgId } from "../auth";
import { isAgentConnected } from "./relay-server";

const router = Router();

export function hashRelayToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

router.post("/api/relay-agents", async (req: Request, res: Response) => {
  const orgId = getOrgId(req) ?? getDefaultOrgId();
  if (!orgId) return res.status(400).json({ error: "No organization context available." });

  const label = typeof req.body?.label === "string" && req.body.label.trim() ? req.body.label.trim() : "Relay Agent";
  const token = randomBytes(32).toString("hex");

  const [agent] = await db.insert(relayAgents).values({
    organizationId: orgId,
    label,
    tokenHash: hashRelayToken(token),
    status: "offline",
  }).returning();

  // The only time the raw token is ever returned -- it cannot be recovered
  // after this response; a lost token means generating a new relay agent.
  res.json({
    id: agent.id,
    label: agent.label,
    token,
    createdAt: agent.createdAt,
    note: "This token will not be shown again. Copy it into the relay agent's config now.",
  });
});

router.get("/api/relay-agents", async (req: Request, res: Response) => {
  const orgId = getOrgId(req) ?? getDefaultOrgId();
  if (!orgId) return res.status(400).json({ error: "No organization context available." });

  const rows = await db.select().from(relayAgents)
    .where(and(eq(relayAgents.organizationId, orgId), isNull(relayAgents.revokedAt)));

  res.json(rows.map(a => ({
    id: a.id,
    label: a.label,
    status: isAgentConnected(a.id) ? "online" : "offline",
    lastSeenAt: a.lastSeenAt,
    createdAt: a.createdAt,
  })));
});

router.post("/api/relay-agents/:id/revoke", async (req: Request, res: Response) => {
  const orgId = getOrgId(req) ?? getDefaultOrgId();
  if (!orgId) return res.status(400).json({ error: "No organization context available." });

  const [agent] = await db.select().from(relayAgents)
    .where(and(eq(relayAgents.id, String(req.params.id)), eq(relayAgents.organizationId, orgId))).limit(1);
  if (!agent) return res.status(404).json({ error: "Relay agent not found." });

  await db.update(relayAgents).set({ revokedAt: new Date(), status: "offline" }).where(eq(relayAgents.id, agent.id));
  res.json({ ok: true });
});

export { router as relayAgentsRouter };
