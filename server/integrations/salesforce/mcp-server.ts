/**
 * Salesforce MCP Server — extends RealMcpBase with 12 Salesforce tools.
 * Uses RealMcpBase.fetchWithAuth() for all HTTP calls so 401 token refresh
 * and 5xx/429 exponential backoff are transparently handled.
 * Express router mounts at /api/integrations/salesforce/tools/:toolName
 */

import { Router, type Request, type Response } from "express";
import { RealMcpBase, type McpToolResult, type RealMcpToolDef } from "../../real-mcp-base";
import { SalesforceClient, SalesforceAuthError, SF_API_VERSION } from "./client";
import { getOrgId, getDefaultOrgId } from "../../auth";
import {
  sfQuery, sfGetRecord, sfCreateRecord, sfUpdateRecord, sfSearch, sfListObjects,
  sfGetAccount, sfGetOpportunity, sfCreateCase, sfUpdateCaseStatus, sfAddCaseComment, sfLogActivity,
} from "./tools";

export class SalesforceMcpServer extends RealMcpBase {
  readonly integrationId = "salesforce";

  /**
   * Override refreshOAuthToken to support Salesforce sandbox orgs.
   * The base class uses the integration's static tokenUrl (login.salesforce.com),
   * but sandbox orgs must use test.salesforce.com. We check the stored sandbox
   * flag (set during OAuth callback) to select the right endpoint.
   */
  override async refreshOAuthToken(orgId: string): Promise<Record<string, string> | null> {
    const credentials = await this.getCredentials(orgId);
    if (!credentials?.refresh_token) return null;

    const isSandbox = credentials.sandbox === "true";
    const tokenUrl = isSandbox
      ? "https://test.salesforce.com/services/oauth2/token"
      : "https://login.salesforce.com/services/oauth2/token";

    try {
      const res = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: credentials.refresh_token,
          client_id: process.env["OAUTH_SALESFORCE_CLIENT_ID"] ?? "",
          client_secret: process.env["OAUTH_SALESFORCE_CLIENT_SECRET"] ?? "",
        }).toString(),
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) return null;
      const data = await res.json() as any;
      if (data.error) return null;

      const { encryptCredentialMap } = await import("../../credential-vault");
      const { storage: stor } = await import("../../storage");
      const updated: Record<string, string> = {
        ...credentials,
        access_token: data.access_token ?? credentials.access_token,
        refresh_token: data.refresh_token ?? credentials.refresh_token,
        token_type: data.token_type ?? "Bearer",
        // Salesforce may return a new instance_url on refresh
        ...(data.instance_url ? { instance_url: data.instance_url } : {}),
      };

      const credentialBlob = encryptCredentialMap(updated);
      const expiresAt = data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null;
      const conn = await stor.getIntegrationConnection(orgId, this.integrationId);
      if (conn) {
        await stor.upsertIntegrationConnection({
          ...conn,
          credentialBlob,
          tokenExpiresAt: expiresAt ?? conn.tokenExpiresAt,
        });
      }
      return updated;
    } catch {
      return null;
    }
  }

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
          objectType: {
            type: "string",
            enum: ["Contact", "Account", "Opportunity", "Case", "Lead", "Task"],
            description: "Salesforce object type to create",
          },
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
          objectTypes: {
            type: "array",
            items: { type: "string" },
            description: "Object types to search (default: Contact, Account, Lead, Opportunity)",
          },
          returnFields: {
            type: "object",
            description: "Per-object field lists to return, e.g. { Account: ['Id', 'Name', 'Industry'] }",
            additionalProperties: true,
          },
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
          objectType: {
            type: "string",
            description: "If specified, return detailed field metadata for this object only",
          },
          queryable: { type: "boolean", description: "Filter to only queryable objects (default true)" },
        },
      },
    },
    {
      name: "sf_get_account",
      description: "Enriched account view including related contacts, open opportunities, and recent cases.",
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
      description: "Advance a case through the support workflow by updating its status. Optionally add a comment.",
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
    credentials: Record<string, string>,
    orgId: string
  ): Promise<McpToolResult> {
    const instanceUrl = credentials.instance_url;
    const accessToken = credentials.access_token;

    if (!instanceUrl) {
      return this.err(
        "Salesforce instance_url is missing from stored credentials. " +
        "Please reconnect via OAuth — the instance URL is captured automatically during authorization."
      );
    }
    if (!accessToken) {
      return this.err("Salesforce access_token is missing. Please reconnect the Salesforce integration.");
    }

    // sfFetcher wraps fetchWithAuth to also handle Salesforce INVALID_SESSION_ID
    // errors that arrive in non-401 response bodies (e.g. HTTP 400).
    // On INVALID_SESSION_ID: attempt refreshOAuthToken() and retry once;
    // fall back to exposing the error so the caller can surface reconnect guidance.
    const sfFetcher = async (path: string, options?: RequestInit): Promise<Response> => {
      const url = `${instanceUrl}/services/data/${SF_API_VERSION}${path}`;
      let res = await this.fetchWithAuth(url, {
        ...options,
        bearerToken: accessToken,
        orgId,
      });

      // Salesforce can return INVALID_SESSION_ID as HTTP 400 (not 401) in some flows
      if (!res.ok && res.status !== 401) {
        const clone = res.clone();
        try {
          const body = await clone.json();
          const errCode: string | undefined =
            (Array.isArray(body) ? body[0] : body)?.errorCode;
          if (errCode === "INVALID_SESSION_ID") {
            const refreshed = await this.refreshOAuthToken(orgId);
            if (refreshed?.access_token) {
              res = await this.fetchWithAuth(url, {
                ...options,
                bearerToken: refreshed.access_token,
                orgId,
              });
            } else {
              // Surface as 401 so the client translates it to SalesforceAuthError
              return new Response(JSON.stringify(body), {
                status: 401,
                headers: { "Content-Type": "application/json" },
              });
            }
          }
        } catch (_) {
          // Body was not JSON or non-auth error — return original response unchanged
        }
      }

      return res;
    };

    const client = new SalesforceClient(sfFetcher, instanceUrl);

    try {
      switch (toolName) {
        case "sf_query":              return this.ok(await sfQuery(client, args as any));
        case "sf_get_record":         return this.ok(await sfGetRecord(client, args as any));
        case "sf_create_record":      return this.ok(await sfCreateRecord(client, args as any));
        case "sf_update_record":      return this.ok(await sfUpdateRecord(client, args as any));
        case "sf_search":             return this.ok(await sfSearch(client, args as any));
        case "sf_list_objects":       return this.ok(await sfListObjects(client, args as any));
        case "sf_get_account":        return this.ok(await sfGetAccount(client, args as any));
        case "sf_get_opportunity":    return this.ok(await sfGetOpportunity(client, args as any));
        case "sf_create_case":        return this.ok(await sfCreateCase(client, args as any));
        case "sf_update_case_status": return this.ok(await sfUpdateCaseStatus(client, args as any));
        case "sf_add_case_comment":   return this.ok(await sfAddCaseComment(client, args as any));
        case "sf_log_activity":       return this.ok(await sfLogActivity(client, args as any));
        default:
          return this.err(
            `Unknown Salesforce tool: '${toolName}'. Available: ${this.tools.map((t) => t.name).join(", ")}`
          );
      }
    } catch (e: any) {
      if (e instanceof SalesforceAuthError) {
        return this.err(`Salesforce authentication error: ${e.message}`);
      }
      const msg: string = e?.message ?? "Unknown error";
      if (msg.toLowerCase().includes("not found")) {
        return this.err(`Salesforce record not found: ${msg}`);
      }
      return this.err(`Salesforce tool '${toolName}' failed: ${msg}`);
    }
  }
}

