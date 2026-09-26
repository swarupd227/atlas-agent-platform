import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IndustryProvider, useIndustry } from "@/components/industry-provider";
import { RoleProvider, useRole, type PermissionAction } from "@/components/role-provider";
import { createThread, useAstraEnabled, useMentionables, useNeedsYou, useThread, useThreads } from "./api";
import type { ComposerInsert } from "./composer";
import { Rail } from "./rail";
import { Thread } from "./thread";
import { Library } from "./library";
import { AstraCommandPalette } from "./command-palette";
import { ArtifactPane } from "./artifact-pane";
import type { ArtifactRef } from "./types";

/** Puts .astra on <html> while mounted, so portals (tooltips, dialogs) get the palette too. */
function useAstraTheme() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("astra");
    return () => root.classList.remove("astra");
  }, []);
}

/** How a waiting item is named when a picker puts it into the message. */
const DECISION_NOUN: Record<string, string> = {
  approval: "approval",
  recommendation: "recommendation",
  alert: "alert",
  governance: "policy exception",
  autonomy: "tool request",
};

function Workspace() {
  const [location, navigate] = useLocation();
  const threadId = location.startsWith("/t/") ? decodeURIComponent(location.slice(3)) : null;
  const onLibrary = location === "/library";
  const { industry, industrySource, tenantIndustryId, organizationName } = useIndustry();
  const personalView = industrySource === "local" && !!tenantIndustryId;
  const queryClient = useQueryClient();
  const { data: threads = [] } = useThreads();
  const [artifact, setArtifact] = useState<ArtifactRef | null>(null);
  const [creating, setCreating] = useState(false);
  const { data: mentionables = [] } = useMentionables();
  // The @ menu also offers teams; the rail's "Your agents" lists agents only.
  const railAgents = useMemo(() => mentionables.filter((m) => m.kind !== "team"), [mentionables]);
  const [composerInsert, setComposerInsert] = useState<ComposerInsert | null>(null);
  // /approve and /reject pick from what's actually waiting; the rail reads the same list.
  const { data: needsYou } = useNeedsYou();
  const decisions = useMemo(
    () =>
      (needsYou?.needsDecision ?? [])
        // An alert is acknowledged, not approved or rejected; /needs still lists them.
        .filter((i) => i.canDecideHere && i.source !== "alert")
        .map((i) => ({ id: i.sourceId, title: i.title, noun: DECISION_NOUN[i.source] ?? "item" })),
    [needsYou],
  );
  const { getPermission } = useRole();
  const canUse = useCallback((permission?: PermissionAction) => !permission || getPermission(permission).access !== "denied", [getPermission]);
  const mention = useCallback((name: string) => setComposerInsert({ text: `@${name} `, nonce: Date.now() }), []);

  // A result opens by itself only where the pane sits beside the conversation;
  // on narrower screens it would cover the answer, so it waits for a tap.
  const autoOpen = useCallback((a: ArtifactRef) => {
    if (window.matchMedia("(min-width: 1024px)").matches) setArtifact(a);
  }, []);
  const thread = useThread(threadId, { industryId: industry?.id ?? null, onArtifact: autoOpen });
  // Same lookup Thread itself uses for its in-message ConfirmCards -- an artifact pane (e.g. a
  // live team run) showing a pending approval needs the same pendingAction id to decide it for
  // real, rather than posting a freeform chat message that can't resolve the gate on its own.
  const activeActionId = useMemo(
    () => (thread.status === "awaiting_confirmation" ? [...thread.messages].reverse().find((m) => m.pendingAction && !m.pendingAction.decision)?.pendingAction?.id ?? null : null),
    [thread.status, thread.messages],
  );

  useEffect(() => {
    if (!threadId) setArtifact(null);
  }, [threadId]);

  const send = useCallback(
    async (text: string) => {
      if (threadId) return thread.send(text);
      if (creating) return;
      setCreating(true);
      try {
        const created = await createThread();
        void thread.send(text, created.id);
        navigate(`/t/${encodeURIComponent(created.id)}`);
        queryClient.invalidateQueries({ queryKey: ["/api/astra/threads"] });
      } finally {
        setCreating(false);
      }
    },
    [threadId, thread, creating, navigate, queryClient],
  );

  const newConversation = () => {
    setArtifact(null);
    navigate("/");
  };

  return (
    <div
      className={`grid h-screen w-full overflow-hidden bg-background text-foreground [font-family:var(--font-sans)] md:grid-cols-[260px_minmax(0,1fr)] ${
        artifact ? "lg:grid-cols-[260px_minmax(0,1fr)_minmax(340px,420px)]" : ""
      }`}
    >
      <div className="hidden min-h-0 border-r border-border md:block">
        <Rail
          threads={threads}
          activeId={threadId}
          onSelect={(id) => navigate(`/t/${encodeURIComponent(id)}`)}
          onNew={newConversation}
          onAskAbout={(text) => void send(text)}
          agents={railAgents}
          onMention={mention}
          view={onLibrary ? "library" : threadId ? "thread" : "home"}
          onLibrary={() => {
            setArtifact(null);
            navigate("/library");
          }}
        />
      </div>

      <main className="flex min-h-0 min-w-0 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
          <Link href="~/dashboard" className="md:hidden" aria-label="Back to the classic app">
            <ArrowLeft className="h-4 w-4 text-muted-foreground" />
          </Link>
          <h1 className="min-w-0 flex-1 truncate text-sm font-medium">{onLibrary ? "Library" : threadId ? thread.title || "Conversation" : "Astra Cowork"}</h1>
          {industry && (
            <span
              className="hidden shrink-0 rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground sm:inline"
              title={
                personalView
                  ? `Your own view. ${organizationName ?? "Your organization"}'s industry is set separately.`
                  : industrySource === "tenant"
                    ? `${organizationName ?? "Your organization"}'s industry`
                    : "Industry chosen in this browser; not set for the organization"
              }
              data-testid="astra-industry-badge"
            >
              {personalView ? `Viewing as ${industry.label}` : industry.label}
            </span>
          )}
          {!onLibrary && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs md:hidden" onClick={() => navigate("/library")}>
              Library
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs md:hidden" onClick={newConversation}>
            <Plus className="h-3.5 w-3.5" /> New
          </Button>
        </header>
        <div className="min-h-0 flex-1">
          {onLibrary ? (
            <Library onAsk={(text) => void send(text)} />
          ) : (
          <Thread
            // Keyed by the conversation: without this the Composer instance
            // survives a switch and an unsent draft written in one
            // conversation follows you into the next.
            key={threadId ?? "home"}
            messages={thread.messages}
            status={thread.status}
            live={thread.live}
            streaming={thread.streaming || creating}
            error={thread.error}
            hasThread={!!threadId}
            onSend={(text) => void send(text)}
            onStop={() => void thread.stop()}
            stopping={thread.stopping}
            onEdit={(text) => setComposerInsert({ text, nonce: Date.now(), replace: true })}
            onRetry={() => {
              // Ask the same thing again, as a new message: nothing in the
              // conversation is rewritten or hidden.
              const lastAsked = [...thread.messages].reverse().find((m) => m.role === "user")?.markdown;
              if (lastAsked) void send(lastAsked);
            }}
            onDecide={(actionId, decision) => void thread.decide(actionId, decision)}
            onOpenArtifact={setArtifact}
            mentionables={mentionables}
            composerInsert={composerInsert}
            decisions={decisions}
            canUse={canUse}
            onCommandNavigate={(href) => (href === "library" ? navigate("/library") : href === "new" ? newConversation() : navigate(`~${href}`))}
          />
          )}
        </div>
      </main>

      <AstraCommandPalette
        threads={threads}
        onSend={(text) => void send(text)}
        onNavigate={(href, inShell) => navigate(inShell ? href : `~${href}`)}
      />

      {artifact && (
        <div className="fixed inset-0 z-40 min-h-0 lg:static lg:z-auto">
          <ArtifactPane
            artifact={artifact}
            onClose={() => setArtifact(null)}
            onAsk={(text) => void send(text)}
            onDecide={(actionId, decision) => void thread.decide(actionId, decision)}
            activeActionId={activeActionId}
          />
        </div>
      )}
    </div>
  );
}

function NotEnabled({ signedOut }: { signedOut: boolean }) {
  return (
    <div className="flex h-screen items-center justify-center bg-background p-6 text-foreground">
      <div className="max-w-sm space-y-3">
        <h1 className="text-lg font-semibold [font-family:var(--astra-display)]">
          {signedOut ? "Your session has ended" : "Astra Cowork isn't on here"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {signedOut
            ? "Sign in again to continue. Your conversations are saved."
            : "An administrator can turn on the preview for this deployment. Everything else works as before."}
        </p>
        <Button asChild variant="outline" size="sm">
          {signedOut ? <a href="/dashboard">Sign in</a> : <Link href="~/dashboard">Back to the app</Link>}
        </Button>
      </div>
    </div>
  );
}

/** /astra -- the conversation-first workspace (docs/ux/agentic-modernization.md). */
export default function AstraLayout() {
  useAstraTheme();
  const { enabled, isLoading, signedOut } = useAstraEnabled();
  if (isLoading) return <div className="h-screen bg-background" />;
  if (!enabled) return <NotEnabled signedOut={signedOut} />;
  return (
    <IndustryProvider>
      <RoleProvider>
        <Workspace />
      </RoleProvider>
    </IndustryProvider>
  );
}
