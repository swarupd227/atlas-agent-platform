/**
 * Enterprise Integration Registration — seeds mcp_servers and mcp_server_tools
 * for real CRM integrations (Salesforce, HubSpot) on server startup.
 * Analogous to mock-mcp/register.ts but for live enterprise integrations.
 * Servers are registered as inactive until credentials are connected.
 */

import { storage } from "../storage";
import { salesforceMcpServer } from "./salesforce/mcp-server";
import { hubspotMcpServer } from "./hubspot/mcp-server";
import type { RealMcpBase } from "../real-mcp-base";

const BASE_URL = `http://localhost:${process.env.PORT || 5000}`;

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
      if (existing.url !== baseUrl) {
        await storage.updateMcpServer(existing.id, { url: baseUrl });
      }
      servers.push({ ...existing, url: baseUrl });

      const existingTools = await storage.getMcpServerTools(existing.id);
      for (const toolDef of def.server.tools) {
        const existingTool = existingTools.find(t => t.name === toolDef.name);
        if (!existingTool) {
          await storage.createMcpServerTool({
            serverId: existing.id,
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
      }
      toolCount += existingTools.length;
      continue;
    }

    const server = await storage.createMcpServer({
      name: def.catalogName,
      description: def.description,
      url: baseUrl,
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

export { salesforceMcpServer, hubspotMcpServer };
