# Nous Agent Orchestrator

## Overview
Nous Agent Orchestrator is an AI agent lifecycle management platform focusing on 80% autonomous execution and 20% expert validation. Its core purpose is to embed compliance frameworks, policies, and industry-specific ontologies directly into agent behavior. The platform provides tools for agent creation, deployment, monitoring, and governance, aiming to automate and optimize the AI agent lifecycle across six key industry verticals: Healthcare, Financial Services (including Credit Rating sub-domain), Manufacturing, Insurance, Retail, and Technology/SaaS. This differentiation positions it as a platform where AI agents reason within the user's industry context, driving business value and efficient AI operations.

## User Preferences
I prefer that you ask me before making any major changes to the codebase. When suggesting code, please provide clear explanations for the choices made. I value an iterative development approach, where we can discuss and refine solutions progressively.

## System Architecture
The Nous Agent Orchestrator is built on a modern web stack: React, Vite, Tailwind CSS, shadcn/ui, and wouter for the frontend; Express.js for the backend REST API; and PostgreSQL with Drizzle ORM for the database.

**UI/UX Design Principles**:
- **Outcome-first navigation**: Prioritizes KPI delivery status.
- **Evidence-by-default**: For approvals, including configuration differences and blast radius analysis.
- **Autonomy with guardrails**: Policies are checked before actions.
- **Time travel**: For agent timelines, aggregating version changes and audit events.

