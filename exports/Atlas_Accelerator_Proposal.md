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
- Auto-generated evaluation suite and test cases created at agent creation time

**Why it's adaptable:** The API gateway surface means the customer's portal calls a single REST endpoint per agent. Portal never needs to know which LLM, which tools, or which workflow the agent uses. Clean separation.

---

#### ★★★ Agent Creation — Blueprint Studio and Wizard
**Strength: HIGH — full authoring pipeline built**

Atlas has a complete end-to-end agent authoring pipeline covering blueprint design, structural validation, signing, and deployment. This is the capability PS engineers use to build agents during the Crawl phase, and which can be progressively exposed to client builders in the Run phase.

**Nine-step Agent Wizard:**

| Step | What happens |
|---|---|
| 1. Define Agent | Name, type, risk tier, department, compliance tags |
| 2. Start Path | Choose creation mode (from blueprint, from template, from scratch) |
| 3. Choose Blueprint | Select or fork an existing blueprint from the library |
| 4. Configure Tools | Bind tool definitions (REST calls, KB queries, MCP tools) |
| 5. Governance | Policy bindings, autonomy mode, tool access class |
| 6. Memory & Context | KB links, RAG config, memory governance rules |
| 7. Eval Suite | Auto-generated test cases from tool and blueprint config |
| 8. Rollout Plan | Canary percent, environment, rollback plan |
| 9. Review & Create | Final validation and agent record creation |

**Blueprint node types supported (compile-validated):**

```
llm_call        — LLM invocation with prompt binding
tool_call       — REST or MCP tool execution
rag             — Knowledge base retrieval node
classifier      — LLM-based or rule-based classification
router          — Conditional branch based on state
human_review    — Interrupt gate requiring human decision
schema_validate — Output structure validation node
```

**Blueprint lifecycle:**
1. `DRAFT` — created, editable
2. `COMPILED` — structural validation passed (nodes have valid IDs, types, and edge references)
3. `SIGNED` — signed by an authorised reviewer, locked for deployment
4. `DEPLOYED` — bound to an agent and running in production

**Agent key fields:**
- `modelProvider` / `modelName` — per-agent LLM selection (OpenAI, Anthropic supported; per-agent, not platform-wide)
- `systemPrompt` — base instructions injected before every run
- `maxToolIterations` — execution budget cap
- `toolsConfig` — typed REST or MCP tool definitions
- `memoryRagConfig` — KB link configuration, retrieval thresholds
- `policyBindings` — governance policy references
- `complianceTags` — HIPAA / PCI-DSS / SOX / GDPR / AML — auto-triggers memory governance profile creation
- `riskTier` — LOW / MEDIUM / HIGH — affects governance enforcement intensity

**Auto-setup at agent creation:**
- Memory governance profile created automatically when compliance tags are present
- Evaluation suite and initial test cases generated from tool config and blueprint nodes
- All without manual setup — the wizard drives it

**Why it's adaptable:** PS engineers use the full wizard. Client builders in the Run phase get a constrained version with only the steps and node types relevant to the packaging domain. The underlying create/compile/sign API is the same — only the UI surface differs.

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

#### ★★★ Outcome Contracts and ROI Measurement
**Strength: HIGH — production-built, enterprise-differentiating**

Atlas has a full outcome contract system that links agents to business KPIs, tracks attainment over time, and generates ROI estimates. This is one of the most differentiated capabilities for a customer pitch.

**Output Contract Enforcement** (per-agent, per-run):
- Every agent can declare a typed JSON output schema — the enforcer validates every response before it reaches the caller
- Four enforcement modes:
  - `strict` — reject invalid responses with an error
  - `strict_with_interrupt` — suspend execution and surface to a human reviewer
  - `lenient` — return a fallback output, log the failure
  - `monitor` — log and continue (for non-critical paths)
