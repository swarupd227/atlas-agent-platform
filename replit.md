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
- **Agents**: Agent Registry for managing and monitoring agents, including detailed cockpit views, lifecycle management, and a design wizard. Supports Multi-Agent Orchestration with three agent types: single (standard), team (composite orchestrators with member agents), and remote (A2A-connected external agents). Remote agents are backed by Google A2A AgentCards with capability discovery, trust tiers (untrusted/basic/verified/trusted/privileged), connectivity status, allowed skills whitelist, and security requirements. Teams support member roles (lead/member/observer).
- **Blueprint Studio**: Visual editor for creating, versioning, and compiling agent blueprints with static checks and approval flows. Includes MCP Dependencies tab (server selection with pinned versions), MCP Tool Nodes (governed tool picker from registry), Context Nodes (resource selection with retrieval strategy: eager/lazy/on-demand), compiler snapshots for reproducibility, and reviewer governance gates for production release.
- **Templates**: Library of agent templates.
- **Deployments**: Release Orchestrator with environment management, rollout strategies (shadow/canary/direct), and auto-incident generation. Includes a Create Release wizard for defining deployment parameters and safeguards. Supports "Deploy as Source Package" for CI/CD integration. Freeze Center for deployment freeze management.
- **Monitor**: Outcome SLA Dashboard, live runs, drift detection, and agent health monitoring.
- **Governance**: Certified Agent Compliance Layer with policy management, enforcement, audit trails, and tool access controls.
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
- **Code Generation / Export**: Supports dual-mode agent deployment: config-driven runtime execution and code generation/export for standalone deployment using a Ralph Loop pattern. An Export Wizard guides the user through configuring export type, framework, tool adapters, dependencies, environment variables, observability settings, build/test gates, and delivery targets (ZIP, Git, Replit).
- **AI Endpoints**: Dedicated API endpoints for conversational design, template matching, outcome discovery, agent/replacement proposals, and AI-generated test cases.
- **Self-Healing Loop**: Automates incident resolution from detection through patching, approval, and deployment, with incident status tracking and auto-closure/reopening.
- **Deployment Sequence**: Orchestrates deployments through staging, shadow, canary, and production environments with auto-computed approvals, shadow replay evidence, and canary monitoring for auto-promotion/rollback.
- **Billing Metering Pipeline**: Ingests outcome events, applies exclusion rules, deduplication, fraud checks, and generates SHA-256 signed hashes for tamper evidence. Aggregates billable events for invoice generation based on various pricing models. Provides drill-down from invoice to events to traces.
- **Immutable Audit Log**: Maintains a hash-chained audit log for tamper detection and integrity verification.
- **Redaction Profiles (R0/R1/R2)**: Implements tiered data redaction for sensitive information across traces and audit events based on user roles.
- **Tool Proxy Control Point**: All tool calls are routed through a proxy that enforces allowlists, blocklists, rate limiting, retries, shadow dry-run mode, and consistent redacted audit logging.
- **MCP Server Directory**: Manages Model Context Protocol (MCP) servers, allowing integration of internal and third-party servers. Includes features for capability negotiation, tool/resource/prompt catalog synchronization, authentication configuration, and a production enablement flow with approval processes based on risk tiers.
- **MCP Tool Registry**: A global, governed inventory of tools synced from MCP servers. Provides tool details, input/output schemas, governance fields (risk classification, owner, enabled status, drift status), and an enablement flow requiring approvals for high-risk tools. Detects and flags tool drift via fingerprinting. (Previously "Tool Catalog" — renamed for clarity to distinguish from general integration connectors like Jira, Salesforce, etc.)
- **MCP Resources**: Governed knowledge connectors — document stores, repos, DB exports, tickets accessed uniformly via MCP resource primitives (resources/list, resources/read). Features sensitivity classification (public/internal/confidential/restricted), approval gates (data steward/Security Admin required for sensitive URIs), freshness tracking, subscription support, and integration into Blueprint Studio as "Context Sources" for model context.
- **MCP Prompt Library**: Imports MCP prompt templates (playbooks, workflow prompts) and binds them into blueprints. Catalog page for browsing prompts by server/status, detail page with arguments/message preview/governance tabs, and Blueprint Studio "Prompt Nodes" panel for selecting prompts and mapping arguments. Domain expert can publish prompts; Security Admin approval required if prompt embeds sensitive resources. Uses MCP primitives: prompts/list, prompts/get, list change notifications.
- **Data Model**: A comprehensive schema that links incidents, patches, and deployments for full traceability.

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