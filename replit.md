# ALMP - Agent Lifecycle Management Platform

## Overview
ALMP is an Agent Lifecycle Management Platform designed for managing AI agents with an 80% autonomous execution and 20% expert validation model. The platform focuses on outcome-driven billing, where customers pay for measurable results. It provides tools for agent creation, deployment, monitoring, and governance, aiming to deliver business value and enable efficient AI operations by automating and optimizing the AI agent lifecycle.

## User Preferences
I prefer that you ask me before making any major changes to the codebase. When suggesting code, please provide clear explanations for the choices made. I value an iterative development approach, where we can discuss and refine solutions progressively.

## System Architecture
The platform utilizes a modern web stack: React, Vite, Tailwind CSS, shadcn/ui, and wouter for the frontend; Express.js for the backend REST API; and PostgreSQL with Drizzle ORM for the database.

**UI/UX Design Principles**:
- Outcome-first navigation for KPI delivery status.
- Evidence-by-default for approvals, including configuration differences and blast radius analysis.
- Autonomy with guardrails, checking policies before actions.
- Time travel for agent timelines, aggregating version changes and audit events.

**Core Features**:
- **Overview Dashboard**: Displays platform health, KPI progress, and agent status.
- **Outcomes**: Manages outcome contracts, KPIs, SLAs, and pricing.
- **Agents**: Agent Registry for management and monitoring, supporting single, team (composite orchestrators), and remote (A2A-connected) agent types. Remote agents leverage Google A2A AgentCards with capability discovery and trust tiers. Team agents support member roles.
- **Blueprint Studio (Reimagined)**: Auditable Industry Configuration-as-Code. Visual editor for creating, versioning, and compiling agent blueprints with static checks and approval flows. Supports MCP Dependencies, MCP Tool Nodes, Context Nodes, and compiler snapshots for reproducibility. Includes Team Blueprint support for graph-based orchestration with various node types, edge contracts, and failure modes. Enhanced with: Compliance Annotations (each blueprint node links to the regulatory requirement it satisfies, e.g., "HIPAA §164.502(b) Minimum Necessary Standard"), Industry Constraint Enforcement (compile-time errors for HIPAA/PCI-DSS/EU AI Act/SOC 2 violations), Diff Review with Compliance Impact (pull-request-style diff showing what changed and the regulatory impact), and Knowledge Graph Bindings (declared ontology scope with runtime enforcement).
- **Deployments**: Release Orchestrator with environment management, rollout strategies (shadow/canary/direct), auto-incident generation, and a Freeze Center.
- **Shadow Replay Studio**: Zero-risk agent deployment through production trace replay. Features 4 panels: Industry-Categorized Trace Library (traces organized by industry, scenario complexity, edge-case frequency, risk level), Replay Configuration (candidate vs baseline agent version selection, trace set picker, industry-specific comparison criteria), Semantic Diff Viewer (LLM-as-judge scoring with industry-specific rubrics for regulatory compliance, accuracy, safety), and Compliance Replay Checkpoint (per-regulation pass/fail with evidence artifacts). AI endpoints: POST /api/ai/generate-shadow-traces, POST /api/ai/shadow-replay-analyze. Persisted via shadow_traces and shadow_replay_sessions tables.
- **Canary Deployment Console**: Graduated rollout with industry-specific safety controls. Features 4 panels: Traffic Split with Industry Safety Gates (visual slider for 1%→5%→25%→50%→100% rollout with industry-specific safety gates for healthcare/financial/manufacturing), Industry KPI Comparison (real-time side-by-side baseline vs candidate metrics using industry-specific KPIs), Auto-Promotion/Rollback Rules (configurable industry-specific rules for automated deployment decisions), and Blast Radius Indicator (industry-contextualized exposure metrics showing customers, interactions, revenue, regulatory scope). AI endpoint: POST /api/ai/canary-analyze. Persisted via canary_deployments table.
- **Monitor**: Outcome SLA Dashboard, live runs, drift detection, and agent health monitoring. Features MCP-aware observability with OpenTelemetry-style span waterfalls for MCP interactions and an enhanced audit trail.
- **Governance**: Certified Agent Compliance Layer with policy management, enforcement, and audit trails. Includes a Regulatory Compliance tab for detecting regulations, generating policies (Policy-as-Code Engine using OPA Rego and Cedar), and managing regulatory changes. AI features support policy generation, enhancement, gap analysis, and impact analysis.
- **Optimization (Patch Center)**: Autonomous optimization, self-healing, AI-proposed changes, and experiment management.
- **Healing Operations Center**: Closed-loop autonomous remediation with industry-aware diagnosis. Features 4 panels: Active Healing Pipelines (8-stage pipeline: Detected→Diagnosed→Hypothesis→Experiment→Verified→Approved→Deployed→Resolved with industry-specific diagnosis templates), Business Impact Quantification (dollar impact using industry-specific models for Financial/Healthcare/Manufacturing/Insurance/Retail), AI-Generated Remediation with Industry Guardrails (proposed fixes constrained by industry regulations), and Experiment Dashboard (A/B validation with industry-specific success criteria). AI endpoint: POST /api/ai/healing-diagnose. Persisted via healing_pipelines table.
- **Approvals**: Expert validation queue and approval gates for human oversight, combining MCP elicitation with ALMP supervision.
- **Billing**: Outcome-based metering and invoicing.
- **Evaluation Evidence System**: Provides robust evidence for agent performance and risks.
- **Outcome Builder**: Conversational AI for defining goals and drafting outcome contracts.
- **Role-based Access**: Six switchable personas for tailored access.
- **Global App Shell**: Provides environment selection, search, command palette, notifications, and role switcher.
- **Adaptive Autonomy Engine**: Dynamic, context-aware human oversight replacing static 80/20 ratios. Features 4 panels: Risk Dimension Matrix (industry-specific risk dimensions with configurable weights and oversight levels for Financial Services, Healthcare, Manufacturing, Insurance, Retail), Autonomy Spectrum (5-level slider per action type: Full Auto → Log Only → Notify After → Confirm Before → Expert Approval Required), Override Calendar (time-based autonomy overrides for special periods like quarter-end close or audit windows), Learning Dashboard (AI-analyzed approval patterns with recommendations to evolve autonomy thresholds). Persisted via autonomy_profiles table. AI endpoint: POST /api/ai/autonomy-recommendations.
- **Sidebar Navigation**: Organized into 6 collapsible groups (Core, Build, Evaluate, Deploy & Observe, Govern, System) with ~15 top-level items. Sub-pages (Skill Studio, Skill Composer, Policy Engine, Approval Gates, Ops, Self-Heal, MCP Apps, Marketplace, Outcome Builder) are accessed from within their parent pages via buttons/links rather than the sidebar.
- **Agent Skills Library**: Catalog of composable, versioned skill units with industry-organized browsing, search, filtering, and comparison features.
- **Context Engineering Studio**: Systematic management of what agents know and when they know it. Features 4 panels: Context Source Inventory (7 categories: System Instructions, Industry Ontology, Regulatory Context, Skill Instructions, Conversation History, Retrieved Knowledge, Tool Descriptions), Context Priority Matrix (drag-reorder with industry presets), Context Budget Visualizer (token allocation bar charts with AI optimization suggestions), and Context Compilation Preview (simulated context assembly for agent+task combinations). Persisted via context_profiles table.
- **Industry Workspace Selector**: Global context switch adapting platform terminology and activating regulatory frameworks based on selected industry profiles (Financial Services, Insurance, Healthcare, Manufacturing, Retail, Custom). Includes a Department Layer for granular framework activation and agent assignment.

