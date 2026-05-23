/**
 * HubSpot MCP Server — extends RealMcpBase with 10 HubSpot v3 CRM tools.
 * Uses RealMcpBase.fetchWithAuth() for all HTTP calls so 429 rate-limit backoff
 * and 5xx retry are transparently handled by the base class.
 * Express router mounts at /api/integrations/hubspot/tools/:toolName
 */

import { Router, type Request, type Response } from "express";
import { RealMcpBase, type McpToolResult, type RealMcpToolDef } from "../../real-mcp-base";
import { HubSpotClient, HubSpotAuthError, HubSpotRateLimitError, HS_BASE } from "./client";
import { getOrgId, getDefaultOrgId } from "../../auth";
import {
  hsSearchContacts, hsGetContact, hsCreateContact, hsUpdateContact,
  hsSearchCompanies, hsGetDeal, hsCreateDeal, hsUpdateDealStage,
  hsCreateNote, hsSearchDeals,
} from "./tools";

export class HubSpotMcpServer extends RealMcpBase {
  readonly integrationId = "hubspot";

  readonly tools: RealMcpToolDef[] = [
    {
      name: "hs_search_contacts",
      description: "Search HubSpot contacts by email, name, company, or lifecycle stage.",
      inputSchema: {
        type: "object",
        properties: {
          email: { type: "string", description: "Filter by email (partial match)" },
          name: { type: "string", description: "Filter by contact name (first, last, or full name)" },
          company: { type: "string", description: "Filter by company name (partial match)" },
          lifecyclestage: {
            type: "string",
            description: "Filter by lifecycle stage (subscriber, lead, marketingqualifiedlead, salesqualifiedlead, opportunity, customer, evangelist)",
          },
          limit: { type: "number", description: "Max contacts to return (default 20, max 100)" },
        },
      },
    },
    {
      name: "hs_get_contact",
      description: "Retrieve a full HubSpot contact record by ID, with associated companies and deals.",
      inputSchema: {
        type: "object",
        properties: {
          contactId: { type: "string", description: "HubSpot contact ID" },
          includeCompanies: { type: "boolean", description: "Include associated companies (default true)" },
          includeDeals: { type: "boolean", description: "Include associated deals (default true)" },
        },
        required: ["contactId"],
      },
    },
    {
      name: "hs_create_contact",
      description: "Create a new HubSpot contact with properties and optional company association.",
      inputSchema: {
        type: "object",
        properties: {
          email: { type: "string", description: "Contact email address (required, must be valid)" },
          firstName: { type: "string", description: "Contact first name" },
          lastName: { type: "string", description: "Contact last name" },
          phone: { type: "string", description: "Contact phone number" },
          company: { type: "string", description: "Company name (text property)" },
          jobTitle: { type: "string", description: "Job title" },
          lifecyclestage: { type: "string", description: "Lifecycle stage (lead, opportunity, customer, etc.)" },
          companyId: { type: "string", description: "HubSpot Company ID to associate with" },
        },
        required: ["email"],
      },
    },
    {
      name: "hs_update_contact",
      description: "Update properties on an existing HubSpot contact.",
      inputSchema: {
        type: "object",
        properties: {
          contactId: { type: "string", description: "HubSpot contact ID to update" },
          properties: {
            type: "object",
            description: "Contact property key-value pairs (HubSpot internal names: firstname, lastname, email, phone, jobtitle, lifecyclestage)",
            additionalProperties: { type: "string" },
          },
        },
        required: ["contactId", "properties"],
      },
    },
    {
      name: "hs_search_companies",
      description: "Search HubSpot companies by name, domain, industry, or city.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Filter by company name (partial match)" },
          domain: { type: "string", description: "Filter by domain (e.g. 'acme.com')" },
          industry: { type: "string", description: "Filter by industry (exact HubSpot enum value)" },
          city: { type: "string", description: "Filter by city (partial match)" },
          limit: { type: "number", description: "Max companies to return (default 20, max 100)" },
        },
      },
    },
    {
      name: "hs_get_deal",
      description: "Retrieve a HubSpot deal by ID, including stage, amount, and associated contacts.",
      inputSchema: {
        type: "object",
        properties: {
          dealId: { type: "string", description: "HubSpot deal ID" },
          includeContacts: { type: "boolean", description: "Include associated contacts (default true)" },
        },
        required: ["dealId"],
      },
    },
    {
      name: "hs_create_deal",
      description: "Create a new HubSpot deal in a specified pipeline stage.",
      inputSchema: {
        type: "object",
        properties: {
          dealName: { type: "string", description: "Deal name (required)" },
          dealStage: {
            type: "string",
            description: "Pipeline stage ID (required). Common values: appointmentscheduled, qualifiedtobuy, closedwon, closedlost",
          },
          amount: { type: "number", description: "Deal value in account currency" },
          pipeline: { type: "string", description: "Pipeline ID (default: 'default')" },
          closeDate: { type: "string", description: "Expected close date YYYY-MM-DD" },
          priority: { type: "string", enum: ["low", "medium", "high"], description: "Deal priority" },
          description: { type: "string", description: "Deal description or notes" },
          contactId: { type: "string", description: "Contact ID to associate" },
          companyId: { type: "string", description: "Company ID to associate" },
        },
        required: ["dealName", "dealStage"],
      },
    },
    {
      name: "hs_update_deal_stage",
      description: "Move a HubSpot deal to a new pipeline stage. Optionally update amount and close date.",
      inputSchema: {
        type: "object",
        properties: {
          dealId: { type: "string", description: "HubSpot deal ID to update" },
          dealStage: { type: "string", description: "New pipeline stage ID" },
          amount: { type: "number", description: "Updated deal amount (optional)" },
          closeDate: { type: "string", description: "Updated close date YYYY-MM-DD (optional)" },
        },
        required: ["dealId", "dealStage"],
      },
    },
    {
      name: "hs_create_note",
      description: "Add a note/engagement to any HubSpot CRM object (contact, company, or deal).",
      inputSchema: {
        type: "object",
        properties: {
          objectType: {
            type: "string",
            enum: ["contacts", "companies", "deals"],
            description: "HubSpot object type to attach the note to",
          },
          objectId: { type: "string", description: "HubSpot object ID" },
          body: { type: "string", description: "Note body text" },
          timestamp: { type: "string", description: "Note timestamp in ISO 8601 format (default: now)" },
        },
        required: ["objectType", "objectId", "body"],
      },
    },
    {
      name: "hs_search_deals",
      description: "Search HubSpot deals by pipeline, stage, owner, or amount range.",
      inputSchema: {
        type: "object",
        properties: {
          pipeline: { type: "string", description: "Filter by pipeline ID" },
          dealStage: { type: "string", description: "Filter by stage ID (exact match)" },
          ownerId: { type: "string", description: "Filter by HubSpot owner user ID" },
          minAmount: { type: "number", description: "Minimum deal amount" },
          maxAmount: { type: "number", description: "Maximum deal amount" },
          sortBy: {
            type: "string",
            enum: ["amount", "createdate", "closedate", "lastmodifieddate"],
            description: "Sort field (default: lastmodifieddate)",
          },
          sortDirection: {
            type: "string",
            enum: ["ASCENDING", "DESCENDING"],
            description: "Sort direction (default: DESCENDING)",
          },
          limit: { type: "number", description: "Max deals to return (default 20, max 100)" },
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
    const apiKey = credentials.api_key;
    if (!apiKey) {
      return this.err(
        "HubSpot api_key (Private App Token) is missing from stored credentials. " +
        "Please reconnect the HubSpot integration."
      );
    }

    // Build a fetcher using RealMcpBase.fetchWithAuth() for:
    // - Bearer token injection
    // - 429 → Retry-After / exponential backoff (HubSpot: 100 req/10 sec)
    // - 5xx → exponential backoff retry
    const hsFetcher = (path: string, options?: RequestInit) =>
      this.fetchWithAuth(`${HS_BASE}${path}`, {
        ...options,
        bearerToken: apiKey,
        orgId,
      });

    const client = new HubSpotClient(hsFetcher);

    try {
      switch (toolName) {
        case "hs_search_contacts":  return this.ok(await hsSearchContacts(client, args as any));
        case "hs_get_contact":      return this.ok(await hsGetContact(client, args as any));
        case "hs_create_contact":   return this.ok(await hsCreateContact(client, args as any));
        case "hs_update_contact":   return this.ok(await hsUpdateContact(client, args as any));
        case "hs_search_companies": return this.ok(await hsSearchCompanies(client, args as any));
        case "hs_get_deal":         return this.ok(await hsGetDeal(client, args as any));
        case "hs_create_deal":      return this.ok(await hsCreateDeal(client, args as any));
        case "hs_update_deal_stage": return this.ok(await hsUpdateDealStage(client, args as any));
        case "hs_create_note":      return this.ok(await hsCreateNote(client, args as any));
        case "hs_search_deals":     return this.ok(await hsSearchDeals(client, args as any));
        default:
          return this.err(
            `Unknown HubSpot tool: '${toolName}'. Available: ${this.tools.map((t) => t.name).join(", ")}`
          );
      }
    } catch (e: any) {
      if (e instanceof HubSpotAuthError) {
        return this.err(`HubSpot authentication error: ${e.message}`);
      }
      if (e instanceof HubSpotRateLimitError) {
        return this.err("HubSpot rate limit exceeded (100 req/10 sec). The request will be retried automatically.");
      }
      const msg: string = e?.message ?? "Unknown error";
      if (msg.toLowerCase().includes("not found")) {
        return this.err(`HubSpot record not found: ${msg}`);
      }
      return this.err(`HubSpot tool '${toolName}' failed: ${msg}`);
    }
  }
}

export const hubspotMcpServer = new HubSpotMcpServer();

// ── Express router ─────────────────────────────────────────────────────────────

export function createHubSpotRouter(): Router {
  const router = Router();

  router.post("/tools/:toolName", async (req: Request, res: Response) => {
    const { toolName } = req.params;
    const { args = {} } = req.body as { args?: Record<string, unknown> };

    // Always derive org from authenticated session — never trust caller-supplied orgId.
    // getOrgId() reads from JWT (production) or x-organization-id header (demo mode).
    const orgId = getOrgId(req) ?? getDefaultOrgId();
    if (!orgId) {
      return res.status(401).json({ error: "Authentication required to call HubSpot tools" });
    }

    const result = await hubspotMcpServer.callTool(toolName, args, orgId);
    return res.json(result);
  });

  router.get("/tools", (_req: Request, res: Response) => {
    res.json({ tools: hubspotMcpServer.tools });
  });

  return router;
}
