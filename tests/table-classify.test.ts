import { describe, it, expect } from "vitest";
import { classifyTable, parseDelimited } from "../server/table-classify";

const csv = [
  "TicketID,Platform,Summary",
  'WP-1,SharePoint Online,"Guest invite, not working"',
  "WP-2,OneDrive,Sync stuck for two days",
  'WP-3,SharePoint Online,"Site has no owner\nafter the owner left"',
  "WP-4,Confluence,Macros broken after migration",
  "WP-5,SharePoint Online,Password reset for the shared mailbox",
].join("\n");

describe("parseDelimited", () => {
  it("handles quoted delimiters, doubled quotes and embedded newlines", () => {
    const rows = parseDelimited('a,b\n"x, y","he said ""hi"""\n"line1\nline2",z\n');
    expect(rows).toEqual([["a", "b"], ["x, y", 'he said "hi"'], ["line1\nline2", "z"]]);
  });
});

describe("classifyTable", () => {
  const rules = [
    { theme: "External access", column: "Summary", any_of: ["guest", "external"] },
    { theme: "Site ownership", column: "Summary", any_of: ["no owner", "owner left"] },
    { theme: "Sync", column: "Summary", any_of: ["sync"] },
  ];

  it("counts exactly, lists real ids, and reports unclassified rows", () => {
    const r = classifyTable({ text: csv, idColumn: "TicketID", rules, breakdownColumns: ["Platform"], otherTheme: "Other" });
    expect(r.totalRows).toBe(5);
    expect(r.themes.map(t => [t.theme, t.count, t.ids])).toEqual([
      ["External access", 1, ["WP-1"]], ["Site ownership", 1, ["WP-3"]], ["Sync", 1, ["WP-2"]],
    ]);
    expect(r.unmatched).toMatchObject({ theme: "Other", count: 2, ids: ["WP-4", "WP-5"] });
    expect(r.themes[0].breakdown.Platform).toEqual({ "SharePoint Online": 1 });
  });

  it("puts a row in the first matching rule only", () => {
    const r = classifyTable({ text: csv, idColumn: "TicketID", rules: [
      { theme: "First", any_of: ["sharepoint"] }, { theme: "Second", column: "Summary", any_of: ["guest"] },
    ] });
    expect(r.themes[0].count).toBe(3);
    expect(r.themes[1].count).toBe(0);
    expect(r.totalRows).toBe(5);
  });

  it("rejects an unknown column and an empty rule with a useful message", () => {
    expect(() => classifyTable({ text: csv, idColumn: "Nope", rules })).toThrow(/Columns are: TicketID, Platform, Summary/);
    expect(() => classifyTable({ text: csv, idColumn: "TicketID", rules: [{ theme: "x", any_of: [] }] })).toThrow(/at least one term/);
  });
});
