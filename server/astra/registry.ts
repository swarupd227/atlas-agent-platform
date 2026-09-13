/**
 * The set of tools Astra may offer, filtered to what the caller's role allows.
 *
 * Tool names are the model-visible identifiers and are stable: a paused turn
 * resumes by name, so registration order can change between pause and resume
 * without resolving a different tool (unlike workspace-run's positional names).
 */
import type { CanonicalToolDefinition } from "../llm-provider";
import type { RoleId } from "../permissions";
import type { AstraTool, PermissionCheck } from "./types";
import { toolInputJsonSchema } from "./json-schema";

const TOOL_NAME = /^[a-z][a-z0-9_]{1,62}$/;

export class ToolRegistry {
  private readonly byName = new Map<string, AstraTool>();
  private readonly schemas = new Map<string, Record<string, unknown>>();

  constructor(tools: AstraTool[], private readonly can: PermissionCheck) {
    for (const tool of tools) {
      if (!TOOL_NAME.test(tool.name)) throw new Error(`Astra tool name "${tool.name}" is not a stable snake_case identifier`);
      if (this.byName.has(tool.name)) throw new Error(`Astra tool "${tool.name}" is registered twice`);
      this.byName.set(tool.name, tool);
      // Convert eagerly so an unsupported schema fails at startup, not mid-turn.
      this.schemas.set(tool.name, toolInputJsonSchema(tool.input));
    }
  }

  /** Tools this role may use, in a deterministic order. */
  forRole(role: RoleId): AstraTool[] {
    return Array.from(this.byName.values())
      .filter((tool) => !tool.permission || this.can(role, tool.permission))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** The tool, only if this role may use it. */
  get(name: string, role: RoleId): AstraTool | undefined {
    const tool = this.byName.get(name);
    if (!tool) return undefined;
    if (tool.permission && !this.can(role, tool.permission)) return undefined;
    return tool;
  }

  canonicalDefinitions(role: RoleId): CanonicalToolDefinition[] {
    return this.forRole(role).map((tool) => ({
      name: tool.name,
      description: tool.confirm
        ? `${tool.description} (Changes the platform: the user is asked to confirm before it runs.)`
        : tool.description,
      parameters: this.schemas.get(tool.name)!,
    }));
  }
}
