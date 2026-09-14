/**
 * Tool arguments sent as JSON text where the schema asks for a list or object.
 *
 * Live: a deck assembler passed fill_document_template's `slides` as a string
 * twice in one run ("slides: Expected array, received string"), and the run
 * ended with no deck. The text is unambiguous, so it is parsed before any tool
 * sees it -- and only then.
 */
import { describe, it, expect } from "vitest";
import { coerceToolArgsToSchema } from "../server/tool-arg-coercion";

const FILL_SCHEMA = {
  type: "object",
  properties: {
    outputTitle: { type: "string" },
    slides: {
      type: "array",
      items: {
        type: "object",
        properties: {
          slide: { type: "number" },
          shapes: { type: "array", items: { type: "object", properties: { name: { type: "string" }, text: { type: "string" } } } },
          table: { type: "object", properties: { rows: { type: "array" } } },
        },
      },
    },
  },
};

describe("coerceToolArgsToSchema", () => {
  it("parses a list the model sent as JSON text", () => {
    const slides = [{ slide: 1, shapes: [{ name: "Title 1", text: "Operation Power Play" }] }];
    const out = coerceToolArgsToSchema({ outputTitle: "Plan", slides: JSON.stringify(slides) }, FILL_SCHEMA);
    expect(out.slides).toEqual(slides);
    expect(out.outputTitle).toBe("Plan");
  });

  it("parses nested values the same way", () => {
    const out = coerceToolArgsToSchema(
      { slides: [{ slide: 2, shapes: '[{"name":"Body","text":"x"}]', table: '{"rows":[["a","b"]]}' }] },
      FILL_SCHEMA,
    );
    expect(out.slides[0].shapes).toEqual([{ name: "Body", text: "x" }]);
    expect(out.slides[0].table).toEqual({ rows: [["a", "b"]] });
  });

  it("never turns text into structure where the schema asks for text", () => {
    const out = coerceToolArgsToSchema({ outputTitle: '["not", "a", "list"]' }, FILL_SCHEMA);
    expect(out.outputTitle).toBe('["not", "a", "list"]');
  });

  it("leaves text that parses to the wrong type for the tool to reject", () => {
    const args = { slides: '{"slide": 1}' };
    expect(coerceToolArgsToSchema(args, FILL_SCHEMA).slides).toBe('{"slide": 1}');
  });

  it("leaves text that is not valid JSON for the tool to reject", () => {
    const args = { slides: "[{slide: 1" };
    expect(coerceToolArgsToSchema(args, FILL_SCHEMA).slides).toBe("[{slide: 1");
  });

  it("accepts a property that may be either a string or a list, as sent", () => {
    const schema = { type: "object", properties: { q: { type: ["string", "array"] } } };
    expect(coerceToolArgsToSchema({ q: '["a"]' }, schema).q).toBe('["a"]');
  });

  it("recovers JSON text whose string values contain raw line breaks", () => {
    // What a model writes when paragraph newlines land inside a list wrapped in a string.
    const raw = '[\n  {"slide": 1, "shapes": [{"name": "Body", "text": "First paragraph.\nSecond paragraph.\tTabbed"}]}\n]';
    expect(() => JSON.parse(raw)).toThrow();
    const out = coerceToolArgsToSchema({ outputTitle: "Plan", slides: raw }, FILL_SCHEMA);
    expect(out.slides).toEqual([{ slide: 1, shapes: [{ name: "Body", text: "First paragraph.\nSecond paragraph.\tTabbed" }] }]);
  });

  it("keeps escaped characters exactly as written while recovering", () => {
    const raw = '[{"slide": 2, "shapes": [{"name": "Quote", "text": "He said \\"go\\"\nC:\\\\path"}]}]';
    const out = coerceToolArgsToSchema({ slides: raw }, FILL_SCHEMA);
    expect(out.slides[0].shapes[0].text).toBe('He said "go"\nC:\\path');
  });

  it("still leaves text that is broken in other ways for the tool to reject", () => {
    const raw = '[{"slide": 1, "shapes": [{"name": "Body", "text": "unterminated\n}]';
    expect(coerceToolArgsToSchema({ slides: raw }, FILL_SCHEMA).slides).toBe(raw);
  });

  it("returns the very same object when nothing needed parsing", () => {
    const args = { outputTitle: "Plan", slides: [{ slide: 1 }] };
    expect(coerceToolArgsToSchema(args, FILL_SCHEMA)).toBe(args);
  });

  it("does nothing for a tool with no schema", () => {
    const args = { slides: "[1]" };
    expect(coerceToolArgsToSchema(args, undefined)).toBe(args);
    expect(coerceToolArgsToSchema(args, {})).toBe(args);
  });
});
