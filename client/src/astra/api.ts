import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getApiHeaders } from "@/lib/queryClient";
import { postSse, SseHttpError } from "@/lib/sse";
import type { ArtifactRef, AstraEvent, AstraMessage, LiveStep, ThreadStatus, ThreadSummary } from "./types";

const PREVIEW_OVERRIDE_KEY = "almp-astra-shell";

async function getJson<T>(url: string): Promise<T> {
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
export function useAstraEnabled(): { enabled: boolean; isLoading: boolean } {
  const { data, isLoading } = useQuery<boolean>({
    queryKey: ["/api/astra/status"],
    queryFn: async () => {
      const res = await fetch("/api/astra/status", { credentials: "include", headers: getApiHeaders() });
      return res.ok;
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
  return { enabled: !!data && override !== "off", isLoading };
}

export function useThreads() {
  return useQuery<ThreadSummary[]>({
    queryKey: ["/api/astra/threads"],
    queryFn: () => getJson("/api/astra/threads"),
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
      try {
        await postSse<AstraEvent>(url, { body, headers: getApiHeaders(), onEvent: handle, signal: controller.signal, idleMs: 90_000 });
      } catch (err) {
        if (controller.signal.aborted && abortRef.current !== controller) return;
        if (err instanceof SseHttpError) setError(err.status === 429 ? "Too many requests right now. Wait a moment and try again." : err.message);
        else setError("The connection dropped. What was already done is saved; reload the conversation to see it.");
      } finally {
        if (abortRef.current === controller) {
          setStreaming(false);
          setLive(IDLE_TURN);
          freshRef.current = null;
          // Resync with what the server saved (the user message, the answer, the status).
          await load(id, true);
          queryClient.invalidateQueries({ queryKey: ["/api/astra/threads"] });
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
      return stream(threadId, `actions/${actionId}/stream`, { decision, industryId: options.industryId ?? null }, null);
    },
    [stream, threadId, options.industryId],
  );

  return { messages, status, title, live, error, loading, streaming, send, decide };
}
