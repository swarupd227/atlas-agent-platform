# ATLAS Business Mode — Phase 1: IA, Personas & Design Principles

*UX Architecture Specification — April 2026*

---

## 1. Problem Statement

The current ATLAS platform presents 33+ navigation items and 80+ routes to all users by default. A VP of HR wanting to approve an agent action or track an outcome should never see the same sidebar as an AI engineer deploying an MCP server. Technical language ("MCP Server", "RAG Pipeline", "Canary Deployment", "Ontology Explorer") creates cognitive overhead and drives dependency on IT for tasks that business users should own.

**Core design principle**: Show the car before the engine. Lead with business outcomes, not technical plumbing.

---

## 2. The Three Personas

### Persona A — Business Owner (Executive / Outcome Owner)

**Representative role**: VP of HR, CFO, VP of Operations, line-of-business director

**Job-to-be-done**: "I want to know if my AI initiatives are working, approve things that need my sign-off, and kick off new projects — without filing an IT ticket."

**Mental model**: Outcomes → Status → Actions needed from me

**Pain points with current UI**:
- Overwhelmed by technical terminology (MCP, RAG, Canary, Ontology)
- Can't find the approval queue without navigating through 4 screens
- No clear "what do I need to do today" view
- KPI progress buried under agent engineering details

**Navigation needs** (4 items maximum):
1. **Home** — My dashboard (outcomes summary + pending actions at a glance)
2. **Outcomes** — What are my AI initiatives working toward?
3. **My Actions** — What needs my attention or sign-off?
4. **Settings** — Basic preferences only

**Never sees**: Agents, Knowledge Bases, Deployments, Monitor, Fleet Health, Governance, Integrations, Pipelines, Blueprints, Templates, Skills, Context Engine, Memory Manager, RAG Pipeline, Knowledge Graph, Evaluations, Shadow Replay, Canary Deployment, Optimization, Healing Center, Runbooks, Autonomy Engine, Oversight Console, Audit Trail, Model Providers, Developer Portal, Billing, Ontology, Admin

---

### Persona B — Operations Manager (Day-to-Day Runner)

**Representative role**: Operations Manager, Chief of Staff, Process Owner, Department Head

**Job-to-be-done**: "I need to keep things running, catch issues before they escalate, and understand why an agent is recommending something."

**Mental model**: Status → Trends → Escalation

**Pain points with current UI**:
- Too many engineering-level details mixed with operational signals
- Observability alerts are technical; needs plain-English summaries
- No way to see "what's happening this week" in one view

**Navigation needs** (6–8 items):
- Everything Persona A sees, plus:
- **Activity** — Operational monitoring feed (simplified, no raw logs)
- **Escalations** — IT-bound issues and what's been handed off

**Never sees**: Full builder stack (RAG Pipeline, Blueprints, Context Engine, Memory Manager, Canary Deployment, Shadow Replay, etc.)

---

### Persona C — Builder / IT (Current Full Experience)

**Representative role**: AI Engineer, Agent Engineer, Platform Admin, Ops/SRE, Compliance Officer

**Job-to-be-done**: "I need to build, deploy, monitor, and govern the AI agents that power the business outcomes."

**Navigation**: Unchanged — all 33+ items, full advanced section

**No changes to this persona's experience.** This is the current ATLAS IT app.

---

## 3. Navigation Architecture

### Business Owner Navigation (4 items)

```
┌─────────────────────┐
│  ⚡ ATLAS Business  │
├─────────────────────┤
│  🏠  Home           │
│  🎯  Outcomes       │
│  ✅  My Actions  [3]│
│  ⚙️   Settings      │
├─────────────────────┤
│  Switch to IT View →│  (mode toggle, footer)
└─────────────────────┘
```

### Operations Manager Navigation (7 items)

```
┌─────────────────────┐
│  ⚡ ATLAS Business  │
├─────────────────────┤
│  🏠  Home           │
│  🎯  Outcomes       │
│  ✅  My Actions  [3]│
│  📡  Activity       │
│  🔺  Escalations    │
│  📊  Reports        │
│  ⚙️   Settings      │
└─────────────────────┘
```

### IT / Builder Navigation (unchanged)

Current full sidebar with 33+ items — see `client/src/components/app-sidebar.tsx`

---

## 4. Vocabulary Map — IT Terminology → Business Language