**Core Features**:
- **Landing Page**: Features project branding, highlights, and a product demo launcher.
- **Product Demo Player**: A full-screen cinematic presentation with 10 slides, including a narrative arc for a case study, OpenAI TTS narration, beat-driven background music (Web Audio API), animated transitions, and auto-advancement.
- **Overview Dashboard**: Displays platform health, KPI progress, and agent status.
- **Outcomes**: Manages outcome contracts, KPIs, SLAs, and business targets.
- **Agents**: Registry for managing and monitoring various agent types (single, team, remote), leveraging Google A2A AgentCards.
- **Blueprint Studio**: Visual editor for creating, versioning, and compiling auditable agent blueprints with static checks, approval flows, compliance annotations, and industry constraint enforcement, supporting graph-based orchestration.
- **Deployments (Industry-Governed Deployment Pipeline)**: Features a Release Orchestrator with industry-specific mandatory pipeline stages, auto-rollback triggers, and deployment evidence packages. This includes tailored stages and rollback conditions for Healthcare, Financial Services, Manufacturing, Insurance, and Retail, enforced by a regulatory policy-as-code engine. **Real Agent Runtime**: When deployed, agents start running as background workers that execute their blueprints on a schedule (every 5 minutes), resolving API calls through registered MCP Server integrations. The runtime tracks execution history with real weather data, severity analysis, and compliance checks.
- **Shadow Replay Studio**: Enables zero-risk agent deployment via production trace replay, offering trace libraries, replay configuration, semantic diff viewing, and compliance checkpoints. Includes **Live Agent Test** feature that calls real external APIs (e.g., Open-Meteo weather) through registered MCP Server integrations.
- **Canary Deployment Console**: Manages graduated rollouts with industry-specific safety controls, KPI comparison, and auto-promotion/rollback rules.
- **Monitor**: Provides outcome SLA dashboard, live run monitoring, drift detection, agent health observability, and **Agent Runtime** tab showing active runtimes and execution history with real-time data (temperature, wind speed, severity, alerts) from deployed agents.
- **Governance**: Certified Agent Compliance Layer with policy management, enforcement, and immutable audit trails, including a Regulatory Compliance tab for policy generation and change management.
- **Optimization (Patch Center)**: Facilitates autonomous optimization, self-healing, AI-proposed changes, and experiment management.
- **Healing Operations Center**: Provides closed-loop autonomous remediation with industry-aware diagnosis, business impact quantification, and AI-generated remediation.
- **Approvals**: Expert validation queue and approval gates for human oversight.
- **Evaluation Evidence System**: Provides robust evidence for agent performance and risks.
- **Continuous Industry Assurance Engine (Eval Studio)**: Manages evaluations with industry-contextualized testing, including golden dataset integration, mandatory regulatory test cases, and industry-specific scorers.
- **Knowledge Base System**: Vector-embedded document collections for RAG grounding. Features: 5 ingestion modes (document upload for PDF/DOCX/TXT/MD/CSV/JSON, web URL crawling, manual text entry, structured data import, API connector), OpenAI text-embedding-3-small embeddings, pgvector with HNSW index for similarity search, semantic search and RAG Q&A endpoints. KB detail page has 5 tabs (Sources, Chunks, Search & Query, Config, Linked Agents). Agents can be linked to KBs via Agent Detail "Knowledge Base" tab. **Agent Runtime RAG Integration** — When agents execute, the runtime retrieves chunks from linked Knowledge Bases and injects them as domain context into the AI system prompt.
- **Outcome Builder**: Conversational AI for defining goals and drafting outcome contracts. Includes **Agent Proposal Persistence** — AI-generated agent development plans (orchestrator, workers, pipeline) are automatically saved to the database, enabling engineers to navigate away and return later with the full plan restored including selection state. Plans can be manually saved after modifying selections. **Platform Intelligence-Enriched Plan Generation** — The agent proposal generator queries ALL platform resources in parallel (Agent Templates with full configs, Skills Library filtered by industry, MCP Servers & registered Tools, Active Policies, Ontology Concepts & Enhancements, RAG Pipelines, Knowledge Bases, existing outcome agents) and the selected Industry Context (jurisdiction, regulatory frameworks, departments). The AI prompt is structured with explicit sections for each intelligence source, instructing the model to assign real MCP tools, match real skills, reference ontology concepts, enforce policy constraints, calibrate risk from KPI weights/SLAs, suggest relevant Knowledge Bases for RAG grounding, and include regulatory compliance tags. Response normalization ensures all enrichment fields (matchedSkills, matchedOntologyConcepts, policyConstraints, mcpToolBindings, complianceTags, suggestedRagPipeline, suggestedKnowledgeBases, systemPrompt) are properly defaulted.
- **Team-Based Multi-Agent Orchestration**: Agent proposals create proper Team Agents using the platform's canonical team infrastructure (agentTeams, teamBlueprintNodes/Edges). Single POST endpoint atomically creates Team Agent, worker agents, membership records, blueprint, graph nodes, and edges. Teams integrate with Agent Teams page, Team Graph Editor, and Agent Detail views.
- **Role-based Access**: Six switchable personas for tailored access.
- **Global App Shell**: Provides environment selection, search, command palette, notifications, and role switcher.
- **Adaptive Autonomy Engine**: Dynamic, context-aware human oversight with a risk dimension matrix, autonomy spectrum, and override calendar.
- **Agent Skills Library**: A catalog of composable, versioned skill units with industry-organized browsing, search, and AI enhancement/generation capabilities for all five industries. Includes **Policy-Skill Validation** — real-time validation of skills against active policies-as-code. The Skill Studio editor has a "Validate Against Policies" button and auto-validates on save, checking tool usage constraints, pre-action requirements, data classification rules, audit requirements, and ontology compliance. Critical violations block save; warnings allow save with notification.
- **Context Engineering Studio**: Manages how agents acquire and utilize context, featuring context source inventory, priority matrix, and budget visualizer.
- **Industry Workspace Selector**: Global context switch adapting platform terminology and regulatory frameworks based on selected industry profiles.
- **Multi-Agent Pipeline Orchestrator**: Visual workflow editor for designing and executing multi-agent pipelines with sequential agent stages, approval gates, and AI-simulated scenario execution. Supports creating pipelines, adding agent/gate stages, running scenarios with real-time per-stage progression, and human approval checkpoints.
- **Agent API Gateway**: Exposes deployed agents as REST API endpoints for external invocation. Features include SHA-256-hashed API key management (create, list, revoke), a public invoke endpoint (`POST /api/gateway/v1/invoke/:agentId`) with API key authentication (X-API-Key or Bearer token), full execution tracing, policy checks, and cost tracking. The Agent Detail page includes an API Gateway tab with endpoint documentation, API key management UI, a live "Try It" console, and code examples (cURL, JavaScript, Python).

