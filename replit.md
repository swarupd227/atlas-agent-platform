# ALMP - Agent Lifecycle Management Platform

## Overview
ALMP is an Agent Lifecycle Management Platform designed for managing AI agents with an 80% autonomous execution and 20% expert validation model. The platform focuses on outcome-driven billing, where customers pay for measurable results. It provides tools for agent creation, deployment, monitoring, and governance, aiming to deliver business value and enable efficient AI operations by automating and optimizing the AI agent lifecycle.

## User Preferences
I prefer that you ask me before making any major changes to the codebase. When suggesting code, please provide clear explanations for the choices made. I value an iterative development approach, where we can discuss and refine solutions progressively.

## System Architecture
The platform utilizes a modern web stack: React, Vite, Tailwind CSS, shadcn/ui, and wouter for the frontend; Express.js for the backend REST API; and PostgreSQL with Drizzle ORM for the database.

**UI/UX Design Principles**:
- Outcome-first navigation for KPI delivery status.
- Evidence-by-default for approvals, including configuration differences and blast radius analysis.
- Autonomy with guardrails, checking policies before actions.
- Time travel for agent timelines, aggregating version changes and audit events.

**Core Features**:
- **Overview Dashboard**: Displays platform health, KPI progress, and agent status.
- **Outcomes**: Manages outcome contracts, KPIs, SLAs, and pricing.
- **Agents**: Agent Registry for management and monitoring, supporting various agent types (single, team, remote) and leveraging Google A2A AgentCards.
- **Blueprint Studio**: Visual editor for creating, versioning, and compiling auditable agent blueprints with static checks, approval flows, compliance annotations, and industry constraint enforcement. Supports graph-based orchestration.
- **Deployments**: Release Orchestrator with environment management, various rollout strategies (shadow/canary/direct), auto-incident generation, and a Freeze Center.
- **Shadow Replay Studio**: Enables zero-risk agent deployment through production trace replay, offering trace libraries, replay configuration, semantic diff viewing, and compliance checkpoints.
- **Canary Deployment Console**: Manages graduated rollouts with industry-specific safety controls, KPI comparison, auto-promotion/rollback rules, and blast radius indicators.
- **Monitor**: Outcome SLA Dashboard, live runs, drift detection, and agent health monitoring with MCP-aware observability and enhanced audit trails.
- **Governance**: Certified Agent Compliance Layer with policy management, enforcement, and audit trails, including a Regulatory Compliance tab for policy generation and change management.
- **Optimization (Patch Center)**: Facilitates autonomous optimization, self-healing, AI-proposed changes, and experiment management.
- **Healing Operations Center**: Provides closed-loop autonomous remediation with industry-aware diagnosis, business impact quantification, AI-generated remediation, and an experiment dashboard.
- **Approvals**: Expert validation queue and approval gates for human oversight.
- **Billing**: Outcome-based metering and invoicing.
- **Evaluation Evidence System**: Provides robust evidence for agent performance and risks.
- **Outcome Builder**: Conversational AI for defining goals and drafting outcome contracts.
- **Role-based Access**: Six switchable personas for tailored access.
- **Global App Shell**: Provides environment selection, search, command palette, notifications, and role switcher.
- **Adaptive Autonomy Engine**: Dynamic, context-aware human oversight with a risk dimension matrix, autonomy spectrum, override calendar, and learning dashboard.
- **Sidebar Navigation**: Organized into collapsible groups for core functionalities, build, evaluation, deployment & observation, governance, and system management.
- **Agent Skills Library**: A catalog of composable, versioned skill units with industry-organized browsing and search.
- **Context Engineering Studio**: Manages how agents acquire and utilize context, featuring context source inventory, priority matrix, budget visualizer, and compilation preview.
- **Industry Workspace Selector**: Global context switch adapting platform terminology and regulatory frameworks based on selected industry profiles.

**Technical Implementations**:
- **Continuous Industry Assurance Engine (Eval Studio)**: Manages evaluations with industry-contextualized testing, including golden dataset integration, mandatory regulatory test cases, industry-specific scorers, production-seeded edge cases, and regression impact analysis.
- **Shadow Replay**: Replays production traces for validation.
- **Autonomy Hooks**: Automated actions like expanding eval suites or quarantining agents.
- **Code Generation / Export**: Supports dual-mode deployment via an Export Wizard.
- **AI Endpoints**: Dedicated APIs for conversational design, template matching, outcome discovery, and AI-generated test cases.
- **Self-Healing Loop**: Automates incident resolution.
- **Deployment Sequence**: Orchestrates deployments across environments with auto-computed approvals.
- **Billing Metering Pipeline**: Ingests outcome events for tamper-evident billing.
- **Immutable Audit Log**: Hash-chained for integrity verification.
- **Redaction Profiles**: Tiered data redaction for sensitive information.
- **Tool Proxy Control Point**: Unified proxy for MCP tool calls and A2A delegations.
- **MCP Server Directory**: Manages MCP server integrations.
- **MCP Tool Registry**: Governed inventory of tools with schemas and governance fields.
- **MCP Resources**: Governed knowledge connectors with sensitivity classification.
- **MCP Prompt Library**: Manages prompt templates for blueprints.
- **Ontology Explorer**: Industry knowledge graph browser with concept details, search, AI-enhanced descriptions, and customer extension capabilities.
- **Memory Architecture Manager**: Defines how agents manage long-term and working memory with industry-specific retention and governance rules.
- **RAG Pipeline Manager**: Configures how agents retrieve industry-specific knowledge at runtime, including knowledge source registry, retrieval strategy designer, industry chunk strategy, and quality dashboard.
- **Knowledge Graph Ingestion & Enrichment**: Tools for populating and maintaining the knowledge graph with customer-specific data, including data source connectors, entity resolution, relationship extraction, and temporal graph features.
- **Agent Wizard Ontology Integration**: AI-suggested ontology tags for agent definition.
- **Data Model**: Comprehensive schema linking incidents, patches, and deployments.

## External Dependencies
- **LLM Providers**: For AI capabilities.
- **PostgreSQL**: Primary database.
- **Express.js**: Backend framework.
- **React**: Frontend library.
- **Vite**: Frontend build tool.
- **Tailwind CSS**: Styling framework.
- **shadcn/ui**: UI component library.
- **wouter**: Routing library.
- **Drizzle ORM**: Database ORM.