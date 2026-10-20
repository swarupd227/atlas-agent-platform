# Hilti MarCom AWS Monorepo Migration Design

## Goal

Prevent provider display labels from reaching an LLM API as model identifiers, then copy the validated Azure Hilti Campaign Planning Orchestrator into the AWS Production monorepo without changing unrelated Hilti teams.

## Runtime correction

Canonicalize the model at the shared provider boundary. Known picker labels resolve through the central provider catalogs. Future Claude labels use a family/version rule, while canonical and unknown self-hosted identifiers pass through unchanged. The selected provider still owns routing and fallback behavior.

## Migration boundary

The migration is explicit, dry-run by default, and restricted to the source team named `Hilti Campaign Planning Orchestrator`. It reconciles resources by normalized natural keys, reports conflicts instead of overwriting ambiguous matches, and writes to the target only through authenticated HTTP APIs. Source database access is read-only and supplies content that list APIs intentionally omit.

The executable graph is read from the validated Azure blueprint and checked against configurable expected counts before any target write. The current approved graph contains nine workers, one human edge gate, and ten edges. Existing AWS campaign teams are outside scope.

## Safety and verification

- Require source and target URLs/credentials through environment variables.
- Require an explicit AWS Production confirmation before writes.
- Reuse exact-name skills, policies, and knowledge bases; refuse ambiguous normalized-name matches.
- Canonicalize all migrated model identifiers and trim tool names.
- Re-read the target and verify node/edge counts, bindings, source counts, model identifiers, and provider ownership.
- Never print credentials, cookies, document bodies, or database connection strings.
