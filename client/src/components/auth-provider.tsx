import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { setSecurityMode as syncSecurityMode } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";

interface AuthUser {
  id?: string;
  username: string;
  role: string;
  email: string | null;
}

interface AuthContextType {
  securityMode: "demo" | "production" | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AuthUser | null;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  register: (username: string, password: string, email?: string) => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [securityMode, setSecurityMode] = useState<"demo" | "production" | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    async function init() {
      try {
        const modeRes = await fetch("/api/auth/mode");
        const modeData = await modeRes.json();
        const mode = modeData.mode as "demo" | "production";
        setSecurityMode(mode);
        syncSecurityMode(mode);

        if (mode === "demo") {
          setIsAuthenticated(true);
          setUser({ username: "demo", role: "admin", email: null });
          setIsLoading(false);
          return;
        }

        const meRes = await fetch("/api/auth/me", { credentials: "include" });
        if (meRes.ok) {
          const meData = await meRes.json();
          setUser(meData.user);
          setIsAuthenticated(true);
        } else if (meRes.status !== 401) {
          // A genuine 401 just means "not logged in" -- expected, stay
          // silent and fall through to the unauthenticated state below.
          // Any other non-ok status (500, auth service misconfigured, etc.)
          // is an unexpected failure that would otherwise look identical to
          // "not logged in" -- surface it instead of hiding it.
          toast({
            title: "Couldn't verify your session",
            description: "Please retry, or refresh the page.",
            variant: "destructive",
          });
        }
      } catch {
        // fetch() only rejects on network-level failures (offline, DNS,
        // CORS) or when a response body fails to parse as JSON -- both are
        // unexpected failures, not "not logged in", so surface them here too
        // instead of silently leaving the user looking merely logged out.
        toast({
          title: "Couldn't verify your session",
          description: "Please retry, or refresh the page.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    }
    init();
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const data = await res.json();
        return { success: false, error: data.message || "Login failed" };
      }
      const data = await res.json();
      setUser(data.user);
      setIsAuthenticated(true);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setUser(null);
    setIsAuthenticated(false);
  }, []);

  const register = useCallback(async (username: string, password: string, email?: string) => {
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password, email }),
      });
      if (!res.ok) {
        const data = await res.json();
        return { success: false, error: data.message || "Registration failed" };
      }
      const data = await res.json();
      setUser(data.user);
      setIsAuthenticated(true);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }, []);

  return (
    <AuthContext.Provider value={{ securityMode, isAuthenticated, isLoading, user, login, logout, register }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
