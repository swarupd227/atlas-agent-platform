# Atlas as an AI Accelerator
## Proposal for Packaging Industry Platform Integration

**Prepared for:** Customer Engagement — Paper Packaging Distribution  
**Date:** May 2026  
**Document type:** Strategic capability overview and phased delivery plan

---

## 1. Executive Summary

Atlas is a production-grade AI agent orchestration platform built on a modern full-stack architecture (React, Node.js, PostgreSQL). Rather than positioning it as a standalone product to replace the customer's unified portal, Atlas is proposed as an **invisible infrastructure accelerator** — running behind the customer's existing platform, callable via REST, and progressively embedding richer capabilities into the portal over an 18-month journey.

The delivery follows a **Crawl → Walk → Run** model:

- **Crawl (0–6 months):** Professional services engineers deploy Atlas Light and build the first 4–6 agents against the customer's Kong-managed product APIs. The portal calls agent results via REST. Clients see value without any self-service.
- **Walk (6–12 months):** More products onboarded, richer portal surfaces (command centre, insight feed, config panels). Larger clients can configure — but not build — agents.
- **Run (12–18 months+):** A constrained workflow designer is embedded in the portal. End-customers build their own alert, insight, and data intelligence agents within controlled guardrails.

---

## 2. Atlas Platform — Capability Inventory

### 2.1 Core Components (Built and Production-Ready)

The following components exist in Atlas today and are immediately applicable to the customer engagement. Strength ratings reflect architectural maturity and extractability.

---

#### ★★★ Agent Lifecycle Management
**Strength: HIGH — immediately deployable**

Full create → configure → deploy → run → monitor → retire lifecycle for AI agents. Blueprint-first design means every agent is defined as a structured JSON specification before it runs — version-controlled, auditable, and reproducible.

- Agent registry with external ID, name, model selection, risk tier, department metadata
- Deployment model with canary rollout, versioning, and status management
- Per-agent API gateway endpoint (`/api/gateway/v1/invoke/{agentId}`) with API key authentication
- Run history, step-level trace logging, and result persistence

**Why it's adaptable:** The API gateway surface means the customer's portal calls a single REST endpoint per agent. Portal never needs to know which LLM, which tools, or which workflow the agent uses. Clean separation.

---

#### ★★★ DAG Execution Engine
**Strength: HIGH — most extractable component**

A wave-based parallel directed acyclic graph (DAG) execution engine with typed state, reducer semantics, and nested orchestration support.

- **Wave-based parallelism:** Kahn's algorithm computes execution waves; independent nodes run in parallel automatically
- **Reducer-based state merging:** Each state field declares its merge strategy (`last_wins`, `append`, `merge_object`, `sum`) and write permissions (`writable_by` role)
- **Nested orchestration:** A node in one DAG can reference and execute an entire child DAG blueprint recursively
- **Cycle detection:** Build-time validation rejects circular dependencies
- **Checkpoint writes:** Stage completion checkpoints with state hashing for auditability and resumability

**Why it's adaptable:** Self-contained with minimal external dependencies. Can be extracted as a standalone execution service. Any workflow the portal defines becomes a blueprint JSON; the engine runs it. The portal never manages execution state.

---

#### ★★★ Governance and Compliance Layer
**Strength: HIGH — enterprise differentiator**

A comprehensive governance stack that wraps every agent action, tool call, and LLM output.

- **Policy engine:** CRUD for governance policies, AI-assisted policy pack enhancement, org-scoped policy evaluation
- **Output contract enforcement:** Every agent can declare a structured output schema; the enforcer validates every response before it reaches the caller
- **PII masking and rehydration:** Sensitive data is masked before LLM processing and rehydrated in the output — data never leaves the governance envelope unprotected
- **Tool-call governance proxy:** Every MCP or HTTP tool call passes through a governance proxy that checks policy, logs the action, and can block or redact
- **Role-based trace redaction:** Different roles see different levels of detail in execution traces — operators see results, admins see steps, platform team sees full traces
- **Immutable audit trail:** Every agent action, human gate decision, and policy evaluation is logged with timestamp, actor, and context

