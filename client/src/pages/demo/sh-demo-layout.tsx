import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Brain,
  Cpu,
  FileText,
  Loader2,
  Shield,
  Wrench,
  Zap,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  ChevronLeft,
  BookOpen,
  Lock,
} from "lucide-react";
import type { HealingPipeline } from "@shared/schema";

// ─── Scenario Config ──────────────────────────────────────────────────────────

export interface SHScenarioConfig {
  scenario: string;
  title: string;
  subtitle: string;
  domain: string;
  agentCode: string;
  pipelineId: string;
  agentId: string;
  accentColor: string;
  complianceFrameworks: string[];
}

// ─── Stage Definitions ────────────────────────────────────────────────────────

const STAGES = [
  { key: "detected",   label: "Detect",      icon: Activity  },
  { key: "diagnosed",  label: "Diagnose",    icon: Brain     },
  { key: "hypothesis", label: "Hypothesize", icon: Cpu       },
  { key: "remediation",label: "Remediate",   icon: Wrench    },
  { key: "resolved",   label: "Validate",    icon: Shield    },
] as const;

type StageKey = typeof STAGES[number]["key"];

function stageIndex(stage: string): number {
  const idx = STAGES.findIndex(s => s.key === stage);
  return idx >= 0 ? idx : 0;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
  high:     "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800",
  medium:   "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
  low:      "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
};

