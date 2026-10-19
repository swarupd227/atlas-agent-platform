/**
 * Names and index expressions for history search, in a module with no imports so the tool
 * dispatcher and the startup migration (server/db.ts) can read them without loading the
 * database layer (server/history-search.ts).
 */

/** Platform setting. Off unless "on"; a failed read is off. */
export const HISTORY_SEARCH_SETTING = "AGENT_HISTORY_SEARCH";
export const SEARCH_HISTORY_TOOL = "search_history";
export const BUILTIN_HISTORY_SERVER_ID = "builtin:history";

/** The full-text configuration. "simple" keeps identifiers, codes and every language intact; it does no stemming. */
export const FTS_CONFIG = "simple";

/**
 * Characters of a text that are indexed and searched. A tsvector may not exceed 1 MB, and an index
 * over an unbounded text would make the INSERT of one very large output fail.
 */
export const INDEXED_CHARS = 100_000;

/**
 * The expressions the indexes are built on (server/db.ts) and the queries match against. Column
 * names are unqualified; a query adds its table or alias, which is the same expression to the
 * planner. A query using any other expression cannot use the index.
 */
export const RUN_OUTPUT_TSV_EXPR = `to_tsvector('${FTS_CONFIG}', left(coalesce(output_summary, ''), ${INDEXED_CHARS}))`;
export const RUN_INPUT_TSV_EXPR = `to_tsvector('${FTS_CONFIG}', left(coalesce(input_summary, ''), ${INDEXED_CHARS}))`;
export const MESSAGE_TSV_EXPR = `to_tsvector('${FTS_CONFIG}', left(coalesce(markdown, ''), ${INDEXED_CHARS}))`;

/** One of the expressions above with its column qualified by a table or alias (the same expression to the planner). */
export const qualifyTsv = (expr: string, alias: string): string => expr.replace(/\b(output_summary|input_summary|markdown)\b/, `${alias}.$1`);
