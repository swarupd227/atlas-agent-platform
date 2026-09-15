# Astra Workspace — Agentic UX Modernization

*Backlog and working agreement · started 13 September 2026*

## Why

Repeated feedback: the platform starts well with Outcome Builder, then turns into a web app — 134 routes, 47 sidebar
links, 25 tabs on one agent page — and no language model in the product can act on the user's behalf. Nothing is wrong
with the underlying services; what changes is the primary surface.

**The model:** you talk to Astra, and your agents talk back. A conversation carries an outcome from its first sentence
to running, observed agents. Pages are not the navigation model; they become artifact views that cards open.

This supersedes the navigation approach of [Phase 1: IA, Personas & Design Principles](phase1-ia-personas.md), which
hid menu items per persona. That document's vocabulary map, Level 0/1/2 progressive disclosure (now: message → card →
full view) and Learning-Mode prompts ("you approve this a lot — automate it?") carry forward.

## Rules (every screen, card and message)

1. Natural language is the primary way to do anything. Buttons inside artifact views perform the same actions.
2. Every fact comes from a tool call in the same turn. Tool calls stay on the message as sources.
3. State-changing actions pause on a **Confirm / Not now** card that names the action and its inputs. Permissions are
   enforced on the server; the interface only hides what a role cannot do.
4. Long runs narrate themselves into the thread. Nobody polls a page.
5. Results are explained in a sentence or two, then shown as a card.
6. Plain language in the content, not just the chrome.
7. Honesty over polish: failures give the reason; anything not measured says "not measured".
8. One accent (volt `#FFDD00`): an agent is working, the primary action, focus.
9. Motion signals live work and arrival only.
10. Nothing breaks what exists: routes, test ids and labels stay.
11. **Every result proves itself three ways** — a proof strip with *compliance* (gate result, policies, audit record),
    *context* (what the agent knew, tokens against budget) and *industry* (pack, concepts, regulations). An empty
    segment says so.

## Decisions

| Decision | Choice |
|---|---|
| Platform voice | One voice, **Astra**. The named cast is the customer's own agents, @-mentionable. |
| Where it lives | New `/astra` shell behind the `ASTRA_WORKSPACE_ENABLED` flag, alongside the current app. |
| Visual identity | Artizent agentic palette: dark-first, volt accent, sand neutrals — scoped to the shell. |
| Orchestrator model | Claude Sonnet 5 (`ASTRA_MODEL` override), GPT-4.1 fallback. |
| Tool granularity | Intent-sized tools (~45 core, studio packs loaded by context), never the raw API. |
| How platform tools are governed | A thin Astra dispatcher: role permission, confirm gate, hash-chained audit. Connector calls only ever happen inside an agent run, which goes through the full tool gate chain. |
| Astra as a governed agent | Deferred (E-UX2.4) until agent lists can exclude a platform agent cleanly. |
| Read-only connector access | Agent-scoped strict `blockedTools` policy listing the connector's write tools. |

## Epics

### E-UX1 · Shell — increment 1
- **1.1** `/astra` route with its own layout (rail · thread · artifact pane), feature flag, "Try Astra" entry in the current sidebar.
- **1.2** Persisted, organization-scoped threads and messages; reload restores the same state.
- **1.3** Thread: messages, working row, confirm card, suggestion chips, composer; streamed turns.
- **1.4** Artifact pane with a card registry; "Open full view" links to existing pages.

### E-UX2 · Orchestrator — increment 1
- **2.1** Turn engine with stable tool names, pause/resume on confirm, error → failed, org check and compare-and-swap on resume, capped history.
- **2.2** Tool registry filtered by role; `use_astra` permission for every role.
- **2.3** Deterministic scripted brain for tests and demos.
- **2.4** *(later)* Register Astra as a governed agent: mandate, evals on golden conversations, audit as "Astra, on behalf of".

### E-UX3 · Core lifecycle tools — increments 1–2
- **Inc 1:** `list_agents`, `get_agent`, `find_connectors`, `get_industry_context`, `attach_connector` (confirm, optional read-only), `run_agent`, `get_run`, `finish_turn`.
- **Inc 2:** `discover_outcome`, `create_outcome`, `list_outcomes`, `decide_approval`, `list_needs_me`, `propose_team`, `build_team`, `verify_wiring`, `run_team`, `get_team_run`.

