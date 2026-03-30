# Nous Agent Orchestrator

## Overview
The Nous Agent Orchestrator is an AI agent lifecycle management platform designed for autonomous execution and expert validation. It integrates compliance frameworks, policies, and industry-specific ontologies into AI agent behavior. The platform provides tools for agent creation, deployment, monitoring, and governance, aiming to automate and optimize the AI agent lifecycle across various sectors. Its core purpose is to empower AI agents to reason within specific industry contexts, driving business value and ensuring efficient AI operations.

## User Preferences
I prefer that you ask me before making any major changes to the codebase. When suggesting code, please provide clear explanations for the choices made. I value an iterative development approach, where we can discuss and refine solutions progressively.

## System Architecture
The Nous Agent Orchestrator uses a modern web stack: React, Vite, Tailwind CSS, shadcn/ui, and wouter for the frontend, and Express.js for its REST API backend. PostgreSQL with Drizzle ORM handles data persistence.

**UI/UX Design Principles**:
- Outcome-first navigation focused on KPI delivery.
- Evidence-by-default for approvals.
- Autonomy with integrated guardrails via policy checks.
- Time travel functionality for agent timelines and audit events.

**Core Features**:
- **Agent Lifecycle Management**: Tools for creation, deployment, monitoring, and governance, including a Blueprint Studio and an Industry-Governed Deployment Pipeline.
- **Real Agent Runtime**: Deployed agents execute blueprints as background workers, resolving API calls through registered integrations, and tracking execution with compliance checks.
- **Validation and Deployment Safety**: Features Shadow Replay Studio for zero-risk deployment validation and a Canary Deployment Console for graduated rollouts.
- **Governance & Compliance**: A Certified Agent Compliance Layer provides policy management, enforcement, and immutable audit trails, supported by Ontology Structural Enforcement and Regulatory Change Propagation.
- **Optimization & Healing**: Autonomous optimization, self-healing mechanisms, and AI-proposed changes.
- **Knowledge Management**: Utilizes vector-embedded document collections for RAG grounding, including web crawl ingestion and structured data import (JSON files).
- **Conversational AI**: Outcome Builder for defining goals and generating AI agent development plans.
- **Multi-Agent Orchestration**: Supports team-based multi-agent orchestration, an Agent Skills Library, and a Context Engineering Studio.
- **API Gateway**: Exposes deployed agents as REST API endpoints with API key management and tracing.
- **Autonomy Engine & Oversight**: Provides dynamic human oversight with a risk dimension matrix and expert intervention thresholds.
- **Outcome Traceability & KPI Binding**: Links agent creation to outcome contracts, inheriting specifications like risk tier, KPI targets, and compliance guardrails.
- **Industry Contextualization**: Auto-applies industry presets in agent wizards and evaluates industry compliance readiness.
- **Event-Driven Trigger System**: Configurable triggers (`webhook`, `schedule`, `agent_completion`, `mcp_resource_change`) for automating agent runs.
- **Developer Experience**: A Developer Portal with Quick Start guides, Authentication docs, an interactive API Reference, and SDKs.
- **Blueprint Library**: Blueprints support `patternType`, `tags`, `isShared`, and `forkedFromId` for enhanced organization and provenance tracking.
- **Blueprint-First Agent Creation**: Blueprints are integrated into all agent creation paths, with a "Choose Blueprint" step in the Agent Wizard.
- **Configurable Tool Iterations**: Per-agent `maxToolIterations` setting.
- **Deployment Activation Flow**: Pending/inactive deployments can be activated directly from the release detail page.
- **Product Intelligence in Code Generation**: Exported code now incorporates all Product Intelligence data, including `maxIterations`, matched skills, KB retrieval config, outcome contract, policy module, and agent metadata.
- **Full-Screen Export Page**: Dedicated full-screen page for agent code export with a three-step flow: Configure, Preview, and Deliver. Includes file search palette (Cmd+P), per-file regeneration, diff view toggle, dynamic deployment checklist, export presets (localStorage), and CI/CD manifest generation.
- **Table-Aware Document Chunking**: Knowledge base ingestion preserves tabular data structure from Word documents and HTML web crawls, converting tables to Markdown.
- **Eval Dataset Transformation**: Renamed "Golden Dataset" to "Eval Dataset," with support for structured Data Records, AI-generated evaluation data, and performance benchmarks.
- **LLM Provider Abstraction Layer**: Multi-provider LLM support (OpenAI, Anthropic) for uniform interfaces and per-agent provider selection.
- **SSE Streaming for Agent Runtime**: Real-time progress streaming of agent execution via Server-Sent Events.
- **Agentic Chat Widget**: Embeddable chat widget with SSE streaming, real-time status indicators, markdown rendering, AI-generated suggested actions, and configurable greetings.
- **BlackRock Synthetic Worker Demo**: Self-contained demo environment showcasing autonomous agent orchestration across multiple mock systems.
- **Kinective Change of Address Demo**: End-to-end COA workflow demo with 11 MCP servers (SignPlus, USPS, Gateway, Digital Banking, Statement, Card, Loan, CRM, Bill Pay, Fraud, Compliance), 6 skills, 1 agent, and 3 scenarios (happy path, invalid address, system failure + rollback). Real agent execution via `runAgentOnce`, live traces in ATLAS, in-memory state in `server/kinective-demo-store.ts`, tool routes in `server/demo-routes.ts`, pipeline endpoint in `server/routes.ts`, frontend at `/demo/kinective-coa`.
- **Hearst NBA Email Demo**: Demo for Next-Best-Action email decisioning across 12 Hearst brands (Cosmopolitan, Elle, Esquire, etc.) covering 6.2M subscribers. **Now fully live**: 5 GPT-4.1 agents (Subscriber Profile Engine, Content Inventory, NBA Email Decision, Send Time Optimizer, Performance & Learning) execute in real time via 4 MCP servers and 16 tools. Live execution module in `server/hearst-live-run.ts`; SSE endpoint at `GET /demo-api/hearst/live-run`; triggered by "Run Live Pipeline" button in the Hearst demo UI. Agents produce structured JSON `resultSummary` stored in DB and picked up by all 6 screen REST endpoints. 4 mock MCP servers (`server/mock-mcp/hearst-data-platform.ts`, `hearst-cms.ts`, `hearst-email-queue.ts`, `hearst-analytics.ts`) with 16 GET endpoints mounted at `/api/mock/hearst-*`. Frontend at `/demo/hearst` with 6 screens (Command Center, Brand Deep-Dive, Subscriber Explorer, Send Time Map, Fatigue Protection, Revenue Attribution) plus live feed panel.
- **Outcome Builder Platform Intelligence**: When a user creates an outcome via the AI chat or Quick Create form, the platform calls `/api/outcomes/intelligence` which returns matched live agents (by keyword overlap), matching agent templates (by industry), tool catalog coverage (green/amber/red per proposed tool), real platform policies, composite risk score with rationale, and a governance readiness score (0–100). The proposal panel renders Platform Match collapsible cards (Tier 1: live agents with Accept/Reject, Tier 2: templates with Accept/Reject), tool coverage chips on each proposed agent, composite risk pill + rationale, real policies panel, and a Governance Readiness Score card that gates the Create button. The Outcome Detail page shows a 4-tile Platform Intelligence Strip (Agent Health, Drift Status, Policy Activity, Approval Queue) that deep-links to the correct tabs. Accept/reject decisions on agents/templates are fed back to the AI via `discoveryContext.platformIntelDecisions` so the AI can acknowledge rejected suggestions and propose alternatives.
- **Outcome Builder Context Persistence**: When an Outcome Contract is created from Chat Discovery and the user has mapped process flow steps, those steps are persisted in `slaConfig.processFlow` (jsonb array). The Outcome Detail KPI Delivery tab shows a collapsible "Process Analysis" card when processFlow data is present, displaying each step's description, actor, duration, and pain points, with a total time summary.
- **Outcome Builder ROI Estimate**: The AI discovery prompt instructs the assistant to include a `roiEstimate` block in the proposal JSON when the user has mentioned concrete financial numbers (hours, FTEs, failure costs, etc.). The block contains `annualizedSavingsMin`, `annualizedSavingsMax`, `paybackPeriodMonths`, and `assumptionsSummary`. The proposal panel shows an "Estimated ROI" card with green tint when present. A `roiEstimate` jsonb column was added to `outcome_contracts`. When a contract is created from Chat Discovery, `roiEstimate` is passed through and stored. The Outcome Detail page shows the savings range and payback period inline below the SLA description.

