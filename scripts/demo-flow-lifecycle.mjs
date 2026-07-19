/**
 * Live guided demo: the simplified Process Flow lifecycle, driven by
 * Playwright in a VISIBLE Chrome window with real (trusted) mouse input.
 *
 * What it walks through, with an on-screen narrator banner:
 *   1. Process Flow Studio        — where flows are drawn
 *   2. Blueprint screen           — now a single "Team Flow" view; adds a
 *                                   step live (toast + auto-scroll), removes it
 *   3. Team page lifecycle bar    — Edit Flow · Run Flow · env · Promote
 *   4. Run Flow                   — starts a real run, lands on the monitor
 *   5. Human approval gate        — approved through the Governance UI
 *   6. Run completes              — watched live on the monitor
 *   7. Promotion                  — staging → pilot in one click (Stage 3a team)
 *
 * Usage:  node scripts/demo-flow-lifecycle.mjs
 * Requires the dev server on http://localhost:5000.
 */
import { chromium } from "@playwright/test";

const BASE = "http://localhost:5000";
const STAGE2_TEAM = "91578bdf-a862-41ac-9ae7-8c7d33226a30"; // has an approval gate
const STAGE2_BLUEPRINT = "c5330098-afcf-4e30-b739-fca08877cdda";
const STAGE3A_TEAM = "ca94f53c-5aec-425a-9ad0-8b8fdb44ed3e"; // still in staging -> promote demo

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function banner(page, step, text) {
  await page.evaluate(
    ({ step, text }) => {
      let el = document.getElementById("__demo_banner");
      if (!el) {
        el = document.createElement("div");
        el.id = "__demo_banner";
        el.style.cssText = [
          "position:fixed", "top:0", "left:0", "right:0", "z-index:99999",
          "background:#4f46e5", "color:#fff", "padding:14px 24px",
          "font:600 16px/1.4 system-ui,sans-serif",
          "box-shadow:0 2px 12px rgba(0,0,0,.35)",
        ].join(";");
        document.body.appendChild(el);
      }
      el.textContent = `${step}  ·  ${text}`;
    },
    { step, text },
  );
}

