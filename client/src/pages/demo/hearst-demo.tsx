import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard,
  BarChart3,
  User,
  Globe,
  Shield,
  DollarSign,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
  ArrowRight,
  Clock,
} from "lucide-react";

import Screen1CommandCenter from "./hearst-s1-command-center";
import Screen2BrandDeepdive from "./hearst-s2-brand-deepdive";
import Screen3SubscriberExplorer from "./hearst-s3-subscriber-explorer";
import Screen4SendTimeMap from "./hearst-s4-sendtime-map";
import Screen5FatigueProtection from "./hearst-s5-fatigue-protection";
import Screen6Revenue from "./hearst-s6-revenue";

type ScreenId = "command-center" | "brand-deepdive" | "subscriber-explorer" | "send-time-map" | "fatigue-protection" | "revenue";

const SCREENS: { id: ScreenId; label: string; sub: string; icon: any }[] = [
  { id: "command-center", label: "Command Center", sub: "Portfolio-wide overview", icon: LayoutDashboard },
  { id: "brand-deepdive", label: "Brand Deep-Dive", sub: "Per-brand optimization", icon: BarChart3 },
  { id: "subscriber-explorer", label: "Subscriber Explorer", sub: "Individual NBA decisions", icon: User },
  { id: "send-time-map", label: "Send Time Map", sub: "Global send distribution", icon: Globe },
  { id: "fatigue-protection", label: "Fatigue Protection", sub: "Suppression analytics", icon: Shield },
  { id: "revenue", label: "Revenue Attribution", sub: "Email → dollar impact", icon: DollarSign },
];

const STATUS_MAP: Record<string, { icon: any; color: string; dot: string; label: string }> = {
  active:   { icon: CheckCircle2, color: "text-green-400",  dot: "bg-green-400",  label: "Active" },
  idle:     { icon: CheckCircle2, color: "text-blue-400",   dot: "bg-blue-400",   label: "Idle" },
  running:  { icon: Loader2,      color: "text-indigo-400", dot: "bg-indigo-400", label: "Running" },
  error:    { icon: AlertCircle,  color: "text-red-400",    dot: "bg-red-400",    label: "Error" },
  inactive: { icon: AlertCircle,  color: "text-yellow-400", dot: "bg-yellow-400", label: "Inactive" },
  completed:{ icon: CheckCircle2, color: "text-green-400",  dot: "bg-green-400",  label: "Done" },
};

const TRIGGER_LABELS: Record<string, string> = {
  scheduled: "Scheduled",
  event: "Event-triggered",
  manual: "Manual",
};

function formatRelative(dateStr: string | null): string {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs  = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (mins < 60)  return `${mins}m ago`;
  if (hrs < 24)   return `${hrs}h ago`;
  return `${days}d ago`;
}

const PIPELINE_ROLE: Record<string, string> = {
  subscriberProfileEngine: "Profiles 6.2M subscribers",
  contentInventory:        "Scores today's content",
  nbaEmailDecision:        "SEND / HOLD per subscriber",
  sendTimeOptimizer:       "Personalized send window",
  performanceLearning:     "Closes the feedback loop",
};

const PIPELINE_METRIC: Record<string, (rs: any) => string> = {
  subscriberProfileEngine: rs => rs?.subscribersProcessed ? `${(rs.subscribersProcessed / 1e6).toFixed(1)}M profiles` : "—",
  contentInventory:        rs => rs?.emailSendable       ? `${rs.emailSendable} emails scored` : "—",
  nbaEmailDecision:        rs => rs?.decisionsEvaluated  ? `${(rs.decisionsEvaluated / 1e6).toFixed(2)}M decisions` : "—",
  sendTimeOptimizer:       rs => rs?.subscribersOptimized ? `${(rs.subscribersOptimized / 1e6).toFixed(1)}M windows` : "—",
  performanceLearning:     rs => rs?.outcomesTracked     ? `${(rs.outcomesTracked / 1e6).toFixed(2)}M outcomes` : "—",
};

