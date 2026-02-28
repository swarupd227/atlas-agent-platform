# Nous Agent Orchestrator

## Overview
Nous Agent Orchestrator is an AI agent lifecycle management platform designed for autonomous execution and expert validation. It embeds compliance frameworks, policies, and industry-specific ontologies into AI agent behavior. The platform provides tools for agent creation, deployment, monitoring, and governance, aiming to automate and optimize the AI agent lifecycle across Healthcare, Financial Services, Manufacturing, Insurance, Retail, and Technology/SaaS verticals. Its purpose is to enable AI agents to reason within specific industry contexts, driving business value and efficient AI operations.

## User Preferences
I prefer that you ask me before making any major changes to the codebase. When suggesting code, please provide clear explanations for the choices made. I value an iterative development approach, where we can discuss and refine solutions progressively.

## System Architecture
The Nous Agent Orchestrator uses a modern web stack with React, Vite, Tailwind CSS, shadcn/ui, and wouter for the frontend; Express.js for the backend REST API; and PostgreSQL with Drizzle ORM for database management.

**UI/UX Design Principles**:
- Outcome-first navigation for KPI delivery.
- Evidence-by-default for approvals and blast radius analysis.
- Autonomy with guardrails through policy checks.
- Time travel for agent timelines and audit events.

**Core Features**:
- **Agent Lifecycle Management**: Comprehensive tools for agent creation, deployment, monitoring, and governance.
- **Blueprint Studio**: Visual editor for auditable agent blueprints, including versioning, static checks, approval flows, compliance annotations, and graph-based orchestration.
- **Industry-Governed Deployment Pipeline**: Features a Release Orchestrator with industry-specific stages, auto-rollback, and regulatory policy-as-code enforcement.
- **Real Agent Runtime**: Deployed agents execute blueprints as background workers, resolving API calls via registered integrations, and tracking execution with compliance checks.
- **Shadow Replay Studio**: Enables zero-risk agent deployment via production trace replay, offering trace libraries, replay configuration, and compliance checkpoints.
- **Canary Deployment Console**: Manages graduated rollouts with industry-specific safety controls, KPI comparison, and auto-promotion/rollback rules.
- **Governance**: Certified Agent Compliance Layer with policy management, enforcement, and immutable audit trails.
- **Optimization & Healing**: Autonomous optimization, self-healing, AI-proposed changes, and closed-loop autonomous remediation.
- **Knowledge Base System**: Vector-embedded document collections for RAG grounding, supporting various ingestion modes and pgvector for similarity search.
- **Outcome Builder**: Conversational AI for defining goals, drafting outcome contracts, and generating AI agent development plans with structured output schemas.
- **Team-Based Multi-Agent Orchestration**: Supports management of Team Agents with worker agents, blueprints, and graph configurations.
- **Agent Skills Library**: A catalog of composable, versioned skill units with industry-organized browsing and AI enhancement/generation capabilities.
- **Context Engineering Studio**: Manages how agents acquire and utilize context with inventory, priority matrix, and budget visualizer.
- **Multi-Agent Pipeline Orchestrator**: Visual workflow editor for designing and executing multi-agent pipelines with sequential stages, approval gates, parallel groups, and AI-simulated scenario execution. Supports parallel execution with `Promise.all` and structured context merging.
- **Agent API Gateway**: Exposes deployed agents as REST API endpoints with API key management, execution tracing, and cost tracking.
- **Autonomy Engine & Oversight Console**: Dynamic human oversight with risk dimension matrix, autonomy spectrum, and expert intervention thresholds.
- **Formatted Output Rendering**: Trace outputs and agent task prompts are rendered as structured, readable content with support for JSON, mixed text/markdown, and inline embedded JSON.
- **Outcome-to-Agent Traceability**: Links agent creation to outcome contracts, inheriting structured specifications like risk tier, KPI targets, and compliance guardrails.
- **Cross-Industry Workspace**: Provides access to an Ontology Explorer for building custom ontologies.
- **Bidirectional KPI Binding**: Automatically triggers KPI recomputation and audit events upon agent configuration changes.
- **Outcome-Driven Deployment Guardrails**: Analyzes outcome KPI SLA thresholds to recommend and enforce deployment strategies (e.g., mandatory canary deployments for high-SLA agents).
- **Kill-Chain Alerts**: Correlates agent drift signals with outcome KPI SLA thresholds to generate proactive alerts and recommended actions.
- **Industry Contextualization (Structural + Dynamic)**: Auto-applies industry presets in agent wizards, evaluates industry compliance readiness, and dynamically computes presets based on ontology concepts and outcome KPIs.
- **Ontology Structural Enforcement**: Ontology concepts function as structural constraints across prescriptive prompt vocabulary, post-execution compliance checks, KB ontology alignment, and evaluation studio scoring.
- **Outcome Contract Propagation Engine**: Outcomes generate a typed `constraintGraph` (jsonb on `outcome_contracts`) decomposing into performance, latency, compliance, and commercial constraints with downstream propagation targets. Constraint graph auto-computes on outcome create/update/KPI-change and is visualized in the Outcome Detail "Constraint Graph" tab. (1) **KPI-Driven Eval Suite Auto-Generation** — binding an agent to an outcome auto-creates a `kpi_aligned` eval suite with boundary test cases per KPI (below threshold, at threshold, above target); eval detail shows "KPI-Aligned" badge and info card. (2) **Pre-Save Constraint Validation** — `POST /api/agents/:id/validate-config` performs dry-run checks against bound outcome constraints (risk tier, autonomy, model, tools, status, compliance tags); agent detail shows confirmation dialog with severity badges before saving. (3) **Outcome SLA Renegotiation Downstream Flagging** — `PATCH /api/outcomes/:id` detects SLA-relevant field changes, validates bound agents, creates `outcome.sla_renegotiated` and `agent.outcome_sla_review_required` audit events; agent detail shows warning banner; outcome detail shows "Downstream Impact" section. (4) **Healing Pipeline SLA-Breach Priority** — `priority` field on `healing_pipelines` (critical/high/normal); kill-chain critical alerts auto-create `priority: "critical"` pipelines with `triggerSource: "outcome_sla_breach"`; healing operations UI sorts by priority with badges.

