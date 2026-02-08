import { useState } from "react";
import { Server, ChevronDown } from "lucide-react";
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

const ENVIRONMENTS = [
  { id: "staging", label: "Staging", color: "text-amber-500" },
  { id: "pilot", label: "Pilot", color: "text-blue-500" },
  { id: "production", label: "Production", color: "text-green-500" },
] as const;

type EnvironmentId = (typeof ENVIRONMENTS)[number]["id"];

export function EnvironmentSelector() {
  const [env, setEnv] = useState<EnvironmentId>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("almp-env") as EnvironmentId) || "production";
    }
    return "production";
  });

  const current = ENVIRONMENTS.find((e) => e.id === env) || ENVIRONMENTS[2];

  const handleChange = (newEnv: EnvironmentId) => {
    setEnv(newEnv);
    localStorage.setItem("almp-env", newEnv);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-1.5 text-xs" data-testid="button-env-selector">
          <span className={`w-1.5 h-1.5 rounded-full ${current.id === "production" ? "bg-green-500" : current.id === "pilot" ? "bg-blue-500" : "bg-amber-500"}`} />
          <span className="hidden sm:inline">{current.label}</span>
          <ChevronDown className="w-3 h-3 opacity-50 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48" data-testid="menu-env-list">
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
          Environment
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ENVIRONMENTS.map((e) => (
          <DropdownMenuItem
            key={e.id}
            onClick={() => handleChange(e.id)}
            data-testid={`env-option-${e.id}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full mr-2 shrink-0 ${e.id === "production" ? "bg-green-500" : e.id === "pilot" ? "bg-blue-500" : "bg-amber-500"}`} />
            <span className="flex-1">{e.label}</span>
            {e.id === env && <Badge variant="outline" className="text-[10px]">Active</Badge>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
