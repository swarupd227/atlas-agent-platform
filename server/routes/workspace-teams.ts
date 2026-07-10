/**
 * Agent Workspace — Microsoft Teams channel.
 *
 * Lets a person ask an agent to do work from Teams, watch the outcome, and
 * approve/deny the risky step with an Adaptive Card — the same governed
 * engine (startWorkspaceRun/resumeWorkspaceRun) as web and Slack. This is a
 * single Bot Framework messaging endpoint, per the Bot Framework contract
 * (https://learn.microsoft.com/microsoftteams/platform/bots/how-to/conversations/conversation-basics).
 *
 * Token model (honest, same shape as Slack's): posting a message back into a
 * Teams conversation after the initial ack requires calling the Bot
 * Framework Connector API with an OAuth2 client-credentials token. When
 * MICROSOFT_APP_ID / MICROSOFT_APP_PASSWORD are set, we ack immediately and
 * post the result via the Connector API (the correct pattern — Bot Framework
 * expects a fast 200 on the initial activity). Without app credentials —
 * local/dev or tests — the endpoint processes synchronously and returns the
 * Adaptive Card payload in the response body, so the exact same formatting +
 * engine path is verifiable with simulated Activity payloads.
 *
 * Auth (honest): with MICROSOFT_APP_ID configured, every inbound request
 * must carry a Bot Framework-issued Authorization: Bearer JWT, verified
 * against Microsoft's rotating public keys (JWKS) with the right issuer and
 * audience — see verifyTeamsAuth. Without an app id, verification is skipped
 * (same "not internet-facing without config" posture as Slack/dev mode).
 *
 * Action.Submit contract: this integration controls both the card it sends
 * and the invoke handler that reads it back, so — like Slack's Block Kit
 * button `value` — the card's submit action carries a simple, self-defined
 * `{ runId, decision }` payload rather than attempting to support every
 * Adaptive Card action-invocation variant in the spec.
 */
import { Router } from "express";
import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import { getDefaultOrgId } from "../auth";
import { startWorkspaceRun, resumeWorkspaceRun, type WorkspaceRunView } from "../workspace-run";

const router = Router();

const appId = () => process.env.MICROSOFT_APP_ID;
const appPassword = () => process.env.MICROSOFT_APP_PASSWORD;

/** Which agent answers Teams. Configurable per deployment; falls back to the
 *  env default so a single-agent Teams bot works out of the box (mirrors
 *  SLACK_WORKSPACE_AGENT_ID). */
function teamsAgentId(): string | undefined {
  return process.env.TEAMS_WORKSPACE_AGENT_ID || undefined;
}

const BOTFRAMEWORK_JWKS_URI = "https://login.botframework.com/v1/.well-known/keys";
const BOTFRAMEWORK_ISSUER = "https://api.botframework.com";

const jwks = jwksClient({ jwksUri: BOTFRAMEWORK_JWKS_URI, cache: true, cacheMaxAge: 60 * 60 * 1000, rateLimit: true });

function getSigningKey(kid: string): Promise<string> {
  return new Promise((resolve, reject) => {
    jwks.getSigningKey(kid, (err, key) => {
      if (err || !key) return reject(err || new Error("no signing key"));
      resolve(key.getPublicKey());
    });
  });
}

/** Verifies the Bot Framework's inbound JWT (RS256, signed by Microsoft,
 *  rotating keys fetched from BOTFRAMEWORK_JWKS_URI). No-ops (allows the
 *  request through) when MICROSOFT_APP_ID isn't configured — see the file
 *  header for why that's the intended dev/test posture. */
async function verifyTeamsAuth(req: any, res: any, next: any) {
  const expectedAudience = appId();
  if (!expectedAudience) return next();

  const authHeader = req.headers["authorization"];
  if (typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing bearer token." });
  }
  const token = authHeader.slice("Bearer ".length);

  try {
    const decoded = jwt.decode(token, { complete: true });
    const kid = decoded?.header?.kid;
    if (!kid) return res.status(401).json({ error: "Token missing key id." });

    const publicKey = await getSigningKey(kid);
    jwt.verify(token, publicKey, {
      algorithms: ["RS256"],
      issuer: BOTFRAMEWORK_ISSUER,
      audience: expectedAudience,
    });
    next();
  } catch (e: any) {
    return res.status(401).json({ error: `Invalid Bot Framework token: ${e.message}` });
  }
}

/** Render a run as a Teams Adaptive Card. On pause, includes an Approve/Deny
 *  Action.Submit whose `data` carries the runId so the invoke can resume it. */