**Technical Implementations**:
- **Adaptive Autonomy Engine**: Dynamic, context-aware human oversight.
- **AI Endpoints**: Dedicated APIs for conversational design, template matching, outcome discovery, and AI-generated content.
- **Immutable Audit Log**: Hash-chained for integrity verification.
- **Tool Proxy Control Point**: Unified proxy for tool calls and A2A delegations.
- **Ontology Explorer & Knowledge Graph Builder**: Industry knowledge graph browser with AI-enhanced capabilities.
- **Memory Governance Enforcement**: Industry-specific memory retention policies (HIPAA, PCI-DSS, BSA/AML, GDPR, SOX, NAIC) are persisted on agent records as `memoryGovernanceRules` (jsonb), injected into runtime system prompts as `MEMORY GOVERNANCE CONSTRAINTS`, and enforced post-execution via `checkMemoryGovernanceViolations()` which scans output for PII/PHI/PCI pattern violations. Auto-creates linked `memory_profiles` with industry-appropriate tier configs and forgetting policies on agent creation. Memory compliance endpoint (`GET /api/agents/:id/memory-compliance`) scores governance adherence. Pre-deploy checks and deployment recommendations include memory governance validation.
- **Iterative Multi-Turn Tool Calling**: `executePromptWithMcp` supports up to 5 iterative tool-calling rounds. After each tool execution, the LLM can request additional tool calls based on results. Traces show `iterationsUsed` in analysis output.
- **Context Studio Profile Runtime Injection**: `buildRuntimeContext` loads matching `context_profiles` (by agentId or industry) and injects priority matrix, budget allocations, and context source instructions as a `CONTEXT ENGINEERING PROFILE` section in the system prompt.
- **Episodic Memory Persistence**: `agent_memories` table stores execution history. After each `executeAgentCycle`, an episodic memory is saved summarizing the run (tools used, results, success/failure). Recent memories (last 10) are loaded into `buildRuntimeContext` as an `EPISODIC MEMORY` section, giving agents awareness of previous runs. Retention respects memory governance rules.
- **Real Deployment Pipeline Stages**: `run-pipeline` endpoint performs actual verification per stage type: `auto_verification` checks eval suite results; `security_scan` validates MCP server config and compliance tags; `compliance_check` scores governance rules and policies; `staging_test` validates agent configuration. Critical stage failures halt the pipeline.
- **Blueprint-to-Runtime Resolution**: `resolveBlueprint()` in `startAgentRuntime` validates blueprint nodes against available MCP tools, extracts workflow steps/escalation triggers/compliance nodes, and injects a `BLUEPRINT WORKFLOW` section into the runtime system prompt. Invalid blueprints (referencing unavailable tools) prevent runtime start with descriptive errors.
- **Outcome-Aware Eval Scoring**: KPI-aligned eval suites load associated KPI definitions during run execution. Per-case `kpiScores` in `scorerOutputs` measure accuracy/latency/volume KPIs against thresholds. Run-level `outcomeAlignment` in `resultsJson` aggregates KPI pass rates with per-KPI summaries.
- **Production Feedback Loop**: `POST /api/outcomes/:id/sync-eval-feedback` imports rejected outcome events and resolved billing disputes as ground-truth eval test cases tagged `production_feedback`. UI "Sync Production Feedback" button on eval suite detail.
- **Industry-Specific Eval Frameworks**: Per-vertical scoring dimensions (healthcare: clinical accuracy, PHI handling; finance: regulatory compliance, calculation accuracy; insurance: claims accuracy, NAIC compliance; manufacturing: safety protocols; retail: sentiment preservation; tech: API accuracy). Auto-injected into eval prompts when agent has industry tag. `industryScores` in `scorerOutputs` with dimension breakdowns.
- **KPI Drift-Impact Correlation**: `POST /api/evals/:suiteId/drift-analysis` compares latest vs previous eval run, maps regressions to specific KPIs, estimates SLA breach risk. Auto-creates critical `improvement_recommendation` on SLA breach. Frontend "KPI Drift Impact Analysis" card with severity badges and recommended actions.
- **Memory Architecture Manager**: Defines agent memory management with industry-specific retention.
- **RAG Pipeline Manager**: Configures how agents retrieve industry-specific knowledge.
- **MCP-Ontology Parameter Matching**: Cross-references tool parameters against ontology concepts.
- **Mock MCP Servers**: Built-in mock REST APIs for demonstration purposes.

## External Dependencies
- **OpenAI**: Used for TTS narration, AI skill generation/enhancement, conversational design, and other AI features.
- **PostgreSQL**: Primary database for the platform.
- **Express.js**: Backend framework.
- **React**: Frontend library.
- **Vite**: Frontend build tool.
- **Tailwind CSS**: Utility-first CSS framework.
- **shadcn/ui**: UI component library.
- **wouter**: Routing library for the frontend.
- **Drizzle ORM**: Object-Relational Mapper.
- **Web Audio API**: Used for background music in the product demo player.