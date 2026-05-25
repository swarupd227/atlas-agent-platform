/**
 * Microsoft Graph tool implementations — 14 tools.
 * Each function receives a MicrosoftGraphClient and validated args.
 * graph_send_email appends an agent attribution footer.
 */

import { MicrosoftGraphClient } from "./client";
import type { McpToolResult } from "../../real-mcp-base";

const ok = (data: unknown): McpToolResult => ({
  content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }],
});

/** Append Atlas agent attribution footer to email HTML/text */
function withEmailAttribution(body: string, contentType: "Text" | "HTML", agentName?: string): string {
  const byLine = agentName
    ? `Sent by ${agentName} via Atlas Agent Orchestrator`
    : "Sent via Atlas Agent Orchestrator";
  if (contentType === "HTML") {
    return `${body}<br/><hr/><small style="color:#888">${byLine}</small>`;
  }
  return `${body}\n\n---\n${byLine}`;
}

function maskEmail(email?: string): string | undefined {
  if (!email) return undefined;
  const [user, domain] = email.split("@");
  if (!domain) return email;
  return `${user.slice(0, 2)}***@${domain}`;
}

// ── Tool: graph_send_email ────────────────────────────────────────────────────

export async function graph_send_email(
  client: MicrosoftGraphClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const user_id      = (args.user_id as string | undefined) ?? "me";
  const subject      = args.subject as string | undefined;
  const body_text    = args.body as string | undefined;
  const content_type = (args.content_type as "Text" | "HTML" | undefined) ?? "Text";
  const to           = args.to as string | string[] | undefined;
  const cc           = args.cc as string | string[] | undefined;
  const importance   = (args.importance as "Low" | "Normal" | "High" | undefined) ?? "Normal";
  const agent_name   = args.agent_name as string | undefined;

  if (!subject) throw new Error("subject is required");
  if (!body_text) throw new Error("body is required");
  if (!to) throw new Error("to is required (email address or array)");

  const toList = Array.isArray(to) ? to : [to];
  const ccList = cc ? (Array.isArray(cc) ? cc : [cc]) : [];

  const attributedBody = withEmailAttribution(body_text, content_type, agent_name);

  await client.sendEmail(user_id, {
    subject,
    body: { contentType: content_type, content: attributedBody },
    toRecipients: toList.map(a => ({ emailAddress: { address: a } })),
    ccRecipients: ccList.map(a => ({ emailAddress: { address: a } })),
    importance,
  });

  return ok({
    sent: true,
    subject,
    to: toList,
    cc: ccList.length > 0 ? ccList : undefined,
    attribution_added: true,
  });
}

// ── Tool: graph_get_email ─────────────────────────────────────────────────────

export async function graph_get_email(
  client: MicrosoftGraphClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const user_id    = (args.user_id as string | undefined) ?? "me";
  const message_id = args.message_id as string | undefined;
  if (!message_id) throw new Error("message_id is required");

  const msg = await client.getMessage(user_id, message_id) as any;

  return ok({
    id:            msg?.id,
    subject:       msg?.subject,
    from:          maskEmail(msg?.from?.emailAddress?.address),
    to:            (msg?.toRecipients ?? []).map((r: any) => maskEmail(r.emailAddress?.address)),
    received_at:   msg?.receivedDateTime,
    importance:    msg?.importance,
    is_read:       msg?.isRead,
    body_preview:  msg?.bodyPreview,
    body:          msg?.body?.content,
    content_type:  msg?.body?.contentType,
    has_attachments: msg?.hasAttachments,
    attachments:   (msg?.attachments ?? []).map((a: any) => ({ name: a.name, size: a.size, content_type: a.contentType })),
  });
}

// ── Tool: graph_search_email ──────────────────────────────────────────────────

