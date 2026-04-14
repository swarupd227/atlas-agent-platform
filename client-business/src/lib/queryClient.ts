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
  const headers: Record<string, string> = { ...getHeaders() };
  if (data) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(url, {
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
    const res = await fetch(queryKey.join("/") as string, {
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
