/**
 * HubSpot CRM v3 API client — raw fetch with Private App token authentication.
 * Rate limit: 100 requests / 10 seconds (handled by RealMcpBase retry backoff).
 * Base URL: https://api.hubapi.com
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
    operator: "EQ" | "NEQ" | "LT" | "LTE" | "GT" | "GTE" | "BETWEEN" | "IN" | "NOT_IN" | "HAS_PROPERTY" | "NOT_HAS_PROPERTY" | "CONTAINS_TOKEN" | "NOT_CONTAINS_TOKEN";
    value?: string;
    values?: string[];
    highValue?: string;
  }>;
}

export type HSObjType = "contacts" | "companies" | "deals" | "notes" | "meetings" | "tasks";

export class HubSpotClient {
  private token: string;

  constructor(credentials: Record<string, string>) {
    if (!credentials.api_key) throw new Error("HubSpot credentials missing api_key (Private App Token)");
    this.token = credentials.api_key;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
    timeoutMs = 15_000
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${HS_BASE}${path}`, {
        ...options,
        headers: {
          "Authorization": `Bearer ${this.token}`,
          "Content-Type": "application/json",
          "Accept": "application/json",
          ...(options.headers as Record<string, string> | undefined),
        },
        signal: controller.signal,
      });

      if (!res.ok) {
        let errorText = await res.text().catch(() => res.statusText);
        try {
          const errJson = JSON.parse(errorText);
          const msg = errJson?.message ?? errJson?.error ?? errorText;
          const cat = errJson?.category ?? "";
          if (cat === "INVALID_AUTHENTICATION" || res.status === 401) {
            throw new HubSpotAuthError("HubSpot authentication failed — check Private App token");
          }
          errorText = msg;
        } catch (e) {
          if (e instanceof HubSpotAuthError) throw e;
        }
        if (res.status === 404) throw new Error(`HubSpot record not found (404): ${path}`);
        if (res.status === 429) throw new HubSpotRateLimitError("HubSpot rate limit hit (100 req/10 sec)");
        throw new Error(`HubSpot API error ${res.status}: ${errorText}`);
      }

      if (res.status === 204) return {} as T;
      return res.json() as Promise<T>;
    } finally {
      clearTimeout(timer);
    }
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
    properties.forEach(p => params.append("properties", p));
    if (associations?.length) {
      associations.forEach(a => params.append("associations", a));
    }
    return this.request<T>(`/crm/v3/objects/${objectType}/${id}?${params.toString()}`);
  }

  async createObject<T>(
    objectType: HSObjType,
    properties: Record<string, string>,
    associations?: Array<{ to: { id: string }; types: Array<{ associationCategory: string; associationTypeId: number }> }>
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

  async getPipelines(objectType: "deals"): Promise<Array<{ id: string; label: string; stages: Array<{ id: string; label: string; metadata?: Record<string, unknown> }> }>> {
    const res = await this.request<{ results: Array<{ id: string; label: string; stages: Array<{ id: string; label: string; metadata?: Record<string, unknown> }> }> }>(`/crm/v3/pipelines/${objectType}`);
    return res.results;
  }

  async createEngagement(
    engagementType: "NOTE" | "CALL" | "MEETING",
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
    const note = await this.createObject<HSNote>("notes", properties, [{
      to: { id: objectId },
      types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: getAssociationTypeId(objectType) }],
    }]);
    return note;
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

/** Default contact properties to always fetch */
export const DEFAULT_CONTACT_PROPS = [
  "firstname", "lastname", "email", "phone", "company", "jobtitle",
  "hs_lead_status", "lifecyclestage", "createdate", "lastmodifieddate", "hubspot_owner_id",
];

/** Default company properties to always fetch */
export const DEFAULT_COMPANY_PROPS = [
  "name", "domain", "industry", "city", "country", "annualrevenue",
  "numberofemployees", "phone", "description", "createdate", "lastmodifieddate",
];

/** Default deal properties to always fetch */
export const DEFAULT_DEAL_PROPS = [
  "dealname", "amount", "dealstage", "pipeline", "closedate",
  "hubspot_owner_id", "hs_priority", "description", "createdate", "lastmodifieddate",
];