export async function graph_search_email(
  client: MicrosoftGraphClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const user_id = (args.user_id as string | undefined) ?? "me";
  const query   = args.query as string | undefined;
  const top     = Math.min(Number(args.top ?? 20), 50);

  if (!query) throw new Error("query is required (KQL search expression)");

  const result = await client.searchMessages(user_id, query, top) as any;
  const messages = result?.value ?? [];

  return ok({
    count: messages.length,
    messages: messages.map((m: any) => ({
      id:           m.id,
      subject:      m.subject,
      from:         maskEmail(m.from?.emailAddress?.address),
      received_at:  m.receivedDateTime,
      importance:   m.importance,
      is_read:      m.isRead,
      body_preview: m.bodyPreview,
      has_attachments: m.hasAttachments,
    })),
  });
}

// ── Tool: graph_list_calendar_events ─────────────────────────────────────────

export async function graph_list_calendar_events(
  client: MicrosoftGraphClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const user_id       = (args.user_id as string | undefined) ?? "me";
  const start_datetime = args.start_datetime as string | undefined;
  const end_datetime   = args.end_datetime as string | undefined;
  const top            = Math.min(Number(args.top ?? 25), 100);

  const now   = new Date();
  const later = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
  const start = start_datetime ?? now.toISOString();
  const end   = end_datetime   ?? later.toISOString();

  const result = await client.listCalendarEvents(user_id, start, end, top) as any;
  const events = result?.value ?? [];

  return ok({
    user_id,
    start,
    end,
    count: events.length,
    events: events.map((e: any) => ({
      id:           e.id,
      subject:      e.subject,
      start:        e.start?.dateTime,
      end:          e.end?.dateTime,
      timezone:     e.start?.timeZone,
      is_all_day:   e.isAllDay,
      is_cancelled: e.isCancelled,
      location:     e.location?.displayName ?? null,
      organizer:    maskEmail(e.organizer?.emailAddress?.address),
      attendees:    (e.attendees ?? []).map((a: any) => ({
        email:  maskEmail(a.emailAddress?.address),
        name:   a.emailAddress?.name,
        status: a.status?.response,
        type:   a.type,
      })),
      teams_link: e.onlineMeeting?.joinUrl ?? null,
      body_preview: e.bodyPreview ?? null,
    })),
  });
}

// ── Tool: graph_create_calendar_event ────────────────────────────────────────

export async function graph_create_calendar_event(
  client: MicrosoftGraphClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const user_id    = (args.user_id as string | undefined) ?? "me";
  const subject    = args.subject as string | undefined;
  const start      = args.start_datetime as string | undefined;
  const end        = args.end_datetime as string | undefined;
  const timezone   = (args.timezone as string | undefined) ?? "UTC";
  const body_text  = args.body as string | undefined;
  const location   = args.location as string | undefined;
  const attendees  = args.attendees as string[] | undefined;
  const is_online  = Boolean(args.is_online_meeting ?? true);

  if (!subject) throw new Error("subject is required");
  if (!start)   throw new Error("start_datetime is required (ISO 8601)");
  if (!end)     throw new Error("end_datetime is required (ISO 8601)");

  const event = await client.createCalendarEvent(user_id, {
    subject,
    body: body_text ? { contentType: "Text", content: body_text } : undefined,
    start: { dateTime: start, timeZone: timezone },
    end:   { dateTime: end,   timeZone: timezone },
    location: location ? { displayName: location } : undefined,
    attendees: attendees?.map(a => ({ emailAddress: { address: a }, type: "required" as const })),
    isOnlineMeeting: is_online,
  }) as any;

  return ok({
    created: true,
    id:          event?.id,
    subject:     event?.subject,
    start:       event?.start?.dateTime,
    end:         event?.end?.dateTime,
    teams_link:  event?.onlineMeeting?.joinUrl ?? null,
    web_link:    event?.webLink ?? null,
  });
}

// ── Tool: graph_get_user ──────────────────────────────────────────────────────

