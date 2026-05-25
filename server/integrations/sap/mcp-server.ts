/**
 * SAP MCP Server — 9 read-only tools for SAP S/4HANA Cloud or SAP Business One.
 * Supports both OData v4 (S/4HANA) and Business One Service Layer via system_type selector.
 * Auth: Basic (username+password) or Bearer token (S/4HANA OAuth2/XSUAA).
 * Mounted at /api/integrations/sap
 */

import { Router, Request, Response } from "express";
import { RealMcpBase, type McpToolResult, type RealMcpToolDef } from "../../real-mcp-base";
import { SapClient, type SapCredentials } from "./client";
import { getOrgId, getDefaultOrgId } from "../../auth";
import {
  sap_get_sales_order,
  sap_search_sales_orders,
  sap_get_purchase_order,
  sap_get_vendor,
  sap_get_customer,
  sap_get_material,
  sap_check_inventory,
  sap_get_invoice,
  sap_search_gl_accounts,
} from "./tools";

export class SapMcpServer extends RealMcpBase {
  readonly integrationId = "sap";

  readonly tools: RealMcpToolDef[] = [
    {
      name: "sap_get_sales_order",
      description: "Retrieve a SAP sales order with line items, customer, delivery status, and total amount. Works with both S/4HANA Cloud and Business One.",
      inputSchema: {
        type: "object",
        properties: {
          order_id: { type: "string", description: "Sales order number or document ID (required)" },
        },
        required: ["order_id"],
      },
    },
    {
      name: "sap_search_sales_orders",
      description: "Search SAP sales orders by customer, status, and date range. Returns a list with totals and delivery status.",
      inputSchema: {
        type: "object",
        properties: {
          customer:  { type: "string", description: "Customer number or CardCode filter" },
          status:    { type: "string", description: "Order status filter (e.g. Open, Delivered)" },
          date_from: { type: "string", description: "Start date filter (ISO 8601 date, e.g. 2025-01-01)" },
          date_to:   { type: "string", description: "End date filter (ISO 8601 date)" },
          top:       { type: "number", description: "Results to return (default 20, max 50)" },
        },
      },
    },
    {
      name: "sap_get_purchase_order",
      description: "Retrieve a SAP purchase order with vendor, line items, and delivery confirmations.",
      inputSchema: {
        type: "object",
        properties: {
          po_id: { type: "string", description: "Purchase order number or DocEntry (required)" },
        },
        required: ["po_id"],
      },
    },
    {
      name: "sap_get_vendor",
      description: "Retrieve SAP vendor master data including payment terms, currency, and contact information.",
      inputSchema: {
        type: "object",
        properties: {
          vendor_id: { type: "string", description: "SAP vendor number or CardCode (required)" },
        },
        required: ["vendor_id"],
      },
    },
    {
      name: "sap_get_customer",
      description: "Retrieve SAP customer master data including credit limit and payment history summary.",
      inputSchema: {
        type: "object",
        properties: {
          customer_id: { type: "string", description: "SAP customer number or CardCode (required)" },
        },
        required: ["customer_id"],
      },
    },
    {
      name: "sap_get_material",
      description: "Retrieve SAP material/product master data with stock levels, valuation class, and plant data.",
      inputSchema: {
        type: "object",
        properties: {
          material_id: { type: "string", description: "SAP material number or ItemCode (required)" },
          plant:       { type: "string", description: "Plant code for plant-specific data (optional)" },
        },
        required: ["material_id"],
      },
    },
    {
      name: "sap_check_inventory",
      description: "Check real-time stock quantity for a SAP material at a specific plant or storage location.",
      inputSchema: {
        type: "object",
        properties: {
          material_id:      { type: "string", description: "SAP material number (required)" },
          plant:            { type: "string", description: "Plant code (required)" },
          storage_location: { type: "string", description: "Storage location (optional)" },
        },
        required: ["material_id", "plant"],
      },
    },
    {
      name: "sap_get_invoice",
      description: "Retrieve a SAP invoice document with line items, amounts, and payment status.",
      inputSchema: {
        type: "object",
        properties: {
          invoice_id: { type: "string", description: "SAP billing document number or DocEntry (required)" },
        },
        required: ["invoice_id"],
      },
    },
    {
      name: "sap_search_gl_accounts",
      description: "Search the SAP chart of accounts GL account list by name keyword.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search keyword matched against GL account name (required)" },
          top:   { type: "number", description: "Results to return (default 20, max 50)" },
        },
        required: ["query"],
      },
    },
  ];

  async handleTool(
    toolName: string,
    args: Record<string, unknown>,
    credentials: Record<string, string>,
    orgId: string
  ): Promise<McpToolResult> {
    const baseUrl = credentials.base_url;
    if (!baseUrl) {
      return this.err("SAP base_url is not configured. Set the S/4HANA OData base URL or Business One Service Layer URL in the Integrations settings.");
    }
    if (!credentials.username && !credentials.access_token) {
      return this.err("SAP credentials not configured. Provide username+password (Basic auth) or access_token (S/4HANA OAuth2).");
    }

    const creds: SapCredentials = {
      base_url:     baseUrl,
      username:     credentials.username,
      password:     credentials.password,
      client:       credentials.client,
      access_token: credentials.access_token,
      system_type:  (credentials.system_type as "s4hana" | "b1") ?? "s4hana",
    };

    const fetcher = (url: string, options?: RequestInit) =>
      this.fetchWithAuth(url, {
        ...options,
        orgId,
        ...(creds.access_token
          ? { bearerToken: creds.access_token }
          : { basicAuth: { username: creds.username!, password: creds.password! } }),
      });

    const client = new SapClient(creds, fetcher);

    switch (toolName) {
      case "sap_get_sales_order":     return sap_get_sales_order(client, args);
      case "sap_search_sales_orders": return sap_search_sales_orders(client, args);
      case "sap_get_purchase_order":  return sap_get_purchase_order(client, args);
      case "sap_get_vendor":          return sap_get_vendor(client, args);
      case "sap_get_customer":        return sap_get_customer(client, args);
      case "sap_get_material":        return sap_get_material(client, args);
      case "sap_check_inventory":     return sap_check_inventory(client, args);
      case "sap_get_invoice":         return sap_get_invoice(client, args);
      case "sap_search_gl_accounts":  return sap_search_gl_accounts(client, args);
      default: return this.err(`Unknown SAP tool: ${toolName}`);
    }
  }
}

