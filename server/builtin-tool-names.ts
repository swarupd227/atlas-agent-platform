/**
 * Every tool name the platform dispatches in-process, in one place.
 *
 * WHY THIS FILE EXISTS. There was no such list, and its absence is most of why
 * "does this tool name mean anything?" was hard to answer. The names live in
 * seven modules beside the schemas and handlers that use them, which is the
 * right place for them -- but nothing joined them up, so anybody asking the
 * question had to rediscover the set by grep. Measuring `toolsConfig` across
 * 451 agents on 2026-10-18, I assembled it by hand and got 12 of the 13: I
 * missed `web_search`, and so reported two agents as declaring an invented tool
 * when they were declaring a real one. This file is the fix for that class of
 * mistake, not a convenience.
 *
 * It is NOT a grant. A built-in is offered to an agent only when something
 * grants it -- a skill naming `loss_forecast` or a document tool, memory being
 * enabled, an attachment being present. Membership here answers "is this a real
 * tool name", which is a different question from "can this agent call it", and
 * the two must not be conflated: the first is what makes a declared name
 * repairable rather than invented.
 */
import { MEMORY_TOOL } from "./agent-memory";
import { SEARCH_ATTACHMENT_TOOL, READ_ATTACHMENT_SECTION_TOOL } from "./attachment-tool-defs";
import { LOSS_FORECAST_TOOL } from "./builtin-calculation-tools";
import {
  GENERATE_PPTX_TOOL,
  GENERATE_PDF_TOOL,
  FILL_TEMPLATE_TOOL,
  INSPECT_DOCUMENT_TOOL,
  READ_DOCUMENT_TOOL,
} from "./builtin-document-tools";
import { READ_SKILL_TOOL } from "./builtin-skill-tools";
import { PROPOSE_ONTOLOGY_TOOL } from "./ontology-proposal-constants";
import { PROPOSE_SKILL_TOOL } from "./skill-proposal-constants";
import { WEB_SEARCH_TOOL } from "./native-tools";

/**
 * Imported rather than spelled out, so adding a built-in tool adds it here too.
 * A literal copy of a name is how this list goes stale without anybody noticing.
 */
export const BUILTIN_TOOL_NAMES: readonly string[] = [
  MEMORY_TOOL,
  SEARCH_ATTACHMENT_TOOL,
  READ_ATTACHMENT_SECTION_TOOL,
  LOSS_FORECAST_TOOL,
  GENERATE_PPTX_TOOL,
  GENERATE_PDF_TOOL,
  FILL_TEMPLATE_TOOL,
  INSPECT_DOCUMENT_TOOL,
  READ_DOCUMENT_TOOL,
  READ_SKILL_TOOL,
  PROPOSE_ONTOLOGY_TOOL,
  PROPOSE_SKILL_TOOL,
  WEB_SEARCH_TOOL,
];

/** Is this a real platform tool name, whoever is or is not granted it? */
export function isBuiltinToolName(name: string): boolean {
  const want = name.trim().toLowerCase();
  return BUILTIN_TOOL_NAMES.some((n) => n.toLowerCase() === want);
}
