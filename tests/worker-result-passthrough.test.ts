/**
 * What the worker produced has to survive the trip to the code that reads it.
 *
 * The engine does not call executeWorkerAgent directly. It goes through
 * invokeAgentWithTimeout, which rebuilds the result FIELD BY FIELD -- so a
 * field the worker returns and the caller reads is dropped in between unless
 * someone remembered to add it in two places.
 *
 * Live 2026-09-25, for four runs: executeWorkerAgent returned verifiedFacts
 * (a connector's answer kept verbatim), verifiedFactsNote (why nothing was
 * captured) and writtenFields (the figures the step asserted).
 * executeWorkerNode read all three. Every one died in the rebuild. The result
 * was a run that looked healthy, a "_verified" key on every step saying "the
 * runtime reported nothing about connector calls", and a transcription-drift
 * check silently comparing every figure against an empty set -- the exact
 * check meant to catch a step writing $8,947,000 where its connector had said
 * $18,500,000.
 *
 * TypeScript reported it the entire time ("Property 'verifiedFacts' does not
 * exist on type ..."), and it read as a stale declaration rather than a
 * missing value. So this is asserted as behaviour, not as a type.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const engine = readFileSync(join(__dirname, "..", "server", "dag-execution-engine.ts"), "utf8").replace(/\r\n/g, "\n");
const runtime = readFileSync(join(__dirname, "..", "server", "agent-runtime.ts"), "utf8").replace(/\r\n/g, "\n");

/** The body of invokeAgentWithTimeout, where the rebuild happens. */
function invokeAgentWithTimeoutSource(): string {
  const start = engine.indexOf("private async invokeAgentWithTimeout(");
  expect(start, "invokeAgentWithTimeout not found -- was it renamed?").toBeGreaterThan(-1);
  const end = engine.indexOf("export interface RunTeamAgentDagOptions", start);
  return engine.slice(start, end > start ? end : start + 8000);
}

describe("the fields a worker returns reach the engine", () => {
  const CARRIED = ["verifiedFacts", "verifiedFactsNote", "writtenFields", "softPolicyViolations"];

  it("returns each one from executeWorkerAgent in the first place", () => {
    // If this fails the feature is broken at the source, not in transit.
    const start = runtime.indexOf("export async function executeWorkerAgent(");
    expect(start).toBeGreaterThan(-1);
    const body = runtime.slice(start, runtime.indexOf("export async function executeTeamPipeline", start));
    for (const field of CARRIED) expect(body, `${field} is not returned by executeWorkerAgent`).toContain(`${field}`);
  });

  it("carries each one through the rebuild instead of dropping it", () => {
    const body = invokeAgentWithTimeoutSource();
    for (const field of CARRIED) {
      expect(body, `${field} is dropped by invokeAgentWithTimeout`).toMatch(
        new RegExp(`${field}:\\s*\\(result as any\\)\\.${field}`),
      );
    }
  });

  it("declares each one on the return type, which is what made the loss silent", () => {
    const body = invokeAgentWithTimeoutSource();
    // The one line declaring the return type, not the body after it.
    const signature = body.split("\n").find((l) => l.includes("): Promise<")) ?? "";
    expect(signature, "no return-type line found").toContain("Promise<");
    for (const field of CARRIED) expect(signature, `${field} missing from the declared return type`).toContain(`${field}?:`);
  });

  it("passes the note through even when there is nothing to report", () => {
    // "nothing captured, and here is why" is the whole point of the note: a
    // conditional spread would drop exactly the case it exists for, leaving
    // the engine's own fallback to claim the runtime said nothing.
    const body = invokeAgentWithTimeoutSource();
    expect(body).toContain("verifiedFactsNote: (result as any).verifiedFactsNote,");
    expect(body).not.toMatch(/\.\.\.\([^)]*verifiedFactsNote[^)]*\?\s*\{/);
  });

  // The list above is hand-maintained, and that is exactly how this happened a
  // second time: retrievedSources was added to the return TYPE and to the worker,
  // read for by executeWorkerNode, and never assigned in the rebuild. The four
  // fields named above were all present, so this file stayed green while every
  // agent step with a linked knowledge base lost its retrieval provenance -- and
  // with it the duplicated-retrieval check, which had no second step to compare
  // and a run-monitor card that could never render. These two check the rule
  // itself instead of a list of its past victims.

  /** Field names at the TOP level of a type literal, ignoring nested ones. */
  function topLevelFields(typeLiteral: string): string[] {
    const names: string[] = [];
    let depth = 0;
    let current = "";
    for (const ch of typeLiteral) {
      if (ch === "{" || ch === "<" || ch === "(" || ch === "[") depth++;
      else if (ch === "}" || ch === ">" || ch === ")" || ch === "]") depth--;
      if (ch === ";" && depth === 0) {
        names.push(current);
        current = "";
        continue;
      }
      current += ch;
    }
    names.push(current);
    return names.map((part) => part.match(/^\s*(\w+)\??\s*:/)?.[1]).filter((n): n is string => !!n);
  }

  /** The object the success path returns, which is where the rebuild happens. */
  function rebuiltResult(): string {
    const race = engine.indexOf("await Promise.race([workerPromise, timeoutPromise])");
    expect(race, "the success path should await the race").toBeGreaterThan(-1);
    const start = engine.indexOf("return {", race);
    const end = engine.indexOf("\n      };", start);
    expect(end).toBeGreaterThan(start);
    return engine.slice(start, end);
  }

  it("assigns EVERY field its return type declares, not just the remembered ones", () => {
    const signature = invokeAgentWithTimeoutSource().split("\n").find((l) => l.includes("): Promise<")) ?? "";
    const literal = signature.slice(signature.indexOf("Promise<{") + "Promise<{".length, signature.lastIndexOf("}>"));
    const declared = topLevelFields(literal);

    // Guard the guard: an empty parse would make the assertion below pass
    // vacuously, which is the same shape of failure as the bug it looks for.
    expect(declared.length, "parsed no fields off the return type").toBeGreaterThan(10);
    for (const field of CARRIED) expect(declared).toContain(field);
    expect(declared).toContain("retrievedSources");

    const body = rebuiltResult();
    const dropped = declared.filter((name) => !new RegExp(`\\b${name}\\s*:`).test(body));
    expect(dropped, `declared on the contract but never assigned in the rebuild: ${dropped.join(", ")}`).toEqual([]);
  });

  it("keeps a step's retrieved passages even when it found none", () => {
    const line = rebuiltResult().split("\n").find((l) => /\bretrievedSources\s*:/.test(l));
    expect(line, "retrievedSources is dropped by invokeAgentWithTimeout").toBeTruthy();

    // An empty array records "this step searched and found nothing", which
    // executeWorkerNode writes as a real _sources key; only an ABSENT key means
    // it never searched. A .length guard here would conflate the two again.
    expect(line).not.toMatch(/retrievedSources\.length|retrievedSources\s*&&/);
    expect(line).toMatch(/Array\.isArray\(/);
    expect(engine, "executeWorkerNode no longer reads retrievedSources").toContain("workerResult.retrievedSources");
  });

  it("still reads them on the other side, under the same names", () => {
    // Both halves, so a rename on either side fails here rather than in a run.
    for (const field of CARRIED) {
      expect(engine, `executeWorkerNode no longer reads ${field}`).toContain(`workerResult.${field}`);
    }
  });
});
