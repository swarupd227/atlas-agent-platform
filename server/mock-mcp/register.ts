import { storage } from "../storage";


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
      name: "Global Watchlist Screening Service",
      description: "Simulated sanctions and terrorism watchlist screening service. Screens individuals and organizations against OFAC SDN, OFAC Consolidated, UN, EU, UK HM Treasury and FBI terrorism lists, returning a clear / potential match / match / pending verdict with the matched and unmatched identifiers, the lists checked and their versions, and the screening timestamp. Deterministic: the same party always returns the same verdict.",
      baseUrl: `${BASE_URL}/api/mock/watchlist-screening`,
      tools: [
        {
          name: "screen_party",
          description: "Screen an individual or organization against sanctions and terrorism watchlists. Returns a verdict (clear, potential_match, match, pending), any matching list entries with matched and unmatched identifiers, the lists and versions checked, and the screening timestamp. A positive match is a legal prohibition on transacting and must be escalated to compliance, never overridden by a business user.",
          endpoint: "/screen-party",
          method: "POST",
          inputSchema: {
            type: "object",
            properties: {
              fullName: { type: "string", description: "Legal name of the party being screened" },
              entityType: { type: "string", enum: ["individual", "organization"], description: "Whether the party is a person or an entity" },
              dateOfBirth: { type: "string", description: "Date of birth (YYYY-MM-DD), individuals only — used to separate a true match from a false positive" },
              country: { type: "string", description: "ISO country code of the party" },
              address: { type: "string", description: "Address of the party" },
              identifiers: { type: "object", description: "Business or personal identifiers, e.g. { fein, duns, passport, registrationNumber }" },
              listScope: { type: "string", description: "Optional comma-separated list ids to restrict screening to, e.g. OFAC_SDN,UN_CONS. Defaults to all lists." },
            },
            required: ["fullName"],
          },
        },
        {
          name: "get_screening_result",
          description: "Retrieve a previously returned screening result by its screeningId, for audit evidence or to re-read the matched identifiers during adjudication.",
          endpoint: "/screening-result",
          method: "GET",
          inputSchema: {
            type: "object",
            properties: { screeningId: { type: "string", description: "Screening id returned by screen_party" } },
            required: ["screeningId"],
          },
        },
        {
          name: "list_watchlists",
          description: "List the watchlists available for screening with their authority, version and last-updated date. Record these versions with any screening result, because a clean screen against a stale list is not evidence of compliance.",
          endpoint: "/watchlists",
          method: "GET",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "get_list_entry",
          description: "Retrieve the full watchlist entry behind a match — aliases, date and place of birth, addresses, identifiers, sanctions programs and designation date — so a reviewer can adjudicate a potential match on evidence rather than on a score.",
          endpoint: "/list-entry",
          method: "GET",
          inputSchema: {
            type: "object",
            properties: { entryId: { type: "string", description: "Entry id from a screening match, e.g. SDN-24871" } },
            required: ["entryId"],
          },
        },
      ],
    },
    {
      name: "Commercial Account Administration System",
      description: "Simulated system of record for commercial client accounts. Search accounts by name and identifiers with match evidence, read an account with its agent of record, clearance, blocks, linked policies and audit trail, create an account (duplicates are refused), record a clearance decision, and link a quote to an account with the reasons issuance is still blocked. Accounts another producer is actively quoting are invisible to other producers. Deterministic seeded book.",
      baseUrl: `${BASE_URL}/api/mock/account-administration`,
      tools: [
        {
          name: "search_accounts",
          description: "Search existing client accounts by legal name, FEIN, DUNS and address. Returns candidates with a match score, what matched (normalised_name, standardised_address, fein, duns) and which identifiers conflict. A near-identical name with a different FEIN or DUNS is a different client. Pass the requesting producer's code: accounts another producer is actively quoting are excluded without notice.",
          endpoint: "/accounts",
          method: "GET",
          inputSchema: {
            type: "object",
            properties: {
              name: { type: "string", description: "Legal or partial name of the client" },
              fein: { type: "string", description: "Federal Employer Identification Number, e.g. 94-2210987" },
              duns: { type: "string", description: "Dun & Bradstreet DUNS number" },
              address: { type: "string", description: "Street address, used to corroborate a name match" },
              producerCode: { type: "string", description: "Code of the producer running the search, e.g. HCB-014" },
            },
          },
        },
        {
          name: "get_account",
          description: "Read one account: legal name, address, identifiers, agent of record, clearance status and date, any blocks with reason and owner, linked policies and quotes with status, the insured entities it covers, and its audit trail.",
          endpoint: "/account",
          method: "GET",
          inputSchema: {
            type: "object",
            properties: {
              accountId: { type: "string", description: "Account id, e.g. ACCT-100417" },
              producerCode: { type: "string", description: "Code of the producer requesting the account" },
            },
            required: ["accountId"],
          },
        },
        {
          name: "create_account",
          description: "Create a client account. Refused (created:false with the matching candidates) when an existing account matches on FEIN, DUNS, or normalised name plus standardised address. A new account starts with clearance not_screened and an audit entry for its creation.",
          endpoint: "/accounts",
          method: "POST",
          inputSchema: {
            type: "object",
            properties: {
              legalName: { type: "string", description: "Registered legal name" },
              address: { type: "string", description: "Postal address" },
              fein: { type: "string", description: "FEIN, if known" },
              duns: { type: "string", description: "DUNS, if known" },
              registrationNumber: { type: "string", description: "Non-US business registration number, if applicable" },
              producerCode: { type: "string", description: "Producer who becomes agent of record" },
              producerName: { type: "string", description: "Producer or agency name" },
              actor: { type: "string", description: "Who is creating the account, for the audit trail" },
            },
            required: ["legalName", "address"],
          },
        },
        {
          name: "record_clearance",
          description: "Record an account-level risk clearance decision (cleared, pending, referred, blocked) with the screening id, lists checked and reason. Set legalBlock for a sanctions or terrorism match: a legal block cannot later be recorded as cleared.",
          endpoint: "/clearance",
          method: "POST",
          inputSchema: {
            type: "object",
            properties: {
              accountId: { type: "string", description: "Account id" },
              status: { type: "string", enum: ["cleared", "pending", "referred", "blocked"], description: "Clearance decision" },
              screeningId: { type: "string", description: "Screening id from the watchlist screening service" },
              listsChecked: { type: "string", description: "Lists and versions checked" },
              reason: { type: "string", description: "Reason for the decision" },
              legalBlock: { type: "boolean", description: "True when the block is a legal prohibition (sanctions or terrorism match)" },
              actor: { type: "string", description: "Who recorded the decision" },
            },
            required: ["accountId", "status"],
          },
        },
        {
          name: "link_quote_to_account",
          description: "Link a quote or policy to an account. Returns whether issuance is allowed and, if not, every blocking reason (clearance not cleared, business-reason or legal blocks).",
          endpoint: "/account-links",
          method: "POST",
          inputSchema: {
            type: "object",
            properties: {
              accountId: { type: "string", description: "Account id" },
              quoteNumber: { type: "string", description: "Quote or policy number" },
              lineOfBusiness: { type: "string", description: "Line of business of the quote" },
              reason: { type: "string", description: "Why the quote is being linked to this account" },
              actor: { type: "string", description: "Who is linking it" },
            },
            required: ["accountId", "quoteNumber"],
          },
        },
      ],
    },
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
      name: "XYZ Data Platform MCP Server",
      description: "XYZ subscriber data platform: ESP event streams, website behavior from Adobe Analytics, subscription status, purchase history, and demographic enrichment from Experian/Acxiom. Covers 6.2M subscribers across 12 XYZ brands.",
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
              brand: { type: "string", description: "Filter by XYZ brand name" },
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
          description: "Get current subscription status, tier (free/premium/vip), MRR, lifetime value, and churn risk for a subscriber across all XYZ brands.",
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
      name: "XYZ CMS MCP Server",
      description: "XYZ content management system: editorial calendar, email-sendable article inventory with topic tagging and freshness scoring, newsletter archives, and historical content performance metrics by audience segment.",
      baseUrl: `${BASE_URL}/api/mock/hearst-cms`,
      tools: [
        {
          name: "get_editorial_calendar",
          description: "Retrieve upcoming and recent editorial calendar entries across XYZ brands. Returns scheduled publish dates, content categories, and target audiences.",
          endpoint: "/editorial-calendar",
          method: "GET",
          inputSchema: {
            type: "object",
            properties: {
              brand: { type: "string", description: "Filter by XYZ brand name" },
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
              brand: { type: "string", description: "Filter by XYZ brand name" },
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
              brand: { type: "string", description: "Filter by XYZ brand name" },
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
              brand: { type: "string", description: "Filter by XYZ brand name" },
              limit: { type: "number", description: "Max records (default 30)" },
            },
          },
        },
      ],
    },
    {
      name: "XYZ Email Queue MCP Server",
      description: "XYZ email operations: pending email campaign queues across all 12 brands with priority scores and recipient estimates, fatigue management rules (frequency caps, cool-down periods, score thresholds), and business rules (compliance, exclusivity, priority ordering).",
      baseUrl: `${BASE_URL}/api/mock/hearst-email-queue`,
      tools: [
        {
          name: "get_brand_email_queues",
          description: "Retrieve all pending email campaigns queued across XYZ brands for today and tomorrow. Returns subject lines, priority scores, recipient estimates, target segments, and predicted revenue.",
          endpoint: "/brand-email-queues",
          method: "GET",
          inputSchema: {
            type: "object",
            properties: {
              brand: { type: "string", description: "Filter to a specific XYZ brand" },
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
      name: "XYZ Analytics MCP Server",
      description: "XYZ email analytics: detailed send-level logs from SFMC with delivery, open, and click metrics; post-click conversion events (subscriptions, paywall, purchases); deliverability KPIs (inbox placement, sender reputation, DKIM/SPF/DMARC); and affiliate revenue attribution from Skimlinks/Amazon Associates.",
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
              brand: { type: "string", description: "Filter by XYZ brand" },
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
              brand: { type: "string", description: "Filter by XYZ brand" },
              limit: { type: "number", description: "Max conversions (default 30)" },
              lookback_days: { type: "number", description: "Lookback window in days (default 30)" },
            },
          },
        },
        {
          name: "get_deliverability_metrics",
          description: "Retrieve deliverability KPIs per XYZ brand: inbox placement rate, spam rate, sender reputation score, DKIM/SPF/DMARC pass rates, and ISP-level breakdown (Gmail, Outlook, Yahoo, Apple Mail).",
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
              brand: { type: "string", description: "Filter by XYZ brand" },
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

    // ── SCN-1.1 Fitch Rating Watch Intelligence Pipeline ────────────────────
    {
      name:        "Fitch RW — Bloomberg Terminal",
      description: "Bloomberg terminal data feed for Fitch Rating Watch Intelligence: CDS spreads (5Y senior unsecured), equity price signals, news sentiment aggregation, and composite credit-watch triggers across rated issuers.",
      baseUrl:     `${BASE_URL}/api/mock/fitch-rw-bloomberg`,
      tools: [
        {
          name: "get_cds_spreads",
          description: "Retrieve 5-year CDS spread time series and 30-day delta. Flags WIDENING_ALERT when 30d delta > 15 bps.",
          endpoint: "/cds-spreads",
          method: "GET",
          inputSchema: { type: "object", properties: { issuer_id: { type: "string" }, tenor: { type: "string" } } },
        },
        {
          name: "get_equity_prices",
          description: "Retrieve equity price, implied volatility, beta, 52-week range, and relative volume. Flags HIGH_VOL and NEAR_52W_LOW signals.",
          endpoint: "/equity-prices",
          method: "GET",
          inputSchema: { type: "object", properties: { issuer_id: { type: "string" } } },
        },
        {
          name: "get_news_sentiment",
          description: "Aggregate news sentiment score, article counts, sigma-spike detection, and top headlines for an issuer.",
          endpoint: "/news-sentiment",
          method: "GET",
          inputSchema: { type: "object", properties: { issuer_id: { type: "string" }, days_back: { type: "number" } } },
        },
        {
          name: "get_credit_watch_signals",
          description: "Composite credit-watch signal combining CDS widening, equity decline, and news sentiment. Returns WATCH_NEGATIVE / ELEVATED / STABLE.",
          endpoint: "/credit-watch-signals",
          method: "GET",
          inputSchema: { type: "object", properties: { issuer_id: { type: "string" } } },
        },
      ],
    },
    {
      name:        "Fitch RW — SEC EDGAR Intelligence",
      description: "SEC EDGAR filing intelligence for Fitch Rating Watch: 10-K/10-Q/8-K financial extracts, credit ratio time series, risk factor classification, and MD&A tone analysis.",
      baseUrl:     `${BASE_URL}/api/mock/fitch-rw-sec-edgar`,
      tools: [
        {
          name: "get_filing_extracts",
          description: "Retrieve structured financial data from 10-K, 10-Q, or 8-K filings: revenue, EBITDA, net debt, interest coverage, FCF, auditor opinion.",
          endpoint: "/filing-extracts",
          method: "GET",
          inputSchema: { type: "object", properties: { issuer_id: { type: "string" }, filing_type: { type: "string" } } },
        },
        {
          name: "get_financial_ratios",
          description: "Retrieve 8-period time series of key credit ratios: Net Debt/EBITDA, EBIT interest coverage, FCF/Debt, gross margin.",
          endpoint: "/financial-ratios",
          method: "GET",
          inputSchema: { type: "object", properties: { issuer_id: { type: "string" } } },
        },
        {
          name: "get_risk_factors",
          description: "Extract and classify material risk factors from 10-K filings by severity and flag new risks not present in prior year.",
          endpoint: "/risk-factors",
          method: "GET",
          inputSchema: { type: "object", properties: { issuer_id: { type: "string" } } },
        },
        {
          name: "get_management_discussion",
          description: "Analyze MD&A tone, guidance direction, and key credit-relevant management disclosures.",
          endpoint: "/management-discussion",
          method: "GET",
          inputSchema: { type: "object", properties: { issuer_id: { type: "string" } } },
        },
      ],
    },
    {
      name:        "Fitch RW — Peer Analytics Engine",
      description: "Peer benchmarking and cohort analytics for Fitch Rating Watch: peer group selection, ratio quartile benchmarks, rating distribution, and relative positioning.",
      baseUrl:     `${BASE_URL}/api/mock/fitch-rw-analytics`,
      tools: [
        {
          name: "get_peer_cohort",
          description: "Select a peer cohort for a given issuer using sector-first selection with ±2-notch cross-sector fallback.",
          endpoint: "/peer-cohort",
          method: "GET",
          inputSchema: { type: "object", properties: { issuer_id: { type: "string" }, sector: { type: "string" }, rating: { type: "string" } } },
        },
        {
          name: "get_ratio_benchmarks",
          description: "Compute P25 / median / P75 benchmarks for Net Debt/EBITDA, EBIT coverage, and FCF/Debt across a cohort.",
          endpoint: "/ratio-benchmarks",
          method: "GET",
          inputSchema: { type: "object", properties: { issuer_id: { type: "string" }, peer_ids: { type: "string" } } },
        },
        {
          name: "get_rating_distribution",
          description: "Distribution of IG vs. HY ratings within a sector cohort.",
          endpoint: "/rating-distribution",
          method: "GET",
          inputSchema: { type: "object", properties: { sector: { type: "string" } } },
        },
        {
          name: "compute_relative_position",
          description: "Compute weighted percentile rank vs. full universe across all 3 key credit ratios. Returns overall tier and watch implication.",
          endpoint: "/relative-position",
          method: "GET",
          inputSchema: { type: "object", properties: { issuer_id: { type: "string" } } },
        },
      ],
    },
    {
      name:        "Fitch RW — Committee Approval Gateway",
      description: "Rating committee approval gateway for Fitch Rating Watch: memo submission, validator queue management, committee decision retrieval, and regulatory disclosure logging.",
      baseUrl:     `${BASE_URL}/api/mock/fitch-rw-approval-gate`,
      tools: [
        {
          name: "submit_rating_memo",
          description: "Submit a draft rating action memo to the rating committee queue. Supports standard (24h) and expedited (2h) tracks.",
          endpoint: "/submit-memo",
          method: "POST",
          inputSchema: { type: "object", properties: { issuer_id: { type: "string" }, action_type: { type: "string" }, proposed_rating: { type: "string" }, rationale: { type: "string" }, urgency: { type: "string" } }, required: ["issuer_id","action_type","rationale"] },
        },
        {
          name: "get_validator_queue",
          description: "Retrieve current rating committee approval queue depth and item details.",
          endpoint: "/validator-queue",
          method: "GET",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "get_committee_decision",
          description: "Retrieve the committee decision for a submitted memo: APPROVED / REJECTED / PENDING.",
          endpoint: "/committee-decision",
          method: "GET",
          inputSchema: { type: "object", properties: { memo_id: { type: "string" } } },
        },
        {
          name: "log_regulatory_disclosure",
          description: "Log that SEC 17g-7 or EU CRA III Article 11 regulatory disclosure has been filed for a rating action.",
          endpoint: "/log-regulatory-disclosure",
          method: "POST",
          inputSchema: { type: "object", properties: { memo_id: { type: "string" }, regulation: { type: "string" }, issuer_id: { type: "string" }, action_type: { type: "string" } }, required: ["memo_id","regulation","issuer_id"] },
        },
      ],
    },
    {
      name: "Bridge Specialty Submission Intake",
      description: "Simulated wholesale broker submission intake for E&S property. Lists and reads submissions with their ACORD applications, statements of value and loss runs, reporting per-field extraction confidence and what a document did not state. A submission returns computed schedule aggregates (total TIV, largest single location, Tier 1 coastal exposure, values by state) rather than its location rows; the rows are available separately, paginated. Deterministic seeded book.",
      baseUrl: `${BASE_URL}/api/mock/bridge-specialty-intake`,
      tools: [
        {
          name: "list_submissions",
          description: "List submissions received from the wholesale broker, optionally filtered by status (new, in_underwriting, referred, bound, declined). Returns the insured, line of business, effective date, location count, total insured value and overall extraction confidence for each.",
          endpoint: "/submissions",
          method: "GET",
          inputSchema: {
            type: "object",
            properties: { status: { type: "string", description: "Optional status filter: new, in_underwriting, referred, bound or declined" } },
          },
        },
        {
          name: "fetch_submission",
          description: "Read one submission: insured and broker details, requested limits and deductibles, the documents received with their extraction confidence, the loss runs, and a computed schedule summary — total TIV, the largest single location, Tier 1 and Tier 2 coastal aggregates, FEMA high-hazard counts, values by state, predominant construction class and protection. Use the schedule summary for treaty evaluation and rating; do not carry location rows through the pipeline. Where extraction.missingFields names a field, the document did not state it: raise it, never infer it.",
          endpoint: "/submission",
          method: "GET",
          inputSchema: {
            type: "object",
            properties: { submissionId: { type: "string", description: "Submission id, e.g. SUB-2026-8891" } },
            required: ["submissionId"],
          },
        },
        {
          name: "get_sov_locations",
          description: "Read individual location rows from a submission's statement of values, paginated (maximum 50 per call) and optionally filtered to a coastal tier. Use only when a step genuinely needs row detail, such as assembling a bordereau or spot-checking an extraction — the schedule summary on the submission already carries the aggregates.",
          endpoint: "/sov-locations",
          method: "GET",
          inputSchema: {
            type: "object",
            properties: {
              submissionId: { type: "string", description: "Submission id, e.g. SUB-2026-8891" },
              offset: { type: "number", description: "Row offset to start from (default 0)" },
              limit: { type: "number", description: "Rows to return, maximum 50 (default 25)" },
              coastalTier: { type: "number", description: "Optional filter: 1 for Tier 1 windstorm locations, 2 for Tier 2, 0 for inland" },
            },
            required: ["submissionId"],
          },
        },
        {
          name: "get_document",
          description: "Read one received document — ACORD 125, ACORD 140, statement of values or loss run — with its extraction confidence, the fields detected, and any fields the document left unreadable. A document below the 0.85 confidence floor must be confirmed by a human before it is underwritten on.",
          endpoint: "/document",
          method: "GET",
          inputSchema: {
            type: "object",
            properties: { documentId: { type: "string", description: "Document id, e.g. DOC-8891-SOV" } },
            required: ["documentId"],
          },
        },
        {
          name: "set_submission_status",
          description: "Record where a submission has reached: new, in_underwriting, referred, bound or declined. Keeps the broker's view in step with the placement so the same submission is not worked twice.",
          endpoint: "/submission-status",
          method: "POST",
          inputSchema: {
            type: "object",
            properties: {
              submissionId: { type: "string", description: "Submission id" },
              status: { type: "string", description: "new, in_underwriting, referred, bound or declined" },
            },
            required: ["submissionId", "status"],
          },
        },
      ],
    },
    {
      name: "Insurity Rating & Predict Engine",
      description: "Simulated carrier rating and predictive analytics engine. Calculates premium deterministically from total insured value, construction class, deductibles and discretionary credit, returning every rating factor applied plus surplus lines tax and stamping fees allocated by state exposure; scores risk quality against a peer consortium cohort; and returns the carrier's delegated authority treaty terms. Refuses a discretionary credit outside underwriting authority, an unknown construction class or a deductible outside the filed range.",
      baseUrl: `${BASE_URL}/api/mock/insurity-rating`,
      tools: [
        {
          name: "rate_risk",
          description: "Calculate the premium for a risk. Returns a rating id, every factor applied (base rate by ISO construction class, coastal load, deductible credits, IRPM), the gross premium, surplus lines tax and stamping fee allocated across the states of exposure, broker commission, net carrier premium and total payable by the insured. Never estimate a premium instead of calling this: the rating id is required to bind, and a figure this engine did not produce cannot be bound against. A discretionary credit outside the -25% to +25% authority is refused, not clamped.",
          endpoint: "/rate",
          method: "POST",
          inputSchema: {
            type: "object",
            properties: {
              submissionId: { type: "string", description: "Submission being rated, e.g. SUB-2026-8891" },
              totalTiv: { type: "number", description: "Total insured value across the schedule" },
              coastalTier1Tiv: { type: "number", description: "Aggregate insured value of Tier 1 windstorm locations" },
              predominantIsoClass: { type: "number", description: "ISO construction class 1-6 (1 Frame to 6 Fire Resistive)" },
              windstormDeductiblePct: { type: "number", description: "Named storm deductible as a percentage, filed range 1-10" },
              aopDeductible: { type: "number", description: "All-other-perils deductible in dollars" },
              irpmCreditPct: { type: "number", description: "Discretionary IRPM credit or debit as a percentage, authority -25 to +25" },
              exposureByState: { type: "object", description: "Insured value by state, e.g. { FL: 120000000, TX: 40000000 } — drives statutory tax allocation" },
            },
            required: ["submissionId", "totalTiv", "predominantIsoClass"],
          },
        },
        {
          name: "score_risk",
          description: "Score risk quality against a peer consortium cohort from loss history, coastal concentration and protection. Returns a score out of 100 with the cohort mean for the occupancy, the percentage difference against peers, and the drivers that moved the score. Loss runs are required: a score without loss history is not an assessment. The score informs pricing and judgement and never overrides a treaty limit.",
          endpoint: "/predict-score",
          method: "POST",
          inputSchema: {
            type: "object",
            properties: {
              submissionId: { type: "string", description: "Submission being scored" },
              totalTiv: { type: "number", description: "Total insured value across the schedule" },
              coastalTier1Tiv: { type: "number", description: "Aggregate insured value of Tier 1 windstorm locations" },
              sprinkleredPct: { type: "number", description: "Percentage of locations sprinklered" },
              predominantOccupancy: { type: "string", description: "Predominant occupancy, e.g. Hotel - Limited Service" },
              lossRuns: { type: "array", description: "Loss run years, each { year, claimCount, incurred, largestClaim, predominantCause }" },
            },
            required: ["submissionId", "totalTiv", "lossRuns"],
          },
        },
        {
          name: "get_treaty_terms",
          description: "Read the carrier treaty in force: delegated authority limits (single risk, Tier 1 coastal aggregate, permitted states), the clause text behind each limit, mandatory endorsements, occupancy exclusions and the referral path with its service level. Quote the clause number and limit in any referral rather than paraphrasing them.",
          endpoint: "/treaty",
          method: "GET",
          inputSchema: {
            type: "object",
            properties: { treatyId: { type: "string", description: "Treaty id, e.g. CP-2026-17 (default)" } },
          },
        },
      ],
    },
    {
      name: "Insurity Policy System of Record",
      description: "Simulated policy system of record for E&S placements. Mints a policy number and issues the contract only against a rating id, dual-key sign-off by an underwriter and a senior underwriter, and the mandatory coastal endorsement where Tier 1 exposure exists. Binding is two-phase: the policy is issued pending its ledger and becomes bound and active only once balanced general ledger entries are posted. Binding the same submission twice is refused with the policy that already exists.",
      baseUrl: `${BASE_URL}/api/mock/insurity-policy-sor`,
      tools: [
        {
          name: "bind_policy",
          description: "Issue the policy (phase 1 of 2). Requires the rating id the premium came from, dual-key sign-off containing both an underwriter and a senior_underwriter role, and — where Tier 1 coastal exposure exists — at least one manuscript endorsement. Returns the minted policy number and the documents archived. Refused, with the reason, when sign-off is incomplete, the mandatory endorsement is absent, or the submission is already bound. The policy is NOT active until its ledger is posted: do not report it as bound or queue it to a bordereau before then.",
          endpoint: "/policies",
          method: "POST",
          inputSchema: {
            type: "object",
            properties: {
              submissionId: { type: "string", description: "Submission being bound, e.g. SUB-2026-8891" },
              ratingId: { type: "string", description: "Rating id returned by rate_risk" },
              insuredName: { type: "string", description: "Insured legal name" },
              effectiveDate: { type: "string", description: "Policy effective date (YYYY-MM-DD)" },
              expiryDate: { type: "string", description: "Policy expiry date (YYYY-MM-DD)" },
              carrierCode: { type: "string", description: "Carrier code, default CARRIER-A" },
              locationCount: { type: "number", description: "Number of locations on the schedule" },
              coastalTier1Tiv: { type: "number", description: "Aggregate Tier 1 windstorm insured value — drives the mandatory endorsement check" },
              endorsementIds: { type: "array", description: "Endorsement ids attached, e.g. [\"ME-004\"]" },
              signOffs: { type: "array", description: "Sign-offs, each { role, name, decidedAt }; roles underwriter and senior_underwriter are both required" },
              grossPremium: { type: "number", description: "Gross premium from the rating result" },
              brokerCommission: { type: "number", description: "Broker commission from the rating result" },
              surplusLinesTax: { type: "number", description: "Surplus lines tax from the rating result" },
              stampingFee: { type: "number", description: "Stamping fee from the rating result" },
              netCarrierPremium: { type: "number", description: "Net carrier premium from the rating result" },
            },
            required: ["submissionId", "ratingId", "insuredName", "effectiveDate"],
          },
        },
        {
          name: "post_ledger_entries",
          description: "Post the general ledger entries and complete the commit (phase 2 of 2), moving the policy to bound and active. Entries must balance: an unbalanced journal is refused rather than posted. Posting twice is refused with the journal that already exists, because a double-posted premium is a reconciliation break.",
          endpoint: "/ledger",
          method: "POST",
          inputSchema: {
            type: "object",
            properties: {
              policyNumber: { type: "string", description: "Policy number returned by bind_policy" },
              grossPremium: { type: "number", description: "Gross written premium" },
              brokerCommission: { type: "number", description: "Producer commission" },
              surplusLinesTax: { type: "number", description: "Statutory surplus lines tax" },
              stampingFee: { type: "number", description: "Stamping office fee" },
              netCarrierPremium: { type: "number", description: "Net premium to the carrier" },
            },
            required: ["policyNumber"],
          },
        },
        {
          name: "get_policy",
          description: "Read a bound policy by policy number or by the submission it came from: status, sign-offs, endorsements, premium breakdown, ledger journal, archived documents and audit trail.",
          endpoint: "/policy",
          method: "GET",
          inputSchema: {
            type: "object",
            properties: {
              policyNumber: { type: "string", description: "Policy number, e.g. POL-2026-8891-CP" },
              submissionId: { type: "string", description: "Alternatively, the submission id the policy was bound from" },
            },
          },
        },
      ],
    },
    {
      name: "Surplus Lines Compliance & Bordereau Queue",
      description: "Simulated surplus lines compliance service and carrier bordereau queue. Returns per-state filing requirements (stamping office, premium tax and stamping rates, filing deadline, diligent effort and affidavit), lints manuscript endorsement wording against the carrier's approved clause taxonomy — rejecting unapproved clauses, reporting clauses the exposure makes mandatory, and refusing amendments to standard forms — and maintains the carrier's monthly bordereau, where a policy may appear only once per period.",
      baseUrl: `${BASE_URL}/api/mock/surplus-lines-compliance`,
      tools: [
        {
          name: "get_filing_requirements",
          description: "Read surplus lines filing requirements for one or more states (comma separated), or all states when none is given: stamping office, premium tax and stamping fee percentages, filing deadline in days from the effective date, whether a diligent effort search is required and how many declinations, and the affidavit form. File in every state where there is exposure, not only the insured's domicile.",
          endpoint: "/filing-requirements",
          method: "GET",
          inputSchema: {
            type: "object",
            properties: { state: { type: "string", description: "State code or comma-separated codes, e.g. FL or FL,TX,AL,LA" } },
          },
        },
        {
          name: "verify_clause_taxonomy",
          description: "Check manuscript endorsement wording before it can be bound. Returns approved true only when every clause id is in the carrier's approved taxonomy, every clause the exposure makes mandatory is attached (the coastal windstorm provision and percentage wind deductible for Tier 1 exposure, the FEMA V and AE flood exclusion for high-hazard flood zones), and no standard form has been amended. Unapproved clauses and missing mandatory clauses are named individually.",
          endpoint: "/clause-check",
          method: "POST",
          inputSchema: {
            type: "object",
            properties: {
              carrierCode: { type: "string", description: "Carrier code, default CARRIER-A" },
              clauseIds: { type: "array", description: "Clause ids the endorsement attaches, e.g. [\"CP-0010\", \"CP-1218\", \"ME-004\"]" },
              amendedClauses: { type: "array", description: "Clause ids whose wording the endorsement modifies" },
              exposure: { type: "object", description: "Exposure driving mandatory clauses: { coastalTier1Tiv, femaHighHazardLocationCount }" },
            },
            required: ["clauseIds"],
          },
        },
        {
          name: "append_bordereau",
          description: "Append a bound and active policy to the carrier's monthly bordereau for reconciliation. A policy may appear only once per reporting period: a repeat append is refused with the row that already exists, because a double-counted policy breaks the carrier's reconciliation.",
          endpoint: "/bordereau",
          method: "POST",
          inputSchema: {
            type: "object",
            properties: {
              carrierCode: { type: "string", description: "Carrier code, default CARRIER-A" },
              period: { type: "string", description: "Reporting month formatted YYYY-MM, e.g. 2026-11" },
              policyNumber: { type: "string", description: "Policy number, e.g. POL-2026-8891-CP" },
              submissionId: { type: "string", description: "Originating submission id" },
              insuredName: { type: "string", description: "Insured legal name" },
              effectiveDate: { type: "string", description: "Policy effective date" },
              expiryDate: { type: "string", description: "Policy expiry date" },
              locationCount: { type: "number", description: "Number of locations covered" },
              treatyClassificationCode: { type: "string", description: "Treaty classification code for the cession" },
              grossPremium: { type: "number", description: "Gross premium" },
              netCarrierPremium: { type: "number", description: "Net carrier premium" },
              surplusLinesTax: { type: "number", description: "Surplus lines tax" },
              stampingFee: { type: "number", description: "Stamping fee" },
              statesOfExposure: { type: "array", description: "State codes where the risk has exposure" },
            },
            required: ["policyNumber", "period"],
          },
        },
        {
          name: "get_bordereau",
          description: "Read the carrier's bordereau for a reporting month: every row queued, with premium, tax, stamping and location totals for reconciliation against the ledger.",
          endpoint: "/bordereau",
          method: "GET",
          inputSchema: {
            type: "object",
            properties: {
              carrierCode: { type: "string", description: "Carrier code, default CARRIER-A" },
              period: { type: "string", description: "Reporting month formatted YYYY-MM" },
            },
            required: ["period"],
          },
        },
      ],
    },
    {
      name: "ServiceNow CMDB (Sandbox)",
      description: "Stand-in for the customer's ServiceNow while REST access to the live instance is being arranged. Reads mirror the real connector's shapes -- Table API rows, CMDB relationships, incident and change history -- over a generated semiconductor estate that carries the problems the control tower exists for: configuration items with no owner, records Discovery has not seen for months, two sources describing the same machine, items nothing depends on, and services with no tier. Every write needs the id of an approval a person gave, records what the field held before, and returns an undo id.",
      baseUrl: `${BASE_URL}/api/mock/servicenow-cmdb`,
      tools: [
        {
          name: "snow_estate_summary",
          description: "The shape of the estate in one call: how many configuration items, how many without an owner or a support group, how many services without a tier, how many not seen by Discovery in 90 days, how many nothing depends on, and the counts by class. Start here to size a problem before pulling records.",
          endpoint: "/estate",
          method: "GET",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "snow_query_table",
          description: "Read any of the readable tables (cmdb_ci, cmdb_rel_ci, incident, change_request, sys_user, task) with a ServiceNow encoded query. Supports field=value, field!=value, fieldISEMPTY, fieldISNOTEMPTY and fieldLIKEtext joined by ^ -- for example assigned_toISEMPTY^sys_class_name=cmdb_ci_server.",
          endpoint: "/table",
          method: "GET",
          inputSchema: {
            type: "object",
            properties: {
              table: { type: "string", description: "Table name, e.g. cmdb_ci" },
              query: { type: "string", description: "Encoded query, e.g. assigned_toISEMPTY^environment=Production" },
              fields: { type: "string", description: "Comma-separated fields to return" },
              limit: { type: "number", description: "Rows to return, up to 200 (default 25)" },
            },
            required: ["table"],
          },
        },
        {
          name: "snow_get_cmdb_ci",
          description: "One configuration item in full, with the signals an inference needs: whether it has an owner, a support group and a tier, how long since Discovery saw it, how many items depend on it, and its incident counts.",
          endpoint: "/ci",
          method: "GET",
          inputSchema: {
            type: "object",
            properties: { ci: { type: "string", description: "sys_id or name of the configuration item" } },
            required: ["ci"],
          },
        },
        {
          name: "snow_search_cmdb",
          description: "Find configuration items by text, class or condition: unowned=true for items missing an owner or support group, untiered=true for those with no criticality, stale_days for those Discovery has not seen in that many days.",
          endpoint: "/search",
          method: "GET",
          inputSchema: {
            type: "object",
            properties: {
              q: { type: "string", description: "Text to match in the name or description" },
              class: { type: "string", description: "Class filter, e.g. cmdb_ci_server, cmdb_ci_appl, cmdb_ci_service" },
              unowned: { type: "string", description: "\"true\" to return only items with no owner or no support group" },
              untiered: { type: "string", description: "\"true\" to return only items with no business criticality" },
              stale_days: { type: "number", description: "Only items last discovered at least this many days ago" },
              limit: { type: "number", description: "Rows to return, up to 200 (default 25)" },
            },
          },
        },
        {
          name: "snow_cmdb_relationships",
          description: "Walk the dependency graph around a configuration item: dependants (what breaks if it fails) and depends_on (what it needs), to the depth asked for, with the Tier 1 dependants and the owners to notify called out. This is the blast radius.",
          endpoint: "/relationships",
          method: "GET",
          inputSchema: {
            type: "object",
            properties: {
              ci: { type: "string", description: "sys_id or name of the configuration item" },
              direction: { type: "string", description: "up (dependants), down (dependencies) or both (default)" },
              depth: { type: "number", description: "How many hops to walk, up to 4 (default 2)" },
            },
            required: ["ci"],
          },
        },
        {
          name: "snow_ci_history",
          description: "The incidents and changes that touched a configuration item, with a tally of the people and groups who worked them and its incident rate over the last 90 days. This is the evidence behind an inferred owner and behind a tier.",
          endpoint: "/history",
          method: "GET",
          inputSchema: {
            type: "object",
            properties: { ci: { type: "string", description: "sys_id or name of the configuration item" } },
            required: ["ci"],
          },
        },
        {
          name: "snow_duplicate_candidates",
          description: "Records that look like the same physical thing seen twice, matched on serial number or address, with each record's discovery source, dependants and last discovery so a merge can keep the right one.",
          endpoint: "/duplicates",
          method: "GET",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "snow_orphan_candidates",
          description: "Configuration items nothing depends on and nothing depends upon, last seen by Discovery at least stale_days ago -- the retirement shortlist.",
          endpoint: "/orphans",
          method: "GET",
          inputSchema: {
            type: "object",
            properties: { stale_days: { type: "number", description: "Days since last discovery, default 90" } },
          },
        },
        {
          name: "snow_update_ci",
          description: "Change fields on a configuration item -- owner, support group, criticality, install or operational status, environment, description. Requires approvalRef, the id of the approval a person gave. One approval covers every record that decision covered, so use it for each of them in turn; writing the same fields on the same record twice under it is refused. Returns what each field held before and an undo id. Retiring an item other items still depend on is refused, with the dependants named.",
          endpoint: "/ci/update",
          method: "POST",
          inputSchema: {
            type: "object",
            properties: {
              ci: { type: "string", description: "sys_id or name of the configuration item" },
              fields: { type: "object", description: "Fields to set, e.g. { \"assigned_to\": \"Rosa Martinez\", \"support_group\": \"Platform Engineering\" }" },
              approvalRef: { type: "string", description: "Id of the approval that authorised this write" },
            },
            required: ["ci", "fields", "approvalRef"],
          },
        },
        {
          name: "snow_rollback_update",
          description: "Put a configuration item back exactly as it was before a write, by the undo id that write returned.",
          endpoint: "/ci/rollback",
          method: "POST",
          inputSchema: {
            type: "object",
            properties: { undoId: { type: "string", description: "Undo id returned by snow_update_ci" } },
            required: ["undoId"],
          },
        },
        {
          name: "snow_create_relationship",
          description: "Add a dependency edge between two configuration items once a person has approved it. Requires approvalRef. Refused when the edge already exists or both ends are the same item.",
          endpoint: "/relationship",
          method: "POST",
          inputSchema: {
            type: "object",
            properties: {
              parent: { type: "string", description: "The dependent item (the one that needs the other)" },
              child: { type: "string", description: "The item depended upon" },
              type: { type: "string", description: "Relationship type, default \"Depends on::Used by\"" },
              approvalRef: { type: "string", description: "Id of the approval that authorised this edge" },
            },
            required: ["parent", "child", "approvalRef"],
          },
        },
        {
          name: "snow_create_task",
          description: "Open a task against a configuration item -- an attestation for an inferred owner to confirm, or remediation work. The task lands in that person's queue; their confirmation is the attestation, not ours.",
          endpoint: "/task",
          method: "POST",
          inputSchema: {
            type: "object",
            properties: {
              ci: { type: "string", description: "Configuration item the task is about" },
              short_description: { type: "string", description: "One line describing what is being asked" },
              description: { type: "string", description: "The detail, including the evidence behind the request" },
              assigned_to: { type: "string", description: "Person the task goes to" },
              assignment_group: { type: "string", description: "Group the task goes to" },
              due_date: { type: "string", description: "Due date, YYYY-MM-DD" },
            },
            required: ["short_description"],
          },
        },
        {
          name: "snow_add_work_note",
          description: "Write a work note onto a change request or incident by its number, so an assessment sits on the record the approver actually reads.",
          endpoint: "/worknote",
          method: "POST",
          inputSchema: {
            type: "object",
            properties: {
              table: { type: "string", description: "change_request (default) or incident" },
              number: { type: "string", description: "Record number, e.g. CHG0025001" },
              note: { type: "string", description: "The note to add" },
              added_by: { type: "string", description: "Who it is recorded as coming from" },
            },
            required: ["number", "note"],
          },
        },
        {
          name: "snow_write_audit",
          description: "Everything this connector has been asked to change: each write with its before and after values, the approval that authorised it, whether it was rolled back, plus tasks opened and work notes added.",
          endpoint: "/audit",
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

