# Nous Agent Orchestrator

## Overview
Nous Agent Orchestrator is an AI agent lifecycle management platform designed for autonomous execution and expert validation. It integrates compliance frameworks, policies, and industry-specific ontologies into AI agent behavior. The platform provides tools for agent creation, deployment, monitoring, and governance, aiming to automate and optimize the AI agent lifecycle across various verticals including Healthcare, Financial Services, Manufacturing, Insurance, Retail, and Technology/SaaS. Its core purpose is to enable AI agents to reason within specific industry contexts, driving business value and efficient AI operations.

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
- **Blueprint Studio**: Visual editor for auditable agent blueprints, including versioning, static checks, approval flows, and compliance annotations.
- **Industry-Governed Deployment Pipeline**: Features a Release Orchestrator with industry-specific stages, auto-rollback, and regulatory policy-as-code enforcement.
- **Real Agent Runtime**: Deployed agents execute blueprints as background workers, resolving API calls via registered integrations, and tracking execution with compliance checks.
- **Shadow Replay Studio**: Enables zero-risk agent deployment via production trace replay for validation.
- **Canary Deployment Console**: Manages graduated rollouts with industry-specific safety controls and KPI comparison.
- **Governance**: Certified Agent Compliance Layer with policy management, enforcement, and immutable audit trails.
- **Optimization & Healing**: Autonomous optimization, self-healing, and AI-proposed changes.
- **Knowledge Base System**: Vector-embedded document collections for RAG grounding, supporting various ingestion modes.
- **Outcome Builder**: Conversational AI for defining goals, drafting outcome contracts, and generating AI agent development plans.
- **Team-Based Multi-Agent Orchestration**: Supports management of Team Agents with worker agents and blueprints.
- **Agent Skills Library**: A catalog of composable, versioned skill units with industry-organized browsing.
- **Context Engineering Studio**: Manages how agents acquire and utilize context with inventory, priority matrix, and budget visualizer.
- **Multi-Agent Pipeline Orchestrator**: Visual workflow editor for designing and executing multi-agent pipelines with sequential stages, approval gates, and parallel groups.
- **Agent API Gateway**: Exposes deployed agents as REST API endpoints with API key management and tracing.
- **Autonomy Engine & Oversight Console**: Dynamic human oversight with risk dimension matrix and expert intervention thresholds.
- **Formatted Output Rendering**: Trace outputs and agent task prompts are rendered as structured, readable content.
- **Outcome-to-Agent Traceability**: Links agent creation to outcome contracts, inheriting structured specifications like risk tier, KPI targets, and compliance guardrails.
- **Cross-Industry Workspace**: Provides access to an Ontology Explorer for building custom ontologies.
- **Bidirectional KPI Binding**: Automatically triggers KPI recomputation and audit events upon agent configuration changes.
- **Outcome-Driven Deployment Guardrails**: Analyzes outcome KPI SLA thresholds to recommend and enforce deployment strategies.
- **Kill-Chain Alerts**: Correlates agent drift signals with outcome KPI SLA thresholds to generate proactive alerts.
- **Industry Contextualization**: Auto-applies industry presets in agent wizards and evaluates industry compliance readiness.
- **Ontology Structural Enforcement**: Ontology concepts function as structural constraints across prompt vocabulary, post-execution compliance checks, and evaluation.
- **Outcome Contract Propagation Engine**: Outcomes generate a typed `constraintGraph` decomposing into various constraints with downstream propagation targets, enabling KPI-driven evaluation suite auto-generation, pre-save constraint validation, and SLA renegotiation flagging.

