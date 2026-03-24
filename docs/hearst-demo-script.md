# Hearst NBA Email Orchestration — Demo Script

**Audience:** Prospective enterprise client or executive stakeholder  
**Duration:** 5–8 minutes  
**Location:** `/demo/hearst` in the ATLAS platform  
**Purpose:** Demonstrate live, multi-agent AI orchestration making 2.4 million email SEND/HOLD decisions nightly across 8 Hearst brands

---

## Before You Start

Work through this checklist before the call or screen share begins:

- [ ] Open the app in a fresh browser tab: navigate to `/demo/hearst`
- [ ] Confirm the top banner shows **"Hearst NBA Email Orchestration"** with a green **Live** badge
- [ ] Confirm the Pipeline Header (5 agent cards) is visible below the top banner
- [ ] Have the ATLAS home page (`/`) open in a second tab so you can pivot to the platform pitch
- [ ] If you ran the pipeline recently, the Pipeline Header will already show real timestamps — that's fine and actually a good sign to point out
- [ ] Note: the first live pipeline run takes ~3–4 minutes. Plan around this or pre-run it so the data is ready and use the recorded metrics for the narrative

---

## Talking Points Overview

| Segment | What you do | Time |
|---|---|---|
| 1. Context setting | Introduce the problem | 30 sec |
| 2. Pipeline Header | Walk the 5-agent pipeline | 90 sec |
| 3. Live Run | Click the button, narrate the feed | 3–4 min |
| 4. Command Center | Show real AI-generated metrics | 60 sec |
| 5. Supporting screens | Brief tour of screens 2–6 | 60–90 sec |
| 6. ATLAS pitch | Close with the platform story | 30 sec |

---

## Segment 1 — Context Setting (30 seconds)

**What to say:**

> "Hearst publishes to 6.2 million email subscribers across 8 brands — Cosmopolitan, Elle, Esquire, Good Housekeeping, and others. Every night, before emails go out, someone — or something — has to decide: for each of those 6.2 million people, do we send today? Which piece of content? And at what time? That's 2.4 million decisions per run. What you're looking at is that decision engine, powered entirely by AI agents on the ATLAS platform."

**What to point at:** The subtitle under the header: _"Atlas AI Agent Platform · 8 brands · 6.2M subscribers"_

---

## Segment 2 — The Pipeline Header (90 seconds)

**What to do:** Point to the 5 agent cards running left to right across the top of the screen.

**What to say:**

> "Before we run anything, I want to show you how this is structured. There are 5 agents, each with a different job, connected in a pipeline."

Walk left to right through each card:

1. **Subscriber Profile Engine** — _"This agent refreshes every subscriber profile. It's pulling engagement signals, website behavior, lifecycle status. It's essentially asking: how healthy is each subscriber relationship right now?"_

2. **Content Inventory Agent** — _"This one scans the CMS across all 12 brands and scores every article for email-sendability — freshness, engagement history, affiliate potential. It produces a ranked candidate list."_

3. **NBA Email Decision Agent** — _"This is the brain. It applies a weighted scoring model — 35% engagement, 25% lifecycle, 20% fatigue risk, 20% content affinity — and produces a SEND, PERSONALIZE, or HOLD decision for every subscriber."_

4. **Send Time Optimizer** — _"For every subscriber who gets a SEND decision, this agent computes the optimal send window based on their individual timezone and engagement history. Not batch-send at 9 AM — truly personalized delivery time."_

5. **Performance & Learning Agent** — _"This one closes the loop. It analyzes yesterday's outcomes — what actually got opened, clicked, converted — and updates the model weights so tomorrow's run is smarter."_

**What to point at:** The arrow connectors between cards. Each card shows the last run timestamp and a metric output (e.g., "5.8M profiles", "234 sendable"). If these are populated from a previous run, say: _"You can see this already ran — those are real numbers from the last execution."_

> "Every agent name here is a link into the ATLAS platform — you can click through to see its full configuration, trace history, evaluation scores, and governance records."

---

## Segment 3 — The Live Run (3–4 minutes)

**What to do:** Click the pink **"Run Live Pipeline"** button in the top-right corner.

**What to say immediately after clicking:**

> "I'm triggering all 5 agents right now. This is a real execution — not a simulation. Each agent is making live API calls to Hearst's data systems, reasoning over the results with GPT-4.1, and producing structured outputs that flow into the next agent in the pipeline."

The Live Feed panel will appear below the top banner. Narrate it as events arrive:

**When you see `run_start` / `setup` events (blue):**
> "The runtime is initializing — registering the MCP tool connections each agent will use."

**When you see `agent_start` (indigo, ▶ icon):**
> "The Subscriber Profile Engine just started. Watch the Pipeline Header — you'll see that agent card flip to 'Running.'"

**When you see `tool_call_result` events (green ✓):**
> "Each line here is an actual API call — `get_esp_events` is pulling recent open and click data, `get_website_behavior` is reading cross-brand content affinity signals. The agent sees the raw data and reasons over it."

