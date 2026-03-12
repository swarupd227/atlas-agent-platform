# Nous Agent Orchestrator

## Overview
The Nous Agent Orchestrator is an AI agent lifecycle management platform designed for autonomous execution and expert validation. Its primary goal is to integrate compliance frameworks, policies, and industry-specific ontologies into AI agent behavior. The platform offers tools for agent creation, deployment, monitoring, and governance, aiming to automate and optimize the AI agent lifecycle across diverse sectors like Healthcare, Financial Services, Manufacturing, Insurance, Retail, and Technology/SaaS. It empowers AI agents to reason within specific industry contexts, thereby driving business value and ensuring efficient AI operations.

## User Preferences
I prefer that you ask me before making any major changes to the codebase. When suggesting code, please provide clear explanations for the choices made. I value an iterative development approach, where we can discuss and refine solutions progressively.

## System Architecture
The Nous Agent Orchestrator employs a modern web stack with a React, Vite, Tailwind CSS, shadcn/ui, and wouter frontend, and an Express.js backend for its REST API. Data persistence is handled by PostgreSQL with Drizzle ORM.

**UI/UX Design Principles**:
- Outcome-first navigation focused on KPI delivery.
- Evidence-by-default for approvals and blast radius analysis.
- Autonomy with integrated guardrails via policy checks.
- Time travel functionality for agent timelines and audit events.

**Core Features**:
- **Agent Lifecycle Management**: Tools for agent creation, deployment, monitoring, and governance, including a Blueprint Studio for auditable agent blueprints and an Industry-Governed Deployment Pipeline with auto-rollback and policy-as-code.
- **Real Agent Runtime**: Deployed agents execute blueprints as background workers, resolving API calls through registered integrations, and tracking execution with compliance checks.
- **Validation and Deployment Safety**: Features Shadow Replay Studio for zero-risk deployment validation and a Canary Deployment Console for graduated rollouts with industry-specific safety controls.
- **Governance & Compliance**: A Certified Agent Compliance Layer provides policy management, enforcement, and immutable audit trails, supported by Ontology Structural Enforcement and Regulatory Change Propagation.
- **Optimization & Healing**: Autonomous optimization, self-healing mechanisms, and AI-proposed changes.
- **Knowledge Management**: Utilizes vector-embedded document collections for RAG grounding, including web crawl ingestion for knowledge bases and features for knowledge staleness tracking and usage analytics. Structured data import supports both pasting JSON and uploading `.json` files; uploaded `.json` files via the document upload flow are auto-detected and processed as structured data.
- **Conversational AI**: Outcome Builder for defining goals and generating AI agent development plans.
- **Multi-Agent Orchestration**: Supports team-based multi-agent orchestration, an Agent Skills Library, and a Context Engineering Studio for managing agent context.
- **API Gateway**: Exposes deployed agents as REST API endpoints with API key management and tracing.
- **Autonomy Engine & Oversight**: Provides dynamic human oversight with a risk dimension matrix and expert intervention thresholds, supported by an Adaptive Autonomy Calibration Engine.
- **Outcome Traceability & KPI Binding**: Links agent creation to outcome contracts, inheriting specifications like risk tier, KPI targets, and compliance guardrails, with Bidirectional KPI Binding and Outcome-Driven Deployment Guardrails.
- **Industry Contextualization**: Auto-applies industry presets in agent wizards and evaluates industry compliance readiness.
- **Event-Driven Trigger System**: Configurable triggers (`webhook`, `schedule`, `agent_completion`, `mcp_resource_change`) for automating agent runs.
- **Developer Experience**: A Developer Portal with Quick Start guides, Authentication docs, an interactive API Reference (from OpenAPI spec), and SDKs (Python, TypeScript).

