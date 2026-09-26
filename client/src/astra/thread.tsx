import { useEffect, useRef, useState } from "react";
import { ArrowDown, Check, CircleAlert, Loader2, PanelRight, Pencil, RotateCcw, Square } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { CopyButton } from "@/components/copy-button";
import { Composer, type ComposerInsert, type DecisionOption } from "./composer";
import type { PermissionAction } from "@/components/role-provider";
import type { Mentionable } from "./mention";
import { ConfirmCard } from "./confirm-card";
import { HomeActivityPanel, HomeBriefing, HomeGreeting } from "./home";
import { STARTERS } from "./prompts";
import { ProofStrip } from "./proof-strip";
import type { LiveTurn } from "./api";
import type { ArtifactRef, AstraMessage, LiveStep, ThreadStatus } from "./types";

function toolLabel(tool: string) {
  return tool.replace(/_/g, " ");
}

function Steps({ steps }: { steps: LiveStep[] }) {
  if (steps.length === 0) return null;
  return (
    <ol className="space-y-1 font-mono text-xs" aria-label="Steps">
      {steps.map((s, i) => (
        <li key={i} className="flex min-w-0 items-center gap-2 text-muted-foreground">
          {s.state === "running" ? (
            <Loader2 className="h-3 w-3 shrink-0 animate-spin text-primary" aria-label="running" />
          ) : s.state === "ok" ? (
            <Check className="h-3 w-3 shrink-0 text-[hsl(var(--astra-ok))]" aria-label="done" />
          ) : (
            <CircleAlert className="h-3 w-3 shrink-0 text-[hsl(var(--astra-fail))]" aria-label="failed" />
          )}
          <span className="shrink-0 text-foreground/80">{toolLabel(s.tool)}</span>
          {s.preview && <span className="truncate">{s.preview}</span>}
        </li>
      ))}
    </ol>
  );
}

function AstraMark() {
  return (
    <div aria-hidden className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary font-mono text-[11px] font-bold text-primary-foreground">
      A
    </div>
  );
}

function MessageView({
  message,
  activeActionId,
  busy,
  onDecide,
  onOpenArtifact,
  onEdit,
}: {
  message: AstraMessage;
  activeActionId: string | null;
  busy: boolean;
  onDecide: (actionId: string, decision: "confirm" | "cancel") => void;
  onOpenArtifact: (a: ArtifactRef) => void;
  /** Put this message back in the composer to amend. */
  onEdit?: (text: string) => void;
}) {
  if (message.role === "user") {
    return (
      <div className="group/user flex items-start justify-end gap-1">
        {/* Editing puts it back in the box to amend and ask again; nothing in
            the conversation is rewritten, because nothing here is erasable. */}
        {onEdit && (
          <button
            type="button"
            onClick={() => onEdit(message.markdown)}
            className="mt-1 shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring group-hover/user:opacity-100"
            aria-label="Edit this message and ask again"
            title="Edit and ask again"
            data-testid="astra-edit-message"
          >
            <Pencil className="h-3 w-3" aria-hidden />
          </button>
        )}
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-md bg-secondary px-3.5 py-2 text-sm">{message.markdown}</div>
      </div>
    );
  }
  if (message.role === "system") {
    return (
      <div className="flex gap-2 rounded-md border border-[hsl(var(--astra-fail)/0.35)] bg-[hsl(var(--astra-fail)/0.06)] p-3 text-sm">
        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--astra-fail))]" aria-hidden />
        <span>{message.markdown}</span>
      </div>
    );
  }

  const tools = Array.from(new Set(message.sources.map((s) => s.tool)));
  return (
    <div className="flex gap-3">
      <AstraMark />
      <div className="min-w-0 flex-1 space-y-3">
        {message.markdown && (
          <div className="group/msg relative">
            <Markdown text={message.markdown} className="astra-md text-sm" />
            {/* Quiet until the message is hovered or the button is focused. */}
            <CopyButton
              text={message.markdown}
              className="absolute -top-1 right-0 opacity-0 transition-opacity focus:opacity-100 group-hover/msg:opacity-100"
              testId="astra-copy-message"
            />
          </div>
        )}

        {message.pendingAction && (
          <ConfirmCard
            action={message.pendingAction}
            active={message.pendingAction.id === activeActionId}
            busy={busy}
            onDecide={(d) => onDecide(message.pendingAction!.id, d)}
          />
        )}

        {message.artifacts.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {message.artifacts.map((a, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onOpenArtifact(a)}
                className="inline-flex max-w-full items-center gap-1.5 rounded border border-border bg-card px-2.5 py-1.5 text-left text-xs hover:border-primary/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <PanelRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate">{a.title}</span>
              </button>
            ))}
          </div>
        )}

        {tools.length > 0 && (
          <div className="font-mono text-[11px] text-muted-foreground">
            Used {tools.map(toolLabel).join(" · ")}
          </div>
        )}

        {message.proof && <ProofStrip proof={message.proof} />}
      </div>
    </div>
  );
}

/** Close enough to the bottom to count as still following the turn. */
const NEAR_BOTTOM_PX = 120;

