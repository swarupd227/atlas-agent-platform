/**
 * The native-tool switches of the platform lockdown (nativeTools): web search, code execution and
 * document generation. Each is closed where the tool is offered and again where it would run, and
 * a source ratchet makes sure no runtime decides "web search is on" without asking the lockdown.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

vi.mock("../server/storage", () => ({
  storage: {
    createAuditEvent: vi.fn().mockResolvedValue({}),
    recordToolInvocation: vi.fn().mockResolvedValue({}),
    createAgentGeneratedFile: vi.fn().mockResolvedValue({ id: "file-1", filename: "x.pdf", mimeType: "application/pdf" }),
    getAgent: vi.fn().mockResolvedValue({ id: "agent-1", name: "Test Agent", riskTier: "LOW", autonomyMode: "autonomous", organizationId: null }),
    getAarConfig: vi.fn().mockResolvedValue(null),
    createAarActionDecision: vi.fn().mockResolvedValue({}),
    getMcpServer: vi.fn().mockResolvedValue(undefined),
    getActiveWarrant: vi.fn().mockResolvedValue(undefined),
    getAgentTeamMembers: vi.fn().mockResolvedValue([]),
    getSkillsByIds: vi.fn().mockResolvedValue([]),
    listAgentTaskClasses: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock("../server/routes/helpers", () => ({ resolvePolicyBundle: vi.fn() }));

import { LockdownError, describeLockdown, getLockdown, lockdownPublicView, nativeToolAllowed, parseLockdown } from "../server/lockdown";
import { webSearchOffered } from "../server/native-tools";
import { buildCodeExecutionRequestConfig, resolveCodeExecutionAccess } from "../server/anthropic-code-execution";
import { documentToolsForSkills, executeBuiltinDocumentTool, GENERATE_PDF_TOOL } from "../server/builtin-document-tools";
import { dispatchToolCall } from "../server/tool-dispatcher";
import { storage } from "../server/storage";

const saved = process.env.ASTRA_LOCKDOWN;
const lock = (cfg: unknown) => { process.env.ASTRA_LOCKDOWN = JSON.stringify(cfg); };
beforeEach(() => { delete process.env.ASTRA_LOCKDOWN; vi.mocked(storage.createAuditEvent).mockClear(); });
afterEach(() => { if (saved === undefined) delete process.env.ASTRA_LOCKDOWN; else process.env.ASTRA_LOCKDOWN = saved; });

const skill = (over: Record<string, any> = {}) =>
  ({ id: "s1", name: "PDF & PPTX Generator", status: "active", skillKind: "code_execution", codeExecutionApproved: true, anthropicSkillIds: ["pptx", "pdf", "custom"], ...over }) as any;
const WEB = [{ name: "web_search", type: "builtin" }];

describe("the config", () => {
  it("allows every native tool when nothing is set", () => {
    for (const t of ["webSearch", "codeExecution", "documents"] as const) expect(nativeToolAllowed(t)).toBe(true);
    expect(getLockdown().active).toBe(false);
  });

  it("closes only the tool it names", () => {
    lock({ nativeTools: { webSearch: "off" } });
    expect([nativeToolAllowed("webSearch"), nativeToolAllowed("codeExecution"), nativeToolAllowed("documents")]).toEqual([false, true, true]);
    expect(getLockdown().active).toBe(true);
    lock({ nativeTools: { documents: "off", codeExecution: "off" } });
    expect([nativeToolAllowed("webSearch"), nativeToolAllowed("codeExecution"), nativeToolAllowed("documents")]).toEqual([true, false, false]);
  });

  it.each(["webSearch", "codeExecution", "documents"] as const)("switching only %s off is enough to make the lockdown active", (tool) => {
    lock({ nativeTools: { [tool]: "off" } });
    expect(getLockdown().active).toBe(true);
    expect(lockdownPublicView().active).toBe(true);
  });

  it("an explicit on is the same as unset", () => {
    lock({ nativeTools: { webSearch: "on", codeExecution: "on", documents: "on" } });
    expect(getLockdown().active).toBe(false);
  });

  it("is reported to the app and in the startup line", () => {
    lock({ nativeTools: { webSearch: "off" } });
    expect(lockdownPublicView().nativeTools).toEqual({ webSearch: "off", codeExecution: "on", documents: "on" });
    expect(describeLockdown()).toBe("lockdown=web-search");
    lock({ nativeTools: { webSearch: "off", codeExecution: "off", documents: "off" } });
    expect(describeLockdown()).toBe("lockdown=web-search,code-execution,documents");
  });

  it("is frozen", () => {
    const l = parseLockdown('{"nativeTools":{"webSearch":"off"}}');
    expect(Object.isFrozen(l.nativeTools)).toBe(true);
  });

  it.each([
    ["an unknown native tool", '{"nativeTools":{"imageGeneration":"off"}}'],
    ["a value that is not on or off", '{"nativeTools":{"webSearch":"maybe"}}'],
    ["a boolean where on/off is wanted", '{"nativeTools":{"webSearch":false}}'],
    ["a list", '{"nativeTools":["webSearch"]}'],
  ])("refuses %s, which would otherwise mean no restriction", (_n, raw) => {
    expect(() => parseLockdown(raw)).toThrow();
  });
});

describe("web search", () => {
  it("is offered to an agent that asked for it", () => {
    expect(webSearchOffered(WEB)).toBe(true);
  });
  it("is not offered to an agent that did not, or whose config is not a list", () => {
    expect(webSearchOffered([])).toBe(false);
    expect(webSearchOffered([{ name: "web_search", type: "custom" }])).toBe(false);
    expect(webSearchOffered(undefined)).toBe(false);
    expect(webSearchOffered({ name: "web_search", type: "builtin" })).toBe(false);
  });
  it("is not offered when the deployment turned it off, however the agent is configured", () => {
    lock({ nativeTools: { webSearch: "off" } });
    expect(webSearchOffered(WEB)).toBe(false);
  });
  it("stays on when a different native tool is off", () => {
    lock({ nativeTools: { documents: "off", codeExecution: "off" } });
    expect(webSearchOffered(WEB)).toBe(true);
  });
});

describe("code execution", () => {
  it("is offered for an approved skill", () => {
    expect(buildCodeExecutionRequestConfig([skill()])).not.toBeNull();
  });
  it("is not offered when the deployment turned it off, approved or not", () => {
    lock({ nativeTools: { codeExecution: "off" } });
    expect(buildCodeExecutionRequestConfig([skill()])).toBeNull();
  });
  it("is not enabled by the access check when it is off, and the check does not file an approval", async () => {
    lock({ nativeTools: { codeExecution: "off" } });
    expect(await resolveCodeExecutionAccess("agent-1", [skill()])).toEqual({ enabled: false });
    expect(storage.getAarConfig).not.toHaveBeenCalled();
  });
  it("stays on when a different native tool is off", () => {
    lock({ nativeTools: { webSearch: "off", documents: "off" } });
    expect(buildCodeExecutionRequestConfig([skill()])).not.toBeNull();
  });
});

describe("document generation", () => {
  it("is offered to an agent holding the document skill", () => {
    expect(documentToolsForSkills([skill()]).length).toBeGreaterThan(0);
  });
  it("is not offered when the deployment turned it off", () => {
    lock({ nativeTools: { documents: "off" } });
    expect(documentToolsForSkills([skill()])).toEqual([]);
  });
  it("cannot be run when it is off, even by a caller that skipped the offer", async () => {
    lock({ nativeTools: { documents: "off" } });
    await expect(executeBuiltinDocumentTool(GENERATE_PDF_TOOL, { title: "t", sections: [{ heading: "h", bullets: ["b"] }] }, { agentId: "agent-1" })).rejects.toBeInstanceOf(LockdownError);
    expect(storage.createAgentGeneratedFile).not.toHaveBeenCalled();
  });
  it("is refused at the dispatcher and recorded, before any other gate", async () => {
    const [tool] = documentToolsForSkills([skill()]);
    lock({ nativeTools: { documents: "off" } });
    const res = await dispatchToolCall({
      agentId: "agent-1", tool, args: { title: "t", sections: [{ heading: "h", bullets: ["b"] }] },
      policyBundle: { appliedPolicies: [], blockedTools: [], toolAllowlist: [], monitorBlockedTools: [], blockedToolsToPolicyIds: {}, redactPatterns: [], guardrails: [] } as any,
    });
    expect(res.outcome).toBe("gate_blocked_lockdown");
    expect(res.ok).toBe(false);
    expect(storage.createAgentGeneratedFile).not.toHaveBeenCalled();
    const audit = vi.mocked(storage.createAuditEvent).mock.calls.map((c) => c[0] as any);
    expect(audit.some((e) => e.action === "tool_blocked_lockdown" && JSON.parse(e.details).connectorKind === "documents")).toBe(true);
  });
});

// ── Ratchet: nobody decides "web search is on" without the lockdown ──────────
const SERVER_DIR = path.join(__dirname, "..", "server");
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith(".ts") ? [path.join(dir, e.name)] : []));
const src = (f: string) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");

describe("every runtime asks the lockdown", () => {
  const files = walk(SERVER_DIR);

  it("no file reads the web_search toolsConfig convention itself: it goes through webSearchOffered", () => {
    const own = files.filter((f) => /name\s*===\s*"web_search"\s*&&\s*\w+\??\.type\s*===\s*"builtin"/.test(src(f)));
    expect(own.map((f) => path.relative(SERVER_DIR, f))).toEqual(["native-tools.ts"]);
  });

  it("the places that build the web_search server tool use webSearchOffered", () => {
    const builders = files.filter((f) => src(f).includes("type: \"web_search_20250305\"") && !f.endsWith("native-tools.ts"));
    for (const f of builders) expect(src(f), path.relative(SERVER_DIR, f)).toContain("webSearchOffered(");
  });

  it("the document tools and code execution consult nativeToolAllowed where they offer and run", () => {
    expect(src(path.join(SERVER_DIR, "builtin-document-tools.ts"))).toMatch(/documentToolsForSkills[\s\S]{0,600}nativeToolAllowed\("documents"\)/);
    expect(src(path.join(SERVER_DIR, "builtin-document-tools.ts"))).toMatch(/executeBuiltinDocumentTool[\s\S]{0,600}nativeToolAllowed\("documents"\)/);
    expect(src(path.join(SERVER_DIR, "anthropic-code-execution.ts"))).toMatch(/buildCodeExecutionRequestConfig[\s\S]{0,900}nativeToolAllowed\("codeExecution"\)/);
    expect(src(path.join(SERVER_DIR, "anthropic-code-execution.ts"))).toMatch(/resolveCodeExecutionAccess[\s\S]{0,400}nativeToolAllowed\("codeExecution"\)/);
  });

  it("the route that approves code execution on a skill is mounted behind its gate", () => {
    expect(src(path.join(SERVER_DIR, "routes.ts"))).toContain('app.use("/api/skills/:id/enable-code-execution", lockdownGate("codeExecution"));');
  });
});
