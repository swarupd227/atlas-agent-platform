import { useEffect, useRef } from "react";
import { Check, CircleAlert, Loader2, PanelRight } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { Composer } from "./composer";
import { ConfirmCard } from "./confirm-card";
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
}: {
  message: AstraMessage;
  activeActionId: string | null;
  busy: boolean;
  onDecide: (actionId: string, decision: "confirm" | "cancel") => void;
  onOpenArtifact: (a: ArtifactRef) => void;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
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
        {message.markdown && <Markdown text={message.markdown} className="astra-md text-sm" />}

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

export function Thread({
  messages,
  status,
  live,
  streaming,
  error,
  hasThread,
  onSend,
  onDecide,
  onOpenArtifact,
}: {
  messages: AstraMessage[];
  status: ThreadStatus;
  live: LiveTurn;
  streaming: boolean;
  error: string | null;
  hasThread: boolean;
  onSend: (text: string) => void;
  onDecide: (actionId: string, decision: "confirm" | "cancel") => void;
  onOpenArtifact: (a: ArtifactRef) => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages.length, live.steps.length, live.working, streaming]);

  const waiting = status === "awaiting_confirmation";
  const activeAction = waiting ? [...messages].reverse().find((m) => m.pendingAction && !m.pendingAction.decision)?.pendingAction ?? null : null;
  const last = messages[messages.length - 1];
  const suggestions = !streaming && !waiting && last?.role === "astra" ? last.suggestions : [];
  const empty = messages.length === 0 && !streaming;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-6">
          {empty && (
            <div className="pt-[10vh]">
              <h1 className="text-2xl font-semibold tracking-tight [font-family:var(--astra-display)] text-balance">
                What should your agents do?
              </h1>
              <p className="mt-2 max-w-prose text-sm text-muted-foreground">
                Ask about your agents, connectors and industry context, or have an agent do the work. Anything that changes the platform
                waits for your confirmation, and every answer shows what it's based on.
              </p>
              <div className="mt-6 grid gap-2 sm:grid-cols-2">
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
            />
          ))}

          {streaming && (
            <div className="flex gap-3" aria-live="polite">
              <AstraMark />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary" aria-hidden />
                  {live.working ?? "Working"}
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
            placeholder={waiting ? "Confirm or choose Not now above to continue" : hasThread ? "Reply to Astra" : "Ask Astra"}
          />
        </div>
      </div>
    </div>
  );
}
