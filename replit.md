## ⛔ CLOSED FEATURES — NEVER REOPEN

| Feature | Status | Canonical paths | Rule |
|---|---|---|---|
| **Bundle Export** (`POST /api/agents/:id/export-code/bundle` + agent-export.tsx bundle UI toggle) | PERMANENTLY CLOSED ✅ | `server/routes/runtime.ts:5479` · `client/src/pages/agent-export.tsx` | NEVER plan, estimate, propose, re-implement, or reference as work-to-do. Treat as maintenance-only break/fix if regressions appear. |

---

# Nous Agent Orchestrator

## Overview
The Nous Agent Orchestrator is an AI agent lifecycle management platform for autonomous execution and expert validation. It integrates compliance frameworks, policies, and industry-specific ontologies into AI agent behavior. The platform provides tools for agent creation, deployment, monitoring, and governance, aiming to automate and optimize the AI agent lifecycle across various sectors. Its core purpose is to empower AI agents to reason within specific industry contexts, driving business value and ensuring efficient AI operations.

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
- **Agent Lifecycle Management**: Tools for creation, deployment, monitoring, and governance (Blueprint Studio, Industry-Governed Deployment Pipeline).
- **Real Agent Runtime**: Deployed agents execute blueprints as background workers, resolving API calls through registered integrations, and tracking execution with compliance checks.
- **Validation and Deployment Safety**: Shadow Replay Studio for zero-risk deployment validation and Canary Deployment Console for graduated rollouts.
- **Governance & Compliance**: Certified Agent Compliance Layer provides policy management, enforcement, immutable audit trails, Ontology Structural Enforcement, and Regulatory Change Propagation.
- **Optimization & Healing**: Autonomous optimization, self-healing mechanisms, and AI-proposed changes.
- **Knowledge Management**: Vector-embedded document collections for RAG grounding, including web crawl ingestion and structured data import.
- **Conversational AI**: Outcome Builder for defining goals and generating AI agent development plans.
- **Multi-Agent Orchestration**: Supports team-based multi-agent orchestration, an Agent Skills Library, and a Context Engineering Studio.
- **API Gateway**: Exposes deployed agents as REST API endpoints with API key management and tracing.
- **Autonomy Engine & Oversight**: Dynamic human oversight with a risk dimension matrix and expert intervention thresholds.
- **Outcome Traceability & KPI Binding**: Links agent creation to outcome contracts, inheriting specifications like risk tier, KPI targets, and compliance guardrails.
- **Industry Contextualization**: Auto-applies industry presets in agent wizards and evaluates industry compliance readiness.
- **Event-Driven Trigger System**: Configurable triggers (`webhook`, `schedule`, `agent_completion`, `mcp_resource_change`) for automating agent runs.
- **Developer Experience**: Developer Portal with Quick Start guides, Authentication docs, interactive API Reference, and SDKs.
- **Blueprint-First Agent Creation**: Blueprints are integrated into all agent creation paths.
- **Configurable Tool Iterations**: Per-agent `maxToolIterations` setting.
- **Deployment Activation Flow**: Pending/inactive deployments can be activated directly from the release detail page.
- **Product Intelligence in Code Generation**: Exported code incorporates Product Intelligence data, including `maxIterations`, matched skills, KB retrieval config, outcome contract, policy module, and agent metadata.
- **Full-Screen Export Page**: Dedicated full-screen page for agent code export with configure, preview, and deliver steps. Includes file search palette, per-file regeneration, diff view, dynamic deployment checklist, export presets, CI/CD manifest generation, and bundle export for team agents (maintenance-only — see CLOSED FEATURES above).
- **Table-Aware Document Chunking**: Knowledge base ingestion preserves tabular data structure from Word documents and HTML, converting tables to Markdown.
- **Eval Dataset Transformation**: Supports structured Data Records, AI-generated evaluation data, and performance benchmarks.
- **LLM Provider Abstraction Layer**: Multi-provider LLM support (OpenAI, Anthropic) for uniform interfaces and per-agent provider selection.
- **SSE Streaming for Agent Runtime**: Real-time progress streaming of agent execution via Server-Sent Events.
- **Agentic Chat Widget**: Embeddable chat widget with SSE streaming, real-time status indicators, markdown rendering, AI-generated suggested actions, and configurable greetings.
- **Multi-Tenancy**: Organization-level data isolation implemented across schema and storage, with `organization_id` added to core tables and filtering applied to storage methods.
- **Unified Workflow State (UWS)**: Typed, persistent, reducer-based workflow state across pipeline stages. `workflow_state_schemas` and `workflow_state_checkpoints` tables store per-pipeline state schemas and per-run state snapshots. `/advance`, `/approve`, `/reject`, and `/simulate-stage` merge state updates using field-level reducers. Approval gate interrupts create interrupt checkpoints with `interrupt_id`, `interrupt_payload`, and `interrupt_responded` fields. A Workflow State panel in the pipeline run view shows current state (JSON), checkpoint history, and interrupt gate records.

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

