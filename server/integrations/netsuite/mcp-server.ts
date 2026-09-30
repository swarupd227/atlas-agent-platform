/**
 * NetSuite MCP Server — 6 read-only tools via SuiteTalk REST Web Services.
 * Extends RealMcpBase; auth via Token-Based Authentication (TBA), an
 * OAuth 1.0a-style signed request -- NOT Basic or Bearer auth. Every
 * request gets a freshly-signed `Authorization: OAuth ...` header built
 * from account_id/consumer_key/consumer_secret/token_id/token_secret
 * using Node's built-in crypto (HMAC-SHA256), no extra dependency.
 * Mounted at /api/integrations/netsuite
 *
 * Read-only: per the design's first-release scope (invoices, payments,
 * orders, customers), no write/create/update tools are exposed here.
 */

import { Router, Request, Response } from "express";
import crypto from "crypto";
import { RealMcpBase, type McpToolResult, type RealMcpToolDef } from "../../real-mcp-base";
import { NetSuiteClient, type NetSuiteFetcher } from "./client";
import { getOrgId, getDefaultOrgId } from "../../auth";
import {
  netsuite_run_suiteql,
  netsuite_list_invoices,
  netsuite_get_invoice,
  netsuite_list_orders,
  netsuite_list_payments,
  netsuite_search_customers,
} from "./tools";

interface NetSuiteTbaCredentials {
  account_id: string;
  consumer_key: string;
  consumer_secret: string;
  token_id: string;
  token_secret: string;
}

export class NetSuiteMcpServer extends RealMcpBase {
  readonly integrationId = "netsuite";

  readonly tools: RealMcpToolDef[] = [
    {
      name: "netsuite_run_suiteql",
      description: "Run an arbitrary read-only SuiteQL (NetSuite's SQL-like query language) SELECT statement against any record table. Rejects any statement that isn't a SELECT. Use this for ad-hoc lookups not covered by the other tools.",
      inputSchema: {
        type: "object",
        properties: {
          query:  { type: "string", description: "SuiteQL SELECT statement (required). Example: SELECT id, tranid, total FROM transaction WHERE type = 'CustInvc'" },
          limit:  { type: "number", description: "Max rows to return (default 100, max 1000)" },
          offset: { type: "number", description: "Pagination offset (default 0)" },
        },
        required: ["query"],
      },
    },
    {
      name: "netsuite_list_invoices",
      description: "List customer invoices with customer, amount, status, and date, optionally filtered by customer, status, or last-modified date.",
      inputSchema: {
        type: "object",
        properties: {
          customer_id:   { type: "string", description: "Filter to invoices for this customer's internal ID" },
          status:        { type: "string", description: "Filter by invoice status (e.g. 'Open', 'Paid In Full', 'Overdue')" },
          updated_since: { type: "string", description: "Only invoices modified on/after this date (YYYY-MM-DD)" },
          limit:         { type: "number", description: "Max invoices to return (default 50, max 200)" },
        },
      },
    },
    {
      name: "netsuite_get_invoice",
      description: "Get a single invoice by internal ID, including its line items when available.",
      inputSchema: {
        type: "object",
        properties: {
          internal_id: { type: "string", description: "Invoice internal ID (required)" },
        },
        required: ["internal_id"],
      },
    },
    {
      name: "netsuite_list_orders",
      description: "List sales orders with customer, amount, status, and date, optionally filtered by customer, status, or last-modified date.",
      inputSchema: {
        type: "object",
        properties: {
          customer_id:   { type: "string", description: "Filter to orders for this customer's internal ID" },
          status:        { type: "string", description: "Filter by order status (e.g. 'Pending Fulfillment', 'Billed', 'Closed')" },
          updated_since: { type: "string", description: "Only orders modified on/after this date (YYYY-MM-DD)" },
          limit:         { type: "number", description: "Max orders to return (default 50, max 200)" },
        },
      },
    },
    {
      name: "netsuite_list_payments",
      description: "List customer payments, optionally filtered by customer or last-modified date. Each payment includes the internal IDs of invoices it was applied against, when resolvable.",
      inputSchema: {
        type: "object",
        properties: {
          customer_id:   { type: "string", description: "Filter to payments from this customer's internal ID" },
          updated_since: { type: "string", description: "Only payments modified on/after this date (YYYY-MM-DD)" },
          limit:         { type: "number", description: "Max payments to return (default 50, max 200)" },
        },
      },
    },
    {
      name: "netsuite_search_customers",
      description: "Search customers by name or email. Returns internal ID, name, masked email, balance, and status.",
      inputSchema: {
        type: "object",
        properties: {
          name:          { type: "string", description: "Customer name (partial match)" },
          email:         { type: "string", description: "Customer email address (exact match)" },
          updated_since: { type: "string", description: "Only customers modified on/after this date (YYYY-MM-DD)" },
          limit:         { type: "number", description: "Max customers to return (default 50, max 200)" },
        },
      },
    },
  ];

