/**
 * One registry. Agents, Teams and Remote Agents were three menu entries over
 * one page: both list pages render "Agent Registry" from the same data, and
 * Teams is that list filtered to agentType === "team". My Workers was the
 * same list again, read-only, with no actions. Blueprints was a second index
 * over the same objects; its node editor stays, reached from the agent.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");
const sidebar = read("client", "src", "components", "app-sidebar.tsx");
const app = read("client", "src", "App.tsx");

describe("the menu", () => {
  it("has one entry for agents, covering its own Teams and Remote views", () => {
    expect(sidebar).not.toContain('{ title: "Teams", url: "/agents/teams"');
    expect(sidebar).toContain('{ title: "Agents", url: "/agents"');
    expect(sidebar).toContain('if (url === "/agents") return location === "/agents" || location.startsWith("/agents/");');
  });

  it("no longer matches a team route that never existed", () => {
    expect(sidebar).not.toContain("/agents/teams/");
  });

  it("drops Blueprints as an entry but keeps the node editor reachable", () => {
    expect(sidebar).not.toContain('{ title: "Blueprints", url: "/blueprints"');
    expect(app).toContain('<Route path="/blueprints/:id" component={BlueprintDetail} />');
  });
});

describe("My Workers", () => {
  it("is gone, and its address opens the registry", () => {
    expect(existsSync(join(__dirname, "..", "client", "src", "pages", "my-workers.tsx"))).toBe(false);
    expect(app).toContain('<Route path="/my-workers">{() => <Redirect to="/agents" replace />}</Route>');
    expect(app).not.toContain("pages/my-workers");
  });

  it("the business menu points at the registry instead", () => {
    expect(sidebar).toContain('{ title: "My Agents", url: "/agents"');
    expect(sidebar).not.toContain('url: "/my-workers"');
  });
});
