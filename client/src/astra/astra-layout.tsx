import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IndustryProvider, useIndustry } from "@/components/industry-provider";
import { RoleProvider } from "@/components/role-provider";
import { createThread, useAstraEnabled, useThread, useThreads } from "./api";
import { Rail } from "./rail";
import { Thread } from "./thread";
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

function Workspace() {
  const [location, navigate] = useLocation();
  const threadId = location.startsWith("/t/") ? decodeURIComponent(location.slice(3)) : null;
  const { industry } = useIndustry();
  const queryClient = useQueryClient();
  const { data: threads = [] } = useThreads();
  const [artifact, setArtifact] = useState<ArtifactRef | null>(null);
  const [creating, setCreating] = useState(false);

  const thread = useThread(threadId, { industryId: industry?.id ?? null, onArtifact: setArtifact });

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
        />
      </div>

      <main className="flex min-h-0 min-w-0 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
          <Link href="~/dashboard" className="md:hidden" aria-label="Back to the classic app">
            <ArrowLeft className="h-4 w-4 text-muted-foreground" />
          </Link>
          <h1 className="min-w-0 flex-1 truncate text-sm font-medium">{threadId ? thread.title || "Conversation" : "New conversation"}</h1>
          {industry && (
            <span className="hidden shrink-0 rounded border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground sm:inline" title="Industry context sent with each message">
              {industry.label}
            </span>
          )}
          <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs md:hidden" onClick={newConversation}>
            <Plus className="h-3.5 w-3.5" /> New
          </Button>
        </header>
        <div className="min-h-0 flex-1">
          <Thread
            messages={thread.messages}
            status={thread.status}
            live={thread.live}
            streaming={thread.streaming || creating}
            error={thread.error}
            hasThread={!!threadId}
            onSend={(text) => void send(text)}
            onDecide={(actionId, decision) => void thread.decide(actionId, decision)}
            onOpenArtifact={setArtifact}
          />
        </div>
      </main>

      {artifact && (
        <div className="fixed inset-0 z-40 min-h-0 lg:static lg:z-auto">
          <ArtifactPane artifact={artifact} onClose={() => setArtifact(null)} />
        </div>
      )}
    </div>
  );
}

function NotEnabled() {
  return (
    <div className="flex h-screen items-center justify-center bg-background p-6 text-foreground">
      <div className="max-w-sm space-y-3">
        <h1 className="text-lg font-semibold [font-family:var(--astra-display)]">Astra Workspace isn't on here</h1>
        <p className="text-sm text-muted-foreground">An administrator can turn on the preview for this deployment. Everything else works as before.</p>
        <Button asChild variant="outline" size="sm">
          <Link href="~/dashboard">Back to the app</Link>
        </Button>
      </div>
    </div>
  );
}

/** /astra -- the conversation-first workspace (docs/ux/agentic-modernization.md). */
export default function AstraLayout() {
  useAstraTheme();
  const { enabled, isLoading } = useAstraEnabled();
  if (isLoading) return <div className="h-screen bg-background" />;
  if (!enabled) return <NotEnabled />;
  return (
    <IndustryProvider>
      <RoleProvider>
        <Workspace />
      </RoleProvider>
    </IndustryProvider>
  );
}
