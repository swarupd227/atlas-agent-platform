import { useState } from "react";
import { Check, X, Undo2, ChevronDown, ChevronRight, TrendingUp, Lightbulb, Wrench } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface ActionCardAction {
  label: string;
  icon?: typeof Check;
  variant?: "default" | "outline" | "destructive" | "ghost" | "secondary";
  onClick: () => void;
  disabled?: boolean;
  testId?: string;
}

interface ActionCardProps {
  title: string;
  description?: string | null;
  impact?: string | null;
  status: string;
  severity?: string;
  source?: string;
  type?: string;
  sourceIcon?: typeof Lightbulb;
  suggestedChanges?: Record<string, unknown> | null;
  footer?: React.ReactNode;
  primaryActions?: ActionCardAction[];
  secondaryActions?: ActionCardAction[];
  testId?: string;
  children?: React.ReactNode;
}

const severityColors: Record<string, string> = {
  critical: "bg-red-500/10 text-red-600 dark:text-red-400",
  high: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  medium: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  low: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
};

export function ActionCard({
  title,
  description,
  impact,
  status,
  severity,
  source,
  type,
  sourceIcon: SourceIcon,
  suggestedChanges,
  footer,
  primaryActions,
  secondaryActions,
  testId,
  children,
}: ActionCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card data-testid={testId}>
      <CardContent className="p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1.5 min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold" data-testid={testId ? `text-title-${testId}` : undefined}>
                {title}
              </span>
              {source && (
                <Badge variant="outline" className="text-[11px]" data-testid={testId ? `badge-source-${testId}` : undefined}>
                  {SourceIcon && <SourceIcon className="w-3 h-3 mr-1" />}
                  {source}
                </Badge>
              )}
              {type && (
                <Badge variant="outline" className="text-[11px]" data-testid={testId ? `badge-type-${testId}` : undefined}>
                  {type.replace(/_/g, " ")}
                </Badge>
              )}
              {severity && (
                <Badge
                  variant="outline"
                  className={`text-[11px] ${severityColors[severity] || ""}`}
                  data-testid={testId ? `badge-severity-${testId}` : undefined}
                >
                  {severity}
                </Badge>
              )}
              <Badge variant="outline" className="text-[11px]" data-testid={testId ? `badge-status-${testId}` : undefined}>
                {status}
              </Badge>
            </div>
            {description && (
              <p className="text-xs text-muted-foreground" data-testid={testId ? `text-desc-${testId}` : undefined}>
                {description}
              </p>
            )}
            {impact && (
              <p className="text-xs text-muted-foreground" data-testid={testId ? `text-impact-${testId}` : undefined}>
                <TrendingUp className="w-3 h-3 inline-block mr-1" />
                {impact}
              </p>
            )}
          </div>
        </div>

        {suggestedChanges != null && (
          <div className="flex flex-col gap-1">
            <button
              className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer"
              onClick={() => setExpanded(!expanded)}
              data-testid={testId ? `button-toggle-changes-${testId}` : undefined}
            >
              {expanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
              Suggested Changes
            </button>
            {expanded && (
              <pre
                className="text-xs bg-muted/50 p-3 rounded-md overflow-x-auto"
                data-testid={testId ? `text-changes-${testId}` : undefined}
              >
                {JSON.stringify(suggestedChanges, null, 2)}
              </pre>
            )}
          </div>
        )}

        {children}

        {(footer || primaryActions || secondaryActions) && (
          <div className="flex items-center justify-between gap-3 pt-2 border-t flex-wrap">
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
              {footer}
            </div>
            <div className="flex items-center gap-2">
              {secondaryActions?.map((action, idx) => {
                const Icon = action.icon;
                return (
                  <Button
                    key={idx}
                    variant={action.variant || "outline"}
                    size="sm"
                    onClick={action.onClick}
                    disabled={action.disabled}
                    data-testid={action.testId}
                  >
                    {Icon && <Icon className="w-3.5 h-3.5 mr-1" />}
                    {action.label}
                  </Button>
                );
              })}
              {primaryActions?.map((action, idx) => {
                const Icon = action.icon;
                return (
                  <Button
                    key={idx}
                    variant={action.variant || "default"}
                    size="sm"
                    onClick={action.onClick}
                    disabled={action.disabled}
                    data-testid={action.testId}
                  >
                    {Icon && <Icon className="w-3.5 h-3.5 mr-1" />}
                    {action.label}
                  </Button>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
