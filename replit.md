# ALMP - Agent Lifecycle Management Platform

## Overview
ALMP is an Agent Lifecycle Management Platform designed for managing AI agents with an 80% autonomous execution and 20% expert validation model. The platform aims to provide outcome-driven billing, where customers pay for measurable results. It offers comprehensive tools for agent creation, deployment, monitoring, and governance, focusing on delivering business value and enabling efficient AI operations.

## User Preferences
I prefer that you ask me before making any major changes to the codebase. When suggesting code, please provide clear explanations for the choices made. I value an iterative development approach, where we can discuss and refine solutions progressively.

## System Architecture
The platform is built with a modern web stack:
- **Frontend**: React, Vite, Tailwind CSS, shadcn/ui, and wouter for routing.
- **Backend**: Express.js REST API.
- **Database**: PostgreSQL with Drizzle ORM.
- **State Management**: TanStack React Query.

**UI/UX Design Principles**:
- **Outcome-first navigation**: Every screen prioritizes showing KPI delivery status via an `OutcomeKpiStrip` component.
- **Evidence-by-default**: Approvals show configuration differences, blast radius analysis, and evaluation proof.
- **Autonomy with guardrails**: Policies are checked before actions, with options to request expert approval for violations.
- **Time travel**: An agent timeline aggregates version changes, audit events, and recommendations with diff visualization.

**Key Modules & Features**:
- **Overview Dashboard**: Provides platform health, KPI progress, and agent status.
- **Outcomes**: Manages outcome contracts, KPIs, SLAs, and pricing with detailed artifact pages covering definition, evidence, commercials, risk, audit, and agent proposals.
- **Agents**: Agent Registry (System of Record) with enhanced table columns (agent name+owner, linked outcome, prod version, health score with sub-metric popover breakdown, autonomy mode, last incident/approval gate, monthly cost+billed outcome value). Multi-faceted filter bar (outcome, environment, risk tier, tool access class, compliance tags, model provider). Bulk actions (run regression eval, freeze deployments, rotate secrets, export audit bundle) with row selection and confirmation dialogs. Agent cockpit with traces and evaluations, blueprint editor, and Agent Design Wizard (manual, template, or conversational AI design).
- **Templates**: A library of industry-wide agent templates with browsing, filtering, search, and "Use This Template" functionality.
- **Deployments**: Facilitates release orchestration across staging, pilot, and production environments with promote/rollback actions and detailed release artifacts.
- **Monitor**: Outcome SLA Dashboard (outcome-centric with KPI breach status, SLA threshold markers, bound agent health), Live Runs stream, Drift Detection (pass rate + latency + hallucination/faithfulness drift, customer impact analysis, expert escalation flow), Agent Health cards. 5 stat cards including Customer Impact. GET /api/monitor/impact endpoint aggregates outcome health data.
- **Governance**: Includes a policy library (policy-as-code), audit trails, and compliance reporting.
- **Approvals**: Manages an expert validation queue for various approval types (e.g., blueprint review, outcome review, outcome certification) with structured evidence.
- **Billing**: Handles outcome-based metering and invoicing.
- **Evaluation Evidence System**: Incorporates drift detection, red-team coverage, regression detection, and outcome correlation to provide robust evidence for agent performance and risks.
- **Business Outcome Discovery**: A conversational AI-driven process for business users to define goals, identify automation opportunities, and draft outcome contracts.
- **Role-based Access**: Six switchable personas (Outcome Owner, Agent Engineer, Ops/SRE, Compliance/Security, Expert Validator, Finance) filter navigation and available actions.
- **Global App Shell**: Includes a left navigation sidebar, top bar with global search, command palette, environment selector, and notification center.

**Technical Implementations**:
- **AI Endpoints**: `POST /api/ai/agent-assist` for conversational design, `POST /api/ai/match-templates` for template matching, `POST /api/ai/outcome-discover` for outcome discovery, and `POST /api/ai/propose-agents` for generating agent proposals.
- **Data Model**: Comprehensive schema covering outcome contracts, agents, deployments, evaluations, policies, approvals, billing, and templates.

## External Dependencies
- **LLM Providers**: Integrated for AI capabilities (e.g., GPT-4.1 for conversational AI and template matching).
- **PostgreSQL**: Primary database for persistent storage.
- **Express.js**: Used for building the backend REST API.
- **React**: Frontend library for user interface development.
- **Vite**: Frontend build tool.
- **Tailwind CSS**: Utility-first CSS framework for styling.
- **shadcn/ui**: UI component library.
- **wouter**: Small routing library for React.
- **TanStack React Query**: For data fetching, caching, and state management in the frontend.
- **Drizzle ORM**: Object-relational mapper for interacting with PostgreSQL.
- **Vector DBs**: Potential future or current integration for RAG functionalities.
- **Monitoring Tools**: External services for deeper monitoring capabilities.
- **CI/CD Tools**: Integration for continuous integration and deployment workflows.
- **Ticketing/Communication Systems**: For escalating issues and notifications.