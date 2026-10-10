/**
 * A stand-in for Microsoft Entra ID that speaks the real protocol over real HTTP: the authorize
 * endpoint (answers with a redirect carrying a one-time code), the token endpoint (checks the client
 * secret, the redirect URI and the PKCE verifier, and returns an RS256-signed ID token), and the tenant's
 * signing keys. A test chooses who signs in, and can have it misbehave in the ways a real attack or a real
 * outage would: a token for the wrong audience, a forged signature, a replayed code, a rotated key.
 */
import crypto from "node:crypto";
import http from "node:http";
import jwt from "jsonwebtoken";
import type { AddressInfo } from "node:net";

export interface Profile {
  oid: string;
  email?: string;
  upn?: string;
  name?: string;
  roles?: string[];
  amr?: string[];
}

export interface MockEntra {
  authority: string;
  tenantId: string;
  clientId: string;
  clientSecret: string;
  /** Who signs in next. */
  profile: Profile;
  /** Change the claims of the ID token about to be issued. */
  mutateClaims?: (claims: Record<string, unknown>) => Record<string, unknown>;
  /** Replace the whole ID token about to be issued (e.g. a forgery). */
  forge?: (claims: Record<string, unknown>) => string;
  /** Make the token endpoint refuse with this error. */
  tokenError?: { status: number; body: Record<string, unknown> };
  /** Make the authorize endpoint send the person back with an error instead of a code. */
  authorizeError?: { error: string; description?: string };
  keyRequests: number;
  tokenRequests: Array<{ body: Record<string, string>; ok: boolean }>;
  authorizeRequests: Array<Record<string, string>>;
  /** Start publishing (and signing with) a new key. */
  rotateKey(): void;
  /** Sign claims with the current key. */
  sign(claims: Record<string, unknown>): string;
  /** Sign claims with a key the tenant does not publish. */
  signWithUnpublishedKey(claims: Record<string, unknown>): string;
  publicKeyPem(): string;
  close(): Promise<void>;
}

