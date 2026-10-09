/**
 * A name with stray whitespace in it.
 *
 * Measured on Azure 2026-10-09: a live agent is stored as
 * "Hilti Campaign Audience Agent " (trailing space), so the Cowork home's row
 * asked "What happened in the Hilti Campaign Audience Agent  run from 12 min
 * ago?" with a double space. The name is wrong in the database, so this is
 * fixed at both ends: the write boundary, so new rows are clean, and the read,
 * because the ~1,000 rows already written are not getting edited by hand.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { cleanName } from "../shared/display-name";
import { insertAgentSchema, updateAgentSchema } from "../shared/schema";
import { buildActivity, agentRunPrompt, type AgentRunRow } from "../server/astra/home-activity";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8");
const NOW = new Date("2026-10-09T09:00:00Z").getTime();

describe("cleanName", () => {
  it("takes the whitespace off both ends", () => {
    expect(cleanName("Hilti Campaign Audience Agent ")).toBe("Hilti Campaign Audience Agent");
    expect(cleanName("  Policy Assistant")).toBe("Policy Assistant");
  });

  it("collapses a run of whitespace inside the name, including tabs and newlines", () => {
    // A pasted name carries whatever the clipboard had in it.
    expect(cleanName("Claims  Intake   Team")).toBe("Claims Intake Team");
    expect(cleanName("Claims\tIntake\nTeam")).toBe("Claims Intake Team");
  });

  it("leaves a clean name exactly as it is", () => {
    expect(cleanName("E&S Property Binding Orchestrator")).toBe("E&S Property Binding Orchestrator");
  });

  it("normalises, and never rejects", () => {
    // Whether a name is required is the form's decision, not this helper's, so
    // a whitespace-only name comes back empty rather than throwing.
    expect(cleanName("   ")).toBe("");
    expect(cleanName("")).toBe("");
  });
});

describe("the write boundary", () => {
  it("cleans the name every create and PATCH route parses", () => {
    const created = insertAgentSchema.parse({ name: "Hilti Campaign Audience Agent ", status: "active" });
    expect(created.name).toBe("Hilti Campaign Audience Agent");
    // updateAgentSchema is derived from insertAgentSchema, so a rename through
    // PATCH /api/agents/:id is covered by the same transform.
    expect(updateAgentSchema.parse({ name: "  Renamed  Agent " }).name).toBe("Renamed Agent");
  });

  it("leaves a patch that is not a rename alone", () => {
    const patch = updateAgentSchema.parse({ description: "unchanged" });
    expect(patch.name).toBeUndefined();
    expect("name" in patch).toBe(false);
  });

  it("cleans it again where agents are written without a route body at all", () => {
    // Team build, agent proposals, the wizard and scripts call storage
    // directly, so the transform above never sees them. Source check: these
    // are the exact calls in storage.createAgent and storage.updateAgent.
    const storage = read("server", "storage.ts");
    expect(storage).toContain('import { cleanName } from "@shared/display-name";');
    expect(storage).toContain("values({ ...agent, name: cleanName(agent.name), industryId, organizationId: orgId })");
    expect(storage).toContain('const named = typeof data.name === "string" ? { name: cleanName(data.name) } : {};');
    expect(storage).toContain("set({ ...data, ...named, updatedAt: new Date() })");
  });
});

describe("the read, for rows already written", () => {
  const agentRun = (over: Partial<AgentRunRow>): AgentRunRow => ({
    id: "w1",
    agentId: "a1",
    agentName: "Hilti Campaign Audience Agent ",
    status: "completed",
    requestText: "Who should we target?",
    outputSummary: "Three segments.",
    createdAt: new Date(NOW - 12 * 60_000).toISOString(),
    updatedAt: new Date(NOW - 11 * 60_000).toISOString(),
    ...over,
  });

  it("shows the title and asks the question with single spaces", () => {
    const row = buildActivity({ teamRuns: [], agentRuns: [agentRun({})], spend: null, now: NOW }).recent[0];
    expect(row.title).toBe("Hilti Campaign Audience Agent");
    expect(row.ask).toBe("What happened in the Hilti Campaign Audience Agent run from 11 min ago?");
    expect(row.ask).not.toMatch(/ {2}/);
  });

  it("still says so when the name is gone, rather than printing a blank row", () => {
    // cleanName turns a whitespace-only name into "", which must not read as a
    // nameless row -- it falls through to the same wording as a missing name.
    expect(buildActivity({ teamRuns: [], agentRuns: [agentRun({ agentName: "   " })], spend: null, now: NOW }).recent[0].title)
      .toBe("An agent that no longer exists");
  });

  it("builds the question from the cleaned name, not the stored one", () => {
    expect(agentRunPrompt(cleanName("Hilti Campaign Audience Agent "), null, NOW))
      .toBe("What happened in the Hilti Campaign Audience Agent run?");
  });
});