export const sapMcpServer = new SapMcpServer();

export function createSapRouter(): Router {
  const router = Router();

  router.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", integration: "sap", tools: sapMcpServer.tools.length });
  });

  router.get("/tools", (_req: Request, res: Response) => {
    res.json({ tools: sapMcpServer.tools });
  });

  router.post("/tools/:toolName", async (req: Request, res: Response) => {
    const { toolName } = req.params;
    const orgId = getOrgId(req) ?? getDefaultOrgId();
    const args  = (req.body?.args ?? req.body) as Record<string, unknown>;
    const result = await sapMcpServer.callTool(toolName, args, orgId);
    res.json(result);
  });

  router.post("/connection-test", async (req: Request, res: Response) => {
    const orgId = getOrgId(req) ?? getDefaultOrgId();
    const credentials = await sapMcpServer.getCredentials(orgId);
    if (!credentials?.base_url) {
      return res.json({ connected: false, error: "No credentials configured" });
    }
    try {
      const headers: Record<string, string> = { Accept: "application/json" };
      if (credentials.access_token) {
        headers["Authorization"] = `Bearer ${credentials.access_token}`;
      } else if (credentials.username && credentials.password) {
        const b64 = Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64");
        headers["Authorization"] = `Basic ${b64}`;
      }
      if (credentials.client) headers["sap-client"] = credentials.client;

      const pingPath = credentials.system_type === "b1"
        ? `${credentials.base_url}/CompanyService_GetCompanyInfo`
        : `${credentials.base_url}/sap/opu/odata4/sap/api_business_partner/srvd_a2x/sap/business_partner/0001/?$top=1&$format=json`;

      const testRes = await fetch(pingPath, { method: "GET", headers });
      res.json({
        connected: testRes.ok,
        statusCode: testRes.status,
        integration: "sap",
        system_type: credentials.system_type ?? "s4hana",
        error: testRes.ok ? undefined : `HTTP ${testRes.status}`,
      });
    } catch (e: any) {
      res.json({ connected: false, error: e?.message ?? "Connection test failed" });
    }
  });

  return router;
}
