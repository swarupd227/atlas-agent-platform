/**
 * Advantive ONE Demo 4 — AI-First Tier 1 Support Intelligence
 * Shared platform intelligence definitions.
 *
 * Pure data module — NO server imports (express, storage, etc.).
 * Imported by:
 *   server/advantive-support-live-run.ts   — to provision dev agents at startup
 *   scripts/migrate-advantive-support-to-prod.ts — to provision prod agents
 */

// ─── Agent display names ──────────────────────────────────────────────────────
export const SUP_001_NAME = "Triage & Intent Classifier";
export const SUP_002_NAME = "Knowledge Resolution Agent";
export const SUP_003_NAME = "Diagnostic Reasoning Agent";
export const SUP_004_NAME = "T1→T2 Escalation Packager";

// ─── MCP server definitions (url is injected by caller) ──────────────────────
export function makeAdvSupportMcpServerDefs(baseUrl: string) {
  return [
    {
      name:        "Advantive ONE — Support Triage Engine",
      description: "Advantive AIVA Support Agent interface: receives inbound customer queries, classifies intent type, detects product line and version, reads customer tier, and routes to the appropriate resolution or diagnostic agent.",
      url:         `${baseUrl}/api/mock/adv-support-triage`,
      tools: [
        { name: "receive_inbound_query",    description: "Receives the structured inbound support query from the AIVA Support Agent interface. Returns query text, channel (portal/email/chat), timestamp, and customer account metadata.",  endpoint: "inbound-query",      method: "GET"  },
        { name: "classify_intent",          description: "Classifies the query intent into: how-to, bug_report, configuration_issue, billing, or technical_troubleshooting. Returns primary intent, confidence score, and secondary intent if ambiguous.", endpoint: "classify-intent",     method: "POST" },
        { name: "detect_product_version",   description: "Identifies the Advantive product line (InfinityQS, Kiwiplan, DDI System, ParityFactory, etc.) and version number from query text and account metadata. Returns product_id, product_name, version, release_date.", endpoint: "detect-product",     method: "POST" },
        { name: "read_customer_tier",       description: "Reads the customer account tier from the Advantive CRM: Enterprise, Professional, or Standard. Returns tier, contract_value, sla_response_target_hours, account_manager, and priority_flag.", endpoint: "customer-tier",      method: "GET"  },
        { name: "route_to_agent",           description: "Applies routing logic: Enterprise + technical_troubleshooting → Diagnostic Agent; high KB confidence → Knowledge Resolution; otherwise Escalation. Returns routing_decision and rationale.", endpoint: "route-to-agent",     method: "POST" },
      ],
    },
    {
      name:        "Advantive ONE — Knowledge Base Search",
      description: "Advantive product knowledge layer: searches full documentation corpus for all 8+ product lines, queries historical T1 ticket resolutions by similarity, scores answer confidence, and triggers additional search pass on medium confidence.",
      url:         `${baseUrl}/api/mock/adv-support-kb`,
      tools: [
        { name: "search_product_docs",          description: "Searches the Advantive product documentation corpus for InfinityQS, Kiwiplan, DDI System, ParityFactory, Pepperi, VeraCore, Advantzware, Proplanner. Returns top-5 relevant chunks with citation and relevance score.", endpoint: "search-docs",           method: "POST" },
        { name: "query_historical_resolutions", description: "Searches 2-3 years of resolved T1 tickets classified by intent, product, and resolution type. Returns top-3 similar past resolutions with resolution steps, time-to-resolve, and CSAT score.",                        endpoint: "query-resolutions",    method: "POST" },
        { name: "score_answer_confidence",      description: "Evaluates the generated answer against the source corpus. Returns confidence_score (0.0–1.0), confidence_tier (high/medium/low), source_coverage_pct, and recommended_action (resolve/additional_pass/escalate).",  endpoint: "score-confidence",     method: "POST" },
        { name: "run_additional_search_pass",   description: "Triggered when confidence is 0.65–0.80. Expands search scope with semantic expansion, product-adjacent KBs, and release notes for the detected version. Returns augmented_answer and new confidence_score.",          endpoint: "additional-search",    method: "POST" },
        { name: "generate_kb_answer",           description: "Generates the final product-specific resolution answer with documentation citations, step-by-step instructions, and verification steps. Returns answer_text, citations, and confidence_score.",                        endpoint: "generate-answer",      method: "POST" },
      ],
    },
    {
      name:        "Advantive ONE — Product Log Intelligence",
      description: "Advantive ONE Product Log Intelligence capability: ingests error context and queries product logs for diagnostic signals, applies per-product reasoning patterns (InfinityQS, Kiwiplan, DDI System), and builds step-by-step resolution paths with verification.",
      url:         `${baseUrl}/api/mock/adv-support-diagnostic`,
      tools: [
        { name: "ingest_error_context",        description: "Ingests structured error context from the support query: error code, product version, environment details, and stack trace snippet if provided. Returns normalized error profile for diagnostic matching.",           endpoint: "ingest-error",        method: "POST" },
        { name: "query_product_logs",          description: "Queries product logs via Advantive ONE Product Log Intelligence. Returns error frequency, first_seen, affected_modules, correlation_ids, and related error codes in the same session window.",                     endpoint: "query-logs",          method: "POST" },
        { name: "match_error_pattern",         description: "Matches the error profile against the InfinityQS, Kiwiplan, and DDI System error pattern catalog. Returns matched_pattern, root_cause, affected_versions, fix_type (patch/config/workaround), and confidence.", endpoint: "match-pattern",       method: "POST" },
        { name: "build_resolution_path",       description: "Generates a step-by-step resolution path with customer-executable verification steps. Returns ordered steps, estimated_resolution_time_mins, requires_remote_access flag, and rollback_procedure.",               endpoint: "build-resolution",    method: "POST" },
        { name: "assess_escalation_need",      description: "Assesses whether the case should be resolved autonomously or escalated. Applies severity, customer tier, audit/compliance flags, and time-pressure signals. Returns escalate flag, rationale, and urgency_level.", endpoint: "assess-escalation",   method: "POST" },
      ],
    },
    {
      name:        "Advantive ONE — Escalation & Salesforce",
      description: "Escalation packaging and Salesforce CRM integration: builds structured T2 escalation packages with full context, creates Salesforce cases via Advantive ONE Salesforce integration, and routes to the appropriate T2 specialist team.",
      url:         `${baseUrl}/api/mock/adv-support-escalation`,
      tools: [
        { name: "build_escalation_package",   description: "Generates the structured T2 escalation package: intent classification, product/version, diagnostic steps taken, specific reasoning gap, confidence rationale, recommended T2 owner, and priority flag.",           endpoint: "build-package",       method: "POST" },
        { name: "create_salesforce_case",     description: "Creates a Salesforce case via Advantive ONE Salesforce MCP with full context pre-populated: account, contact, product, version, severity, summary, diagnostic steps, and T2 routing recommendation.",             endpoint: "create-sf-case",      method: "POST" },
        { name: "recommend_t2_owner",         description: "Recommends the optimal T2 specialist queue based on product line, error pattern, and current queue load. Returns recommended_team, queue_depth, estimated_response_time_hours, and named_specialist if applicable.", endpoint: "recommend-t2",        method: "POST" },
        { name: "notify_account_manager",     description: "Sends escalation notification to the customer's account manager with the Salesforce case URL, severity, and estimated response time. Returns notification status and AM contact details.",                          endpoint: "notify-am",           method: "POST" },
        { name: "log_escalation_audit",       description: "Logs the full escalation event to the Atlas audit trail: case_id, classification, diagnostic steps, T2 routing, resolution_gap, timestamp, and agent IDs involved in the pipeline.",                              endpoint: "log-audit",           method: "POST" },
      ],
    },
  ] as const;
}

