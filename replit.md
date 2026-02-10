# ALMP - Agent Lifecycle Management Platform

## Overview
ALMP is an Agent Lifecycle Management Platform designed for managing AI agents with an 80% autonomous execution and 20% expert validation model. The platform aims to provide outcome-driven billing, where customers pay for measurable results. It offers comprehensive tools for agent creation, deployment, monitoring, and governance, focusing on delivering business value and enabling efficient AI operations. Its core ambition is to automate and optimize the lifecycle of AI agents, ensuring measurable outcomes and robust oversight.

## User Preferences
I prefer that you ask me before making any major changes to the codebase. When suggesting code, please provide clear explanations for the choices made. I value an iterative development approach, where we can discuss and refine solutions progressively.

## System Architecture
The platform is built with a modern web stack: React, Vite, Tailwind CSS, shadcn/ui, and wouter for the frontend; Express.js for the backend REST API; and PostgreSQL with Drizzle ORM for the database.

**UI/UX Design Principles**:
- **Outcome-first navigation**: Prioritizes KPI delivery status.
- **Evidence-by-default**: Approvals include configuration differences, blast radius analysis, and evaluation proof.
- **Autonomy with guardrails**: Policies are checked before actions, with expert approval for violations.
- **Time travel**: Agent timeline aggregates version changes, audit events, and recommendations with diff visualization.

**Core Features**:
- **Overview Dashboard**: Platform health, KPI progress, agent status.
- **Outcomes**: Manages outcome contracts, KPIs, SLAs, and pricing.
- **Agents**: Agent Registry for managing and monitoring agents, including detailed cockpit views, lifecycle management (retirement and replacement), and a design wizard.
- **Blueprint Studio**: Visual editor for creating, versioning, and compiling agent blueprints with static checks and approval flows.
- **Templates**: Library of agent templates.
- **Deployments**: Release Orchestrator with environment management (staging/pilot/prod), rollout strategies (shadow/canary/direct), auto-incident generation. Environment board shows per-deployment cards with active version, canary %, shadow on/off indicator, rollback triggers armed status, and last approval link. Create Release wizard (4-step dialog): Step 1 (agent/version/target env/strategy/shadow toggle + Deploy as Source Package option), Step 2 (rollback safeguards with eval regression, policy violation, KPI drop triggers), Step 3 (autopromote rules — conditional canary promotion e.g. "If eval suite A passes and no violations in 2h, raise canary to 25%"), Step 4 (review/submit with auto-generated approval requirement panel). Deploy as Source Package mode generates source code for CI/CD deployment (hides rollback/autopromote in review). Freeze Center for deployment freeze management.
- **Monitor**: Outcome SLA Dashboard, live runs, drift detection, and agent health monitoring.
- **Governance**: Certified Agent Compliance Layer with policy management, enforcement, audit trails, compliance reports, policy exceptions, and tool access controls.
- **Optimization (Patch Center)**: Autonomous optimization and self-healing with AI-proposed changes, experiment management (A/B testing), and auto-remediation.
- **Approvals**: Expert validation queue for various approval types.
- **Billing**: Outcome-based metering and invoicing.
- **Evaluation Evidence System**: Robust evidence for agent performance and risks.
- **Business Outcome Discovery**: Conversational AI for defining goals and drafting outcome contracts.
- **Role-based Access**: Six switchable personas for tailored access and actions.
- **Global App Shell**: Provides environment selection, global search, command palette, notification center, role switcher, and theme toggle.

