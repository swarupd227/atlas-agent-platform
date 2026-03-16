/**
 * Moody's: Automated Credit Assessment Package Assembly
 *
 * A single trigger — "Prepare credit assessment package for [Issuer]" —
 * activates a coordinated team of 6 agents that execute simultaneously,
 * delivering a complete, review-ready assessment package in 15–20 minutes
 * vs. 3.5–5.5 hours manually.
 *
 * Agents are pre-created in the dev environment via API.
 */

export const MOODYS_AGENTS = {
  financialDataCollector: {
    id: "a015f037-7d0f-48fd-9145-0779c9da1681",
    name: "Financial Data Collector & Spreader",
    description: "Ingests issuer financial statements from EDGAR, IR portals, and Moody's data estate. Spreads into Chart of Accounts with IFRS/US GAAP auto-detection. Computes all sector-specific credit metrics with 8-quarter trends.",
    model: "openai/gpt-4.1",
    mcpServers: ["internal", "external"],
  },
  earningsAnalyzer: {
    id: "2cee072c-5471-4023-ad86-d92220068b05",
    name: "Earnings & Management Signal Analyzer",
    description: "Analyzes 2–4 earnings call transcripts and investor presentations. Extracts management tone, forward guidance, and sector risk signals with quarter-over-quarter sentiment tracking.",
    model: "anthropic/claude-sonnet-4-5",
    mcpServers: ["external"],
  },
  peerComparisonBuilder: {
    id: "0a816eab-dae7-41e3-b882-a6954ad21783",
    name: "Peer Comparison Builder",
    description: "Identifies 5–10 peers via Moody's sector classifications. Builds comparison matrix across all key credit metrics with rankings and outlier flags.",
    model: "openai/gpt-4.1",
    mcpServers: ["internal"],
  },
  esgProfileAgent: {
    id: "6efd7a5a-0e2e-4963-9995-d5ed2a585ad6",
    name: "ESG & Sustainability Profile Agent",
    description: "Pulls ESG IPS scores, CIS score, and sustainability data. Checks for ESG-related news, regulatory actions, and controversies. Flags ESG factors with material credit impact.",
    model: "anthropic/claude-sonnet-4-5",
    mcpServers: ["internal", "external"],
  },
  newsEventScanner: {
    id: "248f1d69-9dde-472a-8d41-b5c43c16781b",
    name: "News & Event Scanner",
    description: "Scans news, regulatory filings, legal databases, and market data for credit-relevant events. Classifies by relevance (material/contextual/informational) and potential rating impact direction.",
    model: "anthropic/claude-sonnet-4-5",
    mcpServers: ["external"],
  },
  scorecardPrePopulation: {
    id: "c497a037-2ab9-438d-925c-f96b6e86af25",
    name: "Scorecard Pre-Population Agent",
    description: "Pre-populates sector-specific rating scorecard using outputs from Agents 1–5. Computes scorecard-indicated rating and compares to current assigned rating with gap analysis.",
    model: "openai/gpt-4.1",
    mcpServers: ["internal"],
  },
} as const;

export const MOODYS_MCP_SERVERS = {
  internal: {
    id: "448b894d-2a47-47fe-85eb-cbd29eb8acc2",
    name: "Moody's Internal Data MCP Server",
    tools: [
      "get_moody_financials",
      "spread_to_chart_of_accounts",
      "compute_credit_metrics",
      "get_esg_ips_scores",
      "get_cis_score",
      "get_peer_group",
      "get_peer_financials",
      "get_rating_scorecard_template",
      "get_current_rating",
    ],
  },
  external: {
    id: "b7a35c0b-5074-415d-b103-881955723318",
    name: "External Research MCP Server",
    tools: [
      "get_edgar_filings",
      "get_earnings_transcripts",
      "get_investor_presentations",
      "scan_credit_news",
      "get_legal_database",
      "get_market_data",
    ],
  },
} as const;

