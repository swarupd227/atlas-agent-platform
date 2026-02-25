import { storage } from "../storage";
import { v4 as uuidv4 } from "uuid";

const BASE_URL = `http://localhost:${process.env.PORT || 5000}`;

interface MockMcpServerDef {
  name: string;
  description: string;
  baseUrl: string;
  tools: {
    name: string;
    description: string;
    endpoint: string;
    method: string;
    inputSchema: object;
  }[];
}

function getServerDefinitions(): MockMcpServerDef[] {
  return [
    {
      name: "Marketo Marketing Automation",
      description: "Marketo REST API for lead management, smart lists, campaign triggering, and engagement tracking. Provides access to 1,000 financial services marketing leads.",
      baseUrl: `${BASE_URL}/api/mock/marketo`,
      tools: [
        {
          name: "get_leads",
          description: "Retrieve marketing leads filtered by ID, email, company, business line, region, status, or engagement score range. Returns lead records with engagement scores, activity history, and contact details.",
          endpoint: "/rest/v1/leads.json",
          method: "GET",
          inputSchema: {
            type: "object",
            properties: {
              filterType: { type: "string", enum: ["id", "email", "company", "businessLine", "status", "region", "leadScore"], description: "Field to filter leads by" },
              filterValues: { type: "string", description: "Comma-separated filter values" },
              batchSize: { type: "string", description: "Number of leads to return (default 20, max 100)" },
              nextPageToken: { type: "string", description: "Pagination token from previous response" },
            },
          },
        },
        {
          name: "update_leads",
          description: "Create or update lead records in Marketo. Supports updating engagement scores, status, and other fields.",
          endpoint: "/rest/v1/leads.json",
          method: "POST",
          inputSchema: {
            type: "object",
            properties: {
              action: { type: "string", enum: ["createOrUpdate", "createOnly", "updateOnly"], description: "Operation type" },
              input: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    engagementScore: { type: "number" },
                    status: { type: "string" },
                  },
                },
                description: "Array of lead records to create/update",
              },
            },
            required: ["action", "input"],
          },
        },
        {
          name: "get_smart_lists",
          description: "Retrieve pre-built smart lists for targeted marketing campaigns. Lists include High Intent Ratings, Webinar Attendees, CreditSights Prospects, EMEA Enterprise, and more.",
          endpoint: "/rest/asset/v1/smartLists.json",
          method: "GET",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "trigger_campaign",
          description: "Trigger a nurture campaign for specified leads. Activates automated email sequences, content delivery, and engagement tracking.",
          endpoint: "/rest/v1/campaigns/{campaignId}/trigger.json",
          method: "POST",
          inputSchema: {
            type: "object",
            properties: {
              campaignId: { type: "string", description: "Campaign ID to trigger (e.g., 2001-2006)" },
              leadIds: { type: "array", items: { type: "string" }, description: "Lead IDs to enroll in campaign" },
            },
            required: ["campaignId"],
          },
        },
        {
          name: "get_activities",
          description: "Retrieve lead engagement activity history including email opens, clicks, page visits, content downloads, webinar attendance, and form submissions.",
          endpoint: "/rest/v1/activities.json",
          method: "GET",
          inputSchema: {
            type: "object",
            properties: {
              leadId: { type: "string", description: "Filter activities by lead ID" },
              activityTypeId: { type: "string", description: "Filter by activity type (email_open, email_click, page_visit, content_download, webinar_registration, webinar_attended, form_submit, video_view)" },
              batchSize: { type: "string", description: "Number of activities to return" },
            },
          },
        },
      ],
    },
    {
      name: "Salesforce CRM",
      description: "Salesforce REST API for CRM operations including SOQL queries, lead/contact/account management, opportunity tracking, and task creation. Connected to financial services lead database.",
      baseUrl: `${BASE_URL}/api/mock/salesforce`,
      tools: [
        {
          name: "query_records",
          description: "Execute SOQL queries against Salesforce objects (Contact, Lead, Account, Opportunity, Campaign). Supports WHERE clauses for filtering by email, company, status, region, and rated entity flag.",
          endpoint: "/services/data/v59.0/query/",
          method: "GET",
          inputSchema: {
            type: "object",
            properties: {
              q: { type: "string", description: "SOQL query string, e.g., SELECT Id, Name, Email FROM Contact WHERE Company = 'BlackRock'" },
            },
            required: ["q"],
          },
        },
        {
          name: "create_lead",
          description: "Create a new lead record in Salesforce. Returns a Salesforce-style ID on success.",
          endpoint: "/services/data/v59.0/sobjects/Lead/",
          method: "POST",
          inputSchema: {
            type: "object",
            properties: {
              FirstName: { type: "string" },
              LastName: { type: "string" },
              Email: { type: "string" },
              Company: { type: "string" },
              Title: { type: "string" },
              Status: { type: "string" },
              LeadSource: { type: "string" },
            },
            required: ["LastName", "Company"],
          },
        },
        {
          name: "update_lead",
          description: "Update fields on an existing Salesforce lead record. Supports updating Owner, Status, Score, and other fields.",
          endpoint: "/services/data/v59.0/sobjects/Lead/{leadId}",
          method: "PATCH",
          inputSchema: {
            type: "object",
            properties: {
              leadId: { type: "string", description: "Salesforce Lead ID to update" },
              OwnerId: { type: "string" },
              Status: { type: "string" },
              Rating: { type: "string" },
              Description: { type: "string" },
            },
            required: ["leadId"],
          },
        },
        {
          name: "create_task",
          description: "Create a follow-up task assigned to a sales rep in Salesforce. Used for scheduling calls, meetings, and follow-up activities.",
          endpoint: "/services/data/v59.0/sobjects/Task/",
          method: "POST",
          inputSchema: {
            type: "object",
            properties: {
              Subject: { type: "string", description: "Task subject/title" },
              WhoId: { type: "string", description: "Contact/Lead ID this task relates to" },
              OwnerId: { type: "string", description: "User ID of the task assignee" },
              ActivityDate: { type: "string", description: "Due date (YYYY-MM-DD)" },
              Description: { type: "string" },
              Priority: { type: "string", enum: ["High", "Normal", "Low"] },
            },
            required: ["Subject"],
          },
        },
      ],
    },
    {
      name: "Adobe Analytics",
      description: "Adobe Analytics API for web analytics reporting including page views, referral sources, conversion funnels, visitor segments, and engagement metrics.",
      baseUrl: `${BASE_URL}/api/mock/adobe`,
      tools: [
        {
          name: "run_report",
          description: "Execute an Adobe Analytics report. Returns web analytics data including page views by URL, referral sources, conversion funnel steps, and time-on-page. Supports filtering by date range, dimension (page, referrer, funnel), and visitor segment.",
          endpoint: "/api/2.0/reports",
          method: "POST",
          inputSchema: {
            type: "object",
            properties: {
              rsid: { type: "string", description: "Report suite ID (default: fitch-prod)" },
              dimension: { type: "string", enum: ["page", "referrer", "marketingChannel", "event", "funnel"], description: "Primary dimension for the report" },
              globalFilters: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    type: { type: "string" },
                    dateRange: { type: "string" },
                    segmentId: { type: "string" },
                  },
                },
                description: "Filters to apply (date range, segments)",
              },
              metricContainer: {
                type: "object",
                properties: {
                  metrics: { type: "array", items: { type: "object", properties: { id: { type: "string" } } } },
                },
                description: "Metrics to include in report",
              },
            },
          },
        },
        {
          name: "get_segments",
          description: "List available Adobe Analytics visitor segments including Ratings Content Consumers, Webinar Registrants, High Engagement Visitors, ESG Research Audience, and more.",
          endpoint: "/api/2.0/segments",
          method: "GET",
          inputSchema: { type: "object", properties: {} },
        },
      ],
    },
  ];
}

