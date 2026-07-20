# ASTRA Agents — User Manual (Cloud)

**App address:** https://astra-agents-artizent.azurewebsites.net
**Last updated:** July 2026

This manual walks you through the platform step by step, in plain language. It focuses on **Process Flows** — building a business process, turning it into a live AI automation, running it, and keeping humans in control.

---

## 1. Signing In

1. Open https://astra-agents-artizent.azurewebsites.net in your browser.
2. Enter your **username** and **password**, then click **Sign In**. (Your administrator creates accounts — there is no self-registration.)
3. First visit only: a "Select Your Industry Workspace" screen appears. Pick your industry, or click **Skip for now** to start with a blank Cross-Industry workspace. You won't see this screen again.
4. Your name and role appear in the top-right corner. Use the **Logout** button there when you're done.

> **What your role controls:** Admins can do everything. Builder roles (like Agent Engineer) can create and edit flows. Business roles (like Outcome Owner) can use agents in the Workspace and see results, but cannot edit flows or decide approvals — those buttons will be denied for them. This is by design.

---

## 2. The Big Picture

Three ideas cover most of the platform:

- A **Process Flow** is a drawing of your business process — the steps, the decisions, and where a human must approve.
- A **live automation** (also called a *team*) is that drawing brought to life: an AI orchestrator plus AI workers, one for each step.
- **Governance** keeps humans in charge: runs pause at approval steps, promotions between environments need a review, and every action is recorded in the audit trail.

The everyday loop is: **draw the flow → turn it into an automation → run it → approve when asked → read the results.**

---

## 3. Building a Process Flow

Go to **Build → Process Flows** in the left menu. You can build a flow two ways.

### 3.1 Describe it in English (recommended)

1. Click **Describe Workflow** (top right).
2. Type your process in plain English. Include the decisions and thresholds — the AI understands them. Example:

   > Customer refund process: When a refund request arrives, validate the order details and payment record. Then an analyst reviews the refund reason against our refund policy. Refunds over $200 need manager approval. If approved, process the refund and notify the customer; if rejected, notify the customer with the reason.

3. Click **Generate Flow**. In about 10–20 seconds the canvas fills with steps, connected in order, including **Decision** diamonds for your "if" rules and **Approval** steps for the human checkpoints. The badge at the top shows the count, e.g. `10 steps · 10 connections`.
4. Type a name for the flow in the name box (e.g. `Customer Refund Handling`).

**Tip:** Be explicit about branches ("If X… otherwise Y…") and amounts ("over $10,000"). The AI turns these into real routing rules — you'll see them written out in plain English later.

### 3.2 Build it by hand

1. Click palette buttons in order to add steps: **Trigger**, **Get Info**, **AI Reasoning**, **Decision**, **Approval**, **Action**, **Notify**, **End**.
2. Click a step, then rename it in the inspector panel (the **Label** field).
3. Connect steps: drag from the **dot on the right edge** of one step to the next step. The header badge counts your connections.
4. To add a rule to a branch, click the connection line and describe the condition.

### 3.3 Check your flow before going live

1. Click **Validate & Preview**.
2. An **Execution Plan** opens. Read it top to bottom — it shows the stages in the order they will run, which steps run in parallel, and every **branch point** with its condition in plain English, for example:
   - *Fraud Risk Assessment → Route to Investigations Unit [Fraud risk score is high]*
   - *Approval Threshold Check → Senior Adjuster Approval [Claim amount exceeds $10,000]*
3. If something looks wrong, close the dialog and fix the flow. If it looks right, you're ready to make it live.

---

## 4. Turning a Flow into a Live Automation

1. Click **Turn into a live automation** (top right), then **Draft it**.
2. Wait 1–3 minutes. A live progress panel shows what the AI is doing ("Gathering context…", "Drafting your team with AI…", with a running timer). Don't close the browser.
3. A **review screen** appears showing the proposed team: one orchestrator, one worker per step, and the routing rules between them written in plain English. Read the rules — this is your chance to catch anything odd.
4. Click **Create automation**. You land on the new team's page, ready to run.

> **If a step mentions an external system** (SAP, Salesforce, etc.): the AI may propose using that system's tools. If your organization hasn't connected that system under **Integrations**, the step will fail at run time with a clear message like *"Integration 'sap' is not connected."* Either connect the system first, or remove the tool from that worker agent (open the worker under **Agents → its page → MCP Servers** and unlink it). The step then runs on AI reasoning alone.

---

## 5. Running a Flow and Watching It Work

Everything you need is on the team's page, in the **flow lifecycle bar** near the top: **Edit Flow · Run Flow · environment badge · Promote**.

### 5.1 Start a run

1. Click **Run Flow**.
2. In the dialog, describe the case to process — write it the way the request would really arrive:

   > New claim: policy AUTO-448812, incident 2026-07-14. Parked SUV struck by a delivery truck; rear axle damage. Repair estimate: $18,500. Police report filed.

3. Click **Start Run**. The **run monitor** opens automatically.

### 5.2 Read the run monitor

- The **LIVE ACTIVITY** panel (pulsing LIVE badge) streams every step as it happens: "…started (wave 3/10)", "…finished in 4.2s" with a preview of what the step produced.
- Steps on branches that don't apply show as **skipped — "No incoming edge condition was satisfied."** That's the flow routing correctly, not an error. Example: a low-risk claim skips the fraud-investigation branch.
- When the run finishes, scroll to **"What This Run Produced"** — readable cards with the business results (amounts, decisions, notifications). The **Raw final state** toggle shows the full data underneath.

### 5.3 Understand the final status