export const MOODYS_INTERNAL_TOOLS = {
  get_moody_financials: {
    id: "171ed9dd-7eae-424c-8e36-4797fe5eece7",
    description: "Standardized financial statements from Moody's data estate",
  },
  spread_to_chart_of_accounts: {
    id: "8286f0e7-f42a-4308-880b-e1619c83e832",
    description: "Maps raw financials to Moody's Chart of Accounts (IFRS/US GAAP auto-detection)",
  },
  compute_credit_metrics: {
    id: "339b9dbf-e214-4a90-b7b7-bedeea298d83",
    description: "Sector-specific credit metrics and financial ratios with trend data",
  },
  get_esg_ips_scores: {
    id: "403cc428-b182-49fa-84c6-bd10a82de161",
    description: "ESG Issuer Profile Scores (Environmental, Social, Governance)",
  },
  get_cis_score: {
    id: "004e119f-2f76-4c2d-9d12-cb16de187533",
    description: "Credit Impact Score (CIS-1 through CIS-5) with rationale",
  },
  get_peer_group: {
    id: "78b3906b-162f-4386-a435-5f58187f0b97",
    description: "Identifies 5–10 comparable peers via Moody's sector/sub-sector classifications",
  },
  get_peer_financials: {
    id: "25a99c0f-e74e-4a18-b922-8f136f149854",
    description: "Comparable financial data for peer issuers",
  },
  get_rating_scorecard_template: {
    id: "8d02a88c-e303-4297-b190-209a121fa8ec",
    description: "Sector-specific Moody's rating scorecard template with scoring criteria",
  },
  get_current_rating: {
    id: "758b4294-4523-4103-ac38-5287abd72611",
    description: "Current assigned credit rating, outlook, and rating history",
  },
} as const;

export const MOODYS_EXTERNAL_TOOLS = {
  get_edgar_filings: {
    id: "c7c336ca-045a-4781-b69d-0ba4b37cf416",
    description: "SEC EDGAR 10-K, 10-Q, 8-K, and proxy filings with XBRL parsing",
  },
  get_earnings_transcripts: {
    id: "08992f53-76f1-44ab-b8a7-c76820bfd998",
    description: "Quarterly earnings call transcripts from FactSet/LSEG",
  },
  get_investor_presentations: {
    id: "1e389c04-9165-44ba-b0ab-aaa784bc2d3c",
    description: "Investor day and capital markets day presentations from IR portals",
  },
  scan_credit_news: {
    id: "302e0257-903e-46e4-89d9-682c2c333b02",
    description: "Credit-relevant news from Bloomberg, Reuters, and Dow Jones",
  },
  get_legal_database: {
    id: "039e55c1-1e16-4290-9cfa-d926bfa8db1b",
    description: "Litigation, regulatory actions, and legal proceedings from LexisNexis",
  },
  get_market_data: {
    id: "de464bd7-cf7d-4718-9e95-3f3f07709380",
    description: "Credit spreads, CDS pricing, bond yields, and covenant data from ICE/Bloomberg",
  },
} as const;

export const MOODYS_TRIGGERS = {
  agent1_workflow: {
    id: "f659850a-a9f7-4054-a5e9-7d82e475ba52",
    agentId: MOODYS_AGENTS.financialDataCollector.id,
    triggerType: "event",
    eventName: "credit_assessment_requested",
    source: "moodys_workflow_engine",
  },
  agent2_workflow: {
    id: "76452554-0ddc-49dc-9dec-8fd5d05c2945",
    agentId: MOODYS_AGENTS.earningsAnalyzer.id,
    triggerType: "event",
    eventName: "credit_assessment_requested",
    source: "moodys_workflow_engine",
  },
  agent3_workflow: {
    id: "eeee8c2c-6c5f-495a-9d6f-7c4434b1eb2f",
    agentId: MOODYS_AGENTS.peerComparisonBuilder.id,
    triggerType: "event",
    eventName: "credit_assessment_requested",
    source: "moodys_workflow_engine",
  },
  agent4_workflow: {
    id: "6564824c-4575-487a-8415-9496c5d7b7b5",
    agentId: MOODYS_AGENTS.esgProfileAgent.id,
    triggerType: "event",
    eventName: "credit_assessment_requested",
    source: "moodys_workflow_engine",
  },
  agent5_workflow: {
    id: "e0f5229f-519f-48f5-955c-c83787fc56d6",
    agentId: MOODYS_AGENTS.newsEventScanner.id,
    triggerType: "event",
    eventName: "credit_assessment_requested",
    source: "moodys_workflow_engine",
  },
  agent6_workflow: {
    id: "0386ce1b-2509-4aaf-ba36-dfbebe0c6b23",
    agentId: MOODYS_AGENTS.scorecardPrePopulation.id,
    triggerType: "event",
    eventName: "credit_assessment_requested",
    source: "moodys_workflow_engine",
  },
  agent6_packageReady: {
    id: "d5fa041b-15a8-4049-99c6-621dfdfe847f",
    agentId: MOODYS_AGENTS.scorecardPrePopulation.id,
    triggerType: "event",
    eventName: "credit_package_ready",
    source: "moodys_orchestrator",
  },
} as const;

export const MOODYS_COMMON_CONFIG = {
  department: "Credit Research",
  environment: "production",
  autonomyMode: "supervised",
  riskTier: "HIGH",
  complianceTags: ["NRSRO", "SEC Reg AC", "MiFID II", "IOSCO"],
} as const;
