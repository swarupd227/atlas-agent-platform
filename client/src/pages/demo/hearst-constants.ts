/**
 * Hearst: Next Best Action — Agent Team Constants
 *
 * Multi-brand email optimization agent team for Hearst Media.
 * Builds unified subscriber profiles across all Hearst brands
 * (Cosmopolitan, Esquire, Elle, Harper's Bazaar, Men's Health,
 * Women's Health, Oprah Daily, etc.) and drives personalized
 * engagement decisions.
 *
 * 5-Agent Pipeline:
 *   1. Subscriber Profile Engine — nightly batch + real-time on new events
 *   2. Content Inventory Agent — daily refresh at 6am ET
 *   3. NBA Email Decision Agent — daily at 2am ET
 *   4. Send Time Optimizer — weekly recompute, applied daily
 *   5. Performance & Learning Agent — continuous monitoring + weekly learning
 *
 * Agents are pre-created in the dev environment via API.
 */

export const HEARST_AGENTS = {
  subscriberProfileEngine: {
    id: "3a2e02ad-f07a-42ff-9c16-d9b4956dc34d",
    name: "Subscriber Profile Engine",
    description: "Builds unified engagement profiles per subscriber across all Hearst brands with affinity vectors, channel preferences, optimal send time, fatigue score, and lifecycle stage.",
    autonomyMode: "autonomous",
    riskTier: "MEDIUM",
    department: "Audience Development",
  },
  contentInventory: {
    id: "92584a77-d150-4436-9083-a108584bc021",
    name: "Content Inventory Agent",
    description: "Catalogs all email-sendable content across all Hearst brands with topic tagging, freshness scoring, and historical performance data. Produces a ContentCatalog with topic tags, brand attribution, freshness score, and past CTR segmented by audience type.",
    autonomyMode: "autonomous",
    riskTier: "MEDIUM",
    department: "Audience Development",
  },
  nbaEmailDecision: {
    id: "151db72c-0038-4f01-a4bb-45650a82e8b6",
    name: "NBA Email Decision Agent",
    description: "For each subscriber each day, scores every candidate email using the 6-component NBEmail_Score formula: w1=0.25 (content_affinity) + w2=0.15 (recency_novelty) + w3=0.15 (brand_affinity) + w4=0.20 (revenue_potential) − w5=0.15 (fatigue_cost) − w6=0.10 (cannibalization_cost). Selects the highest-scoring email or recommends HOLD if the best score falls below the 0.25 threshold. Key differentiator: Atlas maximizes subscriber lifetime value, not send volume — HOLD decisions improve next-day open rates by 18–25%.",
    autonomyMode: "autonomous",
    riskTier: "MEDIUM",
    department: "Audience Development",
    scoringFormula: {
      weights: { w1: 0.25, w2: 0.15, w3: 0.15, w4: 0.20, w5: 0.15, w6: 0.10 },
      components: ["content_affinity", "recency_novelty", "brand_affinity", "revenue_potential", "fatigue_cost", "cannibalization_cost"] as const,
      holdThreshold: 0.25,
    },
  },
  sendTimeOptimizer: {
    id: "7de4167e-6b0c-4f04-9fcf-3693bda1d255",
    name: "Send Time Optimizer",
    description: "Determines the optimal send time for each subscriber based on their historical open patterns, timezone, and day-of-week behavior. Produces a PersonalizedSendTime per subscriber (hour + minute in their local timezone).",
    autonomyMode: "autonomous",
    riskTier: "MEDIUM",
    department: "Audience Development",
  },
  performanceLearning: {
    id: "8cb64dc1-278e-44bf-8f42-9b11a1c4f82d",
    name: "Performance & Learning Agent",
    description: "Tracks the outcomes of every NBA email decision, computes lift metrics, and feeds learnings back into the decision model. Produces weekly performance reports with model weight updates and anomaly alerts.",
    autonomyMode: "autonomous",
    riskTier: "MEDIUM",
    department: "Audience Development",
  },
} as const;

export const HEARST_MCP_SERVERS = {
  dataPlatform: {
    id: "087a3dd1-9f39-4a03-a3cf-af6ec3458cde",
    name: "Hearst Data Platform MCP Server",
    tools: ["get_esp_events", "get_website_behavior", "get_subscription_status", "get_purchase_history", "get_demographic_data"],
  },
  cms: {
    id: "7bef66a7-25fd-4aca-afa0-d70c80ee5d28",
    name: "Hearst CMS MCP Server",
    tools: ["get_editorial_calendar", "get_cms_articles", "get_newsletter_archives", "get_content_performance"],
  },
  emailQueue: {
    id: "12957574-8fea-4060-a05e-87bd779da5c9",
    name: "Hearst Email Queue MCP Server",
    tools: ["get_brand_email_queues", "get_fatigue_rules", "get_business_rules"],
  },
  analytics: {
    id: "1a24362d-f0eb-4b52-8d47-067b0408494f",
    name: "Hearst Analytics MCP Server",
    tools: ["get_send_logs", "get_conversion_data", "get_deliverability_metrics", "get_affiliate_revenue"],
  },
} as const;

