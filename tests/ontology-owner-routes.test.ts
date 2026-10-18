/**
 * The Ontology page's own routes, for a concept an organization added through an approved agent
 * proposal. With default-deny storage the owner could not open such a concept's history, see its
 * linked agents, edit it or delete it: every one of those lookups named no organization and so
 * saw platform-wide concepts only. They now pass the caller's organization. What must stay true:
 * another organization's concept is still not found, a platform concept is not widened to link
 * to a private one, and a request body cannot change which organization a concept belongs to.
 *
 * Storage here applies the same scope as the real one (platform-wide rows, plus the named
 * organization's own), so the route is judged on what it asks for.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import type { AddressInfo } from "net";

const db = vi.hoisted(() => ({ rows: new Map<string, any>(), calls: [] as Array<{ fn: string; org: unknown }> }));
const inScope = (r: any, org?: string | null) => r.organizationId == null || (!!org && r.organizationId === org);
vi.mock("../server/storage", () => ({
  storage: {
    getOntologyConcepts: vi.fn(async (industryId: string, _sub?: string, org?: string | null) => { db.calls.push({ fn: "list", org }); return Array.from(db.rows.values()).filter((r) => r.industryId === industryId && inScope(r, org)); }),
    getOntologyConcept: vi.fn(async (id: string, org?: string | null) => { db.calls.push({ fn: "get", org }); const r = db.rows.get(id); return r && inScope(r, org) ? { ...r } : undefined; }),
    updateOntologyConcept: vi.fn(async (id: string, data: any, org?: string | null) => { db.calls.push({ fn: "update", org }); const r = db.rows.get(id); if (!r || !inScope(r, org)) return undefined; const u = { ...r, ...data }; db.rows.set(id, u); return { ...u }; }),
    deleteOntologyConcept: vi.fn(async (id: string, org?: string | null) => { db.calls.push({ fn: "delete", org }); const r = db.rows.get(id); if (!r || !inScope(r, org)) return false; db.rows.delete(id); return true; }),
    getAgents: vi.fn(async () => []),
    getAgentsByOntologyConcept: vi.fn(async () => []),
    createAuditEvent: vi.fn(async () => undefined),
  },
}));

describe("the Ontology page's routes for an organization's own concepts", () => {
  let server: ReturnType<express.Express["listen"]> | undefined;
  let base = "";
  beforeAll(async () => {
    process.env.SECURITY_MODE = "demo";
    const { setDefaultOrgId } = await import("../server/auth");
    setDefaultOrgId("org-default");
    const { default: router } = await import("../server/routes/skills");
    const app = express(); app.use(express.json()); app.use(router);
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => server?.close());
  const call = (method: string, path: string, body?: unknown, org = "org-a") =>
    fetch(base + path, { method, headers: { "content-type": "application/json", "x-role": "admin", "x-organization-id": org }, body: body ? JSON.stringify(body) : undefined })
      .then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) }));

  beforeEach(() => {
    db.rows.clear(); db.calls.length = 0;
    const put = (id: string, label: string, organizationId: string | null) => db.rows.set(id, { id, industryId: "insurance", label, category: "Term", description: "d", relationships: [], tags: [], synonyms: [], version: 1, versionHistory: [], organizationId });
    put("plat", "Platform Term", null);
    put("own", "Own Term", "org-a");
    put("theirs", "Their Term", "org-b");
  });

  it("the owner reads a private concept's history, and another organization's is not found", async () => {
    expect((await call("GET", "/api/ontology/concepts/own/versions")).status).toBe(200);
    expect((await call("GET", "/api/ontology/concepts/plat/versions")).status).toBe(200);
    expect((await call("GET", "/api/ontology/concepts/theirs/versions")).status).toBe(404);
    expect((await call("GET", "/api/ontology/concepts/own/linked-agents")).status).toBe(200);
    expect((await call("GET", "/api/ontology/concepts/theirs/linked-agents")).status).toBe(404);
  });

  it("a concept is private to the organization that added it, whoever asks", async () => {
    expect((await call("GET", "/api/ontology/concepts/own/versions", undefined, "org-b")).status).toBe(404);
  });

  it("the owner edits a private concept: the version moves on and the history keeps the previous one", async () => {
    const r = await call("PUT", "/api/ontology/concepts/own", { description: "A better definition." });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ description: "A better definition.", version: 2, organizationId: "org-a" });
    expect(db.rows.get("own").versionHistory).toHaveLength(1);
    expect(db.calls.filter((c) => c.fn === "update").every((c) => c.org === "org-a")).toBe(true);
  });

  it("another organization's concept cannot be edited, and is left as it was", async () => {
    expect((await call("PUT", "/api/ontology/concepts/theirs", { description: "Hijacked." })).status).toBe(404);
    expect(db.rows.get("theirs").description).toBe("d");
  });

  it("a request body cannot change which organization a concept belongs to", async () => {
    await call("PUT", "/api/ontology/concepts/own", { description: "Edited.", organizationId: null });
    expect(db.rows.get("own").organizationId).toBe("org-a");
    await call("PUT", "/api/ontology/concepts/own", { description: "Edited again.", organizationId: "org-b" });
    expect(db.rows.get("own").organizationId).toBe("org-a");
    await call("PUT", "/api/ontology/concepts/plat", { description: "Edited platform.", organizationId: "org-a" });
    expect(db.rows.get("plat").organizationId).toBeNull();
  });

  it("a private concept may link to a platform concept and to its organization's own, but not to another organization's", async () => {
    expect((await call("PUT", "/api/ontology/concepts/own", { relationships: [{ predicate: "partOf", targetId: "plat" }] })).status).toBe(200);
    db.rows.set("own2", { ...db.rows.get("own"), id: "own2", label: "Own Two" });
    expect((await call("PUT", "/api/ontology/concepts/own", { relationships: [{ predicate: "partOf", targetId: "own2" }] })).status).toBe(200);
    const r = await call("PUT", "/api/ontology/concepts/own", { relationships: [{ predicate: "partOf", targetId: "theirs" }] });
    expect(r.status).toBe(400);
  });

  it("a platform-wide concept is not widened to link to a private one", async () => {
    const r = await call("PUT", "/api/ontology/concepts/plat", { relationships: [{ predicate: "partOf", targetId: "own" }] });
    expect(r.status).toBe(400);
    expect(db.rows.get("plat").relationships).toEqual([]);
  });

  it("the owner deletes a private concept; another organization's survives", async () => {
    expect((await call("DELETE", "/api/ontology/concepts/theirs")).status).toBe(404);
    expect(db.rows.has("theirs")).toBe(true);
    expect((await call("DELETE", "/api/ontology/concepts/own")).status).toBe(200);
    expect(db.rows.has("own")).toBe(false);
  });
});
