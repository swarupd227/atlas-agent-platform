/**
 * Connector binding checks for a proposed team (server/team-bindings.ts).
 */
import { describe, it, expect } from "vitest";
import { assessProposalBindings, resolveBindingServer } from "../server/team-bindings";

const connectors = [
  { id: "c-dealer", name: "Dealer Operations", connected: true },
  { id: "c-sap", name: "SAP S/4HANA", connected: false },
  { id: "c-mock", name: "Document Store", connected: null },
];
const tools = new Map<string, string[]>([
  ["c-dealer", ["get_open_ar", "post_cash_receipt"]],
  ["c-sap", ["post_journal"]],
]);

describe("resolveBindingServer", () => {
  it("matches the way team builds link connectors", () => {
    expect(resolveBindingServer("Dealer Operations", connectors)?.id).toBe("c-dealer");
    expect(resolveBindingServer("dealer", connectors)?.id).toBe("c-dealer");
    expect(resolveBindingServer("SAP ERP", connectors)?.id).toBe("c-sap");
    expect(resolveBindingServer("Oracle Fusion", connectors)).toBeUndefined();
  });

  it("prefers the connector actually named over one that merely shares a first word", () => {
    // Live: bindings on "ServiceNow CMDB (Sandbox)" resolved to the Enterprise
    // connector, which sits first and matches on "servicenow" alone. Agents
    // ended up bound to the wrong ServiceNow, and the wiring check then called
    // the correctly-bound ones unlinked.
    const two = [
      { id: "c-ent", name: "ServiceNow ITSM (Enterprise)", connected: true },
      { id: "c-box", name: "ServiceNow CMDB (Sandbox)", connected: null },
    ];
    expect(resolveBindingServer("ServiceNow CMDB (Sandbox)", two)?.id).toBe("c-box");
    expect(resolveBindingServer("servicenow cmdb (sandbox)  ", two)?.id).toBe("c-box");
    expect(resolveBindingServer("ServiceNow ITSM (Enterprise)", two)?.id).toBe("c-ent");
    // No exact name: the looser match still answers, as it always did.
    expect(resolveBindingServer("ServiceNow", two)?.id).toBe("c-ent");
  });
});

describe("assessProposalBindings", () => {
  it("reports unknown connectors, unconnected integrations, missing tools and undiscovered tools per agent", () => {
    const r = assessProposalBindings(
      [
        { name: "Gather AR", mcpToolBindings: [{ server: "Dealer Operations", tool: "get_open_ar" }, { server: "Dealer Operations", tool: "get_credit_limit" }] },
        { name: "Post to ERP", mcpToolBindings: [{ server: "SAP", tool: "post_journal" }, { server: "Oracle Fusion", tool: "post" }] },
        { name: "File Evidence", mcpToolBindings: [{ server: "Document Store", tool: "upload" }] },
        { name: "Summarize" },
      ],
      connectors,
      tools,
    );
    expect(r.agents.map((a) => [a.name, a.connectors, a.issues.map((i) => i.code)])).toEqual([
      ["Gather AR", ["Dealer Operations"], ["tool_not_on_server"]],
      ["Post to ERP", ["SAP S/4HANA"], ["server_not_connected", "server_unresolved"]],
      ["File Evidence", ["Document Store"], ["server_no_tools_discovered"]],
      ["Summarize", [], []],
    ]);
    expect(r.issues.find((i) => i.code === "tool_not_on_server")).toMatchObject({ tool: "get_credit_limit", message: expect.stringContaining("get_credit_limit") });
    expect(r.issues).toHaveLength(4);
  });
});
