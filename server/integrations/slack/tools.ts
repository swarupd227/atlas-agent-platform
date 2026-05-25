/**
 * Slack tool implementations — 12 tools.
 * Each function receives a SlackClient and validated args.
 * slack_post_message and slack_post_threaded_reply append an agent attribution footer.
 */

import { SlackClient } from "./client";
import type { McpToolResult } from "../../real-mcp-base";

const ok = (data: unknown): McpToolResult => ({
  content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }],
});

/** Append Atlas agent attribution footer to messages */
function withAttribution(text: string, agentName?: string): string {
  const byLine = agentName ? `Sent by *${agentName}* via Atlas` : "Sent via Atlas Agent Orchestrator";
  return `${text}\n\n_${byLine}_`;
}

function maskEmail(email?: string): string | undefined {
  if (!email) return undefined;
  const [user, domain] = email.split("@");
  if (!domain) return email;
  return `${user.slice(0, 2)}***@${domain}`;
}

// ── Tool: slack_post_message ─────────────────────────────────────────────────

export async function slack_post_message(
  client: SlackClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const channel = args.channel as string | undefined;
  const text    = args.text as string | undefined;
  const blocks  = args.blocks as unknown[] | undefined;
  const agent_name = args.agent_name as string | undefined;

  if (!channel) throw new Error("channel is required");
  if (!text && !blocks) throw new Error("Either text or blocks is required");

  // Attribution: always append footer to text; for block-only posts, inject a
  // plain-text context block at the bottom (used for accessibility + transparency)
  const attributedText = text ? withAttribution(text, agent_name) : undefined;

  let finalBlocks = blocks;
  if (blocks && !text) {
    const byLine = agent_name ? `Sent by *${agent_name}* via Atlas` : "Sent via Atlas Agent Orchestrator";
    finalBlocks = [
      ...blocks,
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: `_${byLine}_` }],
      },
    ];
  }

  const result = await client.postMessage({
    channel,
    text: attributedText ?? (blocks ? "Atlas agent message" : ""),
    blocks: finalBlocks,
    mrkdwn: true,
  });

  return ok({
    ok: true,
    channel: result.channel,
    ts: result.ts,
    message: (result.message as any)?.text,
    attribution_added: true,
  });
}

// ── Tool: slack_post_threaded_reply ──────────────────────────────────────────

export async function slack_post_threaded_reply(
  client: SlackClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const channel = args.channel as string | undefined;
  const thread_ts = args.thread_ts as string | undefined;
  const text = args.text as string | undefined;
  const agent_name = args.agent_name as string | undefined;

  if (!channel) throw new Error("channel is required");
  if (!thread_ts) throw new Error("thread_ts is required");
  if (!text) throw new Error("text is required");

  const attributed = withAttribution(text, agent_name);

  const result = await client.postMessage({ channel, text: attributed, thread_ts, mrkdwn: true });
  return ok({ ok: true, channel: result.channel, ts: result.ts, thread_ts: result.message && (result.message as any).thread_ts });
}

// ── Tool: slack_get_channel_history ─────────────────────────────────────────

export async function slack_get_channel_history(
  client: SlackClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const channel = args.channel as string | undefined;
  const limit   = Math.min(Number(args.limit ?? 20), 100);
  const oldest  = args.oldest as string | undefined;
  const latest  = args.latest as string | undefined;

  if (!channel) throw new Error("channel is required");

  const result = await client.getChannelHistory(channel, limit, oldest, latest);
  const messages = (result.messages as any[]) ?? [];

  return ok({
    channel,
    count: messages.length,
    has_more: result.has_more ?? false,
    messages: messages.map(m => ({
      ts:     m.ts,
      type:   m.type,
      user:   m.user,
      text:   m.text,
      reply_count: m.reply_count ?? 0,
      reactions: (m.reactions ?? []).map((r: any) => ({ name: r.name, count: r.count })),
    })),
  });
}

// ── Tool: slack_search_messages ──────────────────────────────────────────────

export async function slack_search_messages(
  client: SlackClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const query   = args.query as string | undefined;
  const channel = args.channel as string | undefined;
  const count   = Math.min(Number(args.count ?? 20), 100);

  if (!query) throw new Error("query is required");

  const result = await client.searchMessages(query, count, 1, channel);
  const matches = (result.messages as any)?.matches ?? [];

  return ok({
    query,
    total: (result.messages as any)?.total ?? matches.length,
    count: matches.length,
    messages: matches.map((m: any) => ({
      ts:       m.ts,
      channel:  m.channel?.name ?? m.channel?.id,
      user:     m.username,
      text:     m.text,
      permalink: m.permalink,
    })),
  });
}

// ── Tool: slack_get_user ─────────────────────────────────────────────────────

