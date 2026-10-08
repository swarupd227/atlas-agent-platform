/**
 * Platform lockdown: what this deployment does not allow at all.
 *
 * An operator who must guarantee that the marketplace, agent and public API keys, or user-entered
 * LLM keys cannot be used sets ASTRA_LOCKDOWN (JSON) or ASTRA_LOCKDOWN_FILE (a path to the same
 * JSON, for a mounted file or a secret). It is read once from the environment the process was
 * started with. Nothing in the app or its API can change it: the admin "platform settings" are
 * database rows an administrator can edit, which is exactly what a lockdown is not.
 *
 * It fails closed. A value that is not valid JSON, has a key this version does not know (a typo
 * must not silently mean "no restriction"), or names both the variable and the file, stops the
 * server at boot. When neither is set nothing is restricted.
 *
 * Each switch is enforced where the thing happens, not by hiding a menu: a route group is closed
 * by one middleware (lockdownGate), the agent API key check in authMiddleware stops accepting
 * keys, and the LLM key lookup stops reading the vault. What it cannot do is protect against
 * whoever controls the deployment itself: they can change the environment or the file. A baked
 * image or a read-only mount is as strong as the infrastructure around it.
 */
import fs from "node:fs";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

const onOff = z.enum(["on", "off"]);

const lockdownSchema = z
  .object({
    /** The connector marketplace and its registry sources: browse, install, sync. */
    marketplace: onOff.optional(),
    apiKeys: z
      .object({
        /** Agent API keys: creating them, and authenticating with one (eval runs, the connector MCP endpoints, the gateway). */
        agent: onOff.optional(),
        /** The public API (/api/v1) as a whole: the shared key (ASTRA_PUBLIC_API_KEY) and agent keys alike. */
        publicApi: onOff.optional(),
      })
      .strict()
      .optional(),
    /** "env-only": LLM provider keys come from the environment; an admin cannot enter one, and a stored one is ignored. */
    llmKeys: z.enum(["vault-and-env", "env-only"]).optional(),
  })
  .strict();

export interface Lockdown {
  /** True when any restriction is set. */
  active: boolean;
  marketplace: "on" | "off";
  apiKeys: { agent: "on" | "off"; publicApi: "on" | "off" };
  llmKeys: "vault-and-env" | "env-only";
}

export class LockdownError extends Error {
  constructor(public readonly surface: string) {
    super(`${surface} is disabled by this deployment's platform policy.`);
    this.name = "LockdownError";
  }
}

function readRaw(): string | undefined {
  const inline = process.env.ASTRA_LOCKDOWN;
  const file = process.env.ASTRA_LOCKDOWN_FILE;
  if (inline && file) throw new Error("set ASTRA_LOCKDOWN or ASTRA_LOCKDOWN_FILE, not both");
  if (file) {
    try {
      return fs.readFileSync(file, "utf8");
    } catch (e: any) {
      throw new Error(`cannot read ASTRA_LOCKDOWN_FILE (${file}): ${e.message}`);
    }
  }
  return inline && inline.trim() !== "" ? inline : undefined;
}

export function parseLockdown(raw: string | undefined): Lockdown {
  let parsed: z.infer<typeof lockdownSchema> = {};
  if (raw !== undefined && raw.trim() !== "") {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch (e: any) {
      throw new Error(`not valid JSON (${e.message})`);
    }
    const result = lockdownSchema.safeParse(json);
    if (!result.success) {
      throw new Error(result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; "));
    }
    parsed = result.data;
  }
  const lockdown: Lockdown = {
    active: false,
    marketplace: parsed.marketplace ?? "on",
    apiKeys: { agent: parsed.apiKeys?.agent ?? "on", publicApi: parsed.apiKeys?.publicApi ?? "on" },
    llmKeys: parsed.llmKeys ?? "vault-and-env",
  };
  lockdown.active = lockdown.marketplace === "off" || lockdown.apiKeys.agent === "off" || lockdown.apiKeys.publicApi === "off" || lockdown.llmKeys === "env-only";
  return Object.freeze({ ...lockdown, apiKeys: Object.freeze({ ...lockdown.apiKeys }) });
}

let cachedKey: string | undefined | null = null;
let cached: Lockdown | null = null;

/** The lockdown in force. Read from the environment once, then served from memory. */
export function getLockdown(): Lockdown {
  const raw = readRaw();
  if (cached && cachedKey === (raw ?? "")) return cached;
  cached = parseLockdown(raw);
  cachedKey = raw ?? "";
  return cached;
}

/** Problems with the lockdown in the environment, for the boot-time check. */
export function validateLockdownEnv(): string[] {
  try {
    getLockdown();
    return [];
  } catch (e: any) {
    return [`ASTRA_LOCKDOWN is invalid: ${e.message}`];
  }
}

/** A line for the startup log. */
export function describeLockdown(): string {
  const l = getLockdown();
  if (!l.active) return "lockdown=none";
  const off = [l.marketplace === "off" && "marketplace", l.apiKeys.agent === "off" && "agent-api-keys", l.apiKeys.publicApi === "off" && "public-api-key", l.llmKeys === "env-only" && "llm-keys:env-only"].filter(Boolean);
  return `lockdown=${off.join(",")}`;
}

/** What the app may show a signed-in user: which surfaces are closed on this deployment. */
export function lockdownPublicView() {
  const l = getLockdown();
  return { active: l.active, marketplace: l.marketplace, apiKeys: { ...l.apiKeys }, llmKeys: l.llmKeys };
}

export type GatedSurface = "marketplace" | "agentApiKeys" | "publicApi";

const isClosed = (surface: GatedSurface): boolean => {
  const l = getLockdown();
  return surface === "marketplace" ? l.marketplace === "off" : surface === "agentApiKeys" ? l.apiKeys.agent === "off" : l.apiKeys.publicApi === "off";
};

const LABEL: Record<GatedSurface, string> = {
  marketplace: "The connector marketplace",
  agentApiKeys: "Agent API keys",
  publicApi: "The public API",
};

/** Whether agent API keys may be created or used on this deployment. */
export const agentApiKeysAllowed = (): boolean => getLockdown().apiKeys.agent !== "off";

function refuse(res: Response, surface: string) {
  return res.status(403).json({ message: `${surface} is disabled by this deployment's platform policy.`, reason: "platform_lockdown", surface });
}

/** Middleware that closes a whole route group when its switch is off. Mounted once, ahead of the routes. */
export function lockdownGate(surface: GatedSurface) {
  return (_req: Request, res: Response, next: NextFunction) => (isClosed(surface) ? refuse(res, LABEL[surface]) : next());
}

/**
 * Entering an LLM provider key (POST /api/admin/llm-provider-keys/:provider) is refused when keys
 * must come from the environment. Listing, testing and clearing a stored key stay available: the
 * last of those removes a key rather than adding one.
 */
export function llmKeyEntryGate(req: Request, res: Response, next: NextFunction) {
  if (getLockdown().llmKeys === "env-only" && req.method === "POST" && /^\/[^/]+\/?$/.test(req.path)) {
    return refuse(res, "Entering an LLM provider key");
  }
  next();
}
