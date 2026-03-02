# Nous Agent Orchestrator

## Overview
Nous Agent Orchestrator is an AI agent lifecycle management platform for autonomous execution and expert validation. It integrates compliance frameworks, policies, and industry-specific ontologies into AI agent behavior. The platform provides tools for agent creation, deployment, monitoring, and governance, aiming to automate and optimize the AI agent lifecycle across various verticals including Healthcare, Financial Services, Manufacturing, Insurance, Retail, and Technology/SaaS. Its core purpose is to enable AI agents to reason within specific industry contexts, driving business value and efficient AI operations.

## User Preferences
I prefer that you ask me before making any major changes to the codebase. When suggesting code, please provide clear explanations for the choices made. I value an iterative development approach, where we can discuss and refine solutions progressively.

## System Architecture
The Nous Agent Orchestrator utilizes a modern web stack with React, Vite, Tailwind CSS, shadcn/ui, and wouter for the frontend; Express.js for the backend REST API; and PostgreSQL with Drizzle ORM for database management.

**UI/UX Design Principles**:
- Outcome-first navigation for KPI delivery.
- Evidence-by-default for approvals and blast radius analysis.
- Autonomy with guardrails through policy checks.
- Time travel for agent timelines and audit events.

**Core Features**:
- **Agent Lifecycle Management**: Tools for creation, deployment, monitoring, and governance.
- **Blueprint Studio**: Visual editor for auditable agent blueprints with versioning and compliance annotations.
- **Industry-Governed Deployment Pipeline**: Features a Release Orchestrator with industry-specific stages, auto-rollback, and regulatory policy-as-code enforcement.
- **Real Agent Runtime**: Deployed agents execute blueprints as background workers, resolving API calls via registered integrations, and tracking execution with compliance checks.
- **Shadow Replay Studio**: Enables zero-risk agent deployment via production trace replay for validation.
- **Canary Deployment Console**: Manages graduated rollouts with industry-specific safety controls.
- **Governance**: Certified Agent Compliance Layer with policy management, enforcement, and immutable audit trails.
- **Optimization & Healing**: Autonomous optimization, self-healing, and AI-proposed changes.
- **Knowledge Base System**: Vector-embedded document collections for RAG grounding.
- **Outcome Builder**: Conversational AI for defining goals and generating AI agent development plans.
- **Team-Based Multi-Agent Orchestration**: Supports management of Team Agents with worker agents and blueprints.
- **Agent Skills Library**: A catalog of composable, versioned skill units with industry-organized browsing.
- **Context Engineering Studio**: Manages how agents acquire and utilize context with inventory, priority matrix, and budget visualizer.
- **Multi-Agent Pipeline Orchestrator**: Visual workflow editor for designing and executing multi-agent pipelines.
- **Agent API Gateway**: Exposes deployed agents as REST API endpoints with API key management and tracing.
- **Autonomy Engine & Oversight Console**: Dynamic human oversight with risk dimension matrix and expert intervention thresholds.
- **Outcome-to-Agent Traceability**: Links agent creation to outcome contracts, inheriting structured specifications like risk tier, KPI targets, and compliance guardrails.
- **Cross-Industry Workspace**: Provides access to an Ontology Explorer for building custom ontologies.
- **Bidirectional KPI Binding**: Automatically triggers KPI recomputation and audit events upon agent configuration changes.
- **Outcome-Driven Deployment Guardrails**: Analyzes outcome KPI SLA thresholds to recommend and enforce deployment strategies.
- **Kill-Chain Alerts**: Correlates agent drift signals with outcome KPI SLA thresholds to generate proactive alerts.
- **Industry Contextualization**: Auto-applies industry presets in agent wizards and evaluates industry compliance readiness.
- **Ontology Structural Enforcement**: Ontology concepts function as structural constraints across prompt vocabulary, post-execution compliance checks, and evaluation.
- **Outcome Contract Propagation Engine**: Outcomes generate a typed `constraintGraph` decomposing into various constraints with downstream propagation targets, enabling KPI-driven evaluation suite auto-generation, pre-save constraint validation, and SLA renegotiation flagging.

