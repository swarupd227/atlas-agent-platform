// Centralized startup configuration & environment validation.
// Phase 0 hardening: fail fast on misconfiguration; gate demo surfaces off in prod.
import { getSecurityMode } from "./auth";

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

  if (errors.length > 0) {
    console.error(
      "[config] FATAL — invalid environment; refusing to start:\n  - " + errors.join("\n  - "),
    );
    process.exit(1);
  }

  console.log(
    `[config] security_mode=${getSecurityMode()} demos_enabled=${demosEnabled()} node_env=${process.env.NODE_ENV ?? "unset"}`,
  );
}
