/**
 * The Ontology & Graph pack.
 *
 * The ontology was already doing real work in Cowork and was invisible in it:
 * it named the concepts a plan matched, tagged every agent a build created,
 * chose the regulations an eval suite probes, and blocked production on tool
 * alignment -- while Astra could not read a concept, say how much of the
 * vocabulary was used, or explain a refusal. The planned "Ontology & Graph"
 * pack was the one of five never built.
 *
 * Three honesty properties are what this file exists to pin, because each is a
 * figure that reads as more than it is:
 * - a tool with NO recorded parameter matches scores 0, so "below 50%" can mean
 *   "nobody ran parameter matching", which is a different problem;
 * - an agent with no blueprint passes the production gate because nothing is
 *   examined, which is not alignment;
 * - a term "resembling" a concept is string similarity, never meaning.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { runTurn, type EngineDeps } from "../server/astra/engine";
import { ToolRegistry } from "../server/astra/registry";
import { MemoryThreadStore } from "../server/astra/memory-store";
import { scriptedComplete, result, call } from "../server/astra/scripted-brain";
import { finishTurnTool } from "../server/astra/tools/finish-turn";
import { loadToolsTool } from "../server/astra/tools/load-tools";
import { ONTOLOGY_TOOLS } from "../server/astra/tools/ontology";
import { PACKS } from "../server/astra/packs";
import { checkVocabulary, phrasesIn } from "../shared/ontology-vocabulary";
import { hasPermission, type RoleId } from "../server/permissions";
import type { AstraContext } from "../server/astra/types";

const ORG = "org-a";
const as = (role: RoleId, industryId: string | null = "insurance"): AstraContext => ({ orgId: ORG, userId: "u1", role, industryId });
const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");

const concepts = [
  { id: "c1", label: "Insurance Claim", category: "entity", description: "A request for payment under a policy.", synonyms: ["claim"], tags: ["core"], subVerticals: ["Property & Casualty"], source: "industry-standard", ontologyName: "FIBO", regulations: 2, relationships: 1 },
  { id: "c2", label: "Subrogation", category: "process", description: "Recovering from a third party.", synonyms: [], tags: [], subVerticals: [], source: "custom-extension", ontologyName: "FIBO", regulations: 0, relationships: 0 },
];

interface Options {
  /** What assessToolAlignment came back with. */
  alignment?: Partial<{ hasBlueprint: boolean; serversLinked: number; examined: any[]; low: any[]; unmatchedBecauseNothingRecorded: any[] }>;
  conceptAgents?: any[];
  coverage?: Partial<{ totalConcepts: number; usedCount: number; unusedCount: number; unused: any[]; agentsTagged: number; agentsTotal: number }>;
  vocabulary?: { conceptsChecked: number; mismatches: any[]; validTerms: any[]; totalTermsChecked: number };
  /** Tags that name a concept by label with no concept id -- the shape older paths wrote. */
  labelOnlyTags?: boolean;
}