export async function graph_get_user(
  client: MicrosoftGraphClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const user_id = args.user_id as string | undefined;
  if (!user_id) throw new Error("user_id is required (email or UPN)");

  const u = await client.getUser(user_id) as any;

  return ok({
    id:                 u?.id,
    display_name:       u?.displayName,
    given_name:         u?.givenName,
    surname:            u?.surname,
    email:              maskEmail(u?.mail ?? u?.userPrincipalName),
    job_title:          u?.jobTitle ?? null,
    department:         u?.department ?? null,
    office_location:    u?.officeLocation ?? null,
    business_phone:     u?.businessPhones?.[0] ?? null,
    mobile_phone:       u?.mobilePhone ?? null,
    usage_location:     u?.usageLocation ?? null,
    preferred_language: u?.preferredLanguage ?? null,
  });
}

// ── Tool: graph_list_users ────────────────────────────────────────────────────

export async function graph_list_users(
  client: MicrosoftGraphClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const search     = args.search as string | undefined;
  const department = args.department as string | undefined;
  const top        = Math.min(Number(args.top ?? 20), 100);

  const filter = department ? `department eq '${department}'` : undefined;
  const result = await client.listUsers(filter, search, top) as any;
  const users  = result?.value ?? [];

  return ok({
    count: users.length,
    users: users.map((u: any) => ({
      id:           u.id,
      display_name: u.displayName,
      email:        maskEmail(u.mail ?? u.userPrincipalName),
      job_title:    u.jobTitle ?? null,
      department:   u.department ?? null,
    })),
  });
}

// ── Tool: graph_post_teams_message ────────────────────────────────────────────

export async function graph_post_teams_message(
  client: MicrosoftGraphClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const team_id    = args.team_id as string | undefined;
  const channel_id = args.channel_id as string | undefined;
  const content    = args.content as string | undefined;

  if (!team_id)    throw new Error("team_id is required");
  if (!channel_id) throw new Error("channel_id is required");
  if (!content)    throw new Error("content is required");

  const result = await client.postTeamsMessage(team_id, channel_id, content) as any;

  return ok({
    ok:         true,
    id:         result?.id,
    team_id,
    channel_id,
    created_at: result?.createdDateTime,
    web_url:    result?.webUrl ?? null,
  });
}

// ── Tool: graph_get_teams_channel_messages ────────────────────────────────────

export async function graph_get_teams_channel_messages(
  client: MicrosoftGraphClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const team_id    = args.team_id as string | undefined;
  const channel_id = args.channel_id as string | undefined;
  const top        = Math.min(Number(args.top ?? 20), 50);

  if (!team_id)    throw new Error("team_id is required");
  if (!channel_id) throw new Error("channel_id is required");

  const result = await client.getTeamsChannelMessages(team_id, channel_id, top) as any;
  const msgs   = result?.value ?? [];

  return ok({
    count: msgs.length,
    team_id,
    channel_id,
    messages: msgs.map((m: any) => ({
      id:         m.id,
      created_at: m.createdDateTime,
      from:       m.from?.user?.displayName ?? m.from?.application?.displayName ?? "Unknown",
      content:    m.body?.content,
      type:       m.body?.contentType,
      importance: m.importance,
    })),
  });
}

// ── Tool: graph_list_teams ────────────────────────────────────────────────────

export async function graph_list_teams(
  client: MicrosoftGraphClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const result = await client.listJoinedTeams() as any;
  const teams  = result?.value ?? [];

  return ok({
    count: teams.length,
    teams: teams.map((t: any) => ({
      id:          t.id,
      display_name: t.displayName,
      description: t.description ?? null,
      is_archived: t.isArchived ?? false,
      visibility:  t.visibility ?? null,
    })),
  });
}

// ── Tool: graph_search_sharepoint ────────────────────────────────────────────

