# Nous Agent Orchestrator

## Overview
Nous Agent Orchestrator (formerly ALMP) is an AI agent lifecycle management platform designed for managing AI agents with an 80% autonomous execution and 20% expert validation model. The platform is differentiated by embedding compliance frameworks, policies, and ontology directly into agent behavior by default — positioned as "the only AI agent platform where agents reason within your industry's regulatory, operational, and domain context." It provides tools for agent creation, deployment, monitoring, and governance, aiming to deliver business value and enable efficient AI operations by automating and optimizing the AI agent lifecycle across five industry verticals: Healthcare, Financial Services, Manufacturing, Insurance, and Retail.

## User Preferences
I prefer that you ask me before making any major changes to the codebase. When suggesting code, please provide clear explanations for the choices made. I value an iterative development approach, where we can discuss and refine solutions progressively.

## Recent Changes
- **Platform Rebrand**: Renamed from "ALMP" to "Nous Agent Orchestrator" across landing page, demo player, and branding elements.
- **Product Demo Video Overhaul**: Rebuilt the full-screen demo player with cleaner slide+fade+scale transitions (cubic-bezier easing), Ken Burns zoom effect on screenshots, animated headline and keyword badge overlays per slide, narration-aware auto-advance (waits for TTS to finish + 1.5s pause), a proper closing slide with gradient headline and "Get Started" CTA, and beat-driven background music (kick/snare/hi-hat at 90 BPM with jazz chord progression and reverb).
- **Billing Downplayed**: Removed billing-focused slide from demo. Outcome Contracts slide now focuses on KPI tracking and measurable results without billing/pricing language.
- **Insurance Industry Support**: Added "Insurance" to the Agent Skills Library INDUSTRY_CONFIG so AI skill generation dropdown includes all 5 industries.
- **Industry-Governed Deployment Pipeline**: Enhanced deployments with mandatory pipeline stages, auto-rollback triggers, and evidence packages per industry. Industry detection uses deployment.industry field with fallback to active workspace context.
- **Fresh Demo Screenshots**: All 8 demo screenshots regenerated from the latest UI state.

## System Architecture
The platform utilizes a modern web stack: React, Vite, Tailwind CSS, shadcn/ui, and wouter for the frontend; Express.js for the backend REST API; and PostgreSQL with Drizzle ORM for the database.

**UI/UX Design Principles**:
- Outcome-first navigation for KPI delivery status.
- Evidence-by-default for approvals, including configuration differences and blast radius analysis.
- Autonomy with guardrails, checking policies before actions.
- Time travel for agent timelines, aggregating version changes and audit events.

