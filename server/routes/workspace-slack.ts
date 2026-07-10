/**
 * Agent Workspace — Slack channel.
 *
 * Lets a person ask an agent to do work from Slack, watch the outcome, and
 * approve/deny the risky step with Block Kit buttons — the same governed
 * engine as the web Workspace.
 *
 * Token model (honest): posting back to Slack needs a bot token. When
 * SLACK_BOT_TOKEN is set we ack Slack immediately and post the result via
 * chat.postMessage (the correct <3s-ack pattern). Without a token — local/dev
 * or tests — the endpoint returns the Block Kit payload synchronously so the
 * exact same formatting + engine path is verifiable with simulated payloads.
 *
 * Signature verification (honest, same shape as the token model): with
 * SLACK_SIGNING_SECRET set, every request must carry a valid Slack signature
 * (https://api.slack.com/authentication/verifying-requests-from-slack) or it
 * is rejected — otherwise anyone who finds these URLs could start agent runs
 * or forge approve/deny decisions as if they came from Slack. Without a
 * signing secret — local/dev or tests — verification is skipped, matching
 * the same "not internet-facing without config" posture as the bot token.
 */
import { Router } from "express";
import { timingSafeEqual, createHmac } from "crypto";
import { getDefaultOrgId } from "../auth";
import { startWorkspaceRun, resumeWorkspaceRun, type WorkspaceRunView } from "../workspace-run";

const router = Router();

const botToken = () => process.env.SLACK_BOT_TOKEN;

const SLACK_TIMESTAMP_TOLERANCE_SEC = 60 * 5;

/** Verifies Slack's HMAC request signature against the exact raw request
 *  bytes (index.ts captures these via express.json/urlencoded `verify`).
 *  No-ops (allows the request through) when SLACK_SIGNING_SECRET isn't
 *  configured — see the file header for why that's the intended dev/test
 *  posture rather than a silent security hole. */
export function verifySlackSignature(req: any, res: any, next: any) {
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret) return next();

  const signature = req.headers["x-slack-signature"];
  const timestamp = req.headers["x-slack-request-timestamp"];
  const rawBody = req.rawBody;
  if (typeof signature !== "string" || typeof timestamp !== "string" || !rawBody) {
    return res.status(401).json({ ok: false, error: "Missing Slack signature headers." });
  }

  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > SLACK_TIMESTAMP_TOLERANCE_SEC) {
    return res.status(401).json({ ok: false, error: "Slack request timestamp is stale — possible replay." });
  }

  const baseString = `v0:${timestamp}:${rawBody.toString("utf8")}`;
  const expected = "v0=" + createHmac("sha256", secret).update(baseString).digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  const actualBuf = Buffer.from(signature, "utf8");
  if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
    return res.status(401).json({ ok: false, error: "Invalid Slack signature." });
  }
  next();
}

/** Which agent answers Slack. Configurable per deployment; falls back to the
 *  env default so a single-agent Slack bot works out of the box. */
function slackAgentId(): string | undefined {
  return process.env.SLACK_WORKSPACE_AGENT_ID || undefined;
}

/** Render a run as Slack Block Kit. On pause, includes Approve/Deny buttons
 *  whose value carries the runId so the interaction can resume it. */