export async function registerMockMcpServers(): Promise<{ servers: any[]; tools: number }> {
  const defs = getServerDefinitions();
  const servers: any[] = [];
  let toolCount = 0;

  for (const def of defs) {
    const existing = (await storage.getMcpServers()).find(s => s.name === def.name);
    if (existing) {
      if (existing.url !== def.baseUrl) {
        await storage.updateMcpServer(existing.id, { url: def.baseUrl });
      }
      servers.push({ ...existing, url: def.baseUrl });
      const existingTools = await storage.getMcpServerTools(existing.id);
      toolCount += existingTools.length;
      continue;
    }

    const server = await storage.createMcpServer({
      name: def.name,
      description: def.description,
      url: def.baseUrl,
      transportType: "streamable-http",
      status: "production-enabled",
      riskTier: "LOW",
      capabilities: { tools: true, resources: false, prompts: false },
    });

    for (const toolDef of def.tools) {
      await storage.createMcpServerTool({
        serverId: server.id,
        name: toolDef.name,
        description: toolDef.description,
        inputSchema: toolDef.inputSchema,
        enabled: true,
        riskClassification: "low",
        annotations: {
          endpoint: toolDef.endpoint,
          method: toolDef.method,
        },
      });
      toolCount++;
    }

    servers.push(server);
  }

  return { servers, tools: toolCount };
}