- Automatic repair loop — attempts to correct malformed LLM outputs before failing (configurable `maxRepairAttempts`)
- Quality scoring — validates not just structure but content quality against defined criteria
- UI: Output Contract Editor with live validate endpoint (`POST /api/output-contracts/:id/validate`)

**Outcome Contract System** (business-level, org-scoped):
- Outcome contracts define a business objective, linked KPIs, lifecycle status, and constraint graph
- KPI definitions include target values, attainment thresholds, and time-series tracking
- KPI attainment computed and bucketed in real time:
  - `at_risk`: attainment < 80%
  - `on_track`: attainment 80–100%
  - `exceeded`: attainment > 100%
- Outcome versioning — when an outcome changes (risk tier, SLA thresholds, KPI targets), Atlas automatically identifies non-compliant agents and writes audit events requiring reconfiguration

**ROI Estimation** (Outcome Discover flow):
- The Outcome Discover UI generates a proposal containing a structured ROI estimate:
  - `annualizedSavingsMin` / `annualizedSavingsMax` — range of expected annual savings
  - `paybackPeriodMonths` — estimated payback period
  - `assumptionsSummary` — narrative of assumptions used in the estimate
- KPI time-series evidence and snapshots are tracked against the outcome contract over time, providing realised-vs-estimated ROI comparison

**For the packaging industry, this maps directly to:**
- Order exception resolution: KPI = exception resolution time, escalation rate, auto-resolution %
- Inventory replenishment: KPI = stock-out frequency, replenishment cycle time, overstock ratio
- Log intelligence: KPI = mean-time-to-detect, issues surfaced per week, false positive rate
- Tier-1 support: KPI = first-contact resolution rate, average handle time, escalation volume

**Why it's adaptable:** This is the capability that lets the customer's sales team walk into an enterprise and say "here is what your agents will save you, and here is how we will prove it month by month." The outcome contract becomes the commercial SLA, not just an internal metric.

---

#### ★★★ Knowledge Base and RAG System
**Strength: HIGH — directly applicable to domain onboarding**

A complete knowledge ingestion, embedding, retrieval, and governance pipeline. This is the prerequisite layer for any agent that needs to reason over customer-specific domain knowledge.

**Ingestion prerequisites (what must be in place before KB works):**

| Prerequisite | Detail |
|---|---|
| PostgreSQL with pgvector extension | Required for semantic (vector) search. Atlas calls `ensurePgVector()` on startup and creates the `vector(1536)` column automatically if pgvector is available. |
| OpenAI API key (for embeddings) | Required for generating chunk embeddings using `text-embedding-3-small`. Without it, Atlas falls back to lexical ordering — functional but lower quality retrieval. |
| Source documents or URLs | Files up to 50MB per upload; URLs for web crawl. |

**Supported ingestion formats:**

| Format | How processed |
|---|---|
| PDF (`.pdf`) | Text extracted via `pdf-parse` |
| DOCX (`.docx`) | Converted HTML→Markdown via `mammoth`; tables preserved as Markdown |
| Markdown (`.md`) | Direct text ingestion |
| Plain text (`.txt`) | Direct text ingestion |
| CSV (`.csv`) | Ingested as structured text |
| JSON (`.json`) | Flattened to readable structured text |
| Web URL | Crawled via breadth-first queue with configurable depth and page limit; HTML tables→Markdown |

**Ingestion pipeline (step by step):**

```
1. Upload / register source  →  text extracted from file or URL
2. Normalize                 →  HTML tables → Markdown, JSON → structured text
3. Chunk                     →  512-token chunks, 50-token overlap; Markdown table rows
                                grouped intelligently
4. Embed                     →  OpenAI text-embedding-3-small; stored as pgvector(1536)
5. Index                     →  knowledge_chunks inserted; KB stats refreshed
                                (totalSources, totalChunks)
6. Sensitivity scan          →  ontology-defined sensitive terms flagged; policy
                                coverage checked; audit events logged
7. QA gate                   →  hard violations block promotion; soft warnings require
                                human acknowledgement
8. Human promotion           →  DRAFT → ACTIVE; promotion recorded with actor and
                                timestamp; downstream agents notified
```