function Chip({ label, color }: { label: string; color?: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border uppercase tracking-wide ${color ?? "bg-muted text-muted-foreground border-border"}`}>
      {label}
    </span>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon?: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      {(title || Icon) && (
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4 text-muted-foreground shrink-0" />}
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
      )}
      {children}
    </div>
  );
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

// ─── Stage Progress Bar ───────────────────────────────────────────────────────

function StageProgress({
  pipeline,
  activeIdx,
  onStage,
}: {
  pipeline: HealingPipeline;
  activeIdx: number;
  onStage: (idx: number) => void;
}) {
  const liveIdx = stageIndex(pipeline.stage);
  return (
    <div className="flex items-center w-full gap-0">
      {STAGES.map((s, idx) => {
        const Icon = s.icon;
        const done    = idx < liveIdx;
        const live    = idx === liveIdx;
        const viewing = idx === activeIdx;
        return (
          <div key={s.key} className="flex items-center flex-1 min-w-0">
            <button
              data-testid={`stage-${s.key}`}
              onClick={() => onStage(idx)}
              title={s.label}
              className={`flex items-center gap-1.5 flex-1 px-2 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer min-w-0 ${
                viewing && done  ? "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300 ring-1 ring-green-400" :
                viewing && live  ? "bg-primary/10 text-primary ring-1 ring-primary/30" :
                viewing          ? "bg-muted text-foreground ring-1 ring-border" :
                done             ? "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/40" :
                live             ? "bg-primary/5 text-primary hover:bg-primary/10" :
                                   "bg-muted/40 text-muted-foreground hover:bg-muted/70"
              }`}
            >
              <span className="shrink-0">
                {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
              </span>
              <span className="truncate hidden sm:inline">{s.label}</span>
              {live && <span className="ml-auto shrink-0 hidden sm:inline"><span className="relative flex h-1.5 w-1.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" /><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" /></span></span>}
            </button>
            {idx < STAGES.length - 1 && (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 mx-0.5" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Platform Intelligence Panel (3-Tab) ─────────────────────────────────────

type PITab = "skills" | "runbooks" | "policies";

function PlatformIntelligencePanel({ pipeline }: { pipeline: HealingPipeline }) {
  const [tab, setTab] = useState<PITab>("skills");
  const diagnosis  = (pipeline.diagnosisDetails as Record<string, unknown>) || {};
  const remediation = (pipeline.remediation     as Record<string, unknown>) || {};
  const guardrails  = (pipeline.industryGuardrails as Array<Record<string, string>>) || [];

  const skills: Array<{ skillName: string; finding: string; duration?: string }> = [
    ...((diagnosis.skillsInvoked     || []) as Array<{ skillName: string; finding: string; duration?: string }>),
    ...((diagnosis.atlasSkillsInvoked || []) as Array<{ skillName: string; finding: string; duration?: string }>),
  ];
  const runbooks: Array<{ runbookName: string; status?: string; result?: string }> =
    ((remediation.runbooksTriggered || []) as Array<{ runbookName: string; status?: string; result?: string }>);
  const policies: Array<{ policyName?: string; rule?: string; decision?: string; outcome?: string }> = [
    ...((remediation.policiesEnforced || []) as Array<{ policyName?: string; rule?: string; decision?: string; outcome?: string }>),
    ...guardrails.map(g => ({ policyName: g.framework, rule: g.constraint, decision: g.status, outcome: "" })),
  ];

  const TABS: { key: PITab; label: string; count: number; icon: React.ElementType }[] = [
    { key: "skills",   label: "Skills Invoked",     count: skills.length,   icon: Zap      },
    { key: "runbooks", label: "Runbooks Triggered",  count: runbooks.length, icon: BookOpen },
    { key: "policies", label: "Policies Enforced",   count: policies.length, icon: Lock     },
  ];

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-1 border-b border-border px-3 py-2">
        <Zap className="h-3.5 w-3.5 text-primary" />
        <span className="text-[11px] font-semibold text-foreground ml-1">Platform Intelligence in Action</span>
      </div>
      {/* Tab bar */}
      <div className="flex border-b border-border">
        {TABS.map(t => (
          <button
            key={t.key}
            data-testid={`pi-tab-${t.key}`}
            onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-1 px-2 py-2 text-[10px] font-medium transition-colors ${
              tab === t.key
                ? "border-b-2 border-primary text-primary bg-primary/5"
                : "text-muted-foreground hover:text-foreground border-b-2 border-transparent"
            }`}
          >
            <t.icon className="h-3 w-3 shrink-0" />
            <span className="hidden sm:inline truncate">{t.label}</span>
            {t.count > 0 && <span className="ml-auto bg-muted rounded-full px-1.5 text-[9px] font-bold">{t.count}</span>}
          </button>
        ))}
      </div>
      {/* Tab content */}
      <div className="p-3 space-y-2 max-h-64 overflow-y-auto">
        {tab === "skills" && (
          skills.length > 0 ? skills.map((sk, i) => (
            <div key={i} className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <Zap className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />
                <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 truncate">{sk.skillName}</span>
                {sk.duration && <span className="ml-auto text-[10px] text-amber-600/70 shrink-0">{sk.duration}</span>}
              </div>
              <p className="text-[11px] text-amber-800 dark:text-amber-200 leading-relaxed">{sk.finding}</p>
            </div>
          )) : <p className="text-xs text-muted-foreground py-2">Skills analysis populates after diagnosis.</p>
        )}

        {tab === "runbooks" && (
          runbooks.length > 0 ? runbooks.map((rb, i) => (
            <div key={i} className="rounded-lg bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 p-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <BookOpen className="h-3 w-3 text-purple-600 dark:text-purple-400 shrink-0" />
                <span className="text-[11px] font-semibold text-purple-700 dark:text-purple-300 truncate">{rb.runbookName}</span>
              </div>
              {rb.status && <p className="text-[11px] text-purple-600 dark:text-purple-400">{rb.status}</p>}
              {rb.result && <p className="text-[11px] text-purple-800 dark:text-purple-200 mt-1">{rb.result}</p>}
            </div>
          )) : <p className="text-xs text-muted-foreground py-2">Runbooks activate during remediation phase.</p>
        )}

        {tab === "policies" && (
          policies.length > 0 ? policies.map((p, i) => {
            const ok = (p.decision || "").toLowerCase().includes("compliant") || (p.decision || "").toLowerCase().includes("pass");
            return (
              <div key={i} className={`rounded-lg border p-2.5 ${ok ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800" : "bg-muted/40 border-border"}`}>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Lock className={`h-3 w-3 shrink-0 ${ok ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`} />
                  <span className={`text-[11px] font-semibold truncate ${ok ? "text-green-700 dark:text-green-300" : "text-foreground"}`}>{p.policyName}</span>
                </div>
                {p.rule && <p className="text-[11px] text-muted-foreground">{p.rule}</p>}
                {(p.decision || p.outcome) && <p className={`text-[11px] mt-0.5 font-medium ${ok ? "text-green-700 dark:text-green-300" : "text-foreground"}`}>{[p.decision, p.outcome].filter(Boolean).join(" — ")}</p>}
              </div>
            );
          }) : <p className="text-xs text-muted-foreground py-2">Policy checks run alongside remediation.</p>
        )}
      </div>
    </div>
  );
}

