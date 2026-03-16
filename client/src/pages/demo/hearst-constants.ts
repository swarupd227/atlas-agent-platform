/**
 * Hearst: Next Best Action — Agent Team Constants
 *
 * Multi-brand email optimization agent team for Hearst Media.
 * Builds unified subscriber profiles across all Hearst brands
 * (Cosmopolitan, Esquire, Elle, Harper's Bazaar, Men's Health,
 * Women's Health, Oprah Daily, etc.) and drives personalized
 * engagement decisions.
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
} as const;

export const HEARST_MCP_SERVERS = {
  dataPlatform: {
    id: "087a3dd1-9f39-4a03-a3cf-af6ec3458cde",
    name: "Hearst Data Platform MCP Server",
    tools: ["get_esp_events", "get_website_behavior", "get_subscription_status", "get_purchase_history", "get_demographic_data"],
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
} as const;
