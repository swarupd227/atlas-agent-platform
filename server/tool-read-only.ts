// Whether a tool name says it only reads. Kept apart from tool-dispatcher so it can be tested
// without loading the dispatcher's storage and runtime imports.

const READ_ONLY_NAME_PREFIXES = ["get_", "list_", "search_", "read_", "query_", "fetch_", "describe_", "check_", "lookup_", "view_", "classify_"];

// Connector tools are usually named "<connector>_<verb>_<thing>" (graph_read_document,
// salesforce_query_leads). The verb after that one-word connector prefix decides read versus write.
// The prefix word must not itself be a write verb, or "send_get_receipt" would look like a read.
const CONNECTOR_READ_VERB = /^(?!(?:send|post|create|update|delete|remove|revoke|set|write|add|put|patch|run|execute|start|stop|approve|submit|upload|move|copy|share|invite)_)[a-z0-9]+_(?:get|list|search|read|query|fetch|describe|check|lookup|view|classify)_/;

export function hasReadOnlyToolName(toolName: string): boolean {
  const name = toolName.toLowerCase();
  return READ_ONLY_NAME_PREFIXES.some(p => name.startsWith(p)) || CONNECTOR_READ_VERB.test(name);
}
