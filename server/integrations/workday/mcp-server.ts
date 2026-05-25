/**
 * Workday MCP Server — 10 tools using Workday REST API + RAAS.
 * Auth: OAuth 2.0 client credentials (Workday Authorization Server).
 * PII controls: compensation and SSN fields are stripped unless pii_level_high is granted.
 * Mounted at /api/integrations/workday
 */

import { Router, Request, Response } from "express";
import { RealMcpBase, type McpToolResult, type RealMcpToolDef } from "../../real-mcp-base";
import { WorkdayClient, type WorkdayCredentials } from "./client";
import { getOrgId, getDefaultOrgId } from "../../auth";
import {
  wd_get_worker,
  wd_search_workers,
  wd_get_organization,
  wd_list_open_positions,
  wd_get_time_off_balance,
  wd_get_pay_group,
  wd_get_headcount_report,
  wd_list_cost_centers,
  wd_get_financial_period,
  wd_get_gl_summary,
} from "./tools";

const PII_HIGH_TOOLS = new Set(["wd_get_worker", "wd_search_workers", "wd_get_pay_group"]);

export class WorkdayMcpServer extends RealMcpBase {
  readonly integrationId = "workday";

  readonly tools: RealMcpToolDef[] = [
    {
      name: "wd_get_worker",
      description: "Retrieve a Workday employee record by worker ID or email: name, title, department, manager, location, and start date. Compensation fields are redacted unless pii_level_high is granted.",
      inputSchema: {
        type: "object",
        properties: {
          worker_id: { type: "string", description: "Workday worker ID or email address (required)" },
        },
        required: ["worker_id"],
      },
    },
    {
      name: "wd_search_workers",
      description: "Search the Workday worker directory by name, department, or location. Returns a list of matching employees.",
      inputSchema: {
        type: "object",
        properties: {
          query:      { type: "string", description: "Name or keyword to search" },
          department: { type: "string", description: "Filter by department name" },
          location:   { type: "string", description: "Filter by office location" },
          limit:      { type: "number", description: "Results to return (default 20, max 100)" },
        },
      },
    },
    {
      name: "wd_get_organization",
      description: "Retrieve the Workday organizational structure for a cost center or supervisory organization.",
      inputSchema: {
        type: "object",
        properties: {
          org_id: { type: "string", description: "Workday supervisory organization or cost center ID (required)" },
        },
        required: ["org_id"],
      },
    },
    {
      name: "wd_list_open_positions",
      description: "List open Workday job requisitions with department, location, and hiring manager.",
      inputSchema: {
        type: "object",
        properties: {
          department: { type: "string", description: "Filter by department" },
          location:   { type: "string", description: "Filter by location" },
          limit:      { type: "number", description: "Results to return (default 25, max 100)" },
        },
      },
    },
    {
      name: "wd_get_time_off_balance",
      description: "Retrieve PTO and sick leave balances for a Workday employee.",
      inputSchema: {
        type: "object",
        properties: {
          worker_id: { type: "string", description: "Workday worker ID (required)" },
        },
        required: ["worker_id"],
      },
    },
    {
      name: "wd_get_pay_group",
      description: "Retrieve the pay group and compensation grade for a worker. Compensation amounts are redacted unless pii_level_high is granted.",
      inputSchema: {
        type: "object",
        properties: {
          worker_id: { type: "string", description: "Workday worker ID (required)" },
        },
        required: ["worker_id"],
      },
    },
    {
      name: "wd_get_headcount_report",
      description: "Workday RAAS headcount report by department, location, or cost center.",
      inputSchema: {
        type: "object",
        properties: {
          department:  { type: "string", description: "Filter by department" },
          location:    { type: "string", description: "Filter by location" },
          cost_center: { type: "string", description: "Filter by cost center" },
        },
      },
    },
    {
      name: "wd_list_cost_centers",
      description: "Enumerate Workday cost centers with budget owner and hierarchy.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Results to return (default 50, max 200)" },
        },
      },
    },
    {
      name: "wd_get_financial_period",
      description: "Retrieve the current fiscal period and available reporting periods from Workday.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "wd_get_gl_summary",
      description: "Retrieve the General Ledger account summary for a cost center and fiscal period via Workday RAAS.",
      inputSchema: {
        type: "object",
        properties: {
          cost_center: { type: "string", description: "Cost center ID (required)" },
          period:      { type: "string", description: "Fiscal period identifier, e.g. Q1-2025 (required)" },
        },
        required: ["cost_center", "period"],
      },
    },
  ];

  async handleTool(
    toolName: string,
    args: Record<string, unknown>,
    credentials: Record<string, string>,
    orgId: string
  ): Promise<McpToolResult> {
    const tenantName = credentials.tenant_name;
    if (!tenantName) {
      return this.err("Workday tenant_name is not configured. Connect your Workday API Client via the Integrations settings.");
    }
    const token = credentials.access_token;
    if (!token) {
      return this.err("Workday access_token is not configured. Authenticate via OAuth2 in the Integrations settings.");
    }

    const creds: WorkdayCredentials = {
      tenant_name:   tenantName,
      client_id:     credentials.client_id ?? "",
      client_secret: credentials.client_secret ?? "",
      access_token:  token,
    };

    const fetcher = (url: string, options?: RequestInit) =>
      this.fetchWithAuth(url, { ...options, orgId, bearerToken: token });

    const client = new WorkdayClient(creds, fetcher);

    // PII: allowed if credentials include pii_level_high flag (set by admin at connection time)
    const piiAllowed = credentials.pii_level === "high";

    switch (toolName) {
      case "wd_get_worker":           return wd_get_worker(client, args, piiAllowed);
      case "wd_search_workers":       return wd_search_workers(client, args, piiAllowed);
      case "wd_get_organization":     return wd_get_organization(client, args);
      case "wd_list_open_positions":  return wd_list_open_positions(client, args);
      case "wd_get_time_off_balance": return wd_get_time_off_balance(client, args);
      case "wd_get_pay_group":        return wd_get_pay_group(client, args, piiAllowed);
      case "wd_get_headcount_report": return wd_get_headcount_report(client, args);
      case "wd_list_cost_centers":    return wd_list_cost_centers(client, args);
      case "wd_get_financial_period": return wd_get_financial_period(client, args);
      case "wd_get_gl_summary":       return wd_get_gl_summary(client, args);
      default: return this.err(`Unknown Workday tool: ${toolName}`);
    }
  }
}

