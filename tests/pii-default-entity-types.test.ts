import { describe, it, expect } from "vitest";
import { PIIMaskingEngine, DEFAULT_ENTITY_TYPES, SUPPORTED_ENTITY_TYPES } from "../server/services/pii/pii-masking-engine";

const mask = async (entityTypes: string[], text: string) => {
  const engine = new PIIMaskingEngine({ engine: "regex", entityTypes, customPatterns: [], failOnError: false });
  const [r] = await engine.maskBatch([{ text, artifactId: "t" }]);
  return r.maskedText;
};

describe("PII default entity types", () => {
  const text = "Mail jane@acme.com, hero image https://cdn.example.com/hero.png";

  it("leaves web addresses alone by default but still masks personal data", async () => {
    const out = await mask(DEFAULT_ENTITY_TYPES, text);
    expect(out).toContain("https://cdn.example.com/hero.png");
    expect(out).not.toContain("jane@acme.com");
  });

  it("still masks URLs when a config opts into them", async () => {
    expect(SUPPORTED_ENTITY_TYPES).toContain("URL");
    const out = await mask(SUPPORTED_ENTITY_TYPES, text);
    expect(out).not.toContain("https://cdn.example.com/hero.png");
  });
});