function setup(steps: Parameters<typeof scriptedComplete>[0], opts: Options = {}) {
  const store = new MemoryThreadStore();
  const threadId = store.createThread(ORG);
  const align = {
    hasBlueprint: true,
    serversLinked: 1,
    examined: [
      { toolName: "get_claim", serverName: "Guidewire", score: 0.8, matched: 4, total: 5 },
      { toolName: "post_payment", serverName: "Guidewire", score: 0.25, matched: 1, total: 4 },
    ],
    low: [{ toolName: "post_payment", serverName: "Guidewire", score: 0.25, matched: 1, total: 4 }],
    unmatchedBecauseNothingRecorded: [],
    threshold: 0.5,
    ...(opts.alignment ?? {}),
  };
  const services = {
    findConcepts: vi.fn(async (industryId: string, query?: string) => ({
      total: concepts.length,
      matched: query ? 1 : concepts.length,
      concepts: query ? [concepts[0]] : concepts,
    })),
    conceptDetail: vi.fn(async (org: string, id: string) => {
      if (id !== "c1") throw new Error("No ontology concept with that id.");
      return {
        ...concepts[0],
        industryId: "insurance",
        version: 3,
        properties: [{ name: "claimNumber", type: "string", required: true }],
        relatedTo: [
          { type: "relates_to", targetId: "c2", targetLabel: "Subrogation", dangling: false },
          { type: "relates_to", targetId: "c9", targetLabel: null, dangling: true },
        ],
        regulations: [{ ref: "NAIC 1033", section: "b", description: "Claims handling" }],
        sensitivity: null,
        agents: opts.conceptAgents ?? [{ id: "a1", name: "Claims Intake", status: "active", needsRevalidation: true, revalidationReason: "Concept changed" }],
      };
    }),
    conceptCoverage: vi.fn(async () => ({
      industryId: "insurance",
      subVertical: null,
      totalConcepts: 40,
      usedCount: 6,
      unusedCount: 34,
      unused: [{ id: "c2", label: "Subrogation", category: "process", subVerticals: [] }],
      unusedShown: 1,
      bySubVertical: [{ subVertical: "Workers Compensation", total: 10, unused: 9 }],
      agentsTagged: 3,
      agentsTotal: 11,
      agentsWithLabelOnlyTags: 2,
      ...(opts.coverage ?? {}),
    })),
    agentAlignment: vi.fn(async (_org: string, agentId: string) => ({
      agent: { id: agentId, name: "Claims Intake", status: "active", industryId: "insurance" },
      concepts: opts.labelOnlyTags
        ? [
            { id: null, label: "Peer Benchmark", category: null, linkedToAConcept: false },
            { id: null, label: "Envelope Audit Trail", category: null, linkedToAConcept: false },
          ]
        : [{ id: "c1", label: "Insurance Claim", category: "entity", linkedToAConcept: true }],
      needsRevalidation: false,
      revalidationReason: null,
      ...align,
    })),
    vocabularyCheck: vi.fn(async () => opts.vocabulary ?? {
      conceptsChecked: 40,
      industryId: "insurance",
      mismatches: [{ term: "subrigation", suggestedTerm: "Subrogation", conceptId: "c2", category: "process", matchMethod: "fuzzy", confidence: 0.91 }],
      validTerms: [{ term: "insurance claim", conceptId: "c1", conceptLabel: "Insurance Claim", category: "entity" }],
      totalTermsChecked: 12,
    }),
    listAgents: vi.fn(async () => [{ id: "a1", name: "Claims Intake", organizationId: ORG }]),
  };
  const deps: EngineDeps = {
    store,
    registry: new ToolRegistry([finishTurnTool, loadToolsTool, ...ONTOLOGY_TOOLS], hasPermission),
    complete: scriptedComplete(steps),
    can: hasPermission,
    audit: vi.fn(async () => {}),
    services,
    model: "test",
  };
  return { store, threadId, deps, services, onEvent: () => {} };
}

const load = () => ({ toolCalls: [{ name: "load_tools", arguments: { pack: "ontology" } }] });
const use = (name: string, args: Record<string, unknown> = {}) => ({ toolCalls: [{ name, arguments: args }] });
const done = (text: string) => result(text, [call("finish_turn", { suggestions: [] })]);
const lastTool = (messages: any[]) => JSON.parse(messages.filter((m) => m.role === "tool").at(-1).content);

describe("the pack itself", () => {
  it("is loadable, and is the studio pack that was missing", () => {
    expect(PACKS.map((p) => p.id)).toContain("ontology");
    for (const tool of ONTOLOGY_TOOLS) {
      expect(tool.pack, tool.name).toBe("ontology");
      // Nothing here writes: concepts are reference data shared across an industry.
      expect(tool.confirm, tool.name).toBe(false);
      expect(tool.permission, tool.name).toBe("view_agents");
    }
  });

  it("isn't offered to a conversation that hasn't loaded it", () => {
    // Dispatch stays pack-agnostic on purpose, so a paused confirmation always
    // resumes; what a pack controls is which tools the model is offered.
    const registry = setup([]).deps.registry;
    const offered = (packs?: string[]) => registry.canonicalDefinitions("admin", packs).map((d) => d.name);
    expect(offered()).toEqual(["finish_turn", "load_tools"]);
    expect(offered(["ontology"])).toContain("ontology_coverage");
    expect(offered(["ontology"])).toContain("check_vocabulary");
  });
});

