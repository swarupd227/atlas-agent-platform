import { describe, it, expect } from "vitest";
import { PIIMaskingEngine, DEFAULT_ENTITY_TYPES, SUPPORTED_ENTITY_TYPES, luhnValid } from "../server/services/pii/pii-masking-engine";

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

describe("card numbers: a match must be a plausible card, not any sixteen digits", () => {
  it("leaves an approval id alone: a UUID's tail is sixteen digits with a hyphen", async () => {
    // The live case: "ea5b3566-b329-494c-8396-396576690528" came back as "...-[CREDIT_CARD]".
    const id = "ea5b3566-b329-494c-8396-396576690528";
    const out = await mask(DEFAULT_ENTITY_TYPES, `CRO approval recorded (Approval ID: ${id}).`);
    expect(out).toContain(id);
    expect(out).not.toContain("[CREDIT_CARD]");
  });

  it("leaves a UUID alone even when its tail happens to pass the Luhn check", async () => {
    // 4111-111111111111 is Luhn-valid; inside a UUID it is still not a card number.
    const id = "0b91f241-1c54-468f-4111-111111111111";
    const out = await mask(DEFAULT_ENTITY_TYPES, `run ${id} finished`);
    expect(out).toContain(id);
  });

  it("still masks a real card number, with or without separators", async () => {
    for (const card of ["4111 1111 1111 1111", "4111-1111-1111-1111", "5500000000000004"]) {
      const out = await mask(DEFAULT_ENTITY_TYPES, `card ${card} on file`);
      expect(out, card).toBe("card [CREDIT_CARD] on file");
    }
  });

  it("leaves sixteen digits that fail the Luhn check alone", async () => {
    const out = await mask(DEFAULT_ENTITY_TYPES, "reference 1234 5678 9012 3456 for the shipment");
    expect(out).toContain("1234 5678 9012 3456");
  });

  it("luhnValid accepts known test numbers and rejects their neighbours", () => {
    expect(luhnValid("4111111111111111")).toBe(true);
    expect(luhnValid("5500000000000004")).toBe(true);
    expect(luhnValid("4111111111111112")).toBe(false);
    expect(luhnValid("8396396576690528")).toBe(false);
    expect(luhnValid("12")).toBe(false);
  });
});
