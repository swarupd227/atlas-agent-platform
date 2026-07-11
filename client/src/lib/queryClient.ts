import { QueryClient, QueryFunction, QueryCache, MutationCache } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

let cachedSecurityMode: "demo" | "production" | null = null;

export function setSecurityMode(mode: "demo" | "production") {
  cachedSecurityMode = mode;
}

function getRole(): string {
  if (typeof window !== "undefined") {
    return localStorage.getItem("almp-role") || "admin";
  }
  return "admin";
}

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (cachedSecurityMode !== "production") {
    headers["X-Role"] = getRole();
  }
  return headers;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  signal?: AbortSignal,
): Promise<Response> {
  const headers: Record<string, string> = { ...getHeaders() };
  if (data) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
    signal,
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = queryKey.join("/") as string;
    const res = await fetch(url, {
      credentials: "include",
      headers: getHeaders(),
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    try {
      return await res.json();
    } catch (err) {
      // A response that's ok (2xx) but isn't valid JSON almost always means
      // the request actually hit the SPA's index.html fallback rather than
      // a real API route -- usually because `url` came out malformed (e.g.
      // a non-string queryKey element). Surface the URL so this is
      // diagnosable from the error toast alone, not just server logs (which
      // won't show it either, since it never reached an /api handler).
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Invalid JSON from ${url}: ${message}`);
    }
  };

// ── Global error feedback (UX-audit F-2) ─────────────────────────────────────
// 95% of pages never surfaced query/mutation failures; users saw silent empty
// UI. These cache-level handlers make "nothing fails silently" the default.

// Throttle query-failure toasts: during an outage dozens of queries fail at
// once — one message per window is signal, thirty are noise.
let lastQueryErrorToastAt = 0;
const QUERY_ERROR_TOAST_WINDOW_MS = 10_000;

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      if (isAbort(error)) return;
      const now = Date.now();
      if (now - lastQueryErrorToastAt < QUERY_ERROR_TOAST_WINDOW_MS) return;
      lastQueryErrorToastAt = now;
      toast({
        title: "Some data failed to load",
        description: error instanceof Error ? error.message.slice(0, 140) : "Check your connection and retry.",
        variant: "destructive",
      });
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (isAbort(error)) return;
      // Pages with their own onError already give tailored feedback — don't double-toast.
      if (mutation.options.onError) return;
      toast({
        title: "Action failed",
        description: error instanceof Error ? error.message.slice(0, 140) : "The request could not be completed.",
        variant: "destructive",
      });
    },
  }),
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
