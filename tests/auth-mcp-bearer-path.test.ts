/**
 * The exact path pattern authMiddleware (server/auth.ts) uses to decide
 * whether a request is allowed to authenticate via Bearer API key at all
 * (as opposed to only a session cookie) for the real-MCP-protocol connector
 * routes. Getting this wrong in either direction is a real security bug:
 * too narrow and legitimate exported-agent traffic 401s; too broad and an
 * unrelated route accepts a bearer key it was never meant to.
 */
import { describe, it, expect } from "vitest";
import { MCP_BEARER_PATH_RE } from "../server/auth";

describe("MCP_BEARER_PATH_RE", () => {
  it("matches a connector's real MCP endpoint", () => {
    expect(MCP_BEARER_PATH_RE.test("/integrations/postgres/mcp")).toBe(true);
    expect(MCP_BEARER_PATH_RE.test("/integrations/mysql/mcp")).toBe(true);
    expect(MCP_BEARER_PATH_RE.test("/integrations/salesforce/mcp")).toBe(true);
  });

  it("does not match that connector's other REST routes", () => {
    expect(MCP_BEARER_PATH_RE.test("/integrations/postgres/tools")).toBe(false);
    expect(MCP_BEARER_PATH_RE.test("/integrations/postgres/tools/sql_execute_query")).toBe(false);
    expect(MCP_BEARER_PATH_RE.test("/integrations/postgres/health")).toBe(false);
    expect(MCP_BEARER_PATH_RE.test("/integrations/postgres/connection-test")).toBe(false);
  });

  it("does not match an unrelated /mcp-shaped path", () => {
    expect(MCP_BEARER_PATH_RE.test("/mcp")).toBe(false);
    expect(MCP_BEARER_PATH_RE.test("/mcp-servers/mcp")).toBe(false);
    expect(MCP_BEARER_PATH_RE.test("/agents/some-agent/mcp")).toBe(false);
  });

  it("does not match with extra path segments (no partial-prefix bypass)", () => {
    expect(MCP_BEARER_PATH_RE.test("/integrations/postgres/mcp/extra")).toBe(false);
    expect(MCP_BEARER_PATH_RE.test("/integrations/a/b/mcp")).toBe(false);
  });

  it("requires a non-empty integration segment", () => {
    expect(MCP_BEARER_PATH_RE.test("/integrations//mcp")).toBe(false);
  });
});
