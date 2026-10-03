// File-backed secrets (Initiative 2 P2 — self-host).
//
// Supports the `<VAR>_FILE` convention used by Docker secrets, Kubernetes
// Secret volume mounts, and Vault-agent/CSI-driver sidecars: instead of
// passing a secret as a plain env var, the orchestrator mounts it to a file
// and points the app at the path via `<VAR>_FILE`. This keeps the actual
// value out of `docker inspect`, process-list env dumps, and k8s Pod specs —
// which matters for a self-hosted/BYOC deployment where the operator's own
// secret manager, not this app, should be the source of truth.
//
// Backward compatible: if the direct env var is already set, it wins and the
// `_FILE` variant is ignored. A deployment that only ever used plain env vars
// (e.g. the existing docker-compose.yml, or Azure App Settings) is unaffected.
//
// Pure core (testable without touching real process.env or the filesystem) +
// a thin production loader below. The loader MUST run before any other module
// is evaluated: several modules read these vars at module-load time to build
// long-lived objects (server/db.ts's Pool, server/embeddings.ts's OpenAI
// client, server/agent-runtime.ts's OpenAI client) — a value set on
// process.env after that point would never reach them. So this module is
// imported first, as a side-effecting import, at the very top of
// server/index.ts, before even `express`.

/** Every var this app will resolve from a `<name>_FILE` path when the direct
 *  var is unset. Extend when a new credential-bearing env var is introduced. */
export const FILE_BACKED_SECRET_VARS = [
  "DATABASE_URL",
  "JWT_SECRET",
  "INTEGRATION_VAULT_KEY",
  "BOOTSTRAP_ADMIN_PASSWORD",
  "ANTHROPIC_API_KEY",
  "AI_INTEGRATIONS_ANTHROPIC_API_KEY",
  "AI_INTEGRATIONS_OPENAI_API_KEY",
  "OPENAI_API_KEY",
  "GITHUB_TOKEN",
  "GH_TOKEN",
  "SLACK_BOT_TOKEN",
  "SLACK_SIGNING_SECRET",
  "AUDIT_SIGNING_PRIVATE_KEY",
  "ASTRA_API_KEY",
  "ASTRA_PUBLIC_API_KEY",
  "ATLAS_INGEST_TOKEN",
  "MICROSOFT_APP_PASSWORD",
  "RESEND_API_KEY",
] as const;

export interface SecretFileResolution {
  /** Names successfully resolved from their `_FILE` path. */
  applied: string[];
  /** "<name>_FILE=<path>: <reason>" for each `_FILE` var that was set but unreadable. */
  errors: string[];
}

/**
 * For each name: if `env[name]` is already set (non-empty), leave it alone.
 * Otherwise, if `env[\`${name}_FILE\`]` is set, read that file (via the
 * injected `readFile`) and assign its trimmed contents to `env[name]`.
 * Mutates `env` in place so callers can pass `process.env` directly.
 */
export function resolveFileBackedSecrets(
  env: Record<string, string | undefined>,
  names: readonly string[],
  readFile: (path: string) => string,
): SecretFileResolution {
  const applied: string[] = [];
  const errors: string[] = [];
  for (const name of names) {
    if (env[name]) continue; // direct value already set — it always wins
    const filePath = env[`${name}_FILE`];
    if (!filePath) continue;
    try {
      // Secret files conventionally end in a trailing newline (echo, heredocs,
      // most secret-manager exports) — strip trailing whitespace only, so an
      // intentionally leading/inner-whitespace secret isn't mangled.
      env[name] = readFile(filePath).replace(/\s+$/, "");
      applied.push(name);
    } catch (err) {
      errors.push(`${name}_FILE=${filePath}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { applied, errors };
}

// --- Production wiring ------------------------------------------------------
// Runs immediately at import time (see the ordering note above). A file that
// is set but unreadable is fatal and fails fast — the same posture as
// validateEnv() for a missing plain var. A mounted-but-unreadable secret
// (bad path, permissions) must never silently degrade into "var unset" and
// surface later as a confusing, unrelated error.
import { readFileSync } from "fs";

const _result = resolveFileBackedSecrets(process.env, FILE_BACKED_SECRET_VARS, (p) =>
  readFileSync(p, "utf-8"),
);
if (_result.errors.length > 0) {
  console.error(
    "[secrets] FATAL — could not read a file-backed secret:\n  - " + _result.errors.join("\n  - "),
  );
  process.exit(1);
}
if (_result.applied.length > 0) {
  // Names only — never values.
  console.log(`[secrets] loaded from file: ${_result.applied.join(", ")}`);
}
