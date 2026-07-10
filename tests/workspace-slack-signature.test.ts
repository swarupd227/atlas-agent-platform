/**
 * Slack inbound signature verification — verifySlackSignature must reject
 * spoofed/missing/replayed requests once SLACK_SIGNING_SECRET is configured,
 * and must accept a request signed exactly the way Slack signs it
 * (https://api.slack.com/authentication/verifying-requests-from-slack).
 * Without a signing secret it's a deliberate no-op (dev/test posture,
 * documented in workspace-slack.ts) — proven here too so that behavior
 * doesn't silently regress into "always blocks" or "always allows".
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "crypto";
import { verifySlackSignature } from "../server/routes/workspace-slack";

const SECRET = "test-signing-secret";

function sign(timestamp: string, rawBody: string): string {
  return "v0=" + createHmac("sha256", SECRET).update(`v0:${timestamp}:${rawBody}`).digest("hex");
}

function mockReqRes(opts: { signature?: string; timestamp?: string; rawBody?: string }) {
  const req: any = {
    headers: {
      ...(opts.signature !== undefined ? { "x-slack-signature": opts.signature } : {}),
      ...(opts.timestamp !== undefined ? { "x-slack-request-timestamp": opts.timestamp } : {}),
    },
    rawBody: opts.rawBody !== undefined ? Buffer.from(opts.rawBody, "utf8") : undefined,
  };
  const res: any = { statusCode: 200, body: undefined, status(c: number) { this.statusCode = c; return this; }, json(b: any) { this.body = b; return this; } };
  const next = vi.fn();
  return { req, res, next };
}

describe("verifySlackSignature", () => {
  const originalSecret = process.env.SLACK_SIGNING_SECRET;

  afterEach(() => {
    process.env.SLACK_SIGNING_SECRET = originalSecret;
  });

  it("no-ops (calls next) when SLACK_SIGNING_SECRET is not configured", () => {
    delete process.env.SLACK_SIGNING_SECRET;
    const { req, res, next } = mockReqRes({}); // no headers, no rawBody at all
    verifySlackSignature(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
  });

  describe("with SLACK_SIGNING_SECRET configured", () => {
    beforeEach(() => {
      process.env.SLACK_SIGNING_SECRET = SECRET;
    });

    it("accepts a correctly-signed, fresh request", () => {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const rawBody = JSON.stringify({ type: "event_callback" });
      const { req, res, next } = mockReqRes({ signature: sign(timestamp, rawBody), timestamp, rawBody });
      verifySlackSignature(req, res, next);
      expect(next).toHaveBeenCalledOnce();
    });

    it("rejects a request with a forged signature", () => {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const rawBody = JSON.stringify({ type: "event_callback" });
      const { req, res, next } = mockReqRes({ signature: "v0=deadbeef00000000000000000000000000000000000000000000000000", timestamp, rawBody });
      verifySlackSignature(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
    });

    it("rejects a request signed for different body content (tampered payload)", () => {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signedBody = JSON.stringify({ type: "event_callback", text: "original" });
      const tamperedBody = JSON.stringify({ type: "event_callback", text: "tampered" });
      const { req, res, next } = mockReqRes({ signature: sign(timestamp, signedBody), timestamp, rawBody: tamperedBody });
      verifySlackSignature(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
    });

    it("rejects a stale (replayed) request outside the timestamp tolerance", () => {
      const staleTimestamp = String(Math.floor(Date.now() / 1000) - 60 * 30); // 30 min old
      const rawBody = JSON.stringify({ type: "event_callback" });
      const { req, res, next } = mockReqRes({ signature: sign(staleTimestamp, rawBody), timestamp: staleTimestamp, rawBody });
      verifySlackSignature(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
    });

    it("rejects a request missing the signature header", () => {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const { req, res, next } = mockReqRes({ timestamp, rawBody: "{}" });
      verifySlackSignature(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
    });

    it("rejects a request missing the raw body (parser didn't capture it)", () => {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const { req, res, next } = mockReqRes({ signature: "v0=whatever", timestamp });
      verifySlackSignature(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
    });
  });
});
