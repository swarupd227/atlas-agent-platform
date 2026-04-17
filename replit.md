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

### External Dependencies
- **OpenAI**: Primary LLM provider for agent runtime, evaluations, AI enhancements, and embeddings.
- **Anthropic**: Secondary LLM provider for Claude models with tool calling.
- **PostgreSQL**: Primary database for data persistence.
- **Express.js**: Backend web application framework.
- **React**: Frontend JavaScript library.
- **Vite**: Frontend build tool.
- **Tailwind CSS**: Utility-first CSS framework.
- **shadcn/ui**: UI component library.
- **wouter**: Client-side routing library.
- **Drizzle ORM**: Object-Relational Mapper for PostgreSQL.