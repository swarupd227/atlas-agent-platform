/**
 * End-to-end check of the deployed equipment-dealer pack. Use this as the
 * T-30 pre-demo check.
 *
 *   source deploy/azure/env.sh
 *   npx tsx scripts/verify-pack.ts
 *
 * Checks configuration AND behaviour: it calls real connector tools against
 * the real database, so a pass means the demo path actually works rather than
 * merely being wired up.
 *
 * Written because a series of ad-hoc curl one-liners kept getting response
 * shapes wrong — notably /api/agents/:id/knowledge-bases, which returns
 * { links, knowledgeBases } and not an array. Those shapes are handled here,
 * once, correctly.
 */
import { DEALER_JOURNEYS } from "../packs/equipment-dealer/journeys";

const BASE_URL = (process.env.BASE_URL || process.env.APP_URL || "http://localhost:5000").replace(/\/+$/, "");
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const TIMEOUT = Number(process.env.REQUEST_TIMEOUT_MS || 45_000);

let cookie = "";
let pass = 0;
const problems: string[] = [];

const ok = (m: string) => { pass++; console.log(`  ✓ ${m}`); };
const bad = (m: string) => { problems.push(m); console.log(`  ✗ ${m}`); };
const info = (m: string) => console.log(`    ${m}`);

