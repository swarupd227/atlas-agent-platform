import { describe, it, expect, vi } from "vitest";

/**
 * server/routes/helpers.ts's buildAgentSystemPrompt: every one of its 20+
 * callers just passes the returned string straight through as an LLM
 * `system` message, so the only real regression surface is (a) each
 * conditional section still appears/disappears correctly, (b) every section
 * is now wrapped in a matching XML tag pair with no stray/unclosed tags,
 * and (c) the structured-output fenced-code-block instructions -- actively
 * parsed client-side (agent-playground.tsx) to render rich UI cards -- are
 * preserved byte-for-byte, just wrapped, not reworded.
 *
 * helpers.ts also exports functions that pull in storage/claude/llm-provider
 * at module load; buildAgentSystemPrompt itself never calls any of them, but
 * the mocks below keep the import cheap and side-effect-free either way.
 */

vi.mock("../server/storage", () => ({ storage: {} }));
vi.mock("../server/claude", () => ({ callClaude: vi.fn(), stripJsonFences: vi.fn() }));
vi.mock("../server/llm-provider", () => ({ completeWithFallback: vi.fn() }));

const { buildAgentSystemPrompt } = await import("../server/routes/helpers");

const baseAgent = {
  name: "Test Agent",
  description: "Does the thing.",
};

// Every opening tag in `text` has exactly one matching closing tag, in
// proper (non-overlapping, non-interleaved) nesting order.
function assertBalancedTags(text: string, tags: string[]) {
  for (const tag of tags) {
    const openRe = new RegExp(`<${tag}>`, "g");
    const closeRe = new RegExp(`</${tag}>`, "g");
    const opens = text.match(openRe)?.length ?? 0;
    const closes = text.match(closeRe)?.length ?? 0;
    expect(opens, `<${tag}> open count`).toBe(closes);
    if (opens > 0) {
      expect(text.indexOf(`<${tag}>`), `<${tag}> appears before its close`).toBeLessThan(text.lastIndexOf(`</${tag}>`));
    }
  }
}

