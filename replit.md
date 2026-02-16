# Nous Agent Orchestrator

## Overview
Nous Agent Orchestrator is an AI agent lifecycle management platform focusing on 80% autonomous execution and 20% expert validation. Its core purpose is to embed compliance frameworks, policies, and industry-specific ontologies directly into agent behavior. The platform provides tools for agent creation, deployment, monitoring, and governance, aiming to automate and optimize the AI agent lifecycle across six key industry verticals: Healthcare, Financial Services (including Credit Rating sub-domain), Manufacturing, Insurance, Retail, and Technology/SaaS. This differentiation positions it as a platform where AI agents reason within the user's industry context, driving business value and efficient AI operations.

## User Preferences
I prefer that you ask me before making any major changes to the codebase. When suggesting code, please provide clear explanations for the choices made. I value an iterative development approach, where we can discuss and refine solutions progressively.

## System Architecture
The Nous Agent Orchestrator is built on a modern web stack: React, Vite, Tailwind CSS, shadcn/ui, and wouter for the frontend; Express.js for the backend REST API; and PostgreSQL with Drizzle ORM for the database.

**UI/UX Design Principles**:
- **Outcome-first navigation**: Prioritizes KPI delivery status.
- **Evidence-by-default**: For approvals, including configuration differences and blast radius analysis.
- **Autonomy with guardrails**: Policies are checked before actions.
- **Time travel**: For agent timelines, aggregating version changes and audit events.

**Core Features**:
- **Landing Page**: Features project branding, highlights, and a product demo launcher.
- **Product Demo Player**: A full-screen cinematic presentation with 10 slides, including a narrative arc for a case study, OpenAI TTS narration, beat-driven background music (Web Audio API), animated transitions, and auto-advancement.
- **Overview Dashboard**: Displays platform health, KPI progress, and agent status.
- **Outcomes**: Manages outcome contracts, KPIs, SLAs, and business targets.
- **Agents**: Registry for managing and monitoring various agent types (single, team, remote), leveraging Google A2A AgentCards.
- **Blueprint Studio**: Visual editor for creating, versioning, and compiling auditable agent blueprints with static checks, approval flows, compliance annotations, and industry constraint enforcement, supporting graph-based orchestration.
- **Deployments (Industry-Governed Deployment Pipeline)**: Features a Release Orchestrator with industry-specific mandatory pipeline stages, auto-rollback triggers, and deployment evidence packages. This includes tailored stages and rollback conditions for Healthcare, Financial Services, Manufacturing, Insurance, and Retail, enforced by a regulatory policy-as-code engine.
- **Shadow Replay Studio**: Enables zero-risk agent deployment via production trace replay, offering trace libraries, replay configuration, semantic diff viewing, and compliance checkpoints.
- **Canary Deployment Console**: Manages graduated rollouts with industry-specific safety controls, KPI comparison, and auto-promotion/rollback rules.
- **Monitor**: Provides outcome SLA dashboard, live run monitoring, drift detection, and agent health observability.
- **Governance**: Certified Agent Compliance Layer with policy management, enforcement, and immutable audit trails, including a Regulatory Compliance tab for policy generation and change management.
- **Optimization (Patch Center)**: Facilitates autonomous optimization, self-healing, AI-proposed changes, and experiment management.
- **Healing Operations Center**: Provides closed-loop autonomous remediation with industry-aware diagnosis, business impact quantification, and AI-generated remediation.
- **Approvals**: Expert validation queue and approval gates for human oversight.
- **Evaluation Evidence System**: Provides robust evidence for agent performance and risks.
- **Continuous Industry Assurance Engine (Eval Studio)**: Manages evaluations with industry-contextualized testing, including golden dataset integration, mandatory regulatory test cases, and industry-specific scorers.
- **Outcome Builder**: Conversational AI for defining goals and drafting outcome contracts.
- **Role-based Access**: Six switchable personas for tailored access.
- **Global App Shell**: Provides environment selection, search, command palette, notifications, and role switcher.
- **Adaptive Autonomy Engine**: Dynamic, context-aware human oversight with a risk dimension matrix, autonomy spectrum, and override calendar.
- **Agent Skills Library**: A catalog of composable, versioned skill units with industry-organized browsing, search, and AI enhancement/generation capabilities for all five industries.
- **Context Engineering Studio**: Manages how agents acquire and utilize context, featuring context source inventory, priority matrix, and budget visualizer.
- **Industry Workspace Selector**: Global context switch adapting platform terminology and regulatory frameworks based on selected industry profiles.
- **Multi-Agent Pipeline Orchestrator**: Visual workflow editor for designing and executing multi-agent pipelines with sequential agent stages, approval gates, and AI-simulated scenario execution. Supports creating pipelines, adding agent/gate stages, running scenarios with real-time per-stage progression, and human approval checkpoints.

**Technical Implementations**:
- **Shadow Replay**: Replays production traces for validation.
- **Autonomy Hooks**: Automated actions like expanding eval suites or quarantining agents.
- **Code Generation / Export**: Supports dual-mode deployment via an Export Wizard.
- **AI Endpoints**: Dedicated APIs for conversational design, template matching, outcome discovery, AI-generated test cases, skill generation, skill enhancement, and TTS narration.
- **Self-Healing Loop**: Automates incident resolution.
- **Deployment Sequence**: Orchestrates deployments across environments with auto-computed approvals.
- **Billing Metering Pipeline**: Ingests outcome events for tamper-evident billing.
- **Immutable Audit Log**: Hash-chained for integrity verification.
- **Redaction Profiles**: Tiered data redaction for sensitive information.
- **Tool Proxy Control Point**: Unified proxy for MCP tool calls and A2A delegations.
- **MCP Server Directory, Tool Registry, Resources, Prompt Library**: Manages MCP integrations, tools, knowledge connectors, and prompt templates.
- **Ontology Explorer**: Industry knowledge graph browser with concept details, search, AI-enhanced descriptions, and KG-powered relationship suggestions (Suggest Relationships button queries Knowledge Graph and AI for related entities with accept/reject side panel).
- **Memory Architecture Manager**: Defines agent memory management with industry-specific retention and governance.
- **RAG Pipeline Manager**: Configures how agents retrieve industry-specific knowledge at runtime.
- **Knowledge Graph Ingestion & Enrichment**: Tools for populating and maintaining the knowledge graph with customer-specific data.
- **Agent Wizard Ontology Integration**: AI-suggested ontology tags for agent definition.
- **Data Model**: Comprehensive schema linking incidents, patches, and deployments.

## External Dependencies
- **OpenAI**: For TTS narration, AI skill generation/enhancement, conversational design, and other AI features.
- **PostgreSQL**: Primary database.
- **Express.js**: Backend framework.
- **React**: Frontend library.
- **Vite**: Frontend build tool.
- **Tailwind CSS**: Styling framework.
- **shadcn/ui**: UI component library.
- **wouter**: Routing library.
- **Drizzle ORM**: Database ORM.
- **Web Audio API**: Used for beat-driven background music in the demo player.