function toBlocks(view: WorkspaceRunView, header = "Agent Workspace"): any[] {
  const blocks: any[] = [{ type: "header", text: { type: "plain_text", text: header } }];

  if (view.status === "awaiting_approval" && view.pending) {
    blocks.push(
      { type: "section", text: { type: "mrkdwn", text: `*Approval needed* — the agent wants to run \`${view.pending.toolName}\`.` } },
      { type: "section", text: { type: "mrkdwn", text: "```" + JSON.stringify(view.pending.args ?? {}) + "```" } },
      {
        type: "actions",
        elements: [
          { type: "button", style: "primary", text: { type: "plain_text", text: "Approve" }, action_id: "ws_approve", value: JSON.stringify({ runId: view.id, decision: "approve" }) },
          { type: "button", style: "danger", text: { type: "plain_text", text: "Deny" }, action_id: "ws_deny", value: JSON.stringify({ runId: view.id, decision: "deny" }) },
        ],
      },
    );
    return blocks;
  }

  const body = view.status === "completed" ? (view.outputSummary || "Done.")
    : view.status === "denied" ? "The action was denied; no changes were made."
    : `Run ${view.status}.`;
  blocks.push({ type: "section", text: { type: "mrkdwn", text: body } });
  const ctx: string[] = [];
  if (view.costUsd > 0) ctx.push(`:receipt: $${view.costUsd.toFixed(4)}`);
  ctx.push(view.traceId ? `:lock: signed trace \`${view.traceId.slice(0, 8)}\`` : ":lock: governed run");
  blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: ctx.join("  ·  ") }] });
  return blocks;
}

async function postToSlack(channel: string, blocks: any[]): Promise<void> {
  const token = botToken();
  if (!token) return;
  try {
    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ channel, blocks, text: "Agent Workspace update" }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (e: any) {
    console.warn(`[workspace-slack] postMessage failed (non-fatal): ${e.message}`);
  }
}

// POST /api/workspace/slack/events — Slack Events API (message → run).
router.post("/api/workspace/slack/events", verifySlackSignature, async (req, res) => {
  const body = req.body ?? {};

  // 1. URL verification handshake.
  if (body.type === "url_verification") return res.json({ challenge: body.challenge });

  const event = body.event ?? {};
  const isUserMessage = event.type === "message" && !event.bot_id && !event.subtype && typeof event.text === "string";
  if (!isUserMessage) return res.json({ ok: true, ignored: true });

  const agentId = slackAgentId();
  if (!agentId) return res.json({ ok: false, error: "No Slack agent configured (set SLACK_WORKSPACE_AGENT_ID)." });

  const orgId = getDefaultOrgId();
  const runOnce = async () => {
    const view = await startWorkspaceRun({ agentId, input: event.text, orgId, actorId: `slack:${event.user ?? "user"}` });
    const blocks = toBlocks(view, "🤖 Agent Workspace");
    await postToSlack(event.channel, blocks);
    return { view, blocks };
  };

  // With a token: ack immediately (Slack's 3s rule), process async, post result.
  if (botToken()) {
    res.json({ ok: true });
    runOnce().catch(e => console.error("[workspace-slack] run failed:", e.message));
    return;
  }
  // Without a token (dev/test): process synchronously and return the blocks.
  try {
    const { view, blocks } = await runOnce();
    res.json({ ok: true, status: view.status, blocks });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/workspace/slack/actions — Block Kit button interactions (approve/deny).
router.post("/api/workspace/slack/actions", verifySlackSignature, async (req, res) => {
  // Slack posts urlencoded `payload=<json>`; tests may post JSON directly.
  let payload: any = req.body?.payload ?? req.body;
  if (typeof payload === "string") { try { payload = JSON.parse(payload); } catch { payload = {}; } }

  const action = payload?.actions?.[0] ?? payload?.action ?? {};
  let value: any = action.value ?? payload;
  if (typeof value === "string") { try { value = JSON.parse(value); } catch { /* leave */ } }
  const runId: string | undefined = value?.runId;
  const decision: "approve" | "deny" = value?.decision === "deny" ? "deny" : "approve";
  const channel = payload?.channel?.id ?? payload?.channel;
  const user = payload?.user?.id ?? payload?.user;

  if (!runId) return res.status(400).json({ ok: false, error: "Missing runId in action value." });

  try {
    const orgId = getDefaultOrgId();
    const view = await resumeWorkspaceRun({ runId, decision, orgId, actorId: `slack:${user ?? "user"}` });
    const blocks = toBlocks(view, "🤖 Agent Workspace");
    if (channel) await postToSlack(channel, blocks);
    res.json({ ok: true, status: view.status, blocks });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

export default router;