async function req(method: "GET" | "POST", path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 160)}`);
  try { return text ? JSON.parse(text) : {}; }
  catch { throw new Error(`${method} ${path} returned non-JSON — does that route exist?`); }
}

/** Connector tool results arrive as { content: [{ text: "<json>" }] }. */
async function tool(name: string, args: Record<string, unknown>): Promise<any> {
  const r = await req("POST", `/api/integrations/dealer-operations/tools/${name}`, args);
  return JSON.parse(r.content[0].text);
}

async function main() {
  console.log(`\nVerifying equipment-dealer pack at ${BASE_URL}\n${"─".repeat(60)}`);
  if (!ADMIN_PASSWORD) {
    console.error("ADMIN_PASSWORD is not set. Run: source deploy/azure/env.sh");
    process.exit(1);
  }
  if (/localhost/.test(BASE_URL)) {
    console.error(`BASE_URL is ${BASE_URL} — the environment did not load. Run: source deploy/azure/env.sh`);
    process.exit(1);
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASSWORD }),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) { console.error(`Login failed: ${res.status}`); process.exit(1); }
  for (const c of ((res.headers as any).getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""]) as string[]) {
    const m = /auth_token=([^;]+)/.exec(c ?? ""); if (m) cookie = `auth_token=${m[1]}`;
  }
  ok(`authenticated as ${ADMIN_USER}`);

  // ── Connector ─────────────────────────────────────────────────────────────
  console.log("\nConnector");
  // Two endpoints, two different questions. /health is the platform's generic
  // connection health (mounted ahead of the connector's own router); /contract
  // is the connector's declared-vs-implemented tool audit.
  const health = await req("GET", "/api/integrations/dealer-operations/health");
  health.status === "connected"
    ? ok(`Dealer Operations connected (${health.metrics?.totalCalls ?? 0} calls in 24h, ${health.metrics?.totalErrors ?? 0} errors)`)
    : bad(`Dealer Operations status is "${health.status}" — reconnect it under Integrations`);

  const contract = await req("GET", "/api/integrations/dealer-operations/contract");
  contract.audit?.ok && contract.tools === 57
    ? ok(`${contract.tools} tools, declared contract matches the implementations`)
    : bad(`tool contract: ${JSON.stringify(contract.audit ?? contract).slice(0, 160)}`);

  // ── Agents ────────────────────────────────────────────────────────────────
  console.log("\nAgents");
  const wanted = new Map(DEALER_JOURNEYS.flatMap((j) => j.agents.map((a) => [a.name, a] as const)));
  const all: any[] = await req("GET", "/api/agents");
  const mine = all.filter((a) => wanted.has(a.name));
  mine.length === wanted.size
    ? ok(`${mine.length} pack agents present`)
    : bad(`${mine.length} pack agents present, expected ${wanted.size}`);

  const dupes = Array.from(wanted.keys()).filter((n) => all.filter((a) => a.name === n).length > 1);
  dupes.length ? bad(`duplicate agent names: ${dupes.join(", ")}`) : ok("no duplicate agents");

  const teams = mine.filter((a) => a.agentType === "team");
  teams.length === 5 ? ok("5 orchestrators typed as team") : bad(`${teams.length} orchestrators typed as team, expected 5`);
  const curated = mine.filter((a) => a.isCuratedJourney);
  curated.length === 5 ? ok("5 journeys marked curated") : bad(`${curated.length} marked curated, expected 5`);

  // ── Bindings (only workers need them) ─────────────────────────────────────
  console.log("\nBindings");
  const workers = mine.filter((a) => wanted.get(a.name)!.role === "worker");
  let mcpBound = 0, kbBound = 0, kbLinkTotal = 0;
  for (const a of workers) {
    const m = await req("GET", `/api/agents/${a.id}/mcp-servers`);
    if ((Array.isArray(m) ? m : m?.servers ?? []).length) mcpBound++;
    // This route returns { links, knowledgeBases } — NOT an array.
    const k = await req("GET", `/api/agents/${a.id}/knowledge-bases`);
    const links: any[] = Array.isArray(k?.links) ? k.links : Array.isArray(k) ? k : [];
    if (links.length) kbBound++;
    kbLinkTotal += links.length;
  }
  mcpBound === workers.length
    ? ok(`${mcpBound}/${workers.length} workers bound to the connector`)
    : bad(`${mcpBound}/${workers.length} workers bound to the connector`);
  kbBound === workers.length
    ? ok(`${kbBound}/${workers.length} workers have a knowledge base`)
    : bad(`${kbBound}/${workers.length} workers have a knowledge base`);
  kbLinkTotal === kbBound
    ? ok("no duplicate knowledge-base links")
    : bad(`${kbLinkTotal} knowledge-base links across ${kbBound} workers — duplicates remain, re-run provision-pack.ts`);

  // ── Journeys and their process flows ──────────────────────────────────────
  console.log("\nJourneys");
  const journeys: any[] = await req("GET", "/api/journeys");
  const dealerJourneys = journeys.filter((j) => j.industryId === "equipment_dealer");
  dealerJourneys.length === 5
    ? ok("5 journeys in the Journey Library")
    : bad(`${dealerJourneys.length} journeys in the Journey Library, expected 5`);
  const withFlow = dealerJourneys.filter((j) => j.processFlow);
  withFlow.length === 5
    ? ok("all 5 journeys show their process flow")
    : bad(`${withFlow.length}/5 journeys show a process flow — re-run provision-pack.ts`);
  for (const j of withFlow) info(`${j.name}: ${j.processFlow.nodeCount} steps, ${j.processFlow.approvalGates} approval gates`);

  // ── Behaviour: real tools, real data ──────────────────────────────────────
  console.log("\nLive behaviour");
  try {
    const asset = await tool("resolve_asset", { serial_number: "A1J02931" });
    asset.resolved === false && asset.candidate_count === 2 && asset.escalate_to === "service_writer"
      ? ok("serial collision escalates instead of guessing (Act 4)")
      : bad(`resolve_asset unexpected: ${JSON.stringify(asset).slice(0, 160)}`);
  } catch (e: any) { bad(`resolve_asset failed: ${e.message}`); }

  try {
    const doc = await tool("get_remittance_document", { payment_id: "PAY-77011" });
    doc.page_count === 3 && (doc.extracted_text || "").length > 500
      ? ok("remittance PDF extracts (3 pages)")
      : bad(`get_remittance_document unexpected: pages=${doc.page_count}`);
  } catch (e: any) { bad(`get_remittance_document failed: ${e.message}`); }

  try {
    const intent = await tool("extract_remittance_intent", { payment_id: "PAY-77011" });
    intent.line_count === 34 && intent.extracted_total_usd === 284000 && intent.completeness_score === 1
      ? ok("34 invoice lines reconcile to $284,000 (Act 3)")
      : bad(`extract_remittance_intent: ${intent.line_count} lines, ${intent.extracted_total_usd}`);
  } catch (e: any) { bad(`extract_remittance_intent failed: ${e.message}`); }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(60)}`);
  if (problems.length) {
    console.log(`${pass} passed, ${problems.length} PROBLEM(S):`);
    for (const p of problems) console.log(`  - ${p}`);
    process.exit(1);
  }
  console.log(`All ${pass} checks passed — configuration and live behaviour both good.`);
}

main().catch((e) => { console.error("\n" + (e?.message ?? e)); process.exit(1); });