// ─── Knowledge base definitions ──────────────────────────────────────────────
export const ADV_SUPPORT_KB_DEFS = [
  { name: "Advantive Product Knowledge Base",    description: "Full documentation corpus for all 8+ Advantive product lines: InfinityQS, Kiwiplan, DDI System, ParityFactory, Pepperi, VeraCore, Advantzware, Proplanner. Chunked per product with RAG pipeline. Covers installation, configuration, troubleshooting, API reference, and release notes." },
  { name: "Historical T1 Ticket Resolutions",    description: "2–3 years of resolved T1 ticket corpus classified by intent, product, and resolution type. Foundation for Knowledge Resolution Agent similarity matching. Includes resolution steps, time-to-resolve, CSAT score, and escalation outcomes." },
  { name: "Advantive Product Error Catalog",     description: "Comprehensive error code catalog for InfinityQS, Kiwiplan, and DDI System: error codes, root causes, affected versions, diagnostic patterns, fix procedures, known workarounds, and patch history." },
  { name: "T2 Specialist Routing Reference",     description: "Advantive Tier 2 team directory: specialist product areas, expertise matrix, current queue depths, SLA commitments by severity, escalation contact tree, and on-call schedules by timezone." },
] as const;

// ─── Skill definitions (3 per agent = 12 total) ───────────────────────────────
export const ADV_SUPPORT_SKILLS = [
  // SUP-001: Triage & Intent Classifier
  {
    name: "Support Intent Classification",
    description: "Classifies inbound Advantive customer support queries into intent categories (how-to, bug report, configuration issue, billing, technical troubleshooting) with confidence scoring, identifying the primary and secondary intent for precise routing.",
    domain: "customer_support_operations", industry: "technology_saas", version: "1.0.0",
    tags: ["intent_classification", "triage", "routing", "nlp"],
    agentKey: "triage",
  },
  {
    name: "Advantive Product Line Detection",
    description: "Identifies the specific Advantive product (InfinityQS, Kiwiplan, DDI System, ParityFactory, etc.) and version from query text and account metadata. Applies product-specific terminology dictionaries and version pattern matching.",
    domain: "customer_support_operations", industry: "technology_saas", version: "1.0.0",
    tags: ["product_detection", "version_identification", "entity_extraction"],
    agentKey: "triage",
  },
  {
    name: "Customer Tier Routing Logic",
    description: "Applies enterprise-grade routing rules based on customer tier (Enterprise/Professional/Standard), intent type, product severity, and SLA targets. Implements tier override rules for high-value accounts and compliance-sensitive cases.",
    domain: "customer_support_operations", industry: "technology_saas", version: "1.0.0",
    tags: ["tier_routing", "sla_management", "enterprise_rules", "escalation_logic"],
    agentKey: "triage",
  },

  // SUP-002: Knowledge Resolution Agent
  {
    name: "Product Knowledge Search & Retrieval",
    description: "Executes semantic search across the full Advantive product documentation corpus, applying product-specific RAG pipeline configurations per product line. Retrieves relevant chunks with citation and relevance scoring.",
    domain: "knowledge_management", industry: "technology_saas", version: "1.0.0",
    tags: ["rag_search", "documentation", "semantic_retrieval", "citation"],
    agentKey: "knowledge",
  },
  {
    name: "Historical Resolution Matching",
    description: "Matches inbound queries against 2-3 years of resolved T1 ticket corpus using similarity search across intent, product, error context, and resolution pattern dimensions. Returns top-3 past resolutions with confidence-weighted recommendations.",
    domain: "knowledge_management", industry: "technology_saas", version: "1.0.0",
    tags: ["similarity_matching", "ticket_history", "resolution_retrieval", "csat"],
    agentKey: "knowledge",
  },
  {
    name: "Answer Confidence Scoring",
    description: "Evaluates generated answers against source corpus coverage, applies hallucination detection, and produces a calibrated confidence score. Implements the confidence gate policy: >0.80 resolve, 0.65–0.80 additional pass, <0.65 escalate.",
    domain: "knowledge_management", industry: "technology_saas", version: "1.0.0",
    tags: ["confidence_scoring", "hallucination_detection", "quality_gate", "accuracy"],
    agentKey: "knowledge",
  },

  // SUP-003: Diagnostic Reasoning Agent
  {
    name: "Product Log Diagnostic Analysis",
    description: "Ingests product error context and queries Advantive ONE Product Log Intelligence to retrieve error frequency, correlation patterns, and module-level failure signals. Applies InfinityQS, Kiwiplan, and DDI System specific log interpretation patterns.",
    domain: "technical_diagnostics", industry: "technology_saas", version: "1.0.0",
    tags: ["log_analysis", "error_patterns", "diagnostic_signals", "infinityqs"],
    agentKey: "diagnostic",
  },
  {
    name: "Error Pattern Recognition",
    description: "Matches error profiles against the Advantive Product Error Catalog using pattern classification. Identifies root cause, affected version range, fix type (patch/config/workaround), and similar past incidents resolved at Tier 2.",
    domain: "technical_diagnostics", industry: "technology_saas", version: "1.0.0",
    tags: ["error_catalog", "root_cause_analysis", "pattern_matching", "version_impact"],
    agentKey: "diagnostic",
  },
  {
    name: "Resolution Path Construction",
    description: "Generates ordered, customer-executable resolution paths with verification steps for technical support cases. Includes rollback procedures, estimated resolution time, remote access requirements, and escalation decision for cases beyond autonomous resolution.",
    domain: "technical_diagnostics", industry: "technology_saas", version: "1.0.0",
    tags: ["resolution_path", "step_by_step", "verification", "rollback"],
    agentKey: "diagnostic",
  },

  // SUP-004: T1→T2 Escalation Packager
  {
    name: "Escalation Package Construction",
    description: "Builds structured T2 escalation packages containing full conversation context, intent classification, product/version details, all diagnostic steps taken, specific reasoning gaps, and recommended T2 specialist routing with urgency rationale.",
    domain: "escalation_management", industry: "technology_saas", version: "1.0.0",
    tags: ["escalation_package", "context_preservation", "t2_handoff", "structured_output"],
    agentKey: "escalation",
  },
  {
    name: "Salesforce Case Automation",
    description: "Creates Salesforce cases via Advantive ONE Salesforce integration with full context pre-populated: account, contact, product, version, severity classification, diagnostic summary, and T2 routing recommendation. Ensures zero re-investigation for T2 specialists.",
    domain: "escalation_management", industry: "technology_saas", version: "1.0.0",
    tags: ["salesforce", "crm_integration", "case_creation", "context_transfer"],
    agentKey: "escalation",
  },
  {
    name: "T2 Specialist Routing Optimization",
    description: "Recommends the optimal T2 specialist queue based on product expertise matrix, current queue depth, and SLA urgency. Applies compliance and audit-deadline priority flags to override standard queue assignment when business impact requires it.",
    domain: "escalation_management", industry: "technology_saas", version: "1.0.0",
    tags: ["t2_routing", "specialist_matching", "queue_optimization", "sla_urgency"],
    agentKey: "escalation",
  },
] as const;