  /**
   * Builds a NetSuite Token-Based Authentication (OAuth 1.0a-style) Authorization
   * header, signed with HMAC-SHA256 over the request method, URL, oauth params,
   * and any URL query params (a JSON body is never part of the signature --
   * OAuth 1.0 only signs application/x-www-form-urlencoded bodies).
   */
  private buildTbaAuthHeader(method: string, url: string, creds: NetSuiteTbaCredentials): string {
    const urlObj = new URL(url);
    const baseUrl = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;

    const oauthParams: Record<string, string> = {
      oauth_consumer_key: creds.consumer_key,
      oauth_token: creds.token_id,
      oauth_signature_method: "HMAC-SHA256",
      oauth_timestamp: String(Math.floor(Date.now() / 1000)),
      oauth_nonce: crypto.randomBytes(16).toString("hex"),
      oauth_version: "1.0",
    };

    const allParams: Record<string, string> = { ...oauthParams };
    urlObj.searchParams.forEach((value, key) => {
      allParams[key] = value;
    });

    const paramString = Object.keys(allParams)
      .sort()
      .map((key) => `${percentEncode(key)}=${percentEncode(allParams[key])}`)
      .join("&");

    const signatureBase = `${method.toUpperCase()}&${percentEncode(baseUrl)}&${percentEncode(paramString)}`;
    const signingKey = `${percentEncode(creds.consumer_secret)}&${percentEncode(creds.token_secret)}`;
    const signature = crypto.createHmac("sha256", signingKey).update(signatureBase).digest("base64");

    const headerParams = { ...oauthParams, oauth_signature: signature };
    const headerStr = Object.entries(headerParams)
      .map(([key, value]) => `${key}="${percentEncode(value)}"`)
      .join(", ");

    return `OAuth realm="${percentEncode(creds.account_id)}", ${headerStr}`;
  }

  /** Builds the record and SuiteQL base URLs and a signed fetcher for the given credentials. */
  private buildClient(credentials: Record<string, string>, orgId: string): { client: NetSuiteClient; creds: NetSuiteTbaCredentials } | null {
    const account_id = credentials.account_id;
    const consumer_key = credentials.consumer_key;
    const consumer_secret = credentials.consumer_secret;
    const token_id = credentials.token_id;
    const token_secret = credentials.token_secret;
    if (!account_id || !consumer_key || !consumer_secret || !token_id || !token_secret) return null;

    const creds: NetSuiteTbaCredentials = { account_id, consumer_key, consumer_secret, token_id, token_secret };
    const accountIdUrl = account_id.replace(/_/g, "-").toLowerCase();
    const recordBaseUrl = `https://${accountIdUrl}.suitetalk.api.netsuite.com/services/rest/record/v1`;
    const queryBaseUrl = `https://${accountIdUrl}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql`;

    const fetcher: NetSuiteFetcher = async (path: string, options?: RequestInit) => {
      const isQuery = path.startsWith("/suiteql");
      const url = isQuery ? `${queryBaseUrl}${path.slice("/suiteql".length)}` : `${recordBaseUrl}${path}`;
      const method = options?.method ?? "GET";
      const authHeader = this.buildTbaAuthHeader(method, url, creds);

      return this.fetchWithAuth(url, {
        ...options,
        headers: { ...(options?.headers as Record<string, string> | undefined), Authorization: authHeader },
        orgId,
      });
    };

    return { client: new NetSuiteClient(fetcher), creds };
  }

  async handleTool(
    toolName: string,
    args: Record<string, unknown>,
    credentials: Record<string, string>,
    orgId: string
  ): Promise<McpToolResult> {
    const built = this.buildClient(credentials, orgId);
    if (!built) return this.err("NetSuite account_id, consumer_key, consumer_secret, token_id, and token_secret are all required");

    const { client } = built;

    switch (toolName) {
      case "netsuite_run_suiteql":      return netsuite_run_suiteql(client, args);
      case "netsuite_list_invoices":    return netsuite_list_invoices(client, args);
      case "netsuite_get_invoice":      return netsuite_get_invoice(client, args);
      case "netsuite_list_orders":      return netsuite_list_orders(client, args);
      case "netsuite_list_payments":    return netsuite_list_payments(client, args);
      case "netsuite_search_customers": return netsuite_search_customers(client, args);
      default:
        return this.err(`Unknown NetSuite tool: ${toolName}`);
    }
  }
}

/** RFC 3986 percent-encoding, as required by OAuth 1.0a (stricter than encodeURIComponent). */
function percentEncode(str: string): string {
  return encodeURIComponent(str).replace(/[!*'()]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

export const netsuiteMcpServer = new NetSuiteMcpServer();

export function createNetSuiteRouter(): Router {
  const router = Router();

  router.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", integration: "netsuite", tools: netsuiteMcpServer.tools.length });
  });

  router.get("/tools", (_req: Request, res: Response) => {
    res.json({ tools: netsuiteMcpServer.tools });
  });

  router.post("/tools/:toolName", async (req: Request, res: Response) => {
    const toolName = req.params.toolName as string;
    const orgId = getOrgId(req) ?? getDefaultOrgId();
    const args = (req.body?.args ?? req.body) as Record<string, unknown>;
    if (!orgId) {
      return res.json(netsuiteMcpServer["err"]("No organization context available"));
    }

    const result = await netsuiteMcpServer.callTool(toolName, args, orgId);
    res.json(result);
  });

  router.post("/connection-test", async (req: Request, res: Response) => {
    const orgId = getOrgId(req) ?? getDefaultOrgId();
    if (!orgId) {
      return res.json({ connected: false, error: "No organization context available" });
    }
    const credentials = await netsuiteMcpServer.getCredentials(orgId);
    if (!credentials) {
      return res.json({ connected: false, error: "No credentials configured" });
    }

    const built = netsuiteMcpServer["buildClient"](credentials, orgId);
    if (!built) {
      return res.json({ connected: false, error: "account_id, consumer_key, consumer_secret, token_id, and token_secret are all required" });
    }

    try {
      const result = await built.client.runSuiteQL("SELECT id FROM customer FETCH FIRST 1 ROWS ONLY", 1, 0);
      res.json({
        connected: true,
        integration: "netsuite",
        account_id: built.creds.account_id,
        sample_row_returned: result.items.length > 0,
      });
    } catch (err: any) {
      res.json({ connected: false, error: err?.message ?? "Connection test failed" });
    }
  });

  return router;
}
