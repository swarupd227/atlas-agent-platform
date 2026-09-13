/**
 * Thin dispatcher for Astra's platform tools.
 *
 * Deliberately NOT server/tool-dispatcher.ts's dispatchToolCall: those gates
 * (AAR decisions, warrants, per-agent rate limits, standing grants) are keyed
 * on an agent, while a platform tool is the signed-in user acting through
 * Astra. The governance here is the user's: role permission, input validation,
 * an explicit confirmation for anything that changes the platform, a per-user
 * rate limit and a hash-chained audit record. Connector and MCP calls never
 * happen here -- only inside an agent run, which goes through the full gate
 * chain.
 */
import { randomUUID } from "crypto";
import type { AstraContext, AstraTool, AstraToolContext, AuditFn, ConfirmPreview, PendingAction, PermissionCheck, ToolRunResult } from "./types";
import { completeProof } from "./proof";

export type DispatchOutcome =
  | { kind: "needs_confirmation"; action: PendingAction }
  | { kind: "result"; ok: true; result: ToolRunResult; latencyMs: number }
  | { kind: "result"; ok: false; error: string; latencyMs: number };

export interface DispatchDeps {
  can: PermissionCheck;
  audit: AuditFn;
  rateLimit?: RateLimiter;
  now?: () => number;
}

export interface DispatchRequest {
  tool: AstraTool;
  rawInput: unknown;
  toolCallId: string;
  /** True only when resuming after the user pressed Confirm on this exact action. */
  approved: boolean;
  ctx: AstraToolContext;
}

/** Sliding one-minute window per user and tool, in memory (one app instance). */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();
  constructor(private readonly perMinute: number, private readonly now: () => number = Date.now) {}

  allow(key: string): boolean {
    const t = this.now();
    const recent = (this.hits.get(key) ?? []).filter((at) => t - at < 60_000);
    if (recent.length >= this.perMinute) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(t);
    this.hits.set(key, recent);
    return true;
  }
}

export function describeAction(tool: AstraTool, input: unknown, ctx: AstraContext): string {
  if (tool.describe) {
    try {
      return tool.describe(input, ctx);
    } catch {
      /* fall through to the generic description */
    }
  }
  return `Run ${tool.name.replace(/_/g, " ")}`;
}

function zodIssues(error: { issues: Array<{ path: (string | number)[]; message: string }> }): string {
  return error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
}

export async function dispatchAstraTool(req: DispatchRequest, deps: DispatchDeps): Promise<DispatchOutcome> {
  const now = deps.now ?? Date.now;
  const started = now();
  const { tool, ctx } = req;
  const fail = (error: string): DispatchOutcome => ({ kind: "result", ok: false, error, latencyMs: now() - started });

  // The registry already hides tools a role can't use; this is the server-side backstop.
  if (tool.permission && !deps.can(ctx.role, tool.permission)) {
    return fail(`The ${ctx.role} role doesn't have permission to ${tool.name.replace(/_/g, " ")}.`);
  }

  const parsed = tool.input.safeParse(req.rawInput ?? {});
  if (!parsed.success) return fail(`Invalid input for ${tool.name}: ${zodIssues(parsed.error)}`);

  if (tool.confirm && !req.approved) {
    let preview: ConfirmPreview = {};
    if (tool.preview) {
      try {
        preview = await tool.preview(ctx, parsed.data);
      } catch (err: any) {
        return fail(err?.message ? String(err.message) : "Couldn't prepare this change.");
      }
    }
    if ("refuse" in preview) return fail(preview.refuse);
    return {
      kind: "needs_confirmation",
      action: {
        id: randomUUID(),
        kind: "tool_confirm",
        toolName: tool.name,
        toolCallId: req.toolCallId,
        input: parsed.data as Record<string, unknown>,
        summary: preview.summary ?? describeAction(tool, parsed.data, ctx),
        ...(preview.details?.length ? { details: preview.details } : {}),
        ...(preview.warnings?.length ? { warnings: preview.warnings } : {}),
        ...(preview.frozen ? { frozen: preview.frozen } : {}),
        messageId: null,
        createdAt: new Date(now()).toISOString(),
      },
    };
  }

  const rateKey = `${ctx.userId ?? ctx.role}:${tool.name}`;
  if (deps.rateLimit && !deps.rateLimit.allow(rateKey)) {
    return fail(`Too many ${tool.name.replace(/_/g, " ")} requests in the last minute. Wait a moment and try again.`);
  }

  let result: ToolRunResult;
  try {
    result = await tool.run(ctx, parsed.data);
  } catch (err: any) {
    const message = err?.message ? String(err.message) : "The tool failed without a reason.";
    if (tool.confirm) {
      await deps.audit({
        orgId: ctx.orgId,
        userId: ctx.userId,
        action: "astra_shell.tool_failed",
        objectId: tool.name,
        details: { threadId: ctx.threadId, toolCallId: req.toolCallId, error: message },
      }).catch(() => {});
    }
    return fail(message);
  }

  const latencyMs = now() - started;
  const permissionNote = tool.permission ? `permission ${tool.permission}` : "no special permission";
  let compliance: { status: "measured"; summary: string } = { status: "measured", summary: `Read only · ${permissionNote}` };

  if (tool.confirm) {
    // The change has already happened by now, so an audit failure must not be
    // reported as the tool failing -- but it must not be hidden either.
    try {
      await deps.audit({
        orgId: ctx.orgId,
        userId: ctx.userId,
        action: "astra_shell.tool_executed",
        objectId: tool.name,
        details: { threadId: ctx.threadId, toolCallId: req.toolCallId, input: parsed.data, latencyMs },
      });
      compliance = { status: "measured", summary: `Confirmed by you · ${permissionNote} · audit recorded` };
    } catch (err: any) {
      compliance = { status: "measured", summary: `Confirmed by you · ${permissionNote} · audit record FAILED (${err?.message ?? "unknown error"})` };
    }
  }

  return {
    kind: "result",
    ok: true,
    latencyMs,
    result: { ...result, proof: completeProof({ ...result.proof, compliance: result.proof?.compliance ?? compliance }) },
  };
}