// ─── Agent definitions ────────────────────────────────────────────────────────
export const ADV_SUPPORT_AGENT_DEFS = [
  {
    key:            "triage",
    externalId:     "SUP-001",
    name:           SUP_001_NAME,
    description:    "First responder in Advantive ONE's T1 support pipeline. Receives every inbound query from the AIVA Support Agent interface, classifies intent type, identifies product and version, reads customer tier, and routes to the optimal resolution path — Knowledge Resolution for standard queries, Diagnostic Agent for technical troubleshooting, or direct Escalation for billing and complex cases.",
    mcpServerName:  "Advantive ONE — Support Triage Engine",
    kbName:         "Advantive Product Knowledge Base",
    skillNames:     ["Support Intent Classification", "Advantive Product Line Detection", "Customer Tier Routing Logic"],
    department:     "Customer Support Operations",
    complianceTags: ["T1-TRIAGE-PROTOCOL", "CUSTOMER-PRIVACY-POLICY"],
    ontologyTags:   ["Support Query", "Intent Classification", "Product Routing", "Customer Tier"],
    modelProvider:  "openai",
    modelName:      "gpt-4.1",
  },
  {
    key:            "knowledge",
    externalId:     "SUP-002",
    name:           SUP_002_NAME,
    description:    "Searches the full Advantive product knowledge base — product documentation, historical ticket resolutions, and Advantive ONE's native product knowledge layer — to generate precise, product-specific answers. Self-assesses confidence: high confidence (>0.80) triggers direct resolution; medium confidence triggers an additional search pass; low confidence routes to the Diagnostic Agent.",
    mcpServerName:  "Advantive ONE — Knowledge Base Search",
    kbName:         "Historical T1 Ticket Resolutions",
    skillNames:     ["Product Knowledge Search & Retrieval", "Historical Resolution Matching", "Answer Confidence Scoring"],
    department:     "Customer Support Operations",
    complianceTags: ["KB-ACCURACY-GATE", "CONFIDENCE-THRESHOLD-POLICY"],
    ontologyTags:   ["Knowledge Base", "Resolution Confidence", "Documentation Search", "Historical Ticket"],
    modelProvider:  "openai",
    modelName:      "gpt-4.1",
  },
  {
    key:            "diagnostic",
    externalId:     "SUP-003",
    name:           SUP_003_NAME,
    description:    "Handles technical troubleshooting cases that require product log analysis. Ingests error context, queries product logs via Advantive ONE Product Log Intelligence, matches error patterns against the product error catalog, and generates step-by-step resolution paths. Applies per-product diagnostic reasoning for InfinityQS, Kiwiplan, and DDI System. Determines whether the case can be resolved autonomously or requires T2 escalation.",
    mcpServerName:  "Advantive ONE — Product Log Intelligence",
    kbName:         "Advantive Product Error Catalog",
    skillNames:     ["Product Log Diagnostic Analysis", "Error Pattern Recognition", "Resolution Path Construction"],
    department:     "Technical Support Engineering",
    complianceTags: ["DIAGNOSTIC-ACCURACY-GATE", "LOG-INTELLIGENCE-USAGE"],
    ontologyTags:   ["Error Diagnostic", "Product Log", "Resolution Path", "Escalation Signal"],
    modelProvider:  "openai",
    modelName:      "gpt-4.1",
  },
  {
    key:            "escalation",
    externalId:     "SUP-004",
    name:           SUP_004_NAME,
    description:    "Packages unresolved T1 cases into structured, enriched escalation packages for Tier 2 specialists. Creates Salesforce cases via Advantive ONE Salesforce integration with full context pre-populated, recommends the optimal T2 specialist queue, notifies the account manager, and logs a complete audit trail — ensuring T2 specialists spend time solving, not re-gathering context.",
    mcpServerName:  "Advantive ONE — Escalation & Salesforce",
    kbName:         "T2 Specialist Routing Reference",
    skillNames:     ["Escalation Package Construction", "Salesforce Case Automation", "T2 Specialist Routing Optimization"],
    department:     "Technical Support Engineering",
    complianceTags: ["ESCALATION-COMPLETENESS-POLICY", "SALESFORCE-SYNC-PROTOCOL"],
    ontologyTags:   ["Escalation Package", "Salesforce Case", "T2 Routing", "Audit Trail"],
    modelProvider:  "openai",
    modelName:      "gpt-4.1",
  },
] as const;

