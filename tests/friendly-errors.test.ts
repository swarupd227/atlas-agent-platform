import { describe, it, expect } from "vitest";
import { explainConnectionError } from "../server/integrations/sql/friendly-errors";

describe("explainConnectionError", () => {
  it("returns undefined for an unset message", () => {
    expect(explainConnectionError(undefined)).toBeUndefined();
  });

  it("returns undefined for an unrecognized message rather than guessing", () => {
    expect(explainConnectionError("some totally novel driver error xyz123")).toBeUndefined();
  });

  it("explains SSH forwarding administratively prohibited", () => {
    const e = explainConnectionError("connect failed: administratively prohibited");
    expect(e).toMatch(/AllowTcpForwarding/);
  });

  it("explains a relay agent that isn't connected", () => {
    const e = explainConnectionError("Relay agent 'abc-123' is not connected. Confirm the agent process is running and reachable.");
    expect(e).toMatch(/relay agent/i);
  });

  it("explains a host-key fingerprint mismatch", () => {
    const e = explainConnectionError("SSH host key fingerprint mismatch (got X, expected Y)");
    expect(e).toMatch(/rotated|man-in-the-middle/i);
  });

  it("explains ECONNREFUSED", () => {
    const e = explainConnectionError("connect ECONNREFUSED 127.0.0.1:5432");
    expect(e).toMatch(/refused/i);
  });

  it("explains a generic 'terminated unexpectedly' as likely a tunnel-layer failure", () => {
    const e = explainConnectionError("Connection terminated unexpectedly");
    expect(e).toMatch(/tunnel/i);
  });

  it("explains authentication failures", () => {
    expect(explainConnectionError("password authentication failed for user \"astra\"")).toMatch(/username\/password/i);
    expect(explainConnectionError("Access denied for user 'root'@'%'")).toMatch(/username\/password/i);
  });
});
