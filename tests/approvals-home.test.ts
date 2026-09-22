/**
 * Approvals, rebuilt to the approved one-page redesign. Counted figures only:
 * the old queue's "evidence %", "AI recommendation" and always-unmet
 * requirements are gone, and a risk score is shown as the requester's own.
 * Urgency in My Actions and Cowork comes from the due date, not the risk
 * score. /approvals/:id opens the request on this page.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { approvalCounts, approveLabel, dueLabel, isOpen, queueOrder } from "../client/src/pages/approvals-home";

const NOW = new Date("2026-09-22T12:00:00Z").getTime();
const hours = (h: number) => new Date(NOW + h * 3_600_000).toISOString();
const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");

describe("what's open and when it's due", () => {
  it("pending and sent back are open; decided ones aren't", () => {
    expect(isOpen("pending")).toBe(true);
    expect(isOpen("changes_requested")).toBe(true);
    expect(isOpen("approved")).toBe(false);
    expect(isOpen("rejected")).toBe(false);
  });

  it("says how long is left, or how late it is, only when a due date was set", () => {
    expect(dueLabel(hours(18), NOW)).toEqual({ text: "due in 18h", tone: "soon" });
    expect(dueLabel(hours(72), NOW)).toEqual({ text: "due in 3d", tone: "later" });
    expect(dueLabel(hours(-6), NOW)).toEqual({ text: "overdue by 6h", tone: "overdue" });
    expect(dueLabel(null, NOW)).toBeNull();
  });

  it("counts open, overdue, sent back and decided today from the rows", () => {
    const list = [
      { status: "pending", dueDate: hours(-2), decidedAt: null },
      { status: "pending", dueDate: null, decidedAt: null },
      { status: "changes_requested", dueDate: hours(5), decidedAt: hours(-1) },
      { status: "approved", dueDate: null, decidedAt: hours(-1) },
      { status: "rejected", dueDate: null, decidedAt: hours(-48) },
    ] as any[];
    expect(approvalCounts(list, NOW)).toEqual({ open: 3, overdue: 1, sentBack: 1, decidedToday: 1 });
  });

  it("orders the queue open first, soonest due first, then newest", () => {
    const a = (id: string, status: string, dueDate: string | null, createdAt: string) => ({ id, status, dueDate, createdAt }) as any;
    const list = [a("done", "approved", null, hours(-1)), a("late", "pending", hours(-3), hours(-50)), a("undated", "pending", null, hours(-2)), a("soon", "pending", hours(4), hours(-40))];
    expect(list.sort((x, y) => queueOrder(x, y, NOW)).map((x) => x.id)).toEqual(["late", "soon", "undated", "done"]);
  });

  it("names approving by what it does", () => {
    expect(approveLabel("launch_readiness")).toBe("Clear for launch");
    expect(approveLabel("hitl_gate")).toBe("Approve");
  });
});

describe("the page", () => {
  const page = read("client", "src", "pages", "approvals-home.tsx");

  it("shows no invented figures", () => {
    // The header comment names what was removed; check the code, not the comments.
    const code = page.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/evidenceCompleteness|% evidence|AI recommendation|computedRecommendation|\/requirements/);
    expect(page).toContain("The requester scored the risk");
  });

  it("asks for a reason before sending back or rejecting, and can open a follow-up", () => {
    expect(page).toContain('if ((pending === "changes" || pending === "reject") && !text) return setError("Add a reason before continuing.");');
    expect(page).toContain("followUpTask: { reason: text, description: followUp.trim() }");
  });

  it("offers limits only for a rollout, and only the ones the rollout applies", () => {
    expect(page).toContain('const rollout = approval.objectType === "deployment" || approval.objectType === "patch";');
    expect(page).toContain("maxCanaryPercent");
    expect(page).toContain("shadowOnly: true");
  });

  it("shows the decision bar to the routed reviewer role, as the server decides", () => {
    expect(page).toContain("approval.requiredReviewerRole ? role.id === approval.requiredReviewerRole || role.id === \"admin\" : canApprove");
  });

  it("is /approvals and /approvals/:id; the old pages stay as classic", () => {
    const app = read("client", "src", "App.tsx");
    expect(app).toContain('<Route path="/approvals" component={ApprovalsHome} />');
    expect(app).toContain('<Route path="/approvals/:id" component={ApprovalsHome} />');
    expect(app).toContain('<Route path="/approvals/classic" component={Approvals} />');
    expect(app).toContain('<Route path="/approvals/:id/classic" component={ApprovalDetail} />');
    // Specific routes come before the :id one.
    expect(app.indexOf('path="/approvals/classic"')).toBeLessThan(app.indexOf('path="/approvals/:id"'));
    expect(app.indexOf('path="/approvals/gates"')).toBeLessThan(app.indexOf('path="/approvals/:id"'));
  });

  it("reads history from a narrow endpoint, not the whole audit log", () => {
    expect(page).toContain('queryKey: ["/api/approvals", approval.id, "history"]');
    const route = read("server", "routes", "governance.ts");
    const at = route.indexOf('router.get("/api/approvals/:id/history"');
    expect(at).toBeGreaterThan(-1);
    expect(route.slice(at, at + 1200)).toContain("inArray(auditEvents.objectId, ids)");
    expect(route.slice(at, at + 1200)).toContain(".limit(30)");
  });
});

describe("urgency in My Actions and Cowork", () => {
  it("comes from the due date, and there's no risk percentage", () => {
    const src = read("server", "my-actions-build.ts");
    expect(src).toContain('hoursLeft === null ? "this_week" : hoursLeft <= 24 ? "urgent" : hoursLeft <= 72 ? "today" : "this_week"');
    expect(src).not.toContain("High risk (");
  });
});