// ─── Governance policy definitions ───────────────────────────────────────────
export const ADV_SUPPORT_POLICY_DEFS = [
  {
    name:        "Confidence Gate Policy",
    domain:      "support_governance",
    description: "Any resolution with confidence score <0.75 is escalated or flagged for human review. Atlas never delivers uncertain answers as confident responses to customers. Confidence thresholds: >0.80 = direct resolve, 0.65–0.80 = additional search pass, <0.65 = Diagnostic or Escalation.",
    policyJson: { enforcement: "hard", rules: [
      { name: "High Confidence Resolution Gate",   description: "Answers with confidence >0.80 may be delivered directly to the customer as autonomous resolutions without human review" },
      { name: "Medium Confidence Search Expansion", description: "Answers with confidence 0.65–0.80 must trigger a second search pass before delivery; single-pass answers in this range are prohibited" },
      { name: "Low Confidence Escalation Trigger",  description: "Answers with confidence <0.65 must route to Diagnostic Agent or direct Escalation; no uncertain answer may be delivered to the customer" },
    ]},
  },
  {
    name:        "Customer Privacy Policy",
    domain:      "support_governance",
    description: "Customer ticket data used only for resolution within the active session. No customer PII or support conversation data used to train third-party models without Advantive consent. Data retention follows Advantive Data Processing Agreement.",
    policyJson: { enforcement: "hard", rules: [
      { name: "No Third-Party Training",     description: "Customer support conversations must never be sent to third-party model providers for training or fine-tuning without explicit DPA consent" },
      { name: "PII Minimisation in Logs",   description: "Agent audit logs must redact customer name, email, and account number — only account_id and case_id are logged for traceability" },
      { name: "Session-Scoped Data Access", description: "Each support session has access only to data belonging to the authenticated account; cross-account data access is prohibited" },
    ]},
  },
  {
    name:        "KB Update Policy",
    domain:      "knowledge_governance",
    description: "Any Advantive product release triggers automated KB update within 24 hours of release. KB quality is evaluated against the golden dataset before the update is activated. KB accuracy must exceed 85% on evaluation before activation.",
    policyJson: { enforcement: "hard", rules: [
      { name: "24-Hour Update SLA",         description: "New product releases must trigger KB content ingestion and indexing within 24 hours; release notes are always the first document ingested" },
      { name: "Pre-Activation Quality Gate", description: "Updated KB must pass 85% accuracy threshold on the golden evaluation dataset before being activated for live query resolution" },
      { name: "Rollback on Quality Drop",   description: "If post-activation KB accuracy drops below 80%, the previous KB version must be automatically restored within 4 hours" },
    ]},
  },
] as const;