## OTC Agent Migration Status

| Agent | Code | Status | PROD ID |
|---|---|---|---|
| Legal Research Agent | LIT-AGT-001 | PROD | (in platform) |
| Contract Drafting Agent | LIT-AGT-002 | PROD | (in platform) |
| Compliance Monitor Agent | LIT-AGT-010 | PROD | (in platform) |
| Billing Agent (Littler) | LIT-AGT-003 | PROD | (in platform) |
| Client Portal Agent | LIT-AGT-004 | PROD | (in platform) |
| Fulfillment & Exception Agent | OTC-AGT-005 | PROD | f6d58adf (agent) |
| Billing & Collections Agent | OTC-AGT-006 | PROD ✅ | f516ede4-3ceb-4858-8b23-ede8cc851e78 |

### OTC-AGT-006 Dev IDs (from scripts/otc-agt-006-dev-ids.json)
- **Agent**: `96705f33-085c-48a2-a99c-a2ed2baf7dde`
- **KB**: `c32e2b16-16f5-457d-92b4-08ce9e2038e8` (6 sources)
- **Skills (6)**: Invoice Generation, Tax Calculation, Cash Application, Dunning Management, Dispute Investigation, AR Reporting
- **Runbooks (6)**: Invoice Gen Failure, Mass Payment Error, Tax Engine Down, Unmatched Payment, Dispute Backlog Surge, Month-End Close
- **Policies (6)**: ASC-606/IFRS-15, Sales Tax/VAT, E-Invoicing, SOX, PCI-DSS, AML
- **Golden Dataset**: `82674e38-e5c2-4669-a892-469d9b5fcf7a` (6 test cases)
- **Eval Suite**: `a98898c3-c1b6-420c-ba05-daf05bdb218f`
- **Outcome**: `cb0f6247-9bdf-4227-a979-c4807498ac6f`

### OTC-AGT-006 PROD IDs (from scripts/otc-agt-006-prod-ids.json)
- **Agent**: `f516ede4-3ceb-4858-8b23-ede8cc851e78`
- **KB**: `9429b432-0206-4d8e-985f-7658db9b30b9` (6 sources)
- **Skills (6)**: `931a9f18`, `6146bd02`, `0d976d0d`, `64003d39`, `5f9fe69c`, `2e316730`
- **Runbooks (6)**: `ac82fea5`, `4f2ad8f6`, `a3f91bce`, `73e9bed3`, `c6156561`, `e38e52e4`
- **Policies (6)**: `b1ca41a3`, `897898b9`, `3fbd7762`, `83a8e745`, `e3619c72`, `ba2b1356`
- **Golden Dataset**: `abdd63bb-9c85-4d77-bb90-4debc435f959` (6 test cases)
- **Eval Suite**: `3fe2763c-0536-465f-bde5-7f0cfe0a8f59`
- **Outcome**: `3cf0091e-ad99-4901-a289-39921d0d5ae4`

### OTC-AGT-008 Dev IDs (Dispute Resolution Agent)
- **Agent**: `ff6f9c53-397f-4915-b362-d37a7d6d8299`
- **Skills (6)**: Dispute Classification, Root Cause Analysis, Evidence Gathering, Resolution Recommendation, Customer Communication, Prevention Analytics
- **Runbooks (6)**: Volume Spike Response, High-Value Escalation, Duplicate Dispute Detection, Aging Alert, Systematic Error Investigation, Customer Relationship at Risk
- **Policies (6)**: SOX Audit Trail, Auto-Approval Threshold Control, FCBA Compliance, Segregation of Duties, Revenue Recognition Impact, Data Retention
- **Golden Dataset**: `6d9bd008-1c5a-4290-a0f2-224f224cae04` (6 test cases)
- **Eval Suite**: `82e09e3a-6b98-41e4-ba26-d5f60247e08f`

### OTC-AGT-009 Dev IDs (Cash Application & Reconciliation Agent)
- **Agent**: `99fe20ef-ec54-4447-9dac-e88e54827f84`
- **Skills (6)**: Remittance Parsing, Intelligent Matching, Deduction Coding, Bank Reconciliation, Exception Prioritization, Cash Position Reporting
- **Runbooks (6)**: Bank Feed Failure Recovery, Mass Payment File Error, Unapplied Cash Aging, Bank Recon Imbalance, Period-End Close, Remittance Format Change
- **Policies (6)**: SOX Controls, Duplicate Payment Detection, Suspicious Payment Source, Period Cutoff, Unapplied Cash Escalation, Remittance Data Privacy
- **Golden Dataset**: `0e08c13a-657b-4585-b4ca-ad9e53f57f67` (6 test cases)
- **Eval Suite**: `b1e17e41-500f-4882-b171-6e71d1d97fdb`