describe("reading the vocabulary", () => {
  it("searches the industry's concepts", async () => {
    const t = setup([
      load(),
      use("list_concepts", { query: "claim" }),
      (m) => {
        expect(lastTool(m).result).toMatchObject({ industryId: "insurance", total: 2, matched: 1 });
        expect(lastTool(m).result.concepts[0]).toMatchObject({ id: "c1", label: "Insurance Claim" });
        return done("One matches.");
      },
    ]);
    await runTurn(t.deps, as("admin"), t.threadId, "What do we call a claim?", t.onEvent);
    expect(t.services.findConcepts).toHaveBeenCalledWith("insurance", "claim", undefined);
  });

  it("says there is nothing to read when no industry is set", async () => {
    const t = setup([load(), use("list_concepts"), (m) => { expect(lastTool(m).error).toContain("No industry is set"); return done("No industry."); }]);
    await runTurn(t.deps, as("admin", null), t.threadId, "Show the ontology", t.onEvent);
    expect(t.services.findConcepts).not.toHaveBeenCalled();
  });

  it("gives one concept with what it links to, and this organization's agents that carry it", async () => {
    const t = setup([
      load(),
      use("get_concept", { concept: "c1" }),
      (m) => {
        const p = lastTool(m).result;
        expect(p).toMatchObject({ label: "Insurance Claim", agentCount: 1, danglingRelationships: 1 });
        expect(p.agents[0]).toMatchObject({ name: "Claims Intake", needsRevalidation: true });
        return done("Here it is.");
      },
    ]);
    await runTurn(t.deps, as("admin"), t.threadId, "What is an Insurance Claim here?", t.onEvent);
    const artifact = t.store.threadMessages(t.threadId).at(-1)!.artifacts[0];
    expect(artifact).toMatchObject({ kind: "concept", fullViewHref: "/ontology?concept=c1" });
  });

  it("refuses a concept id that isn't there", async () => {
    const t = setup([load(), use("get_concept", { concept: "nope" }), (m) => { expect(lastTool(m).error).toContain("No ontology concept"); return done("Not found."); }]);
    await runTurn(t.deps, as("admin"), t.threadId, "Show concept nope", t.onEvent);
  });
});

describe("coverage", () => {
  it("counts concepts against the organization's own agents, and says the two halves are scoped differently", async () => {
    const t = setup([
      load(),
      use("ontology_coverage"),
      (m) => {
        const p = lastTool(m).result;
        expect(p).toMatchObject({ totalConcepts: 40, usedCount: 6, unusedCount: 34, agentsTagged: 3, agentsTotal: 11 });
        expect(p.basis).toContain("industry's shared vocabulary");
        expect(p.agentsTaggedByLabelOnly).toBe(2);
        expect(p.mostUnusedSubVerticals[0]).toMatchObject({ subVertical: "Workers Compensation", unused: 9 });
        return done("Six of forty.");
      },
    ]);
    await runTurn(t.deps, as("admin"), t.threadId, "How much of the ontology do we use?", t.onEvent);
  });
});

