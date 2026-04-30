## Nous Agent Orchestrator

### Overview
The Nous Agent Orchestrator is an AI agent lifecycle management platform designed for autonomous execution and expert validation. It integrates compliance frameworks, policies, and industry-specific ontologies into AI agent behavior. The platform aims to automate and optimize the AI agent lifecycle across various sectors by providing tools for agent creation, deployment, monitoring, and governance. Its core purpose is to enable AI agents to reason effectively within specific industry contexts, thereby driving business value and ensuring efficient AI operations.

### User Preferences
I prefer that you ask me before making any major changes to the codebase. When suggesting code, please provide clear explanations for the choices made. I value an iterative development approach, where we can discuss and refine solutions progressively.

### System Architecture
The Nous Agent Orchestrator utilizes a modern web stack: React, Vite, Tailwind CSS, shadcn/ui, and wouter for the frontend, and Express.js for its REST API backend. PostgreSQL with Drizzle ORM handles data persistence.

**UI/UX Design Principles**:
- Outcome-first navigation focused on KPI delivery.
- Evidence-by-default for approvals.
- Autonomy with integrated guardrails via policy checks.
- Time travel functionality for agent timelines and audit events.

**Core Technical Implementations & Features**:
- **Agent Lifecycle Management**: Comprehensive tools for creation, deployment, monitoring, and governance, including Blueprint Studio and an Industry-Governed Deployment Pipeline.
- **Real Agent Runtime**: Deployed agents execute blueprints as background workers, resolving API calls through registered integrations, and tracking execution with compliance checks.
- **Validation and Deployment Safety**: Features like Shadow Replay Studio for zero-risk deployment validation and Canary Deployment Console for graduated rollouts.
- **Governance & Compliance**: A Certified Agent Compliance Layer provides policy management, enforcement, immutable audit trails, Ontology Structural Enforcement, and Regulatory Change Propagation.
- **Optimization & Healing**: Autonomous optimization, self-healing mechanisms, and AI-proposed changes to enhance agent performance.
- **Knowledge Management**: Vector-embedded document collections for RAG grounding, supporting web crawl ingestion and structured data import.
- **Conversational AI**: Outcome Builder for defining goals and generating AI agent development plans.
- **Multi-Agent Orchestration**: Supports team-based multi-agent orchestration, an Agent Skills Library, and a Context Engineering Studio.
- **API Gateway**: Deployed agents are exposed as REST API endpoints with API key management and tracing.
- **Autonomy Engine & Oversight**: Dynamic human oversight is managed with a risk dimension matrix and expert intervention thresholds.
- **Outcome Traceability & KPI Binding**: Links agent creation to outcome contracts, inheriting specifications like risk tier, KPI targets, and compliance guardrails.
- **Industry Contextualization**: Auto-applies industry presets in agent wizards and evaluates industry compliance readiness.
- **Event-Driven Trigger System**: Configurable triggers (`webhook`, `schedule`, `agent_completion`, `mcp_resource_change`) for automating agent runs.
- **Developer Experience**: A Developer Portal offers Quick Start guides, Authentication docs, an interactive API Reference, and SDKs.
- **Blueprint-First Agent Creation**: Blueprints are central to all agent creation processes.
- **Configurable Tool Iterations**: Agents can have a per-agent `maxToolIterations` setting.
- **Deployment Activation Flow**: Pending/inactive deployments can be activated directly from the release detail page.
- **Product Intelligence in Code Generation**: Exported code integrates Product Intelligence data, including `maxIterations`, matched skills, KB retrieval config, outcome contract, policy module, and agent metadata.
- **Full-Screen Export Page**: Dedicated page for agent code export with configure, preview, and deliver steps, including file search, per-file regeneration, diff view, dynamic deployment checklist, and export presets.
- **Table-Aware Document Chunking**: Knowledge base ingestion preserves tabular data structure from Word documents and HTML, converting tables to Markdown.
- **Eval Dataset Transformation**: Supports structured Data Records, AI-generated evaluation data, and performance benchmarks.
- **LLM Provider Abstraction Layer**: Multi-provider LLM support (OpenAI, Anthropic) with uniform interfaces and per-agent provider selection.
- **SSE Streaming for Agent Runtime**: Real-time progress streaming of agent execution via Server-Sent Events.
- **Agentic Chat Widget**: An embeddable chat widget with SSE streaming, real-time status indicators, markdown rendering, AI-generated suggested actions, and configurable greetings.
- **Multi-Tenancy**: Organization-level data isolation is implemented across schema and storage, with `organization_id` added to core tables and filtering applied to storage methods.
- **Unified Workflow State (UWS)**: Provides typed, persistent, reducer-based workflow state across pipeline stages. This includes `workflow_state_schemas` and `workflow_state_checkpoints` tables for storing per-pipeline state schemas and per-run state snapshots. State updates are merged using field-level reducers via `/advance`, `/approve`, `/reject`, and `/simulate-stage` endpoints. Approval gate interrupts create interrupt checkpoints. A Workflow State panel in the pipeline run view displays current state, checkpoint history, and interrupt gate records.
- **Business Mode**: A multi-tenant UX layer for business stakeholders (`outcome_owner` role) featuring a `BusinessModeSidebar`, `BusinessCommandCenter` dashboard, and progressive disclosure rules to simplify the interface for business users.
- **Demo 4 — AI-Powered Cash Application** (`/demo/otc-cash`): NovaTech Industries / Financial demo featuring OTC-AGT-009 (Cash Application & Reconciliation) and OTC-AGT-006 (Billing & Collections). Scenario: $42M month-end payments, 94% auto-match, GlobalTech $2.3M cross-invoice remittance (47 invoices, 3 deductions, overpayment). Live SSE pipeline execution, agent runs visible in Agent Registry. Dev agent creation: `scripts/create-otc-agt-009-dev.js`. Dev→Prod migration: `scripts/migrate-otc-cash-to-prod.sh`.
- **BB Extension 1 — Odometer Fraud Detection** (`/demo/blackbook` → "Odometer Fraud Detection" scenario): BB-AGT-005 detects rollback fraud by cross-referencing declared odometer readings across all auction appearances. 2-agent pipeline (BB-AGT-001 + BB-AGT-005), SSE trace logs, 3 exception sub-scenarios (standard rollbacks, aggressive CRITICAL rollback, CARFAX service conflict). Agent created via Platform API (no direct DB write). 13-step provisioning: `node scripts/bb-ext1-provision-dev.mjs`. Dev IDs saved to `scripts/bb-ext1-dev-ids.json`. Prod migration: `node scripts/migrate-bb-ext1-to-prod.js`. Mock MCP: `server/mock-mcp/bb-odometer-verify.ts` (5 tools). Screen: `client-shared/pages/demo/bb-s6-odometer-fraud.tsx`.
- **HNP Government Beat Intelligence** (SCN-HNP-1, customer Hearst Newspapers): 4-agent pipeline `HNP-HOUSTON-GOVT-BEAT` — HNP-GOVT-01 Meeting Corpus Analyst → HNP-GOVT-02 Investigation Angle Detector → [Reporter Brief Review human gate] → HNP-GOVT-03 Story Draft + HNP-GOVT-04 FOIA Request Generator (parallel). Real Claude execution (Haiku 4.5 across all 4 agents — chosen for demo speed; previously mixed Opus 4.5 / Sonnet 4.5) via runAgentOnce. Live SSE handler: `server/hnp-govt-live-run.ts` streams agent events + tool calls; lazy lookup of agents by external ID, parallel execution gate after the human approval node. Mock MCP servers (4): `server/mock-mcp/hnp-assembly.ts`, `hnp-knowledge-base.ts`, `hnp-public-records.ts`, `hnp-cms.ts` (16 tools total — Hurricane Mara / Houston dataset, $340M drainage bond, Allied Hydro contractor, Mayor Whitmire, Council Pollard/Huffman). Dataset: 47 Houston transcripts past 90 days. Shared scenario defs: `server/hnp-govt-shared-defs.ts` (system prompts, scenario prompts for happy / source-attribution-fail / foia-routing-fail). Dev provisioning (13 steps, all via Platform APIs — 4 KBs, 4 MCP servers + 16 tools, 6 skills, outcome contract, 4 policies, 6 ontology concepts, 4 agents fully wired with skills/policies/KB-RAG/runtime/blueprint, KB+MCP links, eval suite + bindings, deployments per agent): `bash provision_hnp_govt_dev.sh`. Dev→Prod migration with org-ID discovery + X-Organization-Id headers + configurable MOCK_BASE_URL: `bash migrate_hnp_govt_to_prod.sh`. Editorial governance enforced by 4 policies (Human Reporter Gate, Source Attribution Requirement, Publication Boundary, FOIA Accuracy Gate).

### External Dependencies
- **OpenAI**: Primary LLM provider for agent runtime, evaluations, AI enhancements, and embeddings.
- **Anthropic**: Secondary LLM provider for Claude models with tool calling. Routed through Replit AI Integrations gateway (`AI_INTEGRATIONS_ANTHROPIC_API_KEY` + `AI_INTEGRATIONS_ANTHROPIC_BASE_URL`, both auto-injected by the `javascript_anthropic_ai_integrations` blueprint — charges go to Replit credits, no personal Anthropic account required). Falls back to direct `ANTHROPIC_API_KEY` when the gateway env vars are absent. Configured in `server/llm-provider.ts` `AnthropicProvider` constructor.
- **PostgreSQL**: Primary database for data persistence.
- **Express.js**: Backend web application framework.
- **React**: Frontend JavaScript library.
- **Vite**: Frontend build tool.
- **Tailwind CSS**: Utility-first CSS framework.
- **shadcn/ui**: UI component library.
- **wouter**: Client-side routing library.
- **Drizzle ORM**: Object-Relational Mapper for PostgreSQL.