export function Thread({
  messages,
  status,
  live,
  streaming,
  error,
  hasThread,
  onSend,
  onStop,
  stopping,
  onEdit,
  onRetry,
  onDecide,
  onOpenArtifact,
  mentionables,
  composerInsert,
  decisions,
  canUse,
  onCommandNavigate,
}: {
  messages: AstraMessage[];
  status: ThreadStatus;
  live: LiveTurn;
  streaming: boolean;
  error: string | null;
  hasThread: boolean;
  onSend: (text: string) => void;
  /** Ask the running turn to stop; it ends itself and says so. */
  onStop?: () => void;
  stopping?: boolean;
  /** Put one of your earlier messages back in the composer to amend. */
  onEdit?: (text: string) => void;
  /** Send the last thing you asked again, as a new message. */
  onRetry?: () => void;
  onDecide: (actionId: string, decision: "confirm" | "cancel") => void;
  onOpenArtifact: (a: ArtifactRef) => void;
  mentionables?: Mentionable[];
  composerInsert?: ComposerInsert | null;
  /** What /approve and /reject offer. */
  decisions?: DecisionOption[];
  canUse?: (permission?: PermissionAction) => boolean;
  onCommandNavigate?: (href: string) => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  // Following the turn is the default, but reading is allowed: scroll up and
  // the view stops dragging you back down on every new step. Scroll back to
  // the bottom and it resumes.
  const [following, setFollowing] = useState(true);
  useEffect(() => {
    if (!following) return;
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages.length, live.steps.length, live.working, streaming, following]);

  const waiting = status === "awaiting_confirmation";
  const activeAction = waiting ? [...messages].reverse().find((m) => m.pendingAction && !m.pendingAction.decision)?.pendingAction ?? null : null;
  const last = messages[messages.length - 1];
  const suggestions = !streaming && !waiting && last?.role === "astra" ? last.suggestions : [];
  const empty = messages.length === 0 && !streaming;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={scrollerRef}
        onScroll={() => {
          const el = scrollerRef.current;
          if (!el) return;
          setFollowing(el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX);
        }}
        className="relative min-h-0 flex-1 overflow-y-auto"
      >
        <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-6">
          {empty && (
            <div className="space-y-8 pt-[4vh]" data-testid="astra-cowork-home">
              <HomeGreeting />
              <HomeBriefing onSend={onSend} />
              <HomeActivityPanel />
              <section aria-label="Start something">
                <h2 className="mb-2 font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Start something</h2>
                <p className="mb-2 max-w-prose text-xs text-muted-foreground">
                  Anything that changes the platform waits for your confirmation, and every answer shows what it's based on.
                </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {STARTERS.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => onSend(s.prompt)}
                    className="rounded-md border border-border bg-card px-3 py-2.5 text-left text-sm hover:border-primary/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              </section>
            </div>
          )}

          {messages.map((m) => (
            <MessageView
              key={m.id}
              message={m}
              activeActionId={activeAction?.id ?? null}
              busy={streaming}
              onDecide={onDecide}
              onOpenArtifact={onOpenArtifact}
              onEdit={m.role === "user" ? onEdit : undefined}
            />
          ))}

          {streaming && (
            <div className="flex gap-3" aria-live="polite">
              <AstraMark />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary" aria-hidden />
                  {live.working ?? "Working"}
                  {onStop && (
                    <button
                      type="button"
                      onClick={onStop}
                      disabled={stopping}
                      className="ml-1 inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-xs text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60"
                      data-testid="astra-stop"
                    >
                      <Square className="h-3 w-3 fill-current" aria-hidden />
                      {stopping ? "Stopping…" : "Stop"}
                    </button>
                  )}
                </div>
                <Steps steps={live.steps} />
              </div>
            </div>
          )}

          {error && (
            <div role="alert" className="flex gap-2 rounded-md border border-[hsl(var(--astra-fail)/0.35)] bg-[hsl(var(--astra-fail)/0.06)] p-3 text-sm">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--astra-fail))]" aria-hidden />
              <span>{error}</span>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      <div className="shrink-0 border-t border-border/60 bg-background px-4 pb-4 pt-3 sm:px-6">
        <div className="mx-auto w-full max-w-3xl space-y-2">
          {!following && (
            <button
              type="button"
              onClick={() => {
                setFollowing(true);
                bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
              }}
              className="mx-auto flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground shadow-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              data-testid="astra-jump-to-latest"
            >
              <ArrowDown className="h-3 w-3" aria-hidden />
              {streaming ? "Astra is still working — jump to latest" : "Jump to latest"}
            </button>
          )}
          {onRetry && !streaming && !waiting && (last?.role === "astra" || error) && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              data-testid="astra-retry"
            >
              <RotateCcw className="h-3 w-3" aria-hidden />
              {error ? "Try that again" : "Ask again"}
            </button>
          )}
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => onSend(s.prompt)}
                  className="rounded-full border border-border px-3 py-1 text-xs hover:border-primary/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  data-testid="astra-suggestion"
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
          <Composer
            disabled={streaming || waiting}
            onSend={onSend}
            mentionables={mentionables}
            insert={composerInsert}
            decisions={decisions}
            canUse={canUse}
            onCommandNavigate={onCommandNavigate}
            placeholder={waiting ? "Confirm or choose Not now above to continue" : hasThread ? "Reply to Astra" : "Ask Astra, / for a command, @ for one of your agents"}
          />
        </div>
      </div>
    </div>
  );
}
