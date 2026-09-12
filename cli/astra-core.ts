// astra CLI — command core (Initiative 01, P3). Pure and dependency-injected:
// the HTTP client, filesystem, and console are all passed in, so every command
// unit-tests without a network or disk. The thin entry (cli/astra.mts) wires the
// real fetch/fs. Nothing in the server runtime imports this.
//
// Commands:
//   astra validate <file>                     — local v2 validation, no network
//   astra pull <agentId> [--out <file>]       — GET export-manifest?manifestVersion=2
//   astra push <file> [--mode create|update] [--agentId <id>]  — POST import-manifest
//
// Manifests are JSON on disk for a clean round-trip (pull then push) with no
// YAML dependency; a human-readable YAML emitter is a later nicety.

import { validateManifest, isV2Manifest } from "../shared/manifest-v2";

export interface HttpResponse { status: number; json: any; text: string; }
export interface HttpClient {
  get(path: string): Promise<HttpResponse>;
  post(path: string, body: unknown): Promise<HttpResponse>;
}
export interface IO {
  readFile(path: string): string;
  writeFile(path: string, content: string): void;
  log(msg: string): void;
  error(msg: string): void;
}

export interface ParsedArgs {
  command: string;
  positionals: string[];
  flags: Record<string, string | boolean>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const [command = "", ...rest] = argv;
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = rest[i + 1];
      if (next !== undefined && !next.startsWith("--")) { flags[key] = next; i++; }
      else flags[key] = true;
    } else {
      positionals.push(a);
    }
  }
  return { command, positionals, flags };
}

const USAGE = [
  "astra — manage Astra flows/agents as code (Manifest v2)",
  "",
  "  astra validate <file.astra.json>",
  "  astra pull <agentId> [--out <file>]",
  "  astra push <file.astra.json> [--mode create|update] [--agentId <id>]",
  "",
  "  Env: ASTRA_URL (base URL), and either ASTRA_COOKIE or ASTRA_USERNAME/ASTRA_PASSWORD.",
].join("\n");

function parseManifestFile(io: IO, path: string): any {
  const raw = io.readFile(path);
  try { return JSON.parse(raw); }
  catch { throw new Error(`${path} is not valid JSON.`); }
}

export function runValidate(args: ParsedArgs, io: IO): number {
  const file = args.positionals[0];
  if (!file) { io.error("Usage: astra validate <file>"); return 2; }
  let m: any;
  try { m = parseManifestFile(io, file); } catch (e) { io.error((e as Error).message); return 1; }
  if (!isV2Manifest(m)) { io.error(`${file} is not an Astra Manifest v2 (missing apiVersion: astra/v2).`); return 1; }
  const issues = validateManifest(m);
  if (issues.length > 0) {
    io.error(`✗ ${file}: ${issues.length} issue${issues.length !== 1 ? "s" : ""}`);
    for (const i of issues) io.error(`  - [${i.code}] ${i.message}`);
    return 1;
  }
  io.log(`✓ ${file} — valid ${m.kind} manifest "${m.metadata?.name}"`);
  return 0;
}

export async function runPull(args: ParsedArgs, http: HttpClient, io: IO): Promise<number> {
  const agentId = args.positionals[0];
  if (!agentId) { io.error("Usage: astra pull <agentId> [--out <file>]"); return 2; }
  const res = await http.get(`/api/agents/${agentId}/export-manifest?manifestVersion=2`);
  if (res.status !== 200 || !res.json) {
    io.error(`Pull failed (${res.status}): ${res.text || "no body"}`);
    return 1;
  }
  const m = res.json;
  const out = (typeof args.flags.out === "string" && args.flags.out) || `${m?.metadata?.slug || agentId}.astra.json`;
  io.writeFile(out, JSON.stringify(m, null, 2) + "\n");
  io.log(`Pulled ${m.kind} "${m.metadata?.name}" → ${out}`);
  return 0;
}

export async function runPush(args: ParsedArgs, http: HttpClient, io: IO): Promise<number> {
  const file = args.positionals[0];
  if (!file) { io.error("Usage: astra push <file> [--mode create|update] [--agentId <id>]"); return 2; }
  let m: any;
  try { m = parseManifestFile(io, file); } catch (e) { io.error((e as Error).message); return 1; }
  if (!isV2Manifest(m)) { io.error(`${file} is not an Astra Manifest v2.`); return 1; }
  // Client-side guard: refuse to push a manifest the server would reject, so a
  // broken graph never leaves the developer's machine.
  const issues = validateManifest(m);
  if (issues.length > 0) {
    io.error(`Refusing to push — ${file} has ${issues.length} validation issue${issues.length !== 1 ? "s" : ""}:`);
    for (const i of issues) io.error(`  - [${i.code}] ${i.message}`);
    return 1;
  }
  const mode = (typeof args.flags.mode === "string" && args.flags.mode) || "create";
  const agentIdQ = typeof args.flags.agentId === "string" ? `&agentId=${encodeURIComponent(args.flags.agentId)}` : "";
  const res = await http.post(`/api/agents/import-manifest?mode=${encodeURIComponent(mode)}${agentIdQ}`, m);
  if (res.status !== 200 && res.status !== 201) {
    io.error(`Push failed (${res.status}): ${res.json?.message || res.text || "no body"}`);
    return 1;
  }
  const newId = res.json?.agentId || res.json?.agent?.id || res.json?.id || "?";
  io.log(`Pushed "${m.metadata?.name}" (${mode}) → agent ${newId}`);
  return 0;
}

export async function dispatch(argv: string[], deps: { http: HttpClient; io: IO }): Promise<number> {
  const args = parseArgs(argv);
  switch (args.command) {
    case "validate": return runValidate(args, deps.io);
    case "pull": return runPull(args, deps.http, deps.io);
    case "push": return runPush(args, deps.http, deps.io);
    case "":
    case "help":
    case "--help":
    case "-h":
      deps.io.log(USAGE);
      return args.command ? 0 : 2;
    default:
      deps.io.error(`Unknown command: ${args.command}\n\n${USAGE}`);
      return 2;
  }
}
