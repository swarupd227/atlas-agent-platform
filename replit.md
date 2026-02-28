# Nous Agent Orchestrator

## Overview
Nous Agent Orchestrator is an AI agent lifecycle management platform designed for 80% autonomous execution and 20% expert validation. Its primary goal is to embed compliance frameworks, policies, and industry-specific ontologies directly into AI agent behavior. The platform offers tools for agent creation, deployment, monitoring, and governance, aiming to automate and optimize the AI agent lifecycle across six key industry verticals: Healthcare, Financial Services (including Credit Rating), Manufacturing, Insurance, Retail, and Technology/SaaS. It enables AI agents to reason within specific industry contexts, driving business value and efficient AI operations.

## User Preferences
I prefer that you ask me before making any major changes to the codebase. When suggesting code, please provide clear explanations for the choices made. I value an iterative development approach, where we can discuss and refine solutions progressively.

## System Architecture
The Nous Agent Orchestrator utilizes a modern web stack: React, Vite, Tailwind CSS, shadcn/ui, and wouter for the frontend; Express.js for the backend REST API; and PostgreSQL with Drizzle ORM for database management.

**UI/UX Design Principles**:
- **Outcome-first navigation**: Prioritizes KPI delivery status.
- **Evidence-by-default**: For approvals, including configuration differences and blast radius analysis.
- **Autonomy with guardrails**: Policies are checked before actions.
- **Time travel**: For agent timelines, aggregating version changes and audit events.

**Core Features**:
- **Agent Lifecycle Management**: Covers creation, deployment, monitoring, and governance of agents.
- **Blueprint Studio**: A visual editor for creating, versioning, and compiling auditable agent blueprints, including static checks, approval flows, compliance annotations, and industry constraint enforcement through graph-based orchestration.
- **Industry-Governed Deployment Pipeline**: Features a Release Orchestrator with industry-specific mandatory pipeline stages, auto-rollback triggers, and deployment evidence packages, enforced by a regulatory policy-as-code engine.
- **Real Agent Runtime**: Deployed agents execute blueprints as background workers, resolving API calls via registered MCP Server integrations, and tracking execution history with real weather data, severity analysis, and compliance checks.
- **Shadow Replay Studio**: Enables zero-risk agent deployment via production trace replay, offering trace libraries, replay configuration, semantic diff viewing, and compliance checkpoints, including live agent testing with external APIs.
- **Canary Deployment Console**: Manages graduated rollouts with industry-specific safety controls, KPI comparison, and auto-promotion/rollback rules.
- **Governance**: Certified Agent Compliance Layer with policy management, enforcement, and immutable audit trails, including regulatory compliance tools.
- **Optimization & Healing**: Features autonomous optimization, self-healing, AI-proposed changes, experiment management, and closed-loop autonomous remediation with industry-aware diagnosis.
- **Knowledge Base System**: Vector-embedded document collections for RAG grounding, supporting various ingestion modes, OpenAI embeddings, and pgvector for similarity search. Agents can be linked to KBs for runtime context injection.
- **Outcome Builder**: Conversational AI for defining goals and drafting outcome contracts, with AI-generated agent development plans, platform intelligence-enriched plan generation using all platform resources, and structured output schema generation for worker agents.
- **Team-Based Multi-Agent Orchestration**: Supports the creation and management of Team Agents with worker agents, blueprints, and graph configurations.
- **Agent Skills Library**: A catalog of composable, versioned skill units with industry-organized browsing, search, and AI enhancement/generation capabilities, including real-time policy validation.
- **Context Engineering Studio**: Manages how agents acquire and utilize context, featuring context source inventory, priority matrix, and budget visualizer.
- **Multi-Agent Pipeline Orchestrator**: Visual workflow editor for designing and executing multi-agent pipelines with sequential agent stages, approval gates, parallel groups, and AI-simulated scenario execution. **Parallel Execution Support** — The runtime engine computes execution tiers from blueprint DAGs, running independent agents concurrently via `Promise.all` with structured context merging (`## OUTPUT FROM [Agent Name]`). Supports `fail_fast` and `best_effort` error strategies. Fork/join markers in traces. **Pipeline Record ID Continuity** — Structured records (processedRecords) from each worker are automatically enriched into downstream context as `## STRUCTURED RECORDS FROM [Agent Name]`, ensuring downstream agents reference the same record IDs for end-to-end traceability.
- **Agent API Gateway**: Exposes deployed agents as REST API endpoints for external invocation, with API key management, execution tracing, policy checks, and cost tracking.
- **Canary Deployment Console**: Graduated rollouts with industry-specific safety controls, KPI comparison (baseline vs. candidate), blast radius analysis, and auto-promotion/rollback rules.
- **Autonomy Engine & Oversight Console**: Dynamic human oversight with risk dimension matrix, autonomy spectrum, expert intervention thresholds, and override calendar.
- **Formatted Output Rendering**: Trace outputs and agent task prompts are rendered as structured, readable content (severity badges, key findings, recommended actions, structured record tables) instead of raw JSON blobs. Supports three formats: pure JSON, mixed text + markdown code blocks, and inline embedded JSON.
- **Outcome-to-Agent Traceability**: When creating an agent from an outcome contract (via "Add Agent Manually" or "Create Manually" buttons), the wizard inherits structured outcome specifications: risk tier, KPI targets, compliance guardrails (stop conditions, escalation triggers from SLA thresholds and approval gates), and evaluation thresholds derived from KPI SLA values. An outcome context banner displays the linked outcome and inherited requirements throughout the wizard, with a full "Outcome Requirements Inherited" summary card in the review step.
- **Cross-Industry Workspace**: The former "Custom" workspace is now labeled "Cross-Industry" for consistency with the `cross_industry` value used in templates, skills, and policies. Cross-Industry workspace users can access the Ontology Explorer to build their own ontology from scratch (manually or via AI generation), removing the previous dead-end block.
- **Bidirectional KPI Binding**: When an agent's configuration is changed via PATCH `/api/agents/:id` and the agent is bound to an outcome (has `outcomeId`), the system automatically: (1) creates a structured `agent.config_changed` audit event with changed fields, (2) triggers KPI recomputation via the shared `recomputeOutcomeKpis()` helper, (3) creates a `kpi.auto_reeval` audit event with KPI change details and breach status, (4) returns `reEvaluationTriggered` and `kpiReEvaluation` in the PATCH response. On the agent detail page, config save mutations show a toast with KPI re-evaluation results, and a KPI Impact card persists in the linked outcome section (sourced from audit events for reload persistence). On the outcome detail page's KPI Delivery tab, a "Recent Re-Evaluations" feed shows `agent.config_changed` and `kpi.auto_reeval` audit events with agent links, changed fields, KPI change badges, and timestamps.

