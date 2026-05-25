/**
 * ServiceNow MCP Server — 11 real tools via Table API + CMDB API.
 * Extends RealMcpBase; auth via Basic (username:password) or Bearer (access_token).
 * Mounted at /api/integrations/servicenow
 */

import { Router, Request, Response } from "express";
import { RealMcpBase, type McpToolResult, type RealMcpToolDef } from "../../real-mcp-base";
import { ServiceNowClient } from "./client";
import { getOrgId, getDefaultOrgId } from "../../auth";
import {
  snow_create_incident,
  snow_get_incident,
  snow_update_incident,
  snow_search_incidents,
  snow_add_work_note,
  snow_create_change_request,
  snow_approve_change,
  snow_get_cmdb_ci,
  snow_search_cmdb,
  snow_create_task,
  snow_get_catalog_item,
} from "./tools";

export class ServiceNowMcpServer extends RealMcpBase {
  readonly integrationId = "servicenow";

  readonly tools: RealMcpToolDef[] = [
    {
      name: "snow_create_incident",
      description: "Create a new ServiceNow incident with category, priority, assignment group, and description.",
      inputSchema: {
        type: "object",
        properties: {
          short_description: { type: "string", description: "Brief description of the incident (required)" },
          description: { type: "string", description: "Full detailed description" },
          category: { type: "string", description: "Incident category (e.g. software, hardware, network)" },
          priority: { type: "string", enum: ["1", "2", "3", "4", "5"], description: "1=Critical, 2=High, 3=Moderate, 4=Low, 5=Planning" },
          urgency: { type: "string", enum: ["1", "2", "3"], description: "1=High, 2=Medium, 3=Low" },
          impact: { type: "string", enum: ["1", "2", "3"], description: "1=Extensive, 2=Significant, 3=Minor" },
          assignment_group: { type: "string", description: "Assignment group name" },
          caller_id: { type: "string", description: "Caller user ID or name" },
          contact_type: { type: "string", description: "How incident was reported (phone, email, self-service)" },
          business_service: { type: "string", description: "Affected business service name" },
        },
        required: ["short_description"],
      },
    },
    {
      name: "snow_get_incident",
      description: "Fetch a ServiceNow incident by number (e.g. INC0001234) or sys_id with the full field set.",
      inputSchema: {
        type: "object",
        properties: {
          number: { type: "string", description: "Incident number e.g. INC0001234" },
          sys_id: { type: "string", description: "ServiceNow sys_id of the incident" },
        },
      },
    },
    {
      name: "snow_update_incident",
      description: "Update state, priority, work notes, assignment, or other fields on a ServiceNow incident.",
      inputSchema: {
        type: "object",
        properties: {
          number: { type: "string", description: "Incident number" },
          sys_id: { type: "string", description: "ServiceNow sys_id" },
          state: { type: "string", enum: ["1", "2", "3", "6", "7", "8"], description: "1=New, 2=InProgress, 3=OnHold, 6=Resolved, 7=Closed, 8=Cancelled" },
          priority: { type: "string", enum: ["1", "2", "3", "4", "5"] },
          assignment_group: { type: "string" },
          assigned_to: { type: "string" },
          work_notes: { type: "string", description: "Internal work note" },
          comments: { type: "string", description: "Customer-visible comment" },
          close_notes: { type: "string" },
          resolution_code: { type: "string" },
        },
      },
    },
    {
      name: "snow_search_incidents",
      description: "Query ServiceNow incidents by state, priority, assignment group, category, date range, or text search.",
      inputSchema: {
        type: "object",
        properties: {
          state: { type: "string", description: "Incident state code (1-8)" },
          priority: { type: "string", description: "Priority code (1-5)" },
          assignment_group: { type: "string", description: "Assignment group name" },
          category: { type: "string", description: "Incident category" },
          opened_after: { type: "string", description: "ISO date filter for opened_at >= (e.g. 2024-01-01)" },
          text_search: { type: "string", description: "Text to search in short_description" },
          limit: { type: "number", description: "Max results (default 20, max 50)" },
        },
      },
    },
    {
      name: "snow_add_work_note",
      description: "Add a work note or customer-visible comment to any ServiceNow record (incident, change, task).",
      inputSchema: {
        type: "object",
        properties: {
          table: { type: "string", description: "Table name (default: incident)", default: "incident" },
          number: { type: "string", description: "Record number" },
          sys_id: { type: "string", description: "Record sys_id" },
          note: { type: "string", description: "Work note or comment text (required)" },
          customer_visible: { type: "boolean", description: "If true, posts as customer-visible comment; default false (internal work note)" },
        },
        required: ["note"],
      },
    },
    {
      name: "snow_create_change_request",
      description: "Create a standard or normal change request in ServiceNow.",
      inputSchema: {
        type: "object",
        properties: {
          short_description: { type: "string", description: "Brief description (required)" },
          description: { type: "string" },
          type: { type: "string", enum: ["standard", "normal", "emergency"], description: "Change type (default: normal)" },
          priority: { type: "string", enum: ["1", "2", "3", "4"] },
          risk: { type: "string", enum: ["1", "2", "3", "4"], description: "1=High, 2=Moderate, 3=Low, 4=None" },
          assignment_group: { type: "string" },
          implementation_plan: { type: "string" },
          backout_plan: { type: "string" },
          test_plan: { type: "string" },
          start_date: { type: "string", description: "Planned start date (YYYY-MM-DD HH:mm:ss)" },
          end_date: { type: "string", description: "Planned end date (YYYY-MM-DD HH:mm:ss)" },
        },
        required: ["short_description"],
      },
    },
    {
      name: "snow_approve_change",
      description: "Set approval state on a pending ServiceNow change request.",
      inputSchema: {
        type: "object",
        properties: {
          number: { type: "string", description: "Change request number (e.g. CHG0001234)" },
          sys_id: { type: "string", description: "Change request sys_id" },
          approval: { type: "string", enum: ["approved", "rejected", "requested"], description: "Approval decision (default: approved)" },
          comments: { type: "string", description: "Approval notes" },
        },
      },
    },
    {
      name: "snow_get_cmdb_ci",
      description: "Look up a ServiceNow Configuration Item (CI) by sys_id or name.",
      inputSchema: {
        type: "object",
        properties: {
          sys_id: { type: "string", description: "CI sys_id" },
          name: { type: "string", description: "CI name (partial match supported)" },
        },
      },
    },
    {
      name: "snow_search_cmdb",
      description: "Search ServiceNow CMDB by CI class, operational status, or text.",
      inputSchema: {
        type: "object",
        properties: {
          ci_class: { type: "string", description: "CMDB CI class (e.g. cmdb_ci_server, cmdb_ci_app_server). Default: cmdb_ci" },
          text: { type: "string", description: "Text search in name or short_description" },
          operational_status: { type: "string", description: "Operational status code (1=operational, 2=non-operational, 6=retired)" },
          limit: { type: "number", description: "Max results (default 20, max 50)" },
        },
      },
    },
    {
      name: "snow_create_task",
      description: "Create a ServiceNow task (sc_task) optionally linked to a parent incident or change request.",
      inputSchema: {
        type: "object",
        properties: {
          short_description: { type: "string", description: "Task description (required)" },
          description: { type: "string" },
          assignment_group: { type: "string" },
          assigned_to: { type: "string" },
          priority: { type: "string", enum: ["1", "2", "3", "4"] },
          parent: { type: "string", description: "Parent record number (e.g. INC0001234)" },
          parent_type: { type: "string", description: "Parent table name (default: incident)" },
        },
        required: ["short_description"],
      },
    },
    {
      name: "snow_get_catalog_item",
      description: "Fetch a ServiceNow Service Catalog item and its variable schema by sys_id or name.",
      inputSchema: {
        type: "object",
        properties: {
          sys_id: { type: "string", description: "Catalog item sys_id" },
          name: { type: "string", description: "Catalog item name (partial match)" },
        },
      },
    },
  ];