**Technical Implementations**:
- **Eval Studio**: Evaluation management including test cases, run history, and regression analysis.
- **Shadow Replay**: Replaying production traces for comparison and validation.
- **Autonomy Hooks**: Automated actions like expanding eval suites or quarantining agents.
- **Code Generation / Export**: Supports dual-mode deployment (config-driven runtime or standalone code export) via an Export Wizard.
- **AI Endpoints**: Dedicated APIs for conversational design, template matching, outcome discovery, and AI-generated test cases.
- **Self-Healing Loop**: Automates incident resolution from detection to deployment.
- **Deployment Sequence**: Orchestrates deployments through various environments with auto-computed approvals and monitoring.
- **Billing Metering Pipeline**: Ingests outcome events, applies processing rules, and generates tamper-evident billing data.
- **Immutable Audit Log**: Hash-chained audit log for integrity verification.
- **Redaction Profiles (R0/R1/R2)**: Tiered data redaction for sensitive information.
- **Tool Proxy Control Point**: Unified proxy for MCP tool calls and A2A delegations, enforcing allowlists, rate limiting, and trust-tier checks.
- **MCP Server Directory**: Manages MCP server integrations, including capability negotiation and catalog synchronization.
- **MCP Tool Registry**: Governed inventory of tools with details, schemas, governance fields, and drift detection.
- **MCP Resources**: Governed knowledge connectors with sensitivity classification, approval gates, and freshness tracking.
- **MCP Prompt Library**: Imports MCP prompt templates and binds them into blueprints, with domain expert publishing and security admin approval flows.
- **Ontology Explorer**: Industry knowledge graph browser with concept details, search, and AI-enhanced descriptions. Includes AI-powered ontology generation for industries without seed data (e.g., Insurance) via POST /api/ai/generate-ontology endpoint. Features Customer Extension Layer (add org-specific concepts on top of industry ontology with clear standard vs custom separation), Ontology Health Dashboard (coverage, consistency, freshness, gap detection metrics), enhanced concept detail (synonyms, usage statistics, linked regulations), and Graph Visualization (interactive SVG node-edge view with category-colored nodes and click-to-select).
- **Memory Architecture Manager**: Defines how agents manage long-term and working memory with industry-specific retention and governance rules. Features 4 panels: Memory Tier Configuration (Working/Episodic/Semantic), Industry-Specific Memory Rules (Healthcare/HIPAA, Financial Services/PCI-DSS, Insurance/ACORD, Manufacturing/ISO 9001, Retail/PCI), Memory Inspection Console (view agent memories across tiers), and Forgetting Policies (GDPR erasure, retention expiry, competitive quarantine). Persisted via memory_profiles table. AI-powered rule generation via POST /api/ai/suggest-memory-rules.
- **RAG Pipeline Manager**: Configures how agents retrieve industry-specific knowledge at runtime. Features 4 panels: Knowledge Source Registry (document collections, databases, knowledge graphs, external APIs with freshness/quality metrics), Retrieval Strategy Designer (Vector Similarity, GraphRAG, Hybrid, Cascading strategies with configuration dialogs), Industry Chunk Strategy (industry-specific chunking for clinical/legal/manufacturing/retail docs), and Retrieval Quality Dashboard (relevance scores, latency P50/P95/P99, context utilization, hallucination correlation). Persisted via rag_pipelines table.
- **Knowledge Graph Ingestion & Enrichment**: Tools for populating and maintaining the knowledge graph with customer-specific data. Features 4 panels: Data Source Connectors (ingest from document repositories, structured databases, APIs, manual entry with quality metrics and sync status), Entity Resolution (automatic deduplication with confidence scores and human review workflow), Relationship Extraction (LLM-powered extraction mapped to ontology-defined relationship types with source text snippets), and Temporal Graph (time-versioned entities/relationships with valid-from/valid-to dates and date range queries). Persisted via knowledge_connectors, entity_resolutions, relationship_extractions, temporal_graph_entries tables. AI features: Knowledge Graph Overview panel (mini SVG graph visualization with completeness metrics), AI Entity Resolution (auto-analyze entity pairs with match reasoning, confidence, canonical names), AI Relationship Extraction (paste text and auto-extract entities/relationships), AI Enrichment Suggestions (graph quality scoring, missing relationships, data gaps, quality issues). AI endpoints: POST /api/ai/resolve-entities, POST /api/ai/extract-relationships, POST /api/ai/knowledge-graph-suggestions.
- **Agent Wizard Ontology Integration**: AI-suggested ontology tags for agent definition.
- **Data Model**: Comprehensive schema linking incidents, patches, and deployments.

## External Dependencies
- **LLM Providers**: For AI capabilities.
- **PostgreSQL**: Primary database.
- **Express.js**: Backend framework.
- **React**: Frontend library.
- **Vite**: Frontend build tool.
- **Tailwind CSS**: Styling framework.
- **shadcn/ui**: UI component library.
- **wouter**: Routing library.
- **Drizzle ORM**: Database ORM.