**Technical Implementations**:
- **Immutable Audit Log**: Hash-chained for integrity verification.
- **Episodic Memory Persistence**: Stores execution history, summarizing runs and loading recent memories into runtime context.
- **Blueprint-to-Runtime Resolution**: Validates blueprint nodes against available tools, extracts workflow steps, and injects a `BLUEPRINT WORKFLOW` section into the runtime system prompt.
- **Outcome-Aware Eval Scoring**: KPI-aligned eval suites load associated KPI definitions, scoring cases against thresholds, and aggregating results for outcome alignment.
- **Production Feedback Loop**: Imports rejected outcome events and resolved billing disputes as ground-truth eval test cases.
- **Memory Architecture Manager**: Defines agent memory management with industry-specific retention.
- **RAG Pipeline Manager**: Configures how agents retrieve industry-specific knowledge.
- **Ontology Concept Versioning**: Supports versioning and history tracking for ontology concepts.
- **Regulatory Change Propagation**: Updating an ontology concept triggers revalidation flags and audit events for affected agents.
- **Ontology-Encoded Data Sensitivity Classifications**: Defines data types and redaction requirements, injected into runtime system prompts and used for dynamic payload redaction.
- **Root Cause Classification Engine**: Classifies agent drift into structured categories by correlating evidence across eval history, KB freshness/coverage, ontology revalidation, MCP tool schema fingerprints, context profiles, and episodic memory state.
- **Shadow Replay Validation Gate**: Creates shadow replay jobs linked to healing pipelines to validate remediation, blocking deployment if replay fails.
- **Context Engineering Auto-Adjustment**: Analyzes failure patterns to recommend and apply context priority and token allocation changes.
- **Cost Attribution Chain**: Full cost-to-serve analysis aggregating LLM token costs + MCP tool call costs + infrastructure overhead per agent, per outcome.
- **Margin Analysis Dashboard**: Revenue vs cost-to-serve per outcome with monthly trend analysis.
- **Acceptance-Based Ground Truth Flywheel**: Closed-loop system where billing acceptance/rejection events continuously improve agent quality via automatic synchronization of eval feedback.
- **Agent Config Versioning & GitOps**: Full lifecycle versioning and Git-based config management, including context/memory profile versioning, unified agent manifest export/import, config rollback, and Git push/pull integration with CI/CD webhook pipeline for automated deployments.
- **Adaptive Autonomy Calibration Engine (IP #5)**: Self-adjusting autonomy system that learns optimal human-machine decision boundaries, tracking autonomous decision outcomes, computing quality profiles, and generating boundary adjustment proposals.
- **End-to-End Provenance Graph (IP #6)**: Tamper-proof execution environment reconstruction for any historical agent decision, capturing blueprint version, KB retrieval records, tool fingerprints, active policy snapshot, context profile, memory IDs, industry context, and used ontology concepts.
- **Ontology Design-Time Validation Layer**: Integrates ontology validation across KB concept coverage, Eval I/O schema, MCP tool blueprint alignment, prompt vocabulary pre-validation, and skill ontology tag linking.
- **Eval-Driven Operational Intelligence Fixes**: Implements server-side eval gates for deployment promotion and direct eval failure to KB gap analysis.
- **Context Window Economics Engine (IP #8)**: Per-context-source ROI optimization engine connecting token consumption to outcome quality and cost, including ROI computation, industry benchmarks, context cliff detection, and source attribution.
- **MCP Governance & Semantic Interoperability Layer (IP #8-MCP)**: Governed ontology-validated bridge between AI agents and enterprise MCP tool ecosystems. Features: (1) Auto-triggered ontology parameter matching on MCP server initialization via shared `runParameterMatching()` helper. (2) Continuous assurance loop wiring drift detection → auto re-matching → alignment re-scoring → blueprint impact analysis with `governance.alignment_regression` audit events. (3) Enforced ontology alignment at deployment/runtime — tools below 50% alignment block prod deployments and runtime starts unless explicitly bypassed with audit logging. (4) Tool Behavior Fingerprinting with statistical profiling computing latency baselines (mean/P95/P99), error rates from trace spans, and detecting behavioral drift via threshold rules (>2x=warning, >3x=drifted) independent of schema drift.
- **Knowledge Staleness Tracking**: Automated time-based freshness detection for KB sources. Sources have `freshnessStatus` (fresh/stale/critical/unknown) computed from `processedAt` vs configurable `stalenessThresholdDays` (default 90, per-KB and per-source overridable). Staleness check triggers agent `requiresRevalidation` flags, audit events (`knowledge.staleness_detected`), and deduplicated incidents for critical staleness. Reprocessing a source auto-restores freshness. Both single-KB and bulk staleness check endpoints available. Frontend shows freshness badges per source, staleness check button, alert banners, and configurable threshold.
- **KB Usage Analytics & Dead Knowledge Detection**: Per-source and per-chunk retrieval tracking via `retrievalCount` and `lastRetrievedAt` fields on `knowledgeSources` and `knowledgeChunks`. Counts increment in real-time during RAG retrieval in `executePromptWithMcp`. Usage analytics endpoint (`GET /api/knowledge-bases/:id/usage-analytics`) returns per-source retrieval data, identifies "dead knowledge" (processed 30+ days, never retrieved), and provides summary stats. Frontend "Usage Analytics" tab shows per-source retrieval bars, dead knowledge warnings, and summary metrics.
- **RAG Pipeline Auto-Tuning**: Automated analysis of retrieval quality metrics to recommend optimal KB configuration. `POST /api/knowledge-bases/:id/auto-tune` analyzes recent run traces for avg similarity scores, retrieval utilization (% chunks >0.7 similarity), and context overflow signals, generating parameter recommendations for chunkSize, chunkOverlap, and retrievalTopK with confidence levels. `POST /api/knowledge-bases/:id/apply-tuning` persists changes with `knowledge.pipeline_auto_tuned` audit events. Wired into healing pipeline: root cause classification for `knowledge_gap`/`context_window_overflow` auto-generates RAG tuning recommendations stored in pipeline remediation. Frontend "Pipeline Tuning" section in KB Configuration tab shows analysis metrics and per-recommendation apply buttons.
- **Proactive Design-Time Governance Enforcement**:
  - **Agent Creation Policy Gate**: `POST /api/governance/design-time-check` validates required policy prerequisites per industry (e.g., PCI-DSS for financial_services, HIPAA for healthcare) using `INDUSTRY_POLICY_REQUIREMENTS` mapping. Agent Wizard Step 7 (Review) shows "Governance Readiness" panel; missing policies soft-block creation with override acknowledgment.
  - **KB Source Sensitivity Validation**: Upload-time pre-scan detects PHI/PCI/PII/FINANCIAL_RESTRICTED content via `SENSITIVITY_TERMS` matching, checks linked agents' bound `data_handling` policies, and returns `sensitivityWarnings` with `knowledge.sensitivity_warning` audit events. Frontend shows warning dialog on upload.
  - **MCP Tool-to-Policy Compatibility**: `POST /api/agents/:id/mcp-servers` checks high-risk/write tools against agent policy bindings before linking. Returns `policyWarnings` requiring acknowledgment. Logs `agent.mcp_policy_mismatch` audit events.
  - **Blueprint Policy Compatibility**: Blueprint compilation checks `tool_call` nodes for sensitivity data classes against bound `data_handling` policies, and `llm_call` nodes for output filtering against bound `output_control` policies. `policyCompatibility` warnings gate signing.
- **Live Compliance Posture Dashboard**: `GET /api/governance/compliance-posture` provides per-framework control coverage with agent-level mapping. Iterates active frameworks, matches controls to active policies, traces agent bindings per control. Returns framework scores, gaps (with severity), and agent coverage. Frontend "Compliance Posture" tab in Governance shows live posture gauges, control coverage table, framework health cards, and gap highlighting. Auto-refreshes on policy mutations and via polling.

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
- **pgvector**: Used for similarity search within the Knowledge Base System.
- **Web Audio API**: Used for background music in the product demo player.