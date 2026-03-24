import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Play, Activity } from "lucide-react";
import { useFitchPipeline } from "./fitch-constants";

interface Props {
  agentName: string;
  agentRole: string;
  description?: string;
  onGoToCommandCenter?: () => void;
}

export default function FitchEmptyState({ agentName, agentRole, description, onGoToCommandCenter }: Props) {
  const { state, trigger } = useFitchPipeline();
  const isRunning = state.status === "running";
  const isPastThisAgent = state.results.some(r => r.role === agentRole);

  return (
    <Card className="border-dashed border-border/50">
      <CardContent className="flex flex-col items-center justify-center py-16 gap-4 text-center">
        <Activity className="w-10 h-10 text-muted-foreground/30" />
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            {isRunning ? `Pipeline running — waiting for ${agentName}…` : "No pipeline data yet"}
          </p>
          <p className="text-[11px] text-muted-foreground/60 mt-1 max-w-sm">
            {description ?? `${agentName} has not run yet. Start the pipeline from the Command Center to see live agent output here.`}
          </p>
        </div>
        {!isRunning && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={onGoToCommandCenter} className="text-[11px] h-7">
              Go to Command Center
            </Button>
            <Button size="sm" onClick={trigger} className="text-[11px] h-7 gap-1.5">
              <Play className="w-3 h-3" /> Run Pipeline Now
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
