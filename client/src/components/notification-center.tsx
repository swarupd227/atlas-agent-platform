import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useState, useEffect, useRef } from "react";
import {
  Bell, CheckCircle, AlertTriangle, TrendingDown, ArrowRight,
  CreditCard, Clock, ShieldAlert, Zap, Ban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";

interface CriticalViolation {
  id: string;
  agentId: string;
  agentName: string;
  policyName: string;
  rule: string;
  severity: string;
  traceId: string;
  timestamp: string;
  action: string;
}

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

interface Invoice {
  id: string;
  outcomeName: string;
  status: string;
  amount: number;
  periodEnd: string;
}

interface PolicyException {
  id: string;
  policyId: number;
  agentId: string;
  reason: string;
  status: string;
  expiresAt: string | null;
}

interface AuditEvent {
  id: string;
  eventType: string;
  objectType: string;
  objectName: string;
  severity: string;
  timestamp: string;
}

export function NotificationCenter() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const seenViolationIds = useRef<Set<string>>(new Set());

  const { data: approvals } = useQuery<Approval[]>({
    queryKey: ["/api/approvals"],
  });

  const { data: driftSignals } = useQuery<DriftSignal[]>({
    queryKey: ["/api/drift-signals"],
  });

  const { data: invoices } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices"],
  });

  const { data: exceptions } = useQuery<PolicyException[]>({
    queryKey: ["/api/policy-exceptions"],
  });

  const { data: auditEvents } = useQuery<AuditEvent[]>({
    queryKey: ["/api/audit-events"],
  });

  const { data: criticalViolations } = useQuery<CriticalViolation[]>({
    queryKey: ["/api/alerts/critical-violations"],
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (!criticalViolations) return;
    const newViolations = criticalViolations.filter((v) => !seenViolationIds.current.has(v.id));
    if (newViolations.length > 0 && seenViolationIds.current.size > 0) {
      newViolations.forEach((v) => {
        toast({
          title: "Critical Policy Violation",
          description: `${v.agentName}: ${v.policyName} - ${v.rule}`,
          variant: "destructive",
        });
      });
    }
    criticalViolations.forEach((v) => seenViolationIds.current.add(v.id));
  }, [criticalViolations, toast]);

  const pendingApprovals = approvals?.filter((a) => a.status === "pending") || [];
  const criticalDrift = driftSignals?.filter((d) => d.severity === "critical" || d.severity === "high") || [];
  const activeCriticalViolations = criticalViolations || [];

  const readyInvoices = invoices?.filter((i) => i.status === "sent") || [];

  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const expiringExceptions = (exceptions || []).filter((e) => {
    if (e.status !== "approved" || !e.expiresAt) return false;
    const exp = new Date(e.expiresAt);
    return exp > now && exp < sevenDaysFromNow;
  });

  const recentIncidents = (auditEvents || []).filter((e) => {
    if (e.eventType !== "incident_created" || e.severity !== "critical") return false;
    const ts = new Date(e.timestamp);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    return ts > oneDayAgo;
  }).slice(0, 3);

  const totalCount = pendingApprovals.length + criticalDrift.length + readyInvoices.length + expiringExceptions.length + recentIncidents.length + activeCriticalViolations.length;

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
        <ScrollArea className="max-h-80">
          {totalCount === 0 ? (
            <div className="p-6 text-center">
              <Bell className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-xs text-muted-foreground">No notifications</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {pendingApprovals.length > 0 && (
                <NotificationSection title="Approvals Needed">
                  {pendingApprovals.slice(0, 4).map((a) => (
                    <NotificationItem
                      key={a.id}
                      icon={<CheckCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                      title={a.objectName || a.type.replace(/_/g, " ")}
                      subtitle={`${a.type.replace(/_/g, " ")} \u00b7 ${a.requestedBy}`}
                      onClick={() => navigate("/approvals")}
                      testId={`notification-approval-${a.id}`}
                    />
                  ))}
                </NotificationSection>
              )}

              {criticalDrift.length > 0 && (
                <NotificationSection title="Drift Detected" bordered>
                  {criticalDrift.slice(0, 4).map((d, i) => (
                    <NotificationItem
                      key={i}
                      icon={d.severity === "critical"
                        ? <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                        : <TrendingDown className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      }
                      title={d.agentName}
                      subtitle={`${d.metric} drift (${d.severity})`}
                      onClick={() => navigate("/monitor")}
                      testId={`notification-drift-${i}`}
                    />
                  ))}
                </NotificationSection>
              )}

              {activeCriticalViolations.length > 0 && (
                <NotificationSection title="Policy Violations" bordered>
                  {activeCriticalViolations.slice(0, 4).map((v, i) => (
                    <NotificationItem
                      key={v.id}
                      icon={<Ban className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                      title={`${v.agentName}: ${v.policyName}`}
                      subtitle={`${v.rule} · ${v.severity}`}
                      onClick={() => navigate("/governance")}
                      testId={`notification-violation-${i}`}
                    />
                  ))}
                </NotificationSection>
              )}

              {recentIncidents.length > 0 && (
                <NotificationSection title="Incidents Triggered" bordered>
                  {recentIncidents.map((e, i) => (
                    <NotificationItem
                      key={e.id}
                      icon={<Zap className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                      title={e.objectName}
                      subtitle={`${e.eventType.replace(/_/g, " ")} \u00b7 ${e.severity}`}
                      onClick={() => navigate("/monitor")}
                      testId={`notification-incident-${i}`}
                    />
                  ))}
                </NotificationSection>
              )}

              {readyInvoices.length > 0 && (
                <NotificationSection title="Invoices Ready" bordered>
                  {readyInvoices.slice(0, 3).map((inv) => (
                    <NotificationItem
                      key={inv.id}
                      icon={<CreditCard className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
                      title={inv.outcomeName}
                      subtitle={`$${inv.amount?.toLocaleString()} \u00b7 Ready for review`}
                      onClick={() => navigate("/billing")}
                      testId={`notification-invoice-${inv.id}`}
                    />
                  ))}
                </NotificationSection>
              )}

              {expiringExceptions.length > 0 && (
                <NotificationSection title="Exceptions Expiring" bordered>
                  {expiringExceptions.slice(0, 3).map((ex) => (
                    <NotificationItem
                      key={ex.id}
                      icon={<Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                      title={ex.reason?.slice(0, 50) || "Policy exception"}
                      subtitle={`Expires ${new Date(ex.expiresAt!).toLocaleDateString()}`}
                      onClick={() => navigate("/governance")}
                      testId={`notification-exception-${ex.id}`}
                    />
                  ))}
                </NotificationSection>
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

function NotificationSection({ title, children, bordered }: { title: string; children: React.ReactNode; bordered?: boolean }) {
  return (
    <div className={`p-2 ${bordered ? "border-t" : ""}`}>
      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2">{title}</span>
      {children}
    </div>
  );
}

function NotificationItem({ icon, title, subtitle, onClick, testId }: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      className="w-full flex items-center gap-2 p-2 rounded-md text-left hover-elevate"
      onClick={onClick}
      data-testid={testId}
    >
      {icon}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{title}</p>
        <p className="text-[10px] text-muted-foreground">{subtitle}</p>
      </div>
      <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
    </button>
  );
}
