/**
 * A team run's approval gate files its approval under the organization that
 * owns the agent (waitForApproval in server/agent-runtime.ts).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const created = vi.hoisted(() => [] as any[]);
const agents = vi.hoisted(() => new Map<string, any>());

vi.mock("../server/storage", () => ({
  storage: {
    getApproval: vi.fn(async () => undefined),
    getAgent: vi.fn(async (id: string) => agents.get(id)),
    createApproval: vi.fn(async (a: any) => {
      const row = { id: `apr-${created.length + 1}`, ...a };
      created.push(row);
      return row;
    }),
    updateApproval: vi.fn(async () => ({})),
  },
}));

import { waitForApproval } from "../server/agent-runtime";

beforeEach(() => {
  created.length = 0;
  agents.clear();
});

describe("gate approvals", () => {
  it("are filed under the organization that owns the agent", async () => {
    agents.set("team-1", { id: "team-1", organizationId: "org-a" });
    const result = await waitForApproval("team-1", "Manager Approval", "approval", "context", 0);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ organizationId: "org-a", type: "hitl_gate", objectType: "pipeline_gate" });
    expect(result.approved).toBe(false);
  });

  it("still file (under storage's default) when the agent can't be found", async () => {
    const result = await waitForApproval("missing", "Manager Approval", "approval", "context", 0);
    expect(created).toHaveLength(1);
    expect(created[0]).not.toHaveProperty("organizationId");
    expect(result.reason).toContain("timed out");
  });
});
