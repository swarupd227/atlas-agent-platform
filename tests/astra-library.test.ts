/**
 * server/astra/library.ts: which sections a role sees, query matching, and
 * true totals when a section is capped.
 */
import { describe, it, expect } from "vitest";
import { LIBRARY_ELSEWHERE, buildLibrarySection, normalizeQuery, visibleLibrarySections } from "../server/astra/library";
import { hasPermission, type RoleId } from "../server/permissions";

const sectionsFor = (role: RoleId) => visibleLibrarySections((p) => hasPermission(role, p));

describe("visibleLibrarySections", () => {
  it("shows every section to an admin, in a stable order", () => {
    expect(sectionsFor("admin")).toEqual(["conversations", "agents", "teams", "outcomes", "connectors", "policies", "processFlows"]);
  });

  it("follows the role: sections without access are absent", () => {
    const only = visibleLibrarySections(() => false);
    expect(only).toEqual(["conversations", "agents", "outcomes"]);
    const policyAuthor = visibleLibrarySections((p) => p === "create_modify_policies");
    expect(policyAuthor).toContain("policies");
    expect(policyAuthor).not.toContain("connectors");
  });
});

describe("buildLibrarySection", () => {
  const items = Array.from({ length: 70 }, (_, i) => ({
    id: `a${i}`, name: i % 2 ? `Invoice agent ${i}` : `Credit agent ${i}`, detail: i === 4 ? "reconciles invoices" : null, status: null, ask: null, href: `/agents/a${i}`,
  }));

  it("caps at 50 but reports the true total", () => {
    const s = buildLibrarySection("agents", items, null);
    expect(s).toMatchObject({ id: "agents", label: "Agents", total: 70 });
    expect(s.items).toHaveLength(50);
  });

  it("matches the query in the name or the detail, case-insensitively", () => {
    const s = buildLibrarySection("agents", items, normalizeQuery("  INVOICE "));
    expect(s.total).toBe(36);
    expect(s.items.map((i) => i.id)).toContain("a4");
  });

  it("says where the unscoped catalogues are", () => {
    expect(LIBRARY_ELSEWHERE.join(" ")).toMatch(/templates.*eval.*connector catalogue/i);
    expect(normalizeQuery(["x"])).toBeNull();
  });
});