  async handleTool(
    toolName: string,
    args: Record<string, unknown>,
    credentials: Record<string, string>,
    orgId: string
  ): Promise<McpToolResult> {
    const instanceUrl = credentials.instance_url?.replace(/\/+$/, "");
    if (!instanceUrl) return this.err("ServiceNow instance_url is not configured");

    const baseUrl = `${instanceUrl}/api/now`;

    const fetcher = async (path: string, options?: RequestInit) => {
      const isBearer = !!credentials.access_token;
      return this.fetchWithAuth(`${baseUrl}${path}`, {
        ...options,
        ...(isBearer
          ? { bearerToken: credentials.access_token }
          : { basicAuth: { username: credentials.username ?? "", password: credentials.password ?? "" } }),
        orgId,
      });
    };

    const client = new ServiceNowClient(fetcher);

    switch (toolName) {
      case "snow_create_incident":      return snow_create_incident(client, args);
      case "snow_get_incident":         return snow_get_incident(client, args);
      case "snow_update_incident":      return snow_update_incident(client, args);
      case "snow_search_incidents":     return snow_search_incidents(client, args);
      case "snow_add_work_note":        return snow_add_work_note(client, args);
      case "snow_create_change_request": return snow_create_change_request(client, args);
      case "snow_approve_change":       return snow_approve_change(client, args);
      case "snow_get_cmdb_ci":          return snow_get_cmdb_ci(client, args);
      case "snow_search_cmdb":          return snow_search_cmdb(client, args);
      case "snow_create_task":          return snow_create_task(client, args);
      case "snow_get_catalog_item":     return snow_get_catalog_item(client, args);
      default:
        return this.err(`Unknown ServiceNow tool: ${toolName}`);
    }
  }
}

