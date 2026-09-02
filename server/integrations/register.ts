/**
 * Enterprise Integration Registration — seeds mcp_servers and mcp_server_tools
 * for real CRM integrations (Salesforce, HubSpot) on server startup.
 * Analogous to mock-mcp/register.ts but for live enterprise integrations.
 * Servers are registered as inactive until credentials are connected.
 */

import { storage } from "../storage";
import { salesforceMcpServer } from "./salesforce/mcp-server";
import { hubspotMcpServer } from "./hubspot/mcp-server";
import { serviceNowMcpServer } from "./servicenow/mcp-server";
import { jiraMcpServer } from "./jira/mcp-server";
import { githubMcpServer } from "./github/mcp-server";
import { figmaMcpServer } from "./figma/mcp-server";
import { slackMcpServer } from "./slack/mcp-server";
import { microsoftGraphMcpServer } from "./msgraph/mcp-server";
import { snowflakeMcpServer } from "./snowflake/mcp-server";
import { workdayMcpServer } from "./workday/mcp-server";
import { sapMcpServer } from "./sap/mcp-server";
import { postgresMcpServer } from "./sql/postgres/mcp-server";
import { mysqlMcpServer } from "./sql/mysql/mcp-server";
import { sqlServerMcpServer } from "./sql/sqlserver/mcp-server";
import { dealerOperationsMcpServer } from "./dealer-operations/mcp-server";
import type { RealMcpBase } from "../real-mcp-base";

