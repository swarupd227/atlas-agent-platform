/**
 * Astra Workspace orchestrator -- shared types.
 *
 * Astra is the platform's conversational voice: one model with tool use that
 * acts on the platform on the signed-in user's behalf. Every module under
 * server/astra is written against injected dependencies (store, model call,
 * permission check, audit) so it can be unit-tested without a database, and so
 * it never reaches connectors directly -- external systems are only ever
 * touched inside an agent run, which goes through the tool dispatcher's gates.
 */
import type { z } from "zod";
import type { LLMMessage, CanonicalToolCall, LLMCompletionOptions, LLMCompletionResult } from "../llm-provider";
import type { PermissionAction, RoleId } from "../permissions";

/** Who is talking to Astra. orgId is always resolved (never undefined). */
export interface AstraContext {
  orgId: string;
  userId: string | null;
  role: RoleId;
  /** Industry the user has selected in the client, if any. Not yet stored on the tenant. */
  industryId?: string | null;
}

// ── Proof strip ─────────────────────────────────────────────────────────────

export type ProofSegment =
  | { status: "measured"; summary: string; details?: Record<string, unknown> }
  | { status: "not_measured"; reason?: string };

/** Every result proves itself three ways; a segment we can't fill says so. */
export interface ProofEnvelope {
  compliance: ProofSegment;
  context: ProofSegment;
  industry: ProofSegment;
}

// ── Results shown to the user ───────────────────────────────────────────────

export interface ArtifactRef {
  /** Card kind the client renders, e.g. "agentList", "connectorList", "run", "text". */
  kind: string;
  title: string;
  props: Record<string, unknown>;
  /** Existing page that shows the full detail. */
  fullViewHref?: string;
}

export interface SourceRef {
  tool: string;
  ok: boolean;
  latencyMs?: number;
}

export interface Suggestion {
  label: string;
  /** What gets sent when the chip is clicked -- phrased as the user's next sentence. */
  prompt: string;
}

// ── Tools ───────────────────────────────────────────────────────────────────

/**
 * Platform data the tools read and write. Injected so tools never import the
 * storage layer directly (production wiring lives in server/astra/services.ts).
 */
export interface AstraServices {
  [key: string]: (...args: any[]) => Promise<any>;
}

export interface AstraToolContext extends AstraContext {
  threadId: string;
  services: AstraServices;
  /** Narration while a long tool runs (e.g. an agent run). */
  onProgress?: (event: AstraEvent) => void;
  /** The role permission matrix, for tools whose options need a further permission. */
  can?: PermissionCheck;
  /** Set only when this call runs because the user pressed Confirm on this action. */
  confirmation?: PendingAction;
}

export interface ToolRunResult {
  /** Compact result sent back to the model. Keep it small. */
  payload: unknown;
  artifact?: ArtifactRef;
  proof?: Partial<ProofEnvelope>;
}

export interface AstraTool<I = any> {
  /** Stable, model-visible name. Never positional: resume must resolve the same tool. */
  name: string;
  description: string;
  input: z.ZodType<I>;
  /** Server-side permission required to see and run the tool. */
  permission?: PermissionAction;
  /** State-changing: the turn pauses on a Confirm / Not now card before it runs. */
  confirm: boolean;
  /** One sentence for the confirm card, built from the validated input. */
  describe?: (input: I, ctx: AstraContext) => string;
  /**
   * Look before pausing: resolve names, check the change is possible and
   * gather what the user must see on the card. Returning `refuse` ends the
   * call with that message and no card (there is nothing to confirm).
   * `frozen` is kept server-side with the action and handed back on Confirm
   * as ctx.confirmation.frozen, so run() can refuse if things changed.
   */
  preview?: (ctx: AstraToolContext, input: I) => Promise<ConfirmPreview>;
  run: (ctx: AstraToolContext, input: I) => Promise<ToolRunResult>;
}

/** Permission check, injected (production: hasPermission from server/permissions.ts). */
export type PermissionCheck = (role: RoleId, permission: PermissionAction) => boolean;

// ── Threads ─────────────────────────────────────────────────────────────────

export interface ConfirmWarning {
  title: string;
  detail: string;
}

