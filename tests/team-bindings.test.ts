/**
 * Connector binding checks for a proposed team (server/team-bindings.ts).
 */
import { describe, it, expect } from "vitest";
import { assessProposalBindings, resolveBindingServer, resolveDeclaredToolName } from "../server/team-bindings";
import { BUILTIN_TOOL_NAMES } from "../server/builtin-tool-names";

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

  it("does not let one shared generic word decide between two real connectors", () => {
    // Live 2026-09-24: both of these mis-resolved, silently. The clause
    // reviewer was bound to a connector without verify_clause_taxonomy and
    // refused to certify the endorsement; the policy binder was pointed at the
    // rating engine. Nothing was reported unresolved, because from the
    // builder's side each one had matched something.
    const insurance = [
      { id: "c-generic", name: "Compliance Connector MCP Server" },
      { id: "c-surplus", name: "Surplus Lines Compliance & Bordereau Queue" },
      { id: "c-rating", name: "Insurity Rating & Predict Engine" },
      { id: "c-policy", name: "Insurity Policy System of Record" },
    ];
    expect(resolveBindingServer("Surplus Lines Compliance & Bordereau Queue", insurance)?.id).toBe("c-surplus");
    expect(resolveBindingServer("Surplus Lines Compliance", insurance)?.id).toBe("c-surplus");
    expect(resolveBindingServer("Insurity Policy System of Record", insurance)?.id).toBe("c-policy");
    expect(resolveBindingServer("Insurity Policy SoR", insurance)?.id).toBe("c-policy");
    expect(resolveBindingServer("Insurity Rating", insurance)?.id).toBe("c-rating");
    // "Compliance" alone is the generic one's whole distinctive name, so it
    // still wins on containment rather than being dragged to the longer name.
    expect(resolveBindingServer("Compliance Connector MCP Server", insurance)?.id).toBe("c-generic");
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

/**
 * resolveDeclaredToolName. Every case below is a real declaration read off a
 * live agent on 2026-10-18, not an invented example -- the point of the
 * function is that the four kinds are indistinguishable by count and only the
 * first three are repairable.
 */
describe("resolveDeclaredToolName", () => {
  // The dispatchable set this agent would really have: one connector's tools.
  const dispatchable = ["execute_query", "search", "get_payment_batch", "check_posting_period", "generate_pptx", "snow-search-incidents"];

  it("passes a name that is already exactly right, and says it was not repaired", () => {
    expect(resolveDeclaredToolName("execute_query", dispatchable)).toEqual({ name: "execute_query", repaired: null });
  });

  it("repairs a trailing space -- a real built-in was reported as invented over one character", () => {
    expect(resolveDeclaredToolName("generate_pptx ", dispatchable)).toEqual({ name: "generate_pptx", repaired: "normalised" });
  });

  it("repairs a name with its connector glued on, either way round", () => {
    // Both separators were in the live data.
    expect(resolveDeclaredToolName("advantive one \u2014 support triage engine: execute_query", dispatchable))
      .toEqual({ name: "execute_query", repaired: "composite" });
    expect(resolveDeclaredToolName("get_payment_batch - dealer operations (vitaledge)", dispatchable))
      .toEqual({ name: "get_payment_batch", repaired: "composite" });
  });

  it("does NOT split an ordinary hyphenated tool name apart", () => {
    // The hyphen rule requires whitespace around it, or this name is destroyed.
    expect(resolveDeclaredToolName("snow-search-incidents", dispatchable))
      .toEqual({ name: "snow-search-incidents", repaired: null });
  });

  it("refuses prose, which can never be dispatched whatever it means", () => {
    expect(resolveDeclaredToolName("excel workbook generator", dispatchable)).toBeNull();
    expect(resolveDeclaredToolName("xlsx code-execution skill", dispatchable)).toBeNull();
  });

  it("refuses an invented name", () => {
    expect(resolveDeclaredToolName("policy_coverage_checker", dispatchable)).toBeNull();
  });

  it("refuses rather than guesses when two parts of a composite both resolve", () => {
    // An unresolvable name is reported and a person can fix it; a name bound to
    // the wrong tool is silent.
    expect(resolveDeclaredToolName("search: execute_query", dispatchable)).toBeNull();
  });

  it("resolves against what it is given, so an unbound connector's tool does not resolve", () => {
    // The same name, with and without that connector in the set: this is what
    // separates "declares a real tool it is not bound to" from "invented".
    expect(resolveDeclaredToolName("get_open_ar", dispatchable)).toBeNull();
    expect(resolveDeclaredToolName("get_open_ar", [...dispatchable, "get_open_ar"]))
      .toEqual({ name: "get_open_ar", repaired: null });
  });

  it("returns the dispatchable set's own casing, not the declaration's", () => {
    expect(resolveDeclaredToolName("Execute_Query", dispatchable)).toEqual({ name: "execute_query", repaired: "normalised" });
  });

  it("ignores an empty or whitespace-only declaration", () => {
    expect(resolveDeclaredToolName("   ", dispatchable)).toBeNull();
  });
});

describe("BUILTIN_TOOL_NAMES", () => {
  it("includes web_search, the one a hand-assembled list missed", () => {
    // Omitting it reported two agents as declaring an invented tool. The list is
    // built from the modules' own constants so this cannot drift again.
    expect(BUILTIN_TOOL_NAMES).toContain("web_search");
  });

  it("names every in-process tool server's tools and nothing twice", () => {
    expect(new Set(BUILTIN_TOOL_NAMES).size).toBe(BUILTIN_TOOL_NAMES.length);
    for (const name of ["memory", "search_attachment", "read_attachment_section", "loss_forecast",
      "generate_pptx", "generate_pdf", "fill_document_template", "inspect_document", "read_document",
      "read_skill", "propose_ontology_concept", "propose_skill", "web_search"]) {
      expect(BUILTIN_TOOL_NAMES).toContain(name);
    }
  });

  it("does not contain search_knowledge_base, which looks like a built-in and is not", () => {
    // 7 agents declare it. It exists only in the agent wizard's demo palette and
    // in seeded run_traces; knowledge retrieval is a node type, never a tool.
    expect(BUILTIN_TOOL_NAMES).not.toContain("search_knowledge_base");
  });
});