### OTC-AGT-008 PROD IDs (Dispute Resolution Agent)
- **Agent**: `6846942a-7d11-4eaf-9e8b-4be6a0deee72`
- **Eval Dataset**: `a3162b1f-d5ca-46d1-9b23-2b1deb24f1a5` (6 test cases)
- **Eval Suite**: `8dd77ace-4017-4aa6-844a-e1de25f53ed8`

### OTC-AGT-009 PROD IDs (Cash Application & Reconciliation Agent)
- **Agent**: `154b4fbe-92aa-4512-a0bb-483a18ea4fc6`
- **Eval Dataset**: `ec8bc508-35ac-40f3-a33b-3ceb26d5ef4a` (6 test cases)
- **Eval Suite**: `22214c0c-b053-43b9-bcee-b6022c878ee7`

### Creation Scripts
- `scripts/create-otc-agents.mjs` — Full Phase 1-6 creation (skills, agents, runbooks, policies, evals) for target URL
- `scripts/create-otc-evals-v2.mjs` — Phase 6 only (golden datasets + test cases + eval suites)
- `scripts/generate-prod-curl.mjs <PROD_URL> [TOKEN]` — Generates `scripts/prod-migration.sh` for prod migration
- `scripts/otc-agents-created.json` — ID manifest from dev creation

### Important Dev/Prod Notes
- **NEVER use `db:push`** — drops embedding column; use raw SQL in `runStartupMigrations()` only
- **Dev org**: `0c9bcf16-cdd9-45e2-87f6-6a839a7f7056`
- **Prod org**: `cf5754b1-ee80-4b51-8bf6-7be263c97527`
- **OTC-AGT-005 prod IDs**: `scripts/otc-agt-005-prod-ids.json`
- **Prod URL**: `https://agent-lifecycle-management-platform.replit.app`

### Export Frameworks (agent-export.tsx)
Generic (ReAct Agent Loop), LangGraph, CrewAI, AutoGen, Semantic Kernel, Azure AI Foundry, OpenAI Assistants API, AWS Bedrock, Vertex AI, n8n, Databricks.
Python-only frameworks (foundry, autogen, semantic-kernel) auto-switch language to Python via `useEffect`.
---

## Advantive SCN-1.1 — Packaging Scheduling Demo

**Demo**: Predictive Production Scheduling & Capacity Optimization (Packaging Manufacturing vertical)
**Client**: Advantive | **Plant**: Westfield Packaging (corrugated)
**Route**: `/demo/pkg-sched` | **Demo Center card**: teal `#00838F`, 8 min, 3 screens

### Architecture
| File | Purpose |
|---|---|
| `server/pkg-sched-shared-defs.ts` | Canonical defs: 4 agents, 12 skills, 3 KBs, 6 policies, 15 ontology concepts, 4 MCP server defs |
| `server/pkg-sched-live-run.ts` | SSE handler + `ensurePackagingSchedAgents()` (lazy init on first request) |
| `server/mock-mcp/pkg-kiwiplan-esp.ts` | Mock Kiwiplan ESP — order queue, RUSH orders, delivery risk, substrate validation, shift context |
| `server/mock-mcp/pkg-kiwiplan-machine.ts` | Mock Kiwiplan Machine — machine availability, roll stock, changeover matrix, OEE estimation |
| `server/mock-mcp/pkg-schedule-optimizer.ts` | Mock Schedule Optimizer — constraint solver (3 alternatives), Pareto ranking, evaluation |
| `server/mock-mcp/pkg-schedule-proposal.ts` | Mock Proposal/Approval — Gantt format, KPI projections, approval queue, Kiwiplan commit |
| `client/src/pages/demo/pkg-sched-constants.ts` | Frontend hook, state types, constants |
| `client/src/pages/demo/pkg-sched-s1-orders.tsx` | Screen 1: Order intelligence + capacity map |
| `client/src/pages/demo/pkg-sched-s2-optimize.tsx` | Screen 2: 3 alternatives + Pareto ranking |
| `client/src/pages/demo/pkg-sched-s3-proposal.tsx` | Screen 3: Gantt + KPI projections + approval + Kiwiplan commit |
| `client/src/pages/demo/pkg-sched-demo.tsx` | Main wrapper with SSE log panel |
| `scripts/migrate-pkg-sched-to-prod.ts` | Idempotent production migration (6 steps) |

