import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckCircle2,
  XCircle,
  Clock,
  RotateCcw,
  GitBranch,
  ChevronDown,
  Ban,
} from "lucide-react";
import { useState } from "react";

interface InterruptInstanceWithDef {
  id: string;
  definitionId: string;
  status: string;
  loopIteration: number;
  firedAt: string | null;
  respondedAt: string | null;
  respondedBy: string | null;
  respondedAction: string | null;
  responseData: Record<string, unknown> | null;
  routingOutcome: string | null;
  statePatchApplied: boolean | null;
  definition: {
    id: string;
    name: string;
    title?: string | null;
    stageId: string;
    routingRules?: Array<{ actionId: string; actionLabel: string; routingType: string; targetStageId: string | null }>;
  } | null;
}

interface InterruptHistoryTimelineProps {
  runId: string;
  pipelineId: string;
}

function statusStyle(status: string) {
  switch (status) {
    case "responded":
      return { icon: <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />, badge: "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-700/40" };
    case "loop_back":
      return { icon: <RotateCcw className="w-3.5 h-3.5 text-orange-500" />, badge: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-700/40" };
    case "loop_capped":
      return { icon: <Ban className="w-3.5 h-3.5 text-red-400" />, badge: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-700/40" };
    case "timed_out":
      return { icon: <XCircle className="w-3.5 h-3.5 text-red-500" />, badge: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-700/40" };
    default:
      return { icon: <Clock className="w-3.5 h-3.5 text-amber-500" />, badge: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-700/40" };
  }
}

export function InterruptHistoryTimeline({ runId, pipelineId: _pipelineId }: InterruptHistoryTimelineProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: instances = [], isLoading } = useQuery<InterruptInstanceWithDef[]>({
    queryKey: ["/api/pipeline-runs", runId, "interrupts"],
    queryFn: () => fetch(`/api/pipeline-runs/${runId}/interrupts`).then((r) => r.json()),
    enabled: !!runId,
    refetchInterval: 8000,
  });

  if (isLoading) {
    return (
      <div className="space-y-2 p-3">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (instances.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-4">
        No structured interrupt instances for this run.
      </p>
    );
  }

  return (
    <ScrollArea className="max-h-80" data-testid="interrupt-history-timeline">
      <div className="space-y-2 p-2">
        {instances.map((instance, idx) => {
          const style = statusStyle(instance.status);
          const def = instance.definition;
          const isExpanded = expandedId === instance.id;
          const hasResponseData = instance.responseData && Object.keys(instance.responseData).length > 0;

          return (
            <div
              key={instance.id}
              className="rounded border bg-background/60 overflow-hidden"
              data-testid={`interrupt-instance-${instance.id}`}
            >
              <button
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/30 transition-colors text-left"
                onClick={() => setExpandedId(isExpanded ? null : instance.id)}
                data-testid={`toggle-instance-${instance.id}`}
              >
                {style.icon}
                <span className="text-xs font-medium flex-1 truncate">
                  {def?.title || def?.name || `Interrupt #${idx + 1}`}
                </span>
                {instance.loopIteration > 0 && (
                  <Badge variant="outline" className="text-[9px] h-4 px-1 text-orange-600 border-orange-300 shrink-0">
                    <RotateCcw className="w-2.5 h-2.5 mr-0.5" />
                    {instance.loopIteration}
                  </Badge>
                )}
                <Badge variant="outline" className={`text-[9px] h-4 px-1 shrink-0 ${style.badge}`}>
                  {instance.status}
                </Badge>
                {instance.routingOutcome && instance.routingOutcome !== "next_stage" && (
                  <Badge variant="outline" className="text-[9px] h-4 px-1 shrink-0 bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-700/40">
                    <GitBranch className="w-2.5 h-2.5 mr-0.5" />
                    {instance.routingOutcome.replace("_", " ")}
                  </Badge>
                )}
                <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform shrink-0 ${isExpanded ? "rotate-180" : ""}`} />
              </button>

              {isExpanded && (
                <div className="border-t px-3 py-2 space-y-2 bg-muted/10">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                    {instance.firedAt && (
                      <>
                        <span className="text-muted-foreground">Fired</span>
                        <span className="font-mono">{new Date(instance.firedAt).toLocaleTimeString()}</span>
                      </>
                    )}
                    {instance.respondedAt && (
                      <>
                        <span className="text-muted-foreground">Responded</span>
                        <span className="font-mono">{new Date(instance.respondedAt).toLocaleTimeString()}</span>
                      </>
                    )}
                    {instance.respondedBy && (
                      <>
                        <span className="text-muted-foreground">Actor</span>
                        <span className="font-mono font-medium" data-testid={`actor-${instance.id}`}>{instance.respondedBy}</span>
                      </>
                    )}
                    {instance.respondedAction && (
                      <>
                        <span className="text-muted-foreground">Action</span>
                        <span className="font-mono font-medium" data-testid={`action-${instance.id}`}>{instance.respondedAction}</span>
                      </>
                    )}
                    {instance.routingOutcome && (
                      <>
                        <span className="text-muted-foreground">Routing</span>
                        <span className="font-mono">{instance.routingOutcome.replace(/_/g, " ")}</span>
                      </>
                    )}
                    {instance.statePatchApplied != null && (
                      <>
                        <span className="text-muted-foreground">State patched</span>
                        <span className="font-mono">{instance.statePatchApplied ? "yes" : "no"}</span>
                      </>
                    )}
                  </div>

                  {hasResponseData && (
                    <div>
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Response Payload</p>
                      <pre className="text-[10px] font-mono bg-muted/30 rounded p-2 whitespace-pre-wrap overflow-x-auto max-h-32" data-testid={`payload-${instance.id}`}>
                        {JSON.stringify(instance.responseData, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