**Technical Implementations**:
- **Adaptive Autonomy Engine**: Dynamic, context-aware human oversight.
- **AI Endpoints**: Dedicated APIs for conversational design, template matching, and outcome discovery.
- **Immutable Audit Log**: Hash-chained for integrity verification.
- **Tool Proxy Control Point**: Unified proxy for tool calls and A2A delegations.
- **Ontology Explorer & Knowledge Graph Builder**: Industry knowledge graph browser with AI-enhanced capabilities.
- **Memory Governance Enforcement**: Industry-specific memory retention policies enforced via system prompts and post-execution checks, with auto-creation of memory profiles and compliance scoring.
- **Iterative Multi-Turn Tool Calling**: Supports up to 5 iterative tool-calling rounds within `executePromptWithMcp`.
- **Context Studio Profile Runtime Injection**: Loads matching context profiles and injects priority matrix, budget allocations, and context source instructions into the system prompt.
- **Episodic Memory Persistence**: `agent_memories` table stores execution history, summarizing runs and loading recent memories into runtime context.
- **Real Deployment Pipeline Stages**: `run-pipeline` endpoint performs verification for auto_verification, security_scan, compliance_check, and staging_test stages.
- **Blueprint-to-Runtime Resolution**: `resolveBlueprint()` validates blueprint nodes against available tools, extracts workflow steps, and injects a `BLUEPRINT WORKFLOW` section into the runtime system prompt.
- **Outcome-Aware Eval Scoring**: KPI-aligned eval suites load associated KPI definitions, scoring cases against thresholds, and aggregating results for outcome alignment.
- **Production Feedback Loop**: Imports rejected outcome events and resolved billing disputes as ground-truth eval test cases.
- **Industry-Specific Eval Frameworks**: Per-vertical scoring dimensions are auto-injected into eval prompts.
- **KPI Drift-Impact Correlation**: Compares latest vs previous eval runs, maps regressions to KPIs, and estimates SLA breach risk.
- **Memory Architecture Manager**: Defines agent memory management with industry-specific retention.
- **RAG Pipeline Manager**: Configures how agents retrieve industry-specific knowledge.
- **MCP-Ontology Parameter Matching**: Cross-references tool parameters against ontology concepts.
- **Mock MCP Servers**: Built-in mock REST APIs for demonstration purposes.
- **Ontology Concept Versioning**: `ontology_concepts` supports versioning and history tracking.
- **Regulatory Change Propagation**: Updating an ontology concept triggers revalidation flags and audit events for affected agents.
- **Ontology-Mandated Eval Test Cases**: Auto-generates regulatory test cases from concept `linkedRegulations`.
- **Ontology-Encoded Data Sensitivity Classifications**: `sensitivityClassification` field on `ontology_concepts` defines data types and redaction requirements, injected into runtime system prompts and used for dynamic payload redaction.
- **Root Cause Classification Engine**: Classifies agent drift into structured categories (`knowledge_base_staleness`, `knowledge_gap`, `ontology_mismatch`, `tool_schema_change`, `prompt_degradation`, `context_window_overflow`, `model_regression`, `memory_eviction`, `data_quality`, `unknown`) by correlating evidence across eval history, KB freshness/coverage, ontology revalidation, MCP tool schema fingerprints, context profiles, and episodic memory state. Results stored in `diagnosisDetails.rootCauseClassification`.
- **Causal Diagnostic Cascade**: Evidence bundle gathers data from 6 subsystems: (1) eval history with pass rates/coverage tags, (2) KB freshness + RAG pipeline quality + coverage signals, (3) MCP tool schema drift fingerprints (SHA-256 hash comparison against baseline), (4) ontology concept revalidation flags + version changes, (5) context profile budget/priority state, (6) episodic memory counts + eviction signals + governance rules.
- **Historical Healing Resolution Learning**: Classification prompt includes resolved healing pipelines for the same agent (past root cause categories, remediation types, fix durability) and improvement cycles, enabling the causal model to improve accuracy with each healing cycle.
- **Shadow Replay Validation Gate**: Creates shadow replay jobs linked to healing pipelines to validate remediation. Server-side gate blocks experiment→verified transition if replay is running or failed. Auto-triggers on remediation stage transition when agent has traces.
- **Context Engineering Auto-Adjustment**: Analyzes failure patterns to recommend and apply context priority and token allocation changes. Auto-generates recommendations when root cause is context-related (`knowledge_base_staleness`, `knowledge_gap`, `context_window_overflow`, `prompt_degradation`).
- **Healing Intelligence Summary**: Provides a top-level summary of root cause classification, shadow replay status (with auto-triggered badge), context adjustment status, and connected subsystem links for healing pipelines.
- **Cost Attribution Chain**: Full cost-to-serve analysis aggregating LLM token costs + MCP tool call costs + infrastructure overhead (15%) per agent, per outcome. `GET /api/billing/cost-attribution` with period filtering (30d/90d/all).
- **Margin Analysis Dashboard**: Revenue vs cost-to-serve per outcome with monthly trend analysis. `GET /api/billing/margin-analysis` computes margin %, flags outcomes below 20% margin or with month-over-month erosion. "Margins" tab in billing page with summary cards, trend chart, cost breakdown donut, per-outcome table, and alert cards.
- **Margin Alerts**: `GET /api/billing/margin-alerts` identifies negative margins, thin margins (<20%), and margin erosion with recommended actions.
- **Cost Optimization Patches**: `POST /api/recommendations/generate` extended with `cost_reduction` category. `POST /api/ai/generate-patches` includes margin context and `estimatedCostSavings`/`marginImpact` fields. `POST /api/recommendations/generate-cost-optimizations` auto-generates patches for outcomes with poor margins.
- **Metering Dashboard Cost Integration**: `GET /api/billing/metering-dashboard` response includes `costToServe`, `margin`, `marginPercent` per outcome and `monthlyMargin` trend data.
- **Acceptance-Based Ground Truth Flywheel (IP #4)**: Complete closed-loop system where billing acceptance/rejection events become ground-truth labels that continuously improve agent quality.
  - **Positive & Negative Ground Truth**: `POST /api/outcomes/:id/sync-eval-feedback` imports both accepted (billable=true → shouldPass=true) and rejected (billable=false → shouldPass=false) events as eval test cases. Positive cases capped at 20 per sync. All cases tagged with `groundTruthLabel: "positive"/"negative"` in inputData.
  - **Automatic Flywheel Sync Triggers**: Invoice creation auto-syncs eval feedback for the invoice's outcome. Rejected outcome events auto-create negative ground truth eval test cases inline on creation. Auto-synced cases tagged with `autoSynced: true` and `trigger` field.
  - **Production-to-Golden Dataset Promotion**: `POST /api/golden-datasets/:id/promote-production-cases` promotes production_feedback eval cases into golden datasets. `GET /api/golden-datasets/:id/promotion-candidates` previews qualifying cases. Growth tracked in `growthHistory`.
  - **Cross-Industry Acceptance Pattern Library**: `GET /api/flywheel/acceptance-patterns` groups outcome events by agent industry, computes per-industry acceptance rates, top rejection reasons with percentages, top dispute categories, monthly trends, and distinctive failure modes (over-representation factor ≥1.5x).
  - **Flywheel Metrics Dashboard**: `GET /api/flywheel/metrics` returns ground truth counts (positive/negative/total), monthly growth, acceptance rate trend, golden promotions, per-outcome flywheel status. "Ground Truth Flywheel" tab in billing page with summary cards, growth chart, acceptance trend chart, cross-industry pattern cards, per-outcome status table with sync buttons.
  - **Acceptance Rate → Eval Recommendations**: `POST /api/recommendations/generate` extended with `acceptance_signal` trigger. When an outcome's acceptance rate drops below its industry average, auto-generates eval coverage recommendations with severity based on gap size.

- **Agent Config Versioning & GitOps**: Full lifecycle versioning and Git-based config management.
  - **Context/Memory Profile Versioning**: `context_profiles` and `memory_profiles` tables include `version` (integer, default 1) and `versionHistory` (jsonb, default []) fields. PATCH endpoints snapshot previous state to versionHistory and increment version, matching blueprint/policy versioning patterns.
  - **Unified Agent Manifest Export/Import**: `GET /api/agents/:id/export-manifest` bundles agent config, blueprint, context profile, memory profile, eval suites, policies, ontology bindings, and MCP integrations into a versioned JSON manifest with SHA-256 checksums per section. Supports `?format=yaml`. `POST /api/agents/import-manifest` creates or updates agents from manifests with `?mode=create|update`.
  - **Config Rollback**: `POST /api/agents/:id/rollback-config` restores blueprint, context profile, memory profile, and policies to a specific version from versionHistory snapshots. Creates audit events for rollback operations.
  - **Git Push/Pull Integration**: `gitConfig` jsonb on agents stores `{ repoUrl, branch, path, lastSyncedAt, lastSyncCommit }`. `POST /api/agents/:id/git-push` exports manifest and pushes to GitHub via Contents API. `POST /api/agents/:id/git-pull` fetches and applies manifest from repo. `GET /api/agents/:id/git-status` reports sync status (in_sync, local_changes, remote_changes, not_configured).
  - **CI/CD Webhook Pipeline**: `POST /api/webhooks/git-commit` receives GitHub push webhooks with HMAC-SHA256 signature verification. Auto-imports changed manifests (full section import: agent config, blueprint, context, memory), triggers eval runs, and optionally auto-deploys if evals pass threshold. `ciCdConfig` jsonb on agents stores `{ autoEvalOnPush, autoDeployOnEvalPass, evalPassThreshold, targetEnvironment, webhookSecret }`.
  - **GitOps UI Panel**: Agent detail page includes a GitOps tab with git repo configuration, sync status, push/pull buttons, manifest export/import, CI/CD toggle settings, pipeline run history, and config rollback with version history.

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