**Why it's adaptable:** This is the component that gives the customer's platform enterprise-grade auditability without building it. Any agent — whether PS-built or client-built — automatically inherits the governance envelope.

---

#### ★★★ Multi-Tenancy
**Strength: HIGH — foundational for the multi-tier model**

Organisation-level data isolation enforced throughout storage, routes, and governance.

- Every core entity (agents, deployments, KB bundles, policies, traces) is scoped by `organization_id`
- `getOrgId(req)` used consistently across all routes — no cross-tenant data leakage by design
- Storage methods are filtered at query level, not application level — isolation holds even under code changes
- Org provisioning can be scripted and later API-driven for automated client onboarding

**Why it's adaptable:** The multi-tier model (Atlas platform → customer → their clients) is supported structurally. Each paper packaging distribution company gets their own org with isolated agents, KB bundles, and audit logs.

---

#### ★★★ Knowledge Base and RAG System
**Strength: HIGH — directly applicable to domain onboarding**

A complete knowledge ingestion, embedding, and retrieval pipeline.

- File and URL ingestion with chunking and embedding (PostgreSQL vector storage)
- Sensitivity scanning against ontology-defined sensitive terms — flags and logs policy exposure
- Web crawl subsystem for URL-based ingestion at scale
- RAG retrieval wired directly into agent runtime — agents automatically retrieve relevant KB context at execution time
- **KB Bundle system:** Ingested content is packaged into versioned, governed bundles with QA check gates and human promotion workflow before any agent can be bound to them
- Bundle status lifecycle: `DRAFT → QA_CHECKED → PROMOTED (ACTIVE)`
- Audit trail for every bundle promotion action

**Why it's adaptable:** The KB bundle + human promotion pattern is directly applicable to the customer's domain. Product documentation, SOPs, packaging standards, and distribution policies are ingested once, governed centrally, and all agents in the org enforce the same knowledge base automatically.

---

#### ★★ Agent Runtime and Tool Loop
**Strength: MEDIUM-HIGH**

The core LLM execution loop that powers every agent run.

- Supports Anthropic (Claude) and OpenAI with a unified provider abstraction
- Tool call loop with configurable max iterations
- Progress callbacks for real-time SSE streaming (used in demo pipeline)
- Tool call result tracking, iteration logging, and final analysis extraction
- Integration with governance proxy on every tool call

**Why it's adaptable:** The provider abstraction means the customer can switch or mix LLM providers without changing agent blueprints. The SSE streaming pattern works well for the portal's real-time result feeds.

---

#### ★★ Human-in-the-Loop / Interrupt Manager
**Strength: MEDIUM-HIGH**

Structured interrupt and resume flow for workflows requiring human decisions.

- `fireInterrupt` suspends execution at a defined gate node
- Human reviewer receives the interrupt context (what the agent has done, what decision is needed)
- `resumeInterrupt` continues execution from the gate with the reviewer's decision recorded
- Interrupt events are logged in the audit trail with reviewer identity and timestamp
- Multiple interrupt types: approval gates, review gates, acknowledgement-required gates

**Why it's adaptable:** This directly supports the paper packaging distribution workflows where automated decisions need sign-off — e.g. a replenishment recommendation above a value threshold, a quality non-conformance requiring QA lead approval, a delivery reroute requiring dispatcher confirmation.

---

#### ★★ Event-Driven Trigger System
**Strength: MEDIUM**

Configurable trigger framework for automated agent execution.

- Trigger types: `webhook`, `schedule`, `agent_completion`, `mcp_resource_change`
- Schedule-based triggers for recurring agents (nightly log digest, hourly anomaly scan)
- Webhook triggers for event-driven agents (order exception on ERP event, stock threshold breach)
- Agent completion triggers for pipeline chaining (agent A completes → agent B fires)

