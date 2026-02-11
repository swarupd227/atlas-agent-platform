import { useState } from "react";
import {
  Target,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Activity,
  DollarSign,
  Minus,
  ChevronDown,
  ChevronUp,
  Bot,
  Wrench,
  Clock,
  Gauge,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";

function getAutoColor(value: number): string {
  if (value >= 80) return "text-emerald-500 dark:text-emerald-400";
  if (value >= 50) return "text-amber-500 dark:text-amber-400";
  return "text-red-500 dark:text-red-400";
}

function getAutoStroke(value: number): string {
  if (value >= 80) return "#10b981";
  if (value >= 50) return "#f59e0b";
  return "#ef4444";
}

function formatCurrency(value: number): string {
  return `$${Math.abs(value).toLocaleString()}`;
}

export function ProgressRing({
  value,
  size = 40,
  strokeWidth = 3,
  color,
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  const offset = circumference - (clamped / 100) * circumference;
  const strokeColor = color || getAutoStroke(clamped);
  const textColorClass = color ? "" : getAutoColor(clamped);

  return (
    <div
      className="inline-flex items-center justify-center"
      data-testid="progress-ring"
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted-foreground/20"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text
          x="50%"
          y="50%"
          dominantBaseline="central"
          textAnchor="middle"
          className={cn("fill-current text-[10px] font-medium", textColorClass)}
          style={color ? { fill: color } : undefined}
        >
          {Math.round(clamped)}
        </text>
      </svg>
    </div>
  );
}

export function ConfidenceSparkline({
  data,
  width = 80,
  height = 24,
  declining = false,
}: {
  data: number[];
  width?: number;
  height?: number;
  declining?: boolean;
}) {
  if (!data.length) return null;

  const padding = 2;
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;

  const points = data.map((v, i) => {
    const x = padding + (i / Math.max(data.length - 1, 1)) * innerW;
    const y = padding + (1 - Math.max(0, Math.min(1, v))) * innerH;
    return `${x},${y}`;
  });

  const linePoints = points.join(" ");
  const areaPoints = `${padding},${height - padding} ${linePoints} ${padding + ((data.length - 1) / Math.max(data.length - 1, 1)) * innerW},${height - padding}`;

  const strokeColor = declining
    ? "#ef4444"
    : "#10b981";
  const fillColor = declining
    ? "rgba(239,68,68,0.1)"
    : "rgba(16,185,129,0.1)";

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      data-testid="confidence-sparkline"
    >
      <polygon points={areaPoints} fill={fillColor} />
      <polyline
        points={linePoints}
        fill="none"
        stroke={strokeColor}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function WaterfallChart({
  steps,
  width = "100%",
}: {
  steps: Array<{ label: string; value: number; type: "gross" | "deduction" | "net" }>;
  width?: string;
}) {
  const maxVal = Math.max(...steps.map((s) => Math.abs(s.value)), 1);

  return (
    <div className="flex flex-col gap-1.5" style={{ width }} data-testid="waterfall-chart">
      {steps.map((step, i) => {
        const pct = (Math.abs(step.value) / maxVal) * 100;
        const barColor =
          step.type === "gross"
            ? "bg-blue-500 dark:bg-blue-400"
            : step.type === "deduction"
              ? "bg-red-500 dark:bg-red-400"
              : "bg-emerald-500 dark:bg-emerald-400";

        return (
          <div key={i} className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground w-24 shrink-0 truncate text-right">
              {step.label}
            </span>
            <div className="flex-1 h-4 rounded-sm bg-muted/30 relative">
              <div
                className={cn("h-full rounded-sm", barColor)}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground w-16 shrink-0 text-right tabular-nums">
              {step.type === "deduction" ? "-" : ""}
              {formatCurrency(step.value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const riskLevelConfig = {
  low: {
    dot: "bg-emerald-500",
    label: "Low",
  },
  medium: {
    dot: "bg-amber-500",
    label: "Medium",
  },
  high: {
    dot: "bg-red-500",
    label: "High",
  },
  critical: {
    dot: "bg-red-700 dark:bg-red-600",
    label: "Critical",
  },
};

export function RiskHeatBadge({
  level,
  compact = false,
}: {
  level: string;
  compact?: boolean;
}) {
  const normalizedLevel = (level || "medium").toLowerCase() as keyof typeof riskLevelConfig;
  const config = riskLevelConfig[normalizedLevel] || riskLevelConfig.medium;

  return (
    <span
      className="inline-flex items-center gap-1.5"
      data-testid={`risk-badge-${normalizedLevel}`}
    >
      <span className={cn("w-2 h-2 rounded-full shrink-0", config.dot)} />
      {!compact && (
        <span className="text-xs text-muted-foreground">{config.label}</span>
      )}
    </span>
  );
}

export function PortfolioSummaryBar({
  committedValue,
  valueDelivered,
  valueAtRisk,
  projectedGap,
}: {
  committedValue: number;
  valueDelivered: number;
  valueAtRisk: number;
  projectedGap: number;
}) {
  const gapIsNegative = projectedGap < 0;
  const riskIsHigh = valueAtRisk > committedValue * 0.2;

  return (
    <div
      className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4"
      data-testid="portfolio-summary-bar"
    >
      <Card data-testid="metric-committed-value">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-xs text-muted-foreground">Total Committed Value</span>
              <span className="text-2xl font-semibold tracking-tight">
                {formatCurrency(committedValue)}
              </span>
            </div>
            <div className="flex items-center justify-center w-9 h-9 rounded-md shrink-0 bg-primary/10">
              <Target className="w-4 h-4 text-primary" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="metric-value-delivered">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-xs text-muted-foreground">Value Delivered</span>
              <span className="text-2xl font-semibold tracking-tight">
                {formatCurrency(valueDelivered)}
              </span>
            </div>
            <div className="flex items-center justify-center w-9 h-9 rounded-md shrink-0 bg-emerald-500/10">
              <TrendingUp className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="metric-value-at-risk">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-xs text-muted-foreground">Value at Risk</span>
              <span className="text-2xl font-semibold tracking-tight">
                {formatCurrency(valueAtRisk)}
              </span>
            </div>
            <div className={cn(
              "flex items-center justify-center w-9 h-9 rounded-md shrink-0",
              riskIsHigh ? "bg-red-500/10" : "bg-amber-500/10"
            )}>
              <AlertTriangle className={cn(
                "w-4 h-4",
                riskIsHigh
                  ? "text-red-500 dark:text-red-400"
                  : "text-amber-500 dark:text-amber-400"
              )} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="metric-projected-gap">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-xs text-muted-foreground">Projected Gap</span>
              <span className="text-2xl font-semibold tracking-tight">
                {gapIsNegative ? "-" : "+"}{formatCurrency(projectedGap)}
              </span>
            </div>
            <div className={cn(
              "flex items-center justify-center w-9 h-9 rounded-md shrink-0",
              gapIsNegative ? "bg-red-500/10" : "bg-emerald-500/10"
            )}>
              {gapIsNegative ? (
                <TrendingDown className="w-4 h-4 text-red-500 dark:text-red-400" />
              ) : (
                <TrendingUp className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface OutcomeKpi {
  id: string;
  name: string;
  current: number;
  target: number;
  unit: string;
  trend: string;
}

interface OutcomeData {
  id: string;
  name: string;
  status: string;
  riskTier: string;
  confidence: number;
  confidenceTrajectory: number[];
  kpis: OutcomeKpi[];
  valueDelivered: number;
  valueCommitted: number;
  agentCount: number;
}

export function OutcomePortfolioCard({ outcome }: { outcome: OutcomeData }) {
  const displayKpis = outcome.kpis.slice(0, 3);
  const confidencePct = Math.round(outcome.confidence * 100);
  const riskLevel = outcome.riskTier as "low" | "medium" | "high" | "critical";

  return (
    <Card
      className="hover-elevate cursor-pointer"
      data-testid={`card-outcome-portfolio-${outcome.id}`}
    >
      <CardContent className="p-4">
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col gap-1.5 min-w-0">
              <span className="text-sm font-medium truncate" data-testid={`text-outcome-name-${outcome.id}`}>
                {outcome.name}
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                <StatusBadge status={outcome.status} />
                <RiskHeatBadge level={riskLevel} />
              </div>
            </div>
            <span
              className={cn("text-2xl font-bold tabular-nums shrink-0", getAutoColor(confidencePct))}
              data-testid={`text-confidence-${outcome.id}`}
            >
              {confidencePct}%
            </span>
          </div>

          {displayKpis.length > 0 && (
            <div className="flex flex-col gap-2">
              {displayKpis.map((kpi) => {
                const pct = kpi.target > 0 ? Math.round((kpi.current / kpi.target) * 100) : 0;
                return (
                  <div key={kpi.id} className="flex items-center gap-2" data-testid={`kpi-row-${kpi.id}`}>
                    <ProgressRing value={pct} size={28} strokeWidth={2.5} />
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs text-muted-foreground truncate">{kpi.name}</span>
                      <span className="text-xs tabular-nums">
                        {kpi.current.toLocaleString()} / {kpi.target.toLocaleString()} {kpi.unit}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <ConfidenceSparkline
              data={outcome.confidenceTrajectory}
              declining={
                outcome.confidenceTrajectory.length >= 2 &&
                outcome.confidenceTrajectory[outcome.confidenceTrajectory.length - 1] <
                  outcome.confidenceTrajectory[0]
              }
            />
            <span className="text-xs text-muted-foreground tabular-nums shrink-0" data-testid={`text-value-fraction-${outcome.id}`}>
              {formatCurrency(outcome.valueDelivered)} / {formatCurrency(outcome.valueCommitted)}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <Bot className="w-3 h-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground" data-testid={`text-agent-count-${outcome.id}`}>
              {outcome.agentCount} agent{outcome.agentCount !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface RiskCategory {
  category: string;
  icon: LucideIcon;
  count: number;
  severity: "low" | "medium" | "high" | "critical";
  items: Array<{ name: string; detail: string; link?: string }>;
}

export function RiskExposurePanel({ risks }: { risks: RiskCategory[] }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggle = (category: string) => {
    setExpanded((prev) => ({ ...prev, [category]: !prev[category] }));
  };

  return (
    <Card data-testid="risk-exposure-panel">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm font-medium">Risk Exposure</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <div className="flex flex-col gap-1">
          {risks.map((risk) => {
            const Icon = risk.icon;
            const isOpen = expanded[risk.category] ?? false;

            return (
              <div key={risk.category}>
                <button
                  type="button"
                  className="flex items-center justify-between gap-2 w-full py-2 hover-elevate rounded-md px-2"
                  onClick={() => toggle(risk.category)}
                  data-testid={`button-risk-toggle-${risk.category}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="text-sm truncate">{risk.category}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {risk.count}
                    </Badge>
                    <RiskHeatBadge level={risk.severity} compact />
                  </div>
                  {isOpen ? (
                    <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  )}
                </button>

                {isOpen && risk.items.length > 0 && (
                  <div className="ml-8 flex flex-col gap-1 pb-1">
                    {risk.items.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex flex-col gap-0.5 py-1 px-2"
                        data-testid={`risk-item-${risk.category}-${idx}`}
                      >
                        <span className="text-xs font-medium">{item.name}</span>
                        <span className="text-[10px] text-muted-foreground">{item.detail}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