export const workdayMcpServer = new WorkdayMcpServer();

export function createWorkdayRouter(): Router {
  const router = Router();

  router.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", integration: "workday", tools: workdayMcpServer.tools.length });
  });

  router.get("/tools", (_req: Request, res: Response) => {
    res.json({ tools: workdayMcpServer.tools });
  });

  router.post("/tools/:toolName", async (req: Request, res: Response) => {
    const { toolName } = req.params;
    const orgId = getOrgId(req) ?? getDefaultOrgId();
    const args  = (req.body?.args ?? req.body) as Record<string, unknown>;
    const result = await workdayMcpServer.callTool(toolName, args, orgId);
    res.json(result);
  });

  router.post("/connection-test", async (req: Request, res: Response) => {
    const orgId = getOrgId(req) ?? getDefaultOrgId();
    const credentials = await workdayMcpServer.getCredentials(orgId);
    if (!credentials?.tenant_name) {
      return res.json({ connected: false, error: "No credentials configured" });
    }
    const token = credentials.access_token;
    if (!token) {
      return res.json({ connected: false, error: "access_token is missing. Complete OAuth2 flow first." });
    }
    try {
      const testRes = await workdayMcpServer["fetchWithAuth"](
        `https://wd2.myworkday.com/api/v1/${credentials.tenant_name}/workers?limit=1`,
        { bearerToken: token, orgId }
      );
      res.json({
        connected: testRes.ok,
        statusCode: testRes.status,
        integration: "workday",
        tenant: credentials.tenant_name,
        error: testRes.ok ? undefined : `HTTP ${testRes.status}`,
      });
    } catch (e: any) {
      res.json({ connected: false, error: e?.message ?? "Connection test failed" });
    }
  });

  return router;
}
