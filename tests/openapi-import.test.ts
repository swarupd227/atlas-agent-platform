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

describe("parseOpenApiSpec — nested request bodies (FastAPI-style)", () => {
  // Shape of a real service (the Figma board service): an array of objects
  // behind a $ref, and Optional[X] written as anyOf [X, null]. A bare
  // { type: "object" } item tells a model nothing about what to send.
  const spec = {
    openapi: "3.1.0",
    info: { title: "Boards", version: "2.4.0" },
    paths: {
      "/boards/{board_id}/text": {
        post: {
          operationId: "fill_board_text",
          parameters: [{ name: "board_id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/FillText" } } } },
        },
      },
    },
    components: {
      schemas: {
        FillText: {
          type: "object",
          required: ["items"],
          properties: {
            items: { type: "array", items: { $ref: "#/components/schemas/TextItem" } },
            note: { anyOf: [{ type: "string" }, { type: "null" }], description: "Optional note", default: null },
          },
        },
        TextItem: {
          type: "object",
          required: ["placeholder_id", "text"],
          properties: { placeholder_id: { type: "string" }, text: { type: "string" } },
        },
      },
    },
  };
  const op = parseOpenApiSpec(JSON.stringify(spec)).operations[0];
  const props = op.inputSchema.properties as Record<string, any>;

  it("keeps the fields of nested objects behind a $ref", () => {
    expect(props.items.type).toBe("array");
    expect(props.items.items.properties).toEqual({ placeholder_id: { type: "string" }, text: { type: "string" } });
    expect(props.items.items.required).toEqual(["placeholder_id", "text"]);
  });

  it("reads a nullable field as its non-null type", () => {
    expect(props.note).toEqual({ type: "string", description: "Optional note", default: null });
  });

  it("still marks the path parameter and merges required body fields", () => {
    expect(props.board_id.in).toBe("path");
    expect(op.inputSchema.required).toEqual(expect.arrayContaining(["board_id", "items"]));
  });
});
