/**
 * Every fetch whose URL a person or a caller supplies goes through safeFetch.
 *
 * Checking a URL and then fetching it separately resolves the name twice, and a
 * hostile resolver can answer differently the second time; a redirect can also
 * lead somewhere the check never saw. safeFetch closes both, but only where it is
 * used, so these tests pin the call sites. A raw fetch put back at one of them
 * fails here, not in production.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { callN8nWorkflow } from "../server/integrations/n8n";

const read = (p: string) => readFileSync(p, "utf8");

describe("fetches of a user-supplied URL use safeFetch", () => {
  it("knowledge-base page ingestion and crawling", () => {
    const src = read("server/kb-routes.ts");
    expect(src).toContain("const response = await safeFetch(url, {");
    expect(src).not.toContain("const response = await fetch(url, {");
  });

  it("OpenAPI spec import, marketplace spec install and registry discovery and sync", () => {
    const imp = read("server/routes/openapi-connectors.ts");
    expect(imp).toContain("await safeFetch(specUrl,");
    expect(imp).not.toContain("await fetch(specUrl,");
    const rt = read("server/routes/runtime.ts");
    expect(rt).toContain("await safeFetch(url, { signal: AbortSignal.timeout(10_000), headers: { accept:");
    expect(rt).toContain("await safeFetch(server.openApiSpecUrl,");
    expect(rt).toContain("await safeFetch(url.toString(), { signal: AbortSignal.timeout(10_000) });");
    expect(rt).not.toContain("await fetch(server.openApiSpecUrl");
    expect(rt).not.toContain("await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) })");
  });

  it("connector and webhook test buttons", () => {
    const src = read("server/routes/tool-connectors.ts");
    expect(src).toContain("await safeFetch(testUrl,");
    expect(src).toContain("await safeFetch(webhookUrl,");
    expect(src).not.toContain("await fetch(testUrl,");
    expect(src).not.toContain("await fetch(webhookUrl,");
  });

  it("the vendor connection tests that take a customer-supplied host", () => {
    const src = read("server/connector-connection-test.ts");
    for (const call of [
      "safeFetch(`${instanceUrl}/services/data/v59.0/`",
      "safeFetch(`${credentials.base_url}/rest/api/3/myself`",
      "safeFetch(`${credentials.instance_url}/api/now/table/incident?sysparm_limit=1`",
      "safeFetch(`${baseUrl}/healthz`",
    ]) expect(src).toContain(call);
    expect(src).not.toMatch(/\bfetch\(`\$\{(instanceUrl|credentials\.base_url|credentials\.instance_url|baseUrl)\}/);
  });

  it("n8n calls whose URL came from the request, and the connector call that checks it", () => {
    expect(read("server/routes/public-api.ts")).toContain("fetchImpl: callerSuppliedUrl ? safeFetch : undefined");
    expect(read("server/routes/enterprise-integrations.ts")).toContain("fetchImpl: safeFetch,");
  });
});

describe("callN8nWorkflow takes the fetch it is given, and defaults to the plain one", () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  const reply = () => ({ ok: true, status: 200, text: async () => '{"done":true}' }) as unknown as Response;

  it("uses an injected fetch", async () => {
    const injected = vi.fn(async () => reply());
    const plain = vi.fn(async () => reply());
    vi.stubGlobal("fetch", plain);
    const out = await callN8nWorkflow({ webhookUrl: "https://n8n.example.com/webhook/x", payload: { a: 1 }, fetchImpl: injected });
    expect(out).toMatchObject({ ok: true, data: { done: true } });
    expect(injected).toHaveBeenCalledTimes(1);
    expect(plain).not.toHaveBeenCalled();
  });

  it("uses the global fetch when none is given (an organization's own stored URL)", async () => {
    const plain = vi.fn(async () => reply());
    vi.stubGlobal("fetch", plain);
    await callN8nWorkflow({ webhookUrl: "http://n8n.internal:5678/webhook/x" });
    expect(plain).toHaveBeenCalledTimes(1);
  });

  it("reports a refused URL as a failed call and not a thrown error", async () => {
    const refuse = vi.fn(async () => { throw new Error("Host is not reachable from this action."); });
    const out = await callN8nWorkflow({ webhookUrl: "http://169.254.169.254/x", fetchImpl: refuse });
    expect(out).toMatchObject({ ok: false, status: 0, error: "Host is not reachable from this action." });
  });
});
