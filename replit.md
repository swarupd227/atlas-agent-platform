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
- **Deployments**: Release Orchestrator with environment management (staging/pilot/prod), rollout strategies (shadow/canary/direct), auto-incident generation. Environment board shows per-deployment cards with active version, canary %, shadow on/off indicator, rollback triggers armed status, and last approval link. Create Release wizard (4-step dialog): Step 1 (agent/version/target env/strategy/shadow toggle), Step 2 (rollback safeguards with eval regression, policy violation, KPI drop triggers), Step 3 (autopromote rules — conditional canary promotion e.g. "If eval suite A passes and no violations in 2h, raise canary to 25%"), Step 4 (review/submit with auto-generated approval requirement panel). Freeze Center for deployment freeze management.
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
- **AI Endpoints**: Dedicated API endpoints for conversational design, template matching, outcome discovery, agent/replacement proposals, and AI-generated test cases.
- **Data Model**: Comprehensive schema for all platform entities.

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