**Why it's adaptable:** Maps directly to the Kong API gateway event model. Kong can fire webhooks on API events; Atlas triggers consume them and fire the relevant agent.

---

#### ★★ Business Mode UI
**Strength: MEDIUM — prototype-level, needs refinement**

A simplified operator-facing interface for non-technical users.

- Command centre dashboard — active agents, pending human gates, recent outcomes
- Outcomes view — agent results with business-friendly summaries
- Governance view — policy status, compliance alerts
- My Actions panel — items requiring human attention

**Why it's adaptable:** With reskinning to the portal's design system, this becomes the embedded command centre panel for client admins in the Walk phase.

---

#### ★ API Gateway
**Strength: MEDIUM — functional, needs hardening for production scale**

Per-agent REST endpoints with API key authentication and trace linkage.

- `/api/gateway/v1/invoke/{agentId}` — primary invocation endpoint
- API key auth (bearer and header schemes)
- Request → trace linkage for auditability
- OpenAPI specification published

**Why it's adaptable:** The portal integration in Crawl phase is simply the portal calling this endpoint. No other integration needed for Phase 1.

---

### 2.2 What Atlas Does NOT Currently Have (Honest Gap Assessment)

| Gap | Impact | Phase to address |
|---|---|---|
| Visual drag-and-drop workflow designer | High — needed for client self-service | Run (12–18m) |
| Pre-built ERP / industry connector packs | High — needed from day one | Build in Crawl (PS effort) |
| White-label theming / portal embed kit | Medium | Walk (6–12m) |
| Role hierarchy below org level (builder / operator roles) | Medium | Walk–Run |
| Connector catalogue / marketplace | Medium | Walk (6–12m) |
| Agent template library with fork-and-configure | Medium | Walk (6–12m) |
| Sandboxed test execution for client builders | Low-Medium | Run (12–18m) |
| Conversational data intel query interface | Low (Phase 4) | Run+ (18m+) |

---

## 3. Integration Architecture

### 3.1 Kong ↔ Atlas Integration Pattern

With REST APIs already managed through Kong, the integration is clean. Atlas calls Kong; Kong handles product API auth, rate limiting, and routing.

```
Customer's Unified Portal
  │
  │ REST (Atlas API Gateway)
  ▼
Atlas Agent Runtime
  │
  │ HTTP tool calls (configured per agent blueprint)
  ▼
Kong API Gateway
  │
  ├── ERP module APIs          (order, pricing, contracts)
  ├── Inventory module APIs    (stock, warehousing, SKU)
  ├── Scheduling module APIs   (production scheduling, S&OP)
  ├── Distribution module APIs (routes, logistics, TMS)
  ├── Quality module APIs      (non-conformance, lot records)
  └── Log aggregation APIs     (product event logs, error feeds)
```

**Key design principle:** Tenant identity (org ID) flows from portal → Atlas invocation context → Kong consumer header. Every agent call to Kong is scoped to the requesting client's tenant. Kong enforces data isolation at the API layer; Atlas enforces it at the orchestration layer.

### 3.2 Three Agent Classes

#### Class 1 — Workflow Automation Agents
*Event-triggered, structured DAG, may include human gates*

| Agent | Trigger | Kong routes used | Output |
|---|---|---|---|
| Order exception resolver | ERP webhook (order status change) | ERP order, pricing | Exception classified, routed or auto-resolved |
| Inventory replenishment adviser | Stock threshold event | Inventory, ERP PO | Replenishment recommendation or draft PO |
| Delivery conflict detector | Schedule trigger | Scheduling, Distribution | Conflict flagged, affected orders listed |
| PO matching and discrepancy agent | ERP webhook | ERP order + invoice | Match result, discrepancy routed to buyer |
| Quality non-conformance triage | Quality system webhook | Quality (lot), ERP | RCA draft + evidence package + routing |

