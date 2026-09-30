/**
 * Zendesk REST API v2 client.
 * Fetcher is injected by the MCP server so fetchWithAuth handles retries,
 * 401 refresh, and 429/5xx backoff.
 *
 * Auth: Basic ({email}/token : api_token encoded as base64)
 * Base URL: https://${subdomain}.zendesk.com/api/v2
 */

export interface ZendeskTicket {
  id: number;
  subject: string;
  description?: string;
  status: string;
  priority: string | null;
  tags: string[];
  requester_id: number;
  assignee_id: number | null;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface ZendeskComment {
  id: number;
  body: string;
  html_body?: string;
  public: boolean;
  author_id: number;
  created_at: string;
}

export interface ZendeskUser {
  id: number;
  name: string;
  email: string | null;
  role: string;
  [key: string]: unknown;
}

export interface ZendeskSearchResult {
  results: ZendeskTicket[];
  count: number;
  next_page: string | null;
}

export type ZendeskFetcher = (path: string, options?: RequestInit) => Promise<Response>;

export class ZendeskClient {
  /** Subdomain only (e.g. "acme"), for building agent UI links -- the fetcher
   *  above already has this baked into its API base URL, but ticket links
   *  need the bare subdomain, not the /api/v2 path. */
  constructor(private readonly fetcher: ZendeskFetcher, readonly subdomain?: string) {}

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await this.fetcher(path, options);

    if (!res.ok) {
      let errorText = await res.text().catch(() => res.statusText);
      try {
        const errJson = JSON.parse(errorText);
        const msg = errJson?.description ?? errJson?.error ?? errorText;
        if (res.status === 401) throw new ZendeskAuthError("Zendesk authentication failed — check email and API token");
        if (res.status === 403) throw new Error(`Zendesk permission denied: ${msg}`);
        if (res.status === 404) throw new Error(`Zendesk resource not found: ${path}`);
        if (res.status === 429) throw new Error(`Zendesk rate limit exceeded: ${msg}`);
        throw new Error(`Zendesk API ${res.status}: ${msg}`);
      } catch (e) {
        if (e instanceof ZendeskAuthError || (e as Error).message?.startsWith("Zendesk")) throw e;
        throw new Error(`Zendesk API ${res.status}: ${errorText}`);
      }
    }

    if (res.status === 204) return {} as T;
    return res.json() as Promise<T>;
  }

  /** Zendesk search query syntax, e.g. `type:ticket status:open` */
  async searchTickets(
    query: string,
    sortBy?: "updated_at" | "created_at" | "priority" | "status",
    sortOrder?: "asc" | "desc"
  ): Promise<ZendeskSearchResult> {
    const params = new URLSearchParams({ query: `type:ticket ${query}`.trim() });
    if (sortBy) params.set("sort_by", sortBy);
    if (sortOrder) params.set("sort_order", sortOrder);
    return this.request<ZendeskSearchResult>(`/search.json?${params.toString()}`);
  }

  /** List/filter tickets. Uses the search endpoint when filters are given so
   *  server-side filtering applies; falls back to /tickets.json for a bare listing. */
  async listTickets(
    params: {
      status?: string;
      priority?: string;
      assignee_email?: string;
      view_id?: string | number;
      updated_since?: string;
    },
    maxResults = 25
  ): Promise<ZendeskTicket[]> {
    if (params.view_id) {
      const result = await this.request<{ tickets: ZendeskTicket[] }>(
        `/views/${params.view_id}/tickets.json?per_page=${Math.min(maxResults, 100)}`
      );
      return result.tickets ?? [];
    }

    const queryParts: string[] = ["type:ticket"];
    if (params.status) queryParts.push(`status:${params.status}`);
    if (params.priority) queryParts.push(`priority:${params.priority}`);
    if (params.assignee_email) queryParts.push(`assignee:${params.assignee_email}`);
    if (params.updated_since) queryParts.push(`updated>${params.updated_since}`);

    if (queryParts.length > 1) {
      const result = await this.searchTickets(queryParts.slice(1).join(" "), "updated_at", "desc");
      return (result.results ?? []).slice(0, maxResults);
    }

    const result = await this.request<{ tickets: ZendeskTicket[] }>(
      `/tickets.json?per_page=${Math.min(maxResults, 100)}&sort_by=updated_at&sort_order=desc`
    );
    return (result.tickets ?? []).slice(0, maxResults);
  }

  /** Get a single ticket by ID, with comments fetched separately for full context */
  async getTicket(ticketId: string | number): Promise<{ ticket: ZendeskTicket; comments: ZendeskComment[] }> {
    const [ticketRes, commentsRes] = await Promise.all([
      this.request<{ ticket: ZendeskTicket }>(`/tickets/${ticketId}.json`),
      this.request<{ comments: ZendeskComment[] }>(`/tickets/${ticketId}/comments.json`).catch(() => ({ comments: [] })),
    ]);
    return { ticket: ticketRes.ticket, comments: commentsRes.comments ?? [] };
  }

  /** Add an internal (private) note — a non-public comment */
  async addInternalNote(ticketId: string | number, body: string): Promise<void> {
    await this.request<void>(`/tickets/${ticketId}.json`, {
      method: "PUT",
      body: JSON.stringify({ ticket: { comment: { body, public: false } } }),
    });
  }

  /** Add tags to a ticket. Uses the dedicated /tags.json endpoint (additive,
   *  does not require re-sending the full ticket payload like PUT /tickets/{id}.json would). */
  async addTag(ticketId: string | number, tags: string[]): Promise<void> {
    await this.request<void>(`/tickets/${ticketId}/tags.json`, {
      method: "PUT",
      body: JSON.stringify({ tags }),
    });
  }

  /** Update ticket status: new|open|pending|hold|solved|closed */
  async updateTicketStatus(ticketId: string | number, status: string): Promise<void> {
    await this.request<void>(`/tickets/${ticketId}.json`, {
      method: "PUT",
      body: JSON.stringify({ ticket: { status } }),
    });
  }

  /** Get user by ID */
  async getUser(userId: string | number): Promise<ZendeskUser> {
    const result = await this.request<{ user: ZendeskUser }>(`/users/${userId}.json`);
    return result.user;
  }

  /** Get user by email */
  async getUserByEmail(email: string): Promise<ZendeskUser | null> {
    const result = await this.request<{ users: ZendeskUser[] }>(
      `/users/search.json?query=${encodeURIComponent(`email:${email}`)}`
    );
    return Array.isArray(result.users) && result.users.length ? result.users[0] : null;
  }
}

export class ZendeskAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZendeskAuthError";
  }
}
