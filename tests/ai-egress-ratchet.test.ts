/**
 * AWS-only mode only means something if no part of the server can reach OpenAI or Anthropic's own API around the guard.
 *
 * The guard lives in server/ai-egress.ts (OpenAI, for everything outside the provider layer), server/llm-provider.ts and
 * server/claude.ts (the two places that build SDK clients for chat). This test reads every server file's syntax tree and fails when
 * another file imports either SDK as a value, builds a client with `new`, loads an SDK dynamically, or names the vendors' API
 * addresses. A new feature that needs a model goes through the provider layer (or `createGuardedOpenAi`) instead.
 *
 * Code the platform GENERATES for the customer (templates written out as text) is not the platform calling a vendor, and a syntax
 * tree does not see it: only real statements count.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const SERVER = path.resolve(__dirname, "../server");
const SDKS = new Set(["openai", "@anthropic-ai/sdk"]);
const CLIENT_CLASSES = new Set(["OpenAI", "AzureOpenAI", "Anthropic", "AnthropicBedrock", "AnthropicVertex"]);

/** The files allowed to hold an SDK, and why. Adding to this list is a decision to make with the AWS-only rule in mind. */
const ALLOWED: Record<string, string> = {
  "ai-egress.ts": "the guard: builds the one OpenAI client for everything outside the provider layer",
  "llm-provider.ts": "the provider layer: its OpenAI and Anthropic providers apply the AWS-only rule inside themselves",
  "claude.ts": "the Claude helpers: apply the AWS-only rule before building the Anthropic client",
  "anthropic-code-execution.ts": "only borrows the SDK's file helper (toFile); the client comes from the provider layer, which refuses under AWS only",
};

function* serverFiles(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== "mock-mcp") yield* serverFiles(full); }
    else if (/\.tsx?$/.test(entry.name)) yield full;
  }
}

interface Finding { file: string; line: number; what: string }

function scan(file: string, text: string): Finding[] {
  const rel = path.relative(SERVER, file).replace(/\\/g, "/");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const out: Finding[] = [];
  const at = (node: ts.Node, what: string) => out.push({ file: rel, line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1, what });
  const specifier = (n: ts.Expression | undefined) => (n && ts.isStringLiteralLike(n) ? n.text : undefined);
  const isSdk = (name: string | undefined) => !!name && [...SDKS].some((s) => name === s || name.startsWith(s + "/"));

  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && isSdk(specifier(node.moduleSpecifier)) && !node.importClause?.isTypeOnly) at(node, `imports ${specifier(node.moduleSpecifier)} as a value`);
    if (ts.isExportDeclaration(node) && isSdk(specifier(node.moduleSpecifier))) at(node, `re-exports ${specifier(node.moduleSpecifier)}`);
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const dynamicImport = callee.kind === ts.SyntaxKind.ImportKeyword;
      const requireCall = ts.isIdentifier(callee) && callee.text === "require";
      if ((dynamicImport || requireCall) && isSdk(specifier(node.arguments[0]))) at(node, `loads ${specifier(node.arguments[0])} at run time`);
    }
    if (ts.isNewExpression(node)) {
      const e = node.expression;
      const name = ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? e.name.text : undefined;
      if (name && CLIENT_CLASSES.has(name)) at(node, `builds a ${name} client`);
      else if (ts.isParenthesizedExpression(e) || ts.isPropertyAccessExpression(e)) {
        // new (await import("openai")).default(...)
        if (/\bimport\(\s*["'](openai|@anthropic-ai)/.test(e.getText())) at(node, "builds a client from a dynamically loaded SDK");
      }
    }
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && /api\.(openai|anthropic)\.com/i.test(node.text)) at(node, `names a vendor API address (${node.text.slice(0, 40)})`);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

const all: Finding[] = [];
for (const file of serverFiles(SERVER)) all.push(...scan(file, fs.readFileSync(file, "utf8")));

describe("no server file reaches OpenAI or Anthropic's own API around the AWS-only guard", () => {
  it("only the guard and the provider layer hold an SDK client", () => {
    const outside = all.filter((f) => !(f.file in ALLOWED));
    expect(outside.map((f) => `${f.file}:${f.line} ${f.what}`)).toEqual([]);
  });

  it("every allowed file still has a reason to be on the list (a stale entry is removed, not kept)", () => {
    const present = new Set(all.map((f) => f.file));
    expect(Object.keys(ALLOWED).filter((f) => !present.has(f))).toEqual([]);
  });

  it("the scan itself sees what it claims to (a planted client is found; generated template text is not)", () => {
    const planted = scan(path.join(SERVER, "planted.ts"), `
      import OpenAI from "openai";
      import type { ClientOptions } from "openai";
      const a = new OpenAI({ apiKey: "x" });
      const b = new (await import("openai")).default({});
      const c = await import("@anthropic-ai/sdk");
      const d = "https://api.anthropic.com/v1/messages";
    `);
    expect(planted.map((f) => f.what)).toEqual([
      "imports openai as a value",
      "builds a OpenAI client",
      "builds a client from a dynamically loaded SDK",
      "loads openai at run time",
      "loads @anthropic-ai/sdk at run time",
      "names a vendor API address (https://api.anthropic.com/v1/messages)",
    ]);
    const generated = scan(path.join(SERVER, "generated.ts"), "const template = `import OpenAI from \"openai\";\\nconst client = new OpenAI();`;");
    expect(generated).toEqual([]);
  });
});