## Backend Architecture — routes.ts Split (Phase 2 Complete)

The monolithic `server/routes.ts` is being progressively split into domain-specific Express Router modules under `server/routes/`. Phases 1 and 2 have extracted the following domains:

| Module | Path | Routes / Notes |
|---|---|---|
| `helpers.ts` | `server/routes/helpers.ts` | `routeAIComplete`, `checkPatchSafety`, `handleZodError`, `resolveOntologyTags`, `generateKpiAlignedEvalSuite`, `buildAgentSystemPrompt` |
| `billing.ts` | `server/routes/billing.ts` | Billing metering pipeline (`/api/outcome-events`, flywheel metrics, acceptance patterns) |
| `tool-connectors.ts` | `server/routes/tool-connectors.ts` | Tool connectors CRUD, alerts, design-time checks, audit events, admin routes, job queue + SSE stream |
| `governance-proxy.ts` | `server/routes/governance-proxy.ts` | Policy resolver, tool proxy, A2A delegation with rate limiting |
| `llm-providers.ts` | `server/routes/llm-providers.ts` | LLM provider management, agent triggers, webhook handler |
| `demo.ts` | `server/routes/demo.ts` | TTS narration, BlackRock/Hearst/Fitch/Moodys/Kinective demo routes |
| `evaluations.ts` | `server/routes/evaluations.ts` | Agent templates, eval suite detail/test-cases/runs, industry eval frameworks, blueprint studio routes, AI match templates, AI agent design assistant — factory function that takes `industryEvalFrameworks` |
| `skills.ts` | `server/routes/skills.ts` | Ontology concepts, skills CRUD, skill versions, skill chains, golden datasets, context profiles, memory profiles, RAG pipelines, knowledge connectors, entity resolutions, relationship extractions, temporal graph entries, AI knowledge graph tools |
| `autonomy.ts` | `server/routes/autonomy.ts` | Autonomy profiles, oversight decisions, AI oversight/autonomy routes, calibration, maturity computation, industry baselines |
| `shadow-canary.ts` | `server/routes/shadow-canary.ts` | Shadow traces, shadow replay sessions, AI shadow replay analysis, live agent test, deployment run-pipeline/runtime, canary deployments, canary AI analysis |