// ─── With Atlas vs Without Atlas Comparison ───────────────────────────────────

function AtlasComparisonCard({ pipeline }: { pipeline: HealingPipeline }) {
  const impact = (pipeline.businessImpact as Record<string, string>) || {};
  const res    = (pipeline.resolution    as Record<string, string>) || {};

  const withAtlas    = impact.withAtlas    || res.atlasAutonomousActions?.toString() || "";
  const withoutAtlas = impact.withoutAtlas || res.withoutAtlas || "";

  if (!withAtlas && !withoutAtlas) return null;

  return (
    <Section title="With Atlas vs Without Atlas" icon={TrendingUp}>
      <div className="grid grid-cols-1 gap-2">
        {withAtlas && (
          <div className="rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingUp className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
              <span className="text-[11px] font-bold text-green-700 dark:text-green-300 uppercase tracking-wide">With Atlas</span>
            </div>
            <p className="text-xs text-green-800 dark:text-green-200 leading-relaxed">{withAtlas}</p>
          </div>
        )}
        {withoutAtlas && (
          <div className="rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingDown className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
              <span className="text-[11px] font-bold text-red-700 dark:text-red-300 uppercase tracking-wide">Without Atlas</span>
            </div>
            <p className="text-xs text-red-800 dark:text-red-200 leading-relaxed">{withoutAtlas}</p>
          </div>
        )}
      </div>
    </Section>
  );
}

// ─── Resolution Timeline ──────────────────────────────────────────────────────

