/**
 * The Amazon Bedrock administration routes: who may reach them, and that the Model Providers page shows the card.
 * Source-reading pins, like the other route-guard tests: they keep a route from losing its guard without anything failing.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.join(__dirname, "..");
const read = (f: string) => readFileSync(path.join(ROOT, f), "utf8").replace(/\r\n/g, "\n");

const ROUTES: Array<[verb: string, route: string]> = [
  ["get", "/api/admin/bedrock"],
  ["put", "/api/admin/bedrock"],
  ["post", "/api/admin/bedrock/credentials"],
  ["delete", "/api/admin/bedrock/credentials"],
  ["post", "/api/admin/bedrock/test"],
  ["get", "/api/admin/bedrock/policy"],
  ["get", "/api/admin/bedrock/search"],
  ["post", "/api/admin/bedrock/search/reembed"],
  ["post", "/api/admin/bedrock/search/stop"],
  ["post", "/api/admin/bedrock/search/switch"],
];

describe("the Bedrock administration routes", () => {
  const src = read("server/routes/bedrock.ts");

  for (const [verb, route] of ROUTES) {
    it(`${verb.toUpperCase()} ${route} needs the security permission AND the platform's own organization`, () => {
      const at = src.indexOf(`router.${verb}("${route}"`);
      expect(at, "route not found").toBeGreaterThanOrEqual(0);
      const head = src.slice(at, at + 160);
      expect(head).toContain('platformOnly(checkPermission("manage_security"))');
    });
  }

  it("has no route that is not in this list", () => {
    const found = [...src.matchAll(/router\.(get|put|post|delete|patch)\("([^"]+)"/g)].map((m) => `${m[1]} ${m[2]}`).sort();
    expect(found).toEqual(ROUTES.map(([v, r]) => `${v} ${r}`).sort());
  });

  it("never sends a secret back: the status carries a preview, not the keys", () => {
    expect(src).not.toMatch(/secretAccessKey\s*[:,]\s*creds/);
    expect(read("server/bedrock-config.ts")).toMatch(/preview: row\?\.keyPreview/);
  });

  it("is mounted", () => {
    const routes = read("server/routes.ts");
    expect(routes).toContain('import bedrockRouter from "./routes/bedrock";');
    expect(routes).toContain("app.use(bedrockRouter);");
  });
});

describe("the Model Providers page", () => {
  it("shows the Amazon Bedrock card", () => {
    const page = read("client/src/pages/model-providers.tsx");
    expect(page).toContain('import { BedrockProviderCard } from "@/components/bedrock-settings";');
    expect(page).toContain("<BedrockProviderCard />");
  });

  it("hides the card from anyone who may not manage it, instead of showing a broken one", () => {
    const card = read("client/src/components/bedrock-settings.tsx");
    expect(card).toMatch(/if \(isLoading \|\| isError \|\| !data\) return null;/);
  });
});
