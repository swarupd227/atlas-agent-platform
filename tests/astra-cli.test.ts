import { describe, it, expect } from "vitest";
import { parseArgs, dispatch, type HttpClient, type IO } from "../cli/astra-core";
import { defineTeam } from "../shared/astra-sdk";

// Initiative 01 P3 — the CLI command core, tested with fake HTTP + in-memory fs
// so it runs pure (no network, no disk). Uses the SDK to produce real v2
// manifests as fixtures.

const validManifest = defineTeam({ name: "Claims Triage", version: 1 })
  .agent("intake", { label: "Intake", agent: "fnol-agent" })
  .gate("gate", { label: "Approve", gateType: "approval" })
  .edge("intake", "gate", { evaluationMode: "handoff" })
  .build();

function fakeIO() {
  const files: Record<string, string> = {};
  const out: string[] = [], err: string[] = [];
  const io: IO = {
    readFile: (p) => { if (!(p in files)) throw new Error(`ENOENT ${p}`); return files[p]; },
    writeFile: (p, c) => { files[p] = c; },
    log: (m) => out.push(m),
    error: (m) => err.push(m),
  };
  return { io, files, out, err };
}

const noHttp: HttpClient = { get: async () => { throw new Error("no net"); }, post: async () => { throw new Error("no net"); } };

describe("astra CLI — parseArgs", () => {
  it("splits command, positionals, and flags", () => {
    expect(parseArgs(["push", "flow.json", "--mode", "update", "--agentId", "abc"]))
      .toEqual({ command: "push", positionals: ["flow.json"], flags: { mode: "update", agentId: "abc" } });
  });
  it("treats a trailing --flag as boolean", () => {
    expect(parseArgs(["pull", "a1", "--yaml"]).flags).toEqual({ yaml: true });
  });
});

describe("astra CLI — validate (no network)", () => {
  it("passes a valid v2 manifest", async () => {
    const { io, files, out } = fakeIO();
    files["f.json"] = JSON.stringify(validManifest);
    const code = await dispatch(["validate", "f.json"], { http: noHttp, io });
    expect(code).toBe(0);
    expect(out.join("\n")).toMatch(/valid team manifest/);
  });
  it("fails a manifest with a dangling edge", async () => {
    const { io, files, err } = fakeIO();
    const broken = { ...validManifest, spec: { ...validManifest.spec, edges: [{ from: "intake", to: "ghost" }] } };
    files["b.json"] = JSON.stringify(broken);
    const code = await dispatch(["validate", "b.json"], { http: noHttp, io });
    expect(code).toBe(1);
    expect(err.join("\n")).toMatch(/dangling_edge/);
  });
  it("rejects a non-v2 file", async () => {
    const { io, files } = fakeIO();
    files["v1.json"] = JSON.stringify({ manifestVersion: "1.0", agent: { name: "x" } });
    expect(await dispatch(["validate", "v1.json"], { http: noHttp, io })).toBe(1);
  });
});

describe("astra CLI — pull", () => {
  it("writes the fetched manifest to a slug-named file", async () => {
    const { io, files, out } = fakeIO();
    const http: HttpClient = {
      get: async (path) => {
        expect(path).toBe("/api/agents/team-1/export-manifest?manifestVersion=2");
        return { status: 200, json: validManifest, text: "" };
      },
      post: async () => { throw new Error("unused"); },
    };
    const code = await dispatch(["pull", "team-1"], { http, io });
    expect(code).toBe(0);
    expect(files["claims-triage.astra.json"]).toContain('"astra/v2"');
    expect(out.join("\n")).toMatch(/Pulled team/);
  });
  it("honors --out and reports a non-200", async () => {
    const { io, err } = fakeIO();
    const http: HttpClient = { get: async () => ({ status: 404, json: null, text: "not found" }), post: async () => ({ status: 0, json: null, text: "" }) };
    const code = await dispatch(["pull", "nope", "--out", "x.json"], { http, io });
    expect(code).toBe(1);
    expect(err.join("\n")).toMatch(/Pull failed \(404\)/);
  });
});

describe("astra CLI — push", () => {
  it("validates locally then POSTs to import-manifest with the mode", async () => {
    const { io, files, out } = fakeIO();
    files["f.json"] = JSON.stringify(validManifest);
    let posted: { path: string; body: any } | null = null;
    const http: HttpClient = {
      get: async () => { throw new Error("unused"); },
      post: async (path, body) => { posted = { path, body }; return { status: 200, json: { agentId: "new-1" }, text: "" }; },
    };
    const code = await dispatch(["push", "f.json", "--mode", "create"], { http, io });
    expect(code).toBe(0);
    expect(posted!.path).toBe("/api/agents/import-manifest?mode=create");
    expect(posted!.body.apiVersion).toBe("astra/v2");
    expect(out.join("\n")).toMatch(/agent new-1/);
  });
  it("refuses to push an invalid manifest — no network call", async () => {
    const { io, files, err } = fakeIO();
    files["bad.json"] = JSON.stringify({ ...validManifest, spec: { ...validManifest.spec, edges: [{ from: "intake", to: "ghost" }] } });
    let posted = false;
    const http: HttpClient = { get: async () => { throw new Error("x"); }, post: async () => { posted = true; return { status: 200, json: {}, text: "" }; } };
    const code = await dispatch(["push", "bad.json"], { http, io });
    expect(code).toBe(1);
    expect(posted).toBe(false);
    expect(err.join("\n")).toMatch(/Refusing to push/);
  });
});