const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export async function startMockEntra(opts: { tenantId?: string; clientId?: string; clientSecret?: string; port?: number } = {}): Promise<MockEntra> {
  const tenantId = opts.tenantId ?? "11111111-2222-3333-4444-555555555555";
  const clientId = opts.clientId ?? "app-client-id";
  const clientSecret = opts.clientSecret ?? "mock-client-secret";

  let keyNo = 1;
  const newKey = () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    return { kid: `kid-${keyNo++}`, publicKey, privateKey };
  };
  let current = newKey();
  const unpublished = newKey();
  const codes = new Map<string, { nonce: string; challenge: string; redirectUri: string; used: boolean; profile: Profile }>();

  const mock = {
    tenantId, clientId, clientSecret,
    profile: { oid: "00000000-0000-0000-0000-000000000001", email: "ana@hilti.example", upn: "ana@hilti.example", name: "Ana Example", roles: ["Astra.Admin"], amr: ["pwd", "mfa"] } as Profile,
    keyRequests: 0,
    tokenRequests: [] as MockEntra["tokenRequests"],
    authorizeRequests: [] as MockEntra["authorizeRequests"],
  } as MockEntra;

  const issuer = () => `${mock.authority}/${tenantId}/v2.0`;
  const sign = (claims: Record<string, unknown>) => jwt.sign(claims, current.privateKey.export({ type: "pkcs8", format: "pem" }) as string, { algorithm: "RS256", keyid: current.kid, noTimestamp: true });
  mock.sign = sign;
  mock.signWithUnpublishedKey = (claims) => jwt.sign(claims, unpublished.privateKey.export({ type: "pkcs8", format: "pem" }) as string, { algorithm: "RS256", keyid: current.kid, noTimestamp: true });
  mock.rotateKey = () => { current = newKey(); };
  mock.publicKeyPem = () => current.publicKey.export({ type: "spki", format: "pem" }) as string;

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const send = (status: number, body: unknown, headers: Record<string, string> = {}) => {
      res.writeHead(status, { "Content-Type": "application/json", ...headers }).end(JSON.stringify(body));
    };
    if (req.method === "GET" && url.pathname === `/${tenantId}/discovery/v2.0/keys`) {
      mock.keyRequests++;
      return send(200, { keys: [{ ...current.publicKey.export({ format: "jwk" }), kid: current.kid, use: "sig", alg: "RS256" }] });
    }
    if (req.method === "GET" && url.pathname === `/${tenantId}/oauth2/v2.0/authorize`) {
      const q = Object.fromEntries(url.searchParams);
      mock.authorizeRequests.push(q);
      const back = new URL(q.redirect_uri);
      if (mock.authorizeError) {
        back.searchParams.set("error", mock.authorizeError.error);
        if (mock.authorizeError.description) back.searchParams.set("error_description", mock.authorizeError.description);
        back.searchParams.set("state", q.state);
        res.writeHead(302, { Location: back.toString() }).end();
        return;
      }
      const code = crypto.randomBytes(16).toString("hex");
      codes.set(code, { nonce: q.nonce, challenge: q.code_challenge, redirectUri: q.redirect_uri, used: false, profile: { ...mock.profile } });
      back.searchParams.set("code", code);
      back.searchParams.set("state", q.state);
      res.writeHead(302, { Location: back.toString() }).end();
      return;
    }
    if (req.method === "POST" && url.pathname === `/${tenantId}/oauth2/v2.0/token`) {
      let raw = ""; for await (const c of req) raw += c;
      const body = Object.fromEntries(new URLSearchParams(raw));
      const fail = (status: number, error: string, description: string) => { mock.tokenRequests.push({ body, ok: false }); send(status, { error, error_description: description }); };
      if (mock.tokenError) { mock.tokenRequests.push({ body, ok: false }); return send(mock.tokenError.status, mock.tokenError.body); }
      if (body.grant_type !== "authorization_code") return fail(400, "unsupported_grant_type", "only authorization_code");
      if (body.client_id !== clientId || body.client_secret !== clientSecret) return fail(401, "invalid_client", "AADSTS7000215: Invalid client secret provided.");
      const entry = codes.get(body.code);
      if (!entry || entry.used) return fail(400, "invalid_grant", "AADSTS70008: The provided authorization code has expired or been used.");
      entry.used = true;
      if (body.redirect_uri !== entry.redirectUri) return fail(400, "invalid_grant", "AADSTS50011: The redirect URI does not match.");
      const challenge = crypto.createHash("sha256").update(body.code_verifier ?? "").digest("base64url");
      if (!body.code_verifier || challenge !== entry.challenge) return fail(400, "invalid_grant", "AADSTS501481: The code_verifier does not match the code_challenge.");
      const now = Math.floor(Date.now() / 1000);
      let claims: Record<string, unknown> = {
        iss: issuer(), aud: clientId, iat: now, nbf: now, exp: now + 3600, ver: "2.0",
        tid: tenantId, oid: entry.profile.oid, sub: `sub-${entry.profile.oid}`, nonce: entry.nonce,
        ...(entry.profile.name ? { name: entry.profile.name } : {}),
        ...(entry.profile.email ? { email: entry.profile.email } : {}),
        ...(entry.profile.upn ? { preferred_username: entry.profile.upn } : {}),
        ...(entry.profile.roles ? { roles: entry.profile.roles } : {}),
        ...(entry.profile.amr ? { amr: entry.profile.amr } : {}),
      };
      if (mock.mutateClaims) claims = mock.mutateClaims(claims);
      const id_token = mock.forge ? mock.forge(claims) : sign(claims);
      mock.tokenRequests.push({ body, ok: true });
      return send(200, { token_type: "Bearer", scope: "openid profile email", expires_in: 3600, access_token: "opaque-access-token", id_token });
    }
    send(404, { error: "not_found" });
  });
  await new Promise<void>((r) => server.listen(opts.port ?? 0, "127.0.0.1", r));
  mock.authority = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  mock.close = () => new Promise<void>((r) => server.close(() => r()));
  return mock;
}

/** A token with the header and payload of a real one and no signature at all. */
export function unsignedToken(claims: Record<string, unknown>, kid = "kid-1"): string {
  return `${b64u(JSON.stringify({ alg: "none", typ: "JWT", kid }))}.${b64u(JSON.stringify(claims))}.`;
}