describe("buildAgentSystemPrompt: section tagging", () => {
  it("always wraps role and output_format, even for a minimal agent", () => {
    const prompt = buildAgentSystemPrompt(baseAgent);
    assertBalancedTags(prompt, ["role", "output_format"]);
    expect(prompt).toContain(`<role>`);
    expect(prompt).toContain(`You are "Test Agent"`);
    expect(prompt).toContain(`Your purpose: Does the thing.`);
    expect(prompt).toContain(`</role>`);
  });

  it("omits optional-section tags entirely when their data is absent", () => {
    const prompt = buildAgentSystemPrompt(baseAgent);
    for (const tag of ["operational_parameters", "compliance_framework", "policies", "domain_ontology", "tools", "workflow_steps"]) {
      expect(prompt).not.toContain(`<${tag}>`);
      expect(prompt).not.toContain(`</${tag}>`);
    }
    // behavioral_guidelines has no gating condition -- always present.
    expect(prompt).toContain(`<behavioral_guidelines>`);
  });

  it("wraps operational_parameters only when riskTier is set, with the right autonomy rule", () => {
    const prompt = buildAgentSystemPrompt({ ...baseAgent, riskTier: "HIGH", autonomyMode: "manual" });
    assertBalancedTags(prompt, ["operational_parameters"]);
    const section = prompt.slice(prompt.indexOf("<operational_parameters>"), prompt.indexOf("</operational_parameters>"));
    expect(section).toContain("Risk Tier: HIGH");
    expect(section).toContain("CANNOT take any action without explicit human approval");
  });

  it("wraps compliance_framework with a known regulation's real description, and cites it by name", () => {
    const prompt = buildAgentSystemPrompt({ ...baseAgent, complianceTags: ["ECOA"] });
    assertBalancedTags(prompt, ["compliance_framework"]);
    const section = prompt.slice(prompt.indexOf("<compliance_framework>"), prompt.indexOf("</compliance_framework>"));
    expect(section).toContain("Equal Credit Opportunity Act");
    expect(section).toContain("NEVER consider race");
  });

  it("falls back to a generic compliance line for an unrecognized tag", () => {
    const prompt = buildAgentSystemPrompt({ ...baseAgent, complianceTags: ["MADE-UP-REG"] });
    const section = prompt.slice(prompt.indexOf("<compliance_framework>"), prompt.indexOf("</compliance_framework>"));
    expect(section).toContain("MADE-UP-REG");
    expect(section).toContain("You must comply with this regulation");
  });

  it("wraps policies, correctly distinguishing HARD BLOCK from SOFT WARN", () => {
    const prompt = buildAgentSystemPrompt({
      ...baseAgent,
      policyBindings: [
        { name: "No Large Wires", enforcement: "hard", description: "Block wires over $10k unattended." },
        { name: "Log Unusual Activity", enforcement: "soft", description: "Flag but don't block." },
      ],
    });
    assertBalancedTags(prompt, ["policies"]);
    const section = prompt.slice(prompt.indexOf("<policies>"), prompt.indexOf("</policies>"));
    expect(section).toContain("[HARD BLOCK] No Large Wires");
    expect(section).toContain("[SOFT WARN] Log Unusual Activity");
  });

  it("wraps domain_ontology for both array and object tag shapes", () => {
    const arrayPrompt = buildAgentSystemPrompt({ ...baseAgent, ontologyTags: ["wire transfer", "chargeback"] });
    assertBalancedTags(arrayPrompt, ["domain_ontology"]);
    expect(arrayPrompt).toContain("- wire transfer");

    const objectPrompt = buildAgentSystemPrompt({ ...baseAgent, ontologyTags: { domain: "finance", concepts: ["a", "b"] } });
    assertBalancedTags(objectPrompt, ["domain_ontology"]);
    expect(objectPrompt).toContain("- domain: finance");
    expect(objectPrompt).toContain("- concepts: a, b");
  });

  it("wraps tools and workflow_steps when present", () => {
    const prompt = buildAgentSystemPrompt({
      ...baseAgent,
      toolsConfig: [{ name: "sql_execute_query", description: "Run SQL." }],
      blueprintJson: { nodes: [{ label: "Fetch data", type: "action" }, { label: "Summarize", type: "action" }] },
    });
    assertBalancedTags(prompt, ["tools", "workflow_steps"]);
    expect(prompt).toContain("- sql_execute_query: Run SQL.");
    expect(prompt).toContain("1. Fetch data (action)");
    expect(prompt).toContain("2. Summarize (action)");
  });

  it("preserves the structured-output fenced code blocks byte-for-byte inside <output_format>", () => {
    const prompt = buildAgentSystemPrompt(baseAgent);
    const section = prompt.slice(prompt.indexOf("<output_format>"), prompt.indexOf("</output_format>") + "</output_format>".length);
    expect(section).toContain("```risk_assessment");
    expect(section).toContain("```decision");
    expect(section).toContain("```approval_required");
    expect(section).toContain('"outcome": "approved" | "rejected" | "review_required" | "escalated"');
    expect(section.trim().startsWith("<output_format>")).toBe(true);
    expect(section.trim().endsWith("</output_format>")).toBe(true);
  });

  it("every section tag opens and closes exactly once even with every optional section present", () => {
    const prompt = buildAgentSystemPrompt({
      name: "Full Agent",
      description: "Everything at once.",
      riskTier: "CRITICAL",
      autonomyMode: "supervised",
      complianceTags: ["GDPR", "HIPAA"],
      policyBindings: [{ name: "P1", enforcement: "hard", description: "d1" }],
      ontologyTags: ["concept-a"],
      toolsConfig: [{ name: "t1", description: "d" }],
      blueprintJson: { nodes: [{ label: "Step 1", type: "action" }] },
    });
    assertBalancedTags(prompt, [
      "role", "operational_parameters", "compliance_framework", "policies",
      "domain_ontology", "tools", "workflow_steps", "behavioral_guidelines", "output_format",
    ]);
  });

  it("the generic-mode prompt is unaffected (no XML tags, unchanged shape)", () => {
    const prompt = buildAgentSystemPrompt(baseAgent, { generic: true });
    expect(prompt).not.toContain("<role>");
    expect(prompt).toContain("You are a helpful AI assistant.");
    expect(prompt).toContain("```risk_assessment");
  });
});
