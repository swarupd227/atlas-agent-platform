/**
 * ServiceNow Table API + CMDB API client.
 * Fetcher is injected by the MCP server so fetchWithAuth handles retries,
 * 401 refresh, and 429/5xx backoff. This client only formats requests and
 * translates ServiceNow error payloads into user-readable messages.
 *
 * Auth: Basic (username:password) or Bearer (access_token) — determined by caller.
 * Base path injected via fetcher: each call gets a relative path under /api/now/
 */

export interface SNRecord {
  sys_id: string;
  [key: string]: unknown;
}

export interface SNQueryResult {
  result: SNRecord[];
}

export interface SNSingleResult {
  result: SNRecord;
}

export interface SNCreateResult {
  result: { sys_id: string; number?: string; [key: string]: unknown };
}

/** Fetcher type: caller provides fetchWithAuth-backed function */
export type SnFetcher = (path: string, options?: RequestInit) => Promise<Response>;

export class ServiceNowClient {
  constructor(private readonly fetcher: SnFetcher) {}

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await this.fetcher(path, options);

    if (!res.ok) {
      let errorText = await res.text().catch(() => res.statusText);
      try {
        const errJson = JSON.parse(errorText);
        const msg =
          errJson?.error?.message ??
          errJson?.error?.detail ??
          errJson?.message ??
          errorText;
        if (res.status === 401) throw new ServiceNowAuthError("ServiceNow authentication failed — check username/password or OAuth token");
        if (res.status === 403) throw new Error(`ServiceNow permission denied: ${msg}`);
        if (res.status === 404) throw new Error(`ServiceNow record not found: ${path}`);
        throw new Error(`ServiceNow API ${res.status}: ${msg}`);
      } catch (e) {
        if (e instanceof ServiceNowAuthError || (e as Error).message?.includes("ServiceNow")) throw e;
        throw new Error(`ServiceNow API ${res.status}: ${errorText}`);
      }
    }

    if (res.status === 204) return {} as T;
    return res.json() as Promise<T>;
  }

  /** Query a ServiceNow table with optional encoded query (GONQ) and field selection */
  async queryTable(
    table: string,
    params: {
      query?: string;
      fields?: string[];
      limit?: number;
      offset?: number;
      displayValue?: boolean | "all";
      orderBy?: string;
    } = {}
  ): Promise<SNRecord[]> {
    const sp = new URLSearchParams();
    if (params.query) sp.set("sysparm_query", params.query);
    if (params.fields?.length) sp.set("sysparm_fields", params.fields.join(","));
    sp.set("sysparm_limit", String(Math.min(params.limit ?? 20, 100)));
    if (params.offset) sp.set("sysparm_offset", String(params.offset));
    if (params.displayValue !== undefined) {
      sp.set("sysparm_display_value", params.displayValue === true ? "true" : params.displayValue === "all" ? "all" : "false");
    }
    if (params.orderBy) sp.set("sysparm_orderby", params.orderBy);

    const result = await this.request<SNQueryResult>(`/table/${table}?${sp.toString()}`);
    return result.result ?? [];
  }

  /** Get a single record by sys_id */
  async getRecord(table: string, sysId: string, fields?: string[]): Promise<SNRecord> {
    const sp = new URLSearchParams();
    if (fields?.length) sp.set("sysparm_fields", fields.join(","));
    sp.set("sysparm_display_value", "true");
    const result = await this.request<SNSingleResult>(`/table/${table}/${sysId}?${sp.toString()}`);
    return result.result;
  }

  /** Create a record */
  async createRecord(table: string, data: Record<string, unknown>): Promise<SNRecord> {
    const result = await this.request<SNCreateResult>(`/table/${table}`, {
      method: "POST",
      body: JSON.stringify(data),
    });
    return result.result;
  }

  /** Update a record */
  async updateRecord(table: string, sysId: string, data: Record<string, unknown>): Promise<SNRecord> {
    const result = await this.request<SNSingleResult>(`/table/${table}/${sysId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    return result.result;
  }

  /** Look up a record by number (e.g. INC0001234 → sys_id) */
  async getByNumber(table: string, number: string, fields?: string[]): Promise<SNRecord | null> {
    const sp = new URLSearchParams({ sysparm_query: `number=${number}`, sysparm_limit: "1", sysparm_display_value: "true" });
    if (fields?.length) sp.set("sysparm_fields", fields.join(","));
    const result = await this.request<SNQueryResult>(`/table/${table}?${sp.toString()}`);
    return result.result?.[0] ?? null;
  }

  /** Add a work note or comment to any record */
  async addWorkNote(table: string, sysId: string, note: string, isCustomerVisible: boolean): Promise<SNRecord> {
    const field = isCustomerVisible ? "comments" : "work_notes";
    return this.updateRecord(table, sysId, { [field]: note });
  }

  /** CMDB: get a CI by sys_id or search by name */
  async getCmdbCi(sysId: string): Promise<SNRecord> {
    const sp = new URLSearchParams({ sysparm_display_value: "true" });
    const result = await this.request<SNSingleResult>(`/cmdb/instance/cmdb_ci/${sysId}?${sp.toString()}`);
    return result.result;
  }

  /** CMDB: search CIs */
  async searchCmdb(
    ciClass: string,
    query: string,
    limit = 20
  ): Promise<SNRecord[]> {
    return this.queryTable(ciClass || "cmdb_ci", {
      query,
      limit,
      displayValue: true,
      fields: ["sys_id", "name", "sys_class_name", "operational_status", "install_status", "used_for", "short_description", "ip_address", "fqdn", "location", "department"],
    });
  }

  /** Service Catalog: get a catalog item via Table API (most universally supported) */
  async getCatalogItem(sysId: string): Promise<SNRecord> {
    return this.getRecord("sc_cat_item", sysId, [
      "sys_id", "name", "short_description", "description", "category",
      "price", "delivery_time", "active", "sc_catalogs", "availability",
      "visible_standalone", "order_now", "variables",
    ]);
  }
}

export class ServiceNowAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServiceNowAuthError";
  }
}

/** Common incident fields to return */
export const INCIDENT_FIELDS = [
  "sys_id", "number", "short_description", "description", "state",
  "priority", "urgency", "impact", "category", "subcategory",
  "caller_id", "assigned_to", "assignment_group", "sys_created_on",
  "sys_updated_on", "resolved_at", "closed_at", "work_notes", "comments",
  "resolution_code", "close_notes", "escalation", "opened_at",
  "contact_type", "location", "business_service", "cmdb_ci",
];

/** ServiceNow incident state values */
export const INCIDENT_STATES: Record<string, string> = {
  "1": "New", "2": "In Progress", "3": "On Hold", "6": "Resolved", "7": "Closed", "8": "Cancelled",
};

/** Build a ServiceNow encoded query string from key-value conditions */
export function buildSnQuery(conditions: Record<string, string | undefined>): string {
  return Object.entries(conditions)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${v}`)
    .join("^");
}
