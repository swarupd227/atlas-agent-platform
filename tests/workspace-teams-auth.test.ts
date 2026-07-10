/**
 * Teams (Bot Framework) inbound JWT verification — verifyTeamsAuth must
 * reject forged/wrong-audience/wrong-issuer/expired/missing tokens once
 * MICROSOFT_APP_ID is configured, and accept a token that's genuinely signed
 * by the (mocked) Bot Framework key with the right issuer/audience/expiry.
 * jwks-rsa's network fetch is mocked so this runs offline/deterministically
 * in CI, matching the pattern in tests/url-safety.test.ts (dns mock) and
 * tests/workspace-slack-signature.test.ts (HMAC, no network at all).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { generateKeyPairSync } from "crypto";
import jwt from "jsonwebtoken";

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
const KID = "test-key-1";

vi.mock("jwks-rsa", () => ({
  default: () => ({
    getSigningKey: (kid: string, cb: (err: any, key: any) => void) => {
      if (kid !== KID) return cb(new Error("unknown kid"), null);
      cb(null, { getPublicKey: () => publicKey });
    },
  }),
}));

const APP_ID = "test-app-id";
const ISSUER = "https://api.botframework.com";

function signToken(overrides: Partial<{ aud: string; iss: string; expiresInSec: number; kid: string | undefined }> = {}) {
  const { aud = APP_ID, iss = ISSUER, expiresInSec = 3600, kid = KID } = overrides;
  return jwt.sign({}, privateKey, {
    algorithm: "RS256",
    audience: aud,
    issuer: iss,
    expiresIn: expiresInSec,
    keyid: kid,
  });
}

function mockReqRes(authHeader?: string) {
  const req: any = { headers: authHeader !== undefined ? { authorization: authHeader } : {} };
  const res: any = { statusCode: 200, body: undefined, status(c: number) { this.statusCode = c; return this; }, json(b: any) { this.body = b; return this; } };
  const next = vi.fn();
  return { req, res, next };
}

describe("verifyTeamsAuth", () => {
  const originalAppId = process.env.MICROSOFT_APP_ID;

  afterEach(() => {
    process.env.MICROSOFT_APP_ID = originalAppId;
  });

  it("no-ops (calls next) when MICROSOFT_APP_ID is not configured", async () => {
    delete process.env.MICROSOFT_APP_ID;
    const { verifyTeamsAuth } = await import("../server/routes/workspace-teams");
    const { req, res, next } = mockReqRes();
    await verifyTeamsAuth(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
  });

  describe("with MICROSOFT_APP_ID configured", () => {
    beforeEach(() => {
      process.env.MICROSOFT_APP_ID = APP_ID;
    });

    it("accepts a genuinely-signed token with correct issuer/audience/expiry", async () => {
      const { verifyTeamsAuth } = await import("../server/routes/workspace-teams");
      const { req, res, next } = mockReqRes(`Bearer ${signToken()}`);
      await verifyTeamsAuth(req, res, next);
      expect(next).toHaveBeenCalledOnce();
    });

    it("rejects a request missing the Authorization header", async () => {
      const { verifyTeamsAuth } = await import("../server/routes/workspace-teams");
      const { req, res, next } = mockReqRes();
      await verifyTeamsAuth(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
    });

    it("rejects a token signed for the wrong audience", async () => {
      const { verifyTeamsAuth } = await import("../server/routes/workspace-teams");
      const { req, res, next } = mockReqRes(`Bearer ${signToken({ aud: "someone-elses-app" })}`);
      await verifyTeamsAuth(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
    });

    it("rejects a token with the wrong issuer", async () => {
      const { verifyTeamsAuth } = await import("../server/routes/workspace-teams");
      const { req, res, next } = mockReqRes(`Bearer ${signToken({ iss: "https://evil.example.com" })}`);
      await verifyTeamsAuth(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
    });

    it("rejects an expired token", async () => {
      const { verifyTeamsAuth } = await import("../server/routes/workspace-teams");
      const { req, res, next } = mockReqRes(`Bearer ${signToken({ expiresInSec: -10 })}`);
      await verifyTeamsAuth(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
    });

    it("rejects a token signed by a key we don't recognize (forged kid)", async () => {
      const forged = generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
      const token = jwt.sign({}, forged.privateKey, { algorithm: "RS256", audience: APP_ID, issuer: ISSUER, expiresIn: 3600, keyid: "unknown-kid" });
      const { verifyTeamsAuth } = await import("../server/routes/workspace-teams");
      const { req, res, next } = mockReqRes(`Bearer ${token}`);
      await verifyTeamsAuth(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
    });
  });
});

describe("toAdaptiveCard", () => {
  it("renders an approval card with Approve/Deny Action.Submit carrying runId + decision", async () => {
    const { toAdaptiveCard } = await import("../server/routes/workspace-teams");
    const card = toAdaptiveCard({
      id: "run-123", status: "awaiting_approval",
      pending: { toolName: "delete_record", args: { id: "abc" } },
    } as any);
    expect(card.type).toBe("AdaptiveCard");
    expect(card.actions).toHaveLength(2);
    expect(card.actions[0].data).toEqual({ runId: "run-123", decision: "approve" });
    expect(card.actions[1].data).toEqual({ runId: "run-123", decision: "deny" });
  });

  it("renders a completed card with cost and signed-trace fact", async () => {
    const { toAdaptiveCard } = await import("../server/routes/workspace-teams");
    const card = toAdaptiveCard({
      id: "run-123", status: "completed", outputSummary: "Done!", costUsd: 0.0123, traceId: "trace-abcdef123456",
    } as any);
    expect(card.actions).toBeUndefined();
    const factSet = card.body.find((b: any) => b.type === "FactSet");
    expect(factSet.facts.find((f: any) => f.title === "Cost").value).toBe("$0.0123");
    expect(factSet.facts.find((f: any) => f.title === "Trace").value).toContain("signed");
  });
});