### SSE Endpoints
- `GET /demo-api/pkg-sched/live-run` — SSE stream (4-agent pipeline, real LLM calls)
- `GET /demo-api/pkg-sched/agent-runs` — Per-agent run history
- `POST /demo-api/pkg-sched/reset` — Reset pipeline state

### Mock MCP Base Paths
- `/api/mock/pkg-kiwiplan-esp` — Order intel & shift context
- `/api/mock/pkg-kiwiplan-machine` — Machine & inventory data
- `/api/mock/pkg-schedule-optimizer` — Schedule optimization
- `/api/mock/pkg-schedule-proposal` — Proposal, approval & Kiwiplan commit

### Agents (4)
| Code | Name | Role |
|---|---|---|
| PKG-001 | Production Order Intelligence Agent | Analyses 47-order queue, RUSH risk, substrate validation |
| PKG-002 | Capacity & Constraint Mapping Agent | Maps 8-machine capacity, roll stock, changeover matrix |
| PKG-003 | Schedule Optimization Agent | Generates 3 alternatives (ALT-A wins: OEE +11.2%, OTIF +4 orders) |
| PKG-004 | Schedule Proposal & Approval Agent | Formats Gantt, publishes for approval, commits to Kiwiplan |

### Key Result
Alternative A wins: OEE 71→82.2% (+11.2pp), OTIF +4 orders, changeovers -3, all 3 RUSH orders on time.
Kiwiplan Schedule ID: `KWP-SCHED-2026-0415-D`

### Important Notes
- **Lazy initialization**: `ensurePackagingSchedAgents()` called on first SSE request (not at startup), to avoid race with `setDefaultOrgId`.
- **Zero simulation mandate**: Real OpenAI `gpt-4.1` calls only. No fallbacks, no fake delays.
- **Model**: `openai/gpt-4.1`, `autonomyMode: "autonomous"`, `maxToolIterations: 6`

### OTC Agent Fix Script
- `scripts/fix-otc-agents-complete.mjs` — Comprehensive PATCH for both OTC agents to populate all missing fields: blueprintJson (12-node workflow), toolsConfig (MCP servers + allowed tools), ontologyTags (6 domain concepts), policyBindings (6 policies linked), evalBindings (2 eval suites with schedule), memoryRagConfig, permissionsConfig, memoryGovernanceRules (3 rules), maturityScore, costPerRun, rollbackPlan. Parameterized: `node scripts/fix-otc-agents-complete.mjs [BASE_URL]`. Run without args for dev, supply prod URL for production.
- `scripts/fix-otc-agent-tasks.mjs` — Patches `runtimeConfig.prompt` for both OTC agents to populate the "Agent Task" section in the UI. Uses labeled sections (Role/Goal/Workflow Steps/Available Tools/KPIs/Expected Impact/Compliance/Constraints/Error Handling/Schedule). Parameterized for any env.

---

## Business Mode (outcome_owner role)

Multi-tenant UX layer targeted at business stakeholders with the `outcome_owner` role.

### Architecture
- **Role detection**: `isBusinessMode = role === "outcome_owner"` from `useRole()` in `client/src/components/role-provider.tsx`
- **Sidebar**: `BusinessModeSidebar` (4 items: Home `/dashboard`, Outcomes `/outcomes`, My Actions `/actions`, Settings `/business-settings`)
- **Dashboard home**: `BusinessCommandCenter` (`/dashboard`) replaces `Overview` for business mode users
- **Vocabulary**: Agent → Digital Worker, KPI → Goal throughout business mode views

### Key Files
| File | Purpose |
|---|---|
| `client/src/pages/business-command-center.tsx` | Home dashboard with metric strip, initiative cards, action queue, prominent "Start a new outcome" CTA |
| `client/src/pages/outcomes.tsx` | Business mode: "Your AI Initiatives" header, 3-metric strip, business outcome cards with On Track/At Risk/Paused badges, progress bars |
| `client/src/pages/outcome-detail.tsx` | Business Summary section (status, KPI progress bars, narrative, ROI), Advanced Details accordion collapses technical tabs by default |
| `client/src/pages/my-actions.tsx` | Unified Action Inbox — approval queue, canary alerts, anomalies; `data-testid="page-my-actions"` |
| `server/routes/my-actions.ts` | Aggregates approval requests, canary deployments, observability anomalies; `POST /api/my-actions/:id/decide` |

### Progressive Disclosure Rules
- Technical buttons (Recompute, Export Audit) hidden via `{!isBusinessMode && ...}` guards in outcome-detail.tsx
- Outcome detail tabs hidden by default in business mode; toggled via "Advanced Details" accordion (`data-testid="button-toggle-advanced-details"`)
- Business Summary section always visible at the top of outcome-detail for business mode users