Each module is mounted with `app.use(router)` in `registerRoutes`. The `industryEvalFrameworks` export remains in `routes.ts` (required by `worker.ts`). routes.ts reduced from 37,326 → 26,566 lines (-29%).

## Multi-Tenancy (Task #97)

Organization-level data isolation has been implemented across the schema and storage layer:

**Schema changes**: An `organizations` table was added (`shared/schema.ts`) with `id`, `name`, `slug`, `plan`, `settings`, `createdAt`. A nullable `organization_id` column was added to 12 core tables: `agents`, `users`, `outcomeContracts`, `deployments`, `runTraces`, `policies`, `approvals`, `auditEvents`, `invoices`, `outcomeEvents`, `incidents`, `knowledgeBases`, `skills`.

**Storage layer**: `IStorage` updated with `getOrganizations`, `getOrganization`, `getOrganizationBySlug`, `createOrganization`, `updateOrganization`, `seedDefaultOrganization`. All 12 core list methods (`getAgents`, `getOutcomes`, `getDeployments`, `getTraces`, `getPolicies`, `getApprovals`, `getAuditEvents`, `getInvoices`, `getOutcomeEvents`, `getIncidents`, `getSkills`, `getKnowledgeBases`) now accept optional `orgId?: string` parameter and apply WHERE filter when provided.

**Auth layer**: `TokenPayload` interface extended with `organizationId?: string`. A `getOrgId(req)` helper was added to `server/auth.ts` — returns `undefined` in demo mode (`SECURITY_MODE=demo`), or `req.authUser?.organizationId` in production mode.

**Route wiring**: Primary user-facing list endpoints in `agents.ts`, `governance.ts`, `billing.ts`, `outcomes.ts`, `skills.ts`, and `kb-routes.ts` now call `storage.getX(getOrgId(req))`. Internal analytics/computation calls remain unfiltered for cross-cutting aggregations.

