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
      name: "Hearst Data Platform MCP Server",
      description: "Hearst subscriber data platform: ESP event streams, website behavior from Adobe Analytics, subscription status, purchase history, and demographic enrichment from Experian/Acxiom. Covers 6.2M subscribers across 12 Hearst brands.",
      baseUrl: `${BASE_URL}/api/mock/hearst-data-platform`,
      tools: [
        {
          name: "get_esp_events",
          description: "Retrieve ESP engagement events (opens, clicks, unsubscribes, bounces) from Salesforce Marketing Cloud for one or all subscribers. Supports filtering by subscriberId, brand, and lookback window.",
          endpoint: "/esp-events",
          method: "GET",
          inputSchema: {
            type: "object",
            properties: {
              subscriberId: { type: "string", description: "Subscriber ID to filter events for (omit for portfolio view)" },
              brand: { type: "string", description: "Filter by Hearst brand name" },
              limit: { type: "number", description: "Max events to return (default 50, max 200)" },
              lookback_days: { type: "number", description: "How many days back to look (default 30)" },
            },
          },
        },
        {
          name: "get_website_behavior",
          description: "Retrieve subscriber website session data including pages visited, time on site, articles read, video plays, and content affinity signals from Adobe Analytics.",
          endpoint: "/website-behavior",
          method: "GET",
          inputSchema: {
            type: "object",
            properties: {
              subscriberId: { type: "string", description: "Subscriber ID" },
              limit: { type: "number", description: "Max sessions to return (default 30)" },
            },
          },
        },
        {
          name: "get_subscription_status",
          description: "Get current subscription status, tier (free/premium/vip), MRR, lifetime value, and churn risk for a subscriber across all Hearst brands.",
          endpoint: "/subscription-status",
          method: "GET",
          inputSchema: {
            type: "object",
            properties: {
              subscriberId: { type: "string", description: "Subscriber ID" },
            },
          },
        },
        {
          name: "get_purchase_history",
          description: "Retrieve transaction history for a subscriber including subscriptions, single issues, merchandise, and event tickets.",
          endpoint: "/purchase-history",
          method: "GET",
          inputSchema: {
            type: "object",
            properties: {
              subscriberId: { type: "string", description: "Subscriber ID" },
              limit: { type: "number", description: "Max transactions to return (default 20)" },
            },
          },
        },
        {
          name: "get_demographic_data",
          description: "Retrieve household demographic enrichment for a subscriber including age group, income, region, education, luxury propensity, and travel frequency from Experian/Acxiom.",
          endpoint: "/demographic-data",
          method: "GET",
          inputSchema: {
            type: "object",
            properties: {
              subscriberId: { type: "string", description: "Subscriber ID" },
            },
          },
        },
      ],
    },
    {
      name: "Hearst CMS MCP Server",
      description: "Hearst content management system: editorial calendar, email-sendable article inventory with topic tagging and freshness scoring, newsletter archives, and historical content performance metrics by audience segment.",
      baseUrl: `${BASE_URL}/api/mock/hearst-cms`,
      tools: [
        {
          name: "get_editorial_calendar",
          description: "Retrieve upcoming and recent editorial calendar entries across Hearst brands. Returns scheduled publish dates, content categories, and target audiences.",
          endpoint: "/editorial-calendar",
          method: "GET",
          inputSchema: {
            type: "object",
            properties: {
              brand: { type: "string", description: "Filter by Hearst brand name" },
              lookback_days: { type: "number", description: "Days back/forward to include (default 14)" },
              limit: { type: "number", description: "Max entries (default 30)" },
            },
          },
        },
        {
          name: "get_cms_articles",
          description: "Retrieve email-sendable CMS articles with topic tags, freshness scores, and historical CTR by brand. Use email_sendable=true to filter to deliverable content only.",
          endpoint: "/articles",
          method: "GET",
          inputSchema: {
            type: "object",
            properties: {
              brand: { type: "string", description: "Filter by Hearst brand name" },
              category: { type: "string", description: "Filter by content category" },
              email_sendable: { type: "string", enum: ["true", "false"], description: "Filter to email-sendable articles only" },
              limit: { type: "number", description: "Max articles (default 50)" },
            },
          },
        },
        {
          name: "get_newsletter_archives",
          description: "Retrieve historical newsletter editions with open rate, click rate, revenue attributed, and top article IDs for content deduplication and reuse analysis.",
          endpoint: "/newsletter-archives",
          method: "GET",
          inputSchema: {
            type: "object",
            properties: {
              brand: { type: "string", description: "Filter by Hearst brand name" },
              limit: { type: "number", description: "Max newsletters (default 20)" },
            },
          },
        },
        {
          name: "get_content_performance",
          description: "Retrieve detailed performance metrics for articles: opens, clicks, CTR, scroll depth, conversion rate, revenue attributed, and performance breakdown by audience segment (free/premium/vip).",
          endpoint: "/content-performance",
          method: "GET",
          inputSchema: {
            type: "object",
            properties: {
              articleId: { type: "string", description: "Specific article ID to get performance for" },
              brand: { type: "string", description: "Filter by Hearst brand name" },
              limit: { type: "number", description: "Max records (default 30)" },
            },
          },
        },
      ],
    },
    {
      name: "Hearst Email Queue MCP Server",
      description: "Hearst email operations: pending email campaign queues across all 12 brands with priority scores and recipient estimates, fatigue management rules (frequency caps, cool-down periods, score thresholds), and business rules (compliance, exclusivity, priority ordering).",
      baseUrl: `${BASE_URL}/api/mock/hearst-email-queue`,
      tools: [
        {
          name: "get_brand_email_queues",
          description: "Retrieve all pending email campaigns queued across Hearst brands for today and tomorrow. Returns subject lines, priority scores, recipient estimates, target segments, and predicted revenue.",
          endpoint: "/brand-email-queues",
          method: "GET",
          inputSchema: {
            type: "object",
            properties: {
              brand: { type: "string", description: "Filter to a specific Hearst brand" },
              limit: { type: "number", description: "Max queue entries (default 60)" },
            },
          },
        },
        {
          name: "get_fatigue_rules",
          description: "Retrieve all active fatigue management rules: weekly send caps, fatigue score thresholds, same-brand same-day blocks, cool-down periods, and unsubscribe risk guards. Essential for HOLD decision logic.",
          endpoint: "/fatigue-rules",
          method: "GET",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "get_business_rules",
          description: "Retrieve all active business rules governing send decisions: access control tiers, advertiser exclusivity windows, CCPA/CAN-SPAM compliance rules, brand priority ordering, and holiday blackout dates.",
          endpoint: "/business-rules",
          method: "GET",
          inputSchema: { type: "object", properties: {} },
        },
      ],
    },
    {
      name: "Hearst Analytics MCP Server",
      description: "Hearst email analytics: detailed send-level logs from SFMC with delivery, open, and click metrics; post-click conversion events (subscriptions, paywall, purchases); deliverability KPIs (inbox placement, sender reputation, DKIM/SPF/DMARC); and affiliate revenue attribution from Skimlinks/Amazon Associates.",
      baseUrl: `${BASE_URL}/api/mock/hearst-analytics`,
      tools: [
        {
          name: "get_send_logs",
          description: "Retrieve detailed send-level logs including delivery status, open rate, click rate, bounce type, spam rate, and inbox placement from Salesforce Marketing Cloud.",
          endpoint: "/send-logs",
          method: "GET",
          inputSchema: {
            type: "object",
            properties: {
              brand: { type: "string", description: "Filter by Hearst brand" },
              limit: { type: "number", description: "Max log entries (default 50)" },
              lookback_days: { type: "number", description: "Lookback window in days (default 7)" },
            },
          },
        },
        {
          name: "get_conversion_data",
          description: "Retrieve post-click conversion events including subscription starts, upgrades, paywall conversions, and purchases with revenue attribution and time-to-convert metrics.",
          endpoint: "/conversion-data",
          method: "GET",
          inputSchema: {
            type: "object",
            properties: {
              brand: { type: "string", description: "Filter by Hearst brand" },
              limit: { type: "number", description: "Max conversions (default 30)" },
              lookback_days: { type: "number", description: "Lookback window in days (default 30)" },
            },
          },
        },
        {
          name: "get_deliverability_metrics",
          description: "Retrieve deliverability KPIs per Hearst brand: inbox placement rate, spam rate, sender reputation score, DKIM/SPF/DMARC pass rates, and ISP-level breakdown (Gmail, Outlook, Yahoo, Apple Mail).",
          endpoint: "/deliverability",
          method: "GET",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "get_affiliate_revenue",
          description: "Retrieve affiliate revenue attribution per brand from Skimlinks and Amazon Associates: clicks, conversions, revenue, average order value, and earnings per click.",
          endpoint: "/affiliate-revenue",
          method: "GET",
          inputSchema: {
            type: "object",
            properties: {
              brand: { type: "string", description: "Filter by Hearst brand" },
              lookback_days: { type: "number", description: "Lookback window in days (default 30)" },
            },
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
      for (const toolDef of def.tools) {
        const existingTool = existingTools.find(t => t.name === toolDef.name);
        if (existingTool) {
          const ann = existingTool.annotations as Record<string, any> | null;
          if (!ann?.endpoint) {
            await storage.updateMcpServerTool(existingTool.id, {
              annotations: { endpoint: toolDef.endpoint, method: toolDef.method },
            });
          }
        } else {
          await storage.createMcpServerTool({
            serverId: existing.id,
            name: toolDef.name,
            description: toolDef.description,
            inputSchema: toolDef.inputSchema,
            enabled: true,
            riskClassification: "low",
            annotations: { endpoint: toolDef.endpoint, method: toolDef.method },
          });
        }
      }
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

