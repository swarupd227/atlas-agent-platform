/**
 * Policy exceptions and agents' tool requests are decided in Astra Cowork and
 * My Actions by the same code (server/action-decisions.ts): checked against
 * the organization, decided once, audited under the person who decided.
 * Before this, My Actions wrote the row directly with "outcome_owner" as the
 * decider and no audit record, and Cowork sent both kinds away.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { answerToolRequestTool, decidePolicyExceptionTool } from "../server/astra/tools/decide-exception-and-tool-request";

const ORG = "org-a";
const exception = (over: Record<string, any> = {}) => ({
  id: "pe-1", status: "pending", reason: "Quarter-end batch needs the export tool", scope: "agent", requestedBy: "ops",
  expiresAt: "2026-10-01T00:00:00.000Z", policy: { id: "p-1", name: "Data Export Policy" }, agent: { id: "a-1", name: "Invoice Agent" }, ...over,
});
const toolRequest = (over: Record<string, any> = {}) => ({
  id: "el-1", status: "pending", toolName: "send_email", serverName: "Microsoft Graph", reason: "Notify the customer",
  riskFlags: ["external_recipient"], proposedArgs: '{"to":"a@b.com"}', needsAnswer: false, agent: { id: "a-1", name: "Invoice Agent" }, ...over,
});

function ctx(services: Record<string, any>) {
  return { orgId: ORG, userId: "u-1", role: "admin", threadId: "t", services: { getUserDisplayName: vi.fn(async () => "Priya"), ...services } } as any;
}

describe("decide_policy_exception", () => {
  it("says an approved exception is recorded but not yet enforced", async () => {
    const p: any = await decidePolicyExceptionTool.preview!(ctx({ getPolicyExceptionForDecision: vi.fn(async () => exception()) }), { exceptionId: "pe-1", decision: "approve" });
    expect(p.summary).toBe("Approve exception to Data Export Policy for Invoice Agent");
    expect(p.details.join(" ")).toContain("The runtime doesn't read exceptions yet, so the policy is still enforced as before.");
    expect(p.details).toContain("Reason given: Quarter-end batch needs the export tool");
  });

  it("refuses an exception that's already decided, or not in the organization", async () => {
    expect(await decidePolicyExceptionTool.preview!(ctx({ getPolicyExceptionForDecision: vi.fn(async () => exception({ status: "approved" })) }), { exceptionId: "pe-1", decision: "reject" }))
      .toEqual({ refuse: "That exception was already approved. Nothing to decide." });
    expect(await decidePolicyExceptionTool.preview!(ctx({ getPolicyExceptionForDecision: vi.fn(async () => null) }), { exceptionId: "x", decision: "reject" }))
      .toEqual({ refuse: "No policy exception with that id in this organization." });
  });

  it("decides it as the signed-in person", async () => {
    const decide = vi.fn(async () => ({ exception: { id: "pe-1", status: "rejected" }, runtimeEffect: null }));
    const out = await decidePolicyExceptionTool.run(ctx({ getPolicyExceptionForDecision: vi.fn(async () => exception()), decidePolicyExceptionAs: decide }), { exceptionId: "pe-1", decision: "reject", note: "Use the scheduled export" });
    expect(decide).toHaveBeenCalledWith(ORG, "u-1", "Priya", "pe-1", "reject", "Use the scheduled export");
    expect((out.payload as any).decided).toBe(true);
  });

  it("needs the approve_changes permission and a confirmation", () => {
    expect(decidePolicyExceptionTool.permission).toBe("approve_changes");
    expect(decidePolicyExceptionTool.confirm).toBe(true);
  });
});

describe("answer_tool_request", () => {
  it("shows the agent, tool, reason, risk flags and the arguments it proposed", async () => {
    const p: any = await answerToolRequestTool.preview!(ctx({ getToolRequestForDecision: vi.fn(async () => toolRequest()) }), { requestId: "el-1", decision: "approve" });
    expect(p.summary).toBe("Let Invoice Agent use send_email on Microsoft Graph");
    expect(p.details).toEqual(expect.arrayContaining(["Why it asked: Notify the customer", "Risk flags: external_recipient", 'With: {"to":"a@b.com"}']));
  });

  it("sends a request that needs a form or link answer to Approval Gates", async () => {
    const p: any = await answerToolRequestTool.preview!(ctx({ getToolRequestForDecision: vi.fn(async () => toolRequest({ needsAnswer: true })) }), { requestId: "el-1", decision: "approve" });
    expect(p.refuse).toContain("/approvals/gates");
  });

  it("answers it as the signed-in person", async () => {
    const respond = vi.fn(async () => ({ toolRequest: { id: "el-1", status: "declined" } }));
    await answerToolRequestTool.run(ctx({ getToolRequestForDecision: vi.fn(async () => toolRequest()), respondToToolRequestAs: respond }), { requestId: "el-1", decision: "decline" });
    expect(respond).toHaveBeenCalledWith(ORG, "u-1", "Priya", "el-1", "decline", undefined);
  });
});

describe("one decision path", () => {
  const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");

  it("My Actions no longer writes decisions directly or records a made-up decider", () => {
    const route = read("server", "routes", "my-actions.ts");
    expect(route).not.toContain('"outcome_owner"');
    expect(route).not.toContain("db.update(");
    expect(route).toContain("decidePolicyException(");
    expect(route).toContain("respondToToolRequest(");
  });

  it("both decisions check the organization and leave an audit record", () => {
    const src = read("server", "action-decisions.ts");
    for (const fn of ["decidePolicyException", "respondToToolRequest"]) {
      const body = src.slice(src.indexOf(`export async function ${fn}`), src.indexOf("export async function", src.indexOf(`export async function ${fn}`) + 10));
      expect(body).toMatch(/filter(PolicyExceptions|Elicitations)ForOrg/);
      expect(body).toContain('!== "pending"');
      expect(body).toContain("createAuditEvent");
    }
  });

  it("Cowork can call both tools", () => {
    const wiring = read("server", "astra", "wiring.ts");
    expect(wiring).toContain("decidePolicyExceptionTool, answerToolRequestTool");
  });
});
