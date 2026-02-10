import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Zap,
  Brain,
  FileCheck,
  Undo2,
  ArrowRight,
  Info,
} from "lucide-react";

interface WhyStep {
  label: string;
  value: string;
  detail?: string;
}

interface WhyBadgeProps {
  trigger: string;
  decision: string;
  evidence: string;
  rollback?: string;
  triggerDetail?: string;
  decisionDetail?: string;
  evidenceDetail?: string;
  rollbackDetail?: string;
  compact?: boolean;
}

const stepConfig = [
  { key: "trigger", icon: Zap, label: "Trigger", color: "text-amber-600 dark:text-amber-400" },
  { key: "decision", icon: Brain, label: "Decision", color: "text-blue-600 dark:text-blue-400" },
  { key: "evidence", icon: FileCheck, label: "Evidence", color: "text-green-600 dark:text-green-400" },
  { key: "rollback", icon: Undo2, label: "Rollback", color: "text-muted-foreground" },
] as const;

function WhyBadgeInline({ steps }: { steps: WhyStep[] }) {
  return (
    <div className="flex items-center gap-1 flex-wrap" data-testid="why-badge-inline">
      {steps.map((step, i) => {
        const config = stepConfig[i];
        const Icon = config.icon;
        return (
          <div key={config.key} className="flex items-center gap-1">
            {i > 0 && <ArrowRight className="w-3 h-3 text-muted-foreground/50 shrink-0" />}
            <div className="flex items-center gap-1">
              <Icon className={`w-3 h-3 shrink-0 ${config.color}`} />
              <span className="text-xs">{step.value}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WhyBadgeExpanded({ steps }: { steps: WhyStep[] }) {
  return (
    <div className="flex flex-col gap-3 p-1" data-testid="why-badge-expanded">
      <div className="flex items-center gap-1.5">
        <Info className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Why This Action
        </span>
      </div>
      <div className="relative flex flex-col gap-3 pl-4">
        <div className="absolute left-[7px] top-1 bottom-1 w-px bg-border" />
        {steps.map((step, i) => {
          const config = stepConfig[i];
          const Icon = config.icon;
          return (
            <div key={config.key} className="relative flex flex-col gap-0.5">
              <div className="absolute -left-4 top-0.5 w-3 h-3 rounded-full bg-background border border-border flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-border" />
              </div>
              <div className="flex items-center gap-1.5">
                <Icon className={`w-3.5 h-3.5 shrink-0 ${config.color}`} />
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  {config.label}
                </span>
              </div>
              <span className="text-xs font-medium">{step.value}</span>
              {step.detail && (
                <span className="text-xs text-muted-foreground">{step.detail}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function WhyBadge({
  trigger,
  decision,
  evidence,
  rollback,
  triggerDetail,
  decisionDetail,
  evidenceDetail,
  rollbackDetail,
  compact = false,
}: WhyBadgeProps) {
  const steps: WhyStep[] = [
    { label: "Trigger", value: trigger, detail: triggerDetail },
    { label: "Decision", value: decision, detail: decisionDetail },
    { label: "Evidence", value: evidence, detail: evidenceDetail },
  ];
  if (rollback) {
    steps.push({ label: "Rollback", value: rollback, detail: rollbackDetail });
  }

  if (compact) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Badge
            variant="outline"
            className="text-[11px] cursor-pointer gap-1"
            data-testid="badge-why"
          >
            <Info className="w-3 h-3" />
            Why
          </Badge>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80">
          <WhyBadgeExpanded steps={steps} />
        </PopoverContent>
      </Popover>
    );
  }

  return <WhyBadgeInline steps={steps} />;
}

export function WhyBadgeCard({
  trigger,
  decision,
  evidence,
  rollback,
  triggerDetail,
  decisionDetail,
  evidenceDetail,
  rollbackDetail,
}: WhyBadgeProps) {
  const steps: WhyStep[] = [
    { label: "Trigger", value: trigger, detail: triggerDetail },
    { label: "Decision", value: decision, detail: decisionDetail },
    { label: "Evidence", value: evidence, detail: evidenceDetail },
  ];
  if (rollback) {
    steps.push({ label: "Rollback", value: rollback, detail: rollbackDetail });
  }

  return (
    <div className="rounded-md border p-3" data-testid="panel-why-badge">
      <WhyBadgeExpanded steps={steps} />
    </div>
  );
}

export type { WhyBadgeProps };
