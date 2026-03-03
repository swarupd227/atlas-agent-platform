import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { setSecurityMode as syncSecurityMode } from "@/lib/queryClient";

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
        }
      } catch {
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
