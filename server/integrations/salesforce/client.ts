/**
 * Salesforce REST API client — raw fetch is injected by the caller.
 * The fetcher is pre-configured with auth headers, retry/backoff, and 401-refresh
 * via RealMcpBase.fetchWithAuth(), so this client only handles request formatting
 * and user-friendly error translation.
 * Supports production (login.salesforce.com) and sandbox (test.salesforce.com).
 */

export const SF_API_VERSION = "v59.0";

export interface SFRecord {
  [key: string]: unknown;
  Id?: string;
  attributes?: { type: string; url: string };
}

export interface SFQueryResult {
  totalSize: number;
  done: boolean;
  records: SFRecord[];
  nextRecordsUrl?: string;
}

export interface SFSearchResult {
  searchRecords: SFRecord[];
}

export interface SFDescribeField {
  name: string;
  label: string;
  type: string;
  length?: number;
  nillable?: boolean;
  updateable?: boolean;
  createable?: boolean;
  picklistValues?: Array<{ value: string; label: string; active: boolean }>;
}

export interface SFDescribeResult {
  name: string;
  label: string;
  labelPlural: string;
  fields: SFDescribeField[];
  createable: boolean;
  updateable: boolean;
  queryable: boolean;
}

export interface SFGlobalDescribe {
  sobjects: Array<{
    name: string;
    label: string;
    labelPlural: string;
    queryable: boolean;
    createable: boolean;
    updateable: boolean;
  }>;
}

/** Fetcher type: injected by MCP server so fetchWithAuth handles retry/backoff/auth */
export type SfFetcher = (path: string, options?: RequestInit) => Promise<Response>;

export class SalesforceClient {
  constructor(
    private readonly fetcher: SfFetcher,
    readonly instanceUrl: string
  ) {}

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await this.fetcher(path, options);

    if (!res.ok) {
      let errorText = await res.text().catch(() => res.statusText);
      try {
        const errJson = JSON.parse(errorText);
        const sfErr = Array.isArray(errJson) ? errJson[0] : errJson;
        const code: string = sfErr?.errorCode ?? sfErr?.error ?? "";
        const msg: string = sfErr?.message ?? sfErr?.error_description ?? errorText;
        if (code === "INVALID_SESSION_ID") {
          throw new SalesforceAuthError("Salesforce session expired — please reconnect the integration");
        }
        errorText = msg || errorText;
      } catch (e) {
        if (e instanceof SalesforceAuthError) throw e;
      }
      if (res.status === 404) throw new Error(`Salesforce record not found (404): ${path}`);
      throw new Error(`Salesforce API ${res.status}: ${errorText}`);
    }

    if (res.status === 204) return {} as T;
    return res.json() as Promise<T>;
  }

  async query(soql: string): Promise<SFQueryResult> {
    return this.request<SFQueryResult>(`/query/?q=${encodeURIComponent(soql)}`);
  }

  async queryAll(soql: string): Promise<SFRecord[]> {
    const result = await this.query(soql);
    const records = [...result.records];
    let next = result.nextRecordsUrl;
    // Follow next-page links (relative paths like /services/data/v59.0/query/...)
    while (next && records.length < 2000) {
      const path = next.replace(/.*\/services\/data\/[^/]+/, "");
      const more = await this.request<SFQueryResult>(path);
      records.push(...more.records);
      next = more.nextRecordsUrl;
    }
    return records;
  }

  async getRecord(objectType: string, id: string, fields?: string[]): Promise<SFRecord> {
    const fieldParam = fields?.length ? `?fields=${fields.join(",")}` : "";
    return this.request<SFRecord>(`/sobjects/${objectType}/${id}${fieldParam}`);
  }

  async createRecord(
    objectType: string,
    data: Record<string, unknown>
  ): Promise<{ id: string; success: boolean }> {
    return this.request<{ id: string; success: boolean }>(`/sobjects/${objectType}/`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateRecord(objectType: string, id: string, data: Record<string, unknown>): Promise<void> {
    await this.request<void>(`/sobjects/${objectType}/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async search(sosl: string): Promise<SFSearchResult> {
    return this.request<SFSearchResult>(`/search/?q=${encodeURIComponent(sosl)}`);
  }

  async describeGlobal(): Promise<SFGlobalDescribe> {
    return this.request<SFGlobalDescribe>("/sobjects/");
  }

  async describeObject(objectType: string): Promise<SFDescribeResult> {
    return this.request<SFDescribeResult>(`/sobjects/${objectType}/describe/`);
  }

  async createCaseComment(
    caseId: string,
    commentBody: string,
    isPublished = true
  ): Promise<{ id: string; success: boolean }> {
    return this.request<{ id: string; success: boolean }>("/sobjects/CaseComment/", {
      method: "POST",
      body: JSON.stringify({ ParentId: caseId, CommentBody: commentBody, IsPublished: isPublished }),
    });
  }
}

export class SalesforceAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SalesforceAuthError";
  }
}

/** Strip Salesforce attributes metadata, keep only data fields */
export function normalizeSFRecord(record: SFRecord): Record<string, unknown> {
  const { attributes, ...rest } = record;
  return rest;
}

/** Safely escape string values for use in SOQL WHERE clause literals */
export function escapeSoqlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
