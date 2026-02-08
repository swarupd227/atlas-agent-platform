import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Bell, CheckCircle, AlertTriangle, TrendingDown, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Approval {
  id: string;
  type: string;
  objectId: string | null;
  objectName: string;
  status: string;
  requestedBy: string;
  createdAt: string;
}

interface DriftSignal {
  id: string;
  agentId: string;
  agentName: string;
  metric: string;
  severity: string;
  baseline: number;
  current: number;
  driftPercent: number;
  status: string;
}

export function NotificationCenter() {
  const [, navigate] = useLocation();

  const { data: approvals } = useQuery<Approval[]>({
    queryKey: ["/api/approvals"],
  });

  const { data: driftSignals } = useQuery<DriftSignal[]>({
    queryKey: ["/api/drift-signals"],
  });

  const pendingApprovals = approvals?.filter((a) => a.status === "pending") || [];
  const criticalDrift = driftSignals?.filter((d) => d.severity === "critical" || d.severity === "high") || [];
  const totalCount = pendingApprovals.length + criticalDrift.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" data-testid="button-notifications">
          <Bell className="w-4 h-4" />
          {totalCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-medium flex items-center justify-center" data-testid="badge-notification-count">
              {totalCount > 9 ? "9+" : totalCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0" data-testid="panel-notifications">
        <div className="flex items-center justify-between gap-2 p-3 border-b">
          <span className="text-sm font-medium">Notifications</span>
          {totalCount > 0 && (
            <Badge variant="secondary" className="text-[10px]" data-testid="text-notification-total">{totalCount} active</Badge>
          )}
        </div>
        <ScrollArea className="max-h-72">
          {totalCount === 0 ? (
            <div className="p-6 text-center">
              <Bell className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-xs text-muted-foreground">No notifications</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {pendingApprovals.length > 0 && (
                <div className="p-2">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2">Approvals Needed</span>
                  {pendingApprovals.slice(0, 5).map((a) => (
                    <button
                      key={a.id}
                      className="w-full flex items-center gap-2 p-2 rounded-md text-left hover-elevate"
                      onClick={() => navigate("/approvals")}
                      data-testid={`notification-approval-${a.id}`}
                    >
                      <CheckCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{a.objectName || a.type.replace(/_/g, " ")}</p>
                        <p className="text-[10px] text-muted-foreground">{a.type.replace(/_/g, " ")} &middot; {a.requestedBy}</p>
                      </div>
                      <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                    </button>
                  ))}
                </div>
              )}
              {criticalDrift.length > 0 && (
                <div className="p-2 border-t">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2">Drift Alerts</span>
                  {criticalDrift.slice(0, 5).map((d, i) => (
                    <button
                      key={i}
                      className="w-full flex items-center gap-2 p-2 rounded-md text-left hover-elevate"
                      onClick={() => navigate("/monitor")}
                      data-testid={`notification-drift-${i}`}
                    >
                      {d.severity === "critical" ? (
                        <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                      ) : (
                        <TrendingDown className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{d.agentName}</p>
                        <p className="text-[10px] text-muted-foreground">{d.metric} drift ({d.severity})</p>
                      </div>
                      <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </ScrollArea>
        {totalCount > 0 && (
          <div className="p-2 border-t">
            <Button
              variant="ghost"
              className="w-full text-xs justify-center"
              onClick={() => navigate("/approvals")}
              data-testid="button-view-all-notifications"
            >
              View all
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
