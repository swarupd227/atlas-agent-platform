/**
 * Salesforce MCP Server — extends RealMcpBase with 12 Salesforce tools.
 * Handles credential resolution, token refresh, retry/backoff via base class.
 * Express router mounts at /api/integrations/salesforce/tools/:toolName
 */

import { Router, type Request, type Response } from "express";
import { RealMcpBase, type McpToolResult, type RealMcpToolDef } from "../../real-mcp-base";
import { SalesforceClient, SalesforceAuthError } from "./client";
import {
  sfQuery, sfGetRecord, sfCreateRecord, sfUpdateRecord, sfSearch, sfListObjects,
  sfGetAccount, sfGetOpportunity, sfCreateCase, sfUpdateCaseStatus, sfAddCaseComment, sfLogActivity,
} from "./tools";

export class SalesforceMcpServer extends RealMcpBase {
  readonly integrationId = "salesforce";

  readonly tools: RealMcpToolDef[] = [
    {
      name: "sf_query",
      description: "Run an arbitrary SOQL query against Salesforce. Returns typed records. Use a LIMIT clause for efficiency.",
      inputSchema: {
        type: "object",
        properties: {
          soql: { type: "string", description: "Full SOQL query string, e.g. SELECT Id, Name FROM Account WHERE Industry = 'Technology' LIMIT 20" },
          limit: { type: "number", description: "Max records to return if no LIMIT in query (default 50, max 200)" },
        },
        required: ["soql"],
      },
    },
    {
      name: "sf_get_record",
      description: "Fetch a single Salesforce record by object type and ID, with optional field selection.",
      inputSchema: {
        type: "object",
        properties: {
          objectType: { type: "string", description: "Salesforce object type (e.g. Account, Contact, Opportunity, Case, Lead)" },
          id: { type: "string", description: "Salesforce record ID (15 or 18 char)" },
          fields: { type: "array", items: { type: "string" }, description: "Specific fields to return (omit for all default fields)" },
        },
        required: ["objectType", "id"],
      },
    },
    {
      name: "sf_create_record",
      description: "Create a new Salesforce record. Supports Contact, Account, Opportunity, Case, Lead, Task.",
      inputSchema: {
        type: "object",
        properties: {
          objectType: { type: "string", enum: ["Contact", "Account", "Opportunity", "Case", "Lead", "Task"], description: "Salesforce object type to create" },
          fields: {
            type: "object",
            description: "Field values for the new record. Field names must match Salesforce API names (e.g. FirstName, LastName, Email for Contact).",
            additionalProperties: true,
          },
        },
        required: ["objectType", "fields"],
      },
    },
    {
      name: "sf_update_record",
      description: "Update fields on an existing Salesforce record by object type and ID.",
      inputSchema: {
        type: "object",
        properties: {
          objectType: { type: "string", description: "Salesforce object type (e.g. Account, Contact, Opportunity)" },
          id: { type: "string", description: "Salesforce record ID to update" },
          fields: { type: "object", description: "Fields to update with new values", additionalProperties: true },
        },
        required: ["objectType", "id", "fields"],
      },
    },
    {
      name: "sf_search",
      description: "SOSL global search across Salesforce objects. Useful for finding records by name or keyword across multiple objects.",
      inputSchema: {
        type: "object",
        properties: {
          searchTerm: { type: "string", description: "Search term (supports wildcards: * and ?)" },
          objectTypes: { type: "array", items: { type: "string" }, description: "Object types to search (default: Contact, Account, Lead, Opportunity)" },
          returnFields: { type: "object", description: "Per-object field lists to return, e.g. { Account: ['Id', 'Name', 'Industry'] }", additionalProperties: true },
          limit: { type: "number", description: "Max results per object (default 20, max 50)" },
        },
        required: ["searchTerm"],
      },
    },
    {
      name: "sf_list_objects",
      description: "Enumerate available Salesforce objects (global describe). Optionally describe a specific object's fields.",
      inputSchema: {
        type: "object",
        properties: {
          objectType: { type: "string", description: "If specified, return detailed field metadata for this object only" },
          queryable: { type: "boolean", description: "Filter to only queryable objects (default true)" },
        },
      },
    },
    {
      name: "sf_get_account",
      description: "Enriched account view including related contacts, open opportunities, and recent cases. Use accountId from SOQL query or sf_search.",
      inputSchema: {
        type: "object",
        properties: {
          accountId: { type: "string", description: "Salesforce Account record ID" },
          includeContacts: { type: "boolean", description: "Include related contacts (default true)" },
          includeOpportunities: { type: "boolean", description: "Include open opportunities (default true)" },
          includeCases: { type: "boolean", description: "Include recent cases (default true)" },
        },
        required: ["accountId"],
      },
    },
    {
      name: "sf_get_opportunity",
      description: "Full opportunity record with stage history and associated contacts. Useful for pipeline analysis.",
      inputSchema: {
        type: "object",
        properties: {
          opportunityId: { type: "string", description: "Salesforce Opportunity record ID" },
          includeStageHistory: { type: "boolean", description: "Include stage change history (default true)" },
          includeContacts: { type: "boolean", description: "Include associated contact roles (default true)" },
        },
        required: ["opportunityId"],
      },
    },
    {
      name: "sf_create_case",
      description: "Create a support case in Salesforce with subject, description, priority, and optional account/contact link.",
      inputSchema: {
        type: "object",
        properties: {
          subject: { type: "string", description: "Case subject/title (required)" },
          description: { type: "string", description: "Detailed case description" },
          priority: { type: "string", enum: ["High", "Medium", "Low"], description: "Case priority (default Medium)" },
          status: { type: "string", description: "Initial case status (default New)" },
          accountId: { type: "string", description: "Account ID to link this case to" },
          contactId: { type: "string", description: "Contact ID to link this case to" },
          origin: { type: "string", description: "Case origin: Web, Phone, Email (default Web)" },
          type: { type: "string", description: "Case type, e.g. Problem, Feature Request, Question" },
        },
        required: ["subject"],
      },
    },
    {
      name: "sf_update_case_status",
      description: "Advance a case through the support workflow by updating its status. Optionally add a comment at the same time.",
      inputSchema: {
        type: "object",
        properties: {
          caseId: { type: "string", description: "Salesforce Case record ID" },
          status: { type: "string", description: "New status value, e.g. 'In Progress', 'Escalated', 'Closed'" },
          comment: { type: "string", description: "Optional comment to add when updating status" },
        },
        required: ["caseId", "status"],
      },
    },
    {
      name: "sf_add_case_comment",
      description: "Append a comment to an existing Salesforce case. Can be public (visible to customer) or private.",
      inputSchema: {
        type: "object",
        properties: {
          caseId: { type: "string", description: "Salesforce Case record ID" },
          comment: { type: "string", description: "Comment text to add" },
          isPublic: { type: "boolean", description: "Whether comment is visible to customer portal (default true)" },
        },
        required: ["caseId", "comment"],
      },
    },
    {
      name: "sf_log_activity",
      description: "Create a Task or Event record against any Salesforce object to log an activity (call, meeting, follow-up).",
      inputSchema: {
        type: "object",
        properties: {
          activityType: { type: "string", enum: ["Task", "Event"], description: "Type of activity (default Task)" },
          subject: { type: "string", description: "Activity subject/title" },
          whoId: { type: "string", description: "Contact or Lead ID this activity relates to" },
          whatId: { type: "string", description: "Account, Opportunity, or other object ID" },
          description: { type: "string", description: "Activity description or notes" },
          dueDate: { type: "string", description: "Due date for Task in YYYY-MM-DD format" },
          status: { type: "string", description: "Task status (default Completed)" },
          priority: { type: "string", enum: ["High", "Normal", "Low"], description: "Task priority (default Normal)" },
          durationInMinutes: { type: "number", description: "Event duration in minutes (default 60)" },
          startDateTime: { type: "string", description: "Event start time in ISO 8601 format" },
        },
        required: ["subject"],
      },
    },
  ];

