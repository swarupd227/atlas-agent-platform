import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import { useRole, ROLES } from "./role-provider";

export function RoleSwitcher() {
  const { role, setRole } = useRole();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-1.5 text-xs" data-testid="button-role-switcher">
          <role.icon className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden sm:inline">{role.label}</span>
          <ChevronDown className="w-3 h-3 opacity-50 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72" data-testid="menu-role-list">
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
          Switch Persona
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ROLES.map((r) => (
          <DropdownMenuItem
            key={r.id}
            onClick={() => setRole(r.id)}
            className={`flex items-start gap-3 p-2.5 cursor-pointer ${role.id === r.id ? "bg-accent" : ""}`}
            data-testid={`role-option-${r.id}`}
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-md bg-muted shrink-0 mt-0.5">
              <r.icon className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-sm font-medium leading-tight" data-testid={`text-role-label-${r.id}`}>{r.label}</span>
              <span className="text-[11px] text-muted-foreground leading-snug" data-testid={`text-role-desc-${r.id}`}>{r.description}</span>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
