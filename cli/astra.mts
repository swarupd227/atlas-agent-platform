#!/usr/bin/env -S npx tsx
// astra CLI entry — wires the real fetch/fs/console into the pure command core
// (cli/astra-core.ts). Run: npx tsx cli/astra.mts <command> [...]
//
// Auth/config via env (never hardcoded):
//   ASTRA_URL       base URL, e.g. https://astra-agents-artizent.azurewebsites.net
//   ASTRA_COOKIE    a session cookie (auth_token=...), OR
//   ASTRA_USERNAME + ASTRA_PASSWORD  to log in and obtain one
import fs from "node:fs";
import { dispatch, type HttpClient, type IO } from "./astra-core";

const BASE = process.env.ASTRA_URL?.replace(/\/$/, "");

async function resolveCookie(): Promise<string> {
  if (process.env.ASTRA_COOKIE) return process.env.ASTRA_COOKIE;
  const u = process.env.ASTRA_USERNAME, p = process.env.ASTRA_PASSWORD;
  if (!u || !p) throw new Error("Set ASTRA_COOKIE, or ASTRA_USERNAME + ASTRA_PASSWORD, to authenticate.");
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: u, password: p }),
  });
  const setC = r.headers.get("set-cookie");
  if (r.status !== 200 || !setC) throw new Error(`Login failed (${r.status}).`);
  return setC.split(";")[0];
}

async function main() {
  const argv = process.argv.slice(2);
  const command = argv[0];
  const io: IO = {
    readFile: (p) => fs.readFileSync(p, "utf8"),
    writeFile: (p, c) => fs.writeFileSync(p, c),
    log: (m) => console.log(m),
    error: (m) => console.error(m),
  };

  // Commands that hit the network need a base URL + auth; `validate`/help don't.
  const needsNetwork = command === "pull" || command === "push";
  let http: HttpClient;
  if (needsNetwork) {
    if (!BASE) { console.error("Set ASTRA_URL to the platform base URL."); process.exit(2); }
    let cookie: string;
    try { cookie = await resolveCookie(); } catch (e) { console.error((e as Error).message); process.exit(2); return; }
    const call = async (method: string, path: string, body?: unknown) => {
      const r = await fetch(`${BASE}${path}`, {
        method,
        headers: { "content-type": "application/json", cookie },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      let json: any = null, text = "";
      try { text = await r.text(); json = JSON.parse(text); } catch { /* non-JSON */ }
      return { status: r.status, json, text: text.slice(0, 400) };
    };
    http = { get: (p) => call("GET", p), post: (p, b) => call("POST", p, b) };
  } else {
    const unavailable = async () => { throw new Error("network unavailable for this command"); };
    http = { get: unavailable, post: unavailable };
  }

  const code = await dispatch(argv, { http, io });
  process.exit(code);
}

main().catch((e) => { console.error(e?.message || e); process.exit(1); });