  async handleTool(
    toolName: string,
    args: Record<string, unknown>,
    credentials: Record<string, string>
  ): Promise<McpToolResult> {
    let client: SalesforceClient;
    try {
      client = new SalesforceClient(credentials);
    } catch (e: any) {
      return this.err(`Salesforce configuration error: ${e.message}`);
    }

    try {
      switch (toolName) {
        case "sf_query":            return this.ok(await sfQuery(client, args as any));
        case "sf_get_record":       return this.ok(await sfGetRecord(client, args as any));
        case "sf_create_record":    return this.ok(await sfCreateRecord(client, args as any));
        case "sf_update_record":    return this.ok(await sfUpdateRecord(client, args as any));
        case "sf_search":           return this.ok(await sfSearch(client, args as any));
        case "sf_list_objects":     return this.ok(await sfListObjects(client, args as any));
        case "sf_get_account":      return this.ok(await sfGetAccount(client, args as any));
        case "sf_get_opportunity":  return this.ok(await sfGetOpportunity(client, args as any));
        case "sf_create_case":      return this.ok(await sfCreateCase(client, args as any));
        case "sf_update_case_status": return this.ok(await sfUpdateCaseStatus(client, args as any));
        case "sf_add_case_comment": return this.ok(await sfAddCaseComment(client, args as any));
        case "sf_log_activity":     return this.ok(await sfLogActivity(client, args as any));
        default:
          return this.err(`Unknown Salesforce tool: ${toolName}. Available tools: ${this.tools.map(t => t.name).join(", ")}`);
      }
    } catch (e: any) {
      if (e instanceof SalesforceAuthError) {
        return this.err(`Salesforce authentication error: ${e.message}. Please reconnect the Salesforce integration.`);
      }
      const msg = e?.message ?? "Unknown error";
      return this.err(`Salesforce tool '${toolName}' failed: ${msg}`);
    }
  }
}

export const salesforceMcpServer = new SalesforceMcpServer();

// ── Express router for tool dispatch ─────────────────────────────────────────

export function createSalesforceRouter(): Router {
  const router = Router();

  router.post("/tools/:toolName", async (req: Request, res: Response) => {
    const { toolName } = req.params;
    const { args = {}, orgId } = req.body as { args?: Record<string, unknown>; orgId?: string };

    const resolvedOrgId: string = orgId ?? (req as any).user?.organizationId ?? "";
    if (!resolvedOrgId) {
      return res.status(400).json({ error: "orgId is required to call a Salesforce tool" });
    }

    const result = await salesforceMcpServer.callTool(toolName, args, resolvedOrgId);
    return res.json(result);
  });

  router.get("/tools", (_req: Request, res: Response) => {
    res.json({ tools: salesforceMcpServer.tools });
  });

  return router;
}
