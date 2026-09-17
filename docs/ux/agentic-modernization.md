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

### E-UX6 · Industry context — increment 3 (done)
Industry stored on the tenant and agent (not the browser); presets read industry packs; industry-filtered connector and template catalogs.

### E-UX7 · Information architecture — increment 3 (done)
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

## Increment 3 — industry on the tenant, and one agentic shell

Industry becomes a fact the platform holds, and `/astra` reads as one product rather than a conversation beside the
classic pages.

**Decisions (product owner, 2026-09-16).** The organization's industry is the default for everyone and for the server;
a person may still view another industry for themselves, labelled "Viewing as". Admins and compliance
(`manage_security`) set it; everyone reads it; changes are audited. Needs you shows every item: "Decide here" when Astra
can finish it, otherwise a link out with the reason. The Library leaves out the catalogues that aren't
organization-scoped yet.

**Industry on the tenant (E-UX6)**

- `organizations.industry_id`, `sub_vertical`, `workspace_config`, with who set it and when; `agents.industry_id`.
  No backfill from `deployments.industry`, which held an invented `"technology"`.
- `GET/PATCH /api/organizations/current`. Browsers adopt the organization's industry unless the person is viewing
  another; the setup wizard stops appearing once the organization has one and offers admins "Set this for everyone";
  the header shows "Viewing as" for a personal view.
- Astra grounds on the server-side industry: "{Org} works in X", a personal view named as one, and "not set for the
  organization" when there is none.
- New agents take the organization's industry. Every runtime path resolves an agent's industry (its own, then the
  organization's, then a real deployment industry) instead of reading a field that didn't exist and falling back to
  `"technology"`.
- Wizard presets and the design-time policy check read the industry packs. An industry with no known policy
  requirements says nothing was checked rather than passing. `?outcomeId=` on dynamic presets no longer fails.
- Agent templates, skills and enterprise integrations take an optional `?industryId=`; without it nothing changes.

**One shell (E-UX7)**

- Home briefing (`/api/astra/home`): counted rows for decisions waiting, runnable agents, outcomes, connectors and the
  industry. Each row asks Astra, so the fact comes back from a tool with its proof.
- Needs you (`/api/astra/needs-you`): the same data `list_needs_me` reads, with where each item is decided and why.
- `@` in the composer mentions an agent you can run; mentions travel as plain text.
- Library (`/astra/library`): conversations, agents, teams, outcomes, connectors, policies and process flows, each
  section organization-scoped and gated by role on the server.
- ⌘K / Ctrl+K: the first row sends what you typed; then conversations, library items and suggested prompts.
- Rail: Home · Needs you · Conversations · Your agents · Library, with the way back to the classic app.

**Left out on purpose**

- Cost and business-value figures on the home briefing: the rates behind them are invented, not measured.
- Agent templates, eval suites, eval runs and the full connector catalogue in the Library: they aren't scoped to an
  organization yet.
- Industry tags on integrations: the field exists, but tagging is a content decision.
- A `set_industry` tool: changing a tenant-wide setting needs an approval story first.
- Policies and process flows have no Astra tool yet, so their Library rows link out without "Ask".

**Live acceptance** (after deploy)

1. As admin in a browser with an old industry: the header offers "Set … for everyone"; setting it is audited.
2. A second user in a clean browser sees the industry with no wizard; a non-admin can read it but not change it.
3. Astra answers "what industry are we in" from the organization, and says plainly when none is set.
4. Dynamic presets return pack presets for `equipment_dealer` and no longer fail with `?outcomeId=`.
5. A wizard-created agent carries the organization's industry; an on-demand deployment no longer says "technology".
6. `/astra`: five-item rail, a briefing with no invented figures, a Needs-you item decided in the conversation and
   another that links out, `@` inserting a name without sending, a Library whose sections follow the role, and ⌘K
   sending a typed question. With the flag off, every new `/api/astra/*` route answers 404.
