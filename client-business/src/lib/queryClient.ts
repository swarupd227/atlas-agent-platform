import { QueryClient, QueryFunction } from "@tanstack/react-query";

const DEV_ORG_ID = "0c9bcf16-cdd9-45e2-87f6-6a839a7f7056";

let cachedSecurityMode: "demo" | "production" | null = null;

export function setSecurityMode(mode: "demo" | "production") {
  cachedSecurityMode = mode;
}

function getOrgId(): string {
  return import.meta.env.VITE_ORG_ID || DEV_ORG_ID;
}

function getRole(): string {
  if (typeof window !== "undefined") {
    return localStorage.getItem("almp-role") || "admin";
  }
  return "admin";
}

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "x-organization-id": getOrgId(),
  };
  if (cachedSecurityMode !== "production") {
    headers["X-Role"] = getRole();
  }
  return headers;
}

/**
 * Resolve an API path to a full URL.
 * - In dev: path is passed as-is; Vite's proxy routes /api/* → localhost:5000.
 * - In production: VITE_API_BASE_URL is prefixed so /api/* goes to the IT
 *   deployment (e.g. https://agent-lifecycle-management-platform.replit.app).
 */
function resolveUrl(path: string): string {
  const base = import.meta.env.VITE_API_BASE_URL;
  if (base && !import.meta.env.DEV) {
    // Remove trailing slash from base, ensure path starts with /
    return `${base.replace(/\/$/, "")}${path.startsWith("/") ? "" : "/"}${path}`;
  }
  return path;
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
): Promise<Response> {
  const resolvedUrl = resolveUrl(url);
  const headers: Record<string, string> = { ...getHeaders() };
  if (data) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(resolvedUrl, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
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
    const path = queryKey.join("/") as string;
    const res = await fetch(resolveUrl(path), {
      credentials: "include",
      headers: getHeaders(),
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
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