export const HEARST_DATA_TOOLS = {
  get_esp_events: {
    id: "bda9d921-0c0f-4b60-a97b-a788a2109f99",
    description: "ESP opens/clicks/unsubs from Salesforce Marketing Cloud",
  },
  get_website_behavior: {
    id: "14d543e2-571a-413c-9b58-8373b83aafab",
    description: "Browse and content engagement from Adobe Analytics",
  },
  get_subscription_status: {
    id: "3e6947a3-151d-4ad2-8376-0707b9923ff6",
    description: "Active subscriptions and billing state per subscriber",
  },
  get_purchase_history: {
    id: "8a2500af-d3d9-4023-a3cf-5751858d3652",
    description: "Transaction and entitlement history across Hearst properties",
  },
  get_demographic_data: {
    id: "0d102d8f-4202-4d52-b1a8-ba188d21c8cd",
    description: "Household and 3rd-party demographic enrichment from Experian/Acxiom",
  },
} as const;

export const HEARST_CMS_TOOLS = {
  get_editorial_calendar: {
    id: "b27b1a5f-b202-4f0f-8314-ecc6f8c9d74a",
    description: "Editorial calendar feeds across all Hearst brands with publish dates and content categories",
  },
  get_cms_articles: {
    id: "7689bd7f-63df-4ec1-a486-23da73ad15e1",
    description: "CMS article inventory with topic tagging, freshness scoring, and email-sendability flags",
  },
  get_newsletter_archives: {
    id: "5aff1adb-74a7-4ccb-b623-7f23c8759abc",
    description: "Historical newsletter editions for content deduplication and reuse analysis",
  },
  get_content_performance: {
    id: "2b574d21-7324-4b3b-8788-5d31f65ae577",
    description: "Historical CTR, engagement rate, and conversion metrics per content piece by audience segment",
  },
} as const;

export const HEARST_EMAIL_QUEUE_TOOLS = {
  get_brand_email_queues: {
    id: "f99a3d89-f3b3-41a6-a8da-b5e9bd0d59cf",
    description: "Pending email campaigns from all Hearst brand queues with priority and target segments",
  },
  get_fatigue_rules: {
    id: "a5bb1d4b-8dd7-4672-8955-697986f95cc3",
    description: "Active fatigue management rules: max sends per week, cool-down periods, suppression thresholds",
  },
  get_business_rules: {
    id: "4df9ce55-4abb-4680-afae-bdc640882adb",
    description: "Business rules governing send decisions: brand priorities, obligations, blackout dates, regulatory holds",
  },
} as const;

export const HEARST_ANALYTICS_TOOLS = {
  get_send_logs: {
    id: "9c82dc13-541e-4774-8ebf-71ca5dabb021",
    description: "Detailed send-level logs including delivery status, bounce type, and inbox placement from SFMC",
  },
  get_conversion_data: {
    id: "b0cbbe71-b315-4905-830a-2a7fd6fea458",
    description: "Post-click conversion events: subscription sign-ups, upgrades, paywall conversions, registrations",
  },
  get_deliverability_metrics: {
    id: "e80e9b0a-c76e-4ed9-9887-ead25e781181",
    description: "Deliverability KPIs per brand/ISP: inbox placement, spam rate, sender reputation, DKIM/SPF/DMARC",
  },
  get_affiliate_revenue: {
    id: "bba75a30-41f8-4ff2-a32c-17da9a456c94",
    description: "Affiliate revenue attribution per email send from Skimlinks/Amazon Associates",
  },
} as const;

export const HEARST_TRIGGERS = {
  nightlyBatch: {
    id: "78b6e398-03c4-417d-8839-7e2927ce6d1f",
    agentId: HEARST_AGENTS.subscriberProfileEngine.id,
    triggerType: "schedule",
    description: "Nightly full profile refresh at 2am ET",
  },
  subscriberEvent: {
    id: "77525bd0-e7c1-4d6e-a31f-681a1b4fb24c",
    agentId: HEARST_AGENTS.subscriberProfileEngine.id,
    triggerType: "event",
    eventName: "subscriber_event",
    source: "salesforce_marketing_cloud",
  },
  contentInventoryDaily: {
    id: "ae229120-e47c-4af9-9a63-c0a36a870f3f",
    agentId: HEARST_AGENTS.contentInventory.id,
    triggerType: "schedule",
    description: "Daily content catalog refresh at 6am ET",
  },
  nbaEmailDecisionDaily: {
    id: "8f87163f-4e9d-4f42-9fcc-a086b6d2cf65",
    agentId: HEARST_AGENTS.nbaEmailDecision.id,
    triggerType: "schedule",
    description: "Daily NBA email decision run at 2am ET",
  },
  sendTimeOptimizerWeekly: {
    id: "5fc88148-8af7-48dd-884e-f516d86b86e3",
    agentId: HEARST_AGENTS.sendTimeOptimizer.id,
    triggerType: "schedule",
    description: "Weekly send time recomputation at 3am ET Sunday",
  },
  performanceLearningWeekly: {
    id: "f55678c9-ba90-43bc-b96a-8fb2a6d1cb9d",
    agentId: HEARST_AGENTS.performanceLearning.id,
    triggerType: "schedule",
    description: "Weekly learning cycle at 4am ET Monday",
  },
  anomalyDetected: {
    id: "83cf7d35-4ad7-4d0f-ada6-7b017bcb6b8b",
    agentId: HEARST_AGENTS.performanceLearning.id,
    triggerType: "event",
    eventName: "anomaly_detected",
    source: "hearst_nba_monitoring",
  },
} as const;

export const HEARST_COMMON_CONFIG = {
  department: "Audience Development",
  environment: "production",
  autonomyMode: "autonomous",
  riskTier: "MEDIUM",
  complianceTags: ["CCPA", "CAN-SPAM", "GDPR"],
} as const;