// ─── Ontology concepts ────────────────────────────────────────────────────────
export const ADV_SUPPORT_ONTOLOGY_CONCEPTS = [
  { name: "Support Query",            description: "An inbound customer request received by the Advantive ONE AIVA Support Agent interface, containing a question, issue description, or troubleshooting request related to an Advantive product.",                          domain: "support_operations" },
  { name: "Intent Classification",    description: "The categorical label assigned to a support query (how-to, bug_report, configuration_issue, billing, technical_troubleshooting) with an associated confidence score, determining the routing path.",                      domain: "support_operations" },
  { name: "Product Routing",          description: "The assignment of a classified support query to the appropriate product-specific KB, diagnostic agent, or T2 specialist team based on product line, version, and intent type.",                                          domain: "support_operations" },
  { name: "Customer Tier",            description: "The Advantive account classification (Enterprise, Professional, Standard) that determines SLA response targets, escalation priority, routing rules, and account manager involvement.",                                   domain: "support_operations" },
  { name: "Knowledge Base",           description: "The curated, versioned corpus of Advantive product documentation, historical ticket resolutions, and product knowledge used by the Knowledge Resolution Agent to generate answers.",                                    domain: "knowledge_management" },
  { name: "Resolution Confidence",    description: "A numerical score (0.0–1.0) representing the Knowledge Resolution Agent's certainty in a generated answer, calibrated against source corpus coverage and hallucination detection.",                                     domain: "knowledge_management" },
  { name: "Documentation Search",     description: "A semantic retrieval operation against the Advantive product documentation corpus, returning ranked chunks with citation and relevance scores for the Knowledge Resolution Agent.",                                      domain: "knowledge_management" },
  { name: "Historical Ticket",        description: "A previously resolved Advantive T1 support ticket stored in the resolution corpus, classified by intent, product, and resolution type, used for similarity-based resolution matching.",                                 domain: "knowledge_management" },
  { name: "Error Diagnostic",         description: "A structured analysis of a customer-reported error combining error code, product version, log signals, and error catalog matching to identify root cause and generate a targeted resolution path.",                    domain: "technical_diagnostics" },
  { name: "Product Log",              description: "Operational logs generated by Advantive products (InfinityQS, Kiwiplan, DDI System) ingested by the Product Log Intelligence capability, used to correlate error events and identify failure patterns.",               domain: "technical_diagnostics" },
  { name: "Resolution Path",          description: "An ordered sequence of customer-executable steps with verification checkpoints, generated by the Diagnostic Agent to resolve a technical support case without Tier 2 human intervention.",                            domain: "technical_diagnostics" },
  { name: "Escalation Signal",        description: "A condition detected by the Diagnostic Agent (low confidence, remote access required, compliance deadline, unsupported version) that triggers T1→T2 escalation rather than autonomous resolution.",                  domain: "technical_diagnostics" },
  { name: "Escalation Package",       description: "A structured handoff document created by the T1→T2 Escalation Packager containing full conversation context, classification, diagnostic steps, reasoning gaps, and T2 routing recommendation.",                       domain: "escalation_management" },
  { name: "Salesforce Case",          description: "A customer support case record created in Salesforce via Advantive ONE Salesforce integration with full context pre-populated, enabling T2 specialists to begin resolution without re-gathering information.",          domain: "escalation_management" },
  { name: "T2 Routing",               description: "The assignment of an escalated case to the optimal Tier 2 specialist queue based on product expertise, queue depth, SLA urgency, and compliance priority flags.",                                                     domain: "escalation_management" },
  { name: "Audit Trail",              description: "A tamper-evident log of all agent actions in the support pipeline, recording intent classification, KB searches, diagnostic steps, escalation decisions, and Salesforce case creation for compliance and QA purposes.", domain: "escalation_management" },
] as const;