| IT Term | Business-Friendly Equivalent | Treatment |
|---|---|---|
| Agent | Digital Worker | Replace |
| MCP Server | (hidden entirely) | Hide |
| RAG Pipeline | (hidden entirely) | Hide |
| Canary Deployment | (hidden entirely) | Hide |
| Shadow Replay | (hidden entirely) | Hide |
| Ontology Explorer | (hidden entirely) | Hide |
| Memory Manager | (hidden entirely) | Hide |
| Context Engine | (hidden entirely) | Hide |
| Knowledge Graph | (hidden entirely) | Hide |
| Eval Datasets | (hidden entirely) | Hide |
| Approval Gate | Needs your review | Replace |
| Autonomy Engine | (hidden entirely) | Hide |
| Oversight Console | (hidden entirely) | Hide |
| Drift Detection | Performance change flagged | Replace |
| Blueprint | (hidden entirely) | Hide |
| Deployment | (hidden entirely) | Hide |
| Health Score | Reliability | Replace (as %) |
| Risk Tier | — | Replace with traffic light |
| Observability Alert | Something needs your attention | Replace |
| Outcome Contract | AI Initiative | Replace |
| KPI | Goal | Replace |
| Autonomy Mode | Supervised / Automatic | Replace |
| Learning Mode | Learning Mode | Keep (new term for supervised agents) |
| Outcome Discovery | Start a new outcome | Replace |
| Fleet Health | (hidden) | Hide |
| Governance | (hidden) | Hide |
| Runbook | (hidden) | Hide |
| Healing Center | (hidden) | Hide |
| Incident | Issue flagged | Replace |
| P95 Latency | (hidden) | Hide |
| SLA | On Track / At Risk | Replace |

---

## 5. Progressive Disclosure Rules

### Rule 1 — Lead with impact, not mechanism

Show business outcomes first. Hide the infrastructure that powers them until the user drills in.

**Example**: An outcome card shows "Invoice cycle time reduced by 34%" — not "Agent PROC-001 completed 847 tool calls with 98.2% success rate."

### Rule 2 — Action-first design

Every screen answers: "What do I need to do?" before "What is the system doing?"

### Rule 3 — Depth on demand

Technical details are available 2 clicks deep, never on the first view:
- Level 0 (default): Plain English status + recommended action
- Level 1 (one click): What changed, why it matters, business impact
- Level 2 (two clicks): Technical detail, agent trace, full log

### Rule 4 — Context-appropriate escalation

If a user has dismissed or skipped an agent recommendation 2–3 times, show an escalation card: "Want to involve IT to tune this?" — never escalate automatically without business user consent.

### Rule 5 — Automation progression

After a business user approves 5+ identical action types → prompt: "This happens a lot. Want to automate it so you don't have to approve every time?"

### Rule 6 — Mode switching

Every Business Mode view shows a persistent but unobtrusive toggle in the footer: "Switch to Advanced View" — this takes the user to the full IT app without any data loss.

---

## 6. Mode Switching Concept

There are three distinct modes, each a role-appropriate surface for the same underlying data:

```
Business Owner Mode  ←→  Operator Mode  ←→  Builder / IT Mode
     (4 nav items)          (7 nav items)        (33+ nav items)
```

### The Three Modes

| Mode | Who | Access to switch to |
|---|---|---|
| **Business Owner** | VP, Director, Exec | Operator, Builder/IT |
| **Operator** | Ops Manager, Chief of Staff | Business Owner, Builder/IT |
| **Builder / IT** | AI Engineer, Platform Admin | Business Owner, Operator |

### How Switching Works

The Business Mode sidebar always shows a **"Switch Mode"** section in its footer with two links:
- **Operator View** — expands operational monitoring (Activity, Escalations, Reports); same business vocabulary
- **Builder / IT View** — opens the full ATLAS IT platform in a new tab

Permission logic:
- **Any user can switch down** (to a simpler view) at any time
- **Switching up** (to a more powerful view) requires the user to have that role assigned in their org
- If a user lacks the role for the target mode, they see the link greyed out with tooltip: "Contact your IT admin to enable access"

Implementation:
1. **Same backend, different surfaces** — All modes share the same database and API
2. **Role stored in JWT claim** — `user.businessMode` ∈ `["business", "operator", "builder"]`
3. **Business ↔ Operator** — In-app transition (same origin, different route prefix)
4. **→ Builder/IT** — Cross-domain link to the IT app (`agent-lifecycle-management-platform.replit.app`)
5. **Role preservation** — Org context and auth tokens are preserved across all transitions

Business users can always escalate upward to see more. IT users can access Business Mode to understand what their clients see and verify the business-friendly experience.

---

## 7. Learning Mode (New Concept)

When an agent is deployed in Business Mode, it starts in **Learning Mode** — a supervised state where:
- All actions require approval (equivalent to `autonomy_mode: "supervised"`)
- Actions are presented as business-friendly suggestion cards, not technical approval queues
- Language used: "Your Digital Worker wants to do something — approve or change it"
- After 5 approvals of the same action type: automation prompt
- After 2–3 rejections or skips: IT escalation card

This maps to the existing backend `supervised` autonomy mode but uses entirely different UI language.

---

*Next: Phase 2 (Task #148) implements this IA as the Business Mode Shell & Navigation component.*
