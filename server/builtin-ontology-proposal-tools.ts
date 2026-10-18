/**
 * The propose_ontology_concept tool: how an agent PROPOSES a concept for its
 * organization's ontology, or a change to one its organization added.
 *
 * Offered only when the platform flag is on and the agent has opted in (see
 * isOntologyProposalEnabled). It files a request that a person must approve, so it
 * changes nothing any run or screen reads until someone has decided; like the memory
 * and skill-proposal tools it is therefore exempt from the allow-lists that predate it
 * (an agent with a tool allow-list would otherwise silently lose it) but NOT from shadow
 * runs: a shadow run must not file requests. An explicit policy or AAR block naming the
 * tool still refuses it.
 *
 * Dispatched in-process by executeTool, after every gate in dispatchToolCall.
 */

import type { AvailableTool } from "./tool-dispatcher";
import { PREDICATES } from "@shared/ontology-relationships";
import { BUILTIN_ONTOLOGY_PROPOSAL_SERVER_ID, ONTOLOGY_PROPOSAL_LIMITS, PROPERTY_TYPES, PROPOSE_ONTOLOGY_TOOL, proposeOntologyConcept, type ConceptDraft, type ConceptProperty } from "./agent-ontology-proposals";

export { BUILTIN_ONTOLOGY_PROPOSAL_SERVER_ID, PROPOSE_ONTOLOGY_TOOL };

const SERVER_NAME = "Ontology proposals";

export function ontologyProposalToolsFor(): AvailableTool[] {
  const L = ONTOLOGY_PROPOSAL_LIMITS;
  return [
    {
      serverId: BUILTIN_ONTOLOGY_PROPOSAL_SERVER_ID,
      serverName: SERVER_NAME,
      serverUrl: "",
      toolName: PROPOSE_ONTOLOGY_TOOL,
      toolDescription:
        "Propose a concept for your organization's ontology, or a change to a concept your organization added, when the work shows the vocabulary is missing a term or defines one badly. " +
        "A person must approve it before it exists, so never rely on a proposal in the run that makes it. " +
        "The concept is added to YOUR organization's ontology only; you cannot change a platform concept. " +
        "A name or synonym that an existing concept already has is refused (the refusal names that concept: use it instead). " +
        "Relationship targets must be existing concepts, named exactly. " +
        `Relationship predicates: ${Array.from(PREDICATES.keys()).join(", ")}. ` +
        "Do not include secrets, personal data, links, instructions, or details of one case. " +
        "To revise, give the concept's id and only the fields to change; the label cannot change.",
      toolInputSchema: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["create", "revise"], description: "create a new concept, or revise one your organization added." },
          label: { type: "string", description: `The concept's name (create only), ${L.minLabelChars}-${L.maxLabelChars} characters.` },
          concept_id: { type: "string", description: "The id of the concept to revise (revise only)." },
          category: { type: "string", description: `What kind of thing it is, at most ${L.maxCategoryChars} characters.` },
          description: { type: "string", description: `A definition, ${L.minDescriptionChars}-${L.maxDescriptionChars} characters.` },
          properties: {
            type: "array",
            description: `At most ${L.maxProperties}. Replaces the concept's properties on a revision.`,
            items: { type: "object", properties: { name: { type: "string" }, type: { type: "string", enum: [...PROPERTY_TYPES] }, description: { type: "string" } }, required: ["name", "type"] },
          },
          relationships: {
            type: "array",
            description: `At most ${L.maxRelationships}. Replaces the concept's relationships on a revision.`,
            items: { type: "object", properties: { predicate: { type: "string" }, target: { type: "string", description: "An existing concept, named exactly." }, label: { type: "string" }, cardinality: { type: "string", enum: ["one", "many"] } }, required: ["predicate", "target"] },
          },
          synonyms: { type: "array", items: { type: "string" }, description: `Other names for it, at most ${L.maxSynonyms}.` },
          tags: { type: "array", items: { type: "string" }, description: `At most ${L.maxTags}.` },
          reason: { type: "string", description: "Why the ontology needs this, in a sentence. The reviewer reads it." },
        },
        required: ["action"],
      },
    },
  ];
}

export function isBuiltinOntologyProposalTool(tool: Pick<AvailableTool, "serverId">): boolean {
  return tool.serverId === BUILTIN_ONTOLOGY_PROPOSAL_SERVER_ID;
}

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const strList = (v: unknown): string[] | undefined => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : undefined);

/** Reads the model's arguments into a draft. Anything that is not the asked-for shape is dropped, not repaired. */
export function draftFromArgs(args: Record<string, any>): ConceptDraft {
  const props = Array.isArray(args?.properties)
    ? (args.properties as any[]).filter((p) => p && typeof p.name === "string" && typeof p.type === "string").map((p): ConceptProperty => ({ name: p.name, type: p.type, ...(typeof p.description === "string" ? { description: p.description } : {}) }))
    : undefined;
  const rels = Array.isArray(args?.relationships)
    ? (args.relationships as any[]).filter((r) => r && typeof r.predicate === "string" && typeof r.target === "string").map((r) => ({ predicate: r.predicate as string, target: r.target as string, ...(typeof r.label === "string" ? { label: r.label } : {}), ...(r.cardinality === "one" || r.cardinality === "many" ? { cardinality: r.cardinality as "one" | "many" } : {}) }))
    : undefined;
  return {
    ...(str(args?.label) !== undefined ? { label: str(args.label) } : {}),
    ...(str(args?.category) !== undefined ? { category: str(args.category) } : {}),
    ...(str(args?.description) !== undefined ? { description: str(args.description) } : {}),
    ...(props !== undefined ? { properties: props } : {}),
    ...(rels !== undefined ? { relationships: rels } : {}),
    ...(strList(args?.synonyms) !== undefined ? { synonyms: strList(args.synonyms) } : {}),
    ...(strList(args?.tags) !== undefined ? { tags: strList(args.tags) } : {}),
  };
}

/** Returns a result rather than throwing: the model reads it and can fix its request. */
export async function executeBuiltinOntologyProposalTool(
  toolName: string,
  args: Record<string, any>,
  ctx: { orgId?: string | null; agentId?: string; runId?: string | null },
): Promise<any> {
  if (toolName !== PROPOSE_ONTOLOGY_TOOL) throw new Error(`Unknown ontology proposal tool "${toolName}"`);
  if (!ctx.agentId) return { ok: false, error: "No agent context to propose a concept for." };
  return proposeOntologyConcept({
    orgId: ctx.orgId,
    agentId: ctx.agentId,
    action: String(args?.action ?? "") as any,
    conceptId: str(args?.concept_id),
    draft: draftFromArgs(args),
    reason: str(args?.reason),
    runId: ctx.runId ?? null,
  });
}
