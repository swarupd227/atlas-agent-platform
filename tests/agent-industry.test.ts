/**
 * server/agent-industry.ts: the industry an agent runs with -- its own, then its
 * organization's, then a real deployment industry; never an invented one.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

vi.mock("../server/storage", () => ({
  storage: {
    getOrganization: vi.fn(async (id: string) =>
      id === "org-ins" ? { id, industryId: "insurance", subVertical: null } : id === "org-none" ? { id, industryId: null } : undefined,
    ),
  },
}));

describe("resolveAgentIndustry", () => {
  it("prefers the agent's own industry, then the organization's", async () => {
    const { resolveAgentIndustry } = await import("../server/agent-industry");
    expect(await resolveAgentIndustry({ industryId: "retail", organizationId: "org-ins" }, "healthcare")).toBe("retail");
    expect(await resolveAgentIndustry({ industryId: null, organizationId: "org-ins" }, "healthcare")).toBe("insurance");
  });

  it("uses a deployment's industry only when it is a real one, and otherwise says none", async () => {
    const { resolveAgentIndustry } = await import("../server/agent-industry");
    expect(await resolveAgentIndustry({ organizationId: "org-none" }, "healthcare")).toBe("healthcare");
    expect(await resolveAgentIndustry({ organizationId: "org-none" }, "technology")).toBeNull();
    expect(await resolveAgentIndustry(null)).toBeNull();
  });
});

describe("no invented industry at run time", () => {
  it("the runtime and deploy paths no longer default an agent to \"technology\"", () => {
    for (const file of ["server/routes/runtime.ts", "server/routes/improvements.ts", "server/routes/shadow-canary.ts", "server/agent-runtime.ts"]) {
      const src = readFileSync(join(__dirname, "..", file), "utf8");
      expect(src, file).not.toMatch(/industry\s*\|\|\s*(req\.body\.industry\s*\|\|\s*)?"technology"/);
      expect(src, file).not.toMatch(/\(agent as any\)\.industry\b/);
    }
  });
});
