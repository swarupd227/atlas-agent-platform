/**
 * The platform-native tools that can be switched off for a whole deployment (server/lockdown.ts,
 * nativeTools). Each place that offers one of them asks here, so there is one rule for what "on"
 * means and one place the lockdown is consulted.
 */
import { nativeToolAllowed } from "./lockdown";

/**
 * Whether an agent gets Anthropic's server-side web search this turn: the deployment allows it, and
 * the agent asked for it with the toolsConfig convention {name: "web_search", type: "builtin"}.
 * Every runtime that offers the web_search server tool decides it with this.
 */
export function webSearchOffered(toolsConfig: unknown): boolean {
  if (!nativeToolAllowed("webSearch")) return false;
  return Array.isArray(toolsConfig) && toolsConfig.some((t) => t?.name === "web_search" && t?.type === "builtin");
}
