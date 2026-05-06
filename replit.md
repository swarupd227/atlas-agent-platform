# Nous Agent Orchestrator

## Run & Operate
_Populate as you build_

## Stack
- **Frontend**: React 18, Vite, Tailwind CSS, shadcn/ui, wouter
- **Backend**: Express.js 4.x
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM
- **LLM Providers**: OpenAI, Anthropic (via Replit AI Integrations gateway or direct API key)
- **Build Tool**: Vite

## Where things live
- **Frontend Source**: `client-shared/`
- **Backend Source**: `server/`
- **Database Migrations/Schema**: `db/schema.ts`, `drizzle.config.ts`
- **LLM Provider Abstraction**: `server/llm-provider.ts`
- **Demo Scripts**: `scripts/`, `provision_hnp_govt_dev.sh`, `provision_mcg_kb_dev.sh`, `migrate_mcg_kb_to_prod.sh`
- **Mock MCP Servers**: `server/mock-mcp/`
- **Shared Demo Definitions**: `server/hnp-govt-shared-defs.ts`, `server/hnp-sub-shared-defs.ts`, `server/mcg-kb-shared-defs.ts`

## Architecture decisions
- **Blueprint-First Agent Creation**: All agent creation processes are centered around blueprints.
- **Multi-Tenancy**: Organization-level data isolation is enforced via `organization_id` in core tables and filtered storage methods.
- **Unified Workflow State (UWS)**: Provides typed, persistent, reducer-based workflow state across pipeline stages with checkpointing and interrupt gates.
- **LLM Provider Abstraction**: Supports multiple LLM providers with a uniform interface and per-agent selection.
- **Event-Driven Trigger System**: Configurable triggers (`webhook`, `schedule`, `agent_completion`, `mcp_resource_change`) for agent automation.

## Product
The Nous Agent Orchestrator is an AI agent lifecycle management platform for autonomous execution and expert validation.
- **Agent Lifecycle Management**: Tools for creation, deployment, monitoring, and governance.
- **Compliance & Governance**: Certified Agent Compliance Layer for policy management, enforcement, and audit trails.
- **Validation & Deployment Safety**: Shadow Replay Studio for pre-deployment validation and Canary Deployment Console for graduated rollouts.
- **Knowledge Management**: Vector-embedded document collections for RAG, supporting web crawl and structured data import.
- **Multi-Agent Orchestration**: Supports team-based orchestration, skills library, and context engineering.
- **API Gateway**: Deployed agents are exposed as REST API endpoints with key management and tracing.
- **Business Mode**: Simplified multi-tenant UX for business stakeholders.
- **AI-Powered Cash Application Demo**: `/demo/otc-cash`
- **Odometer Fraud Detection Demo**: `/demo/blackbook`
- **HNP Government Beat Intelligence Demo**: `/demo/hnp-govt`
- **HNP Subscriber Intelligence & Churn Prevention Demo**: `/demo/hnp-sub`
- **MCG Health KB Onboarding Demo**: `/demo/mcg-kb` — single agent, 7 extraction nodes, 12-artifact bundle, QA gate, human promotion (SCN-MCG-1)

## User preferences
I prefer that you ask me before making any major changes to the codebase. When suggesting code, please provide clear explanations for the choices made. I value an iterative development approach, where we can discuss and refine solutions progressively.

## Gotchas
- Agent-MCP junction records must be inserted via psql for reliability — `POST /api/agents/:id/mcp-servers` with `{serverId}` creates records in `agent_mcp_servers.server_id` but sometimes only the first bind succeeds via the API; use psql for the second binding.
- MCG-KB dev agent IDs: agent=`fc6bf730`, KB-MCP=`376e6249`, BundleStore-MCP=`930c32d5` (org `09d0d9c2`).
- `resultSummary` capture for HNP Subscriber demo uses `evidencePackage` DB column for persistence, as `deployments` table lacks a `result_summary` column.
- For HNP demos, `extractJson()` strips ` ```json``` ` fences; only falls back to runtime `analysis` object if it has a structured shape.
- MCP tools registered with `annotations: { endpoint, method }` will call hyphenated mock routes (e.g., `get_transcripts` → `GET /get-transcripts`).

## Pointers
- **Drizzle ORM Docs**: `https://orm.drizzle.team/docs/overview`
- **Replit AI Integrations**: `https://docs.replit.com/ai/integrations`
- **Tailwind CSS Docs**: `https://tailwindcss.com/docs`
- **shadcn/ui Docs**: `https://ui.shadcn.com/docs`
- **Express.js Docs**: `https://expressjs.com/`