**Core Features**:
- **Landing Page**: Branded as "Nous Agent Orchestrator" with hero section, feature highlights, capability cards, industry highlights for 5 verticals, and a "Watch Demo" button that launches the full-screen product demo player.
- **Product Demo Player** (`client/src/components/demo-player.tsx`): Full-screen cinematic presentation with 8 slides (Command Center, Agent Registry, Outcome Contracts, Industry-Governed Deployments, Live Observability, Certified Compliance, Approval Gates, Closing). Features: OpenAI TTS narration via `/api/demo/tts`, beat-driven jazz background music (Web Audio API with kick/snare/hi-hat at 90 BPM + jazz 7th chord progressions + reverb), slide+fade+scale transitions with Ken Burns effect, animated headline and keyword badge overlays, narration-aware auto-advance, and a cinematic closing slide with gradient headline and "Get Started" CTA. Backend allowlists narration texts in `ALLOWED_DEMO_NARRATIONS` set. Screenshots stored in `client/public/demo-screenshots/`.
- **Overview Dashboard**: Displays platform health, KPI progress, and agent status.
- **Outcomes**: Manages outcome contracts, KPIs, SLAs, and targets tied to measurable business results.
- **Agents**: Agent Registry for management and monitoring, supporting various agent types (single, team, remote) and leveraging Google A2A AgentCards.
- **Blueprint Studio**: Visual editor for creating, versioning, and compiling auditable agent blueprints with static checks, approval flows, compliance annotations, and industry constraint enforcement. Supports graph-based orchestration.
- **Deployments (Industry-Governed Deployment Pipeline)**: Release Orchestrator with industry-specific mandatory pipeline stages, auto-rollback triggers, and deployment evidence packages. Features: Mandatory Pipeline Stages (Healthcare: clinical safety review + HIPAA attestation + shadow replay with patient safety scorer; Financial Services: regulatory compliance attestation + suitability testing + shadow replay with compliance scorer; Manufacturing: safety review + quality validation + shadow replay with measurement accuracy scorer; Insurance: actuarial review + ACORD compliance + shadow replay with claims accuracy scorer; Retail: PCI compliance + customer impact review + shadow replay with conversion scorer — enforced by regulatory policy-as-code engine), Industry-Specific Rollback Triggers (Healthcare: any patient safety event; Financial Services: regulatory compliance rate below threshold; Manufacturing: safety incident or quality metric breach; Insurance: claims processing error rate spike; Retail: customer data exposure — pre-configured per industry with auto-rollback), Deployment Evidence Package (shadow replay results, canary performance data, golden dataset evaluation, compliance attestations, approval chain — stored in audit trail, required for EU AI Act conformity). Industry detection uses deployment.industry field with fallback to active workspace industry context. Schema: deployments.industry, deployments.pipelineStages, deployments.industryRollbackTriggers, deployments.evidencePackage, deployments.pipelineComplete. Config: `client/src/lib/industry-deployment-pipeline.ts`. API: POST /api/deployments/:id/initialize-pipeline, POST /api/deployments/:id/advance-stage, POST /api/deployments/:id/collect-evidence. Promotion gated on mandatory pipeline stage completion.
- **Shadow Replay Studio**: Enables zero-risk agent deployment through production trace replay, offering trace libraries, replay configuration, semantic diff viewing, and compliance checkpoints.
- **Canary Deployment Console**: Manages graduated rollouts with industry-specific safety controls, KPI comparison, auto-promotion/rollback rules, and blast radius indicators.
- **Monitor**: Outcome SLA Dashboard, live runs, drift detection, and agent health monitoring with MCP-aware observability and enhanced audit trails.
- **Governance**: Certified Agent Compliance Layer with policy management, enforcement, and audit trails, including a Regulatory Compliance tab for policy generation and change management.
- **Optimization (Patch Center)**: Facilitates autonomous optimization, self-healing, AI-proposed changes, and experiment management.
- **Healing Operations Center**: Provides closed-loop autonomous remediation with industry-aware diagnosis, business impact quantification, AI-generated remediation, and an experiment dashboard.
- **Approvals**: Expert validation queue and approval gates for human oversight.
- **Billing**: Outcome-based metering and invoicing (downplayed in demo/marketing — may be removed or simplified).
- **Evaluation Evidence System**: Provides robust evidence for agent performance and risks.
- **Continuous Industry Assurance Engine (Eval Studio)**: Manages evaluations with industry-contextualized testing, including golden dataset integration, mandatory regulatory test cases, industry-specific scorers, production-seeded edge cases, and regression impact analysis.
- **Outcome Builder**: Conversational AI for defining goals and drafting outcome contracts.
- **Role-based Access**: Six switchable personas for tailored access.
- **Global App Shell**: Provides environment selection, search, command palette, notifications, and role switcher.
- **Adaptive Autonomy Engine**: Dynamic, context-aware human oversight with a risk dimension matrix, autonomy spectrum, override calendar, and learning dashboard.
- **Sidebar Navigation**: Organized into collapsible groups for core functionalities, build, evaluation, deployment & observation, governance, and system management.
- **Agent Skills Library** (`client/src/pages/skills.tsx`): A catalog of composable, versioned skill units with industry-organized browsing, search, AI enhancement, and AI generation. Supports all 5 industries: Financial Services, Healthcare, Manufacturing, Insurance, Retail. AI generation creates 5 skills per domain via `/api/ai/generate-skills`.
- **Context Engineering Studio**: Manages how agents acquire and utilize context, featuring context source inventory, priority matrix, budget visualizer, and compilation preview.
- **Industry Workspace Selector**: Global context switch adapting platform terminology and regulatory frameworks based on selected industry profiles (Healthcare, Financial Services, Manufacturing, Insurance, Retail).

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

## Key Files
- `client/src/pages/landing.tsx` — Landing page with "Nous" branding and demo trigger
- `client/src/components/demo-player.tsx` — Full-screen product demo with TTS, beats, transitions
- `client/src/pages/deployments.tsx` — Deployments list with industry pipeline section
- `client/src/pages/release-detail.tsx` — Release detail with pipeline stages, evidence, rollback triggers
- `client/src/lib/industry-deployment-pipeline.ts` — Industry pipeline stage/trigger/evidence configs
- `client/src/pages/evals.tsx` — Evaluation studio with industry assurance
- `client/src/pages/eval-detail.tsx` — Evaluation detail with industry-specific test cases
- `client/src/lib/industry-assurance.ts` — Industry assurance engine configuration
- `client/src/pages/skills.tsx` — Agent Skills Library with AI generation (all 5 industries)
- `client/src/pages/agents.tsx` — Agent Registry
- `client/src/components/industry-provider.tsx` — Industry workspace context provider
- `shared/schema.ts` — Drizzle ORM schema definitions
- `server/routes.ts` — Express API routes (including demo TTS, deployment pipeline APIs)
- `server/storage.ts` — Storage interface and database operations

## External Dependencies
- **OpenAI** (via Replit AI Integrations): TTS narration, AI skill generation/enhancement, conversational design, and other AI features.
- **PostgreSQL**: Primary database (Neon-backed via Replit).
- **Express.js**: Backend framework.
- **React**: Frontend library.
- **Vite**: Frontend build tool.
- **Tailwind CSS**: Styling framework.
- **shadcn/ui**: UI component library.
- **wouter**: Routing library.
- **Drizzle ORM**: Database ORM.
- **Web Audio API**: Beat-driven background music in demo player (no external audio files).