function PipelineHeader() {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/demo-api/hearst/agent-runs"],
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-1 py-3 border-b border-border/50 overflow-x-auto">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-1 flex-1">
            <div className="flex-1 h-16 rounded-lg bg-muted/20 animate-pulse min-w-[140px]" />
            {i < 4 && <ArrowRight className="w-3 h-3 text-muted-foreground/20 shrink-0" />}
          </div>
        ))}
      </div>
    );
  }

  const runs: any[] = data?.agentRuns || [];

  return (
    <div className="flex items-stretch gap-1 py-3 border-b border-border/50 overflow-x-auto">
      {runs.map((run, i) => {
        const statusConf = STATUS_MAP[run.runStatus || run.agentStatus] || STATUS_MAP.idle;
        const StatusIcon = statusConf.icon;
        const metric = PIPELINE_METRIC[run.key]?.(run.resultSummary);
        const role   = PIPELINE_ROLE[run.key] || "";

        return (
          <div key={run.agentId} className="flex items-center gap-1 flex-1 min-w-[0]">
            <div className="flex-1 min-w-[130px] px-3 py-2 rounded-lg bg-muted/20 border border-border/50 hover:border-border transition-colors group">
              {/* Step number + status */}
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] text-muted-foreground/50 font-mono tracking-widest">STEP {i + 1}</span>
                <div className="flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${statusConf.dot} ${run.runStatus === "running" ? "animate-pulse" : ""}`} />
                  <span className="text-[9px] text-muted-foreground/60">{statusConf.label}</span>
                </div>
              </div>

              {/* Agent name + link */}
              <div className="flex items-center gap-1 mb-0.5">
                <Link href={`/agents/${run.agentId}`}>
                  <span className="text-[11px] font-semibold leading-tight hover:text-[#E91E8C] transition-colors line-clamp-1 cursor-pointer">
                    {run.agentName}
                  </span>
                </Link>
                <Link href={`/agents/${run.agentId}`}>
                  <ExternalLink className="w-2.5 h-2.5 text-muted-foreground/30 hover:text-[#E91E8C] shrink-0 transition-colors" />
                </Link>
              </div>

              {/* Role */}
              <p className="text-[9px] text-muted-foreground/60 mb-1 line-clamp-1">{role}</p>

              {/* Last run + metric */}
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1 text-[9px] text-muted-foreground/50">
                  <Clock className="w-2.5 h-2.5" />
                  <span>{formatRelative(run.completedAt)}</span>
                </div>
                {metric && metric !== "—" && (
                  <span className="text-[9px] text-indigo-400 font-medium truncate">{metric}</span>
                )}
              </div>

              {/* Trigger badge */}
              {run.triggerType && (
                <div className="mt-1">
                  <span className="text-[8px] text-muted-foreground/40 bg-muted/30 px-1 py-0.5 rounded">
                    {TRIGGER_LABELS[run.triggerType] || run.triggerType}
                  </span>
                </div>
              )}
            </div>

            {i < runs.length - 1 && (
              <ArrowRight className="w-3 h-3 text-muted-foreground/30 shrink-0" />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function HearstDemo() {
  const [activeScreen, setActiveScreen] = useState<ScreenId>("command-center");
  const [pendingBrand, setPendingBrand] = useState<string | null>(null);

  const handleBrandClick = (brandId: string) => {
    setPendingBrand(brandId);
    setActiveScreen("brand-deepdive");
  };

  const renderScreen = () => {
    switch (activeScreen) {
      case "command-center":
        return <Screen1CommandCenter onBrandClick={handleBrandClick} />;
      case "brand-deepdive":
        return <Screen2BrandDeepdive />;
      case "subscriber-explorer":
        return <Screen3SubscriberExplorer />;
      case "send-time-map":
        return <Screen4SendTimeMap />;
      case "fatigue-protection":
        return <Screen5FatigueProtection />;
      case "revenue":
        return <Screen6Revenue />;
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      {/* Top banner */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border/50 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#E91E8C]/20 flex items-center justify-center shrink-0">
            <span className="text-[10px] font-bold text-[#E91E8C]">H</span>
          </div>
          <div>
            <h1 className="text-sm font-bold leading-none">Hearst NBA Email Orchestration</h1>
            <p className="text-[11px] text-muted-foreground mt-0.5">Atlas AI Agent Platform · 8 brands · 6.2M subscribers</p>
          </div>
          <Badge className="text-[10px] bg-green-500/20 text-green-400 border-green-500/30 ml-2">Live</Badge>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-muted-foreground">Today's run: <span className="text-foreground font-medium">2.43M decisions</span></span>
          <Link href="/demo">
            <button className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">← Demo Hub</button>
          </Link>
        </div>
      </div>

      {/* Agent pipeline header — sourced from real agent_runtime_runs records */}
      <div className="px-6 shrink-0">
        <PipelineHeader />
      </div>

      {/* Screen tab nav */}
      <div className="flex gap-1 px-6 pt-3 pb-0 border-b border-border/50 shrink-0 overflow-x-auto">
        {SCREENS.map((s) => {
          const Icon = s.icon;
          const isActive = activeScreen === s.id;
          return (
            <button
              key={s.id}
              data-testid={`tab-${s.id}`}
              onClick={() => setActiveScreen(s.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-t-lg text-[11px] font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                isActive
                  ? "border-[#E91E8C] text-foreground bg-[#E91E8C]/5"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30"
              }`}>
              <Icon className={`w-3.5 h-3.5 ${isActive ? "text-[#E91E8C]" : ""}`} />
              {s.label}
            </button>
          );
        })}
      </div>

      {/* Screen content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {renderScreen()}
      </div>
    </div>
  );
}