### E-UX4 · Narration — increment 2
Team-proposal progress, team (DAG) run events and job progress posted into the thread by the agent doing the work.

### E-UX5 · Proof strip — increments 1–3
- **Inc 1:** proof envelope on every tool result; honest "not measured".
- **Later:** per-layer context usage recorded for Workspace runs; tool-call audit records correlated to runs; "What it knew" card.

### E-UX6 · Industry context — increment 3
Industry stored on the tenant and agent (not the browser); presets read industry packs; industry-filtered connector and template catalogs.

### E-UX7 · Information architecture — increment 3
Home briefing, Needs-you inbox, @-mentioning your agents, Library (one index of everything), five-item rail, natural-language ⌘K.

### E-UX8 · Studio packs — increment 4+
Tool packs loaded by context: Skills, Flows, Templates & Journeys, Ontology & Graph, Knowledge, Evaluation, Governance, Deploy & Operate, Publish.

### E-UX9 · Converge — increment 5+
One run engine shared by Workspace, Playground and Astra; one workflow concept (a team with a flow); duplicate pages retired into artifact views.

### E-UX0 · Honesty prerequisites — before the tools that read them
- Figures that are generated rather than measured are labelled or removed before Astra can narrate them.
- Team build assigns created agents to the caller's organization.
- Deploy & Run no longer marks pipeline stages as passed on its own; Playground approvals are enforced, not conversational.

## Increment 1 — walking skeleton (done, live-verified)

Proves the whole loop behind the flag without touching the live Workspace or Playground:

1. Engine core and scripted brain (no routes).
2. Persistence, routes and read tools.
3. Confirm loop and `attach_connector`.
4. `run_agent` and `get_run`.
5. Client shell.

**Live acceptance:** ask which agents can reach Dealer Operations; attach it read-only through a Confirm card (link,
policy and audit record verified); ask an agent for RIDGELINE CONTR LLC's open AR and get the $284,000 branch split;
reload restores the thread; another organization cannot open it.

## Increment 2 — outcome to running team, in one conversation

The golden journey without leaving the thread: describe a goal, create the outcome, approve its review, propose and
build a team, check its wiring, and run it through its approval gates.

**Decisions.** A team is built only after its outcome's review is approved (`decide_approval` lets an approver do that
in the conversation). Starting a team run asks for confirmation. A team whose wiring has blockers does not start.
Astra never deploys anything.

**Prerequisites delivered with it**

- KPI current values record where they came from (`kpi_definitions.value_source`); estimates are no longer saved as
  values, and a value without a source reads "not measured".
- Team building, outcome creation, team proposal, My Actions and the team-graph rules moved out of their routes into
  services the routes and Astra share (`server/team-build.ts`, `outcome-create.ts`, `team-proposal.ts`,
  `my-actions-build.ts`, `team-graph-validate.ts`, `approval-decision.ts`).
- A team built from a proposal, and a team run's approval gates, belong to the organization that owns them.
- A proposal honours the user's stated requirements, and the placeholder starter flow of a new outcome isn't presented
  to the planner as a business process.

**Honesty rules applied.** Catalog figures and health scores stay out of outcome grounding; KPI baselines nobody gave
are stored as unknown; planner impact estimates are labelled as estimates; run-derived KPI values are labelled as
proxies; a step's raw output is never narrated, only its status.

**Live acceptance** (as an admin in `/astra`)

1. Describe a goal with KPIs and a rule ("a person approves before …"): `discover_outcome` grounds it, a Confirm card
   creates it pending review with the rule as a constraint.
2. Approve the review in the thread: the outcome moves to awaiting its agent plan.
3. Propose a team: progress narrates; the plan includes the requested approval gate; connector issues are listed.
4. Build it on Confirm: agents and blueprint in the organization, nothing deployed.
5. `verify_wiring`: run order, blockers and warnings, where it pauses.
6. Run it on Confirm: steps narrate; the gate appears as a card; Confirm continues to the answer; the run card links to
   the run monitor.
7. `list_outcomes` and `list_needs_me` show honest values.