async function main() {
  const browser = await chromium.launch({ headless: false, slowMo: 300 });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  // A fresh profile triggers the first-run industry-workspace selector, which
  // overlays the whole app -- pre-select the Cross-Industry workspace (id
  // "custom") and the admin role, matching an already-onboarded user.
  await context.addInitScript(() => {
    localStorage.setItem("almp-industry", "custom");
    localStorage.setItem("almp-role", "admin");
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);

  // ---- 1. Process Flow Studio -------------------------------------------
  await page.goto(`${BASE}/process-flows`);
  await page.waitForSelector('[data-testid="page-process-flows"]');
  await banner(page, "Step 1 of 7", "Process Flow Studio — this is where flows are DRAWN (describe in English, or drag steps by hand)");
  await sleep(6000);

  // ---- 2. Blueprint screen = Team Flow only ------------------------------
  await page.goto(`${BASE}/blueprints/${STAGE2_BLUEPRINT}`);
  await page.waitForSelector('[data-testid="team-flow-header"]');
  await banner(page, "Step 2 of 7", "The flow's definition — no more confusing tabs, just the Team Flow. Watch me add a step from the palette…");
  await sleep(4000);

  await page.click('[data-testid="button-add-team-node-internal_agent"]');
  // The new card auto-selects and scrolls into view; give it a beat on screen.
  await page.waitForSelector('text=Step added');
  await sleep(4500);
  await banner(page, "Step 2 of 7", "Step added, highlighted, and scrolled into view — now removing it again to leave the flow unchanged");
  const newCard = page.locator('[data-testid^="card-team-node-"]', { hasText: "Internal Agent" }).last();
  const cardTestId = await newCard.getAttribute("data-testid");
  const nodeId = cardTestId.replace("card-team-node-", "");
  await page.click(`[data-testid="button-delete-team-node-${nodeId}"]`);
  await sleep(3000);

  // ---- 3. Team page lifecycle bar ---------------------------------------
  await page.goto(`${BASE}/agents/${STAGE2_TEAM}`);
  await page.waitForSelector('[data-testid="flow-lifecycle-bar"]');
  await page.evaluate(() => {
    const bar = document.querySelector('[data-testid="flow-lifecycle-bar"]');
    bar.style.outline = "3px solid #f59e0b";
    bar.scrollIntoView({ block: "center" });
  });
  await banner(page, "Step 3 of 7", "The team's page — ONE home for the lifecycle: Edit Flow · Run Flow · environment · Promote");
  await sleep(6000);

  // ---- 4. Run the flow ----------------------------------------------------
  await banner(page, "Step 4 of 7", "Clicking Run Flow and describing what this run should process…");
  await page.click('[data-testid="button-run-flow"]');
  await page.waitForSelector('[data-testid="input-run-flow-request"]');
  await page.fill(
    '[data-testid="input-run-flow-request"]',
    'Playwright live demo: draft a mini content plan for the "Summer Fitness Push" campaign refresh.',
  );
  await sleep(1500);
  await page.click('[data-testid="button-confirm-run-flow"]');
  await page.waitForURL(/\/dag-runs\//, { timeout: 30_000 });
  const runId = page.url().split("/dag-runs/")[1];
  await banner(page, "Step 4 of 7", "The run started and brought us straight to the live monitor — agents are executing now");

  // ---- 5. Wait for the human gate, approve via Governance UI -------------
  let approvalId = null;
  for (let i = 0; i < 60; i++) {
    const run = await fetch(`${BASE}/api/dag-execution-runs/${runId}`).then((r) => r.json());
    if (run.status === "waiting_approval" && run.pendingApprovalId) { approvalId = run.pendingApprovalId; break; }
    if (["completed", "completed_with_skips", "failed"].includes(run.status)) break;
    await sleep(5000);
  }
  if (approvalId) {
    await banner(page, "Step 5 of 7", "The flow PAUSED at its human approval gate — approving it in Governance, exactly like a manager would");
    await sleep(4000);
    // Show the manager's queue first (Control Points), then decide on the
    // approval's own detail page -- the queue list refreshes on its own
    // schedule, so the detail page is the deterministic place to act.
    await page.goto(`${BASE}/governance`);
    await page.click('[data-testid="tab-control-points"]');
    await page.click('[data-testid="button-refresh-queue"]').catch(() => {});
    await sleep(4000);
    await banner(page, "Step 5 of 7", "Opening the approval itself to review and decide…");
    await page.goto(`${BASE}/approvals/${approvalId}`);
    const approveBtn = page.locator('[data-testid="button-approve"]');
    await approveBtn.scrollIntoViewIfNeeded();
    await sleep(2000);
    await approveBtn.click();
    await sleep(3000);
    await banner(page, "Step 5 of 7", "Approved ✔ — the flow resumes on its own. Heading back to the live monitor…");
    await sleep(2500);
    await page.goto(`${BASE}/dag-runs/${runId}`);
  }

  // ---- 6. Watch it complete ----------------------------------------------
  await banner(page, "Step 6 of 7", "Watching the remaining steps finish…");
  for (let i = 0; i < 48; i++) {
    const run = await fetch(`${BASE}/api/dag-execution-runs/${runId}`).then((r) => r.json());
    if (["completed", "completed_with_skips", "failed"].includes(run.status)) {
      await banner(page, "Step 6 of 7", `Run finished with status: ${run.status.toUpperCase()} — every step, gate included, ran end-to-end`);
      break;
    }
    await sleep(5000);
  }
  await sleep(5000);

  // ---- 7. Promotion -------------------------------------------------------
  await page.goto(`${BASE}/agents/${STAGE3A_TEAM}`);
  await page.waitForSelector('[data-testid="flow-lifecycle-bar"]');
  await page.evaluate(() => {
    const bar = document.querySelector('[data-testid="flow-lifecycle-bar"]');
    bar.style.outline = "3px solid #f59e0b";
    bar.scrollIntoView({ block: "center" });
  });
  await banner(page, "Step 7 of 7", "Promotion: this team is in STAGING — one click sends it toward pilot, through the real readiness gates");
  await sleep(5000);
  const promote = page.locator('[data-testid="button-promote-flow"]');
  if (await promote.count()) {
    await promote.click();
    await sleep(5000);
    await banner(page, "Step 7 of 7", "Promoted ✔ — now pilot, awaiting its deployment approval in Governance (honest, governed rollout)");
  } else {
    await banner(page, "Step 7 of 7", "This team has already been promoted — the bar shows its current environment state");
  }
  await sleep(6000);

  await banner(page, "Demo complete", "That's the whole lifecycle: draw → run → approve → complete → promote. Explore freely — close this window when done.");
  // Leave the window open for the user; exit when they close it (or after 5 min).
  await Promise.race([
    page.waitForEvent("close", { timeout: 0 }).catch(() => {}),
    sleep(300_000),
  ]);
  await browser.close().catch(() => {});
}

main().catch((err) => {
  console.error("[demo] failed:", err.message);
  process.exit(1);
});
