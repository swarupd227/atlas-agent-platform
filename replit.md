# ALMP - Agent Lifecycle Management Platform

## Overview
A comprehensive platform for managing AI agent lifecycles with an 80% autonomous execution + 20% expert validation model. Outcome-driven billing where customers pay for measurable results.

## Architecture
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui + wouter routing
- **Backend**: Express.js REST API
- **Database**: PostgreSQL with Drizzle ORM
- **State**: TanStack React Query

## Key Modules
1. **Overview Dashboard** - Platform health, KPI progress, agent status
2. **Outcomes** - Outcome contracts with KPIs, SLAs, pricing
3. **Agents** - Agent registry with detail cockpit (traces, evals, blueprint)
4. **Templates** - Industry-wide agent template library with browsing, filtering, search
5. **Deployments** - Release orchestration across staging/pilot/prod
6. **Monitor** - SLA dashboard, live run stream, drift detection
7. **Governance** - Policy library (policy-as-code), audit trail
8. **Approvals** - Expert validation queue with approve/reject
9. **Billing** - Outcome-based metering and invoices

## Project Structure
- `shared/schema.ts` - All Drizzle schemas and Zod types
- `server/db.ts` - Database connection
- `server/storage.ts` - Storage layer (IStorage interface)
- `server/routes.ts` - REST API endpoints
- `server/seed.ts` - Seed data
- `client/src/pages/` - Page components
- `client/src/components/` - Shared UI components

## Artifacts (Detail Pages)
1. **Outcome Contract** (`/outcomes/:id`) — 6 tabs: KPI Definitions, SLA Configuration, Attribution Rules, Pricing & Billing, Risk Tolerance, Approval Gates
2. **Agent Blueprint** (`/agents/:id`) — 7 sections: Model Config, Workflow Graph, Tools & Permissions, Memory & RAG, Policy Bindings, Eval Bindings, Rollback Plan
3. **Release** (`/deployments/:id`) — 4 sections: Overview, Canary Rules, Rollback Triggers, Promotion History. Actions: Promote (staging→pilot→prod), Rollback
4. **Run Trace** (`/traces/:id`) — 7 sections: Execution Summary, Prompt Inputs, Tool Calls, Retrieved Documents, Decisions, Policy Checks, Cost & Latency Breakdown
5. **Eval Suite** (`/evals/:id`) — 7 tabs: Test Cases, Run History, Scoring Config, Agent Bindings, Red-Team Coverage, Regressions, Outcome Correlation

## Agent Templates (`/templates`)
Standalone browsable page with:
- Grid of industry-wide agent templates with search and category/industry filters
- Click-to-select detail panel showing tools, workflow, permissions, policy bindings
- "Use This Template" action navigates to wizard with template pre-filled
- Templates have: category, industry, tags, complexity, model config, tools, permissions, workflow, policies, evals, rollback plan

## Agent Design Wizard (`/agents/wizard`)
5-step flow for creating agents:
1. **Basic Info** - Name, description, owner, risk tier, autonomy mode, outcome binding
2. **Choose Path** - Three creation approaches:
   - **Manual Configuration** - Full control, proceed to model/tools setup
   - **Use Template** - AI analyzes basic info and suggests best-matching templates with match scores and reasoning; user can pick AI suggestion or browse all templates manually
   - **Conversational AI** - Chat with GPT-4.1 to design agent via natural language
3. **Model & Tools** - Provider, model name, tools config, permissions (pre-filled if template selected)
4. **Memory & Workflow** - RAG config, workflow graph nodes
5. **Review & Create** - Summary + POST /api/agents

Entry from Templates page: `/agents/wizard?templateId={id}` pre-fills all fields including basic info from template.

## AI Endpoints
- `POST /api/ai/agent-assist` - Conversational design assistant (SSE streaming, GPT-4.1)
- `POST /api/ai/match-templates` - Template matching: analyzes basic info + outcome vs templates, returns ranked matches with scores and reasoning

## Data Model
- outcome_contracts, kpi_definitions
- agents, agent_versions
- deployments, run_traces
- eval_suites, eval_test_cases, eval_runs
- policies, approvals, audit_events
- invoices, outcome_events
- agent_templates (with industry, tags fields)

