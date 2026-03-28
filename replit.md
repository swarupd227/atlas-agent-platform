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