export async function graph_search_sharepoint(
  client: MicrosoftGraphClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const query        = args.query as string | undefined;
  const entity_types = (args.entity_types as string[] | undefined) ?? ["driveItem", "listItem", "site"];
  const size         = Math.min(Number(args.size ?? 10), 25);

  if (!query) throw new Error("query is required");

  const result = await client.searchSharePoint(query, entity_types, size) as any;
  const hits   = result?.value?.[0]?.hitsContainers?.[0]?.hits ?? [];

  return ok({
    count: hits.length,
    query,
    results: hits.map((h: any) => ({
      id:           h.hitId,
      name:         h.resource?.name ?? h.resource?.displayName,
      web_url:      h.resource?.webUrl,
      type:         h.resource?.["@odata.type"]?.replace("#microsoft.graph.", ""),
      last_modified: h.resource?.lastModifiedDateTime,
      size:         h.resource?.size ?? null,
      file_type:    h.resource?.file?.mimeType ?? null,
      summary:      h.summary ?? null,
    })),
  });
}

// ── Tool: graph_get_sharepoint_file ──────────────────────────────────────────

export async function graph_get_sharepoint_file(
  client: MicrosoftGraphClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const drive_id = args.drive_id as string | undefined;
  const item_id  = args.item_id as string | undefined;

  if (!drive_id) throw new Error("drive_id is required");
  if (!item_id)  throw new Error("item_id is required");

  const item = await client.getSharePointFile(drive_id, item_id) as any;

  return ok({
    id:            item?.id,
    name:          item?.name,
    web_url:       item?.webUrl,
    download_url:  item?.["@microsoft.graph.downloadUrl"] ?? null,
    size:          item?.size,
    last_modified: item?.lastModifiedDateTime,
    created_at:    item?.createdDateTime,
    mime_type:     item?.file?.mimeType ?? null,
    created_by:    item?.createdBy?.user?.displayName ?? null,
    modified_by:   item?.lastModifiedBy?.user?.displayName ?? null,
    etag:          item?.eTag ?? null,
  });
}

// ── Tool: graph_read_sharepoint_page ─────────────────────────────────────────

export async function graph_read_sharepoint_page(
  client: MicrosoftGraphClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const site_id = args.site_id as string | undefined;
  const page_id = args.page_id as string | undefined;

  if (!site_id) throw new Error("site_id is required");
  if (!page_id) throw new Error("page_id is required");

  const page = await client.readSharePointPage(site_id, page_id) as any;

  // Strip HTML tags for plain text summary
  const htmlContent = page?.canvasLayout?.horizontalSections?.flatMap((s: any) =>
    s.columns?.flatMap((c: any) => c.webparts?.map((w: any) => w.innerHtml ?? "")) ?? []
  ).join("\n") ?? "";
  const plainText = htmlContent.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  return ok({
    id:           page?.id,
    title:        page?.title,
    web_url:      page?.webUrl,
    published_at: page?.publishingState?.publishedDateTime ?? null,
    content:      plainText.slice(0, 4000) + (plainText.length > 4000 ? "… [truncated]" : ""),
  });
}

// ── Tool: graph_get_onedrive_file ─────────────────────────────────────────────

export async function graph_get_onedrive_file(
  client: MicrosoftGraphClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const user_id   = (args.user_id as string | undefined) ?? "me";
  const item_path = args.item_path as string | undefined;

  if (!item_path) throw new Error("item_path is required (e.g. Documents/report.pdf)");

  const item = await client.getOneDriveFile(user_id, item_path) as any;

  return ok({
    id:            item?.id,
    name:          item?.name,
    web_url:       item?.webUrl,
    download_url:  item?.["@microsoft.graph.downloadUrl"] ?? null,
    size:          item?.size,
    last_modified: item?.lastModifiedDateTime,
    created_at:    item?.createdDateTime,
    mime_type:     item?.file?.mimeType ?? null,
    modified_by:   item?.lastModifiedBy?.user?.displayName ?? null,
  });
}