function ResolutionTimeline({ pipeline }: { pipeline: HealingPipeline }) {
  const res = (pipeline.resolution as Record<string, unknown>) || {};
  const atlasActions  = (res.atlasAutonomousActions as string[]) || [];
  const humanActions  = (res.requiresHumanAction   as string[]) || [];
  const resolvedAt = pipeline.resolvedAt;

  if (atlasActions.length === 0 && humanActions.length === 0) return null;

  return (
    <Section title="Resolution Timeline" icon={Clock}>
      <div className="space-y-2">
        {resolvedAt && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground pb-1 border-b border-border">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            <span>Resolved {new Date(resolvedAt).toLocaleString()}</span>
          </div>
        )}
        {atlasActions.map((action, i) => (
          <div key={i} className="flex items-start gap-2 text-sm">
            <div className="flex flex-col items-center shrink-0">
              <div className="w-2.5 h-2.5 rounded-full bg-green-500 mt-0.5" />
              {i < atlasActions.length - 1 && <div className="w-px flex-1 bg-border mt-1 min-h-[12px]" />}
            </div>
            <span className="text-sm">{action}</span>
          </div>
        ))}
        {humanActions.map((action, i) => (
          <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
            <div className="shrink-0 mt-0.5"><Clock className="h-3.5 w-3.5 text-amber-500" /></div>
            <span>{action}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ─── Stage Content Panels ─────────────────────────────────────────────────────

function StageDetect({ pipeline }: { pipeline: HealingPipeline }) {
  return (
    <div className="space-y-4">
      <Section title="Incident Detected" icon={AlertTriangle}>
        <div className="grid grid-cols-2 gap-3">
          <KV label="Severity" value={<Chip label={pipeline.severity} color={SEVERITY_STYLES[pipeline.severity] || SEVERITY_STYLES.medium} />} />
          <KV label="Issue Type" value={pipeline.issueType} />
          <KV label="Industry" value={pipeline.industry} />
          <KV label="Status" value={<Chip label={pipeline.status} />} />
        </div>
        {pipeline.issueDescription && (
          <div className="pt-2 border-t border-border">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Description</p>
            <p className="text-sm leading-relaxed">{pipeline.issueDescription}</p>
          </div>
        )}
      </Section>
      <Section title="Detection Metadata" icon={Clock}>
        <div className="grid grid-cols-2 gap-3">
          <KV label="Priority" value={<Chip label={pipeline.priority} />} />
          {pipeline.triggerSource && <KV label="Trigger Source" value={pipeline.triggerSource} />}
          {pipeline.detectedAt && <KV label="Detected At" value={new Date(pipeline.detectedAt).toLocaleString()} />}
        </div>
      </Section>
    </div>
  );
}

function StageDiagnose({ pipeline }: { pipeline: HealingPipeline }) {
  const details = (pipeline.diagnosisDetails as Record<string, unknown>) || {};
  const rootCause = details.rootCause as string | undefined;

  return (
    <div className="space-y-4">
      <Section title="Root Cause Analysis" icon={Brain}>
        {rootCause ? (
          <p className="text-sm leading-relaxed">{rootCause}</p>
        ) : (
          <p className="text-sm text-muted-foreground">Root cause analysis pending — diagnosis phase in progress.</p>
        )}
        {Object.entries(details)
          .filter(([k]) => !["rootCause", "skillsInvoked", "atlasSkillsInvoked"].includes(k))
          .map(([k, v]) => (
            <KV key={k} label={k.replace(/([A-Z])/g, " $1").trim()} value={
              typeof v === "string" || typeof v === "number" ? String(v)
                : <span className="text-xs font-mono text-muted-foreground">{JSON.stringify(v)}</span>
            } />
          ))}
      </Section>
    </div>
  );
}

function StageHypothesize({ pipeline }: { pipeline: HealingPipeline }) {
  const hyp       = (pipeline.hypothesis as Record<string, unknown>) || {};
  const primary   = hyp.primaryHypothesis as string | undefined;
  const confidence = hyp.confidence as number | undefined;
  const candidates = (hyp.runbookCandidates as Array<Record<string, string>>) || [];

  return (
    <div className="space-y-4">
      <Section title="Primary Hypothesis" icon={Cpu}>
        {primary ? (
          <div className="space-y-2">
            <p className="text-sm leading-relaxed">{primary}</p>
            {confidence !== undefined && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Confidence</span>
                <div className="flex-1 rounded-full bg-muted h-2 overflow-hidden">
                  <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.min(100, confidence * 100)}%` }} />
                </div>
                <span className="text-xs font-semibold">{Math.round(confidence * 100)}%</span>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Hypothesis formation pending diagnosis completion.</p>
        )}
      </Section>

      {candidates.length > 0 && (
        <Section title="Runbook Candidates" icon={FileText}>
          <div className="space-y-2">
            {candidates.map((c, i) => (
              <div key={i} className="rounded-lg bg-muted/40 p-3">
                <p className="text-xs font-semibold mb-1">{c.runbookName}</p>
                {c.triggerCondition && <p className="text-[11px] text-muted-foreground mb-0.5"><strong>Trigger:</strong> {c.triggerCondition}</p>}
                {c.expectedOutcome  && <p className="text-[11px] text-muted-foreground"><strong>Outcome:</strong> {c.expectedOutcome}</p>}
                {c.estimatedDuration && <p className="text-[10px] text-muted-foreground mt-1">Est. {c.estimatedDuration}</p>}
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function StageRemediate({ pipeline }: { pipeline: HealingPipeline }) {
  const rem     = (pipeline.remediation as Record<string, unknown>) || {};
  const status  = rem.status as string | undefined;

  return (
    <div className="space-y-4">
      <Section title="Remediation Status" icon={Wrench}>
        {status ? (
          <div className="flex items-center gap-2">
            <Chip label={status} color="bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800" />
            <span className="text-xs text-muted-foreground">Autonomous actions executing via Platform Intelligence</span>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Remediation activates after hypothesis confirmation.</p>
        )}
      </Section>
    </div>
  );
}

function StageValidate({ pipeline }: { pipeline: HealingPipeline }) {
  const guardrails = (pipeline.industryGuardrails as Array<Record<string, string>>) || [];

  return (
    <div className="space-y-4">
      <ResolutionTimeline pipeline={pipeline} />

      {guardrails.length > 0 && (
        <Section title="Regulatory Guardrails Verified" icon={Shield}>
          <div className="space-y-2">
            {guardrails.map((g, i) => (
              <div key={i} className="flex items-start gap-3 rounded-lg bg-muted/40 p-2.5">
                <Shield className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-[11px] font-semibold">{g.framework}</p>
                  <p className="text-[11px] text-muted-foreground">{g.constraint}</p>
                  <Chip label={g.status || "verified"} color="bg-green-100 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800" />
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {guardrails.length === 0 && (pipeline.resolution as any)?.atlasAutonomousActions?.length === 0 && (
        <Section title="Validation" icon={Shield}>
          <p className="text-sm text-muted-foreground">Validation data populates after remediation completes.</p>
        </Section>
      )}
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ config }: { config: SHScenarioConfig }) {
  return (
    <div className="max-w-2xl mx-auto py-16 text-center space-y-4">
      <div className="mx-auto w-14 h-14 rounded-full bg-muted flex items-center justify-center">
        <Activity className="h-7 w-7 text-muted-foreground" />
      </div>
      <h2 className="text-lg font-semibold">No Healing Pipeline Data</h2>
      <p className="text-sm text-muted-foreground leading-relaxed max-w-md mx-auto">
        No active healing pipeline found for <strong>{config.title}</strong>.
        Atlas will automatically create and populate this pipeline when an incident is detected in the{" "}
        <strong>{config.domain}</strong> environment.
      </p>
      <div className="flex justify-center pt-2">
        <Link href="/demo">
          <Button data-testid="button-back-to-demos" variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Demo Center
          </Button>
        </Link>
      </div>
    </div>
  );
}

// ─── Main Layout ──────────────────────────────────────────────────────────────

export default function SHDemoLayout({ config }: { config: SHScenarioConfig }) {
  const [activeStageIdx, setActiveStageIdx] = useState<number | null>(null);

  // Step 1: Fetch all agents and resolve by name/agentCode
  const { data: allAgents = [] } = useQuery<{ id: string; name: string; agentType?: string }[]>({
    queryKey: ["/api/agents"],
    retry: 1,
  });
  const resolvedAgent = allAgents.find(a => a.name === config.title) ?? null;
  const resolvedAgentId = resolvedAgent?.id ?? config.agentId;

  // Step 2: Fetch all healing pipelines and filter by resolved agentId
  const { data: allPipelines, isLoading: pipelinesLoading } = useQuery<HealingPipeline[]>({
    queryKey: ["/api/healing-pipelines"],
    retry: 1,
  });
  const pipeline = allPipelines?.find(p => p.agentId === resolvedAgentId) ?? null;

  // Bind stage stepper to live pipeline.stage; allow manual override
  useEffect(() => {
    if (pipeline && activeStageIdx === null) {
      setActiveStageIdx(stageIndex(pipeline.stage));
    }
  }, [pipeline, activeStageIdx]);

  const activeIdx  = activeStageIdx ?? 0;
  const stageCount = STAGES.length;

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <Link href="/demo">
            <Button data-testid="button-back" variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
              <ArrowLeft className="h-4 w-4" />
              Demo Center
            </Button>
          </Link>
          <div className="h-4 w-px bg-border" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold truncate">{config.title}</span>
              <Badge variant="outline" className="text-[10px] shrink-0 border-violet-300 text-violet-700 dark:border-violet-700 dark:text-violet-300">Self-Healing</Badge>
              <Badge variant="outline" className="text-[10px] shrink-0 hidden sm:inline-flex">{config.domain}</Badge>
              <span className="text-[10px] text-muted-foreground font-mono hidden md:inline">{config.agentCode}</span>
            </div>
          </div>
          {pipeline && (
            <Chip
              label={pipeline.stage}
              color={pipeline.stage === "resolved"
                ? "bg-green-100 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800"
                : SEVERITY_STYLES[pipeline.severity] || "bg-muted text-muted-foreground border-border"}
            />
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {pipelinesLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !pipeline ? (
          <EmptyState config={config} />
        ) : (
          <div className="space-y-5">
            {/* Incident summary bar */}
            <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 px-4 py-3 flex items-center gap-4">
              <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-red-900 dark:text-red-100 truncate">{pipeline.title}</p>
                <p className="text-xs text-red-700 dark:text-red-300">{pipeline.issueType} · {pipeline.industry}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Chip label={pipeline.severity} color={SEVERITY_STYLES[pipeline.severity] || SEVERITY_STYLES.medium} />
                <Chip label={pipeline.stage} />
              </div>
            </div>

            {/* Stage progress — bound to live pipeline.stage, manually browseable */}
            <StageProgress pipeline={pipeline} activeIdx={activeIdx} onStage={setActiveStageIdx} />

            {/* Main grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Left: stage content */}
              <div className="lg:col-span-2 space-y-4">
                {activeIdx === 0 && <StageDetect pipeline={pipeline} />}
                {activeIdx === 1 && <StageDiagnose pipeline={pipeline} />}
                {activeIdx === 2 && <StageHypothesize pipeline={pipeline} />}
                {activeIdx === 3 && <StageRemediate pipeline={pipeline} />}
                {activeIdx === 4 && <StageValidate pipeline={pipeline} />}

                {/* Stage navigation */}
                <div className="flex items-center gap-3">
                  <Button
                    data-testid="button-prev-stage"
                    variant="outline"
                    size="sm"
                    disabled={activeIdx === 0}
                    onClick={() => setActiveStageIdx(i => Math.max(0, (i ?? 0) - 1))}
                    className="flex-1 sm:flex-none"
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Previous
                  </Button>
                  <span className="text-xs text-muted-foreground flex-1 text-center">
                    Stage {activeIdx + 1} of {stageCount} — <strong>{STAGES[activeIdx].label}</strong>
                  </span>
                  <Button
                    data-testid="button-next-stage"
                    variant={activeIdx < stageCount - 1 ? "default" : "outline"}
                    size="sm"
                    disabled={activeIdx === stageCount - 1}
                    onClick={() => setActiveStageIdx(i => Math.min(stageCount - 1, (i ?? 0) + 1))}
                    className="flex-1 sm:flex-none"
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>

              {/* Right: intelligence + comparison panels */}
              <div className="space-y-4">
                {/* Platform Intelligence — 3 tabs */}
                <PlatformIntelligencePanel pipeline={pipeline} />

                {/* With Atlas vs Without Atlas comparison */}
                <AtlasComparisonCard pipeline={pipeline} />

                {/* Compliance frameworks */}
                <Section title="Compliance Frameworks" icon={Shield}>
                  <div className="flex flex-wrap gap-1.5">
                    {config.complianceFrameworks.map(fw => (
                      <Badge key={fw} variant="outline" className="text-[10px] font-medium">{fw}</Badge>
                    ))}
                  </div>
                </Section>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
