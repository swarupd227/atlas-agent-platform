// Centralized startup configuration & environment validation.
// Phase 0 hardening: fail fast on misconfiguration; gate demo surfaces off in prod.
import { getSecurityMode } from "./auth";
import { describeOutboundPolicy, validateOutboundPolicyEnv } from "./url-safety";
import { describeLockdown, validateLockdownEnv } from "./lockdown";
import { describeOtlp, validateOtlpEnv } from "./otlp-export";
import { describeSso, validateSsoEnv } from "./sso";
import { describeScim, validateScimEnv } from "./scim";
import { describeAuditKms, validateAuditKmsEnv } from "./audit-kms";
import { describeSecretStore, validateSecretStoreEnv } from "./secret-store";
import { describeTrustProxy, validateTrustProxyEnv } from "./client-address";
import { INTEGRATION_REGISTRY } from "./integrations/registry";

const MiB = 1024 * 1024;
const GiB = 1024 * MiB;

/**
 * Operational bounds for document extraction, attachment search, retrieval and
 * original-file storage. Environment may lower a value; it cannot raise one
 * past the ceiling, and a missing or rejected value stays at the default.
 * Chunk size and retrieval preferences stay on the knowledge base row.
 */
const KNOWLEDGE_LIMIT_SPECS = {
  attachmentBudgetChars: { env: "KNOWLEDGE_ATTACHMENT_BUDGET_CHARS", fallback: 120_000, floor: 1_000, ceiling: 500_000 },
  attachmentReadChars: { env: "KNOWLEDGE_ATTACHMENT_READ_CHARS", fallback: 40_000, floor: 1_000, ceiling: 200_000 },
  attachmentCacheChars: { env: "KNOWLEDGE_ATTACHMENT_CACHE_CHARS", fallback: 60_000_000, floor: 1_000, ceiling: 200_000_000 },
  attachmentSearchResults: { env: "KNOWLEDGE_ATTACHMENT_SEARCH_RESULTS", fallback: 25, floor: 1, ceiling: 25 },
  attachmentSearchSections: { env: "KNOWLEDGE_ATTACHMENT_SEARCH_SECTIONS", fallback: 100_000, floor: 1, ceiling: 200_000 },
  zipMaxEntries: { env: "KNOWLEDGE_ZIP_MAX_ENTRIES", fallback: 4_096, floor: 1, ceiling: 10_000 },
  zipMaxEntryBytes: { env: "KNOWLEDGE_ZIP_MAX_ENTRY_BYTES", fallback: 256 * MiB, floor: 1, ceiling: 256 * MiB },
  zipMaxExpandedBytes: { env: "KNOWLEDGE_ZIP_MAX_EXPANDED_BYTES", fallback: 512 * MiB, floor: 1, ceiling: 512 * MiB },
  retrievalMaxTopK: { env: "KNOWLEDGE_RETRIEVAL_MAX_TOP_K", fallback: 50, floor: 1, ceiling: 50 },
  retrievalMaxQueryChars: { env: "KNOWLEDGE_RETRIEVAL_MAX_QUERY_CHARS", fallback: 8_000, floor: 1, ceiling: 8_000 },
  orgStoredBytes: { env: "KNOWLEDGE_ORG_STORED_BYTES", fallback: GiB, floor: 1, ceiling: 10 * GiB },
} as const;

type KnowledgeLimitKey = keyof typeof KNOWLEDGE_LIMIT_SPECS;
export type KnowledgeLimits = Record<KnowledgeLimitKey, number>;

function boundedKnowledgeLimit(key: KnowledgeLimitKey): number {
  const spec = KNOWLEDGE_LIMIT_SPECS[key];
  const raw = process.env[spec.env];
  if (raw === undefined || raw.trim() === "") return spec.fallback;
  const n = Number(raw);
  if (!Number.isInteger(n)) return spec.fallback;
  return Math.min(spec.ceiling, Math.max(spec.floor, n));
}

