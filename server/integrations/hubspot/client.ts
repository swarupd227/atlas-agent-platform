/**
 * HubSpot CRM v3 API client — fetcher is injected by the caller.
 * The fetcher is pre-configured with Bearer auth, 429 exponential backoff,
 * and 5xx retry via RealMcpBase.fetchWithAuth(). This client only formats
 * requests and translates HubSpot errors into user-readable messages.
 * Rate limit: 100 requests / 10 seconds (handled by injected fetcher).
 */

const HS_BASE = "https://api.hubapi.com";

export interface HSContact {
  id: string;
  properties: Record<string, string | null>;
  associations?: Record<string, { results: Array<{ id: string; type: string }> }>;
}

export interface HSCompany {
  id: string;
  properties: Record<string, string | null>;
  associations?: Record<string, { results: Array<{ id: string; type: string }> }>;
}

export interface HSDeal {
  id: string;
  properties: Record<string, string | null>;
  associations?: Record<string, { results: Array<{ id: string; type: string }> }>;
}

export interface HSNote {
  id: string;
  properties: Record<string, string | null>;
}

export interface HSSearchResult<T> {
  total: number;
  results: T[];
  paging?: { next?: { after: string } };
}

export interface HSFilterGroup {
  filters: Array<{
    propertyName: string;
    operator:
      | "EQ" | "NEQ" | "LT" | "LTE" | "GT" | "GTE"
      | "BETWEEN" | "IN" | "NOT_IN"
      | "HAS_PROPERTY" | "NOT_HAS_PROPERTY"
      | "CONTAINS_TOKEN" | "NOT_CONTAINS_TOKEN";
    value?: string;
    values?: string[];
    highValue?: string;
  }>;
}

export type HSObjType = "contacts" | "companies" | "deals" | "notes" | "meetings" | "tasks";

/** Fetcher type: relative path under HS_BASE, injected by MCP server */
export type HsFetcher = (path: string, options?: RequestInit) => Promise<Response>;

export class HubSpotClient {
  constructor(private readonly fetcher: HsFetcher) {}

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await this.fetcher(path, options);

    if (!res.ok) {
      let errorText = await res.text().catch(() => res.statusText);
      try {
        const errJson = JSON.parse(errorText);
        const msg = errJson?.message ?? errJson?.error ?? errorText;
        const cat = errJson?.category ?? "";
        if (cat === "INVALID_AUTHENTICATION" || res.status === 401) {
          throw new HubSpotAuthError("HubSpot authentication failed — check Private App token and reconnect the integration");
        }
        errorText = msg;
      } catch (e) {
        if (e instanceof HubSpotAuthError) throw e;
      }
      if (res.status === 404) throw new Error(`HubSpot record not found: ${path}`);
      if (res.status === 429) throw new HubSpotRateLimitError("HubSpot rate limit hit — retry momentarily");
      throw new Error(`HubSpot API ${res.status}: ${errorText}`);
    }

    if (res.status === 204) return {} as T;
    return res.json() as Promise<T>;
  }

  async searchObjects<T>(
    objectType: HSObjType,
    filterGroups: HSFilterGroup[],
    properties: string[],
    sorts?: Array<{ propertyName: string; direction: "ASCENDING" | "DESCENDING" }>,
    limit = 20,
    after?: string
  ): Promise<HSSearchResult<T>> {
    return this.request<HSSearchResult<T>>(`/crm/v3/objects/${objectType}/search`, {
      method: "POST",
      body: JSON.stringify({
        filterGroups,
        properties,
        sorts: sorts ?? [],
        limit: Math.min(limit, 100),
        after,
      }),
    });
  }

  async getObject<T>(
    objectType: HSObjType,
    id: string,
    properties: string[],
    associations?: string[]
  ): Promise<T> {
    const params = new URLSearchParams();
    properties.forEach((p) => params.append("properties", p));
    if (associations?.length) {
      associations.forEach((a) => params.append("associations", a));
    }
    return this.request<T>(`/crm/v3/objects/${objectType}/${id}?${params.toString()}`);
  }

  async createObject<T>(
    objectType: HSObjType,
    properties: Record<string, string>,
    associations?: Array<{
      to: { id: string };
      types: Array<{ associationCategory: string; associationTypeId: number }>;
    }>
  ): Promise<T> {
    return this.request<T>(`/crm/v3/objects/${objectType}`, {
      method: "POST",
      body: JSON.stringify({ properties, associations: associations ?? [] }),
    });
  }

  async updateObject<T>(objectType: HSObjType, id: string, properties: Record<string, string>): Promise<T> {
    return this.request<T>(`/crm/v3/objects/${objectType}/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ properties }),
    });
  }

  async getPipelines(objectType: "deals"): Promise<
    Array<{
      id: string;
      label: string;
      stages: Array<{ id: string; label: string; metadata?: Record<string, unknown> }>;
    }>
  > {
    const res = await this.request<{
      results: Array<{
        id: string;
        label: string;
        stages: Array<{ id: string; label: string; metadata?: Record<string, unknown> }>;
      }>;
    }>(`/crm/v3/pipelines/${objectType}`);
    return res.results;
  }

  async createEngagement(
    _engagementType: "NOTE" | "CALL" | "MEETING",
    objectType: "contacts" | "companies" | "deals",
    objectId: string,
    body: string,
    metadata?: Record<string, unknown>
  ): Promise<HSNote> {
    const properties: Record<string, string> = {
      hs_note_body: body,
      hs_timestamp: new Date().toISOString(),
      ...(metadata as Record<string, string> | undefined),
    };
    return this.createObject<HSNote>("notes", properties, [
      {
        to: { id: objectId },
        types: [
          {
            associationCategory: "HUBSPOT_DEFINED",
            associationTypeId: getAssociationTypeId(objectType),
          },
        ],
      },
    ]);
  }
}

function getAssociationTypeId(objectType: "contacts" | "companies" | "deals"): number {
  const map: Record<string, number> = { contacts: 202, companies: 214, deals: 218 };
  return map[objectType] ?? 202;
}

export class HubSpotAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HubSpotAuthError";
  }
}

export class HubSpotRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HubSpotRateLimitError";
  }
}

export const DEFAULT_CONTACT_PROPS = [
  "firstname",
  "lastname",
  "email",
  "phone",
  "company",
  "jobtitle",
  "hs_lead_status",
  "lifecyclestage",
  "createdate",
  "lastmodifieddate",
  "hubspot_owner_id",
];

export const DEFAULT_COMPANY_PROPS = [
  "name",
  "domain",
  "industry",
  "city",
  "country",
  "annualrevenue",
  "numberofemployees",
  "phone",
  "description",
  "createdate",
  "lastmodifieddate",
];

export const DEFAULT_DEAL_PROPS = [
  "dealname",
  "amount",
  "dealstage",
  "pipeline",
  "closedate",
  "hubspot_owner_id",
  "hs_priority",
  "description",
  "createdate",
  "lastmodifieddate",
];

/** Full HubSpot API base URL — prepend to relative paths for fetchWithAuth */
export { HS_BASE };
