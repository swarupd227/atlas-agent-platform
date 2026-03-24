# Hearst NBA Email Orchestration — Demo Script

**Audience:** Prospective enterprise client or executive stakeholder  
**Duration:** 5–8 minutes  
**Location:** `/demo/hearst` in the ATLAS platform  
**Purpose:** Demonstrate live, multi-agent AI orchestration making 2.4 million email SEND/HOLD decisions nightly across 8 Hearst brands

---

## Before You Start

Work through this checklist before the call or screen share begins:

- [ ] Open the app in a fresh browser tab and navigate to `/demo/hearst`
- [ ] Confirm the top banner shows **"Hearst NBA Email Orchestration"** with a green **Live** badge
- [ ] Confirm the Pipeline Header (5 agent cards with arrows between them) is visible below the banner
- [ ] Have the ATLAS home page (`/`) open in a second tab so you can pivot to the platform pitch at the close
- [ ] If you ran the pipeline earlier, the Pipeline Header will already show real timestamps — point this out proactively as evidence the system is always running
- [ ] Note: the first live pipeline run takes approximately 3–4 minutes. If time is tight, pre-run the pipeline before the meeting and walk through the results, narrating what each agent did

---

## Segment Overview

| # | Segment | Action | Time |
|---|---|---|---|
| 1 | Context setting | Introduce the problem | 30 sec |
| 2 | Pipeline Header | Walk the 5-agent pipeline | 90 sec |
| 3 | Live Run | Click the button, narrate the feed | 3–4 min |
| 4 | Command Center | Show real AI-generated metrics | 60 sec |
| 5 | Supporting screens | Brief tour of screens 2–6 | 60–90 sec |
| 6 | ATLAS close | Tie back to the platform pitch | 30 sec |

---

## Segment 1 — Context Setting

**What to do:** Stay on the Command Center (default view). No clicks needed.

**What to say:**
> "Hearst publishes to 6.2 million email subscribers across 8 brands — Cosmopolitan, Elle, Esquire, Good Housekeeping, and others. Every night, before emails go out, someone — or something — has to decide: for each of those 6.2 million people, do we send today? Which piece of content? And at what time? That's 2.4 million decisions per run. What you're looking at is that decision engine, powered entirely by AI agents on the ATLAS platform."

**What to point at:** The subtitle under the banner: _"Atlas AI Agent Platform · 8 brands · 6.2M subscribers"_ and the "Today's run: 2.43M decisions" figure in the top-right corner.

---

## Segment 2 — The Pipeline Header

**What to do:** Point to the 5 agent cards running left-to-right across the pipeline strip below the banner. Each card has a step number, agent name, status dot, last-run timestamp, and a metric output.

**What to say:**
> "Before we trigger anything, I want to show you the architecture. There are 5 agents, each with a distinct job, connected in sequence. Let me walk them left to right."

Walk through each card:

**Step 1 — Subscriber Profile Engine:**
> "This agent refreshes every subscriber profile. It pulls recent engagement signals, cross-brand website behavior, lifecycle status, and demographic data. The output is a scored profile for every subscriber — who's engaged, who's at risk, who's fatigued."

**Step 2 — Content Inventory Agent:**
> "This one scans the CMS across all 8 brands and scores every article for email-sendability — freshness, engagement history, affiliate conversion potential. It hands a ranked candidate list to the decision agent downstream."

**Step 3 — NBA Email Decision Agent:**
> "This is the brain. It applies a weighted model — 35% engagement score, 25% lifecycle health, 20% fatigue risk, 20% content affinity — and produces a SEND, PERSONALIZE, or HOLD decision for every subscriber in the portfolio."

**Step 4 — Send Time Optimizer:**
> "For every subscriber who gets a SEND decision, this agent computes their personalized send window based on their individual timezone and engagement rhythm. Not batch-send at 9 AM for everyone — genuinely individualized delivery."

**Step 5 — Performance & Learning Agent:**
> "This closes the feedback loop. It analyzes yesterday's actual send outcomes — opens, clicks, conversions — and updates the model so tomorrow's run is more accurate."

