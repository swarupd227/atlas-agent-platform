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
import { LOSS_FORECAST_TOOL, FINANCIAL_ANALYSIS_TOOL } from "./builtin-calculation-tools";
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
 * Imported rather than spelled out, so a renamed built-in cannot leave a stale
 * literal behind.
 *
 * THAT IS NOT ENOUGH ON ITS OWN, and this list proved it within hours of being
 * written. Importing each module's constant stops COPYING drift; it does nothing
 * about OMISSION drift, which is the failure that actually happens. `c573b7d4`
 * added `FINANCIAL_ANALYSIS_TOOL` to builtin-calculation-tools.ts and did not add
 * it here, so server/ held 14 `export const *_TOOL` constants against 13 listed
 * and a declared `financial_analysis` read as invented -- the same mistake as the
 * `web_search` omission this file was created to fix.
 *
 * So the list is now held by a ratchet, not by diligence:
 * tests/team-bindings.test.ts walks server/ for every `export const *_TOOL` and
 * fails naming any that is missing from here. Adding a built-in means adding it
 * here, and the suite says so rather than a later census discovering it.
 */
export const BUILTIN_TOOL_NAMES: readonly string[] = [
  MEMORY_TOOL,
  SEARCH_ATTACHMENT_TOOL,
  READ_ATTACHMENT_SECTION_TOOL,
  LOSS_FORECAST_TOOL,
  FINANCIAL_ANALYSIS_TOOL,
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