**Technical Implementations**:
- **Immutable Audit Log**: Hash-chained for integrity verification.
- **Episodic Memory Persistence**: Stores execution history and loads recent memories into runtime context.
- **Blueprint-to-Runtime Resolution**: Validates blueprint nodes, extracts workflow steps, and injects a `BLUEPRINT WORKFLOW` section into the system prompt.
- **Outcome-Aware Eval Scoring**: KPI-aligned evaluation suites for scoring cases against thresholds.
- **Production Feedback Loop**: Imports rejected outcome events as ground-truth evaluation test cases.
- **Memory Architecture Manager & RAG Pipeline Manager**: Defines agent memory management and configures knowledge retrieval with industry-specific settings.
- **Ontology Concept Versioning**: Supports versioning and history tracking for ontology concepts.
- **Ontology-Encoded Data Sensitivity Classifications**: Defines data types and redaction requirements for dynamic payload redaction.
- **Root Cause Classification Engine**: Classifies agent drift by correlating evidence across various data points.
- **Shadow Replay Validation Gate**: Links shadow replay jobs to healing pipelines to validate remediation.
- **Context Engineering Auto-Adjustment**: Analyzes failure patterns to recommend and apply context priority and token allocation changes.
- **Cost Attribution Chain & Margin Analysis Dashboard**: Full cost-to-serve analysis per agent/outcome and revenue vs. cost-to-serve dashboard.
- **Acceptance-Based Ground Truth Flywheel**: Closed-loop system improving agent quality via billing acceptance/rejection events.
- **Agent Config Versioning & GitOps**: Full lifecycle versioning and Git-based config management.
- **End-to-End Provenance Graph**: Tamper-proof execution environment reconstruction for historical agent decisions.
- **Ontology Design-Time Validation Layer**: Integrates ontology validation across KB concepts, Eval I/O schema, MCP tool alignment, and prompt vocabulary.
- **Ontology Relationship Reconciliation**: AI Enhance now constrains relationship suggestions to existing ontology concepts (with fuzzy matching fallback) and marks each suggestion as "Matched" or "Not in ontology". The apply flow resolves targetIds to actual concept IDs. A "Reconcile" button in the ontology sidebar scans for orphaned relationships and offers bulk "Remove Orphaned" or "Create Missing Concepts" actions via `POST /api/ontology/reconcile-relationships`.
- **Eval-Driven Operational Intelligence Fixes**: Server-side eval gates for deployment promotion and direct eval failure to KB gap analysis.
- **Context Window Economics Engine**: ROI optimization engine for token consumption, outcome quality, and cost.
- **MCP Governance & Semantic Interoperability Layer**: Governed, ontology-validated bridge between AI agents and enterprise MCP tool ecosystems.
- **RAG Pipeline Auto-Tuning**: Automated analysis of retrieval quality metrics for optimal KB configuration.
- **Proactive Design-Time Governance Enforcement**: Policy gates for agent creation, sensitivity validation for KB sources, and blueprint policy compatibility.
- **Live Compliance Posture Dashboard**: Real-time per-framework control coverage with agent-level mapping.
- **AI Enhance for Test Case Drafts**: AI assistance for generating enhanced test case components.
- **Template-to-Skill Binding**: Golden Templates now define `requiredSkills[]` and `optionalSkills[]` with `executionOrder`. Template detail page shows/edits both groups with ordering. Agent Wizard auto-populates skills from template: required skills are locked (cannot remove), optional skills have toggleable checkboxes. Skills are persisted into `runtimeConfig.matchedSkills` on agent creation. Save-as-Template populates `requiredSkills` from agent runtime. AI Enhance generates both required and optional skills. Backward compatible with existing flat `preloadedSkills`.
- **Table-Aware Document Chunking**: Knowledge base ingestion now preserves tabular data structure from Word documents (.docx) and HTML web crawls. Tables are converted to Markdown format (pipe-delimited rows with headers) instead of being flattened to text. The chunker is table-aware: tables become their own chunks with headers preserved, and large tables are split into sub-chunks that each retain the header row.
- **Eval Dataset Transformation**: Renamed "Golden Dataset" to "Eval Dataset" across UI. Added structured Data Records (JSON input/output pairs with categories, metadata, tags) alongside existing test cases via `golden_data_records` table. AI Generate Data Records endpoint generates realistic evaluation data per category. Performance Benchmarks (latency, throughput, accuracy, detection targets) stored on datasets with AI-suggested benchmarks. Detail page now has 3 tabs: Test Cases, Data Records, Benchmarks.
- **Security Mode**: Feature-flagged JWT authentication layer (`SECURITY_MODE=demo` or `SECURITY_MODE=production`).
- **LLM Provider Abstraction Layer**: Multi-provider LLM support (OpenAI, Anthropic, with extension points for others) for uniform `complete()`, `completeWithTools()`, and `embed()` interfaces, including per-agent provider selection and management UI.
- **SSE Streaming for Agent Runtime**: Real-time progress streaming of `RuntimeProgressEvent` callbacks for agent execution via Server-Sent Events (SSE).
- **Agentic Chat Widget**: The embeddable chat widget (`client/public/widget.js`) features SSE streaming via `POST /api/widget/:token/message-stream`, real-time status indicators (thinking/tool use/compliance), markdown rendering (bold, italic, lists, code blocks), AI-generated suggested action chips after each response, configurable welcome greeting with starter prompt chips, sessionStorage conversation persistence, and per-token rate limiting (10 req/min). Embed attributes: `data-greeting`, `data-starters` (comma-separated). The non-streaming endpoint (`/api/widget/:token/message`) remains for backward compatibility.
- **Configurable Tool Iterations**: Per-agent `maxToolIterations` setting (default 5, range 1-20) configurable in Agent Wizard.
- **Deployment Activation Flow**: Pending/inactive deployments can be activated directly from the release detail page. The `start-runtime` endpoint transitions deployment status from `pending`/`inactive` to `deployed` (reconciling stale status even if runtime is already active). UI shows "Activate Deployment" for pending and "Reactivate Deployment" for inactive deployments.
- **Product Intelligence in Code Generation**: The Export / Generate Code feature (`POST /api/agents/:id/export-code`) now incorporates all Product Intelligence data: `maxIterations` defaults to the agent's `maxToolIterations`; matched skills included in `agent.yaml` and manifest; KB retrieval config (`knowledge.ts/py`) generated when agent has linked knowledge bases; outcome contract & KPI targets exported as `outcome.json` and `outcome.ts/py` with `checkKpi` helper; policy module is data-driven when agent has policy bindings (loads from `policies.json`); industry, autonomyMode, riskTier, ontologyTags, permissions all included in `agent.yaml` and manifest; context/memory profiles exported when present.

- **BlackRock Synthetic Worker Demo**: Self-contained demo environment at `/demo/blackrock` showcasing autonomous agent orchestration across ServiceNow, RadiantOne, SailPoint, and Brainwave. In-memory state store (`server/demo-store.ts`), REST API (`server/demo-routes.ts` mounted at `/demo-api`), and auto-seeded MCP server ("BlackRock Synthetic Worker MCP") with 6 tools. Demo UI includes pipeline banner, poll countdown, live activity feed, 4 mock system screens, setup guide, and reset button. All demo code is isolated — no changes to routes.ts, agent-runtime.ts, kb-routes.ts, storage.ts, or schema.ts.

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
- **Web Audio API**: For background music playback in the product demo player.