/**
 * Creates or updates the two connections the equipment-dealer pack needs.
 *
 *   BASE_URL=... ADMIN_PASSWORD=... DB_HOST=... DB_NAME=... \
 *   SUMMIT_READER_PASSWORD=... SUMMIT_WRITER_PASSWORD=... \
 *   npx tsx scripts/connect-pack-dataset.ts
 *
 * Why a script rather than two curl calls:
 *
 *  - The read connection is created with `createNew: true`, which ALWAYS
 *    inserts a sibling. Running the curl twice silently leaves two read
 *    connections pointing at the same database, and agents then bind to
 *    whichever one the lookup happens to return. This looks up the existing
 *    connection first and updates it in place.
 *  - `setup-pack-dataset.ts` rotates the two role passwords on every run
 *    (ALTER ROLE), so the credentials stored on these connections go stale
 *    whenever the dataset is rebuilt. This is the step that repairs them.
 *
 * Safe to re-run. It reports created-vs-updated for each connection.
 */
import { SUMMIT_TABLES, SUMMIT_SCHEMA } from "../packs/equipment-dealer/dataset/ddl";

const BASE_URL = (process.env.BASE_URL || "http://localhost:5000").replace(/\/+$/, "");
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const DB_HOST = process.env.DB_HOST || "";
const DB_PORT = process.env.DB_PORT || "5432";
const DB_NAME = process.env.DB_NAME || "";
const SCHEMA = process.env.SUMMIT_SCHEMA || SUMMIT_SCHEMA;
const READER_PW = process.env.SUMMIT_READER_PASSWORD || "";
const WRITER_PW = process.env.SUMMIT_WRITER_PASSWORD || "";
const SSL = process.env.DB_SSL || "require";
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 45_000);

const READ_NAME = "Summit Equipment Group — Dealer Data (read-only)";
const ACTION_NAME = "Summit Equipment Group — Dealer Operations";

let cookie = "";

function required(name: string, value: string) {
  if (!value) { console.error(`Missing ${name}.`); return false; }
  return true;
}

async function login(): Promise<boolean> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASSWORD }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    console.error(`Login failed: ${res.status} ${(await res.text().catch(() => "")).slice(0, 160)}`);
    return false;
  }
  const raw = (res.headers as any).getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""];
  for (const c of raw as string[]) {
    const m = /auth_token=([^;]+)/.exec(c ?? "");
    if (m) cookie = `auth_token=${m[1]}`;
  }
  if (!cookie) { console.error("Login succeeded but returned no auth_token cookie."); return false; }
  return true;
}

async function api(method: "GET" | "POST", path: string, body?: unknown) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 220)}`);
  try { return text ? JSON.parse(text) : {}; }
  catch { throw new Error(`${method} ${path} returned non-JSON (${text.slice(0, 80)}…). Check the path exists.`); }
}

async function upsert(integrationId: string, name: string, credentials: Record<string, string>) {
  const existing: Array<{ id: string; name: string | null }> =
    await api("GET", `/api/enterprise-integrations/${integrationId}/connections`);
  const match = Array.isArray(existing) ? existing.find((c) => (c.name ?? "") === name) : undefined;

  const payload: Record<string, unknown> = { name, credentials };
  if (match) payload.connectionId = match.id;
  else if (integrationId === "postgres") payload.createNew = true;

  const out = await api("POST", `/api/enterprise-integrations/${integrationId}/connect`, payload);
  const verb = match ? "updated" : "created";
  const test = out?.testResult ?? out?.test ?? null;
  console.log(`  ✓ ${name}`);
  console.log(`      ${integrationId} · ${verb}${match ? ` (${match.id})` : ""}${test ? ` · test: ${test.ok === false ? "FAILED — " + (test.error ?? "") : "ok"}` : ""}`);
  return out;
}

async function main() {
  console.log("\nConnecting the equipment-dealer dataset");
  console.log("───────────────────────────────────────");
  const ok = [
    required("ADMIN_PASSWORD", ADMIN_PASSWORD),
    required("DB_HOST", DB_HOST),
    required("DB_NAME", DB_NAME),
    required("SUMMIT_READER_PASSWORD", READER_PW),
    required("SUMMIT_WRITER_PASSWORD", WRITER_PW),
  ].every(Boolean);
  if (!ok) {
    console.error("\nSet the missing variables and re-run. They are printed by scripts/setup-pack-dataset.ts.");
    process.exit(1);
  }
  console.log(`  target ${BASE_URL}`);
  console.log(`  database ${DB_HOST}/${DB_NAME}, schema ${SCHEMA}\n`);

  if (!(await login())) process.exit(1);
  console.log(`  authenticated as ${ADMIN_USER}\n`);

  const base = { host: DB_HOST, port: DB_PORT, database: DB_NAME, ssl: SSL };

  // Read-only analyst connection: every table, so the audit trail the agents
  // write is readable too, not just the seeded tables.
  await upsert("postgres", READ_NAME, {
    ...base,
    user: "summit_reader",
    password: READER_PW,
    allowedTables: SUMMIT_TABLES.join(","),
  });

  // Action connection used by the Dealer Operations tools.
  await upsert("dealer-operations", ACTION_NAME, {
    ...base,
    user: "summit_writer",
    password: WRITER_PW,
    schema: SCHEMA,
  });

  console.log("\nDone. Next: npx tsx scripts/provision-pack.ts");
}

main().catch((e) => { console.error("\n" + (e?.message ?? e)); process.exit(1); });
