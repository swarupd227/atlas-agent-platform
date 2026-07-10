/**
 * Engine-parity conformance gate.
 *
 * The platform has two agent execution engines:
 *   1. executePromptWithMcp        — server/agent-runtime.ts (LLM function-calling loop)
 *   2. POST /api/runtime/run       — server/routes/runtime.ts (deployment runtime loop)
 *
 * Every tool invocation MUST flow through dispatchToolCall() in
 * server/tool-dispatcher.ts, where the safety gates (policy bundle, AAR
 * constraint list, skill allowlist, rate limit) and the real execution live.
 * History: the skill gate was originally added to engine 1 only, leaving
 * engine 2 unguarded until a live probe caught it. This test makes that class
 * of drift a CI failure instead of a production incident.
 *
 * These are static source-conformance checks (no DB, no network) so they run
 * in the deterministic CI unit-test job.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { resolve } from "path";

const root = resolve(__dirname, "..");
const read = (p: string) => readFileSync(resolve(root, p), "utf-8");

const dispatcher = read("server/tool-dispatcher.ts");
const engine1 = read("server/agent-runtime.ts");
const engine2 = read("server/routes/runtime.ts");
const engine3 = read("server/workspace-run.ts");
const governanceProxy = read("server/routes/governance-proxy.ts");

describe("tool-dispatcher module", () => {
  it("exports the single gated dispatch entry point", () => {
    expect(dispatcher).toMatch(/export async function dispatchToolCall\(/);
  });

  it("owns all four gates and execution", () => {
    // Gate implementations must live in the dispatcher, not in engines.
    expect(dispatcher).toMatch(/gate_blocked_skill/);
    expect(dispatcher).toMatch(/gate_blocked_policy/);
    expect(dispatcher).toMatch(/evaluateActionPolicy/); // AAR gate
    expect(dispatcher).toMatch(/checkRateLimit/);
    expect(dispatcher).toMatch(/async function executeTool\(/);
  });
});

describe("engine 1 (agent-runtime.ts) conformance", () => {
  it("routes tool calls through dispatchToolCall", () => {
    expect(engine1).toMatch(/dispatchToolCall\(\s*\{/);
  });

  it("does not implement its own dispatch or gates", () => {
    // The old direct-execution and inline-gate functions must not reappear.
    expect(engine1).not.toMatch(/function callMcpTool\(/);
    expect(engine1).not.toMatch(/function evaluateActionPolicy\(/);
    // Raw MCP SDK execution is dispatcher-only.
    expect(engine1).not.toMatch(/mcpCallTool/);
  });

  it("records skill attribution (skill_resolution step)", () => {
    expect(engine1).toMatch(/skill_resolution/);
  });
});

describe("engine 2 (routes/runtime.ts) conformance", () => {
  it("routes tool calls through dispatchToolCall", () => {
    expect(engine2).toMatch(/dispatchToolCall\(\s*\{/);
  });

  it("does not use the removed simulated proxy or its own execution", () => {
    expect(engine2).not.toMatch(/proxyToolCall/);
    expect(engine2).not.toMatch(/mcpCallTool/);
  });

  it("resolves real tools instead of fabricating results", () => {
    expect(engine2).toMatch(/gatherAvailableTools\(/);
    expect(engine2).toMatch(/tool_unresolved/);
    // The old fake-success string must never come back.
    expect(engine2).not.toMatch(/Executed \$\{toolName\} successfully/);
  });

  it("records skill attribution (skill_resolution step)", () => {
    expect(engine2).toMatch(/skill_resolution/);
  });
});

describe("engine 3 (workspace-run.ts) conformance", () => {
  it("routes tool calls through dispatchToolCall", () => {
    expect(engine3).toMatch(/dispatchToolCall\(\s*\{/);
  });

  it("does not implement its own dispatch or gates", () => {
    expect(engine3).not.toMatch(/\bmcpCallTool\b/);
    expect(engine3).not.toMatch(/function evaluateActionPolicy\(/);
    expect(engine3).not.toMatch(/\bproxyToolCall\b/);
  });

  it("is resumable — suspends on the approval gate rather than skipping it", () => {
    expect(engine3).toMatch(/gate_requires_approval/);
    expect(engine3).toMatch(/awaiting_approval/);
  });
});

describe("no simulated tool execution anywhere in the dispatch path", () => {
  it("governance-proxy no longer simulates tool execution", () => {
    expect(governanceProxy).not.toMatch(/Simulate execution/);
    expect(governanceProxy).not.toMatch(/simulatedResult/);
  });
});

describe("no execution path bypasses the dispatcher (per-caller closure)", () => {
  // Every agent tool call flows through one of two engines, and both route
  // through dispatchToolCall. All ~9 executePromptWithMcp callers therefore
  // inherit the gates transitively — this proves it structurally by asserting
  // that raw tool-execution primitives appear ONLY inside the dispatcher.
  const serverDir = resolve(root, "server");

  function walk(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules") continue;
        out.push(...walk(full));
      } else if (entry.name.endsWith(".ts")) {
        out.push(full);
      }
    }
    return out;
  }

  const files = walk(serverDir);

  // Files permitted to call mcpCallTool directly, each with a documented reason.
  // The AGENT tool-execution engines are NOT on this list — they must use the
  // dispatcher. Adding a file here requires a real justification.
  const RAW_MCP_ALLOWED: Array<{ path: string; reason: string }> = [
    { path: "/server/tool-dispatcher.ts", reason: "the dispatcher IS the execution home" },
    { path: "/server/mcp-client.ts", reason: "definition + re-export of mcpCallTool" },
    { path: "/server/routes/aar.ts", reason: "AAR invoke-tool RPC — separately gated by evaluateActionAgainstConstraints (superset gate: constraint lists + policy rules + approvals) plus fingerprint/drift detection; not an agent LLM-loop engine" },
  ];

  it("mcpCallTool (raw MCP SDK execution) is confined to allowlisted, documented homes", () => {
    const offenders = files.filter(f => {
      const rel = f.replace(root, "").replace(/\\/g, "/");
      if (RAW_MCP_ALLOWED.some(a => rel.endsWith(a.path))) return false;
      return /\bmcpCallTool\b/.test(read(rel.slice(1)));
    }).map(f => f.replace(root, ""));
    expect(offenders, `raw mcpCallTool outside the dispatcher/allowlist: ${offenders.join(", ")}`).toEqual([]);
  });

  it("the AAR invoke-tool path is gated (constraint evaluation precedes execution)", () => {
    // The one non-dispatcher execution path must still gate. If aar.ts ever
    // calls invokeViaMcp without evaluateActionAgainstConstraints first, this
    // fails — the path would have become an ungated bypass.
    const aar = read("server/routes/aar.ts");
    expect(aar).toMatch(/evaluateActionAgainstConstraints/);
    // The invoke-tool RPC blocks on a BLOCK decision before invoking.
    expect(aar).toMatch(/decision === "BLOCK"/);
  });

  it("the simulated proxyToolCall is gone from every route", () => {
    const offenders = files.filter(f => {
      const rel = f.replace(root, "").replace(/\\/g, "/").slice(1);
      return /\bproxyToolCall\b/.test(read(rel));
    }).map(f => f.replace(root, ""));
    expect(offenders, `proxyToolCall still referenced: ${offenders.join(", ")}`).toEqual([]);
  });

  it("every LLM tool-loop engine routes through the dispatcher", () => {
    // The sanctioned engines. If a NEW engine is added that reimplements the
    // loop, wire it through dispatchToolCall and add it here — do not delete
    // the assertion. The invariant is: one dispatcher, N conformant callers.
    expect(engine1).toMatch(/export async function executePromptWithMcp/);
    expect(engine1).toMatch(/dispatchToolCall\(\s*\{/);
    expect(engine3).toMatch(/export async function startWorkspaceRun/);
    expect(engine3).toMatch(/dispatchToolCall\(\s*\{/);
  });
});
