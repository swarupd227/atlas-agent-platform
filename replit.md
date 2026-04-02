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
- **Full-Screen Export Page**: Dedicated full-screen page for agent code export with configure, preview, and deliver steps. Includes file search palette, per-file regeneration, diff view, dynamic deployment checklist, export presets, and CI/CD manifest generation.
- **Table-Aware Document Chunking**: Knowledge base ingestion preserves tabular data structure from Word documents and HTML, converting tables to Markdown.
- **Eval Dataset Transformation**: Supports structured Data Records, AI-generated evaluation data, and performance benchmarks.
- **LLM Provider Abstraction Layer**: Multi-provider LLM support (OpenAI, Anthropic) for uniform interfaces and per-agent provider selection.
- **SSE Streaming for Agent Runtime**: Real-time progress streaming of agent execution via Server-Sent Events.
- **Agentic Chat Widget**: Embeddable chat widget with SSE streaming, real-time status indicators, markdown rendering, AI-generated suggested actions, and configurable greetings.
- **Multi-Tenancy**: Organization-level data isolation implemented across schema and storage, with `organization_id` added to core tables and filtering applied to storage methods.

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
| Billing & Collections Agent | OTC-AGT-006 | DEV ✅ | 96705f33-085c-48a2-a99c-a2ed2baf7dde |

### OTC-AGT-006 Dev IDs (from scripts/otc-agt-006-dev-ids.json)
- **Agent**: `96705f33-085c-48a2-a99c-a2ed2baf7dde`
- **KB**: `c32e2b16-16f5-457d-92b4-08ce9e2038e8` (6 sources)
- **Skills (6)**: Invoice Generation, Tax Calculation, Cash Application, Dunning Management, Dispute Investigation, AR Reporting
- **Runbooks (6)**: Invoice Gen Failure, Mass Payment Error, Tax Engine Down, Unmatched Payment, Dispute Backlog Surge, Month-End Close
- **Policies (6)**: ASC-606/IFRS-15, Sales Tax/VAT, E-Invoicing, SOX, PCI-DSS, AML
- **Golden Dataset**: `82674e38-e5c2-4669-a892-469d9b5fcf7a` (6 test cases)
- **Eval Suite**: `a98898c3-c1b6-420c-ba05-daf05bdb218f`
- **Outcome**: `cb0f6247-9bdf-4227-a979-c4807498ac6f`

### Important Dev/Prod Notes
- **NEVER use `db:push`** — drops embedding column; use raw SQL in `runStartupMigrations()` only
- **Dev org**: `0c9bcf16-cdd9-45e2-87f6-6a839a7f7056`
- **Prod org**: `cf5754b1-ee80-4b51-8bf6-7be263c97527`
- **OTC-AGT-005 prod IDs**: `scripts/otc-agt-005-prod-ids.json`
- **Prod URL**: `https://agent-lifecycle-management-platform.replit.app`

### Export Frameworks (agent-export.tsx)
Generic (ReAct Agent Loop), LangGraph, CrewAI, AutoGen, Semantic Kernel, Azure AI Foundry, OpenAI Assistants API, AWS Bedrock, Vertex AI, n8n, Databricks.
Python-only frameworks (foundry, autogen, semantic-kernel) auto-switch language to Python via `useEffect`.