import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: "up" | "down" | "stable";
  trendValue?: string;
  variant?: "default" | "success" | "warning" | "danger";
  testId?: string;
  tooltip?: string;
}

const variantStyles = {
  default: "text-primary",
  success: "text-emerald-500 dark:text-emerald-400",
  warning: "text-amber-500 dark:text-amber-400",
  danger: "text-red-500 dark:text-red-400",
};

const iconBgStyles = {
  default: "bg-primary/10",
  success: "bg-emerald-500/10",
  warning: "bg-amber-500/10",
  danger: "bg-red-500/10",
};

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  trendValue,
  variant = "default",
  testId,
  tooltip,
}: StatCardProps) {
  const tooltipText = tooltip || title;

  return (
    <TooltipProvider delayDuration={300}>
      <Card data-testid={testId}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col gap-1 min-w-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-xs text-muted-foreground truncate cursor-default">{title}</span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[240px]">
                  <p className="text-xs">{tooltipText}</p>
                </TooltipContent>
              </Tooltip>
              <span className="text-2xl font-semibold tracking-tight">{value}</span>
              {(subtitle || trendValue) && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {trendValue && (
                    <span
                      className={cn(
                        "text-xs font-medium",
                        trend === "up" && "text-emerald-500 dark:text-emerald-400",
                        trend === "down" && "text-red-500 dark:text-red-400",
                        trend === "stable" && "text-muted-foreground"
                      )}
                    >
                      {trend === "up" && "+"}
                      {trendValue}
                    </span>
                  )}
                  {subtitle && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-xs text-muted-foreground truncate cursor-default">{subtitle}</span>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-[240px]">
                        <p className="text-xs">{subtitle}</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              )}
            </div>
            <div
              className={cn(
                "flex items-center justify-center w-9 h-9 rounded-md shrink-0",
                iconBgStyles[variant]
              )}
            >
              <Icon className={cn("w-4 h-4", variantStyles[variant])} />
            </div>
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
