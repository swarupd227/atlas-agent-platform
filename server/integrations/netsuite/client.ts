/**
 * NetSuite SuiteTalk REST Web Services client.
 * Fetcher is injected by the MCP server so fetchWithAuth handles retries,
 * 401 detection, and 429/5xx backoff -- the MCP server also signs every
 * request with a NetSuite Token-Based Authentication (OAuth 1.0a-style)
 * Authorization header before handing it to the fetcher.
 *
 * Auth: Token-Based Authentication (account_id, consumer_key, consumer_secret,
 *       token_id, token_secret) -- NOT Basic or Bearer.
 * Base URLs:
 *   Records:  https://{account_id}.suitetalk.api.netsuite.com/services/rest/record/v1
 *   SuiteQL:  https://{account_id}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql
 *
 * Read-only: this connector's first release only reads invoices, payments,
 * orders, and customers -- no create/update/delete tools are implemented.
 */

export interface NetSuiteQueryResult {
  items: any[];
  hasMore: boolean;
  totalResults?: number;
}

export type NetSuiteFetcher = (path: string, options?: RequestInit) => Promise<Response>;

export class NetSuiteClient {
  constructor(private readonly fetcher: NetSuiteFetcher) {}

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await this.fetcher(path, options);

    if (!res.ok) {
      let errorText = await res.text().catch(() => res.statusText);
      try {
        const errJson = JSON.parse(errorText);
        // RFC 7807 problem+json: { type, title, status, "o:errorDetails": [{ detail, "o:errorCode" }] }
        const details: Array<{ detail?: string }> = errJson?.["o:errorDetails"] ?? [];
        const msg = details.map(d => d.detail).filter(Boolean).join("; ") || errJson?.title || errorText;
        if (res.status === 401) throw new NetSuiteAuthError("NetSuite authentication failed — check account_id, consumer_key/secret, and token_id/secret");
        if (res.status === 403) throw new Error(`NetSuite permission denied: ${msg}`);
        if (res.status === 404) throw new Error(`NetSuite resource not found: ${path}`);
        throw new Error(`NetSuite API ${res.status}: ${msg}`);
      } catch (e) {
        if (e instanceof NetSuiteAuthError || (e as Error).message?.startsWith("NetSuite")) throw e;
        throw new Error(`NetSuite API ${res.status}: ${errorText}`);
      }
    }

    if (res.status === 204) return {} as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : {}) as T;
  }

  /** Run a SuiteQL SELECT query. limit/offset are HTTP query-string params, not SQL clauses. */
  async runSuiteQL(query: string, limit = 100, offset = 0): Promise<NetSuiteQueryResult> {
    const qs = `?limit=${Math.min(limit, 1000)}&offset=${Math.max(offset, 0)}`;
    const result = await this.request<{ items?: any[]; hasMore?: boolean; totalResults?: number }>(
      `/suiteql${qs}`,
      {
        method: "POST",
        headers: { Prefer: "transient" },
        body: JSON.stringify({ q: query }),
      }
    );
    return {
      items: result.items ?? [],
      hasMore: Boolean(result.hasMore),
      totalResults: result.totalResults,
    };
  }

  /** Get a single record by type and internal ID (e.g. "customer", "invoice", "salesorder"). */
  async getRecord(recordType: string, internalId: string, expandSubResources = false): Promise<any> {
    const qs = expandSubResources ? "?expandSubResources=true" : "";
    return this.request<any>(`/${recordType}/${internalId}${qs}`);
  }

  /** List customer invoices (transaction type CustInvc) via SuiteQL. */
  async listInvoices(
    params: { customerId?: string; status?: string; updatedSince?: string },
    limit = 50,
    offset = 0
  ): Promise<NetSuiteQueryResult> {
    const where = ["type = 'CustInvc'", ...buildTransactionFilters(params)];
    const query =
      `SELECT id, tranid, entity, status, trandate, duedate, total, currency, lastmodifieddate ` +
      `FROM transaction WHERE ${where.join(" AND ")} ORDER BY trandate DESC`;
    return this.runSuiteQL(query, limit, offset);
  }

  /** List sales orders (transaction type SalesOrd) via SuiteQL. */
  async listOrders(
    params: { customerId?: string; status?: string; updatedSince?: string },
    limit = 50,
    offset = 0
  ): Promise<NetSuiteQueryResult> {
    const where = ["type = 'SalesOrd'", ...buildTransactionFilters(params)];
    const query =
      `SELECT id, tranid, entity, status, trandate, total, currency, lastmodifieddate ` +
      `FROM transaction WHERE ${where.join(" AND ")} ORDER BY trandate DESC`;
    return this.runSuiteQL(query, limit, offset);
  }

  /** List customer payments (transaction type CustPymt) via SuiteQL. */
  async listPayments(
    params: { customerId?: string; updatedSince?: string },
    limit = 50,
    offset = 0
  ): Promise<NetSuiteQueryResult> {
    const where = ["type = 'CustPymt'", ...buildTransactionFilters(params)];
    const query =
      `SELECT id, tranid, entity, trandate, total, currency, lastmodifieddate ` +
      `FROM transaction WHERE ${where.join(" AND ")} ORDER BY trandate DESC`;
    return this.runSuiteQL(query, limit, offset);
  }

  /** Payments applied against a given invoice, via the nexttransactionlink table. */
  async getAppliedInvoicesForPayment(paymentId: string): Promise<string[]> {
    const query =
      `SELECT previousdoc FROM nexttransactionlink WHERE nextdoc = ${Number(paymentId)}`;
    const result = await this.runSuiteQL(query, 50, 0);
    return result.items.map((row: any) => String(row.previousdoc)).filter(Boolean);
  }

  /** Get a customer record by internal ID. */
  async getCustomer(internalId: string): Promise<any> {
    return this.getRecord("customer", internalId);
  }

  /** Search customers by name/email via SuiteQL. */
  async searchCustomers(
    params: { name?: string; email?: string; updatedSince?: string },
    limit = 50,
    offset = 0
  ): Promise<NetSuiteQueryResult> {
    const where: string[] = [];
    if (params.name) where.push(`LOWER(entityid) LIKE LOWER('%${escapeSqlString(params.name)}%')`);
    if (params.email) where.push(`LOWER(email) = LOWER('${escapeSqlString(params.email)}')`);
    if (params.updatedSince) where.push(`lastmodifieddate >= TO_DATE('${escapeSqlString(params.updatedSince)}', 'YYYY-MM-DD')`);

    const query =
      `SELECT id, entityid, companyname, email, phone, balance, status, lastmodifieddate ` +
      `FROM customer${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY lastmodifieddate DESC`;
    return this.runSuiteQL(query, limit, offset);
  }
}

export class NetSuiteAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NetSuiteAuthError";
  }
}

/** Shared WHERE-clause builder for the `transaction` table filters used by invoices/orders/payments. */
function buildTransactionFilters(params: { customerId?: string; status?: string; updatedSince?: string }): string[] {
  const clauses: string[] = [];
  if (params.customerId) clauses.push(`entity = ${Number(params.customerId)}`);
  if (params.status) clauses.push(`status = '${escapeSqlString(params.status)}'`);
  if (params.updatedSince) clauses.push(`lastmodifieddate >= TO_DATE('${escapeSqlString(params.updatedSince)}', 'YYYY-MM-DD')`);
  return clauses;
}

/** Escape single quotes for safe embedding in a SuiteQL string literal. */
function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}