export const serviceNowMcpServer = new ServiceNowMcpServer();

export function createServiceNowRouter(): Router {
  const router = Router();

  router.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", integration: "servicenow", tools: serviceNowMcpServer.tools.length });
  });

  router.get("/tools", (_req: Request, res: Response) => {
    res.json({ tools: serviceNowMcpServer.tools });
  });

  router.post("/tools/:toolName", async (req: Request, res: Response) => {
    const { toolName } = req.params;
    const orgId = getOrgId(req) ?? getDefaultOrgId();
    const args = (req.body?.args ?? req.body) as Record<string, unknown>;

    const result = await serviceNowMcpServer.callTool(toolName, args, orgId);
    res.json(result);
  });

  router.post("/connection-test", async (req: Request, res: Response) => {
    const orgId = getOrgId(req) ?? getDefaultOrgId();
    const credentials = await serviceNowMcpServer.getCredentials(orgId);
    if (!credentials) {
      return res.json({ connected: false, error: "No credentials configured" });
    }

    const instanceUrl = credentials.instance_url?.replace(/\/+$/, "");
    if (!instanceUrl) {
      return res.json({ connected: false, error: "instance_url is missing from credentials" });
    }

    try {
      const isBearer = !!credentials.access_token;
      const testRes = await serviceNowMcpServer["fetchWithAuth"](
        `${instanceUrl}/api/now/table/incident?sysparm_limit=1`,
        isBearer
          ? { bearerToken: credentials.access_token, orgId }
          : { basicAuth: { username: credentials.username ?? "", password: credentials.password ?? "" }, orgId }
      );
      const connected = testRes.ok;
      res.json({ connected, statusCode: testRes.status, integration: "servicenow" });
    } catch (err: any) {
      res.json({ connected: false, error: err?.message ?? "Connection test failed" });
    }
  });

  return router;
}
