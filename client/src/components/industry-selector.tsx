import { useState } from "react";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Check, ChevronDown } from "lucide-react";

export function IndustrySelector() {
  const { industry, clearIndustry, subVertical, setSubVertical, isSelected } = useIndustry();
  // Switching industry runs clearIndustry(), which drops the whole workspace
  // configuration (sub-vertical, departments, jurisdictions, integrations, data
  // classification) and re-opens the 3-step setup wizard -- that is the
  // intended behaviour (commit 52f8738), but it is destructive enough that a
  // stray click should not trigger it silently, so confirm first.
  const [pendingIndustryId, setPendingIndustryId] = useState<string | null>(null);
  const pendingIndustry = pendingIndustryId ? INDUSTRIES.find((i) => i.id === pendingIndustryId) : null;

  if (!isSelected) return null;

  const hasSubVerticals = !!industry && industry.subVerticals.length > 0;

  return (
    <div className="flex items-center gap-1.5">
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
                onClick={() => { if (!isActive) setPendingIndustryId(ind.id); }}
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

      <AlertDialog open={!!pendingIndustryId} onOpenChange={(open) => { if (!open) setPendingIndustryId(null); }}>
        <AlertDialogContent data-testid="dialog-confirm-industry-switch">
          <AlertDialogHeader>
            <AlertDialogTitle>Switch to {pendingIndustry?.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              This resets your {industry?.label} workspace configuration — sub-vertical,
              departments, jurisdictions, integrations and default data classification —
              and re-opens the setup wizard so you can configure {pendingIndustry?.label}.
              Your agents, outcomes and data are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-industry-switch">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setPendingIndustryId(null);
                // Radix sets pointer-events:none on <body> while a modal is open
                // and clears it when the modal closes. Calling clearIndustry() in
                // this same tick mounts the setup wizard in the same commit that
                // this dialog unmounts, and that cleanup is lost -- leaving the
                // wizard fully rendered but completely unclickable, since every
                // card inherits pointer-events:none from <body>. That is why
                // switching industry appeared to open a wizard you could not use,
                // and why it only happened when an industry was already set (the
                // only path that shows this dialog). Let the dialog finish closing
                // first.
                setTimeout(() => clearIndustry(), 0);
              }}
              data-testid="button-confirm-industry-switch"
            >
              Switch and reconfigure
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {hasSubVerticals && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5" data-testid="button-sub-vertical-selector">
              <span className="hidden sm:inline text-xs">
                {subVertical || `All ${industry!.shortLabel}`}
              </span>
              <ChevronDown className="h-3 w-3 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64" data-testid="menu-sub-vertical-selector">
            <DropdownMenuLabel className="text-xs">
              {industry!.label} Sub-Vertical
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => setSubVertical(null)}
              className="flex items-center justify-between gap-2 cursor-pointer"
              data-testid="menu-item-sub-vertical-all"
            >
              <span className="text-sm">All {industry!.label}</span>
              {!subVertical && <Check className="h-3 w-3 text-primary shrink-0" />}
            </DropdownMenuItem>
            {industry!.subVerticals.map((sv) => (
              <DropdownMenuItem
                key={sv}
                onClick={() => setSubVertical(sv)}
                className="flex items-center justify-between gap-2 cursor-pointer"
                data-testid={`menu-item-sub-vertical-${sv.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
              >
                <span className="text-sm">{sv}</span>
                {subVertical === sv && <Check className="h-3 w-3 text-primary shrink-0" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
