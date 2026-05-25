/**
 * Microsoft Graph API v1.0 client
 * Auth: Bearer access_token (OAuth2, delegated or application permissions)
 * Base URL: https://graph.microsoft.com/v1.0
 * Token refresh is handled by RealMcpBase.refreshOAuthToken / fetchWithAuth (401 retry).
 *
 * Routing semantics:
 * - When userId === "me" (the default for delegated/on-behalf-of access), we use /me/...
 *   so the Graph API resolves the authenticated user's mailbox/calendar/OneDrive.
 * - When userId is an explicit UPN or GUID (service-account / admin impersonation),
 *   we use /users/{userId}/... so the call targets that specific user.
 */

export const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

type GraphFetcher = (path: string, options?: RequestInit) => Promise<Response>;

/** Parse JSON body, throw on non-2xx */
async function parseGraph(res: Response): Promise<unknown> {
  const text = await res.text();
  if (res.status === 204 || !text) return null;
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Graph API returned non-JSON (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    const err = (body as any)?.error;
    const code = err?.code ?? res.status;
    const message = err?.message ?? "Unknown error";
    if (res.status === 403) {
      throw new Error(`Graph permission denied [${code}]: ${message}. Ensure the required Microsoft Graph app permissions are consented via the admin consent URL.`);
    }
    throw new Error(`Graph API error [${code}]: ${message}`);
  }
  return body;
}

export class MicrosoftGraphClient {
  constructor(private readonly fetch: GraphFetcher) {}

  private async get(path: string): Promise<unknown> {
    return parseGraph(await this.fetch(path));
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    return parseGraph(await this.fetch(path, {
      method: "POST",
      body: JSON.stringify(body),
    }));
  }

  /**
   * Returns the base path prefix for user-scoped API calls:
   * - "me"        → "/me"   (delegated — uses the token's own identity)
   * - anything else → "/users/{encoded}" (admin/service-account impersonation)
   */
  private userBase(userId: string): string {
    return userId === "me" ? "/me" : `/users/${encodeURIComponent(userId)}`;
  }

  // ── Users / Azure AD ────────────────────────────────────────────────────────

  async getMe(): Promise<unknown> {
    return this.get("/me");
  }

  async getUser(userIdOrEmail: string): Promise<unknown> {
    return this.get(`/users/${encodeURIComponent(userIdOrEmail)}`);
  }

  async listUsers(filter?: string, search?: string, top = 20): Promise<unknown> {
    const sp = new URLSearchParams({ $top: String(top) });
    if (filter) sp.set("$filter", filter);
    if (search) sp.set("$search", `"${search}"`);
    return this.get(`/users?${sp.toString()}`);
  }

  // ── Email (Exchange / Outlook) ───────────────────────────────────────────────

  async sendEmail(userId: string, message: {
    subject: string;
    body: { contentType: "Text" | "HTML"; content: string };
    toRecipients: { emailAddress: { address: string; name?: string } }[];
    ccRecipients?: { emailAddress: { address: string; name?: string } }[];
    importance?: "Low" | "Normal" | "High";
  }): Promise<null> {
    return this.post(`${this.userBase(userId)}/sendMail`, {
      message,
      saveToSentItems: true,
    }) as Promise<null>;
  }

  async getMessage(userId: string, messageId: string): Promise<unknown> {
    return this.get(`${this.userBase(userId)}/messages/${encodeURIComponent(messageId)}?$expand=attachments`);
  }

  async searchMessages(userId: string, query: string, top = 20): Promise<unknown> {
    const sp = new URLSearchParams({
      $search: `"${query}"`,
      $top: String(top),
      $select: "id,subject,from,receivedDateTime,importance,isRead,bodyPreview,hasAttachments",
    });
    return this.get(`${this.userBase(userId)}/messages?${sp.toString()}`);
  }

  // ── Calendar ─────────────────────────────────────────────────────────────────

  async listCalendarEvents(userId: string, startDateTime: string, endDateTime: string, top = 25): Promise<unknown> {
    const sp = new URLSearchParams({
      startDateTime,
      endDateTime,
      $top: String(top),
      $orderby: "start/dateTime",
      $select: "id,subject,start,end,organizer,attendees,location,onlineMeeting,isAllDay,isCancelled,bodyPreview",
    });
    return this.get(`${this.userBase(userId)}/calendarView?${sp.toString()}`);
  }

  async createCalendarEvent(userId: string, event: {
    subject: string;
    body?: { contentType: "Text" | "HTML"; content: string };
    start: { dateTime: string; timeZone: string };
    end: { dateTime: string; timeZone: string };
    location?: { displayName: string };
    attendees?: { emailAddress: { address: string; name?: string }; type: "required" | "optional" }[];
    isOnlineMeeting?: boolean;
    recurrence?: unknown;
  }): Promise<unknown> {
    return this.post(`${this.userBase(userId)}/events`, event);
  }

  // ── Teams ──────────────────────────────────────────────────────────────────

  /** Lists Teams the authenticated user (delegated) or service account is a member of */
  async listJoinedTeams(): Promise<unknown> {
    return this.get("/me/joinedTeams");
  }

  async getTeamChannels(teamId: string): Promise<unknown> {
    return this.get(`/teams/${encodeURIComponent(teamId)}/channels`);
  }

  async postTeamsMessage(teamId: string, channelId: string, content: string): Promise<unknown> {
    return this.post(`/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages`, {
      body: { contentType: "text", content },
    });
  }

  async getTeamsChannelMessages(teamId: string, channelId: string, top = 20): Promise<unknown> {
    const sp = new URLSearchParams({ $top: String(top) });
    return this.get(`/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages?${sp.toString()}`);
  }

  // ── SharePoint / OneDrive ──────────────────────────────────────────────────

  async searchSharePoint(query: string, entityTypes = ["driveItem", "listItem", "site"], size = 10): Promise<unknown> {
    return this.post("/search/query", {
      requests: [{
        entityTypes,
        query: { queryString: query },
        size,
        fields: ["name", "webUrl", "lastModifiedDateTime", "author", "size", "fileType"],
      }],
    });
  }

  async getSharePointFile(driveId: string, itemId: string): Promise<unknown> {
    return this.get(`/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}?$expand=thumbnails`);
  }

  async readSharePointPage(siteId: string, pageId: string): Promise<unknown> {
    return this.get(`/sites/${encodeURIComponent(siteId)}/pages/${encodeURIComponent(pageId)}`);
  }

  async getOneDriveFile(userId: string, itemPath: string): Promise<unknown> {
    return this.get(`${this.userBase(userId)}/drive/root:/${encodeURIComponent(itemPath)}`);
  }

  // ── Connection test ─────────────────────────────────────────────────────────

  async getOrganization(): Promise<unknown> {
    return this.get("/organization");
  }
}