// ─── Blueprint definitions ────────────────────────────────────────────────────
export const ADV_SUPPORT_BLUEPRINTS = [
  {
    name:        "Advantive Support — Triage & Routing Blueprint",
    description: "Receives inbound AIVA query, classifies intent, detects product and version, reads customer tier, and routes to the optimal resolution agent with full context transfer.",
    steps: [
      { order: 1, label: "Receive Query",       description: "Call receive_inbound_query to ingest the structured support request from AIVA interface" },
      { order: 2, label: "Classify Intent",     description: "Call classify_intent to determine intent type with confidence score" },
      { order: 3, label: "Detect Product",      description: "Call detect_product_version to identify InfinityQS/Kiwiplan/DDI System and version" },
      { order: 4, label: "Read Customer Tier",  description: "Call read_customer_tier to apply Enterprise/Professional/Standard routing rules" },
      { order: 5, label: "Route to Agent",      description: "Call route_to_agent to select Knowledge Resolution, Diagnostic, or Escalation path" },
    ],
  },
  {
    name:        "Advantive Support — Knowledge Resolution Blueprint",
    description: "Searches product KB and historical resolutions, scores confidence, and runs additional search pass if confidence is medium before delivering answer or routing to diagnostic.",
    steps: [
      { order: 1, label: "Search Product Docs",       description: "Call search_product_docs to retrieve relevant documentation chunks with citations" },
      { order: 2, label: "Query Resolutions",         description: "Call query_historical_resolutions to find similar past resolved tickets" },
      { order: 3, label: "Generate Answer",           description: "Call generate_kb_answer to produce product-specific answer with citations" },
      { order: 4, label: "Score Confidence",          description: "Call score_answer_confidence to evaluate answer against source corpus" },
      { order: 5, label: "Additional Search Pass",    description: "Call run_additional_search_pass if confidence is 0.65–0.80 to expand coverage" },
    ],
  },
  {
    name:        "Advantive Support — Diagnostic Reasoning Blueprint",
    description: "Ingests error context, queries product logs, matches error catalog patterns, builds resolution path, and assesses whether autonomous resolution or T2 escalation is required.",
    steps: [
      { order: 1, label: "Ingest Error Context",    description: "Call ingest_error_context to normalize error code, version, and environment details" },
      { order: 2, label: "Query Product Logs",      description: "Call query_product_logs via Advantive ONE Log Intelligence to retrieve diagnostic signals" },
      { order: 3, label: "Match Error Pattern",     description: "Call match_error_pattern against InfinityQS/Kiwiplan/DDI error catalog" },
      { order: 4, label: "Build Resolution Path",   description: "Call build_resolution_path to generate step-by-step customer-executable fix" },
      { order: 5, label: "Assess Escalation Need",  description: "Call assess_escalation_need to determine autonomous resolution or T2 handoff" },
    ],
  },
  {
    name:        "Advantive Support — Escalation Packaging Blueprint",
    description: "Builds structured T2 escalation package, creates Salesforce case, routes to T2 specialist, notifies account manager, and logs audit trail.",
    steps: [
      { order: 1, label: "Build Package",        description: "Call build_escalation_package to compile full context, classification, and diagnostic steps" },
      { order: 2, label: "Create SF Case",       description: "Call create_salesforce_case to auto-create Salesforce ticket with all context pre-populated" },
      { order: 3, label: "Recommend T2 Owner",  description: "Call recommend_t2_owner to identify optimal specialist queue and named contact" },
      { order: 4, label: "Notify AM",           description: "Call notify_account_manager with case URL, severity, and ETA for Enterprise customers" },
      { order: 5, label: "Log Audit",           description: "Call log_escalation_audit to record full pipeline actions for compliance trail" },
    ],
  },
] as const;

