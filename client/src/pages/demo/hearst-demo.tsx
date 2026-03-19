import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
  ChevronRight,
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

const AGENT_LABELS: Record<string, { name: string; role: string }> = {
  subscriberProfileEngine: { name: "Subscriber Profile Engine", role: "Profiles 6.2M subscribers" },
  contentInventory: { name: "Content Inventory Agent", role: "Scores today's content" },
  nbaEmailDecision: { name: "NBA Email Decision Agent", role: "SEND / HOLD per subscriber" },
  sendTimeOptimizer: { name: "Send Time Optimizer", role: "Personalized send window" },
  performanceLearning: { name: "Performance & Learning Agent", role: "Closes the feedback loop" },
};

const STATUS_MAP: Record<string, { icon: any; color: string; label: string }> = {
  active: { icon: CheckCircle2, color: "text-green-400", label: "Active" },
  idle: { icon: CheckCircle2, color: "text-blue-400", label: "Idle" },
  running: { icon: Loader2, color: "text-indigo-400", label: "Running" },
  error: { icon: AlertCircle, color: "text-red-400", label: "Error" },
  inactive: { icon: AlertCircle, color: "text-yellow-400", label: "Inactive" },
};

function AgentStatusHeader() {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/demo-api/hearst/agents"],
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="flex gap-2 py-3 border-b border-border/50">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex-1 h-14 rounded-lg bg-muted/20 animate-pulse" />
        ))}
      </div>
    );
  }

  const agents: any[] = data?.agents || [];

  return (
    <div className="flex gap-2 flex-wrap py-3 border-b border-border/50">
      {agents.map((agent, i) => {
        const meta = AGENT_LABELS[agent.key] || { name: agent.name, role: "" };
        const statusConf = STATUS_MAP[agent.status] || STATUS_MAP.idle;
        const Icon = statusConf.icon;
        return (
          <div key={agent.id} className="flex items-center gap-2 flex-1 min-w-[160px] px-3 py-2 rounded-lg bg-muted/20 border border-border/50">
            <div className="flex flex-col items-center justify-center w-6 shrink-0">
              <span className="text-[9px] text-muted-foreground/60 font-mono">{i + 1}</span>
              <ChevronRight className="w-2.5 h-2.5 text-muted-foreground/40" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 mb-0.5">
                <Icon className={`w-3 h-3 shrink-0 ${statusConf.color} ${agent.status === "running" ? "animate-spin" : ""}`} />
                <span className="text-[11px] font-medium truncate">{meta.name}</span>
              </div>
              <p className="text-[10px] text-muted-foreground truncate">{meta.role}</p>
            </div>
            <Link href={`/agents/${agent.id}`}>
              <ExternalLink className="w-3 h-3 text-muted-foreground/40 hover:text-muted-foreground shrink-0" />
            </Link>
          </div>
        );
      })}
    </div>
  );
}

export default function HearstDemo() {
  const [activeScreen, setActiveScreen] = useState<ScreenId>("command-center");
  const [pendingBrand, setPendingBrand] = useState<string | null>(null);

  // If command center triggers a brand drill-down
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

      {/* Agent pipeline status row */}
      <div className="px-6 shrink-0">
        <AgentStatusHeader />
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
