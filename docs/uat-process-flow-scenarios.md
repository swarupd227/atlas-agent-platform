# Process Flow Module — Self-Service Test Scenarios (UAT)

Preconditions for all scenarios:
- Dev server running at `http://localhost:5000`
- Workspace: **Cross-Industry** · Role: **Admin** (top-right header)
- After a fresh server start, run any one flow once and discard the result — the
  first LLM call after a cold start can hit 30-second step timeouts.

---

## Scenario 1 — Create a flow by describing it in English, and make it live
*Proves: AI flow generation → team creation → auto-deploy.*

1. Go to **Build → Process Flows**.
2. Click **Describe Workflow** (top right). Paste:
   > Customer refund process: When a refund request arrives, validate the order details and payment record. Then an analyst reviews the refund reason and checks it against our refund policy. Refunds over $200 need manager approval. If approved, process the refund and notify the customer; if rejected, notify the customer with the reason.
3. Click **Generate Flow** (~10s).
   - Expect: ~9–11 steps on canvas, including a **Decision** ($200 threshold) and an **Approval** (manager), with edges drawn.
4. Name the flow `Customer Refund Handling`.
5. Click **Validate & Preview**.
   - Expect: Execution Plan dialog — stages + at least 1 branch point with approve/reject conditions. Close it.
6. Click **Turn into a live automation** → **Draft it** (~1–2.5 min, live progress shown).
7. Review the proposed orchestrator + workers, click **Create automation**.
   - Expect: land on the new team's page; toast "Automation created and deployed"; **flow lifecycle bar** shows *Edit Flow · Run Flow · staging · Promote to pilot*.

**Pass if:** lifecycle bar present, environment badge = **staging**.

---

## Scenario 2 — Build a flow manually on the canvas
*Proves: palette add, inspector editing, drag-to-connect.*

1. **Build → Process Flows** (click **Clear** if needed).
2. Palette clicks in order: **Trigger**, **Get Info**, **AI Reasoning**, **Approval**, **End**.
3. Click each box; rename via inspector **Label**: `Invoice Received` → `Fetch PO Details` → `Match Invoice to PO` → `Finance Sign-off` → `Invoice Booked`.
4. Connect: drag from the **right-edge dot** of each box to the next (4 connections).
   - Expect: header badges show `5 steps · 4 connections`.
5. Name it `Invoice Matching`, click **Validate & Preview** → 5 stages, no errors.
6. Optional: continue with **Turn into a live automation** as in Scenario 1.

**Pass if:** dragging between dots creates visible edges; validation succeeds.

---

## Scenario 3 — Run a flow and watch it work live
*Proves: Run Flow from the team page, streaming activity feed.*

1. **Agents** → open **Campaign Content Planning Orchestrator** (or your Scenario-1 team).
2. Lifecycle bar → **Run Flow**. Paste:
   > New campaign request: promote our smart water bottle to university students, budget $80K, launch in September. Produce the content plan and briefs.
3. Click **Start Run**.
   - Expect: run monitor opens; **LIVE ACTIVITY** panel with pulsing LIVE badge; lines stream in — "…started (wave 1/7)", "…finished in 4.2s → {output preview}".
4. Watch for a minute — steps complete in ~2–10s each.

**Pass if:** step lines with durations and output previews appear *while* the run is going.

---

## Scenario 4 — Approve the human gate and read the results
*Proves: HITL gate pause, Governance approval, readable outputs. Continues Scenario 3.*

1. At **Concept Brief Approval** the feed shows an amber "Paused — waiting for a human decision" line and a banner appears.
2. **Within 30 minutes** (gates expire by design), click the banner's **Review** button → approval detail page.
3. Click **Approve**.
4. Go back to the run monitor.
   - Expect: feed resumes in seconds; remaining waves complete; green "Run completed" line.
5. Scroll to **"What This Run Produced"** — readable cards (campaign name, concepts, briefs), raw JSON behind the "Raw final state" toggle.

**Alternative (honesty test):** repeat and click **Reject** — the run must end **Failed** with a clear gate-rejected reason.

---

## Scenario 5 — Promote a flow toward production
*Proves: environment ladder with governance.*

1. **Agents** → **Campaign Intake & Approval Orchestrator** (in staging).
2. Lifecycle bar → **Promote to pilot**.
   - Expect: toast "Flow promoted — now running in pilot"; bar shows **pilot · "Awaiting deployment approval — review in Governance"** (amber). Promotions create a deployment review; they don't silently go live.
3. **Deployments** page: staging deployment = *promoted*, new *pilot* one = *pending*.
4. Optional: **Governance → Control Points** (Refresh) → approve the deployment review to complete the hop.

**Pass if:** one-click promote + honest pending-approval state.

---

## Scenario 6 — Edit a flow's steps safely
*Proves: simplified Blueprint screen (Team Flow only), visible step-adding.*

1. From any campaign team's page → **Edit Flow**.
   - Expect: lands directly on the **Team Flow** editor — no "Single-Agent Blueprint" tab, no empty canvas.
2. Palette → **Internal Agent**.
   - Expect: toast "Step added — …added at the end of the flow"; page scrolls to the new highlighted step.
3. Delete the test step via its trash icon.
4. Toggle **Business** / **Technical** (top right): step names switch between plain-English labels and technical names.

**Pass if:** step-add is visibly confirmed; the legacy tab is gone.

---

### Known behaviors (not bugs)
- Approval gates expire after **30 minutes** without a decision; the run then fails honestly with "Gate timed out".
- The **first run after a server restart** may show one or two 30s step timeouts (LLM cold start); the flow continues and later steps are fast.
- A rejected gate **halts** the run — that is deliberate; there is no "continue anyway" for a decision nobody made.

### Reference — demo assets
- Guided auto-demo: `node scripts/demo-flow-lifecycle.mjs` (server must be running)
- Campaign teams: Stage 0 Intake `3ad0ffcd…`, Stage 1 Planning `81f69dbe…`, Stage 2 Content Planning `91578bdf…`, Stage 3a Copy `ca94f53c…`, Stage 3b Visual `52414114…`
