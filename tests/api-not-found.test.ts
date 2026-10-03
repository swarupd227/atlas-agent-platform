/**
 * An unknown /api path is a 404, not the app shell with a 200.
 *
 * Found while verifying something else: four endpoints I had invented came back
 * 200 with index.html, and I read that as "the page calls these and they are
 * broken" rather than "these do not exist". The SPA catch-all answers
 * "/{*path}", it is mounted after every API route, and nothing told the two
 * apart. Any caller that checks res.ok and not the body has the same problem,
 * only it fails further downstream -- on a shape that is not what it expected,
 * or on an empty render.
 *
 * Measured on the live app before the fix:
 *   /api/blueprints/<id>/team-graph -> 200 application/json   (real)
 *   /api/blueprints/<id>/nodes      -> 200 text/html          (does not exist)
 *   /api/this-endpoint-does-not-exist -> 200 text/html
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { apiNotFound } from "../server/api-not-found";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");

function fakeRes() {
  const out: { code?: number; body?: any } = {};
  const res: any = {
    status(c: number) { out.code = c; return res; },
    json(b: any) { out.body = b; return res; },
  };
  return { res, out };
}

const call = (method: string, originalUrl: string) => {
  const { res, out } = fakeRes();
  apiNotFound({ method, originalUrl } as any, res);
  return out;
};

describe("an unclaimed API path", () => {
  it("is a 404 with a readable message, not a 200", () => {
    const out = call("GET", "/api/blueprints/abc/nodes");
    expect(out.code).toBe(404);
    expect(out.body.message).toBe("No API endpoint for GET /api/blueprints/abc/nodes");
  });

  it("names the method, so a route that exists for GET but not POST reads correctly", () => {
    expect(call("POST", "/api/process-flows/x/rebuild").body.message)
      .toBe("No API endpoint for POST /api/process-flows/x/rebuild");
  });

  it("drops the query string", () => {
    // A 404 body is read in logs and toasts. This fails the moment someone
    // reaches for req.originalUrl whole.
    const out = call("GET", "/api/search?q=jane%40example.com&token=abc123");
    expect(out.body.message).toBe("No API endpoint for GET /api/search");
    expect(out.body.message).not.toContain("jane");
    expect(out.body.message).not.toContain("abc123");
  });

  it("answers in the shape the client already knows how to show", () => {
    // throwIfResNotOk reads `message`; anything else surfaces as a raw status.
    expect(Object.keys(call("GET", "/api/nope").body!)).toEqual(["message"]);
  });
});

describe("where it is mounted", () => {
  const index = read("server", "index.ts");

  it("covers both API prefixes", () => {
    expect(index).toContain('app.use("/api", apiNotFound)');
    expect(index).toContain('app.use("/demo-api", apiNotFound)');
  });

  it("sits after every route and before the catch-all that was swallowing them", () => {
    // The only thing a unit test cannot see, and the only way this silently
    // does nothing: mount it too early and it eats real routes, too late and
    // index.html still answers first.
    const mounted = index.indexOf('app.use("/api", apiNotFound)');
    const routes = index.indexOf("await registerRoutes(");
    const staticFallback = index.indexOf("serveStatic(app)");
    const viteFallback = index.indexOf("setupVite(httpServer, app)");
    expect(routes).toBeGreaterThan(-1);
    expect(mounted).toBeGreaterThan(routes);
    expect(mounted).toBeLessThan(staticFallback);
    expect(mounted).toBeLessThan(viteFallback);
  });

  it("stays behind the auth middleware, so anonymous callers still get 401", () => {
    // Otherwise this starts telling signed-out callers which endpoints exist.
    const auth = index.indexOf('app.use("/api", authMiddleware)');
    expect(auth).toBeGreaterThan(-1);
    expect(index.indexOf('app.use("/api", apiNotFound)')).toBeGreaterThan(auth);
  });
});

describe("the catch-all it is protecting against", () => {
  it("is still a 200 html answer for everything else, in both builds", () => {
    // If either of these stops being a blanket "/{*path}", this fix is
    // answering a question nobody is asking any more.
    expect(read("server", "static.ts")).toContain('app.use("/{*path}"');
    expect(read("server", "vite.ts")).toContain('app.use("/{*path}"');
  });
});