**When you see the first `agent_complete` (green ✓):**
> "First agent done. The output — a structured JSON summary of 6.2 million subscriber profiles — has been written to the platform. That output is now available as context for the NBA Decision Agent downstream."

**As subsequent agents run:**
> "Notice how the agents hand off sequentially. The Content Inventory Agent is now running in parallel to scoring articles — it's checking what's in the editorial queue today, what's performed well historically, and what's eligible to send."

**When you see `run_complete` (pink, ✓✓ icon):**
> "All 5 agents completed. Every run is fully logged in ATLAS — you can audit every tool call, every decision, every model output. The traces are available in the Runs & Traces section right now."

**What to point at during the run:**
- The pulsing pink dot in the Live Feed header
- The active agent card's pink highlight in the Pipeline Header
- The tool name in brackets on each `tool_call_result` line (e.g., `[get_esp_events]`)

---

## Segment 4 — Command Center: Real AI Output (60 seconds)

> Data label: **Live agent data** — the metrics on this screen are generated by the NBA Decision Agent and Performance & Learning Agent in the run you just watched.

**What to do:** Stay on the Command Center tab (it should already be selected). The numbers will have refreshed automatically after the run.

**What to say:**

> "This is the Command Center — the portfolio-wide view. Every number you see here just came from those agents. The AI evaluated 2.4 million send decisions and made a SEND, PERSONALIZE, or HOLD call for each one."

Point to the key metrics:

- **AI-Influenced %** — _"58% of today's sends are AI-influenced — either personalized content, personalized timing, or an AI-triggered hold. That's not a static rule engine. That's a model that gets smarter every night."_

- **Open Rate Lift** — _"The model is projecting a 21.7% open rate lift over the default batch-send baseline. The Performance & Learning agent validated that against yesterday's actual outcomes."_

- **Hold decisions** — _"About 25% of subscribers are being held today — protected from an email they would have ignored, or worse, unsubscribed over. That's the fatigue model working."_

- **Top Performing Brand card** — _"The Performance & Learning agent identified the top performer of the day — click on it to drill into that brand's deep-dive."_

---

## Segment 5 — Supporting Screens Tour (60–90 seconds)

The following screens are **illustrative** — they present realistic, stable data to complete the narrative. Do not describe them as "live" outputs of the pipeline you just ran.

**Suggested framing for all of these:**
> "Let me show you what the full platform surface looks like — these screens represent the kinds of analytics views that would be powered by the pipeline over time."

### Brand Deep-Dive (Tab 2)
Click a brand tile on the Command Center, or click the **Brand Deep-Dive** tab.

> "Every brand gets its own optimization view — send volume, engagement trajectory, top content candidates, the AI decision breakdown by segment."

### Subscriber Explorer (Tab 3)
> "Drill all the way down to an individual subscriber — every NBA decision made for them, the reasoning, the content match score, whether they were sent to or held, and why."

### Send Time Map (Tab 4)
> "Global send distribution across timezone clusters. APAC and Europe consistently show the highest lift from personalized send times because the default batch-send window was most misaligned there."

### Fatigue Protection (Tab 5)
> "The suppression analytics. You can see how many subscribers were protected from burnout today, which brands have the highest fatigue risk, and what the cool-down rules look like."

### Revenue Attribution (Tab 6)
> "The outcome that matters — email as a revenue channel. Affiliate link conversions, subscription starts, and display attribution tracked back to individual email decisions."

---

## Segment 6 — The ATLAS Platform Close (30 seconds)

**What to do:** Switch to your second tab showing the ATLAS home page or the Agents list.

**What to say:**

> "What you just saw is one pipeline for one customer. The ATLAS platform manages every agent in this organization — their configurations, their deployment history, their eval scores, their governance records. Every agent that ran just now is visible here, auditable, version-controlled, and governed by the policies your team sets. That's the core of what we're building with you: not a black-box automation, but a managed, observable, enterprise-grade AI workforce."

---

## Common Questions & Answers

**Q: Is this running against real Hearst data?**  
A: The agents are running against a representative data platform that mirrors Hearst's data structures and volume characteristics. In a production deployment, the agent configurations and pipeline logic remain identical — you swap the MCP server endpoints to point at the production data layer.

**Q: How long does this normally take to run?**  
A: The demo pipeline completes in 3–4 minutes for 5 agents. In production at Hearst's scale, the agents run in parallel sub-batches managed by the ATLAS runtime scheduler, with each full portfolio cycle completing in under 15 minutes.

**Q: What model is this using?**  
A: GPT-4.1 for all 5 agents. The platform supports per-agent model selection — you can mix OpenAI and Anthropic models across the pipeline, or route specific agents to fine-tuned models once you have enough run history to warrant it.

**Q: Can we see the full audit trail?**  
A: Yes — every run you just triggered is in Runs & Traces right now. Click any agent name in the Pipeline Header to go directly to that agent's detail page and trace history.

**Q: What happens if an agent fails mid-pipeline?**  
A: The ATLAS runtime catches the error, surfaces it in the live feed and the trace, and stops propagation downstream. The platform flags it for human review or can be configured to auto-retry based on the governance policy you set.