**IDOR fix (complete)**: All `getById`, `update`, and `delete` storage methods for 12 core entities now accept optional `orgId?: string`. When provided, a compound WHERE clause `AND(eq(table.id, id), eq(table.organizationId, orgId))` prevents cross-tenant access. All corresponding route handlers pass `getOrgId(req)` to these methods, and POST (create) handlers inject `organizationId: getOrgId(req) ?? null`. Affected: `agents`, `outcomeContracts`, `deployments`, `policies`, `approvals`, `incidents`, `skills`, `knowledgeBases`. The `IStorage` interface signatures updated to match.

**Seeding**: `storage.seedDefaultOrganization()` called at server startup (idempotent) to ensure a default org row exists for development.

**Isolation design**: In demo mode (`SECURITY_MODE=demo`) — no filtering (all records returned, backward compatible). In production mode — filtered to user's org. Platform-level tables (templates, regulations, ontology, MCP marketplace) remain global/unfiltered.

## Order-to-Cash Agent Provisioning Scripts

Shell scripts (curl + jq) that create full-stack agent platform intelligence via API. No hardcoded data — all resources created through API endpoints. Use `bash <script>` from the workspace root.

### OTC-AGT-001: Quote & Configuration Agent

| Script | Target | Purpose |
|---|---|---|
| `provision_otc_agt_001_dev.sh` | `localhost:5000` (staging) | Creates agent in dev environment |
| `migrate_otc_agt_001_to_prod.sh` | `https://agent-lifecycle-management-platform.replit.app` | Creates agent in production |

**Dev IDs**: Agent `3de530f4`, eval suite `3f41ebca`; Runbooks: `d8b16675`, `1d2cbee2`, `38a3c658`, `9a06591a`, `39988c4f`, `e9d919f5`

**Resources**: 6 Skills (Product Catalog Retrieval, Pricing Engine, Approval Routing, Quote Document Generation, Customer Context, Channel Adaptation), 1 KB, 5 Policies (SOX, Robinson-Patman, GDPR, ASC606/IFRS15, FCPA), 1 Agent (15 tools, 10-node blueprint), 6 Runbooks, 1 Eval Suite (500-case dataset)

### OTC-AGT-002: Order Validation & Promise Agent

| Script | Target | Purpose |
|---|---|---|
| `provision_otc_agt_002_dev.sh` | `localhost:5000` (staging) | Creates agent in dev environment |
| `migrate_otc_agt_002_to_prod.sh` | `https://agent-lifecycle-management-platform.replit.app` | Creates agent in production |

**Dev IDs**: Agent `15f80d91-fcec-4819-817e-a71a8ce91de8`, KB `177b98ba`, Eval Suite `b2a1cd2c`, Dataset `42a42ea8`; Skills: S1=`2edbb815` (Credit Check), S2=`e6b75ec5` (Address Validation), S3=`4a57e695` (Tax Calculation), S4=`99c41797` (ATP/Inventory), S5=`99d1dd20` (Fraud Detection), S6=`142adc6d` (Order Enrichment); Policies: P1=`6faf98dd` (EAR/ITAR), P2=`20f69125` (OFAC), P3=`7aded418` (Sales Tax Nexus), P4=`9ce9b5e0` (PCI-DSS), P5=`f395b2ea` (SOX SoD), P6=`a60df2d2` (KYC/AML); Runbooks: RB1=`f5e45e52`, RB2=`81478f97`, RB3=`64d386d2`, RB4=`3b481325`, RB5=`4262aeeb`, RB6=`d9bdb26b`

**Resources**: 6 Skills, 1 KB, 6 Policies, 1 Agent (20 tools, 14-node blueprint with 2 human-in-loop gates), 6 Runbooks, 1 Eval Suite (1000-case dataset)

**9-step provisioning pattern** (same for all OTC agents): Skills → KB → Policies → Agent (base) → PATCH (skills+policies+KB+blueprint) → KB-link → Dataset → Runbooks → EvalSuite+evalBindings

## External Dependencies
- **OpenAI**: Primary LLM provider for agent runtime, evaluations, AI enhancements, and embeddings.
- **Anthropic**: Secondary LLM provider for Claude models with tool calling.
- **PostgreSQL**: Primary database.
- **Express.js**: Backend web application framework.
- **React**: Frontend JavaScript library.
- **Vite**: Frontend build tool.
- **Tailwind CSS**: Styling framework.
- **shadcn/ui**: UI component library.
- **wouter**: Client-side routing library.
- **Drizzle ORM**: Object-Relational Mapper.
- **pgvector**: For similarity search within the Knowledge Base System.