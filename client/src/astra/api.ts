import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getApiHeaders } from "@/lib/queryClient";
import { postSse, SseHttpError } from "@/lib/sse";
import type { ArtifactRef, AstraEvent, AstraMessage, LiveStep, NeedsYou, ThreadStatus, ThreadSummary } from "./types";
import type { Mentionable } from "./mention";
import { keepWatching, nextDelayMs, watchOutcome } from "./watch-turn";

const PREVIEW_OVERRIDE_KEY = "almp-astra-shell";

export async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include", headers: getApiHeaders() });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

/**
 * Whether the Astra Workspace is on for this deployment. The server answers
 * 404 for every /api/astra route when it's off, so a 404 means off -- quietly,
 * without the global error toast. `almp-astra-shell=off` in localStorage hides
 * the entry point for one browser even when the server has it on.
 */
export function useAstraEnabled(): { enabled: boolean; isLoading: boolean; signedOut: boolean } {
  const { data, isLoading } = useQuery<number>({
    queryKey: ["/api/astra/status"],
    queryFn: async () => {
      const res = await fetch("/api/astra/status", { credentials: "include", headers: getApiHeaders() });
      return res.status;
    },
    staleTime: 60_000,
    retry: false,
  });
  let override: string | null = null;
  try {
    override = localStorage.getItem(PREVIEW_OVERRIDE_KEY);
  } catch {
    /* storage blocked */
  }
  // 401: the session ended -- that says nothing about whether the preview is on.
  return { enabled: data === 200 && override !== "off", isLoading, signedOut: data === 401 };
}

/** What needs the person, for the rail and for the /approve and /reject pickers. */
export function useNeedsYou() {
  return useQuery<NeedsYou | null>({
    queryKey: ["/api/astra/needs-you"],
    queryFn: async () => {
      const res = await fetch("/api/astra/needs-you", { credentials: "include", headers: getApiHeaders() });
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    },
    refetchInterval: 60_000,
    retry: false,
  });
}

export function useThreads() {
  return useQuery<ThreadSummary[]>({
    queryKey: ["/api/astra/threads"],
    queryFn: () => getJson("/api/astra/threads"),
  });
}

