import { useIndustry, INDUSTRIES } from "./industry-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Check, ChevronDown } from "lucide-react";

export function IndustrySelector() {
  const { industry, clearIndustry, isSelected } = useIndustry();

  if (!isSelected) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5" data-testid="button-industry-selector">
          {industry && (
            <industry.icon className="h-3.5 w-3.5" style={{ color: industry.color }} />
          )}
          <span className="hidden sm:inline text-xs">
            {industry?.shortLabel || "Industry"}
          </span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64" data-testid="menu-industry-selector">
        <DropdownMenuLabel className="text-xs">Industry Workspace</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {INDUSTRIES.map((ind) => {
          const Icon = ind.icon;
          const isActive = industry?.id === ind.id;
          return (
            <DropdownMenuItem
              key={ind.id}
              onClick={() => clearIndustry()}
              className="flex items-center gap-2 cursor-pointer"
              data-testid={`menu-item-industry-${ind.id}`}
            >
              <Icon className="h-4 w-4 shrink-0" style={{ color: ind.color }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm">{ind.label}</span>
                  {isActive && <Check className="h-3 w-3 text-primary shrink-0" />}
                </div>
                {ind.id !== "custom" && (
                  <span className="text-xs text-muted-foreground">{ind.agentSkills} skills</span>
                )}
              </div>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5">
          <Badge variant="outline" className="text-xs w-full justify-center">
            {industry?.ontology.split("(")[0].trim()}
          </Badge>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