describe("what the production gate is actually measuring", () => {
  it("names the tools that would block, with how many parameters matched", async () => {
    const t = setup([
      load(),
      use("agent_ontology_alignment", { agent: "Claims Intake" }),
      (m) => {
        const p = lastTool(m).result;
        expect(p).toMatchObject({ agent: "Claims Intake", toolsExamined: 2, productionGate: "would block" });
        expect(p.toolsBelowThreshold).toEqual([{ tool: "post_payment", connector: "Guidewire", matched: 1, parameters: 4, score: 0.25 }]);
        expect(p.concepts).toEqual(["Insurance Claim"]);
        return done("One tool blocks it.");
      },
    ]);
    await runTurn(t.deps, as("admin"), t.threadId, "Why can't Claims Intake go to production?", t.onEvent);
  });

  it("distinguishes 'these parameters don't align' from 'nobody ran parameter matching'", async () => {
    const unrecorded = { toolName: "post_payment", serverName: "Guidewire", score: 0, matched: 0, total: 0 };
    const t = setup([
      load(),
      use("agent_ontology_alignment", { agent: "Claims Intake" }),
      (m) => {
        expect(lastTool(m).result.noParameterMatchingRecorded).toContain("no parameter matches recorded at all");
        expect(lastTool(m).result.noParameterMatchingRecorded).toContain("counts as 0%");
        return done("Nothing was matched yet.");
      },
    ], { alignment: { examined: [unrecorded], low: [unrecorded], unmatchedBecauseNothingRecorded: [unrecorded] } });
    await runTurn(t.deps, as("admin"), t.threadId, "Why is it blocked?", t.onEvent);
  });

  it("doesn't call an agent with no blueprint aligned, even though the gate passes it", async () => {
    const t = setup([
      load(),
      use("agent_ontology_alignment", { agent: "Claims Intake" }),
      (m) => {
        const p = lastTool(m).result;
        expect(p.productionGate).toBe("examines nothing");
        expect(p.note).toContain("That is not a measure of alignment");
        return done("Nothing is checked.");
      },
    ], { alignment: { hasBlueprint: false, serversLinked: 0, examined: [], low: [], unmatchedBecauseNothingRecorded: [] } });
    await runTurn(t.deps, as("admin"), t.threadId, "Is it aligned?", t.onEvent);
  });

  it("doesn't call a label-only tag a concept, because nothing can match it", async () => {
    // Live, an agent carrying three tags of the shape {label} was reported as
    // carrying no concepts at all: only a conceptId can be matched to the
    // ontology, but "none" was the wrong way to say that.
    const t = setup([
      load(),
      use("agent_ontology_alignment", { agent: "Claims Intake" }),
      (m) => {
        const p = lastTool(m).result;
        expect(p.concepts).toEqual(["Peer Benchmark", "Envelope Audit Trail"]);
        expect(p.taggedByLabelOnly).toContain("no concept id");
        return done("Tagged, but not to the ontology.");
      },
    ], { labelOnlyTags: true });
    await runTurn(t.deps, as("admin"), t.threadId, "Is it aligned?", t.onEvent);
    const message = t.store.threadMessages(t.threadId).at(-1)!;
    expect((message.proof as any)?.industry).toMatchObject({ status: "not_measured" });
  });

  it("refuses an agent that isn't this organization's", async () => {
    const t = setup([load(), use("agent_ontology_alignment", { agent: "Someone Else" }), (m) => { expect(lastTool(m).error).toContain('No agent named "Someone Else"'); return done("Not here."); }]);
    await runTurn(t.deps, as("admin"), t.threadId, "Check it", t.onEvent);
    expect(t.services.agentAlignment).not.toHaveBeenCalled();
  });
});

describe("checking text against the vocabulary", () => {
  it("separates what is in the vocabulary from what only looks like it, and says which is which", async () => {
    const t = setup([
      load(),
      use("check_vocabulary", { text: "Log the subrigation on the insurance claim." }),
      (m) => {
        const p = lastTool(m).result;
        expect(p.recognised).toEqual(["Insurance Claim"]);
        expect(p.lookAlikes).toEqual([{ wrote: "subrigation", resembles: "Subrogation", similarity: 0.91 }]);
        expect(p.basis).toContain("not a judgement about meaning");
        return done("One near-miss.");
      },
    ]);
    await runTurn(t.deps, as("admin"), t.threadId, "Check this wording", t.onEvent);
    // The suggestions are a heuristic, so the proof strip must not call them measured.
    const message = t.store.threadMessages(t.threadId).at(-1)!;
    expect((message.proof as any)?.context).toMatchObject({ status: "not_measured" });
  });

  it("says so rather than passing text when the industry has no vocabulary yet", async () => {
    const t = setup([load(), use("check_vocabulary", { text: "anything at all" }), (m) => { expect(lastTool(m).error).toContain("no vocabulary for insurance yet"); return done("Nothing to check against."); }],
      { vocabulary: { conceptsChecked: 0, mismatches: [], validTerms: [], totalTermsChecked: 0 } });
    await runTurn(t.deps, as("admin"), t.threadId, "Check this", t.onEvent);
  });
});