**Technical Implementations**:
- **Shadow Replay**: Replays production traces for validation.
- **Autonomy Hooks**: Automated actions like expanding eval suites or quarantining agents.
- **Code Generation / Export**: Supports dual-mode deployment via an Export Wizard.
- **AI Endpoints**: Dedicated APIs for conversational design, template matching, outcome discovery, AI-generated test cases, skill generation, skill enhancement, and TTS narration.
- **Self-Healing Loop**: Automates incident resolution.
- **Deployment Sequence**: Orchestrates deployments across environments with auto-computed approvals.
- **Billing Metering Pipeline**: Ingests outcome events for tamper-evident billing.
- **Immutable Audit Log**: Hash-chained for integrity verification.
- **Redaction Profiles**: Tiered data redaction for sensitive information.
- **Tool Proxy Control Point**: Unified proxy for MCP tool calls and A2A delegations.
- **MCP Server Directory, Tool Registry, Resources, Prompt Library**: Manages MCP integrations, tools, knowledge connectors, and prompt templates.
- **Ontology Explorer**: Industry knowledge graph browser with concept details, search, AI-enhanced descriptions, and KG-powered relationship suggestions (Suggest Relationships button queries Knowledge Graph and AI for related entities with accept/reject side panel). Includes a **Knowledge Graph Builder** wizard for generating sub-domain-specific ontologies (e.g., Credit Rating for Fitch Rating) via AI, with preview/review of generated concepts, select/deselect, and bulk import alongside existing concepts.
- **Memory Architecture Manager**: Defines agent memory management with industry-specific retention and governance.
- **RAG Pipeline Manager**: Configures how agents retrieve industry-specific knowledge at runtime.
- **Knowledge Graph Ingestion & Enrichment**: Tools for populating and maintaining the knowledge graph with customer-specific data.
- **Agent Wizard Ontology Integration**: AI-suggested ontology tags for agent definition.
- **MCP-Ontology Parameter Matching**: Cross-references MCP server tool parameters and resource names against ontology concepts. Auto-links matching parameters (exact, synonym, tag, substring, AI-fuzzy) and flags unmatched parameters as "not in domain vocabulary" with warning badges on the MCP server detail Vocabulary tab.
- **Data Model**: Comprehensive schema linking incidents, patches, and deployments.
- **Mock MCP Servers for Demo**: Built-in mock REST APIs simulating Marketo (marketing automation), Salesforce CRM, and Adobe Analytics for the Marketing Lead Management demo. Features: 1,000 deterministic financial services leads with realistic engagement data, Marketo-format lead/activity/smartlist endpoints, Salesforce SOQL query/CRUD endpoints, Adobe Analytics reports/segments endpoints. Routes mounted at `/api/mock/marketo`, `/api/mock/salesforce`, `/api/mock/adobe`. Registration via `POST /api/mock-mcp/seed-demo` creates 3 MCP servers (11 tools), a Marketing Lead Management outcome with 4 KPIs, and 3 demo agents (Lead Scoring, Lead Router, Marketing Analytics). The `callMcpTool` runtime supports per-tool endpoints, HTTP methods (GET/POST/PATCH), and path parameter substitution via tool `annotations`.

## External Dependencies
- **OpenAI**: For TTS narration, AI skill generation/enhancement, conversational design, and other AI features.
- **PostgreSQL**: Primary database.
- **Express.js**: Backend framework.
- **React**: Frontend library.
- **Vite**: Frontend build tool.
- **Tailwind CSS**: Styling framework.
- **shadcn/ui**: UI component library.
- **wouter**: Routing library.
- **Drizzle ORM**: Database ORM.
- **Web Audio API**: Used for beat-driven background music in the demo player.