export async function seedMarketingDemo(): Promise<{
  servers: any[];
  tools: number;
  outcome: any;
  agents: any[];
  kpis: any[];
}> {
  const { servers, tools } = await registerMockMcpServers();

  const marketoServer = servers.find(s => s.name.includes("Marketo"));
  const salesforceServer = servers.find(s => s.name.includes("Salesforce"));
  const adobeServer = servers.find(s => s.name.includes("Adobe"));

  const existingOutcomes = await storage.getOutcomes();
  let outcome = existingOutcomes.find(o => o.name === "Marketing Lead Management");

  if (!outcome) {
    outcome = await storage.createOutcome({
      name: "Marketing Lead Management",
      description: "End-to-end marketing lead lifecycle management for financial services. Covers lead scoring, qualification, routing, nurture campaigns, and conversion analytics across Ratings, Solutions, Learning, and CreditSights business lines.",
      status: "active",
      industry: "financial_services",
      owner: "Marketing Operations",
      priority: "high",
      slaTarget: 95,
    });
  }

  const existingKpis = await storage.getKpis(outcome.id);
  let kpis = existingKpis;

  if (existingKpis.length === 0) {
    const kpiDefs = [
      { name: "Lead Qualification Rate", target: 35, currentValue: 0, unit: "percent", weight: 30, description: "Percentage of leads that qualify as MQL or SQL" },
      { name: "Lead Response Time", target: 4, currentValue: 0, unit: "hours", weight: 25, description: "Average time to first meaningful contact with a new lead" },
      { name: "Campaign Conversion Rate", target: 12, currentValue: 0, unit: "percent", weight: 25, description: "Percentage of campaign-engaged leads that convert to opportunities" },
      { name: "Marketing Revenue Attribution", target: 500000, currentValue: 0, unit: "USD", weight: 20, description: "Revenue attributed to marketing-sourced leads" },
    ];

    kpis = [];
    for (const kpiDef of kpiDefs) {
      const kpi = await storage.createKpi({
        outcomeId: outcome.id,
        name: kpiDef.name,
        target: kpiDef.target,
        currentValue: kpiDef.currentValue,
        unit: kpiDef.unit,
        weight: kpiDef.weight,
        status: "on_track",
        expression: "",
      });
      kpis.push(kpi);
    }
  }

  const existingAgents = await storage.getAgents();
  const agents: any[] = [];

  const agentDefs = [
    {
      name: "Lead Scoring Agent",
      description: "Analyzes lead engagement data from Marketo and web analytics to compute dynamic lead scores. Uses engagement history, content consumption patterns, and firmographic data to prioritize leads for sales outreach.",
      type: "single" as const,
      mcpServers: [marketoServer?.id, adobeServer?.id].filter(Boolean),
      systemPrompt: "You are a lead scoring AI agent for a financial services company. Your role is to analyze lead engagement data and assign accurate lead scores. Use the Marketo API to fetch lead records and activity history, and Adobe Analytics for web behavior data. Score leads based on: engagement frequency (30%), content relevance to their business line (25%), seniority level (20%), company profile (15%), and recency (10%). Flag any leads at rated entities for special handling. Output a JSON report with lead ID, computed score, scoring factors, and recommended action (nurture, MQL, SQL, or disqualify).",
    },
    {
      name: "Lead Router Agent",
      description: "Routes qualified leads to appropriate sales teams based on business line, region, account tier, and capacity. Creates follow-up tasks in Salesforce and triggers appropriate nurture campaigns in Marketo.",
      type: "single" as const,
      mcpServers: [marketoServer?.id, salesforceServer?.id].filter(Boolean),
      systemPrompt: "You are a lead routing AI agent for a financial services company. Your role is to route qualified leads to the right sales representatives. Use Salesforce to query existing accounts and contacts, create tasks for sales follow-up, and update lead ownership. Use Marketo to trigger nurture campaigns for leads not yet ready for sales. Routing rules: Rated entity leads go to Key Account team, EMEA leads to regional specialists, high-score (>75) leads get immediate assignment, moderate (40-75) enter nurture track. Create detailed follow-up tasks with context from the lead's engagement history.",
    },
    {
      name: "Marketing Analytics Agent",
      description: "Generates marketing performance reports by combining web analytics, campaign data, and CRM metrics. Identifies trends, anomalies, and optimization opportunities across all marketing channels.",
      type: "single" as const,
      mcpServers: [adobeServer?.id, marketoServer?.id, salesforceServer?.id].filter(Boolean),
      systemPrompt: "You are a marketing analytics AI agent for a financial services company. Your role is to analyze marketing performance across all channels and generate actionable insights. Use Adobe Analytics for web traffic and conversion data, Marketo for campaign performance and engagement metrics, and Salesforce for pipeline and revenue attribution. Generate reports covering: channel performance comparison, content engagement trends, conversion funnel analysis, segment behavior patterns, and ROI by campaign. Highlight anomalies and recommend optimizations. Format output as a structured analytics report with executive summary, key metrics, trend analysis, and recommended actions.",
    },
  ];

  for (const agentDef of agentDefs) {
    const existing = existingAgents.find(a => a.name === agentDef.name);
    if (existing) {
      agents.push(existing);
      continue;
    }

    const agent = await storage.createAgent({
      name: agentDef.name,
      description: agentDef.description,
      type: agentDef.type,
      status: "ready",
      model: "gpt-4.1",
      systemPrompt: agentDef.systemPrompt,
      industry: "financial_services",
      owner: "Marketing Operations",
      outcomeId: outcome.id,
    });

    if (agentDef.mcpServers.length > 0) {
      for (const serverId of agentDef.mcpServers) {
        if (serverId) {
          try {
            const existingLink = await storage.getAgentMcpServerByIds(agent.id, serverId);
            if (!existingLink) {
              await storage.createAgentMcpServer({ agentId: agent.id, serverId });
            }
          } catch (e) {}
        }
      }
    }

    agents.push(agent);
  }

  return { servers, tools, outcome, agents, kpis };
}