export const salesforceMcpServer = new SalesforceMcpServer();

// ── Express router ─────────────────────────────────────────────────────────────

export function createSalesforceRouter(): Router {
  const router = Router();

  router.post("/tools/:toolName", async (req: Request, res: Response) => {
    const { toolName } = req.params;

    // Accept two payload shapes for compatibility with all callers:
    //   { args: { ... } }  — direct API callers (docs examples, UI, etc.)
    //   { soql: "...", ... } — agent runtime, which sends raw tool args as the body
    const body = req.body as Record<string, unknown>;
    const args: Record<string, unknown> =
      body.args !== undefined && body.args !== null && typeof body.args === "object" && !Array.isArray(body.args)
        ? (body.args as Record<string, unknown>)
        : body;

    // Always derive org from authenticated session — never trust caller-supplied orgId.
    // getOrgId() reads from JWT (production) or x-organization-id header (demo mode).
    const orgId = getOrgId(req) ?? getDefaultOrgId();
    if (!orgId) {
      return res.status(401).json({ error: "Authentication required to call Salesforce tools" });
    }

    const result = await salesforceMcpServer.callTool(toolName, args, orgId);
    return res.json(result);
  });

  router.get("/tools", (_req: Request, res: Response) => {
    res.json({ tools: salesforceMcpServer.tools });
  });

  return router;
}
