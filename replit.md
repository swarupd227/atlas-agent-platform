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

## Recent Changes
- Initial MVP build with all 8 modules
- Dark/light mode support
- Seed data with realistic agents, outcomes, KPIs
