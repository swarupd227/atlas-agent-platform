/**
 * Slack Web API client — wraps REST calls to https://slack.com/api/*
 * All methods return the parsed JSON body or throw on network/API error.
 */

export const SLACK_BASE = "https://slack.com/api";

type SlackFetcher = (path: string, options?: RequestInit) => Promise<Response>;

/** Throw if the Slack API returns ok:false */
async function parseSlack(res: Response): Promise<Record<string, unknown>> {
  let body: Record<string, unknown>;
  try {
    body = await res.json() as Record<string, unknown>;
  } catch {
    throw new Error(`Slack API returned non-JSON (HTTP ${res.status})`);
  }
  if (!body.ok) {
    const errStr = (body.error as string | undefined) ?? "unknown_error";
    const warning = (body.warning as string | undefined) ?? "";
    const needed = (body.needed as string | undefined) ?? "";
    let msg = `Slack API error: ${errStr}`;
    if (needed) msg += ` (needed scope: ${needed})`;
    if (warning) msg += ` [warning: ${warning}]`;
    throw new Error(msg);
  }
  return body;
}

export class SlackClient {
  constructor(private readonly fetch: SlackFetcher) {}

  /** POST to a Slack API method with a JSON body */
  private async post(method: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const res = await this.fetch(`/${method}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    return parseSlack(res);
  }

  /** GET a Slack API method with query params */
  private async get(method: string, params: Record<string, string | number | boolean | undefined>): Promise<Record<string, unknown>> {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) sp.set(k, String(v));
    }
    const res = await this.fetch(`/${method}?${sp.toString()}`);
    return parseSlack(res);
  }

  // ── Chat ────────────────────────────────────────────────────────────────────

  async postMessage(params: {
    channel: string;
    text: string;
    blocks?: unknown[];
    thread_ts?: string;
    mrkdwn?: boolean;
  }): Promise<Record<string, unknown>> {
    return this.post("chat.postMessage", { ...params, mrkdwn: params.mrkdwn ?? true });
  }

  // ── Conversations ───────────────────────────────────────────────────────────

  async getChannelHistory(channel: string, limit = 20, oldest?: string, latest?: string): Promise<Record<string, unknown>> {
    return this.get("conversations.history", { channel, limit, oldest, latest });
  }

  async getReplies(channel: string, ts: string, limit = 50): Promise<Record<string, unknown>> {
    return this.get("conversations.replies", { channel, ts, limit });
  }

  async listChannels(limit = 100, cursor?: string): Promise<Record<string, unknown>> {
    return this.get("conversations.list", {
      limit,
      cursor,
      types: "public_channel,private_channel",
      exclude_archived: true,
    });
  }

  async setTopic(channel: string, topic: string): Promise<Record<string, unknown>> {
    return this.post("conversations.setTopic", { channel, topic });
  }

  // ── Search (requires user_token, not bot_token) ────────────────────────────

  async searchMessages(query: string, count = 20, page = 1, channel?: string): Promise<Record<string, unknown>> {
    return this.get("search.messages", {
      query: channel ? `${query} in:${channel}` : query,
      count,
      page,
      sort: "timestamp",
      sort_dir: "desc",
    });
  }

  // ── Users ───────────────────────────────────────────────────────────────────

  async lookupUserByEmail(email: string): Promise<Record<string, unknown>> {
    return this.get("users.lookupByEmail", { email });
  }

  async getUserInfo(user: string): Promise<Record<string, unknown>> {
    return this.get("users.info", { user, include_locale: true });
  }

  async getUserPresence(user: string): Promise<Record<string, unknown>> {
    return this.get("users.getPresence", { user });
  }

  // ── Reactions ───────────────────────────────────────────────────────────────

  async addReaction(channel: string, timestamp: string, name: string): Promise<Record<string, unknown>> {
    return this.post("reactions.add", { channel, timestamp, name });
  }

  // ── Files ───────────────────────────────────────────────────────────────────

  async getFileInfo(file: string): Promise<Record<string, unknown>> {
    return this.get("files.info", { file });
  }

  // ── Canvases ────────────────────────────────────────────────────────────────

  async createCanvas(params: {
    title: string;
    channel_id?: string;
    document_content?: { type: string; markdown: string };
  }): Promise<Record<string, unknown>> {
    return this.post("canvases.create", params);
  }

  // ── Auth ─────────────────────────────────────────────────────────────────────

  async authTest(): Promise<Record<string, unknown>> {
    return this.get("auth.test", {});
  }
}