## Evaluation Evidence System
- **Drift Detection Engine**: `GET /api/drift-signals` computes real-time drift by comparing latest eval run pass rates/latency against rolling 5-run baseline. Monitor page Drift tab shows severity-coded signals (critical/high/medium/low)
- **Red-Team Coverage**: Eval detail "Red-Team Coverage" tab maps test cases to 6 adversarial categories (prompt injection, jailbreak, PII extraction, bias probing, hallucination, tool misuse) via tag matching
- **Regression Detection**: Eval detail "Regressions" tab auto-compares consecutive eval runs, flags pass-rate drops >2% as Minor/Moderate/Severe
- **Outcome Correlation**: Eval detail "Outcome Correlation" tab computes Pearson r between eval pass rates and outcome KPI attainment with bar chart trends and interpretation
- **Evidence Packaging**: Approvals page bundles eval results, drift status, and risk assessment in expandable evidence cards for each approval request
- Storage: `getEvalRunsBySuite(suiteId)` method in IStorage interface

## Personas / Roles
6 switchable personas via header dropdown (localStorage-persisted, no auth):
- **Outcome Owner** (business): Overview, Outcomes, Billing, Approvals
- **Agent Engineer** (builder, default): Overview, Agents, Templates, Improvements
- **Ops / SRE** (operations): Overview, Deployments, Monitor, Agents
- **Compliance / Security**: Overview, Governance, Approvals
- **Expert Validator** (20% human): Overview, Approvals, Agents, Deployments
- **Finance**: Overview, Billing, Outcomes

Components: `role-provider.tsx` (context + hook), `role-switcher.tsx` (header dropdown), sidebar filters nav by role

## UX Design Principles (Implemented)
1. **Outcome-first navigation**: Every screen answers "Are we delivering the KPI safely?" via `OutcomeKpiStrip` component on Agents, Deployments, Monitor, Improvements. Full mode shows KPI mini-cards; compact mode shows attainment + at-risk count.
2. **Evidence-by-default**: Approvals show config diffs (field-level old→new, version badge, category tags) + blast radius (affected users, runs/day, revenue exposure, environment, downstream agents, rollback time) alongside eval proof.
3. **Autonomy with guardrails**: POST /api/policy-check validates against agent risk tier, environment, autonomy mode. Apply/Remediate buttons pre-check policies; blocked actions show violation dialog with "Request Expert Approval" escalation to approvals queue.
4. **Time travel**: GET /api/agents/:id/timeline aggregates version changes, audit events, applied recommendations. Agent detail "Timeline" tab with category filters, diff visualization, "Last Known Good State" marker, "Changes Since Last Good" summary.

## Recent Changes
- 80/20 Model Gaps Closed:
  - Improvements page: Auto-generated recommendations from eval failures, drift signals, cost analysis, traces. Categories: retrain, model_swap, config_change, workflow_optimization, policy_update. Generate endpoint computes new recs from agent data. Cost source filter, agent name links, type badges, estimated savings stat.
  - Automated Remediation: Monitor drift signals now show contextual fix suggestions (rollback, retrain, adjust threshold) with one-click "Remediate" button that creates improvement recommendations.
  - Outcome Certification: New `outcome_certification` approval type in Approvals page with KPI attainment progress bars, overall attainment badge, billing impact, certification recommendation. "Certify" button instead of "Approve".
  - Cost-Performance Tuning: /api/recommendations/generate computes cost optimization, success rate, and latency recommendations from agent data. Surfaced in Improvements page with "cost" source filter.
- Role-based persona system: 6 roles with header switcher dropdown, sidebar navigation filtering per role, sidebar footer showing active role
- Overview Dashboard: Transformed into "Lifecycle Command Center" with ROI summary (cost/revenue/ROI%/cost-per-run), portfolio health heatmap, urgent signals panel (drift + approvals), outcome attainment progress
- Governance Page: Enhanced into compliance center with policy violations count, approval compliance rate, enforcement stats tab, audit timeline with filters (object/action/date), CSV export
- Evaluation Evidence system: drift detection, red-team coverage, regression detection, outcome correlation, evidence packaging
- Agent Templates standalone page: /templates with browsable grid, category/industry filters, search, detail panel, and "Use This Template" action
- Redesigned Agent Wizard: Step 1 = Basic Info first, Step 2 = Choose Path (Manual/Template/AI), AI template matching with scored suggestions
- AI Template Matching: POST /api/ai/match-templates endpoint uses GPT-4.1 to analyze requirements and rank templates
- agent_templates schema enriched with industry and tags fields
- Eval Suite Artifact: detail page at /evals/:id with 7 tabs including red-team, regressions, outcome correlation
- Run Trace forensics with 7 sections, Release artifact with promote/rollback
- Outcome Contract artifact with inline editing and 6 tabs
- Agent Blueprint artifact with 7 structured sections
- Dark/light mode support