/** The agents the @ menu offers (the ones run_agent accepts). Fetched once per shell; filtered locally. */
export function useMentionables() {
  return useQuery<Mentionable[]>({
    queryKey: ["/api/astra/mentionables"],
    queryFn: () => getJson("/api/astra/mentionables"),
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export async function createThread(): Promise<ThreadSummary> {
  const res = await apiRequest("POST", "/api/astra/threads", {});
  return res.json();
}

export interface LiveTurn {
  working: string | null;
  steps: LiveStep[];
  /** The user's text, shown straight away while the turn runs. */
  pendingUserText: string | null;
}

const IDLE_TURN: LiveTurn = { working: null, steps: [], pendingUserText: null };

/**
 * A thread and its live turn. Messages come from the server (saved before they
 * are streamed), so a reload always shows what the stream showed.
 */
export function useThread(threadId: string | null, options: { industryId?: string | null; onArtifact?: (a: ArtifactRef) => void }) {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<AstraMessage[]>([]);
  const [status, setStatus] = useState<ThreadStatus>("idle");
  const [title, setTitle] = useState<string>("");
  const [live, setLive] = useState<LiveTurn>(IDLE_TURN);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  /** A thread just created here: nothing to load, and loading could wipe the first message. */
  const freshRef = useRef<string | null>(null);
  const onArtifact = useRef(options.onArtifact);
  onArtifact.current = options.onArtifact;

  /**
   * The stream dropped but the turn is still running: check back until it
   * settles, then show what it produced. Stops when the conversation is
   * opened elsewhere or the turn is abandoned (watch-turn.ts).
   */
  const watchUntilSettled = useCallback(async (id: string, controller: AbortController) => {
    const startedAt = Date.now();
    for (let attempt = 0; ; attempt++) {
      await new Promise((r) => setTimeout(r, nextDelayMs(attempt)));
      if (controller.signal.aborted || abortRef.current !== controller) return;
      let thread: { status: string } | null = null;
      try {
        thread = (await getJson<{ thread: ThreadSummary }>(`/api/astra/threads/${id}`)).thread;
      } catch {
        // A check that fails is not an answer: try again while there is time.
      }
      const status = thread?.status ?? "running";
      if (!keepWatching(status, Date.now() - startedAt)) {
        const outcome = watchOutcome(status);
        if (outcome.settled) await load(id, false);
        setError(outcome.message);
        return;
      }
    }
  }, []);

  const load = useCallback(async (id: string, keepError = false) => {
    setLoading(true);
    try {
      const data = await getJson<{ thread: ThreadSummary; messages: AstraMessage[] }>(`/api/astra/threads/${id}`);
      setMessages(data.messages);
      setStatus(data.thread.status);
      setTitle(data.thread.title);
      if (!keepError) setError(null);
      const lastWithArtifact = [...data.messages].reverse().find((m) => m.artifacts.length > 0);
      if (lastWithArtifact) onArtifact.current?.(lastWithArtifact.artifacts[lastWithArtifact.artifacts.length - 1]);
    } catch (err) {
      setError(err instanceof Error && err.message === "404" ? "This conversation isn't available." : "Couldn't load this conversation.");
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Opening the thread we just created and are already streaming to: keep going.
    if (threadId && freshRef.current === threadId) return;
    abortRef.current?.abort();
    // Detach it too, so its end-of-stream resync can't load the old thread over this one.
    abortRef.current = null;
    freshRef.current = null;
    setLive(IDLE_TURN);
    setStreaming(false);
    if (threadId) void load(threadId);
    else {
      setMessages([]);
      setStatus("idle");
      setTitle("");
      setError(null);
    }
  }, [threadId, load]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const handle = useCallback((event: AstraEvent) => {
    switch (event.type) {
      case "turn_started":
        setStatus("running");
        break;
      case "working":
        setLive((l) => ({ ...l, working: event.label }));
        break;
      case "tool_start":
        setLive((l) => ({ ...l, steps: [...l.steps, { tool: event.tool, state: "running" }] }));
        break;
      case "tool_result":
        setLive((l) => {
          const steps = [...l.steps];
          const i = steps.map((s) => s.tool).lastIndexOf(event.tool);
          if (i >= 0 && steps[i].state === "running") steps[i] = { tool: event.tool, state: event.ok ? "ok" : "failed", preview: event.preview };
          else steps.push({ tool: event.tool, state: event.ok ? "ok" : "failed", preview: event.preview });
          return { ...l, steps };
        });
        if (event.artifact) onArtifact.current?.(event.artifact);
        break;
      case "artifact":
        onArtifact.current?.(event.artifact);
        break;
      case "awaiting_confirmation":
        setMessages((m) => [...m, event.message]);
        setStatus("awaiting_confirmation");
        break;
      case "message":
        setMessages((m) => [...m, event.message]);
        break;
      case "done":
        setStatus(event.status);
        break;
      case "error":
        setError(event.message);
        break;
    }
  }, []);

  const stream = useCallback(
    async (id: string, path: string, body: unknown, userText: string | null) => {
      const url = `/api/astra/threads/${id}/${path}`;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setError(null);
      setStreaming(true);
      setLive({ working: "Thinking", steps: [], pendingUserText: userText });
      if (userText) {
        // Shown straight away; the resync at the end replaces it with the saved message.
        setMessages((m) => [
          ...m,
          { id: `local-${Date.now()}`, threadId: id, role: "user", markdown: userText, artifacts: [], sources: [], suggestions: [], proof: null, pendingAction: null, createdAt: new Date().toISOString() },
        ]);
      }
      let dropped = false;
      try {
        await postSse<AstraEvent>(url, { body, headers: getApiHeaders(), onEvent: handle, signal: controller.signal, idleMs: 90_000 });
      } catch (err) {
        if (controller.signal.aborted && abortRef.current !== controller) return;
        if (err instanceof SseHttpError) setError(err.status === 429 ? "Too many requests right now. Wait a moment and try again." : err.message);
        else {
          // The turn keeps running on the server when the stream drops (a proxy
          // timeout, a lost network). Watch for the answer instead of telling
          // the person to reload.
          dropped = true;
          setError("The live updates stopped. The work is still running on the server — watching for the result.");
        }
      } finally {
        if (abortRef.current === controller) {
          setStreaming(false);
          setLive(IDLE_TURN);
          freshRef.current = null;
          // Resync with what the server saved (the user message, the answer, the status).
          await load(id, true);
          if (dropped) await watchUntilSettled(id, controller);
          queryClient.invalidateQueries({ queryKey: ["/api/astra/threads"] });
          // A turn may have decided something or created an outcome.
          queryClient.invalidateQueries({ queryKey: ["/api/astra/needs-you"] });
          queryClient.invalidateQueries({ queryKey: ["/api/astra/home"] });
        }
      }
    },
    [handle, load, queryClient],
  );

  /** Send to the open thread, or to `toThread` -- a thread created a moment ago that isn't open yet. */
  const send = useCallback(
    (text: string, toThread?: string) => {
      const id = toThread ?? threadId;
      if (!id) return;
      if (toThread) {
        freshRef.current = toThread;
        setMessages([]);
        setStatus("idle");
        setTitle("New conversation");
      }
      return stream(id, "messages/stream", { text, industryId: options.industryId ?? null }, text);
    },
    [stream, threadId, options.industryId],
  );

  const decide = useCallback(
    (actionId: string, decision: "confirm" | "cancel") => {
      if (!threadId) return;
      // The card shows the decision straight away, not "No longer pending", while the turn it resumes runs.
      setMessages((ms) =>
        ms.map((m) =>
          m.pendingAction?.id === actionId ? { ...m, pendingAction: { ...m.pendingAction, decision: decision === "confirm" ? "confirmed" : "declined" } } : m,
        ),
      );
      return stream(threadId, `actions/${actionId}/stream`, { decision, industryId: options.industryId ?? null }, null);
    },
    [stream, threadId, options.industryId],
  );

  /**
   * Ask the running turn to stop. The turn ends itself, on the server, with a
   * message saying so -- the stream is not dropped, because dropping it would
   * leave the turn running and spending.
   */
  const [stopping, setStopping] = useState(false);
  const stop = useCallback(async () => {
    if (!threadId) return;
    setStopping(true);
    try {
      const res = await apiRequest("POST", `/api/astra/threads/${threadId}/stop`);
      if (!res.ok) setStopping(false);
    } catch {
      setStopping(false);
    }
  }, [threadId]);

  // A new turn starts unstopped.
  useEffect(() => {
    if (streaming) return;
    setStopping(false);
  }, [streaming]);

  return { messages, status, title, setTitle, live, error, loading, streaming, send, decide, stop, stopping };
}