**Technical Implementations**:
- **Adaptive Autonomy Engine**: Dynamic, context-aware human oversight with a risk dimension matrix, autonomy spectrum, and override calendar.
- **AI Endpoints**: Dedicated APIs for conversational design, template matching, outcome discovery, AI-generated test cases, skill generation, skill enhancement, and TTS narration.
- **Immutable Audit Log**: Hash-chained for integrity verification.
- **Tool Proxy Control Point**: Unified proxy for MCP tool calls and A2A delegations.
- **Ontology Explorer & Knowledge Graph Builder**: Industry knowledge graph browser with concept details, search, AI-enhanced descriptions, and AI-powered relationship suggestions and sub-domain ontology generation.
- **Memory Architecture Manager**: Defines agent memory management with industry-specific retention and governance.
- **RAG Pipeline Manager**: Configures how agents retrieve industry-specific knowledge at runtime.
- **MCP-Ontology Parameter Matching**: Cross-references MCP server tool parameters and resource names against ontology concepts, auto-linking and flagging mismatches.
- **Mock MCP Servers**: Built-in mock REST APIs simulating Marketo, Salesforce CRM, and Adobe Analytics for demonstration purposes, with deterministic financial services lead data.

## External Dependencies
- **OpenAI**: Used for TTS narration, AI skill generation/enhancement, conversational design, and other AI features.
- **PostgreSQL**: Primary database for the platform.
- **Express.js**: Backend framework for the REST API.
- **React**: Frontend library for building user interfaces.
- **Vite**: Frontend build tool for faster development.
- **Tailwind CSS**: Utility-first CSS framework for styling.
- **shadcn/ui**: UI component library.
- **wouter**: Routing library for the frontend.
- **Drizzle ORM**: Object-Relational Mapper for database interactions.
- **Web Audio API**: Used for background music in the product demo player.