**KB bundle governance:**
- Bundles move through `DRAFT → QA_CHECKED → ACTIVE` — no agent can be bound to a bundle until it is ACTIVE (human-promoted)
- QA checks validate: prohibited terms, missing source hashes, artifact completeness, segment coverage
- Every promotion action is immutably logged with promoter identity and timestamp

**RAG retrieval at agent runtime:**
- Agent runtime loads all KB bundles linked to the agent (`getAgentKnowledgeBases`)
- For each linked KB, semantic vector search runs against the agent's current prompt context
- Retrieval budget: up to 3 KB links, `topK` chunks computed from available token budget, score threshold default 0.3
- Query augmentation: ontology domain concept labels are appended to the query before embedding — improves domain-specific retrieval accuracy
- Retrieved chunks injected into the LLM system prompt as `## KNOWLEDGE BASE CONTEXT (retrieved via RAG)`
- Fallback: if pgvector search fails, lexical retrieval runs against recent chunks
- Provenance tracking: `retrieval_count` and `last_retrieved_at` updated per chunk and per source after every retrieval

**For the packaging industry, KB bundles would include:**
- Product documentation for each onboarded application (one bundle per product, versioned)
- Packaging industry standards and compliance references
- Distribution policies and SLA definitions
- Quality management rules and non-conformance procedures
- Client-specific overlays (each client's own specs, supplier agreements, pricing rules)

**Why it's adaptable:** The ingestion pipeline is format-agnostic and web-crawl capable — it can ingest product documentation directly from the customer's existing documentation URLs, no manual conversion needed. The bundle governance model ensures clients can never accidentally bind an agent to an unapproved KB version.

---

#### ★★★ Governance and Compliance Layer
**Strength: HIGH — enterprise differentiator**

A comprehensive governance stack that wraps every agent action, tool call, and LLM output.

- **Policy engine:** CRUD for governance policies, AI-assisted policy pack enhancement, org-scoped policy evaluation
- **Output contract enforcement:** Every agent can declare a structured output schema; the enforcer validates every response before it reaches the caller (see Outcome Contracts section above)
- **PII masking and rehydration:** Sensitive data is masked before LLM processing and rehydrated in the output — data never leaves the governance envelope unprotected
- **Tool-call governance proxy:** Every tool call passes through a governance proxy that checks policy, logs the action, and can block or redact
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

#### ★★ Agent Runtime and Tool Loop
**Strength: MEDIUM-HIGH**

The core LLM execution loop that powers every agent run.

- Supports Anthropic (Claude) and OpenAI with a unified provider abstraction
- Tool call loop with configurable max iterations
- Progress callbacks for real-time SSE streaming
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

---

#### ★★ Event-Driven Trigger System
**Strength: MEDIUM**

Configurable trigger framework for automated agent execution.

- Trigger types: `webhook`, `schedule`, `agent_completion`, `mcp_resource_change`
- Schedule-based triggers for recurring agents (nightly log digest, hourly anomaly scan)
- Webhook triggers for event-driven agents (order exception, stock threshold)
- Agent completion triggers for pipeline chaining

---

#### ★★ Business Mode UI
**Strength: MEDIUM — prototype-level, needs refinement for embedding**

A simplified operator-facing interface for non-technical users.

- Command centre dashboard — active agents, pending human gates, recent outcomes
- Outcomes view — agent results with business-friendly summaries
- Governance view — policy status, compliance alerts
- My Actions panel — items requiring human attention

---

### 2.2 What Atlas Does NOT Currently Have (Honest Gap Assessment)

| Gap | Impact | Phase to address |
|---|---|---|
| Visual drag-and-drop workflow designer (portal-embedded) | High — needed for client self-service | Run (12–18m) |
| Pre-built ERP / industry connector packs | High — needed from day one | Build in Crawl (PS effort) |
| White-label theming / portal embed kit | Medium | Walk (6–12m) |
| Role hierarchy below org level (builder / operator tiers) | Medium | Walk–Run |
| Connector catalogue / marketplace | Medium | Walk (6–12m) |
| Agent template library with fork-and-configure | Medium | Walk (6–12m) |
| Sandboxed test execution for client builders | Low-Medium | Run (12–18m) |
| Conversational data intel query interface | Low (Phase 4) | Run+ (18m+) |

---

## 3. Agent Creation — Full Prerequisites Checklist

Before a functional agent can be built and deployed in Atlas, the following must be in place. This is the onboarding checklist for each new customer tenant.

### Infrastructure Prerequisites

| Prerequisite | Required for | Notes |
|---|---|---|
| PostgreSQL database | All storage | Already part of Atlas stack |
| pgvector extension | KB semantic search | Auto-enabled by Atlas on startup if available |
| OpenAI API key | KB embeddings | Falls back to lexical retrieval without it — functional but lower quality |
| LLM provider credentials | Agent runtime | Anthropic (Claude) and/or OpenAI — per-agent selection |
| Atlas org provisioned | Multi-tenancy | One org per client; scriptable |

### Knowledge Base Prerequisites (before first agent run)

```
Step 1: Create KB collection          →  name, description, org scope
Step 2: Upload source documents       →  PDF, DOCX, MD, TXT, CSV, JSON or URL crawl
Step 3: Ingestion pipeline runs       →  auto: chunk → embed → index → sensitivity scan
Step 4: QA check                      →  hard violations must be resolved
Step 5: Human promotion               →  KB bundle moves DRAFT → ACTIVE
Step 6: Bind KB to agent blueprint    →  agent's memoryRagConfig references bundle
Step 7: Agent runtime retrieves       →  RAG on every invocation, injected into prompt
```

### Agent Blueprint Prerequisites

```
Step 1: Define node graph             →  at least 1 node with valid id + type
Step 2: Configure tool definitions    →  REST call definitions pointing to Kong routes
Step 3: Set model selection           →  modelProvider + modelName per agent
Step 4: Bind policies                 →  governance policies applied to this agent
Step 5: Compile blueprint             →  structural validation — catches broken edges,
                                        invalid node types, duplicate IDs
Step 6: Sign blueprint                →  authorised reviewer locks blueprint for deployment
Step 7: Create agent record           →  POST /api/agents with blueprintId reference
Step 8: Deploy                        →  canary or full rollout; runtime started
```

### Product API Prerequisites (per onboarded product via Kong)

```
Step 1: Kong route registered         →  product API accessible via Kong
Step 2: Auth configured in Kong       →  API key, bearer, or OAuth2 per product
Step 3: Tool definition created       →  HTTP tool definition in Atlas referencing Kong URL
Step 4: Tool added to blueprint       →  tool_call node in blueprint graph
Step 5: Test run                      →  PS engineer validates tool call in sandbox
Step 6: Published to catalogue        →  connector available to other agents and blueprints
```

---

## 4. Integration Architecture

### 4.1 Kong ↔ Atlas Integration Pattern

```
Customer's Unified Portal
  │
  │ REST (Atlas API Gateway — per-agent endpoint, API key auth)
  ▼
Atlas Agent Runtime
  │
  │ HTTP tool calls (typed REST definitions in blueprint, configured per agent)
  ▼
Kong API Gateway
  │
  ├── ERP module APIs            (order, pricing, contracts)
  ├── Inventory module APIs      (stock, warehousing, SKU)
  ├── Scheduling module APIs     (production scheduling, S&OP)
  ├── Distribution module APIs   (routes, logistics, TMS)
  ├── Quality module APIs        (non-conformance, lot records)
  └── Log aggregation APIs       (product event logs, error feeds)
```

**Key design principle:** Tenant identity (org ID) flows from portal → Atlas invocation context → Kong consumer header. Every agent call to Kong is scoped to the requesting client's tenant.

### 4.2 Three Agent Classes

#### Class 1 — Workflow Automation Agents
*Event-triggered, structured DAG, may include human gates*

| Agent | Trigger | Output |
|---|---|---|
| Order exception resolver | ERP webhook | Exception classified, routed or auto-resolved |
| Inventory replenishment adviser | Stock threshold event | Replenishment recommendation or draft PO |
| Delivery conflict detector | Schedule trigger | Conflict flagged, affected orders listed |
| Quality non-conformance triage | Quality system webhook | RCA draft + evidence package + routing |
| Tier-1 support resolver | Inbound query | Answer or structured escalation |

**Outcome KPIs to track:** Resolution time, auto-resolution rate, escalation volume, exception recurrence rate.

#### Class 2 — Log Intelligence Agents
*Schedule-triggered, multi-product log analysis, structured insight output*

| Agent | Trigger | Output |
|---|---|---|
| Product error digest | Nightly schedule | Structured error feed: severity, product, entity, action |
| SLA breach early warning | Hourly schedule | At-risk orders, breach probability, recommended action |
| Cross-product anomaly scanner | Schedule or threshold | Anomaly list with confidence score and context |

**Outcome KPIs to track:** Mean-time-to-detect, issues surfaced per week, false positive rate, SLA breach prevention rate.

#### Class 3 — Data Intelligence Agents (Phase 3+)
*Query-driven or alert-configured, cross-product, tenant-scoped*

| Agent | Trigger | Output |
|---|---|---|
| Fill rate insight agent | Client query or schedule | Fill rate by SKU, trend, comparison period |
| Stock turns dashboard agent | Schedule | Stock turns by product category, warehouse |
| Cross-product KPI agent | Client alert rule | Custom KPI value, threshold evaluation, alert |

**Outcome KPIs to track:** Query accuracy, adoption rate, insights-to-action conversion, client-reported value.

---

## 5. Phased Delivery Plan — Crawl / Walk / Run

### Phase 1 — Crawl (Months 0–6)
**Theme: Prove agent ROI on known, bounded workflows**

#### Atlas Light — what gets stood up

| Included | Deferred |
|---|---|
| Agent registry and lifecycle | Shadow replay studio |
| Blueprint builder (PS use only) | Canary deployment console |
| REST API gateway per agent | Advanced observability dashboards |
| Basic governance + audit log | Compliance certification layer |
| KB ingestion and RAG | Advanced ontology / knowledge graph |
| Agent runtime + HTTP tool calling | Multi-agent team orchestration |
| Multi-tenancy (org isolation) | Visual workflow designer |
| Output contract enforcement | Business mode UI (Walk phase) |
| Outcome contracts + KPI tracking | Full ROI realisation dashboard |
| Schedule + webhook triggers | Role hierarchy extension |

#### What PS engineers build

- HTTP tool adapters for first 3–4 product APIs (via Kong)
- 4–6 reference agents (Class 1 and Class 2)
- Starter KB bundles for each onboarded product (ingested, QA-checked, promoted)
- Output contracts defined for each agent — portal always receives validated structured JSON
- Outcome contracts with KPI targets defined — baseline for ROI tracking
- Portal integration shim — portal calls Atlas API gateway, Atlas returns structured JSON
- Per-client org provisioning script

#### What the portal gets

- Agent result cards (structured JSON rendered in portal's native components)
- Log intelligence digest panel
- Human gate modals for interrupt-gated workflows

#### Success metrics for Crawl

- ≥3 high-volume workflows automated end-to-end
- Outcome contracts active with baseline KPI measurements recorded
- Audit trail demonstrating full agent action provenance to at least one client
- First ROI estimate validated against early actuals

---

### Phase 2 — Walk (Months 6–12)
**Theme: Expand across products. Richer portal surfaces. Clients configure, not build.**

#### Atlas platform additions

| New capability | Description |
|---|---|
| Business Mode UI (reskinned) | Embedded command centre for client admins |
| Template library | Crawl agents published as reusable templates |
| Connector catalogue | Managed registry of available product API integrations per tenant |
| Tenant connector access control | Each org sees only their subscribed products |
| Agent versioning | Update live blueprints without downtime |
| Richer observability | Per-agent run history, KPI attainment dashboard |
| ROI realisation views | Outcome detail pages showing planned vs. actual KPI delivery |

#### Portal additions

- Command centre panel (reskinned Business Mode UI)
- Insight feed (multi-product, agent-generated)
- Configuration panels (form-driven agent parameter adjustment)
- KPI attainment dashboard — at-risk / on-track / exceeded per agent

#### End-customer self-service additions

- Alert threshold configuration (form-driven, no agent building)
- KB overlay upload (client-specific document ingestion, scoped to their org)

---

### Phase 3 — Run (Months 12–18+)
**Theme: Client self-service. Embedded workflow designer. Data intelligence at scale.**

#### Atlas platform additions

| New capability | Description |
|---|---|
| Role hierarchy | Platform admin → tenant admin → builder → operator |
| Visual workflow designer API | Blueprint authoring exposed for portal embedding |
| Sandboxed test execution | Agents run against historical data before publishing |
| Multi-agent orchestration | Agents that delegate to specialist agents |
| Data intel agent pattern | Cross-product query → structured answer or chart |

#### Portal additions — constrained workflow designer

```
Node types available to client builders:
  [Trigger]      Schedule / portal event / Kong webhook
  [Agent]        Select from template library
  [Decision]     LLM-evaluated or rule-based branch
  [Human Gate]   Approval / review step routed to a named role
  [API Call]     Direct call to subscribed product API
  [KB Query]     Retrieve context from assigned KB bundle
  [Alert]        Fire notification — in-portal, email, or webhook
  [Data Intel]   Natural language query → structured result
```

- Template fork-and-configure — builders start from PS templates
- Data intel query builder — guided form for cross-product KPI queries
- Alert rule builder — threshold conditions + evaluation schedule + notification targets

---

## 6. Component Extraction Map

For the embedded model — Atlas components extracted and run as services behind the customer's portal:

| Component | Extraction form | Phase | Strength |
|---|---|---|---|
| **DAG Execution Engine** | Standalone Node.js service | Crawl | ★★★ Most self-contained |
| **Governance / Policy Layer** | Middleware package | Crawl | ★★★ Wraps any LLM call |
| **Output Contract Enforcer** | Middleware / SDK | Crawl | ★★★ Portal output guarantee |
| **KB Ingestion + RAG** | Standalone service | Crawl | ★★★ PostgreSQL + pgvector |
| **Outcome Contract + KPI** | Standalone service | Walk | ★★★ ROI tracking backbone |
| **API Gateway** | Thin proxy service | Crawl | ★★ Or replace with portal's API management |
| **Agent Runtime + Tool Loop** | SDK / npm package | Walk | ★★ LLM provider abstraction |
| **Business Mode UI** | React component library | Walk | ★★ Needs reskin |
| **Interrupt Manager** | Service + webhook | Walk | ★★ Human gate integration |
| **Workflow Designer** | New build (portal-embedded) | Run | ★ Does not exist yet |
| **Connector Catalogue** | New build (portal-embedded) | Walk | ★ Management layer |

**Keep in Atlas (access via API, not embedded):**
- Blueprint builder — PS engineers use it directly
- Full observability and trace viewer — internal tooling for PS and platform support teams
- Policy management UI — managed by the customer's platform admin team

---

## 7. Key Architectural Decisions

### Decision 1 — Tenant identity propagation through Kong

```
Portal (client logged in)
  → Atlas API gateway (org ID in request context)
  → Agent runtime (org ID in execution context)
  → HTTP tool call (org ID as Kong consumer header)
  → Kong (enforces tenant-scoped API access)
  → Product API (returns only that client's data)
```

Design once, correctly, before any agent is built. All agents across all products inherit it automatically.

### Decision 2 — Agent output contract for the portal

Each agent class needs a defined JSON output schema. Portal UI team designs rendering components against the schema. Atlas's output contract enforcer validates every agent response before it reaches the portal. Schemas defined first; agents built to match.

### Decision 3 — Outcome contract baseline before go-live

For ROI measurement to be credible, outcome contracts and KPI baselines must be established before agents go live — not after. The pre-agent baseline (manual process metrics: resolution times, error rates, escalation volumes) becomes the comparison point. Atlas's outcome contract system captures both the estimate and the realised values.

---

## 8. Pitch Framing — Key Messages

**"Your portal, enhanced — not a new tool to learn"**
Atlas runs behind the customer's unified portal. Their clients see their familiar interface. The AI layer is invisible infrastructure.

**"We build the first agents; your clients build the next ones"**
Phase 1 is professional services. Phase 2 and 3 open a guided builder so larger clients can create agents within guardrails the customer controls.

**"Every automated decision is auditable — and measurable"**
The governance layer logs every action with full provenance. The outcome contract system tracks KPI attainment month by month — at-risk, on-track, or exceeded. ROI is not a claim; it is a dashboard.

**"Built to grow — 10 products today, 30 products tomorrow"**
The connector catalogue model means each new product adds to a shared library. The execution engine, governance layer, and KB system are unchanged. Onboarding product 11 is the same operation as product 2.

---

## 9. Summary Scorecard

| Capability | Atlas Readiness | Adaptability | Delivery Priority |
|---|---|---|---|
| Agent lifecycle management | ★★★ Production | High | Day 1 |
| Agent creation wizard (9-step) | ★★★ Production | High — PS use in Crawl, client use in Run | Day 1 |
| Blueprint studio (compile/sign) | ★★★ Production | High | Day 1 |
| DAG execution engine | ★★★ Production | High — most extractable | Day 1 |
| Outcome contracts + KPI tracking | ★★★ Production | High — commercial differentiator | Day 1 |
| Output contract enforcement | ★★★ Production | High — portal output guarantee | Day 1 |
| ROI estimation (Outcome Discover) | ★★★ Production | High — pre-sales and realisation | Day 1 |
| Governance + audit layer | ★★★ Production | High — enterprise differentiator | Day 1 |
| Multi-tenancy | ★★★ Production | High — foundational | Day 1 |
| KB ingestion + RAG | ★★★ Production | High — domain knowledge backbone | Day 1 |
| KB bundle governance (QA + promotion) | ★★★ Production | High — domain knowledge integrity | Day 1 |
| Human-in-the-loop / interrupt | ★★★ Production | High | Day 1 |
| Agent runtime + tool loop | ★★ Solid | Medium-High | Day 1 |
| Event trigger system | ★★ Solid | Medium | Day 1 |
| API gateway | ★★ Functional | Medium | Day 1 |
| Business mode UI | ★ Prototype | Medium (needs reskin) | Walk phase |
| Visual workflow designer | ✗ Not built | N/A — new build | Run phase |
| Connector catalogue | ✗ Not built | N/A — new build | Walk phase |
| Role hierarchy (4-tier) | ✗ Partial | Medium — needs extension | Walk–Run phase |
| Data intel query interface | ✗ Not built | N/A — new build | Run+ phase |

---

*Document prepared from Atlas platform codebase analysis and customer engagement sessions — May 2026*  
*Version 2 — updated to include Agent Creation capability, Outcome Contract / ROI system, and Knowledge Base prerequisites*
