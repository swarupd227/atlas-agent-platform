import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { ChevronDown, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export const ENVIRONMENTS = [
  { id: "staging", label: "Staging", color: "text-amber-500", bg: "bg-amber-500" },
  { id: "pilot", label: "Pilot", color: "text-blue-500", bg: "bg-blue-500" },
  { id: "production", label: "Production", color: "text-green-500", bg: "bg-green-500" },
] as const;

export type EnvironmentId = (typeof ENVIRONMENTS)[number]["id"];

interface EnvironmentContextType {
  env: EnvironmentId;
  setEnv: (env: EnvironmentId) => void;
  lockedEnv: EnvironmentId | null;
  setLockedEnv: (env: EnvironmentId | null) => void;
  pinnedEnv: EnvironmentId | null;
  setPinnedEnv: (env: EnvironmentId | null) => void;
  effectiveEnv: EnvironmentId;
}

const EnvironmentContext = createContext<EnvironmentContextType | null>(null);

export function EnvironmentProvider({ children }: { children: ReactNode }) {
  const [env, setEnvState] = useState<EnvironmentId>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("almp-env") as EnvironmentId) || "production";
    }
    return "production";
  });

  const [lockedEnv, setLockedEnv] = useState<EnvironmentId | null>(null);
  const [pinnedEnv, setPinnedEnv] = useState<EnvironmentId | null>(null);

  const setEnv = useCallback((newEnv: EnvironmentId) => {
    setEnvState(newEnv);
    localStorage.setItem("almp-env", newEnv);
  }, []);

  const effectiveEnv = lockedEnv || pinnedEnv || env;

  return (
    <EnvironmentContext.Provider value={{ env, setEnv, lockedEnv, setLockedEnv, pinnedEnv, setPinnedEnv, effectiveEnv }}>
      {children}
    </EnvironmentContext.Provider>
  );
}

export function useEnvironment() {
  const ctx = useContext(EnvironmentContext);
  if (!ctx) throw new Error("useEnvironment must be used within EnvironmentProvider");
  return ctx;
}

export function useEnvLock(lockTo: EnvironmentId | null) {
  const { setLockedEnv } = useEnvironment();
  useEffect(() => {
    setLockedEnv(lockTo);
    return () => setLockedEnv(null);
  }, [lockTo, setLockedEnv]);
}

export function EnvironmentSelector() {
  const ctx = useContext(EnvironmentContext);

  const fallbackEnv = useState<EnvironmentId>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("almp-env") as EnvironmentId) || "production";
    }
    return "production";
  });

  const env = ctx?.effectiveEnv ?? fallbackEnv[0];
  const setEnv = ctx?.setEnv ?? ((newEnv: EnvironmentId) => {
    fallbackEnv[1](newEnv);
    localStorage.setItem("almp-env", newEnv);
  });
  const isLocked = ctx?.lockedEnv != null;
  const isPinned = ctx?.pinnedEnv != null && ctx.lockedEnv == null;

  const current = ENVIRONMENTS.find((e) => e.id === env) || ENVIRONMENTS[2];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {isLocked ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" className="gap-1.5 text-xs" data-testid="button-env-selector" disabled>
                <span className={`w-1.5 h-1.5 rounded-full ${current.bg}`} />
                <span className="hidden sm:inline">{current.label}</span>
                <Lock className="w-3 h-3 opacity-50 shrink-0" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">This page is locked to {current.label}</p>
            </TooltipContent>
          </Tooltip>
        ) : (
          <Button variant="outline" className="gap-1.5 text-xs" data-testid="button-env-selector">
            <span className={`w-1.5 h-1.5 rounded-full ${current.bg}`} />
            <span className="hidden sm:inline">{current.label}</span>
            {isPinned && <Lock className="w-2.5 h-2.5 opacity-40 shrink-0" />}
            <ChevronDown className="w-3 h-3 opacity-50 shrink-0" />
          </Button>
        )}
      </DropdownMenuTrigger>
      {!isLocked && (
        <DropdownMenuContent align="end" className="w-52" data-testid="menu-env-list">
          <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
            Environment
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {ENVIRONMENTS.map((e) => (
            <DropdownMenuItem
              key={e.id}
              onClick={() => setEnv(e.id)}
              data-testid={`env-option-${e.id}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full mr-2 shrink-0 ${e.bg}`} />
              <span className="flex-1">{e.label}</span>
              {e.id === env && <Badge variant="outline" className="text-[10px]">Active</Badge>}
            </DropdownMenuItem>
          ))}
          {isPinned && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => ctx?.setPinnedEnv(null)}
                className="text-xs text-muted-foreground"
                data-testid="env-clear-pin"
              >
                Clear agent environment pin
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      )}
    </DropdownMenu>
  );
}
