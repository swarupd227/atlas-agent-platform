/**
 * OpenAPI/Swagger → connector parser — proves operations are extracted with
 * correct method/path/inputSchema (params + request body merged, one-level
 * $ref resolved), risk is classified by HTTP method (mutating = higher),
 * both OpenAPI 3.x and legacy Swagger 2.0 shapes parse, YAML input works,
 * and malformed input throws a real error instead of silently returning
 * zero operations.
 */
import { describe, it, expect } from "vitest";
import { parseOpenApiSpec, OpenApiParseError } from "../server/openapi-import";

const OPENAPI_3_SPEC = {
  openapi: "3.0.0",
  info: { title: "Petstore", version: "1.2.0" },
  servers: [{ url: "https://api.petstore.example.com/v1" }],
  paths: {
    "/pets": {
      get: {
        operationId: "listPets",
        summary: "List all pets",
        parameters: [
          { name: "limit", in: "query", required: false, schema: { type: "integer" } },
        ],
        responses: { "200": { description: "ok" } },
      },
      post: {
        operationId: "createPet",
        summary: "Create a pet",
        requestBody: {
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/NewPet" },
            },
          },
        },
        responses: { "201": { description: "created" } },
      },
    },
    "/pets/{petId}": {
      parameters: [{ name: "petId", in: "path", required: true, schema: { type: "string" } }],
      get: { operationId: "getPet", responses: { "200": { description: "ok" } } },
      delete: { operationId: "deletePet", responses: { "204": { description: "deleted" } } },
    },
  },
  components: {
    schemas: {
      NewPet: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", description: "Pet name" },
          tag: { type: "string" },
        },
      },
    },
  },
};

const SWAGGER_2_SPEC = {
  swagger: "2.0",
  info: { title: "Legacy API", version: "1.0" },
  host: "legacy.example.com",
  basePath: "/api",
  schemes: ["https"],
  paths: {
    "/widgets": {
      post: {
        operationId: "createWidget",
        parameters: [
          {
            name: "body",
            in: "body",
            required: true,
            schema: { type: "object", required: ["title"], properties: { title: { type: "string" } } },
          },
        ],
        responses: { "200": { description: "ok" } },
      },
    },
  },
};

describe("parseOpenApiSpec — OpenAPI 3.x", () => {
  const result = parseOpenApiSpec(JSON.stringify(OPENAPI_3_SPEC));

  it("extracts title, version, and baseUrl from servers[0]", () => {
    expect(result.title).toBe("Petstore");
    expect(result.version).toBe("1.2.0");
    expect(result.baseUrl).toBe("https://api.petstore.example.com/v1");
  });

  it("extracts one operation per method per path", () => {
    expect(result.operations).toHaveLength(4);
    const names = result.operations.map(o => o.name).sort();
    expect(names).toEqual(["createPet", "deletePet", "getPet", "listPets"]);
  });

  it("uses operationId as the tool name when present", () => {
    const op = result.operations.find(o => o.name === "listPets")!;
    expect(op.method).toBe("GET");
    expect(op.path).toBe("/pets");
  });

  it("merges query parameters into inputSchema", () => {
    const op = result.operations.find(o => o.name === "listPets")!;
    expect(op.inputSchema.properties.limit).toMatchObject({ type: "integer", in: "query" });
    expect(op.inputSchema.required).not.toContain("limit");
  });

  it("resolves a $ref request body and merges its properties + required", () => {
    const op = result.operations.find(o => o.name === "createPet")!;
    expect(op.inputSchema.properties.name).toMatchObject({ type: "string", description: "Pet name" });
    expect(op.inputSchema.properties.tag).toMatchObject({ type: "string" });
    expect(op.inputSchema.required).toContain("name");
  });

  it("merges path-level parameters (defined once, applied to every method under that path)", () => {
    const getOp = result.operations.find(o => o.name === "getPet")!;
    const deleteOp = result.operations.find(o => o.name === "deletePet")!;
    expect(getOp.inputSchema.properties.petId).toMatchObject({ type: "string", in: "path" });
    expect(getOp.inputSchema.required).toContain("petId");
    expect(deleteOp.inputSchema.properties.petId).toMatchObject({ type: "string", in: "path" });
  });

  it("classifies risk by HTTP method — GET/HEAD low, mutating medium, DELETE high", () => {
    expect(result.operations.find(o => o.name === "listPets")!.riskClassification).toBe("low");
    expect(result.operations.find(o => o.name === "createPet")!.riskClassification).toBe("medium");
    expect(result.operations.find(o => o.name === "deletePet")!.riskClassification).toBe("high");
  });
});

describe("parseOpenApiSpec — legacy Swagger 2.0", () => {
  it("derives baseUrl from host+basePath+schemes and parses the body parameter", () => {
    const result = parseOpenApiSpec(JSON.stringify(SWAGGER_2_SPEC));
    expect(result.baseUrl).toBe("https://legacy.example.com/api");
    expect(result.operations).toHaveLength(1);
    const op = result.operations[0];
    expect(op.name).toBe("createWidget");
    expect(op.inputSchema.properties.title).toMatchObject({ type: "string" });
    expect(op.inputSchema.required).toContain("title");
  });
});

describe("parseOpenApiSpec — YAML input", () => {
  it("parses a YAML-formatted spec identically to its JSON equivalent", () => {
    const yamlSpec = `
openapi: 3.0.0
info:
  title: YAML API
  version: "1.0"
servers:
  - url: https://yaml.example.com
paths:
  /ping:
    get:
      operationId: ping
      responses:
        "200":
          description: ok
`;
    const result = parseOpenApiSpec(yamlSpec);
    expect(result.title).toBe("YAML API");
    expect(result.baseUrl).toBe("https://yaml.example.com");
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].name).toBe("ping");
  });
});

describe("parseOpenApiSpec — malformed input", () => {
  it("throws OpenApiParseError for text that's neither JSON nor YAML-parseable to an object", () => {
    expect(() => parseOpenApiSpec("not json { or yaml: [")).toThrow(OpenApiParseError);
  });

  it("throws OpenApiParseError when the parsed document has no paths", () => {
    expect(() => parseOpenApiSpec(JSON.stringify({ info: { title: "x" } }))).toThrow(OpenApiParseError);
  });

  it("throws OpenApiParseError when paths is present but empty of operations", () => {
    expect(() => parseOpenApiSpec(JSON.stringify({ paths: { "/x": {} } }))).toThrow(OpenApiParseError);
  });
});