function toAdaptiveCard(view: WorkspaceRunView, title = "Agent Workspace"): any {
  const body: any[] = [{ type: "TextBlock", text: title, weight: "Bolder", size: "Medium" }];
  const actions: any[] = [];

  if (view.status === "awaiting_approval" && view.pending) {
    body.push(
      { type: "TextBlock", text: `**Approval needed** — the agent wants to run \`${view.pending.toolName}\`.`, wrap: true },
      { type: "TextBlock", text: "```" + JSON.stringify(view.pending.args ?? {}) + "```", wrap: true, fontType: "Monospace" },
    );
    actions.push(
      { type: "Action.Submit", title: "Approve", style: "positive", data: { runId: view.id, decision: "approve" } },
      { type: "Action.Submit", title: "Deny", style: "destructive", data: { runId: view.id, decision: "deny" } },
    );
  } else {
    const text = view.status === "completed" ? (view.outputSummary || "Done.")
      : view.status === "denied" ? "The action was denied; no changes were made."
      : `Run ${view.status}.`;
    body.push({ type: "TextBlock", text, wrap: true });
    const facts: any[] = [];
    if (view.costUsd > 0) facts.push({ title: "Cost", value: `$${view.costUsd.toFixed(4)}` });
    facts.push({ title: "Trace", value: view.traceId ? `signed \`${view.traceId.slice(0, 8)}\`` : "governed run" });
    body.push({ type: "FactSet", facts });
  }

  return {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
    body,
    ...(actions.length > 0 ? { actions } : {}),
  };
}

function attachmentFor(card: any) {
  return { contentType: "application/vnd.microsoft.card.adaptive", content: card };
}

let cachedConnectorToken: { token: string; expiresAt: number } | null = null;

/** Client-credentials OAuth2 exchange for a Bot Connector API token. Cached
 *  until shortly before expiry. No-ops (returns null) without credentials —
 *  callers must check for null and fall back to the synchronous dev path. */
async function getConnectorToken(): Promise<string | null> {
  const id = appId();
  const secret = appPassword();
  if (!id || !secret) return null;
  if (cachedConnectorToken && cachedConnectorToken.expiresAt > Date.now() + 60_000) {
    return cachedConnectorToken.token;
  }
  const resp = await fetch("https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: id,
      client_secret: secret,
      scope: "https://api.botframework.com/.default",
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!resp.ok) throw new Error(`Connector token exchange failed: ${resp.status}`);
  const data = await resp.json();
  cachedConnectorToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return cachedConnectorToken.token;
}

/** Posts a new activity into the conversation the incoming activity came
 *  from, using its serviceUrl + conversation id (the standard Bot Framework
 *  "reply/continue this conversation" pattern). No-ops without app
 *  credentials — see the file header. */
async function postToTeams(serviceUrl: string, conversationId: string, card: any): Promise<void> {
  const token = await getConnectorToken().catch(e => {
    console.warn(`[workspace-teams] connector token fetch failed (non-fatal): ${e.message}`);
    return null;
  });
  if (!token) return;
  try {
    await fetch(`${serviceUrl.replace(/\/$/, "")}/v3/conversations/${conversationId}/activities`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ type: "message", attachments: [attachmentFor(card)] }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (e: any) {
    console.warn(`[workspace-teams] activity post failed (non-fatal): ${e.message}`);
  }
}

// POST /api/workspace/teams/messages — the single Bot Framework messaging endpoint.
router.post("/api/workspace/teams/messages", verifyTeamsAuth, async (req, res) => {
  const activity = req.body ?? {};

  // Adaptive Card Action.Submit surfaces as an "invoke" activity. Bot
  // Framework requires a synchronous InvokeResponse envelope — unlike
  // message activities, this is NOT a fire-and-forget ack.
  if (activity.type === "invoke") {
    const data = activity.value?.action?.data ?? activity.value ?? {};
    const runId: string | undefined = data.runId;
    const decision: "approve" | "deny" = data.decision === "deny" ? "deny" : "approve";
    if (!runId) return res.status(200).json({ status: 400, body: { error: "Missing runId in action data." } });

    try {
      const orgId = getDefaultOrgId();
      const user = activity.from?.id;
      const view = await resumeWorkspaceRun({ runId, decision, orgId, actorId: `teams:${user ?? "user"}` });
      const card = toAdaptiveCard(view);
      // Reply in-place: the invoke response body replaces the card that was submitted.
      return res.status(200).json({ status: 200, body: { statusCode: 200, type: "application/vnd.microsoft.card.adaptive", value: card } });
    } catch (e: any) {
      return res.status(200).json({ status: 400, body: { error: e.message } });
    }
  }

  const isUserMessage = activity.type === "message" && typeof activity.text === "string" && !activity.from?.role?.includes("bot");
  if (!isUserMessage) return res.json({ ok: true, ignored: true });

  const agentId = teamsAgentId();
  if (!agentId) return res.json({ ok: false, error: "No Teams agent configured (set TEAMS_WORKSPACE_AGENT_ID)." });

  const orgId = getDefaultOrgId();
  const runOnce = async () => {
    const view = await startWorkspaceRun({ agentId, input: activity.text, orgId, actorId: `teams:${activity.from?.id ?? "user"}` });
    const card = toAdaptiveCard(view, "🤖 Agent Workspace");
    if (activity.serviceUrl && activity.conversation?.id) await postToTeams(activity.serviceUrl, activity.conversation.id, card);
    return { view, card };
  };

  // With credentials: ack immediately, process async, post the result via the Connector API.
  if (appId() && appPassword()) {
    res.json({ ok: true });
    runOnce().catch(e => console.error("[workspace-teams] run failed:", e.message));
    return;
  }
  // Without credentials (dev/test): process synchronously and return the card.
  try {
    const { view, card } = await runOnce();
    res.json({ ok: true, status: view.status, card });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
export { verifyTeamsAuth, toAdaptiveCard };
