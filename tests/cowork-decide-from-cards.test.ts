/**
 * Deciding from Cowork's cards. A team run paused at a gate can be approved
 * or rejected from its card, and the Needs you card has a Decide button per
 * item. A button only sends a message: the decision is still Astra's
 * confirmation card, so nothing is decided unseen. A rejection can open a
 * follow-up task, the same as on the Approvals page.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { decidePrompt, gatePrompt } from "../client/src/astra/decide-prompt";
import { decideApprovalTool } from "../server/astra/tools/decide-approval";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");

describe("what a Decide button asks", () => {
  it("names the item and its id, with the choices for its kind", () => {
    expect(decidePrompt({ source: "approval", sourceId: "ap-1", title: "Launch readiness" })).toBe('Show me "Launch readiness" (approval ap-1) so I can approve or reject it.');
    expect(decidePrompt({ source: "governance", sourceId: "pe-1", title: "Export exception" })).toContain("(policy exception pe-1) so I can approve or reject it");
    expect(decidePrompt({ source: "autonomy", sourceId: "el-1", title: "Use send_email" })).toContain("(tool request el-1) so I can approve or decline it");
    expect(decidePrompt({ source: "alert", sourceId: "al-1", title: "Latency spike" })).toContain("so I can acknowledge it");
    expect(decidePrompt({ source: "recommendation", sourceId: "r-1", title: "Cut cost" })).toContain("so I can accept or dismiss it");
  });

  it("approves a gate so the run continues, and asks why before rejecting", () => {
    expect(gatePrompt("approve", "ap-9", "Legal review")).toBe('Approve the "Legal review" gate (approval ap-9) so the team run continues.');
    expect(gatePrompt("reject", "ap-9", null)).toBe("Reject the approval gate (approval ap-9). Ask me why first, and whether to open a follow-up task.");
  });
});

describe("the cards", () => {
  it("a paused team run offers Approve and Reject, and keeps the link to the full evidence", () => {
    const src = read("client", "src", "astra", "renderers", "team-run.tsx");
    expect(src).toContain('data-testid="astra-team-run-approve"');
    expect(src).toContain('data-testid="astra-team-run-reject"');
    expect(src).toContain("Full evidence");
  });

  it("Needs you items that can be decided here have a Decide button", () => {
    expect(read("client", "src", "astra", "renderers", "needs-me.tsx")).toContain("onAsk(decidePrompt(i))");
  });

  it("the card pane passes the conversation's send to every card", () => {
    expect(read("client", "src", "astra", "artifact-pane.tsx")).toContain("<Render props={artifact.props} onAsk={onAsk} />");
    expect(read("client", "src", "astra", "astra-layout.tsx")).toContain("onAsk={(text) => void send(text)}");
  });
});

describe("reject with a follow-up", () => {
  const approval = { id: "ap-1", status: "pending", type: "launch_readiness", objectType: "deployment", objectName: "Invoice Agent v2", requiredReviewerRole: null, requestedBy: "ops", createdAt: null, description: null, canDecide: { allowed: true, reason: "" }, outcome: null };
  const ctx = (decide = vi.fn(async () => ({ outcomeStatus: null, followUpTaskId: "ap-2" }))) =>
    ({
      orgId: "o", userId: "u", role: "admin", threadId: "t",
      services: { getApprovalForDecision: vi.fn(async () => approval), decideApprovalAs: decide, getUserDisplayName: vi.fn(async () => "Priya") },
      permissions: {},
    }) as any;

  it("the card says a follow-up task will be opened, and passes it to the decision", async () => {
    const p: any = await decideApprovalTool.preview!(ctx(), { approvalId: "ap-1", decision: "reject", note: "Evals too thin", followUp: "Add 10 golden cases for refunds" });
    expect(p.details).toContain("Opens a follow-up task: Add 10 golden cases for refunds");
    const decide = vi.fn(async () => ({ outcomeStatus: null, followUpTaskId: "ap-2" }));
    const out = await decideApprovalTool.run(ctx(decide), { approvalId: "ap-1", decision: "reject", note: "Evals too thin", followUp: "Add 10 golden cases for refunds" });
    expect(decide).toHaveBeenCalledWith("o", "admin", "u", "Priya", "ap-1", "rejected", "Evals too thin", "Add 10 golden cases for refunds");
    expect((out.payload as any).followUpTaskId).toBe("ap-2");
  });

  it("an approval never carries a follow-up", async () => {
    const decide = vi.fn(async () => ({ outcomeStatus: null, followUpTaskId: null }));
    await decideApprovalTool.run(ctx(decide), { approvalId: "ap-1", decision: "approve", followUp: "ignored" });
    expect(decide).toHaveBeenCalledWith("o", "admin", "u", "Priya", "ap-1", "approved", undefined, undefined);
  });

  it("the shared decision opens the follow-up on a rejection only, linked back to the approval", () => {
    const src = read("server", "approval-decision.ts");
    const body = src.slice(src.indexOf("export async function decideApproval"));
    expect(body).toContain('input.decision === "rejected" && input.followUp?.description.trim()');
    expect(body).toContain('type: "follow_up_task"');
    expect(body).toContain("parentApprovalId: approval.id");
    expect(body).toContain("followUpTaskId");
  });
});
