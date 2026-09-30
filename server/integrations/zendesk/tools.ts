/**
 * Zendesk tool implementations — 7 tools.
 * Each function receives a ZendeskClient and the validated args.
 */

import { ZendeskClient } from "./client";
import type { McpToolResult } from "../../real-mcp-base";

// ── Tool: zendesk_search_tickets ────────────────────────────────────────────────

export async function zendesk_search_tickets(
  client: ZendeskClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const query = args.query as string | undefined;
  const status = args.status as string | undefined;
  const priority = args.priority as string | undefined;
  const tag = args.tag as string | undefined;
  const assignee_email = args.assignee_email as string | undefined;
  const text = args.text as string | undefined;

  const parts: string[] = [];
  if (status) parts.push(`status:${status}`);
  if (priority) parts.push(`priority:${priority}`);
  if (tag) parts.push(`tags:${tag}`);
  if (assignee_email) parts.push(`assignee:${assignee_email}`);
  if (text) parts.push(text);
  if (query) parts.push(query);

  const result = await client.searchTickets(parts.join(" "), "updated_at", "desc");

  const tickets = await Promise.all(
    result.results.map(async t => ({
      id: t.id,
      subject: t.subject,
      status: t.status,
      priority: t.priority,
      tags: t.tags,
      requester: maskEmail(await resolveEmail(client, t.requester_id)),
      assignee: t.assignee_id ? maskEmail(await resolveEmail(client, t.assignee_id)) : null,
      created_at: t.created_at,
      updated_at: t.updated_at,
      url: client.subdomain ? `https://${client.subdomain}.zendesk.com/agent/tickets/${t.id}` : undefined,
    }))
  );

  return ok({ count: tickets.length, total: result.count, tickets });
}

// ── Tool: zendesk_get_ticket ────────────────────────────────────────────────────

export async function zendesk_get_ticket(
  client: ZendeskClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const ticket_id = args.ticket_id as string | number | undefined;
  if (!ticket_id) throw new Error("ticket_id is required");

  const { ticket, comments } = await client.getTicket(ticket_id);

  return ok({
    id: ticket.id,
    subject: ticket.subject,
    description: ticket.description ?? null,
    status: ticket.status,
    priority: ticket.priority,
    tags: ticket.tags,
    requester_id: ticket.requester_id,
    assignee_id: ticket.assignee_id,
    created_at: ticket.created_at,
    updated_at: ticket.updated_at,
    comments: comments.slice(-10).map(c => ({
      id: c.id,
      body: c.body,
      visibility: c.public ? "public" : "internal",
      author_id: c.author_id,
      created_at: c.created_at,
    })),
    url: client.subdomain ? `https://${client.subdomain}.zendesk.com/agent/tickets/${ticket.id}` : undefined,
  });
}

// ── Tool: zendesk_add_internal_note ─────────────────────────────────────────────

export async function zendesk_add_internal_note(
  client: ZendeskClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const ticket_id = args.ticket_id as string | number | undefined;
  const body = args.body as string | undefined;
  if (!ticket_id) throw new Error("ticket_id is required");
  if (!body) throw new Error("body is required");

  await client.addInternalNote(ticket_id, body);
  return ok({ added: true, ticket_id, visibility: "internal" });
}

// ── Tool: zendesk_add_tags ───────────────────────────────────────────────────────

export async function zendesk_add_tags(
  client: ZendeskClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const ticket_id = args.ticket_id as string | number | undefined;
  const tags = args.tags as string[] | undefined;
  if (!ticket_id) throw new Error("ticket_id is required");
  if (!tags?.length) throw new Error("tags is required (non-empty array)");

  await client.addTag(ticket_id, tags);
  return ok({ tagged: true, ticket_id, tags });
}

// ── Tool: zendesk_update_status ─────────────────────────────────────────────────

const VALID_STATUSES = ["new", "open", "pending", "hold", "solved", "closed"];

export async function zendesk_update_status(
  client: ZendeskClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const ticket_id = args.ticket_id as string | number | undefined;
  const status = args.status as string | undefined;
  if (!ticket_id) throw new Error("ticket_id is required");
  if (!status) throw new Error("status is required");
  if (!VALID_STATUSES.includes(status)) {
    throw new Error(`status must be one of: ${VALID_STATUSES.join(", ")}`);
  }

  await client.updateTicketStatus(ticket_id, status);
  return ok({ updated: true, ticket_id, status });
}

// ── Tool: zendesk_get_user ───────────────────────────────────────────────────────

export async function zendesk_get_user(
  client: ZendeskClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const user_id = args.user_id as string | number | undefined;
  const email = args.email as string | undefined;
  if (!user_id && !email) throw new Error("Either user_id or email is required");

  const user = user_id ? await client.getUser(user_id) : await client.getUserByEmail(email!);
  if (!user) throw new Error(`No Zendesk user found matching '${maskEmail(email)}'`);

  return ok({
    id: user.id,
    name: user.name,
    email: maskEmail(user.email),
    role: user.role,
  });
}

// ── Tool: zendesk_list_recent_tickets ───────────────────────────────────────────

export async function zendesk_list_recent_tickets(
  client: ZendeskClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const updated_since = args.updated_since as string | undefined;
  const status = args.status as string | undefined;
  const priority = args.priority as string | undefined;
  const max_results = Math.min(Number(args.max_results ?? 25), 100);

  const tickets = await client.listTickets({ status, priority, updated_since }, max_results);

  return ok({
    count: tickets.length,
    tickets: tickets.map(t => ({
      id: t.id,
      subject: t.subject,
      status: t.status,
      priority: t.priority,
      tags: t.tags,
      updated_at: t.updated_at,
      url: client.subdomain ? `https://${client.subdomain}.zendesk.com/agent/tickets/${t.id}` : undefined,
    })),
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ok(data: unknown): McpToolResult {
  return {
    content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }],
  };
}

/** Partially mask an email address for audit-safe output */
function maskEmail(email: string | undefined | null): string | null {
  if (!email) return null;
  const at = email.indexOf("@");
  if (at <= 0) return "****";
  const local = email.slice(0, at);
  const domain = email.slice(at);
  const visible = local.length > 2 ? local.slice(0, 2) : local[0];
  return `${visible}****${domain}`;
}

/** Resolve a user id to an email address for masking in list/search results.
 *  Failures fall back to null rather than surfacing an error for a display-only field. */
async function resolveEmail(client: ZendeskClient, userId: number | null | undefined): Promise<string | null> {
  if (!userId) return null;
  try {
    const user = await client.getUser(userId);
    return user.email ?? null;
  } catch {
    return null;
  }
}
