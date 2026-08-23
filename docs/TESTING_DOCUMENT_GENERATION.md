# Testing document generation (PDF / PPTX)

How to verify that agents produce real `.pptx` and `.pdf` files, on any model.

## What changed, in one paragraph

Document generation used to run only inside Anthropic's code-execution sandbox, so it
worked on Claude models and silently produced nothing on GPT ones — the agent would
correctly say it couldn't create files and return an outline instead. There is now a
second, provider-agnostic path: the model emits a structured outline as ordinary tool
arguments (`generate_pptx` / `generate_pdf`) and the **server** renders the bytes. Both
paths still exist. The portable one is the default in practice because it works
everywhere, and is roughly 20x faster and 16x cheaper.

## Prerequisites

An agent qualifies for document generation when **all** of these hold:

| Requirement | Where to set it | Notes |
|---|---|---|
| A skill of kind `code_execution` | Skills → Skill Studio → *Kind* | The skill grants the tools |
| That skill lists `pptx` and/or `pdf` | Same panel, the format badges | This is the actual gate |
| The skill's status is `active` | Skill Studio | A draft skill grants nothing |
| The skill is attached to the agent | Agent detail → **Skills** tab → **Attach Skill** | |

Note what is **not** required for the portable path: code-execution approval, and any
particular model. Approval is only needed if you specifically want the sandbox path.

## 1. Happy path, on a GPT agent (the important one)

This is the case that used to fail.

1. Open an agent on a GPT model with the document skill attached — e.g.
   **PowerPoint Generation Agent** (`gpt-4o`).
2. In Workspace, ask for a deck with the content included, e.g.
   *"Create a PowerPoint (.pptx) with 4 slides summarising a Q3 marketing campaign:
   title slide, results, key learnings, next steps. Generate the actual file."*
3. Expect, within ~15 seconds:
   - a step reading **Using the platform document renderer** with status *completed*
   - a step **Document Generation: generate_pptx** with status *completed*
   - a **download link** under the answer
4. Download it and open it in PowerPoint. It should be a real deck: a title slide plus
   one slide per section.

Repeat with *"…as a PDF report…"* to exercise `generate_pdf`.

**Supply the content in the prompt.** Asked for a report with no data, a well-behaved
agent will ask you what to put in it rather than invent figures — that is correct
behaviour, not a failure.

## 2. The same request on a Claude agent

Run step 1 against a Claude agent (e.g. **Test-e2eCampaign**). It should also produce a
file. Claude agents can reach *either* path, so both of these are valid outcomes:

- a `generate_pptx` tool call (portable renderer), or
- a code-execution turn that produces the file in the sandbox.

You can tell which ran from the filename: the platform renderer emits slugified,
lower-case names (`q3-marketing-campaign-summary.pptx`); the sandbox emits whatever the
model chose (`Q3_Marketing_Campaign.pptx`).

## 3. Changing an agent's model

1. Agent detail → **More** (to the right of the tab strip) → **Blueprint** →
   **Model Configuration** card → **Change model**.
   The Blueprint tab is in the overflow menu, not the primary strip — it is not on
   the Summary tab.
2. Pick a provider, then a model. Providers with no API key on file are disabled.
   Switching provider resets the model to that provider's first option, so you can't
   save a model belonging to a different provider.
3. **Save**, then reload and confirm the card shows the new pairing.
4. Re-run step 1. Document generation should behave identically on the new model — that
   is the whole point of the portable path.

## 4. Verifying by API

Log in, then run an agent and inspect the result:

```bash
BASE=https://astra-agents-artizent.azurewebsites.net

curl -s -c /tmp/c.txt -X POST "$BASE/api/auth/login" \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"<password>"}'

curl -s -b /tmp/c.txt -X POST "$BASE/api/workspace/runs" \
  -H 'content-type: application/json' \
  -d '{"agentId":"<agent-id>","input":"Create a .pptx with 3 slides about Q3 results. Generate the actual file."}' \
  | jq '{status, costUsd, generatedFiles, steps: [.steps[] | {type, name, status}]}'
```

Then download and check it is a real file rather than an HTML error page:

```bash
curl -s -b /tmp/c.txt -o out.pptx "$BASE/api/agent-files/<file-id>/download"
head -c 4 out.pptx | xxd    # 50 4b 03 04  => a valid zip, i.e. real OOXML
```

For a PDF, `head -c 5 out.pdf` should print `%PDF-`.

## 5. What "good" looks like

| Signal | Expected |
|---|---|
| `generatedFiles` on the run | one entry per file |
| Steps with status `failed` | none |
| Answer text | no URL, link or file path — the download card carries it |
| `.pptx` magic bytes | `50 4b 03 04` |
| `.pdf` magic bytes | `%PDF-` |
| Slide count | title slide + one per section |
| Latency / cost (portable path) | ~5–15s, ~$0.01 |

## 6. Automated tests

```bash
npx vitest run --config vitest.integration.config.ts \
  tests/document-renderer.test.ts \
  tests/builtin-document-tools.test.ts \
  tests/code-execution-mismatch.test.ts \
  tests/anthropic-pause-turn.test.ts
```

These assert real container structure — zip magic bytes and `ppt/presentation.xml`,
slide count, `%PDF-` and `%%EOF` — not merely that a buffer came back. They also pin two
regressions worth keeping: a spec with no author must still render (pdfkit calls
`.valueOf()` on every metadata value), and no URL may appear anywhere the model can see
it (given a path, gpt-4o rendered `sandbox:/api/agent-files/...` into its reply as a dead
link).

To render sample documents without running an agent at all:

```bash
npx tsx scripts/sample-document.ts ./out
```

## 7. Troubleshooting

**The agent returns an outline and no file.** Check the tools were offered: the skill
must be `active`, attached, and list `pptx`/`pdf`. If the agent's skills declare an
`allowedTools` list, the document tools are added to it automatically — but a *policy*
tool allowlist is separate and can still filter them out.

**A step says "Code execution unavailable for this model".** Only appears when nothing
else covers the capability. If the portable tools are available you'll see
*"Using the platform document renderer"* instead, and it is informational, not an error.

**The download returns 410.** The row has neither inline bytes nor an Anthropic file id.
For sandbox-produced files, Anthropic's Files API retains the bytes and they can expire;
platform-rendered files store bytes inline and do not.

**Sandbox runs are inconsistent.** Known and unresolved. The Anthropic code-execution
path produces a file on some runs and stops after narration on others; the stop reason
and sandbox trace are now recorded on each run's steps for diagnosis. This does not
affect the portable path.

## Known gaps

- The intermittent sandbox behaviour above is uncharacterised.
- Asked for "4 slides", models tend to produce a title slide plus four content slides.
  Tighten the tool description if literal counts matter.
- The renderer's template is deliberately plain. Branding is the `THEME` constant in
  `server/document-renderer.ts` — changing it restyles every document at once.