export async function slack_get_user(
  client: SlackClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const user_id = args.user_id as string | undefined;
  const email   = args.email as string | undefined;

  let userId = user_id;

  if (!userId && email) {
    const lookup = await client.lookupUserByEmail(email);
    userId = (lookup.user as any)?.id;
  }
  if (!userId) throw new Error("Either user_id or email is required");

  const [infoRes, presenceRes] = await Promise.all([
    client.getUserInfo(userId),
    client.getUserPresence(userId).catch(() => ({ presence: "unknown" })),
  ]);

  const profile = (infoRes.user as any)?.profile ?? {};
  return ok({
    id:           (infoRes.user as any)?.id,
    name:         (infoRes.user as any)?.name,
    real_name:    profile.real_name,
    display_name: profile.display_name,
    email:        maskEmail(profile.email),
    title:        profile.title,
    phone:        profile.phone ?? null,
    timezone:     (infoRes.user as any)?.tz,
    is_bot:       (infoRes.user as any)?.is_bot ?? false,
    presence:     (presenceRes as any).presence ?? "unknown",
  });
}

// ── Tool: slack_list_channels ────────────────────────────────────────────────

export async function slack_list_channels(
  client: SlackClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const limit  = Math.min(Number(args.limit ?? 100), 1000);
  const cursor = args.cursor as string | undefined;

  const result = await client.listChannels(limit, cursor);
  const channels = (result.channels as any[]) ?? [];

  return ok({
    count: channels.length,
    next_cursor: (result.response_metadata as any)?.next_cursor ?? null,
    channels: channels.map(c => ({
      id:           c.id,
      name:         c.name,
      is_private:   c.is_private,
      num_members:  c.num_members ?? 0,
      topic:        c.topic?.value ?? null,
      purpose:      c.purpose?.value ?? null,
      is_archived:  c.is_archived,
    })),
  });
}

// ── Tool: slack_get_thread ────────────────────────────────────────────────────

export async function slack_get_thread(
  client: SlackClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const channel   = args.channel as string | undefined;
  const thread_ts = args.thread_ts as string | undefined;
  const limit     = Math.min(Number(args.limit ?? 50), 200);

  if (!channel)   throw new Error("channel is required");
  if (!thread_ts) throw new Error("thread_ts is required");

  const result = await client.getReplies(channel, thread_ts, limit);
  const messages = (result.messages as any[]) ?? [];

  return ok({
    channel,
    thread_ts,
    count: messages.length,
    has_more: result.has_more ?? false,
    messages: messages.map(m => ({
      ts:   m.ts,
      user: m.user,
      text: m.text,
      reactions: (m.reactions ?? []).map((r: any) => ({ name: r.name, count: r.count })),
    })),
  });
}

// ── Tool: slack_set_channel_topic ────────────────────────────────────────────

export async function slack_set_channel_topic(
  client: SlackClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const channel = args.channel as string | undefined;
  const topic   = args.topic as string | undefined;

  if (!channel) throw new Error("channel is required");
  if (!topic)   throw new Error("topic is required");

  const result = await client.setTopic(channel, topic);
  return ok({ ok: true, channel, topic: (result.channel as any)?.topic?.value ?? topic });
}

// ── Tool: slack_add_reaction ─────────────────────────────────────────────────

export async function slack_add_reaction(
  client: SlackClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const channel   = args.channel as string | undefined;
  const timestamp = args.timestamp as string | undefined;
  const name      = (args.name as string | undefined)?.replace(/:/g, ""); // strip : if provided

  if (!channel)   throw new Error("channel is required");
  if (!timestamp) throw new Error("timestamp is required");
  if (!name)      throw new Error("name is required (emoji name without colons)");

  await client.addReaction(channel, timestamp, name);
  return ok({ ok: true, channel, timestamp, emoji: `:${name}:` });
}

// ── Tool: slack_get_file ─────────────────────────────────────────────────────

export async function slack_get_file(
  client: SlackClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const file = args.file_id as string | undefined;
  if (!file) throw new Error("file_id is required");

  const result = await client.getFileInfo(file);
  const f = result.file as any;

  return ok({
    id:            f?.id,
    name:          f?.name,
    title:         f?.title,
    mimetype:      f?.mimetype,
    filetype:      f?.filetype,
    size:          f?.size,
    url_private:   f?.url_private,
    permalink:     f?.permalink,
    created:       f?.created,
    user:          f?.user,
    channels:      f?.channels ?? [],
    comments_count: f?.comments_count ?? 0,
  });
}

// ── Tool: slack_create_canvas ────────────────────────────────────────────────

export async function slack_create_canvas(
  client: SlackClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const title      = args.title as string | undefined;
  const channel_id = args.channel_id as string | undefined;
  const markdown   = args.markdown as string | undefined;

  if (!title) throw new Error("title is required");

  const result = await client.createCanvas({
    title,
    channel_id,
    ...(markdown ? { document_content: { type: "markdown", markdown } } : {}),
  });

  return ok({
    ok:         true,
    canvas_id:  result.canvas_id,
    channel_id: result.channel_id ?? channel_id ?? null,
    title,
  });
}

// ── Tool: slack_lookup_user_by_email ─────────────────────────────────────────

export async function slack_lookup_user_by_email(
  client: SlackClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const email = args.email as string | undefined;
  if (!email) throw new Error("email is required");

  const result = await client.lookupUserByEmail(email);
  const u = result.user as any;

  return ok({
    id:           u?.id,
    name:         u?.name,
    real_name:    u?.profile?.real_name,
    display_name: u?.profile?.display_name,
    email:        maskEmail(u?.profile?.email),
    is_bot:       u?.is_bot ?? false,
    timezone:     u?.tz,
  });
}