**Technical Implementations**:
- **Eval Studio**: Comprehensive evaluation management, including test case creation, run history, scorers, thresholds, and regression analysis.
- **Shadow Replay**: Replaying production traces against candidate versions for comparison and validation.
- **Autonomy Hooks**: Automated actions like expanding eval suites on drift or quarantining agents on confidence drops.
- **Code Generation / Export**: Dual-mode agent deployment — config-driven runtime execution (existing) + code generation/export for standalone deployment using Ralph Loop pattern. Export Wizard is a 4-step dialog: Step 1 (Export Type — "Managed Runtime Artifact" default vs "Source Export" for CI/CD and portability), Step 2 (Configure — Template & Framework selector with 7 options: Generic Tool-Calling Runtime (recommended), LangGraph Graph App, CrewAI Project Scaffold, Microsoft Foundry Agent, AWS Bedrock Agent, N8N Workflow, GCP Vertex AI Agent; language TypeScript/Python, LLM provider OpenAI/Anthropic Claude, Ralph Loop config with max iterations + completion promise; dynamic source file list per framework), Step 3 (Tool Adapter Resolution — shows every blueprint tool reference with status: "Built-in adapter included" / "Customer adapter required" / "Stub will be generated"; actions: "Generate Stub" creates placeholder code, "Attach Existing Adapter" pulls from ALMP tool registry, "Use Stub Instead" switches a built-in to stub; summary badges show counts per status; stub info notice warns about placeholder implementations), Step 4 (Preview — file tabs with generated source code, download). Three entry points: (1) Blueprint → Export as Code button; (2) Implementation Graph → Generate Export Package button; (3) Summary tab → Export / Generate Code button. Implementation Graph on Blueprint tab shows declarative vs code-required components before export. Backend: POST /api/agents/:id/export-code (accepts framework param, toolAdapters record), POST /api/tool-connectors/:id/generate-adapter.
- **AI Endpoints**: Dedicated API endpoints for conversational design, template matching, outcome discovery, agent/replacement proposals, and AI-generated test cases.
- **Self-Healing Loop**: Incident → AutoPatch → Approval → Deployment → Incident closure. POST /api/incidents creates persistent incidents, auto-generates AI patches with safety checks, auto-creates approval records. When approved, patches auto-deploy via canary rollout linked to incident. Full rollout auto-closes incident with remediation record. Rollback (manual or canary gate failure) auto-reopens incident. Incident statuses: open → investigating → patching → deploying → resolved/needs_review.
- **Deployment Sequence**: staging → shadow → canary → prod with auto-computed approvals, shadow replay evidence, canary monitor (30s interval) with auto-promote/auto-rollback.
- **Billing Metering Pipeline**: Runtime → Metering Service → DB → Billing Service → Finance User. POST /api/outcome-events ingests events with exclusion rules (inactive outcome, volume cap), deduplication (same traceId+outcomeId within 5min), fraud checks (volume spike, value anomaly via 3-sigma), SHA-256 signed hash for tamper evidence, and billable/excludeReason determination. POST /api/billing/generate-invoice aggregates unbilled billable events by outcome+period, supports PER_OUTCOME_EVENT/TIERED/MONTHLY_FIXED pricing, creates invoice with line items, links events. GET /api/outcome-events/:id/trace provides invoice → event → trace drill-down. Audit events track ingestion, invoice generation, and finance notifications.
- **Immutable Audit Log**: Hash-chained audit events with SHA-256(prevHash + canonical_json(event)), sequenceNum, previousHash, eventHash. GET /api/audit-events/verify-chain walks the chain to detect tampering, gaps, and duplicates.
- **Redaction Profiles (R0/R1/R2)**: R0 (full access) for admin/security, R1 (PII/PHI/PCI redacted) for engineers/ops/validators, R2 (highly redacted incl. financial+sensitive payloads) for viewers/finance. Applied to traces, audit events. GET /api/redaction-profiles shows current level.
- **Tool Proxy Control Point**: All tool calls go through proxy enforcing allowlists, blocklists, per-agent sliding-window rate limiting (100/min), retry with exponential backoff, shadow dry-run mode for shadow deployments, consistent redacted audit logging. GET /api/tool-proxy/status shows proxy state.
- **Data Model**: Comprehensive schema for all platform entities including incidents, patches, deployments with full traceability links (incidentId, patchId on deployments).

## External Dependencies
- **LLM Providers**: For AI capabilities (e.g., GPT-4.1).
- **PostgreSQL**: Primary database.
- **Express.js**: Backend framework.
- **React**: Frontend library.
- **Vite**: Frontend build tool.
- **Tailwind CSS**: Styling framework.
- **shadcn/ui**: UI component library.
- **wouter**: Routing library.
- **TanStack React Query**: Frontend data management.
- **Drizzle ORM**: Database ORM.