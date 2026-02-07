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
4. **Deployments** - Release orchestration across staging/pilot/prod
5. **Monitor** - SLA dashboard, live run stream, drift detection
6. **Governance** - Policy library (policy-as-code), audit trail
7. **Approvals** - Expert validation queue with approve/reject
8. **Billing** - Outcome-based metering and invoices

## Data Model
- outcome_contracts, kpi_definitions
- agents, agent_versions
- deployments, run_traces
- eval_suites, policies
- approvals, audit_events
- invoices, outcome_events

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
4. **Run Trace** (`/traces/:id`) — 7 sections: Execution Summary, Prompt Inputs, Tool Calls, Retrieved Documents, Decisions, Policy Checks, Cost & Latency Breakdown. Navigable from agent detail trace rows.
5. **Eval Suite** (`/evals/:id`) — 4 tabs: Test Cases (table with input/output/tags/weight), Run History (pass rates, latency, cost), Scoring Config (threshold, schedule, weights), Agent Bindings (linked agent info)

## Agent Design Wizard (`/agents/wizard`)
5-step flow for creating agents:
1. Template Library (6 pre-built templates) + AI Assistant panel (GPT-4.1 streaming chat)
2. Basic Info (name, description, owner, risk tier, autonomy mode, outcome binding)
3. Model & Tools (provider, model name, tools config, permissions)
4. Memory & Workflow (RAG config, workflow graph nodes)
5. Review & Create (summary + POST /api/agents)

AI assistant endpoint: POST /api/ai/agent-assist (SSE streaming, uses Replit AI Integrations OpenAI)

## Data Model
- outcome_contracts, kpi_definitions
- agents, agent_versions
- deployments, run_traces
- eval_suites, eval_test_cases, eval_runs
- policies, approvals, audit_events
- invoices, outcome_events
- agent_templates

## Recent Changes
- Agent Design Wizard: 5-step wizard at /agents/wizard with template library (6 templates), AI assistant (GPT-4.1 streaming), and full agent config form
- Eval Suite Artifact: detail page at /evals/:id with test cases, run history, scoring config, agent bindings; eval_test_cases and eval_runs tables with seed data
- agent_templates table with 6 pre-built templates (Support Triage, Document Extractor, Lead Scorer, Content Moderator, KB Updater, Compliance Monitor)
- Run Trace forensics: enriched run_traces schema with modelId, promptInputs, toolCalls, retrievedDocs, decisions, policyChecks, tokenUsage. Built trace detail page with 7 forensics sections. 24 seeded traces with realistic data.
- Release artifact: versioned deployments with canary configs, rollback triggers, promotion chains (staging→pilot→prod), signature hashes
- Outcome Contract artifact with inline editing and 6 tabs
- Agent Blueprint artifact with 7 structured sections
- Initial MVP build with all 8 modules
- Dark/light mode support
- Seed data with realistic agents, outcomes, KPIs
