/** Client mirror of the Astra wire types (server/astra/types.ts, server/astra/store.ts). */

export type ProofSegment =
  | { status: "measured"; summary: string; details?: Record<string, unknown> }
  | { status: "not_measured"; reason?: string };

export interface ProofEnvelope {
  compliance: ProofSegment;
  context: ProofSegment;
  industry: ProofSegment;
}

export interface ArtifactRef {
  kind: string;
  title: string;
  props: Record<string, any>;
  fullViewHref?: string;
}

export interface SourceRef {
  tool: string;
  ok: boolean;
  latencyMs?: number;
}

export interface Suggestion {
  label: string;
  prompt: string;
}

export interface ConfirmWarning {
  title: string;
  detail: string;
}

export interface PendingAction {
  id: string;
  kind: "tool_confirm" | "agent_approval";
  toolName: string;
  toolCallId: string;
  input: Record<string, unknown>;
  summary: string;
  details?: string[];
  warnings?: ConfirmWarning[];
  messageId: string | null;
  createdAt: string;
  decision?: "confirmed" | "declined";
}

export type ThreadStatus = "idle" | "running" | "awaiting_confirmation" | "failed";

export interface AstraMessage {
  id: string;
  threadId: string;
  role: "user" | "astra" | "agent" | "system";
  markdown: string;
  artifacts: ArtifactRef[];
  sources: SourceRef[];
  suggestions: Suggestion[];
  proof: ProofEnvelope | null;
  pendingAction: PendingAction | null;
  createdAt: string;
}

export interface ThreadSummary {
  id: string;
  title: string;
  status: ThreadStatus;
  outcomeId: string | null;
  pendingAction: PendingAction | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export type AstraEvent =
  | { type: "turn_started"; threadId: string }
  | { type: "working"; label: string }
  | { type: "tool_start"; tool: string; input: unknown }
  | { type: "tool_result"; tool: string; ok: boolean; preview: string; artifact?: ArtifactRef }
  | { type: "awaiting_confirmation"; action: PendingAction; message: AstraMessage }
  | { type: "message"; message: AstraMessage }
  | { type: "done"; status: ThreadStatus }
  | { type: "error"; message: string };

/** One tool call as it happens during a live turn. */
export interface LiveStep {
  tool: string;
  state: "running" | "ok" | "failed";
  preview?: string;
}

/** GET /api/astra/needs-you (services.needsMe): the same data list_needs_me reads. */
export interface NeedsYouItem {
  id: string;
  source: string;
  category: string;
  sourceId: string;
  title: string;
  context: string;
  urgency: "urgent" | "today" | "this_week";
  canDecideHere: boolean;
  requiredReviewerRole: string | null;
  elsewhere: { href: string; page: string; reason: string } | null;
}

export interface NeedsYou {
  needsDecisionCount: number;
  fyiCount: number;
  completedTodayCount: number;
  needsDecision: NeedsYouItem[];
  fyi: NeedsYouItem[];
}

/** GET /api/astra/library (server/astra/library.ts). */
export interface LibraryItem {
  id: string;
  name: string;
  detail: string | null;
  status: string | null;
  ask: string | null;
  href: string;
  inShell?: boolean;
}

export interface LibrarySection {
  id: string;
  label: string;
  total: number;
  items: LibraryItem[];
  error?: string;
}

export interface Library {
  query: string | null;
  sections: LibrarySection[];
  elsewhere: string[];
}

/** GET /api/astra/home (server/astra/home.ts). */
export interface HomeRow {
  id: "needs" | "agents" | "outcomes" | "connectors" | "industry";
  label: string;
  count: number | null;
  detail: string | null;
  prompt: string;
  tone: "attention" | "neutral" | "unavailable";
}

export interface HomeBriefing {
  organizationName: string | null;
  rows: HomeRow[];
  notShown: string[];
}