export type ConfirmPreview =
  | { refuse: string }
  | { summary?: string; details?: string[]; warnings?: ConfirmWarning[]; frozen?: Record<string, unknown> };

export interface PendingAction {
  id: string;
  kind: "tool_confirm";
  toolName: string;
  toolCallId: string;
  /** The validated input, frozen when the turn paused. Confirm runs exactly this. */
  input: Record<string, unknown>;
  summary: string;
  /** What the change will do, one line each (shown on the card). */
  details?: string[];
  /** What the user is acknowledging by confirming. */
  warnings?: ConfirmWarning[];
  /** Server-side facts captured by preview(); never sent by the client. */
  frozen?: Record<string, unknown>;
  /** The Astra message that carries the confirm card. */
  messageId: string | null;
  createdAt: string;
}

export type PendingDecision = "confirmed" | "declined";

/** Everything collected during one turn, persisted so a pause/resume keeps it. */
export interface TurnAccumulator {
  artifacts: ArtifactRef[];
  sources: SourceRef[];
  suggestions: Suggestion[];
  proof: ProofEnvelope | null;
  /** Assistant text produced so far this turn (used when the turn ends on finish_turn). */
  lastAssistantText: string;
}

export interface Checkpoint {
  messages: LLMMessage[];
  pendingToolCalls: CanonicalToolCall[];
  pendingToolIndex: number;
  iterationsUsed: number;
  costUsd: number;
  tokens: { prompt: number; completion: number; total: number };
  turn: TurnAccumulator;
}

export type ThreadStatus = "idle" | "running" | "awaiting_confirmation" | "failed";

export interface ThreadState {
  id: string;
  orgId: string;
  status: ThreadStatus;
  checkpoint: Checkpoint;
  pendingAction: PendingAction | null;
}

export type MessageRole = "user" | "astra" | "agent" | "system";

export interface AstraMessageRecord {
  id: string;
  threadId: string;
  role: MessageRole;
  markdown: string;
  artifacts: ArtifactRef[];
  sources: SourceRef[];
  suggestions: Suggestion[];
  proof: ProofEnvelope | null;
  pendingAction: (PendingAction & { decision?: PendingDecision }) | null;
  createdAt: string;
}

export type NewMessage = Omit<AstraMessageRecord, "id" | "createdAt">;

export interface ThreadStore {
  loadThread(threadId: string, orgId: string): Promise<ThreadState | null>;
  /** Atomically mark the thread running. False when another turn holds it. */
  acquireTurn(threadId: string, orgId: string): Promise<boolean>;
  saveState(threadId: string, orgId: string, state: { status: ThreadStatus; checkpoint: Checkpoint; pendingAction: PendingAction | null }): Promise<void>;
  /**
   * Compare-and-swap: only if the thread is awaiting exactly this action, clear
   * it and mark the thread running. Returns the state as it was, or null when
   * the action is unknown, already decided, or belongs to another organization.
   */
  claimPendingAction(threadId: string, orgId: string, actionId: string): Promise<ThreadState | null>;
  appendMessage(orgId: string, message: NewMessage): Promise<AstraMessageRecord>;
  markActionDecided(orgId: string, messageId: string, decision: PendingDecision): Promise<void>;
}

// ── Events streamed to the browser ──────────────────────────────────────────

export type AstraEvent =
  | { type: "turn_started"; threadId: string }
  | { type: "working"; label: string }
  | { type: "tool_start"; tool: string; input: unknown }
  | { type: "tool_result"; tool: string; ok: boolean; preview: string; artifact?: ArtifactRef }
  | { type: "awaiting_confirmation"; action: PendingAction; message: AstraMessageRecord }
  | { type: "message"; message: AstraMessageRecord }
  | { type: "done"; status: ThreadStatus }
  | { type: "error"; message: string };

export type OnAstraEvent = (event: AstraEvent) => void;

/** The model call, injected (production: completeWithFallback with Claude Sonnet 5 then GPT-4.1). */
export type CompleteFn = (messages: LLMMessage[], options: LLMCompletionOptions) => Promise<LLMCompletionResult>;

export interface AuditRecord {
  orgId: string;
  userId: string | null;
  action: string;
  objectId: string;
  details: Record<string, unknown>;
}

export type AuditFn = (record: AuditRecord) => Promise<void>;