**What to point at:** The arrow connectors between cards showing data flow. If timestamps and metrics are already populated from a prior run, say: _"You can see this has already run — those numbers came from real agent execution. We're about to trigger a fresh run now."_ Each agent name in the header is a clickable link into the ATLAS platform's agent detail page.

---

## Segment 3 — The Live Run

**What to do:** Click the pink **"Run Live Pipeline"** button in the top-right corner. The Live Feed panel will open below the banner.

**What to say immediately after clicking:**
> "I've just triggered all 5 agents. This is real execution — not a simulation. Each agent is calling live tools against a representative Hearst data platform, reasoning over the results with GPT-4.1, and producing structured outputs that flow into the next agent in the pipeline."

Narrate the Live Feed as events appear:

**On `run_start` / `setup` events (blue, lightning bolt icon):**
> "The runtime is initializing — registering the MCP tool connections each agent will need. Think of this as the platform wiring up the tool access layer."

**On `agent_start` (indigo, ▶ icon):**
> "The Subscriber Profile Engine just started. Watch the Pipeline Header — that card will highlight in pink while it's active."

**What to point at:** The step card turning pink in the Pipeline Header.

**On `tool_call_result` events (green ✓):**
> "Each line here is a real API call. `get_esp_events` is pulling subscriber open and click data. `get_website_behavior` is reading cross-brand content affinity signals. The agent sees the raw data returned by each tool and reasons over it before deciding what to call next."

**What to point at:** The tool name in brackets — e.g., `[get_esp_events]` — and the record count to the right.

**On `agent_complete` (green ✓ checkmark icon):**
> "First agent done. It's written a structured JSON output — a summary of 6.2 million subscriber profiles — into the platform. That output is now available as context for the agents downstream."

**What to point at:** The Pipeline Header — the first card should flip to "Done" status with a real timestamp and metric (e.g., "5.8M profiles").

**As subsequent agents run:**
> "Each agent hands off in sequence. The Content Inventory Agent is now scoring today's articles across all 8 brands. Notice it's calling different tools — `get_cms_articles`, `get_editorial_calendar` — sourced from a different MCP server."

**On `run_complete` (pink ✓✓ icon):**
> "All 5 agents completed. The entire pipeline run is fully logged in ATLAS — every tool call, every input, every model output. You can audit the complete trace right now by clicking any agent name in the Pipeline Header."

**What to point at:** The "Run complete" badge that appears next to the "Live" badge in the top banner.

---

## Segment 4 — Command Center: Real AI Output

> **Data accuracy note for presenter:** The portfolio metrics on this screen — decisions evaluated, AI-influenced %, open rate lift — are generated in real time by the NBA Decision Agent and Performance & Learning Agent in the run you just triggered. This is the one screen that reflects live agent output.

**What to do:** Stay on the Command Center tab. The metrics will have auto-refreshed after the run completed.

**What to say:**
> "The Command Center just updated. Every number here came out of those 5 agents. The AI evaluated 2.4 million send decisions and produced a SEND, PERSONALIZE, or HOLD call for each one."

**What to point at — key metrics:**

- **AI-Influenced %** — _"About 58% of today's sends are AI-influenced — either personalized content, personalized send time, or an AI-triggered suppression. This isn't a static rule engine. The model updates nightly."_

- **Projected Open Rate vs. Baseline** — _"The model is projecting roughly a 21% open rate lift over the default batch-send baseline. The Performance & Learning agent back-validated that projection against yesterday's actual outcomes before finalizing the number."_

- **Hold decisions** — _"About 25% of subscribers are being held today — protected from receiving an email they would likely ignore or unsubscribe over. The fatigue suppression model calculated that."_

- **Top Performing Brand card** — _"The Performance & Learning agent identified today's top brand by predicted open rate. Click on it to drill into that brand's optimization view."_

---

## Segment 5 — Supporting Screens Tour

> **Presenter note:** The following 5 screens present realistic, stable illustrative data. They complete the narrative around what the full platform surface looks like over time. Do not describe them as direct outputs of the pipeline you just ran.