describe("what the conversation shows for each step", () => {
  // Live, every one of these steps rendered as the tool name and nothing else,
  // because the engine builds a step's label from `message` (or a `total`,
  // which for list_concepts was the whole vocabulary rather than the matches).
  const labels = (events: any[]) => events.filter((e) => e.type === "tool_result").map((e) => e.preview);

  it("labels each step with the figure the step is about", async () => {
    const seen: any[] = [];
    const t = setup([load(), use("list_concepts", { query: "claim" }), use("ontology_coverage"), use("agent_ontology_alignment", { agent: "Claims Intake" }), use("check_vocabulary", { text: "Log the subrigation." }), done("Done.")]);
    await runTurn(t.deps, as("admin"), t.threadId, "Look at our ontology", (e) => seen.push(e));
    expect(labels(seen)).toEqual([
      "Ontology & Graph tools loaded",
      '1 of 2 concepts match "claim"',
      "6 of 40 concepts are carried by an agent",
      "1 of 2 tools below the production threshold",
      "1 concept recognised · 1 look-alike",
    ]);
  });

  it("shows a refusal as a failed step, not a silent success", async () => {
    const seen: any[] = [];
    const t = setup([load(), use("get_concept", { concept: "guessed-id" }), done("Not found.")]);
    await runTurn(t.deps, as("admin"), t.threadId, "Show concept guessed-id", (e) => seen.push(e));
    const step = seen.filter((e) => e.type === "tool_result").at(-1);
    expect(step).toMatchObject({ tool: "get_concept", ok: false });
    expect(step.preview).toContain("No ontology concept with that id");
  });
});

describe("the matching itself", () => {
  const vocab = [
    { id: "c1", label: "Insurance Claim", category: "entity", synonyms: ["claim"], tags: [] },
    { id: "c2", label: "Subrogation", category: "process", synonyms: [], tags: [] },
  ];

  it("matches a label or a synonym exactly", () => {
    const r = checkVocabulary(vocab, "The insurance claim was filed.");
    expect(r.validTerms.map((v) => v.conceptLabel)).toContain("Insurance Claim");
    expect(checkVocabulary(vocab, "the claim").validTerms[0].conceptLabel).toBe("Insurance Claim");
  });

  it("offers a near-miss as a suggestion, with its similarity", () => {
    const r = checkVocabulary(vocab, "Start the subrigation process now.");
    expect(r.mismatches[0]).toMatchObject({ suggestedTerm: "Subrogation", matchMethod: "fuzzy" });
    expect(r.mismatches[0].confidence).toBeGreaterThan(0.6);
    expect(r.mismatches[0].confidence).toBeLessThan(1);
  });

  it("says nothing about a word that resembles nothing", () => {
    const r = checkVocabulary(vocab, "The quarterly offsite agenda.");
    expect(r.mismatches.map((m) => m.suggestedTerm)).not.toContain("Subrogation");
  });

  it("checks nothing against an empty vocabulary", () => {
    expect(checkVocabulary([], "insurance claim")).toEqual({ mismatches: [], validTerms: [], totalTermsChecked: 0 });
  });

  it("checks words, pairs and triples, and drops the filler", () => {
    const phrases = phrasesIn("Pay the insurance claim today");
    expect(phrases).toContain("insurance claim");
    expect(phrases).toContain("the insurance claim");
    // "the" is a stop word on its own, but still forms the phrases around it.
    expect(phrases).not.toContain("the");
  });
});

describe("one computation, both callers", () => {
  it("has the production gates read the shared assessment rather than their own copy", () => {
    const actions = read("server", "deployment-actions.ts");
    expect(actions).toContain('import { assessToolAlignment } from "./ontology-alignment";');
    expect(actions.match(/assessToolAlignment\(/g)).toHaveLength(2);
    // The duplicated inline computation is gone from both gates.
    expect(actions).not.toContain("const toolMatches = matches.filter(m => m.toolName === tool.name);");
  });

  it("has the coverage page and the tool count the same way, and the text check match the same way", () => {
    const skills = read("server", "routes", "skills.ts");
    expect(skills).toContain('import { ontologyCoverage } from "../ontology-coverage";');
    expect(skills).toContain('import { checkVocabulary } from "@shared/ontology-vocabulary";');
    expect(skills).not.toContain("const levenshtein = function");
  });

  it("gives a concept in Cowork somewhere to open, which the page now honours", () => {
    const page = read("client", "src", "pages", "ontology.tsx");
    expect(page).toContain('new URLSearchParams(window.location.search).get("concept")');
    expect(page).toContain("useState<string | null>(conceptFromUrl)");
  });

  it("renders its cards instead of dumping JSON, including plain text ones", () => {
    const pane = read("client", "src", "astra", "artifact-pane.tsx");
    for (const kind of ["concepts: Concepts", "concept: Concept", "ontologyCoverage: OntologyCoverage", "ontologyAlignment: OntologyAlignment", "vocabularyCheck: VocabularyCheck", "text: TextCard"]) {
      expect(pane).toContain(kind);
    }
  });
});