#### Class 2 — Log Intelligence Agents
*Schedule-triggered, multi-product log analysis, structured insight output*

| Agent | Trigger | Kong routes used | Output |
|---|---|---|---|
| Product error digest | Nightly schedule | All product log APIs | Structured error feed: severity, product, entity, action |
| SLA breach early warning | Hourly schedule | Distribution, Scheduling | At-risk orders, breach probability, recommended action |
| Anomaly surface agent | Schedule or threshold event | Any subscribed product log | Anomaly list with confidence score and context |

#### Class 3 — Data Intelligence Agents (Phase 3+)
*Query-driven or alert-configured, cross-product, tenant-scoped*

| Agent | Trigger | Kong routes used | Output |
|---|---|---|---|
| Fill rate insight agent | Client query or schedule | Inventory, Distribution | Fill rate by SKU, trend, comparison period |
| Stock turns dashboard agent | Schedule | Inventory | Stock turns by product category, warehouse |
| Subscription cross-product KPI | Client alert rule | All subscribed products | Custom KPI value, threshold evaluation, alert |

---

## 4. Phased Delivery Plan — Crawl / Walk / Run

### Phase 1 — Crawl (Months 0–6)
**Theme: Prove agent ROI on known, bounded workflows**

#### What gets stood up

**Atlas Light** — a curated Atlas instance with the operational core only:

| Included | Deferred |
|---|---|
| Agent registry and lifecycle | Shadow replay studio |
| Blueprint builder (PS use only) | Canary deployment console |
| REST API gateway per agent | Advanced observability dashboards |
| Basic governance and audit log | Compliance certification layer |
| KB ingestion and RAG | Advanced ontology / knowledge graph |
| Agent runtime + HTTP tool calling | Multi-agent team orchestration |
| Multi-tenancy (org isolation) | Visual workflow designer |
| Schedule + webhook triggers | Business mode UI (deferred to Walk) |

#### What PS engineers build

- **HTTP tool adapters** for first 3–4 product APIs (via Kong) — configured in agent blueprints as typed REST call definitions
- **4–6 reference agents** (Class 1 and Class 2 from section 3.2)
- **Starter KB bundles** — product documentation, packaging standards, distribution policies ingested and promoted as v1.0 bundles
- **Portal integration shim** — portal calls Atlas API gateway, Atlas returns structured JSON, portal renders in existing UI components
- **Per-client org provisioning script** — spin up a new Atlas tenant for each onboarded paper packaging distribution company

#### What the portal gets