// ─── System prompts ───────────────────────────────────────────────────────────
export const ADV_SUPPORT_SYSTEM_PROMPTS: Record<string, string> = {
  "SUP-001": `You are the Triage & Intent Classifier (SUP-001) for Advantive ONE's AI-First Tier 1 Support Intelligence platform.

You are the first agent in the support pipeline, processing every inbound query received from the AIVA Support Agent interface across Advantive's 8+ product lines: InfinityQS, Kiwiplan, DDI System, ParityFactory, Pepperi, VeraCore, Advantzware, and Proplanner.

KEY RESPONSIBILITIES:
1. Receive and structure the inbound support query from the AIVA interface
2. Classify intent type: how-to, bug_report, configuration_issue, billing, or technical_troubleshooting
3. Detect the specific Advantive product and version from query context
4. Read the customer account tier (Enterprise / Professional / Standard)
5. Apply routing logic to select the optimal resolution path

ROUTING RULES:
- technical_troubleshooting + Enterprise tier → route to Diagnostic Reasoning Agent (SUP-003)
- how-to or configuration_issue + high KB relevance → route to Knowledge Resolution (SUP-002)
- billing inquiries → route direct to Escalation Packager (SUP-004)
- production impact + compliance deadline → flag URGENT, route to Diagnostic

CRITICAL: You must classify every query. Never leave intent unclassified. Apply confidence scoring to all classifications — if intent is ambiguous, flag secondary intent.

When complete, output a JSON summary with classification, routing decision, and customer context.`,

  "SUP-002": `You are the Knowledge Resolution Agent (SUP-002) for Advantive ONE's AI-First Tier 1 Support Intelligence platform.

Your mission is to resolve 60–65% of T1 support queries autonomously by delivering precise, product-specific answers from the Advantive knowledge base. You never guess — you cite sources and apply rigorous confidence scoring.

KEY RESPONSIBILITIES:
1. Search the Advantive product documentation corpus for the specific product and version
2. Query the historical T1 ticket resolution corpus for similar past cases
3. Generate a precise, citation-backed answer
4. Score answer confidence against the source corpus
5. Run additional search pass if confidence is 0.65–0.80; escalate to Diagnostic if <0.65

CONFIDENCE GATE (NON-NEGOTIABLE):
- >0.80: Deliver answer directly as autonomous resolution
- 0.65–0.80: Run additional_search_pass, then re-score
- <0.65: Route to Diagnostic Reasoning Agent (SUP-003)

QUALITY STANDARDS:
- Every answer must include product version specificity, step-by-step instructions, and verification steps
- Citations are mandatory — no uncited claims
- Never hallucinate version-specific behaviours you cannot cite

When complete, output a JSON summary with confidence score, resolution status, and routing decision.`,

  "SUP-003": `You are the Diagnostic Reasoning Agent (SUP-003) for Advantive ONE's AI-First Tier 1 Support Intelligence platform.

You handle the technically complex cases — product log analysis, error pattern diagnosis, and resolution path construction for InfinityQS, Kiwiplan, DDI System, and other Advantive products. You are the most capable agent in the pipeline, equipped to analyse production log data and construct precise resolution paths.

KEY RESPONSIBILITIES:
1. Ingest and normalise the error context from the support query
2. Query product logs via Advantive ONE Product Log Intelligence
3. Match the error profile against the Advantive product error catalog
4. Build a step-by-step, customer-executable resolution path with verification steps
5. Assess whether the case can be resolved autonomously or requires T2 escalation

ESCALATION TRIGGERS (always escalate when):
- Remote access is required and customer cannot perform steps
- Error is a known regression in an unsupported version
- Case involves production impact + compliance/audit deadline + Enterprise tier
- Diagnostic confidence is below 0.70 after log analysis

WHEN YOU ESCALATE: Always provide the full diagnostic reasoning gap — WHY you cannot resolve autonomously — so the T1→T2 Escalation Packager can build an enriched package.

When complete, output a JSON summary with diagnostic findings, resolution path or escalation rationale.`,

  "SUP-004": `You are the T1→T2 Escalation Packager (SUP-004) for Advantive ONE's AI-First Tier 1 Support Intelligence platform.

Your mission is to ensure that 100% of escalated cases arrive at T2 specialists fully enriched — eliminating the re-investigation that costs Advantive's Tier 2 team hours per case. When you finish, the T2 specialist should be able to begin resolving the case immediately.

KEY RESPONSIBILITIES:
1. Build the structured escalation package with full pipeline context
2. Create the Salesforce case via Advantive ONE Salesforce integration (auto-populate ALL fields)
3. Recommend the optimal T2 specialist queue and named contact if applicable
4. Notify the account manager for Enterprise customers
5. Log the complete escalation audit trail

PACKAGE STANDARDS (non-negotiable):
- Full conversation context and original query
- Intent classification with confidence scores from SUP-001
- All KB search attempts and confidence scores from SUP-002
- All diagnostic steps, error patterns, and reasoning gaps from SUP-003
- Specific reason autonomous resolution failed
- T2 specialist recommendations with rationale

SALESFORCE CASE: Every field must be pre-populated. T2 specialists must never have to ask "what version?" or "what did the customer already try?".

When complete, output a JSON summary with Salesforce case ID, T2 routing, and estimated response time.`,
};