| Status | Meaning |
|---|---|
| **Completed** | Every step ran successfully. |
| **Completed with skips** | Finished normally; some branch steps didn't apply (this is the usual result for flows with decisions). |
| **Failed** | At least one step genuinely failed — the step's row shows the exact reason. |

### 5.4 Find past runs

- On the team's page, the **Recent Runs** card (under the lifecycle bar) lists the last runs with time, progress, and status. Click any run to open its monitor.
- The same list also appears inside the flow editor (**Edit Flow** → bottom of the left panel).

---

## 6. Approvals — When the Flow Asks a Human

When a run reaches an **Approval** step, it pauses. You'll see it in the live feed: *"Paused — waiting for a human decision."*

1. Go to **Govern → Approvals** (or click the **Review** button on the run's banner).
2. Open the pending item — it's named after the approval step (e.g. "Senior Adjuster Approval").
3. Read the context, then click **Approve** or use **Reject + Follow-up**. You can also **Approve with Constraints** or **Request Changes**.
4. Go back to the run monitor — the run resumes within seconds and continues down the approved path.

**Rules to remember:**
- Approvals **expire after 30 minutes**. If nobody decides, the run fails honestly with "Gate timed out" — rerun the flow when someone is available.
- A **rejection stops the run** down that path. There is no "continue anyway" for a decision nobody made.
- Anyone with an approver role can decide — it doesn't have to be the person who started the run.

---

## 7. Promoting a Flow Toward Production

Flows move through environments in order: **staging → pilot → prod**. Each hop needs a human review.

1. On the team's page, check the environment badge in the lifecycle bar (e.g. **staging**).
2. Click **Promote to pilot**.
3. The bar shows an amber **"Awaiting deployment approval — review in Governance"**. The flow keeps running in its current environment; the new environment is not live yet.
4. Go to **Govern → Approvals**, open the **deployment review** item (named like "…v1.0.0 → pilot"), and click **Approve**.
5. The new deployment activates as a **canary rollout** (starting at a small percentage of traffic) and the badge advances. Promotion to **prod** works the same way but with a stricter *launch readiness* review.

---

## 8. Everyday Use: The Workspace

The **Workspace** (left menu) is where business users ask agents to do work without touching any builder screens.

1. Open **Workspace**, pick an agent from the list (you only see agents your role is allowed to use).
2. Type your request in plain language and send it.
3. Watch the live timeline. If the agent needs permission for an action, an **approval card appears right in the conversation** — approve as-is, edit the details first, or deny.
4. The answer appears when the run completes. **My Work** keeps your history with costs and a full trace.

> **Note:** Asking a *flow team* a general question that doesn't match its process may return "Team pipeline completed with no text output" — flows are built to process cases, not to chat. Use a single agent for open questions.

---

## 9. Knowledge Bases — Give Agents Your Documents

1. Go to **Knowledge** → **Create Knowledge Base**. Name it (e.g. "Refund Policy KB").
2. Open it and add sources: paste text, upload a file, or point at a URL. Wait a minute — the status changes to **processed** when the content is indexed.
3. Use the built-in **search** box to sanity-check retrieval: ask a question and confirm the right passage comes back.
4. Link the KB to an agent (on the agent's page, Knowledge Base section). From then on, that agent answers using your documents and cites the facts in them.

---

## 10. Guardrails Worth Knowing

- **Budget caps:** a team can carry a per-run cost limit. If a run exceeds it, the platform stops the run with a clear budget message instead of silently spending more.
- **Schedules:** on an agent's page, the **Triggers** section can run the agent on a timer using cron format (e.g. `0 8 * * 1-5` = weekdays at 8:00 UTC). The schedule fires automatically — check the agent's runs to see the results.
- **Permissions:** builder and governance actions are enforced on the server. If your role isn't allowed to do something, you'll get a clear "denied" response — ask an admin if you believe you need the access.
- **Audit trail:** every run step, tool call, approval, and promotion is recorded and cryptographically signed. **Govern → Audit Trail** shows the history.

---

## 11. Troubleshooting

| What you see | What it means | What to do |
|---|---|---|
| Step failed: *"Integration '…' is not connected"* | The step's agent references an external system your org hasn't connected. | Connect it under **Integrations**, or unlink the tool from the worker agent (Section 4 note). |
| Step failed: *"MCP API … returned 404"* | The step's agent references a tool that doesn't exist on the connected system. | Unlink that tool server from the worker agent and rerun. |
| Both branches of a decision skipped, run failed | The decision's rule didn't match the step output. Open **Edit Flow**, click the branch connection, and check the rule's field and value against what the previous step produces. | Adjust the rule and rerun. (Recent platform versions match text values regardless of capitalization, which prevents the most common cause.) |
| Run stuck on "Paused — waiting for a human decision" | An approval is pending. | Decide it in **Govern → Approvals** within 30 minutes. |
| "Gate timed out" | Nobody decided the approval within 30 minutes. | Rerun the flow when an approver is available. |
| First run after a maintenance window is slow | The first AI call after a restart can take extra time. | Let it finish; later runs are fast. |
| "Team pipeline completed with no text output" | You asked a flow team something outside its process. | Ask a single agent instead, or start a proper flow run with a real case. |

---

## 12. Try It Yourself — Practice Scenarios

Step-by-step practice scenarios (with paste-ready inputs) are in [uat-process-flow-scenarios.md](uat-process-flow-scenarios.md). They cover: creating a flow from a description, building one by hand, running with live streaming, approving a gate, promoting environments, and editing a flow safely.

A worked complex example lives on the cloud site itself: **Agents → "Auto Claim Intake & Triage Orchestrator"** — an insurance claims flow with fraud screening, a $10,000 approval threshold, and settlement/rejection branches. Its run history shows a complete $18,500 claim: paused at the adjuster gate, approved by a human, settled and notified.