- Agent result cards (structured output rendered in portal's native components)
- Log intelligence digest panel (daily / hourly error and anomaly feed)
- Human gate modals (approval / review surfaces for interrupt-gated workflows)

#### End-customer experience

Results only. Clients see agent-driven outcomes in their familiar portal. No builder access, no configuration.

#### Success metrics

- ≥3 high-volume workflows automated end-to-end
- Human review time reduced on order exceptions and non-conformance triage
- Portal log intel feed adopted by client ops teams
- Audit trail demonstrating full agent action provenance to at least one client

---

### Phase 2 — Walk (Months 6–12)
**Theme: Expand across products. Enrich portal surfaces. Clients configure, not build.**

#### Atlas platform additions

| New capability | Description |
|---|---|
| Business Mode UI (reskinned) | Embedded command centre panel for client admins — agent status, pending gates, run history |
| Template library | Crawl-phase PS agents published as reusable templates; new agents start from templates |
| Connector catalogue | Managed registry: which product API integrations are available per tenant |
| Tenant connector access control | Each client org sees only their subscribed products in the catalogue |
| Agent versioning | Update a live agent blueprint without downtime; prior version preserved |
| Richer observability | Per-agent run history, latency, error rate, KB hit rate — visible to client admins |

#### Product onboarding pace

2–3 new product API integrations per quarter. Each follows the same pattern: HTTP tool definitions configured in Atlas, tested by PS, published to connector catalogue. Kong handles the API contract; Atlas handles the orchestration.

#### Portal additions

- **Command centre panel** — embedded in the portal's admin area. Reskinned Business Mode UI. Client admins monitor agents, handle gates, check KB bundle status.
- **Insight feed** — upgraded from Crawl's log digest. Multi-product unified feed with anomalies, SLA risks, and recommended actions across all of a client's subscribed products.
- **Configuration panels** — form-driven agent parameter adjustment (routing thresholds, alert levels, KB bundle selection) without free-form building.

#### End-customer self-service additions

- **Alert threshold configuration** — clients set thresholds on existing log intelligence agents through the portal's configuration panel. Atlas trigger system evaluates; portal surfaces the alert.
- **KB overlay upload** — clients upload their own documents (client-specific specs, policies) to augment the shared baseline KB bundle. Ingested automatically, scoped to their org.

---

### Phase 3 — Run (Months 12–18+)
**Theme: Client self-service. Embedded workflow designer. Data intelligence at scale.**

#### Atlas platform additions

| New capability | Description |
|---|---|
| Role hierarchy extension | Platform admin → tenant admin → builder → operator — four tiers with distinct permissions |
| Visual workflow designer API | Blueprint authoring exposed as a structured API; portal renders the designer over it |
| Sandboxed test execution | Agents run against historical / synthetic data before publishing |
| Multi-agent orchestration | Agents that delegate to specialist agents (e.g. support triage → domain expert) |
| Output contract enforcement (surfaced) | Client builders declare output schema; enforcement is automatic and visible in the builder |
| Data intel agent pattern | Query-driven agents that synthesise cross-product data into structured answers or charts |

#### Portal additions

**Constrained workflow designer** — embedded in the portal, purpose-built for the domain. Not a general-purpose canvas. A guided node palette with only the node types relevant to the packaging / distribution context:

```
Available node types for client builders:
  [Trigger]      Schedule / portal event / Kong webhook
  [Agent]        Select from template library or configure from scratch
  [Decision]     LLM-evaluated or rule-based conditional branch
  [Human Gate]   Approval / review step routed to a named role
  [API Call]     Direct call to a subscribed product API (from connector catalogue)
  [KB Query]     Retrieve context from an assigned KB bundle
  [Alert]        Fire notification — in-portal, email, or webhook
  [Data Intel]   Natural language query across product data → structured result
```

- **Template fork-and-configure** — builders start from a PS-published template and configure it. Most client builders never design from a blank canvas.
- **Data intel query builder** — guided form for constructing cross-product data queries. Agent runs the query; portal renders results as table, chart, or narrative summary.
- **Alert rule builder** — clients define alert conditions, evaluation schedule, and notification targets. Atlas trigger system evaluates; no coding required.

#### End-customer experience (full self-service)

- Build agents using the embedded workflow designer within platform-controlled guardrails
- Fork and customise PS templates for their specific workflows
- Set alert rules across their subscribed products
- Subscribe to recurring insight reports generated by agents and delivered to their portal dashboard
- Query cross-product data in natural language and receive structured answers

---

## 5. Component Extraction Map

For the embedded model — components extracted from Atlas and run as services behind the customer's portal:

| Component | Extraction form | Phase | Notes |
|---|---|---|---|
| **DAG Execution Engine** ★★★ | Standalone Node.js service | Crawl | Most self-contained; minimal dependencies; clean REST API surface |
| **Governance / Policy Layer** ★★★ | Middleware package | Crawl | Wraps any LLM call; PII masking, output contracts, audit log |
| **KB Ingestion + RAG** ★★★ | Standalone service | Crawl | Needs PostgreSQL with vector extension; already the storage model |
| **API Gateway** ★★ | Thin proxy service | Crawl | Or replace with portal's own API management layer |
| **Agent Runtime + Tool Loop** ★★ | SDK / npm package | Walk | LLM provider abstraction + tool calling as a library |
| **Business Mode UI** ★★ | React component library | Walk | Reskin to portal design system |
| **Interrupt Manager** ★★ | Service + webhook | Walk | Suspend / resume flows for human gate integration |
| **Workflow Designer** ★ | New build (portal-embedded) | Run | Does not exist yet; built purpose-built for the portal |
| **Connector Catalogue** ★ | New build (portal-embedded) | Walk | Management layer over MCP / HTTP tool registry |

**Keep in Atlas (access via API, not embedded):**
- Blueprint builder — PS engineers use it directly; no need to embed in portal
- Full observability and trace viewer — internal tooling for PS and platform support teams
- Policy management UI — managed by the customer's platform admin team

---

## 6. Key Architectural Decisions

Two decisions should be resolved before the programme starts. Everything else follows from getting these right.

### Decision 1 — Tenant identity propagation through Kong

Define exactly how a client's tenant identity flows:

```
Portal (client logged in) 
  → Atlas API gateway (org ID in request context) 
  → Agent runtime (org ID in execution context) 
  → HTTP tool call (org ID passed as Kong consumer header) 
  → Kong (enforces tenant-scoped API access)
  → Product API (returns only that client's data)
```

This must be designed once, correctly, before any agent is built. All agents across all products inherit it automatically.

### Decision 2 — Agent output contract for the portal

Each agent class (workflow, log intelligence, data intel) needs a defined JSON output schema that the portal's UI team designs their rendering components around. The output contract enforcement layer in Atlas then validates every agent response against the schema before it reaches the portal. This prevents agents from returning unpredictable structures that break the portal UI.

Define the schemas first. Build the rendering components. Then build the agents to match.

---

## 7. Pitch Framing — Key Messages

**"Your portal, enhanced — not a new tool to learn"**
Atlas runs behind the customer's unified portal. Their clients see their familiar interface. The AI layer is invisible infrastructure. No retraining, no context-switching, no separate tool to manage.

**"We build the first agents; your clients build the next ones"**
Phase 1 is professional services: wire up the product APIs via Kong, deploy a library of high-value agents. Phase 2 and 3 open a guided builder in the portal so larger clients can create their own agents within guardrails the customer controls.

**"Every automated decision is auditable"**
The governance layer logs every tool call, every LLM output, every human gate action with full provenance. Clients can show their own customers — and auditors — exactly what the agent did and why.

**"Built to grow with you — 10 products today, 30 products tomorrow"**
The connector catalogue model means each new product onboarded adds to a library that all clients can access. The execution engine, governance layer, and KB system are unchanged. Onboarding product 11 is the same operation as onboarding product 2.

---

## 8. Summary Scorecard

| Capability | Atlas Readiness | Adaptability | Priority |
|---|---|---|---|
| Agent lifecycle management | ★★★ Production | High | Day 1 |
| DAG execution engine | ★★★ Production | High — most extractable | Day 1 |
| Governance + audit layer | ★★★ Production | High — enterprise differentiator | Day 1 |
| Multi-tenancy | ★★★ Production | High — foundational | Day 1 |
| KB + RAG system | ★★★ Production | High — domain knowledge backbone | Day 1 |
| Human-in-the-loop / interrupt | ★★★ Production | High | Day 1 |
| Agent runtime + tool loop | ★★ Solid | Medium-High | Day 1 |
| Event trigger system | ★★ Solid | Medium | Day 1 |
| API gateway | ★★ Functional | Medium | Day 1 |
| Business mode UI | ★ Prototype | Medium (needs reskin) | Walk phase |
| Visual workflow designer | ✗ Not built | N/A — new build | Run phase |
| Connector catalogue | ✗ Not built | N/A — new build | Walk phase |
| Role hierarchy (4-tier) | ✗ Partial | Medium — needs extension | Walk-Run phase |
| Data intel query interface | ✗ Not built | N/A — new build | Run+ phase |

---

*Document prepared from the Atlas platform codebase analysis and customer engagement sessions — May 2026*