function knowledgeLimitsFromEnv(): KnowledgeLimits {
  return {
    attachmentBudgetChars: boundedKnowledgeLimit("attachmentBudgetChars"),
    attachmentReadChars: boundedKnowledgeLimit("attachmentReadChars"),
    attachmentCacheChars: boundedKnowledgeLimit("attachmentCacheChars"),
    attachmentSearchResults: boundedKnowledgeLimit("attachmentSearchResults"),
    attachmentSearchSections: boundedKnowledgeLimit("attachmentSearchSections"),
    zipMaxEntries: boundedKnowledgeLimit("zipMaxEntries"),
    zipMaxEntryBytes: boundedKnowledgeLimit("zipMaxEntryBytes"),
    zipMaxExpandedBytes: boundedKnowledgeLimit("zipMaxExpandedBytes"),
    retrievalMaxTopK: boundedKnowledgeLimit("retrievalMaxTopK"),
    retrievalMaxQueryChars: boundedKnowledgeLimit("retrievalMaxQueryChars"),
    orgStoredBytes: boundedKnowledgeLimit("orgStoredBytes"),
  };
}

/** Clamped even when startup validation did not run, so a limit cannot be lifted to unlimited. */
export const knowledgeLimits: KnowledgeLimits = knowledgeLimitsFromEnv();

/** Invalid or above-ceiling values refuse to start. The runtime object is already clamped. */
export function validateKnowledgeLimitsEnv(): string[] {
  const errors: string[] = [];
  for (const spec of Object.values(KNOWLEDGE_LIMIT_SPECS)) {
    const raw = process.env[spec.env];
    if (raw === undefined || raw.trim() === "") continue;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < spec.floor || n > spec.ceiling) {
      errors.push(`${spec.env} must be an integer from ${spec.floor} to ${spec.ceiling}.`);
    }
  }
  return errors;
}

/** True when demo & mock surfaces (/demo-api, /api/mock, mock-MCP, demo seeders) should be active. */
export function demosEnabled(): boolean {
  const v = process.env.ENABLE_DEMOS;
  if (v !== undefined) return v === "true" || v === "1";
  // Default: enabled in demo mode, disabled in production.
  return getSecurityMode() === "demo";
}

/**
 * Validate required environment before the server does anything else.
 * Exits the process (non-zero) on fatal misconfiguration so an orchestrator
 * surfaces the failure instead of running a half-dead instance.
 */
export function validateEnv(): void {
  const errors: string[] = [];

  if (!process.env.DATABASE_URL) {
    errors.push("DATABASE_URL is required (Postgres connection string).");
  }

  if (getSecurityMode() === "production") {
    if (!process.env.JWT_SECRET) {
      errors.push("JWT_SECRET is required in production mode (no insecure fallback is used).");
    }
    if (!process.env.INTEGRATION_VAULT_KEY) {
      errors.push("INTEGRATION_VAULT_KEY is required in production mode (credential vault encryption key).");
    }
  }

  // A malformed allowlist must stop the server: ignoring it would silently change what the app can reach.
  errors.push(...validateOutboundPolicyEnv());
  // A lockdown that cannot be read must stop the server too: running without it would be running unrestricted.
  errors.push(...validateLockdownEnv(INTEGRATION_REGISTRY.map((def) => def.id)));
  // So does an export that is set up wrongly: it would otherwise look configured and send nothing.
  errors.push(...validateOtlpEnv());
  // Single sign-on that is set up wrongly would leave the sign-in page offering a button that cannot work.
  errors.push(...validateSsoEnv());
  // A SCIM token without single sign-on would provision people who can never be tied to a sign-in.
  errors.push(...validateScimEnv());
  // An audit key named wrongly would fail at the first audit event, mid-request: stop here instead.
  errors.push(...validateAuditKmsEnv());
  // A secret store set up wrongly would send credentials nowhere (or fail at the first connector): stop here instead.
  errors.push(...validateSecretStoreEnv());
  // A wrong proxy count would count every client as one (or believe a forged address): stop here instead.
  errors.push(...validateTrustProxyEnv());
  // A knowledge limit above its ceiling would let one upload or search grow without a bound.
  errors.push(...validateKnowledgeLimitsEnv());

  if (errors.length > 0) {
    console.error(
      "[config] FATAL — invalid environment; refusing to start:\n  - " + errors.join("\n  - "),
    );
    process.exit(1);
  }

  console.log(
    `[config] security_mode=${getSecurityMode()} demos_enabled=${demosEnabled()} node_env=${process.env.NODE_ENV ?? "unset"}`,
  );
  console.log(`[config] ${describeOutboundPolicy()} ${describeLockdown()} ${describeOtlp()} ${describeSso()} ${describeScim()} ${describeAuditKms()} ${describeSecretStore()} ${describeTrustProxy()}`);
}
