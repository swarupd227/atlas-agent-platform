/**
 * Salesforce REST API client — raw fetch, no heavy SDK.
 * Supports production (login.salesforce.com) and sandbox (test.salesforce.com).
 * Token refresh is handled upstream by RealMcpBase.fetchWithAuth().
 */

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
  sobjects: Array<{ name: string; label: string; labelPlural: string; queryable: boolean; createable: boolean; updateable: boolean }>;
}

export const SF_API_VERSION = "v59.0";

export class SalesforceClient {
  private instanceUrl: string;
  private accessToken: string;

  constructor(credentials: Record<string, string>) {
    if (!credentials.instance_url) throw new Error("Salesforce credentials missing instance_url");
    if (!credentials.access_token) throw new Error("Salesforce credentials missing access_token");
    this.instanceUrl = credentials.instance_url.replace(/\/$/, "");
    this.accessToken = credentials.access_token;
  }

  private get baseUrl(): string {
    return `${this.instanceUrl}/services/data/${SF_API_VERSION}`;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
    timeoutMs = 15_000
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        headers: {
          "Authorization": `Bearer ${this.accessToken}`,
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
          const sfErr = Array.isArray(errJson) ? errJson[0] : errJson;
          const code: string = sfErr?.errorCode ?? sfErr?.error ?? "";
          const msg: string = sfErr?.message ?? sfErr?.error_description ?? errorText;
          if (code === "INVALID_SESSION_ID") {
            throw new SalesforceAuthError("Salesforce session expired — token refresh required");
          }
          errorText = msg || errorText;
        } catch (e) {
          if (e instanceof SalesforceAuthError) throw e;
        }
        throw new Error(`Salesforce API error ${res.status}: ${errorText}`);
      }

      if (res.status === 204) return {} as T;
      return res.json() as Promise<T>;
    } finally {
      clearTimeout(timer);
    }
  }

  async query(soql: string): Promise<SFQueryResult> {
    const encoded = encodeURIComponent(soql);
    return this.request<SFQueryResult>(`/query/?q=${encoded}`);
  }

  async queryAll(soql: string): Promise<SFRecord[]> {
    const result = await this.query(soql);
    const records = [...result.records];
    let next = result.nextRecordsUrl;
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

  async createRecord(objectType: string, data: Record<string, unknown>): Promise<{ id: string; success: boolean }> {
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
    const encoded = encodeURIComponent(sosl);
    return this.request<SFSearchResult>(`/search/?q=${encoded}`);
  }

  async describeGlobal(): Promise<SFGlobalDescribe> {
    return this.request<SFGlobalDescribe>("/sobjects/");
  }

  async describeObject(objectType: string): Promise<SFDescribeResult> {
    return this.request<SFDescribeResult>(`/sobjects/${objectType}/describe/`);
  }

  async createCaseComment(caseId: string, commentBody: string, isPublished = true): Promise<{ id: string; success: boolean }> {
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

/** Safely escape string values in SOQL WHERE clauses */
export function escapeSoqlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
