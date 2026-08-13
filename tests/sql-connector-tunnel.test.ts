/**
 * resolveConnectionTarget (server/integrations/sql/tunnel.ts) -- the
 * dialect-agnostic "should this client talk direct or through a tunnel"
 * branch shared by all three SQL connector clients.
 *
 * The ssh_tunnel *happy path* (an actual SSH connection + local port
 * forward) isn't mocked here -- ssh2's Client is deep enough that a mock
 * would mostly test the mock, not the code. That path is covered by a real
 * Docker-based SSH bastion in a live-verification pass instead. What's unit
 * tested here is the branch logic and the pre-flight validation errors,
 * which are pure and fast.
 */
import { describe, it, expect } from "vitest";
import { resolveConnectionTarget } from "../server/integrations/sql/tunnel";
import { requestTunnel, isAgentConnected } from "../server/relay/relay-server";

describe("resolveConnectionTarget — direct mode", () => {
  it("passes host/port straight through when connectionMode is unset", async () => {
    const target = await resolveConnectionTarget({ host: "db.example.com", port: "6543" }, 5432);
    expect(target).toEqual({ host: "db.example.com", port: 6543, tunnel: null });
  });

  it("passes host/port straight through when connectionMode is explicitly 'direct'", async () => {
    const target = await resolveConnectionTarget({ host: "db.example.com", connectionMode: "direct" }, 5432);
    expect(target).toEqual({ host: "db.example.com", port: 5432, tunnel: null });
  });

  it("falls back to the dialect's default port when none is given", async () => {
    const target = await resolveConnectionTarget({ host: "db.example.com" }, 3306);
    expect(target.port).toBe(3306);
  });
});

describe("resolveConnectionTarget — ssh_tunnel mode validation", () => {
  it("rejects without opening a connection when sshHost is missing", async () => {
    await expect(resolveConnectionTarget(
      { host: "10.0.1.5", connectionMode: "ssh_tunnel", sshUsername: "deploy", sshPassword: "x" },
      5432
    )).rejects.toThrow(/ssh host/i);
  });

  it("rejects without opening a connection when sshUsername is missing", async () => {
    await expect(resolveConnectionTarget(
      { host: "10.0.1.5", connectionMode: "ssh_tunnel", sshHost: "bastion.example.com", sshPassword: "x" },
      5432
    )).rejects.toThrow(/ssh username/i);
  });
});

describe("resolveConnectionTarget — relay_agent mode validation", () => {
  it("rejects when relayAgentId is missing", async () => {
    await expect(resolveConnectionTarget(
      { host: "10.0.1.5", connectionMode: "relay_agent" },
      5432
    )).rejects.toThrow(/relay agent/i);
  });

  it("rejects when the named relay agent isn't connected", async () => {
    await expect(resolveConnectionTarget(
      { host: "10.0.1.5", connectionMode: "relay_agent", relayAgentId: "agent-not-registered" },
      5432
    )).rejects.toThrow(/not connected/i);
  });
});

describe("requestTunnel — no DB involved, pure in-memory registry lookup", () => {
  it("isAgentConnected is false for an agent that never connected", () => {
    expect(isAgentConnected("some-random-agent-id")).toBe(false);
  });

  it("fails fast (no local listener left behind) for an unconnected agent", async () => {
    await expect(requestTunnel("some-random-agent-id", "10.0.1.5", 5432)).rejects.toThrow(/not connected/i);
  });
});