// PUBLIC_URL is set in production (see deploy/azure/provision.sh) to this
// app's real, externally-reachable base URL -- required for anything outside
// this process (a real MCP client, an AI-exported standalone agent) to reach
// these connectors. Falls back to localhost for local dev, where nothing
// external needs to reach it.
const BASE_URL = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 5000}`;

interface EnterpriseServerDef {
  server: RealMcpBase;
  catalogName: string;
  description: string;
  route: string;
  riskTier: "LOW" | "MEDIUM" | "HIGH";
  tags: string[];
}

function getEnterpriseServerDefs(): EnterpriseServerDef[] {
  return [
    {
      server: salesforceMcpServer,
      catalogName: "Salesforce CRM (Enterprise)",
      description: "Salesforce REST API — 12 real tools for SOQL queries, account/contact/opportunity enrichment, case management, and activity logging. Requires OAuth credentials.",
      route: "/api/integrations/salesforce",
      riskTier: "MEDIUM",
      tags: ["crm", "salesforce", "enterprise", "wave-1"],
    },
    {
      server: hubspotMcpServer,
      catalogName: "HubSpot CRM (Enterprise)",
      description: "HubSpot v3 CRM API — 10 real tools for contact/company/deal search, creation, updates, stage management, and note logging. Requires Private App token.",
      route: "/api/integrations/hubspot",
      riskTier: "MEDIUM",
      tags: ["crm", "hubspot", "enterprise", "wave-1"],
    },
    {
      server: serviceNowMcpServer,
      catalogName: "ServiceNow ITSM (Enterprise)",
      description: "ServiceNow Table API + CMDB API — 11 real tools for incident management, change requests, CMDB CI lookup, task creation, and service catalog. Supports Basic auth and OAuth Bearer.",
      route: "/api/integrations/servicenow",
      riskTier: "HIGH",
      tags: ["itsm", "servicenow", "enterprise", "wave-2"],
    },
    {
      server: jiraMcpServer,
      catalogName: "Jira Cloud (Enterprise)",
      description: "Jira Cloud REST API v3 — 10 real tools for issue search (JQL), creation, updates, transitions, sprint management, and project enumeration. Requires API token.",
      route: "/api/integrations/jira",
      riskTier: "MEDIUM",
      tags: ["devops", "jira", "enterprise", "wave-2"],
    },
    {
      server: githubMcpServer,
      catalogName: "GitHub (Enterprise)",
      description: "GitHub REST API v3 — 10 real tools for issue and PR management, code search, commit history, and repository metadata. Requires Personal Access Token.",
      route: "/api/integrations/github",
      riskTier: "MEDIUM",
      tags: ["devops", "github", "enterprise", "wave-2"],
    },
    {
      server: figmaMcpServer,
      catalogName: "Figma (Design)",
      description: "Figma REST API v1 — 8 real tools for reading file structure, exporting images, reading/posting comments, and listing team projects and files. Requires Personal Access Token.",
      route: "/api/integrations/figma",
      riskTier: "LOW",
      tags: ["design", "figma", "enterprise", "wave-3"],
    },
    {
      server: slackMcpServer,
      catalogName: "Slack (Collaboration)",
      description: "Slack Web API — 12 real tools for posting messages, reading channel history, searching messages, managing threads, reactions, files, and canvases. Requires Bot Token (xoxb-) and optional User Token (xoxp-) for search.",
      route: "/api/integrations/slack",
      riskTier: "MEDIUM",
      tags: ["collaboration", "slack", "enterprise", "wave-3"],
    },
    {
      server: microsoftGraphMcpServer,
      catalogName: "Microsoft Graph / M365 (Collaboration)",
      description: "Microsoft Graph API v1.0 — 14 real tools spanning Exchange email, Outlook Calendar, Microsoft Teams channels, SharePoint document search, and Azure AD user directory. Requires Azure App Registration OAuth2.",
      route: "/api/integrations/msgraph",
      riskTier: "HIGH",
      tags: ["collaboration", "microsoft365", "teams", "exchange", "sharepoint", "enterprise", "wave-3"],
    },
    // ── Wave 4: Data & ERP ──────────────────────────────────────────────────
    {
      server: snowflakeMcpServer,
      catalogName: "Snowflake (Data Warehouse)",
      description: "Snowflake SQL REST API v2 — 9 read-only tools for query execution, schema inspection, table search, column statistics, and query history. All queries are enforced read-only; DDL/DML is blocked. Requires account + key-pair JWT or username/password. Setup complexity: Advanced.",
      route: "/api/integrations/snowflake",
      riskTier: "MEDIUM",
      tags: ["data", "snowflake", "data-warehouse", "enterprise", "wave-4"],
    },
    {
      server: workdayMcpServer,
      catalogName: "Workday HCM & Finance (ERP)",
      description: "Workday REST API + RAAS — 10 tools for worker directory, org structure, open positions, PTO balances, pay groups, headcount reports, cost centers, GL summaries, and fiscal periods. PII fields are masked by default. Requires OAuth2 API Client setup in Workday tenant. Setup complexity: Advanced.",
      route: "/api/integrations/workday",
      riskTier: "HIGH",
      tags: ["erp", "workday", "hcm", "finance", "enterprise", "wave-4"],
    },
    {
      server: sapMcpServer,
      catalogName: "SAP S/4HANA / Business One (ERP)",
      description: "SAP OData APIs — 9 read-only tools for sales orders, purchase orders, vendors, customers, materials, inventory, invoices, and GL accounts. Supports both S/4HANA Cloud (OData v4) and Business One Service Layer via system_type selector. Setup complexity: Advanced.",
      route: "/api/integrations/sap",
      riskTier: "HIGH",
      tags: ["erp", "sap", "s4hana", "procurement", "enterprise", "wave-4"],
    },
    // ── Wave 5: General-purpose SQL connectors (Data) ────────────────────────
    {
      server: postgresMcpServer,
      catalogName: "PostgreSQL (Database)",
      description: "Direct connection to a PostgreSQL database — 7 read-only tools for query execution, schema inspection, table search, and column statistics. All queries are enforced read-only; DDL/DML is blocked. Requires host/port/database/user/password.",
      route: "/api/integrations/postgres",
      riskTier: "MEDIUM",
      tags: ["data", "postgres", "postgresql", "database", "wave-5"],
    },
    {
      server: mysqlMcpServer,
      catalogName: "MySQL / MariaDB (Database)",
      description: "Direct connection to a MySQL or MariaDB database — 7 read-only tools for query execution, schema inspection, table search, and column statistics. All queries are enforced read-only; DDL/DML is blocked. Requires host/port/database/user/password.",
      route: "/api/integrations/mysql",
      riskTier: "MEDIUM",
      tags: ["data", "mysql", "mariadb", "database", "wave-5"],
    },
    {
      server: sqlServerMcpServer,
      catalogName: "SQL Server (Database)",
      description: "Direct connection to a Microsoft SQL Server database — 7 read-only tools for query execution, schema inspection, table search, and column statistics. All queries are enforced read-only; DDL/DML is blocked. Requires host/port/database/user/password.",
      route: "/api/integrations/sqlserver",
      riskTier: "MEDIUM",
      tags: ["data", "sqlserver", "mssql", "database", "wave-5"],
    },
    {
      server: dealerOperationsMcpServer,
      catalogName: "Dealer Operations",
      description: "Equipment dealership operating system — 57 real tools across cash application, collections, OEM warranty, rental billing integrity and whole-goods deal desk. Executes against the dealer's operational database with authority limits and compliance gates enforced at the tool boundary.",
      route: "/api/integrations/dealer-operations",
      riskTier: "HIGH",
      tags: ["equipment-dealer", "dealer-erp", "finance", "warranty", "rental", "wholegoods"],
    },
  ];
}

export async function registerEnterpriseIntegrations(): Promise<{ servers: any[]; tools: number }> {
  const defs = getEnterpriseServerDefs();
  const servers: any[] = [];
  let toolCount = 0;

  for (const def of defs) {
    const baseUrl = `${BASE_URL}${def.route}`;
    const allServers = await storage.getMcpServers();
    const existing = allServers.find(s => s.name === def.catalogName);

    if (existing) {
      const patch: Record<string, unknown> = {};
      if (existing.url !== baseUrl) patch.url = baseUrl;
      if (existing.integrationId !== def.server.integrationId) patch.integrationId = def.server.integrationId;
      if (Object.keys(patch).length > 0) {
        await storage.updateMcpServer(existing.id, patch);
      }
      servers.push({ ...existing, url: baseUrl, integrationId: def.server.integrationId });

      const existingTools = await storage.getMcpServerTools(existing.id);
      for (const toolDef of def.server.tools) {
        const existingTool = existingTools.find(t => t.name === toolDef.name);
        const annotations = {
          endpoint: `/tools/${toolDef.name}`,
          method: "POST",
          enterpriseIntegration: def.server.integrationId,
          requiresCredentials: true,
        };
        if (!existingTool) {
          await storage.createMcpServerTool({
            serverId: existing.id,
            name: toolDef.name,
            description: toolDef.description,
            inputSchema: toolDef.inputSchema,
            enabled: true,
            riskClassification: "medium",
            annotations,
          });
          toolCount++;
        } else if (!(existingTool.annotations as any)?.enterpriseIntegration) {
          // Backfill. Tool rows predating this annotation were silently skipped
          // by the !existingTool guard and kept null annotations forever, which
          // is not cosmetic: executeTool() routes on tool.enterpriseIntegration.
          // Without it a connector tool misses the in-process dispatch path and
          // falls through to an HTTP self-call, which 401s in production (no
          // session cookie) AND would resolve the org's DEFAULT connection,
          // bypassing the connection pin the caller asked for.
          await storage.updateMcpServerTool(existingTool.id, {
            annotations: { ...(existingTool.annotations as any ?? {}), ...annotations },
          });
        }
      }
      toolCount += existingTools.length;
      continue;
    }

    const server = await storage.createMcpServer({
      name: def.catalogName,
      description: def.description,
      url: baseUrl,
      integrationId: def.server.integrationId,
      transportType: "streamable-http",
      status: "registered",
      riskTier: def.riskTier,
      capabilities: { tools: true, resources: false, prompts: false },
    });

    for (const toolDef of def.server.tools) {
      await storage.createMcpServerTool({
        serverId: server.id,
        name: toolDef.name,
        description: toolDef.description,
        inputSchema: toolDef.inputSchema,
        enabled: true,
        riskClassification: "medium",
        annotations: {
          endpoint: `/tools/${toolDef.name}`,
          method: "POST",
          enterpriseIntegration: def.server.integrationId,
          requiresCredentials: true,
        },
      });
      toolCount++;
    }

    servers.push(server);
  }

  return { servers, tools: toolCount };
}

export { salesforceMcpServer, hubspotMcpServer, serviceNowMcpServer, jiraMcpServer, githubMcpServer, figmaMcpServer, slackMcpServer, microsoftGraphMcpServer, snowflakeMcpServer, workdayMcpServer, sapMcpServer, postgresMcpServer, mysqlMcpServer, sqlServerMcpServer };

// ── In-process enterprise connector registry ──────────────────────────────────
// Maps integrationId → connector singleton so the agent runtime can dispatch tool
// calls directly (with the agent's own orgId) instead of making a credential-less
// HTTP self-call that would silently resolve to the default org.
const ENTERPRISE_SERVER_BY_ID = new Map<string, RealMcpBase>(
  [
    salesforceMcpServer, hubspotMcpServer, serviceNowMcpServer, jiraMcpServer,
    githubMcpServer, figmaMcpServer, slackMcpServer, microsoftGraphMcpServer, snowflakeMcpServer,
    workdayMcpServer, sapMcpServer, postgresMcpServer, mysqlMcpServer, sqlServerMcpServer,
  ].map((s) => [s.integrationId, s]),
);

export function getEnterpriseServerById(integrationId: string): RealMcpBase | undefined {
  return ENTERPRISE_SERVER_BY_ID.get(integrationId);
}
