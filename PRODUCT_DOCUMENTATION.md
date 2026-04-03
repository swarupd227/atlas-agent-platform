# ALMP - Agent Lifecycle Management Platform
# Product Documentation

---

## Table of Contents

1. [Platform Overview](#1-platform-overview)
2. [Getting Started](#2-getting-started)
3. [Global App Shell](#3-global-app-shell)
4. [Role-Based Access](#4-role-based-access)
5. [Overview Dashboard](#5-overview-dashboard)
6. [Outcome Builder](#6-outcome-builder)
7. [Outcomes Management](#7-outcomes-management)
8. [Agent Registry](#8-agent-registry)
9. [Agent Design Wizard](#9-agent-design-wizard)
10. [Multi-Agent Orchestration](#10-multi-agent-orchestration)
11. [Multi-Agent Pipeline Orchestrator](#11-multi-agent-pipeline-orchestrator)
12. [Templates](#12-templates)
13. [Agent Skills Library](#13-agent-skills-library)
14. [Blueprint Studio](#14-blueprint-studio)
15. [Knowledge Base System](#15-knowledge-base-system)
16. [Context Engineering Studio](#16-context-engineering-studio)
17. [Memory Architecture Manager](#17-memory-architecture-manager)
18. [RAG Pipeline Designer](#18-rag-pipeline-designer)
19. [Ontology Explorer & Knowledge Graph](#19-ontology-explorer--knowledge-graph)
20. [Evaluation Studio](#20-evaluation-studio)
21. [Shadow Replay](#21-shadow-replay)
22. [Deployments & Release Orchestrator](#22-deployments--release-orchestrator)
23. [Canary Deployment Console](#23-canary-deployment-console)
24. [Monitor](#24-monitor)
25. [Optimization (Patch Center)](#25-optimization-patch-center)
26. [Ops & Self-Healing Loop](#26-ops--self-healing-loop)
27. [Autonomy Engine & Oversight Console](#27-autonomy-engine--oversight-console)
28. [Governance](#28-governance)
29. [Audit Trail](#29-audit-trail)
30. [Approvals](#30-approvals)
31. [Approval Gates](#31-approval-gates)
32. [Billing & Metering](#32-billing--metering)
33. [MCP Integration Suite](#33-mcp-integration-suite)
34. [MCP Apps](#34-mcp-apps)
35. [Marketplace](#35-marketplace)
36. [Agent API Gateway](#36-agent-api-gateway)
37. [Mock MCP Servers](#37-mock-mcp-servers)
38. [Admin](#38-admin)
39. [API Reference](#39-api-reference)
40. [Data Model](#40-data-model)
41. [Security & Compliance](#41-security--compliance)
42. [Demo Environments](#42-demo-environments)

---

## 1. Platform Overview

ALMP (Agent Lifecycle Management Platform) is an enterprise-grade platform for managing the full lifecycle of AI agents. It is designed around a core operational philosophy:

- **80% Autonomous Execution**: Agents operate independently, self-optimizing, self-healing, and autonomously deploying improvements based on defined outcome contracts.
- **20% Expert Validation**: High-risk changes, policy exceptions, and major releases require explicit human approval from designated Expert Validators.

**Core Value Proposition**: Outcome-driven AI operations where customers pay for measurable results, not compute time. The platform ensures agents deliver on contracted KPIs with full traceability, governance, and cost transparency.

### Key Capabilities

| Capability | Description |
|---|---|
| Outcome Contracts | Define measurable KPIs with SLAs and pricing models |
| Agent Lifecycle | Create, configure, deploy, monitor, and optimize agents |
| Multi-Agent Orchestration | Team-based agent coordination with A2A protocol support |
| Blueprint Studio | Visual agent configuration with versioning and approval flows |
| MCP Integration | Model Context Protocol servers, tools, resources, and prompts |
| Self-Healing | Automated incident detection, patching, and resolution |
| Outcome-Based Billing | Metered billing tied to delivered outcomes |
| Enterprise Governance | Policy enforcement, audit trails, and compliance frameworks |

### Technology Stack

- **Frontend**: React, Vite, Tailwind CSS, shadcn/ui, wouter (routing), Recharts (charts), TanStack Query (data fetching)
- **Backend**: Express.js REST API
- **Database**: PostgreSQL with Drizzle ORM
- **AI Providers**: OpenAI GPT-4.1 for platform-wide AI features; Anthropic Claude (claude-opus-4-5 / claude-sonnet-4-5) for live agent execution in demo environments

---

## 2. Getting Started

### Navigation

The platform uses a collapsible sidebar organized into Primary and Advanced groups:

**Primary Navigation**
- Overview, Outcomes, Agents, Knowledge, Deployments, Monitor, Governance, Integrations

**Advanced Navigation (grouped)**
- **Build**: Pipelines, Blueprints, Templates, Skills, Context Studio, Memory Manager, RAG Pipeline, Knowledge Graph
- **Evaluate**: Evaluations, Golden Datasets
- **Operate**: Shadow Replay, Canary Deployment, Optimization, Healing Center, Runbooks
- **Govern**: Autonomy Engine, Oversight Console, Approvals, Audit Trail
- **System**: Billing, Ontology, Admin

### First Steps

1. **Select a Role** using the Role Switcher in the sidebar footer to see the platform from your persona's perspective.
2. **Choose an Environment** (Development, Staging, Production) using the environment selector in the top header.
3. **Visit the Overview Dashboard** for a high-level summary of platform health, outcomes, agents, and pending approvals.
4. **Use the Outcome Builder** to define your first outcome contract with AI assistance.

---

## 3. Global App Shell

The app shell provides persistent UI elements available on every page:

### Header Bar
- **Sidebar Toggle**: Collapse/expand the navigation sidebar.
- **Environment Selector**: Switch between Development, Staging, and Production environments. Data and views are scoped to the selected environment.
- **Global Search**: Search across agents, outcomes, deployments, and other platform objects.
- **Command Palette** (keyboard shortcut): Quick-access command palette for power users to navigate, search, and execute actions.
- **Notification Center**: Real-time notifications for approvals, incidents, drift alerts, and deployment events.
- **Role Switcher**: Switch between personas to see role-appropriate views.
- **Theme Toggle**: Switch between light and dark mode.

### Sidebar
- Role-filtered navigation items (only routes your current role has access to are displayed).
- Active route highlighting.
- Current role indicator in the footer.

---

## 4. Role-Based Access

ALMP implements seven switchable personas, each with tailored access and dashboards:

### Admin
- **Access**: Full platform access across all modules.
- **Focus**: System configuration, user management, platform health monitoring.
- **Dashboard**: Complete view of all widgets including outcome health, agents at risk, approvals, financials, and system status.

### Outcome Owner
- **Access**: Outcomes, Outcome Builder, Billing, Approvals, Agents, Monitor.
- **Focus**: Defining KPIs, tracking ROI, approving outcome contracts.
- **Dashboard**: Outcome health and KPI delivery status, financial snapshot, pending approvals.

### Agent Engineer
- **Access**: Agents, Templates, Blueprints, Evals, Improvements, Outcome Builder, Integrations, Deployments.
- **Focus**: Designing agent blueprints, configuring tools and memory, building evaluation suites.
- **Dashboard**: Agent risk indicators, system status, eval backlog.

### Ops / SRE
- **Access**: Deployments, Monitor, Agents, Improvements, Self-Heal, Integrations, Governance.
- **Focus**: Monitoring, incident response, reliability, rollback operations, cost controls.
- **Dashboard**: System status (prominent), agent health, tool error rates, queue depth.

### Compliance / Security
- **Access**: Governance, Audit Trail, Approvals, Admin, Agents, Deployments, Monitor.
- **Focus**: Policy authoring, audit exports, access controls, compliance reporting.
- **Dashboard**: Policy violations (prominent), audit events, approval queue.

### Expert Validator
- **Access**: Approvals, Agents, Deployments, Evals, Governance, Audit Trail.
- **Focus**: Reviewing and approving high-risk changes, exceptions, and major releases.
- **Dashboard**: Approval queue (prominent), agents at risk.

### Finance
- **Access**: Billing, Outcomes, Approvals.
- **Focus**: Billing rules, outcome metering, dispute resolution.
- **Dashboard**: Financial snapshot (prominent), billing metrics.

---

## 5. Overview Dashboard

The Overview Dashboard provides a role-adaptive summary of platform health. Widgets are shown or hidden based on the current persona.

### Widgets

**Outcome Health**
- Lists all outcome contracts with their status (on_track, at_risk, breaching).
- Shows KPI progress bars with current vs. target values.
- SLA breach indicators and confidence scores.
- Risk tier classification per outcome.

**Agents at Risk**
- Highlights agents with elevated risk based on drift detection, open incidents, latency, and cost.
- Health score display with color-coded severity.
- Direct links to agent cockpit for investigation.

**Approval Queue**
- Pending approvals with type, risk score, requester, and due date.
- Quick-access buttons to review individual approvals.
- Total pending count indicator.

**Financial Snapshot**
- Billed, pending, and disputed revenue totals.
- 30-day revenue summary.
- Quick navigation to detailed billing.

**System Status**
- Tool error rate, queue depth, eval backlog.
- Connector health percentage.
- Active vs. total agent count.

**Policy Violations** (Compliance/Security role)
- Recent policy violations with agent name, policy, severity, and action taken (blocked/warned).
- Trace ID links for forensic investigation.

---

## 6. Outcome Builder (Outcome Discovery)

An AI-powered, multi-stage discovery interface that transforms a natural language business goal into a fully specified, governance-ready outcome contract with KPIs, ROI estimates, applicable policies, and matched agent recommendations.

### Discovery Flow

The Outcome Discovery experience has five distinct phases:

**Phase 1 — Conversational Discovery**
- Describe business objectives in natural language through a live chat interface.
- The AI guides you through clarifying questions covering scope, industry, customer segment, success metrics, and compliance constraints.
- Conversation history is preserved throughout the session.

**Phase 2 — Proposal Generation**
- On demand the AI generates a complete structured proposal containing:
  - Outcome contract (name, description, risk tier, pricing model, price per unit, drift threshold, SLA configuration)
  - KPI definitions with targets, units, measurement methodology, and current baselines
  - ROI estimate (investment, monthly value, time-to-value, three-year NPV)
  - Proposed agents with roles and justifications
  - Applicable governance policies with rationale
  - Regulatory constraints relevant to the industry
  - Validation checklist items (pre-launch readiness)
- A streaming SSE-based API powers real-time proposal generation.
- The full proposal is rendered as an interactive preview card before acceptance.

**Phase 3 — KPI Review & Editing**
- Inline KPI editor allows renaming, retargeting, changing units, or removing KPIs before contract creation.
- AI-generated KPI targets are pre-populated from the proposal.
- Process flow builder: define the step-by-step workflow the outcome contract governs (drag-and-drop step reordering, individual step descriptions).

**Phase 4 — Platform Intelligence**
- The platform automatically queries its own registry to find:
  - **Live agent matches**: Existing agents that can contribute to the outcome, with similarity scores and health indicators.
  - **Template recommendations**: Pre-built agent templates with coverage scores.
  - **Tool coverage**: MCP tools required for the outcome, with status (available / missing).
  - **Matched governance policies**: Platform policies that apply to this outcome based on domain, industry, and risk tier.
- Accept/reject decisions on individual agent and template recommendations before contract creation.

**Phase 5 — Contract Creation & Approval**
- Acceptance creates the outcome contract via `POST /api/outcomes/with-kpis` in a single transaction.
- Discovery-matched policy IDs are persisted in `constraintGraph.matchedPolicyIds` on the contract.
- AI-identified applicable policies (with rationale) are stored in `constraintGraph.discoveryPolicies`.
- An approval record is automatically submitted (`type: "outcome_review"`) with a full evidence package including KPIs, agents, tool coverage, governance readiness score, and accepted/rejected decisions.
- Accepted live agents are automatically bound to the new outcome contract.
- Accepted templates seed the Agent Plan for further configuration.

### Governance Readiness Score

A 0–100 readiness score is calculated at the time of acceptance based on:
- KPI definitions present (+20)
- Risk tier set (+15)
- Matched governance policies (+25)
- No approval gate risk (+15)
- Drift threshold configured (+10)
- Base score (+15)

---

## 7. Outcomes Management

Manage outcome contracts that define the measurable results agents must deliver.

### Outcomes List

- Filterable and searchable table of all outcome contracts.
- Status indicators: draft, active, at_risk, breaching, completed, suspended.
- Risk tier badges (low, medium, high, critical).
- KPI summary strips showing progress toward targets.
- Quick actions: view details, manage KPIs.

### Outcome Detail

The Outcome Detail page is organized into a top contract overview section and a tabbed lower section.

**Contract Overview Strip**
- Contract metadata: name, description, status, risk tier, pricing model, billing cycle, and customer assignment.
- Quick-stat tiles: KPI Progress (weighted average across all KPIs), Active Agents, Policy Activity (checks fired in last 24h), and Billing Activity (last 30-day revenue).
- Inline edit action for governance-sensitive fields (risk tier, thresholds, drift %) that creates a new contract version on save.
- Contract version selector to view historical states.

**KPI Delivery Tab** *(default tab)*
- KPI gauge rings (circular progress indicators) showing current value vs. target for each KPI.
- Progress bar and percentage label per KPI.
- SLA breach badges (SLA WARNING / SLA BREACH) when current value crosses the SLA threshold.
- KPI time-series charts with trend sparklines.
- Projected 30-day value based on observed daily rate of change.
- Contributing agent list with run counts linked to each KPI.
- KPI progress formula: `currentValue / target * 100` for standard KPIs; `target / currentValue * 100` for inverse KPIs (time, latency, error, incident, failure). New contracts always show 0% until agents report real values.
- Add/edit/delete KPIs with an inline modal.

**Agent Plan Tab**
- Visual map of agents assigned to this outcome with status, health score, and run counts.
- Accepted agent/template decisions from the discovery phase are carried forward here.
- Quick-link to each agent's cockpit for configuration.

**Governance Tab**
- **Identified at Discovery** section (violet): policies specifically matched during outcome proposal generation, with AI-generated rationale per policy. Badge count reflects only discovery-matched policies.
- **Org-wide Active Policies** section: shown only when no discovery-specific policy data is available (i.e., for outcomes created outside the discovery flow).
- **Recommended — not yet in platform** section (amber): AI-identified policies that do not yet exist in the platform's policy library.
- **Constrained Agents** list: agents bound to this outcome subject to the governance policies.
- **Impact Network** button: opens the Policy Impact Graph visualizing how policies connect to skills, ontology terms, and bound agents.
- Tab subtitle dynamically shows "Policies identified as applicable during outcome discovery" vs. "Active policies constraining agents bound to this outcome" depending on data source.

**Financial Ledger Tab**
- Revenue pipeline visualization: stages from contracted value through delivered, billed, and collected revenue.
- Billing event list with drill-down to individual traces.
- Cost breakdown by agent.

**Evidence Vault Tab**
- Evaluation evidence linked to the outcome with scoring results, confidence intervals, and run timestamps.
- Correlated metrics: policy check counts, agent run counts, and KPI update history.

**Risk & Remediation Tab**
- Open incidents affecting this outcome.
- Drift signals with severity and recommended actions.
- Remediation actions taken with outcomes.

**Constraint Graph Tab**
- Interactive visualization of the outcome's constraint graph: risk dimensions, approval gates, SLA bounds, and policy bindings.
- Computed from the outcome's `constraintGraph` JSONB field, populated at contract creation and updated on governance changes.

---

## 8. Agent Registry

Central hub for managing and monitoring all AI agents on the platform.

### Agent List

- Filterable by status (active, paused, quarantined, draft, archived), type (single, team, remote), and environment.
- Search by agent name or ID.
- Key metrics displayed per agent: health score, environment, type, status, and risk tier.
- Quick actions: view cockpit, pause/resume, create new agent.

### Agent Cockpit (Detail View)

The Agent Cockpit is a comprehensive dashboard for a single agent, organized into multiple tabs:

**Overview Tab**
- Agent metadata: name, description, type, model, environment, version.
- Health score with color-coded indicator.
- Risk tier and drift status.
- Quick stats: total runs, success rate, average latency, cost per run.

**Configuration Tab**
- Model settings (provider, model name, temperature, max tokens).
- System prompt and instruction configuration.
- Memory and context settings.
- Tool assignments.

**Runs & Traces Tab**
- Paginated list of execution traces with status, duration, token usage, and cost.
- Click-through to detailed Run Detail or Trace Detail views.
- **Formatted Trace Output**: AI-generated output is rendered as structured, readable content rather than raw JSON blobs. The rendering engine handles three data formats:
  - **Pure JSON**: Objects starting with `{` or `[` are parsed and displayed with severity badges, key findings lists, recommended actions, and structured record tables.
  - **Mixed Content**: Plain text interspersed with markdown ` ```json ``` ` code blocks is split into prose paragraphs and extracted record tables.
  - **Inline Embedded JSON**: Analysis strings containing embedded `processedRecords` JSON are automatically detected and extracted into sortable, filterable data tables.
- **Structured Output Table**: Records extracted from agent output are displayed in a sortable, searchable table with CSV export, column-based sorting, and text filtering.

**Agent Task Display**
- **Formatted Task Prompts**: Agent task prompts are parsed by section labels (Role, Goal, Workflow Steps, Available Tools, KPIs, Constraints, etc.) and rendered with contextual icons and proper formatting.
- Prose sections (Role, Goal, Expected Impact, Error Handling, Handoff Rules) render as readable paragraphs.
- Short-item list sections (Available Tools, KPIs to Optimize, Constraints) render as badge pills for quick scanning.
- Numbered workflow steps render as ordered lists with step indicators.

**Evaluations Tab**
- Linked evaluation suites with pass/fail rates.
- Regression detection and drift indicators.
- Links to Eval Detail pages.

**Deployments Tab**
- Release history for this agent across environments.
- Rollout strategy and status per release.

**Blueprint Tab**
- Current blueprint configuration with version history.
- MCP dependencies, tool nodes, and context nodes.

**Timeline Tab**
- Aggregated version changes, audit events, and recommendations with diff visualization.
- "Time travel" capability to see agent state at any historical point.

**Runtime (AAR) Tab**
- Full Atlas Agent Runtime (AAR) governance sidecar status for this agent (see Section 43).
- 7-module health grid (PolicyEngine, MCPProxy, ProvenanceStore, TelemetryEmitter, AutonomyEnforcer, CredentialManager, HealthMonitor) with live metrics per module.
- Policy bundle panel: current bundle version, last sync timestamp, distribution mode.
- Target platform selector: free-text combobox with suggestions (atlas-native, aws-bedrock, gcp-vertex, azure-ai-foundry, kubernetes, on-prem, custom). Persists to the AAR config and regenerates platform-specific deployment hints in the package manifest.
- Download AAR Package button: produces a ready-to-deploy JSON manifest (`aar-package-<agent-name>.json`).
- Health summary strip: all-modules-operational indicator + bundle version + platform + last-sync date.

**Redaction Profiles**
- R0 (No redaction), R1 (PII masked), R2 (Full redaction) settings.
- Controls what data is visible in traces and audit events based on user roles.

### Agent Types

| Type | Description |
|---|---|
| **Single** | Standard autonomous agent with its own blueprint and tool configuration |
| **Team** | Composite orchestrator that coordinates multiple member agents with defined roles (lead/member/observer) |
| **Remote** | External agent connected via Google A2A protocol with capability discovery and trust tier management |

---

## 9. Agent Design Wizard

A step-by-step wizard for creating new agents with AI assistance.

### Wizard Steps

1. **Basic Info**: Name, description, agent type selection.
2. **Model Configuration**: Choose AI provider, model, temperature, and token limits.
3. **System Prompt**: Define the agent's core instructions and behavior.
4. **Tools & Capabilities**: Select MCP tools from the governed registry.
5. **Memory & Context**: Configure memory strategy and context sources.
6. **Evaluation Setup**: Define initial eval suite with test cases and thresholds.
7. **Governance**: Assign policies and compliance requirements.
8. **Review & Create**: Summary of all settings with AI-generated recommendations.

### AI Enhancement

The wizard includes an "AI Enhance" feature that analyzes your configuration and suggests improvements for:
- System prompt optimization
- Tool selection recommendations
- Memory strategy suggestions
- Evaluation coverage recommendations

---

## 10. Multi-Agent Orchestration

### Agent Teams

Create and manage composite agent teams where multiple agents collaborate on complex tasks.

### Industry Provider

The platform scopes the entire experience to specific industries (Financial Services, Healthcare, Insurance, Manufacturing, Retail, Technology/SaaS). The Industry Provider system adapts UI defaults, compliance rules, ontology terms, and agent behavior to sector-specific standards.

**Team Configuration**
- Team name, description, and orchestration strategy.
- Member management with role assignments:
  - **Lead**: Primary orchestrator that coordinates the team.
  - **Member**: Contributing agent that handles specific subtasks.
  - **Observer**: Monitoring agent that logs activity without active participation.
- Team blueprint with graph-based orchestration model.

**Pipeline Record ID Continuity**
- When worker agents in a pipeline produce structured records (e.g., `processedRecords`), those records are automatically enriched into the context passed to downstream workers.
- Each worker's structured output is appended as a labeled `## STRUCTURED RECORDS FROM [Agent Name]` section with the full JSON record set, ensuring downstream agents can reference the exact same record IDs.
- This guarantees logical traceability across pipeline stages: if Worker 1 (Lead Scoring) produces `LEAD-0001` through `LEAD-0020`, Worker 2 (Compliance Screening) and Worker 3 (Lead Routing) will reference those same IDs rather than generating their own.
- The enrichment happens automatically in the pipeline runtime without requiring any configuration from the user.

**Team Graph Editor**
- Visual canvas for designing agent collaboration flows.
- Four node types:
  - **Internal Agent**: Standard platform agents.
  - **Tool Set**: Groups of MCP tools.
  - **Edge Gate**: Policy checkpoints and conditional routing.
  - **Remote A2A Agent**: External agents connected via A2A protocol.
- Edge contracts with A2A-typed content parts (text, URL, data, file).
- SLA/timeout configuration per edge.
- Failure modes: retry, skip, escalate.
- Retry policies per connection.

### Remote Agents (A2A)

Manage external agents connected via Google's Agent-to-Agent (A2A) communication protocol.

**Remote Agent Registry**
- Add remote agents by providing their A2A Agent Card URL.
- Automatic capability discovery from Agent Card metadata.
- Connectivity status monitoring (connected, disconnected, error).

**Trust Tiers**
- **Untrusted**: No access, discovery only.
- **Basic**: Limited interactions, heavily monitored.
- **Verified**: Standard interactions with audit logging.
- **Trusted**: Extended access with reduced oversight.
- **Privileged**: Full access (requires Security Admin approval).

**Security Controls**
- Allowed skills whitelist per remote agent.
- Rate limiting (50 requests/minute default for A2A delegations).
- A2A-specific audit logging.
- Trust tier validation before every delegation.

---

## 11. Multi-Agent Pipeline Orchestrator

Visual workflow editor for designing and executing multi-agent pipelines with sequential agent stages, approval gates, parallel groups, and AI-simulated scenario execution.

### Pipeline Editor

- **Visual Stage Builder**: Drag-and-drop editor for composing pipeline stages with sequential agents, approval gates, and parallel groups.
- **Stage Types**:
  - **Agent Stage**: Single worker agent executing a specific task.
  - **Approval Gate**: Human review checkpoint between stages.
  - **Parallel Group**: Multiple agents running concurrently with fork/join semantics.
- **AI Pattern Recommendation**: AI proposal generator analyzes KPI dependencies and agent roles to recommend the optimal orchestration pattern (sequential, parallel, fan_out_fan_in, supervisor) with `patternReasoning`, `parallelGroups` (execution tiers), and `executionGraph`.

### Pipeline Execution Runtime

- **Tier-Based Execution**: The runtime engine computes execution tiers from blueprint DAGs, running independent agents concurrently via `Promise.all` with structured context merging.
- **Context Cascading**: Each worker receives the output from previous stages as `## INPUT FROM PREVIOUS STAGE`, enabling sequential reasoning across the pipeline.
- **Record ID Continuity**: Structured records (`processedRecords`) from each worker are automatically enriched into downstream context as `## STRUCTURED RECORDS FROM [Agent Name]` with the full JSON record set, ensuring downstream agents reference the exact same record IDs for end-to-end traceability.
- **Error Strategies**: `fail_fast` (halt on first failure) and `best_effort` (continue despite failures) with escalation support.
- **Fork/Join Visualization**: Parallel execution is visualized with fork/join markers in traces and Gantt-style timing bars showing actual concurrency.

### Pipeline Simulation

- **AI Scenario Simulation**: Simulate pipeline execution with AI-generated stage outputs before running real agents.
- **Stage Advancement**: Manual or automated advancement through pipeline stages with approval gates.

---

## 12. Templates

A library of reusable agent templates to accelerate agent creation.

### Features

- **Template Catalog**: Browse pre-built agent configurations organized by category.
- **Template Detail**: Full configuration preview including model settings, system prompt, tool assignments, and governance rules.
- **Instantiate**: Create a new agent directly from a template with customization options.
- **Category Filtering**: Filter templates by use case (customer service, data analysis, content generation, etc.).

---

## 13. Agent Skills Library

A catalog of composable, versioned skill units with industry-organized browsing, search, and AI enhancement/generation capabilities, including real-time policy validation.

### Features

- **Skill Catalog**: Browse skills organized by industry vertical with search and filtering.
- **Skill Detail**: Full skill configuration including description, industry tags, MCP tool dependencies, and version history.
- **Skill Versioning**: Create and manage skill versions with changelog tracking.
- **Knowledge Queries**: Define RAG queries for skills to link them to knowledge base sources.
- **Dependency Validation**: Automatic checking for broken MCP tool/server references in skills.
- **Skill Evaluation**: Run skill-specific evaluations to assess quality and correctness.

### AI-Powered Skill Management

- **AI Skill Generation**: Generate new skills from natural language descriptions using AI.
- **AI Skill Enhancement**: Analyze existing skills and propose improvements for prompt optimization, tool selection, and coverage.
- **Skill Composer**: Combine multiple skills into composite capabilities.

---

## 14. Blueprint Studio

Visual editor for creating, versioning, and compiling agent blueprints.

### Blueprint Management

- **Blueprint List**: All blueprints with version, status (draft, review, approved, production), and linked agents.
- **Version History**: Track changes across blueprint versions with diff visualization.

### Blueprint Detail

**Configuration Tab**
- Agent model settings, system prompt, and behavior parameters.
- Editable sections with save and version controls.

**MCP Dependencies Tab**
- Select MCP servers the blueprint depends on.
- Pin specific server versions for reproducibility.
- Dependency health indicators.

**MCP Tool Nodes**
- Governed tool picker sourced from the MCP Tool Registry.
- Tool input/output schema preview.
- Risk classification and governance status per tool.

**Context Nodes**
- Select MCP resources as context sources.
- Retrieval strategy configuration:
  - **Eager**: Load at agent startup.
  - **Lazy**: Load on first access.
  - **On-demand**: Load only when explicitly requested.
- Sensitivity classification awareness.

**Prompt Nodes**
- Select prompts from the MCP Prompt Library.
- Map prompt arguments to agent context variables.

**Team Blueprint** (for team-type agents)
- Graph-based orchestration tab with visual canvas.
- Node configuration panels for agent, tool, policy, and remote agent pickers.
- Edge contract editor with content type definitions and metadata schemas.

### Governance Gates

- Reviewer assignments for production releases.
- Approval flow configuration.
- Compiler snapshots for reproducibility.
- Static checks before compilation.

---

## 15. Knowledge Base System

Vector-embedded document collections for RAG grounding, supporting various ingestion modes, OpenAI embeddings, and pgvector for similarity search. Agents can be linked to knowledge bases for runtime context injection.

### Knowledge Base Management

- **KB List**: Browse all knowledge bases with document count, total chunks, and status indicators.
- **Create KB**: Define a new knowledge base with name, description, embedding model, and chunking configuration.
- **KB Detail**: Full management view with source documents, search testing, and agent linkage.

### Ingestion Modes

- **File Upload**: Upload documents (PDF, TXT, MD, DOCX) with automatic chunking and embedding.
- **URL Scraping**: Provide URLs for automatic content extraction and indexing.
- **Manual Text Entry**: Paste or type text content directly for embedding.
- **Structured Data Import**: Import JSON or tabular data as structured knowledge entries.

### Search & Query

- **Vector Search**: Semantic similarity search across embedded documents using pgvector.
- **RAG-Powered Q&A**: Ask natural language questions and receive AI-generated answers grounded in the knowledge base content.
- **Agent Linking**: Link knowledge bases to agents so they receive relevant context at runtime.

---

## 16. Context Engineering Studio

Systematic management of how agents acquire and utilize context, featuring context source inventory, priority matrix, and budget visualization.

### Features

- **Source Inventory**: Catalog of all context sources available to agents (knowledge bases, MCP resources, memory stores, tools).
- **Priority Matrix**: Configure priority rankings for context sources to control which information agents receive first when context windows are limited.
- **Budget Visualizer**: Token budget allocation visualization showing how context window capacity is distributed across sources.
- **Compilation Preview**: Preview the compiled context that an agent would receive at runtime.

### Industry Presets

- Pre-configured context profiles for Healthcare, Financial Services, Insurance, and other verticals with appropriate source priorities and compliance-aware token budgets.

### AI Context Optimization

- **Automatic Optimization**: AI-powered analysis of context profiles to suggest improvements for token efficiency, source relevance, and coverage gaps.

---

## 17. Memory Architecture Manager

Defines agent memory management with industry-specific retention and governance policies.

### Memory Tiers

- **Working Memory**: Short-term context for the current execution session.
- **Episodic Memory**: Historical interaction records with decay and retention rules.
- **Semantic Memory**: Long-term factual knowledge and learned patterns.

### Features

- **Capacity Management**: Configure storage limits and eviction policies per memory tier.
- **Retention Policies**: Define industry-specific retention rules based on regulations (HIPAA, PCI-DSS, SEC, GDPR).
- **Forgetting Policies**: Automated data purging based on regulatory requirements and governance rules.
- **Memory Entry Exploration**: Browse, search, and inspect individual memory entries across all tiers.
- **AI Memory Rule Suggestions**: AI-generated retention and governance rules based on the agent's industry and regulatory context.

---

## 18. RAG Pipeline Designer

Advanced configuration of Retrieval-Augmented Generation pipelines for controlling how agents retrieve industry-specific knowledge at runtime.

### Features

- **Knowledge Source Management**: Configure document stores, databases, and knowledge graphs as retrieval sources.
- **Retrieval Strategy Selection**: Choose between Vector search, GraphRAG, Hybrid, or custom retrieval strategies.
- **Chunking Strategy Optimization**: Configure chunk size, overlap, and splitting strategies for optimal retrieval quality.
- **Pipeline CRUD**: Create, update, and delete RAG pipeline configurations.

---

## 19. Ontology Explorer & Knowledge Graph

Industry knowledge graph browser with concept management, AI-enhanced descriptions, and relationship mapping.

### Ontology Explorer

- **Concept Browser**: Browse industry-standard and custom-extension ontology concepts with hierarchical navigation.
- **Concept Detail**: View concept descriptions, relationships, and linked agents/tools.
- **Search**: Full-text search across ontology terms and concepts.
- **Bulk Import**: Import ontology concepts in bulk via structured data.

### Knowledge Graph Builder

- **Relationship Mapping**: Define parent/child/related relationships between ontology concepts.
- **AI Enrichment**: AI-powered concept description enhancement and relationship suggestions.
- **Sub-Domain Generation**: AI-generated sub-domain ontologies for specialized industry verticals.

### MCP-Ontology Parameter Matching

- **Cross-Reference Engine**: Automatically compare MCP server tool parameters and resource names against ontology concepts.
- **Auto-Linking**: Suggest and apply mappings between tool parameters and ontology terms.
- **Mismatch Flagging**: Identify and highlight parameters that lack ontology coverage for governance review.
- **Semantic Validation**: Validate text content against ontology semantic constraints.

---

## 20. Evaluation Studio

Comprehensive evaluation management for measuring agent quality and detecting regressions.

### Eval Suite Management

- **Eval List**: All evaluation suites with pass rates, run counts, and drift status.
- **Create Eval Suite**: Define test cases, scorers, thresholds, and regression criteria.
- **AI Test Case Generation**: Generate test cases using AI based on agent configuration and expected behavior.

### Eval Detail

**Test Cases Tab**
- Individual test cases with input, expected output, and scoring criteria.
- Editable test case management (add, edit, delete).
- Bulk import/export capabilities.

**Run History Tab**
- Chronological list of evaluation runs with pass/fail rates.
- Trend charts showing evaluation quality over time.
- Regression detection with alerts.

**Scorers Tab**
- Configure scoring functions (exact match, semantic similarity, LLM-as-judge, custom).
- Threshold management per scorer.
- Weight assignments for composite scores.

**Regression Analysis**
- Baseline comparison across runs.
- Statistical significance testing.
- Drift percentage calculations.

---

## 21. Shadow Replay

Replay production traces against candidate agent versions for safe comparison and validation before deployment.

### Features

- **Trace Selection**: Choose production traces to replay against a new agent version.
- **Side-by-Side Comparison**: Compare original production output with candidate version output.
- **Scoring**: Automated quality scoring of replayed results.
- **Redaction Support**: Apply R0/R1/R2 redaction profiles to replayed data.
- **Approval Evidence**: Results feed into deployment approval evidence for informed release decisions.

---

## 22. Deployments & Release Orchestrator

Manage the deployment lifecycle of agents across environments with built-in safety mechanisms.

### Release List

- All releases with status (pending, deploying, deployed, failed, rolled_back).
- Environment targeting (staging, shadow, canary, production).
- Rollout strategy indicators.
- Quick actions: view details, rollback, promote.

### Create Release Wizard

Step-by-step release creation:
1. **Agent Selection**: Choose agent and version to deploy.
2. **Environment**: Select target environment.
3. **Rollout Strategy**:
   - **Shadow**: Run alongside production without serving traffic.
   - **Canary**: Gradually shift traffic percentage.
   - **Direct**: Immediate full deployment.
4. **Safeguards**: Configure auto-rollback thresholds, health checks, and monitoring duration.
5. **Review & Deploy**: Summary with approval requirements.

### Release Detail

- **Deployment Status**: Real-time progress through deployment stages.
- **Canary Monitoring**: Traffic split percentage, error rates, latency comparison.
- **Auto-Promotion/Rollback**: Configurable thresholds for automatic promotion to full production or rollback on failure.
- **Shadow Replay Evidence**: Results from shadow runs linked to the release.
- **Approval Chain**: Required approvals and their status.

### Deployment Sequence

Orchestrated deployment through stages:
1. **Staging**: Automated testing in staging environment.
2. **Shadow**: Shadow replay against production traffic.
3. **Canary**: Gradual traffic shift with monitoring.
4. **Production**: Full deployment after all checks pass.

### Additional Features

- **Deploy as Source Package**: Export agent configuration for CI/CD integration.
- **Freeze Center**: Manage deployment freezes during critical periods.

---

## 23. Canary Deployment Console

Manages graduated rollouts of agent versions with industry-specific safety controls, KPI comparison, and auto-promotion/rollback rules.

### Features

- **Traffic Stage Management**: Configure graduated traffic shifting stages (e.g., 5% → 25% → 50% → 100%) with monitoring windows at each stage.
- **KPI Comparison**: Side-by-side comparison of baseline (current production) vs. candidate (new version) performance across all configured KPIs.
- **Blast Radius Analysis**: Automated analysis of the potential impact scope if the candidate version exhibits issues.
- **Industry-Specific Safety Gates**: Compliance-aware promotion rules that enforce additional checks for regulated industries (e.g., Fair Lending review for financial services canary deployments).
- **Auto-Promotion/Rollback**: Configurable thresholds that automatically promote the candidate to full production or roll back on failure detection, based on error rate, latency, and KPI degradation.

---

## 24. Monitor

Real-time observability dashboard for agent health, performance, and compliance.

### Tabs

**Outcome SLA Dashboard**
- KPI delivery status across all outcomes.
- SLA breach indicators and trend analysis.

**Live Runs**
- Real-time feed of agent execution runs.
- Status, duration, token usage, and cost per run.
- Click-through to Run Detail for full trace inspection.

**Drift Detection**
- Active drift signals with severity (low, medium, high, critical).
- Drift metrics: pass rate deviation, latency changes, hallucination rates.
- Baseline vs. current comparison.
- Acknowledge, resolve, or escalate drift signals.

**Agent Health**
- Health scores across all agents.
- Tool connector status and error rates.
- Latency percentile charts (p50, p95, p99).

**Policy Violations**
- Real-time policy violation feed.
- Severity classification and blocking actions.
- Links to traces for investigation.

### Run Detail

Detailed view of a single agent execution:
- **Execution Timeline**: Step-by-step execution with timing.
- **MCP Trace**: OpenTelemetry-style span waterfall for MCP interactions (initialization, list sync, resource reads, tool calls, confirmations, outcomes).
- **MCP Transcript**: Structured JSON-RPC request/response log with session tracking.

### Trace Detail

Deep-dive into execution traces:
- Full input/output display.
- Tool call details with parameters and responses.
- Token usage breakdown.
- Policy check results.
- Cost attribution.
- **Formatted Analysis Output**: The trace output section renders AI-generated analysis as structured content with:
  - Analysis text displayed as readable prose paragraphs.
  - Severity badges with color-coded indicators (Low/Medium/High/Critical).
  - Key findings extracted and rendered as bulleted lists.
  - Recommended actions displayed as actionable items.
  - Citations shown as reference annotations.
  - Embedded `processedRecords` extracted from analysis text and rendered as sortable, filterable structured tables with CSV export.
  - Nested JSON code blocks within analysis strings are automatically parsed and their records surfaced alongside the text.

---

## 25. Optimization (Patch Center)

AI-driven autonomous optimization and self-healing capabilities.

### Patch Management

- **AI-Proposed Patches**: The system analyzes agent performance and proposes configuration changes (prompt tuning, model swaps, parameter adjustments).
- **Patch Types**: prompt_optimization, model_swap, parameter_tuning, tool_config, memory_optimization.
- **Impact Analysis**: Predicted improvement with confidence scores.
- **Approval Flow**: Patches require approval before application based on risk level.
- **Rollback**: One-click rollback to pre-patch configuration.

### Experiment Management (A/B Testing)

- **Create Experiments**: Define A/B tests comparing current configuration against proposed changes.
- **Traffic Splitting**: Configure traffic percentage for each variant.
- **Metrics Tracking**: Track success rate, latency, cost, and custom metrics per variant.
- **Statistical Analysis**: Significance testing to determine winning variants.
- **Auto-Promote**: Automatically promote winning variants based on defined thresholds.

---

## 26. Ops & Self-Healing Loop

### Ops Dashboard

- Operational view of incidents, remediation actions, and system health.
- Incident list with severity, status, and affected agents.
- Quick actions for incident management.

### Self-Healing Loop

Automated incident resolution pipeline:

1. **Detection**: Drift detection, error rate spikes, SLA breaches, or health score drops trigger incidents.
2. **Analysis**: AI analyzes the incident and proposes remediation.
3. **Patching**: Auto-generated patches for common issues.
4. **Approval**: Expert validation for high-risk remediations.
5. **Deployment**: Automated deployment of approved patches.
6. **Verification**: Post-deployment monitoring to confirm resolution.
7. **Closure**: Auto-closure on successful verification, auto-reopening if issues recur.

### Autonomy Hooks

Automated actions triggered by specific conditions:
- Expand eval suites when drift is detected.
- Quarantine agents on confidence drops below threshold.
- Auto-scale resources on load spikes.
- Trigger shadow replay on regression detection.

---

## 27. Autonomy Engine & Oversight Console

### Autonomy Engine

Dynamic, context-aware human oversight system implementing the platform's 80% autonomous / 20% expert validation philosophy with granular control.

- **Risk Dimension Matrix**: Multi-axis risk assessment considering regulatory impact, data sensitivity, financial exposure, and operational criticality.
- **Autonomy Spectrum**: Configurable autonomy levels per agent ranging from fully autonomous to fully supervised, with intermediate levels for different action types.
- **Autonomous Decision Tiers**: Define which decisions agents can make independently vs. which require human review, based on risk scores and action types.
- **Override Calendar**: Schedule temporary autonomy overrides for planned maintenance windows, audit periods, or regulatory review cycles.

### Oversight Console

- **Expert Intervention Thresholds**: Configure confidence score thresholds below which agents must escalate to human reviewers.
- **Real-Time Intervention Feed**: Live feed of agent decisions requiring human review with context, risk assessment, and recommended actions.
- **Intervention History**: Complete audit trail of all human interventions with outcomes and response times.
- **Escalation Chains**: Define escalation paths for different risk categories and business domains.

---

## 28. Governance

Certified Agent Compliance Layer for policy management and enforcement.

### Policy Management

- **Policy Library**: Create and manage governance policies across domains:
  - Data Handling
  - Tool Permissions
  - Logging Requirements
  - Allowed Actions
  - Content Boundaries
- **Policy Configuration**: Define rules with conditions, actions (block, warn, log), and severity levels.
- **Policy Testing**: Create test cases to validate policy behavior before enforcement.
- **Version Control**: Track policy changes with full version history.

### Compliance Frameworks

- SOC 2 mapping with control coverage tracking.
- EU AI Act compliance indicators.
- GDPR compliance checks.
- Framework coverage scores and gap analysis.

### Policy-Outcome Discovery Matching

Policies can be matched to outcome contracts at the point of discovery:
- During Outcome Discovery (Phase 4 — Platform Intelligence), the platform queries policies by domain, industry, and risk tier to find applicable rules.
- The AI proposal generator additionally recommends policies by name with a rationale statement.
- Matched policy IDs are written to `constraintGraph.matchedPolicyIds` on the outcome contract at creation time.
- AI-recommended policies with rationale are stored in `constraintGraph.discoveryPolicies`.
- The Governance tab on the Outcome Detail page reads these fields to display only the proposal-specific policies (hiding the generic org-wide pool when discovery data is present).

### Policy Enforcement

- Pre-action policy checks before agent tool calls and actions.
- Real-time violation detection and blocking.
- Exception management with approval workflows.
- Policy exception requests with justification.

### Compliance Reports

- Generate compliance reports for specific frameworks.
- Coverage percentage with evidence links.
- Gap identification and remediation tracking.
- Export capabilities for auditor consumption.

### Tool Access Controls

- Allowlist/blocklist management per agent.
- Rate limiting per tool.
- Shadow dry-run mode for testing tool policies.
- Redacted audit logging for sensitive tool calls.

---

## 29. Audit Trail

Immutable, hash-chained audit log for all platform actions.

### Features

- **Event Stream**: Chronological log of all platform events with user, action, object, and timestamp.
- **Hash Chain Integrity**: Each event includes a SHA-256 hash linking to the previous event, enabling tamper detection.
- **Filtering**: Filter by action type, user, date range, object type, and severity.
- **MCP Action Filters**: Specialized filters for MCP-specific actions:
  - tool_call, resource_read, server_init, prompt_get, confirmation, list_sync
- **MCP Object Types**: Filter by MCP object categories.
- **Search**: Full-text search across audit event details.
- **Export**: Download audit logs for external analysis or compliance submissions.
- **Integrity Verification**: Verify hash chain integrity to detect any tampering.

---

## 30. Approvals

Expert validation queue for the 20% human oversight requirement.

### Approval Queue

- Filterable list of pending approvals across all types.
- Priority sorting by risk score and due date.
- Approval types:
  - Deployment approvals
  - Policy exception requests
  - Agent configuration changes
  - Blueprint production releases
  - MCP server enablement
  - Tool enablement (high-risk)
  - Outcome contract approvals
  - Patch approvals

### Approval Detail

- **Context Panel**: Full details of the change being approved.
- **Evidence Section**: Evaluation results, shadow replay data, blast radius analysis, and configuration diffs.
- **Risk Assessment**: AI-generated risk score with contributing factors.
- **Actions**: Approve, reject, request changes, or escalate.
- **Audit Trail**: History of all actions taken on this approval.

---

## 31. Approval Gates

Unified MCP elicitation and ALMP supervision experience combining expert validation with MCP elicitation flows.

### Features

- **Tool-Call Gate Checking**: Automatic gates for:
  - Write tool invocations
  - Data export operations
  - Scope escalation attempts
- **Form Mode Elicitations**: Inline forms for collecting additional information during gated operations.
- **URL Mode Elicitations**: External panel support for OAuth flows and sensitive data entry.
- **Server Identity Tracking**: Track which MCP server initiated the gated operation.
- **Risk Flag Analysis**: AI analysis of risk factors associated with each gated action.
- **Actions**: Approve, decline, or cancel gated operations.

### Permission Requirements

- Expert Validator and Security Admin personas have access to Approval Gates.

---

## 32. Billing & Metering

Outcome-based billing system where customers pay for measurable results.

### Metering Dashboard

**Summary Metrics**
- Total revenue, pending revenue, projected annual revenue.
- Revenue growth percentage.
- Total units delivered vs. billable units.
- Acceptance rate (billable/total).
- Invoice counts by status (paid, pending, overdue).

**Revenue Charts**
- Monthly revenue trend line chart.
- Revenue by outcome pie chart.
- Units delivered bar chart.

### Metering Pipeline

The billing system processes outcome events through a pipeline:
1. **Ingestion**: Capture outcome delivery events from agent runs.
2. **Exclusion Rules**: Filter out non-billable events (test runs, duplicates, internal operations).
3. **Deduplication**: Detect and remove duplicate events.
4. **Fraud Checks**: Flag suspicious patterns for review.
5. **Signing**: Generate SHA-256 signed hashes for tamper evidence.
6. **Aggregation**: Aggregate billable events for invoice generation.

### Invoice Management

- **Invoice List**: All invoices with status (draft, sent, paid, overdue, disputed).
- **Invoice Detail**: Line items with drill-down from invoice to events to traces.
- **Pricing Models**: Support for multiple models:
  - Per-unit pricing
  - Tiered pricing
  - Subscription
  - Success-fee
- **Dispute Management**: Create, track, and resolve billing disputes.

### Exclusion Reasons Breakdown

- Visual breakdown of why events were excluded from billing.
- Categories: test_run, duplicate, below_threshold, fraud_flag, internal, manual_exclusion.

---

## 33. MCP Integration Suite

Comprehensive Model Context Protocol (MCP) integration for managing servers, tools, resources, and prompts.

### MCP Server Directory

**Server Management**
- Register internal and third-party MCP servers.
- Server metadata: name, URL, version, capabilities, authentication method.
- Status monitoring (active, inactive, error).

**Capability Negotiation**
- Automatic capability detection from MCP servers.
- Tool, resource, and prompt catalog synchronization.

**Authentication Configuration**
- Support for multiple auth methods per server.
- Credential management and rotation.

**Production Enablement Flow**
- Risk-tier-based approval process:
  - Low risk: Auto-approved.
  - Medium risk: Single reviewer approval.
  - High risk: Multi-reviewer approval with Security Admin sign-off.
- Approval status tracking.

### MCP Tool Registry

**Global Tool Inventory**
- Governed catalog of all tools synced from MCP servers.
- Tool details: name, description, input/output schemas, server source.
- Governance fields: risk classification (low/medium/high/critical), owner, enabled status, drift status.

**Tool Governance**
- Enablement flow requiring approvals for high-risk tools.
- Allowlist and blocklist management.
- Rate limiting configuration.
- Shadow dry-run mode for testing.

**Drift Detection**
- Fingerprint-based tool drift detection.
- Alerts when tool schemas or behavior change from registered baseline.
- Drift acknowledgment and resolution workflows.

### MCP Resources

**Governed Knowledge Connectors**
- Manage document stores, repositories, database exports, and ticket systems via MCP resource primitives (resources/list, resources/read).
- Sensitivity classification: public, internal, confidential, restricted.

**Approval Gates**
- Data steward approval required for internal resources.
- Security Admin approval required for confidential/restricted resources.

**Freshness Tracking**
- Monitor resource freshness with last-synced timestamps.
- Subscription support for real-time updates.

**Blueprint Integration**
- Resources appear as "Context Sources" in Blueprint Studio.
- Retrieval strategy selection (eager/lazy/on-demand).

### MCP Prompt Library

**Prompt Catalog**
- Browse imported MCP prompt templates (playbooks, workflow prompts) by server and status.
- Prompt detail with argument definitions, message preview, and governance information.

**Blueprint Binding**
- "Prompt Nodes" panel in Blueprint Studio for selecting prompts.
- Argument mapping to agent context variables.

**Governance**
- Domain experts can publish prompts.
- Security Admin approval required if prompt embeds sensitive resources.
- Uses MCP primitives: prompts/list, prompts/get, list change notifications.

### Integrations Hub

Central page for managing all integration points:
- MCP Servers overview with status.
- Tool Registry summary with drift alerts.
- Resource directory with sensitivity levels.
- Prompt Library with usage counts.
- Quick navigation to detailed management pages.

---

## 34. MCP Apps

Interactive HTML applications rendered inline within ALMP run and approval screens, powered by MCP servers.

### Features

- **Sandboxed Rendering**: MCP Apps run in sandboxed iframes with strict security boundaries.
- **PostMessage Bridge**: JSON-RPC communication bridge between the app and the platform.
- **Trust Tier Validation**: Apps require appropriate trust level from their source MCP server.
- **User Consent Flow**: Explicit user consent required before app rendering, with trust level display.
- **App Catalog**: Browse available MCP apps with descriptions, trust levels, and server attribution.

### Security Model

- Content Security Policy enforcement within iframes.
- No direct DOM access to parent platform.
- Communication restricted to approved JSON-RPC methods.
- Server allowlisting in the database.

---

## 35. Marketplace

Discover, publish, and install MCP servers, tools, and agent templates from the community.

### Features

- **Marketplace Catalog**: Browse published MCP integrations with categories, ratings, and install counts.
- **Detail Pages**: Full documentation, configuration guides, and compatibility information per listing.
- **Publisher Profiles**: View publisher information, verified status, and published listings.
- **Install Flow**: One-click installation with automatic MCP server registration and tool sync.
- **Search & Filter**: Find integrations by category, publisher, rating, or keyword.

---

## 36. Agent API Gateway

Exposes deployed agents as REST API endpoints for external invocation, with API key management, execution tracing, policy checks, and cost tracking.

### Features

- **Agent Invocation Endpoint**: External systems can invoke agents via `POST /api/gateway/v1/invoke/:agentId` with structured input payloads.
- **Agent Discovery Endpoint**: Public metadata discovery for agents via `GET /api/gateway/v1/agents/:agentId`, returning agent capabilities, input schema, and status.
- **API Key Management**: Generate, rotate, and revoke API keys for gateway access with per-key rate limiting and usage tracking.
- **Execution Tracing**: Every gateway invocation generates a full execution trace linked to the invoking API key for audit and debugging.
- **Policy Enforcement**: All gateway invocations pass through the same governance policy checks as internal executions.
- **Cost Tracking**: Token usage and cost attribution per API key and per invocation for billing and chargeback.

---

## 37. Mock MCP Servers

Built-in mock REST APIs simulating real enterprise systems for demonstration and testing purposes.

### Available Mock Servers

**General / Sales & Marketing**
- **Salesforce CRM**: Simulates Salesforce record queries, contact/lead lookups, task creation, and opportunity management with deterministic financial services lead data.
- **Marketo**: Simulates marketing automation lead management, campaign engagement data, and lead scoring with realistic inbound lead records.
- **Adobe Analytics**: Simulates analytics report execution and data retrieval with configurable metrics and dimensions.

**Fitch / Banking Supervision (Demo)**
Four mock servers power the Fitch Asset Quality Analyzer demo:
- **FFIEC Data Server** (`/api/mock/fitch-ffiec-data/*`): Simulates FFIEC bank call report data including RC-N/RC-C/RI-B/RC-R schedules for 10 banks, NPA schedules, charge-off schedules, and capital adequacy ratios. Returns deterministic data across all peer cohorts.
- **Fitch Analytics Server** (`/api/mock/fitch-analytics/*`): Provides computed ratio trends, threshold breach analysis, peer cohort medians, SVB historical backtest data (8-quarter timeline with composite risk scores, labeled events, and FDIC seizure date), and A/B testing results.
- **Fitch NLP Engine** (`/api/mock/fitch-nlp-engine/*`): Returns transcript sentiment scores (credit quality, forward guidance, sector concerns), filing language change analysis, news signal classifications (routine/emerging/material/crisis), and news volume trend (sigma-based alerts).
- **Fitch Report Engine** (`/api/mock/fitch-report-engine/*`): Provides report template structures, analyst notes, and rating history for AQEWS quarterly report assembly.

### Features

- **Deterministic Data**: Mock servers return consistent, realistic data for reproducible demonstrations and testing.
- **Financial Services Domain**: Lead and banking data is pre-configured with financial services domain attributes (segments, compliance flags, risk ratings, regulatory triggers, FFIEC schedules).
- **Demo Seeding**: Automated demo setup via `POST /api/mock-mcp/seed-demo` to populate the platform with realistic agent configurations, MCP server registrations, and sample data.
- **Tool Registration**: Mock servers register their tools in the MCP Tool Registry, making them available for agent blueprints and pipeline execution.

---

## 38. Admin

Platform administration for system-level configuration and management.

### Features

- **User Management**: View and manage platform users and their role assignments.
- **System Configuration**: Platform-wide settings and feature flags.
- **Environment Management**: Configure Development, Staging, and Production environments.
- **Redaction Profiles**: Configure R0/R1/R2 redaction levels for the platform.
  - **R0**: No redaction — full data visibility.
  - **R1**: PII masking — personally identifiable information is masked.
  - **R2**: Full redaction — sensitive data completely hidden.
- **Data Export**: Export platform data for compliance or migration.

---

## 39. API Reference

The platform exposes a comprehensive REST API. Below are the implemented endpoint groups:

### Outcomes & KPIs
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/outcomes` | List all outcome contracts |
| GET | `/api/outcomes/:id` | Get outcome detail |
| POST | `/api/outcomes` | Create outcome contract |
| POST | `/api/outcomes/with-kpis` | Create outcome contract with KPIs in one transaction (used by Outcome Discovery) |
| POST | `/api/outcomes/intelligence` | Query platform intelligence: matched agents, templates, tools, and policies for a proposed outcome |
| PATCH | `/api/outcomes/:id` | Update outcome |
| GET | `/api/outcomes/:id/kpis` | List KPIs for an outcome |
| GET | `/api/outcomes/:id/evidence` | Get evaluation evidence for outcome |
| GET | `/api/outcomes/:id/events` | Get outcome delivery events |
| GET | `/api/outcomes/:id/audit` | Get audit events for outcome |
| GET | `/api/outcomes/:id/snapshots` | Get historical snapshots |
| POST | `/api/outcomes/:id/versions` | Create outcome version |
| GET | `/api/outcomes/:id/versions` | List outcome versions |
| POST | `/api/exports/outcome/:id/audit` | Export audit trail for outcome |
| GET | `/api/kpis` | List all KPIs |
| POST | `/api/kpis` | Create KPI |
| PATCH | `/api/kpis/:id` | Update KPI |
| DELETE | `/api/kpis/:id` | Delete KPI |

### Agents
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/agents` | List all agents |
| GET | `/api/agents/:id` | Get agent detail |
| POST | `/api/agents` | Create agent |
| PATCH | `/api/agents/:id` | Update agent |
| POST | `/api/agents/bulk-action` | Bulk actions on multiple agents |
| GET | `/api/agents/:id/traces` | List execution traces for agent |
| GET | `/api/agents/:id/evals` | Get evaluation results for agent |
| GET | `/api/agents/:id/recommendations` | Get AI recommendations for agent |
| GET | `/api/agents/:id/autonomous-actions` | Get autonomous action history |
| GET | `/api/agents/:id/versions` | List agent configuration versions |

### Deployments
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/deployments` | List all deployments/releases |
| GET | `/api/deployments/:id` | Get deployment detail |
| POST | `/api/deployments` | Create deployment |
| PATCH | `/api/deployments/:id` | Update deployment |
| POST | `/api/deployments/:id/promote` | Promote deployment to next stage |
| POST | `/api/deployments/:id/rollback` | Rollback deployment |
| POST | `/api/deployments/:id/auto-promote` | Configure auto-promotion |
| POST | `/api/deployments/:id/routing` | Configure traffic routing |
| GET | `/api/deployments/:id/readiness` | Get deployment readiness checks |
| GET | `/api/deployments/health` | Get deployment health overview |
| GET | `/api/deployments/freeze-status` | Get freeze center status |
| POST | `/api/deployments/freeze` | Create deployment freeze |

### Evaluations
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/evals` | List all evaluation suites |
| POST | `/api/evals` | Create evaluation suite |
| GET | `/api/eval-suites` | List eval suite summaries |
| GET | `/api/eval-runs` | List evaluation runs |

### Governance & Policies
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/policies` | List governance policies |
| GET | `/api/policies/:id` | Get policy detail |
| POST | `/api/policies` | Create policy |
| PATCH | `/api/policies/:id` | Update policy |
| GET | `/api/policies/:id/test-cases` | List policy test cases |
| POST | `/api/policies/:id/test-cases` | Create policy test case |
| POST | `/api/policies/:id/test-cases/:testId/run` | Execute policy test case |
| POST | `/api/policies/:id/simulate-traces` | Simulate policy against traces |

### Approvals
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/approvals` | List all approvals |
| GET | `/api/approvals/:id` | Get approval detail |
| POST | `/api/approvals` | Create approval request |
| PATCH | `/api/approvals/:id` | Update approval (approve/reject) |
| GET | `/api/approvals/:id/requirements` | Get approval requirements |
| GET | `/api/approval-queue` | Get filtered approval queue |

### Audit Trail
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/audit-trail` | Query audit events with filters |

### MCP Integration
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/mcp-servers` | List MCP servers |
| POST | `/api/mcp-servers` | Register MCP server |
| GET | `/api/mcp-servers/:id` | Get MCP server detail |
| PATCH | `/api/mcp-servers/:id` | Update MCP server |
| GET | `/api/mcp-tools` | List MCP tools |
| GET | `/api/mcp-tools/:id` | Get MCP tool detail |
| GET | `/api/mcp-resources` | List MCP resources |
| GET | `/api/mcp-resources/:id` | Get MCP resource detail |
| GET | `/api/mcp-prompts` | List MCP prompts |
| GET | `/api/mcp-prompts/:id` | Get MCP prompt detail |
| GET | `/api/mcp-apps` | List MCP apps |
| GET | `/api/mcp-apps/:id` | Get MCP app detail |

### MCP Observability
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/trace-spans` | List trace spans (OpenTelemetry) |
| POST | `/api/trace-spans` | Create trace span |
| PATCH | `/api/trace-spans/:id` | Update trace span |
| GET | `/api/mcp-transcripts` | List MCP JSON-RPC transcripts |
| POST | `/api/mcp-transcripts` | Create MCP transcript entry |
| GET | `/api/runtime/runs/:id/observability` | Get full run observability data |

### Approval Gates & Elicitations
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/tool-call-gate-check` | Check if tool call requires approval gate |
| GET | `/api/mcp-elicitations` | List MCP elicitation requests |
| POST | `/api/mcp-elicitations` | Create MCP elicitation |
| POST | `/api/mcp-elicitations/:id/url-complete` | Complete URL-mode elicitation |

### Tool Proxy
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/tool-proxy/invoke` | Invoke MCP tool through governed proxy |
| POST | `/api/tool-proxy/a2a-delegate` | Delegate to A2A remote agent |
| GET | `/api/tool-proxy/a2a-status` | Check A2A delegation status |

### Multi-Agent Orchestration
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/agent-teams` | List agent teams |
| POST | `/api/agent-teams` | Create agent team |
| GET | `/api/remote-agents` | List remote A2A agents |
| POST | `/api/remote-agents` | Register remote agent |
| GET | `/api/blueprints/:id/team-graph` | Get team blueprint graph |
| GET | `/api/team-blueprint-nodes` | List team graph nodes |
| POST | `/api/team-blueprint-nodes` | Create team graph node |
| PATCH | `/api/team-blueprint-nodes/:id` | Update team graph node |
| DELETE | `/api/team-blueprint-nodes/:id` | Delete team graph node |
| GET | `/api/team-blueprint-edges` | List team graph edges |
| POST | `/api/team-blueprint-edges` | Create team graph edge |
| PATCH | `/api/team-blueprint-edges/:id` | Update team graph edge |
| DELETE | `/api/team-blueprint-edges/:id` | Delete team graph edge |

### Marketplace
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/marketplace/registry-sources` | List marketplace registry sources |
| GET | `/api/marketplace/registry-sources/:id` | Get registry source detail |
| POST | `/api/marketplace/registry-sources` | Add registry source |
| PATCH | `/api/marketplace/registry-sources/:id` | Update registry source |
| DELETE | `/api/marketplace/registry-sources/:id` | Remove registry source |
| POST | `/api/marketplace/registry-sources/:id/sync` | Sync registry source |
| GET | `/api/marketplace/servers` | Browse marketplace servers |
| GET | `/api/marketplace/servers/:id` | Get marketplace server detail |
| POST | `/api/marketplace/servers/:id/install` | Install server from marketplace |
| GET | `/api/marketplace/install-requests` | List install requests |
| PATCH | `/api/marketplace/install-requests/:id/approve` | Approve install request |
| PATCH | `/api/marketplace/install-requests/:id/reject` | Reject install request |
| GET | `/api/marketplace/trusted-publishers` | List trusted publishers |
| POST | `/api/marketplace/trusted-publishers` | Add trusted publisher |

### Billing & Metering
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/billing/metering` | Get metering dashboard data |
| GET | `/api/invoices` | List invoices |
| GET | `/api/billing/disputes` | List billing disputes |
| POST | `/api/billing/disputes` | Create billing dispute |

### Platform & Admin
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/platform-settings` | List platform settings |
| GET | `/api/platform-settings/:key` | Get specific setting |
| PUT | `/api/platform-settings/:key` | Update platform setting |
| GET | `/api/overview` | Get overview dashboard data |

### Knowledge Bases
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/knowledge-bases` | List all knowledge bases |
| POST | `/api/knowledge-bases` | Create knowledge base |
| GET | `/api/knowledge-bases/:id` | Get knowledge base detail |
| PATCH | `/api/knowledge-bases/:id` | Update knowledge base |
| DELETE | `/api/knowledge-bases/:id` | Delete knowledge base |
| POST | `/api/knowledge-bases/:id/sources/upload` | Upload file for ingestion |
| POST | `/api/knowledge-bases/:id/sources/url` | Ingest content from URL |
| POST | `/api/knowledge-bases/:id/sources/text` | Ingest manual text entry |
| POST | `/api/knowledge-bases/:id/sources/structured` | Import structured JSON/table data |
| POST | `/api/knowledge-bases/:id/search` | Vector similarity search |
| POST | `/api/knowledge-bases/:id/query` | RAG-powered Q&A query |
| GET | `/api/agents/:agentId/knowledge-bases` | List linked KBs for an agent |

### Agent Skills
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/skills` | List all skills |
| POST | `/api/skills` | Create skill |
| GET | `/api/skills/:id` | Get skill detail |
| PATCH | `/api/skills/:id` | Update skill |
| POST | `/api/skills/:id/eval/run` | Run skill-specific evaluation |
| POST | `/api/skills/:skillId/versions` | Create skill version |
| POST | `/api/skills/:skillId/knowledge-queries` | Define RAG queries for skill |

### Context Engineering
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/context-profiles` | List context profiles |
| POST | `/api/context-profiles` | Create context profile |
| PATCH | `/api/context-profiles/:id` | Update context profile |
| POST | `/api/context-profiles/:id/optimize` | AI-powered context optimization |

### Memory Architecture
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/memory-profiles` | List memory strategy profiles |
| POST | `/api/memory-profiles` | Create memory strategy |
| POST | `/api/ai/suggest-memory-rules` | AI-generated retention rules |

### Ontology & Knowledge Graph
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/ontology/terms` | Search ontology terms |
| GET | `/api/ontology/concepts` | List graph concepts |
| POST | `/api/ontology/concepts/bulk` | Bulk import ontology concepts |
| POST | `/api/ontology/match-parameters` | Match MCP tool params to ontology |
| POST | `/api/ontology/validate-text` | Validate text against semantic constraints |
| GET | `/api/ontology/parameter-matches/:serverId` | Get MCP-to-Ontology mapping |

### RAG Pipelines
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/rag-pipelines` | List RAG pipeline configurations |
| POST | `/api/rag-pipelines` | Create RAG pipeline |
| PATCH | `/api/rag-pipelines/:id` | Update RAG pipeline |
| DELETE | `/api/rag-pipelines/:id` | Delete RAG pipeline |

### Canary Deployments
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/canary-deployments` | List canary deployments |
| POST | `/api/canary-deployments` | Create canary deployment |
| PATCH | `/api/canary-deployments/:id` | Update canary deployment |

### Multi-Agent Pipelines
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/pipelines` | List pipelines |
| POST | `/api/pipelines/:id/runs` | Execute a pipeline |
| POST | `/api/pipeline-runs/:id/advance` | Advance to next pipeline stage |
| POST | `/api/pipeline-runs/:id/simulate-stage` | AI simulation of pipeline stage |

### Agent API Gateway
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/gateway/v1/invoke/:agentId` | Invoke agent via external API |
| GET | `/api/gateway/v1/agents/:agentId` | Public agent metadata discovery |

### AI Endpoints
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/ai/chat` | Conversational AI for Outcome Builder |
| POST | `/api/ai/generate-outcome-proposal` | SSE-streaming endpoint that generates a full outcome proposal from a conversation history |
| POST | `/api/ai/enhance-outcome` | AI enhancement of an existing outcome proposal with additional context |
| POST | `/api/ai/enhance-agent` | AI agent enhancement suggestions |
| POST | `/api/ai/generate-test-cases` | AI-generated evaluation test cases |
| POST | `/api/ai/generate-golden-dataset` | AI-generated golden evaluation datasets |
| POST | `/api/ai/generate-golden-test-cases` | AI-generated golden test cases |
| POST | `/api/ai/enhance-golden-test-case` | AI enhancement of golden test cases |
| POST | `/api/ai/suggest-memory-rules` | AI-generated memory retention rules |
| POST | `/api/agents/bulk-create-from-plan` | Create multiple agents from natural language plan |

### Mock MCP & Demo
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/mock-mcp/seed-demo` | Seed platform with demo data |
| GET | `/api/mock/fitch-ffiec-data/call-report-schedules` | FFIEC call report schedules for a bank |
| GET | `/api/mock/fitch-ffiec-data/npa-schedule` | Non-performing asset schedule |
| GET | `/api/mock/fitch-ffiec-data/charge-off-schedule` | Charge-off and recovery schedule |
| GET | `/api/mock/fitch-ffiec-data/capital-adequacy` | Capital adequacy ratios |
| GET | `/api/mock/fitch-ffiec-data/peer-cohort-ratios` | Peer cohort median ratios |
| GET | `/api/mock/fitch-analytics/ratio-trends` | Historical ratio trend data |
| GET | `/api/mock/fitch-analytics/threshold-breaches` | Ratio threshold breach analysis |
| GET | `/api/mock/fitch-analytics/svb-backtest` | SVB historical backtest timeline |
| GET | `/api/mock/fitch-nlp-engine/transcript-sentiment` | Earnings call transcript sentiment |
| GET | `/api/mock/fitch-nlp-engine/filing-language-changes` | 10-K/10-Q filing language shift analysis |
| GET | `/api/mock/fitch-nlp-engine/news-signals` | News signal classification and severity |
| GET | `/api/mock/fitch-nlp-engine/news-volume-trend` | News volume sigma-alert trend |
| GET | `/api/mock/fitch-report-engine/report-template` | AQEWS report template structure |
| GET | `/api/mock/fitch-report-engine/analyst-notes` | Analyst notes for a bank |
| GET | `/api/mock/fitch-report-engine/rating-history` | Rating history for a bank |
| POST | `/demo-api/blackbook/reset` | Reset Black Book demo to pre-run state |
| GET | `/demo-api/blackbook/stream` | SSE stream for Black Book live agent execution |
| POST | `/demo-api/fitch/reset` | Reset Fitch demo to pre-run state |
| GET | `/demo-api/fitch/stream` | SSE stream for Fitch pipeline live execution |

---

## 40. Data Model

The platform uses a comprehensive PostgreSQL schema managed by Drizzle ORM. Key entities:

### Core Entities

| Entity | Description |
|---|---|
| **Outcomes** | Business outcome contracts with pricing, SLAs, and status |
| **KPIs** | Measurable key performance indicators linked to outcomes |
| **Agents** | AI agent configurations with model, tools, and governance settings |
| **Blueprints** | Versioned agent configuration snapshots |
| **EvalSuites** | Evaluation test suites with scorers and thresholds |
| **Releases** | Deployment records with environment, strategy, and status |
| **Skills** | Composable, versioned skill units with industry tags and MCP dependencies |
| **KnowledgeBases** | Vector-embedded document collections for RAG grounding |
| **KnowledgeDocuments** | Individual documents within knowledge bases with chunks and embeddings |
| **ContextProfiles** | Context engineering configurations with source priorities and token budgets |
| **MemoryProfiles** | Memory architecture strategies with tiered retention policies |
| **RagPipelines** | RAG pipeline configurations with retrieval strategies |
| **OntologyConcepts** | Industry knowledge graph concepts with relationships |
| **CanaryDeployments** | Graduated rollout configurations with traffic stages and promotion rules |
| **Pipelines** | Multi-agent pipeline definitions with stage configurations |
| **PipelineRuns** | Pipeline execution records with stage-by-stage results |

### Governance Entities

| Entity | Description |
|---|---|
| **Policies** | Governance rules with conditions and enforcement actions |
| **PolicyExceptions** | Approved exceptions to policy rules |
| **PolicyTestCases** | Test cases for validating policy behavior |
| **ComplianceReports** | Generated compliance framework reports |
| **AuditEvents** | Immutable hash-chained audit log entries |
| **Approvals** | Expert validation requests with risk scores |

### Operations Entities

| Entity | Description |
|---|---|
| **RunTraces** | Agent execution traces with timing and cost |
| **Incidents** | Operational incidents with severity and status |
| **Patches** | AI-proposed configuration changes |
| **Experiments** | A/B testing experiments |
| **DriftDetections** | Detected behavioral drift records |

### MCP Entities

| Entity | Description |
|---|---|
| **McpServers** | Registered MCP server configurations |
| **McpTools** | Synced tool definitions from MCP servers |
| **McpResources** | Knowledge connectors via MCP resource primitives |
| **McpPrompts** | Imported prompt templates from MCP servers |
| **McpApps** | Interactive HTML apps served by MCP servers |

### Multi-Agent Entities

| Entity | Description |
|---|---|
| **AgentTeams** | Team compositions with orchestration config |
| **AgentTeamMembers** | Team membership with role assignments |
| **RemoteAgents** | A2A-connected external agent records |

### Billing Entities

| Entity | Description |
|---|---|
| **Invoices** | Generated invoices with line items |
| **BillingEvents** | Outcome delivery events processed through metering pipeline |
| **BillingDisputes** | Billing dispute records |

---

## 41. Security & Compliance

### Authentication & Authorization

- Role-based access control with seven defined personas.
- Route-level access restrictions based on active role.
- Permission-gated UI components that show/hide based on role capabilities.

### Data Protection

- **Redaction Profiles**: Three-tier data redaction system (R0/R1/R2) applied across traces, audit events, and API responses based on user role and sensitivity configuration.
- **Secret Management**: Environment variables and API keys stored securely, never exposed in frontend code or logs.
- **Audit Logging**: Every platform action logged with hash-chain integrity for tamper detection.

### MCP Security

- **Server Trust Tiers**: Five-level trust hierarchy for MCP servers (untrusted through privileged).
- **Tool Governance**: Risk-classified tools with approval flows for high-risk enablement.
- **Resource Sensitivity**: Four-level sensitivity classification (public/internal/confidential/restricted) with appropriate approval gates.
- **Sandboxed Execution**: MCP Apps execute in sandboxed iframes with Content Security Policy enforcement.

### Compliance Frameworks

- SOC 2 control mapping and coverage tracking.
- EU AI Act compliance indicators and gap analysis.
- GDPR compliance checks for data handling policies.
- Exportable compliance reports for external auditors.

### Tool Proxy Security

- Unified proxy for MCP tool calls and A2A delegations.
- Allowlist/blocklist enforcement.
- Per-tool and per-agent rate limiting.
- Shadow dry-run mode for testing tool policies without side effects.
- Redacted audit logging for sensitive operations.

### Immutable Audit Trail

- SHA-256 hash chain linking consecutive audit events.
- Tamper detection through hash verification.
- Full event provenance (who, what, when, where).
- MCP-specific action type filtering for granular investigation.

---

## 42. Demo Environments

Dedicated interactive demonstration environments showcasing specific ALMP capabilities with live Anthropic Claude agent execution, real-time SSE streaming, and pre-run state management. All demo agents deployed in these environments are automatically provisioned with Atlas Agent Runtime (AAR) governance sidecars (see Section 43); their AAR status is visible on the Runtime (AAR) tab of each agent's cockpit.

### Hearst / Black Book Demo (`/demo/blackbook`)

A 5-screen interactive walkthrough of ALMP's media & publishing use case for the Hearst Black Book client.

**Demo Structure**

| Screen | Description |
|---|---|
| S1 — Overview | Platform context, outcome contracts, active agents summary |
| S2 — Outcome Discovery | Live outcome proposal generation via AI chat |
| S3 — Agent Orchestration | Multi-agent pipeline setup with tool assignments |
| S4 — Live Agent Run | Real-time SSE feed of 4 Claude agents executing in sequence |
| S5 — Business Outcomes | KPI progress, ROI delivery, and financial summary |

**Live Agent Execution (Screen 4)**
- Four Anthropic Claude agents run in sequence via the ALMP agent runtime:
  - **BB-AGT-001** (claude-opus-4-5): Content Intelligence Agent — analyzes luxury market content signals
  - **BB-AGT-002** (claude-opus-4-5): Brand Alignment Agent — validates brand voice and premium consistency
  - **BB-AGT-003** (claude-opus-4-5): Revenue Attribution Agent — links content to revenue metrics
  - **BB-AGT-004** (claude-opus-4-5): Executive Intelligence Agent — synthesizes strategic insights
- Progress is streamed via `GET /demo-api/blackbook/stream` (SSE).
- Each agent can show pre-run placeholder results (fast path) or trigger real Claude execution.
- `POST /demo-api/blackbook/reset` returns the demo to its initial pre-run state.

**Technical Notes**
- Live execution uses `runAgentOnce(deploymentId, promptOverride, maxIterationsOverride, onProgress)`.
- Runtime events fire on the `agent_execution` SSE event name.
- Brand color: `#E8640A` (Black Book orange).

---

### Fitch Asset Quality Analyzer Demo (`/demo/fitch`)

A 6-screen demo of ALMP's financial services / banking supervision use case for Fitch Ratings.

**Demo Structure**

| Screen | Description |
|---|---|
| S1 — Overview | Platform context, AQEWS pipeline summary, 10-bank peer cohort |
| S2 — FFIEC Data Ingestion | Live ingest of call report schedules from the FFIEC mock server |
| S3 — Ratio Engine | Financial ratio computation, peer benchmarking, threshold breach detection |
| S4 — NLP & Risk Scoring | Transcript sentiment, news signals, composite risk score computation |
| S5 — SVB Backtest | Historical SVB backtest: 8-quarter composite score timeline with first-alert and FDIC-seizure markers |
| S6 — Report Assembly | AQEWS report generation: executive summary, sector heat map, banker assessment package |

**Pipeline Agents**

| Agent | Role |
|---|---|
| FFIEC Data Ingestor | Fetches RC-N/RC-C/RI-B/RC-R schedules for 10 banks from the FFIEC mock server (44 tool calls) |
| Financial Ratio Engine | Computes NPL, NCO, CET1, and leverage ratios; runs peer benchmarking and breach detection |
| Transcript & Filing Analyst | Analyzes earnings call sentiment and 10-K/10-Q language shift |
| News Signal Processor | Classifies news by severity (routine/emerging/material/crisis) and detects volume sigma alerts |
| Composite Risk Scorer | Aggregates all signals into a weighted composite score with watch-list and ratings-action flags |
| Assessment Report Generator | Assembles the AQEWS AQEWS-QUARTERLY-V3 report and SVB backtest comparison package |

**Server-Side Fallbacks**
All 6 agents have server-side fallbacks that activate when the LLM omits required structured output fields, ensuring the demo never shows blank screens:
- `ratio_engine` — recomputes `ratioTable` from mock analytics data
- `transcript_analyst` — recomputes `sentimentScores` from mock NLP data
- `news_processor` — recomputes `newsSeverity` from mock news signals
- `risk_scorer` — recomputes composite scores from upstream agent outputs
- `report_generator` — recomputes `svbComparison` and `assessmentPackage` from mock backtest and report template data

**Mock MCP Servers**
The demo uses four dedicated mock REST servers (see Section 37 for full endpoint list): FFIEC Data, Fitch Analytics, Fitch NLP Engine, and Fitch Report Engine.

`POST /demo-api/fitch/reset` resets the pipeline to its initial pre-run state.
`GET /demo-api/fitch/stream` streams SSE progress events as agents execute.

---

## 43. Atlas Agent Runtime (AAR) — Governance Sidecar

The **Atlas Agent Runtime (AAR)** is a lightweight, platform-agnostic governance sidecar deployed alongside every ALMP-managed agent. It enforces Atlas policies, intercepts MCP tool calls, captures provenance, emits telemetry, and reports health — all without requiring changes to the host agent binary.

### Overview

AAR is **agent-scoped**: one AAR config row exists per deployed agent, automatically created or refreshed on each deployment. It is **platform-agnostic**: a single configuration manifest (the AAR Package) is rendered per target platform (AWS Bedrock, GCP Vertex AI, Azure AI Foundry, Kubernetes, on-prem, or any custom environment).

### AAR Modules (7)

| Module | Responsibility |
|---|---|
| **PolicyEngine** | Evaluate policies against action requests. Return BLOCK / ALERT / LOG. |
| **MCPProxy** | Intercept, authorize, rate-limit, and forward MCP tool calls. Behavior fingerprinting. |
| **ProvenanceStore** | Capture, hash-chain, queue, and stream provenance events to Atlas Telemetry Collector. |
| **TelemetryEmitter** | Emit structured metrics, traces, and logs in OpenTelemetry (OTLP) format. |
| **AutonomyEnforcer** | Enforce current autonomy level. Route high-risk actions for approval without Control Plane round-trip. |
| **CredentialManager** | Manage X.509 certificates and API keys. Rotate on schedule. Inject credentials into MCP calls. |
| **HealthMonitor** | Self-health checks, MCP server health probes, behavior fingerprint drift detection. |

### Runtime Footprint

| Metric | Value |
|---|---|
| Container image size | < 50 MB |
| Memory | 128–256 MB |
| CPU overhead | < 5% per core |
| Policy eval latency | < 5 ms per eval |

### AAR API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/agents/:agentId/aar` | Retrieve AAR config + 7-module health for a specific agent |
| `PATCH` | `/api/agents/:agentId/aar` | Update `targetPlatform` (free-text; suggestions provided) |
| `GET` | `/api/agents/:agentId/aar/package` | Download the rendered AAR Package JSON manifest |
| `GET` | `/api/aar/configs` | Bulk fetch all AAR configs keyed by `agentId` |

### Policy Bundle

Each agent's AAR config includes a `policyBundleVersion` (e.g. `v1.7.57`) and a `lastSyncedAt` timestamp that is refreshed on every deployment. Bundle distribution is push-based with a 30-second grace period for non-critical rules (zero grace for critical rules).

### Target Platform & Deployment Hints

The `targetPlatform` field is free-text (supports arbitrary user-supplied values) with suggestions for common environments:

- `atlas-native` — Managed ALMP runtime (default)
- `aws-bedrock` — ECS sidecar / Lambda layer; AWS Secrets Manager; CloudWatch + OTLP
- `gcp-vertex` — GKE sidecar / Cloud Run sidecar; GCP Secret Manager; Cloud Monitoring + OTLP
- `azure-ai-foundry` — ACI sidecar / AKS DaemonSet; Azure Key Vault; Azure Monitor + OTLP
- `kubernetes` — Pod sidecar container; Kubernetes Secrets or external vault; Prometheus + OTLP
- `on-prem` — Docker sidecar or systemd service; HashiCorp Vault; Grafana / Prometheus

### Frontend Integration

- **Agent Detail Page → Runtime (AAR) tab**: 7-module health grid, policy bundle panel, target platform combobox (free-text + autocomplete suggestions), download package button, health summary strip.
- **Deployments Page**: Every deployment row shows a blue **AAR** badge with a tooltip displaying the bundle version (`policyBundleVersion`), platform (`targetPlatform`), and last sync date (`lastSyncedAt`). Data is fetched once via `GET /api/aar/configs` and shared across all environment panels.

### Auto-Generation & Backfill

- `ensureAarConfig(agentId)` is called (fire-and-forget, non-blocking) after every new deployment is created. If a config already exists, it refreshes `lastSyncedAt`. If no config exists, it creates one with a deterministic `policyBundleVersion` seeded from the agent ID.
- `backfillAarConfigs()` runs at startup and creates AAR configs for all currently-deployed agents that do not yet have one.

---

*This documentation reflects the current state of the ALMP platform as of April 2026. Features and capabilities are subject to ongoing development and enhancement.*