**Suggested framing for all supporting screens:**
> "Let me show you the full analytics layer that this pipeline feeds into over time."

---

### Brand Deep-Dive (Tab 2)

**What to do:** Click on a brand tile in the Command Center, or click the **Brand Deep-Dive** tab.

**What to say:**
> "Every brand gets its own optimization view — send volume, engagement trend, top content candidates, and the AI decision breakdown by subscriber segment."

**What to point at:** The send/hold/personalize donut chart and the "Top AI-selected content" list.

---

### Subscriber Explorer (Tab 3)

**What to do:** Click the **Subscriber Explorer** tab.

**What to say:**
> "Drill all the way to an individual subscriber — their NBA decision for today, the reasoning behind it, the content match score, and whether they were sent to or held."

**What to point at:** The decision badge (SEND / PERSONALIZE / HOLD) and the explanation card below it.

---

### Send Time Map (Tab 4)

**What to do:** Click the **Send Time Map** tab.

**What to say:**
> "Global send distribution across timezone clusters. APAC and Europe consistently show the highest lift from personalized timing because the default 9 AM EST batch-send was most misaligned with their peak engagement windows."

**What to point at:** The lift percentages by timezone cluster.

---

### Fatigue Protection (Tab 5)

**What to do:** Click the **Fatigue Protection** tab.

**What to say:**
> "The suppression analytics view — how many subscribers were protected from burnout today, which brands carry the highest fatigue risk, and what the cool-down rules look like across the portfolio."

**What to point at:** The "Subscribers protected today" counter and the brand-level fatigue risk bars.

---

### Revenue Attribution (Tab 6)

**What to do:** Click the **Revenue Attribution** tab.

**What to say:**
> "This is the outcome that matters — email as a revenue channel. Affiliate link conversions, subscription starts, and display attribution tracked back to individual email decisions the pipeline made."

**What to point at:** The total revenue forecast and the three attribution buckets (Affiliate Links, Subscription Conversions, Display Ad Attribution).

---

## Segment 6 — The ATLAS Platform Close

**What to do:** Switch to your second browser tab showing the ATLAS home page or the Agents list.

**What to say:**
> "What you just saw is one pipeline for one customer. The ATLAS platform manages every agent in this organization — their configurations, deployment history, evaluation scores, and governance records. Every agent that ran just now is visible here, auditable, version-controlled, and governed by the policies your team defines. That's the core of what we're building with you: not a black-box automation, but a managed, observable, enterprise-grade AI workforce."

**What to point at:** The agent list showing the 5 Hearst pipeline agents alongside all other platform agents — all governed under the same system.

---

## Common Questions & Answers

**Q: Is this running against real Hearst data?**  
A: The agents are running against a representative demo data platform that mirrors Hearst's data structures and volume characteristics. In a production deployment, the agent configurations and pipeline logic stay identical — you point the MCP server endpoints at the production data layer.

**Q: How long does this normally take at production scale?**  
A: The demo pipeline completes in 3–4 minutes for 5 agents running sequentially. In production, the agents run in parallel sub-batches managed by the ATLAS runtime scheduler, and a full portfolio cycle completes in under 15 minutes.

**Q: What model is this using?**  
A: GPT-4.1 for all 5 agents. The platform supports per-agent model selection — you can mix OpenAI and Anthropic models across the pipeline, or route specific agents to fine-tuned models as you accumulate run history.

**Q: Can we see the full audit trail?**  
A: Yes — every run you just triggered is in Runs & Traces right now. Click any agent name in the Pipeline Header to go directly to that agent's detail page and complete trace history.

**Q: What happens if an agent fails mid-pipeline?**  
A: The ATLAS runtime catches the error, surfaces it in the live feed and the run trace, and stops propagation downstream. The platform flags it for human review or can be configured to auto-retry under the governance policy your team sets.

**Q: How do we integrate our own data systems?**  
A: Through MCP servers — the same protocol these agents use to talk to the demo data platform. You register your data systems as MCP servers in ATLAS, the agents get scoped tool access, and every call is logged, governed, and auditable from day one.
