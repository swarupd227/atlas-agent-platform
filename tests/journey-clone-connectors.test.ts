/**
 * Cloning a curated journey has to produce a working copy, not a convincing one.
 *
 * Live 2026-09-25: a clone of the CI Ownership journey came back with its
 * orchestrator, five workers, a blueprint and the whole node/edge graph -- and
 * every step then made zero tool calls and emitted the JSON of the call it wanted
 * as its answer. Nothing errored, because nothing had failed: the copied agents
 * had no connector links, so they had nothing to call. The run cost real money
 * and analysed nothing.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const source = readFileSync(join(__dirname, "..", "server", "routes", "journeys.ts"), "utf8").replace(/\r\n/g, "\n");
const clone = source.slice(source.indexOf('router.post("/api/journeys/:id/clone"'));

describe("a cloned journey's connectors", () => {
  it("copies the links, for the orchestrator and for every worker", () => {
    expect(clone).toContain("copyConnectorLinks(source.id, newOrchestrator.id)");
    expect(clone).toContain("copyConnectorLinks(w.id, newWorker.id)");
  });

  it("reads them from the source agent rather than guessing a server", () => {
    expect(clone).toContain("storage.getAgentMcpServers(fromAgentId)");
    expect(clone).toContain("storage.createAgentMcpServer({ agentId: toAgentId, serverId: link.serverId");
  });

  it("records that the clone made the link, so the audit is not silent about it", () => {
    expect(clone).toMatch(/assignedBy: "journey clone"/);
  });

  it("copies them for each worker before the team membership is written", () => {
    // Order matters only for readability, but a worker created and never linked
    // is exactly the bug: assert both happen in the same loop body.
    const loop = clone.slice(clone.indexOf("for (const w of sourceWorkers)"));
    const linkAt = loop.indexOf("copyConnectorLinks(w.id");
    const memberAt = loop.indexOf("createAgentTeamMember");
    expect(linkAt).toBeGreaterThan(-1);
    expect(memberAt).toBeGreaterThan(-1);
    expect(linkAt).toBeLessThan(memberAt);
  });

  it("still leaves the library fields off the copy", () => {
    // A clone is a working copy, not a second library entry -- unchanged by this.
    expect(clone).toContain("Deliberately NOT copied: isCuratedJourney");
  });
});
