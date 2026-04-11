import { useState } from "react";
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
  Cpu,
  FileText,
  Loader2,
  Shield,
  Wrench,
  Zap,
  TrendingUp,
  TrendingDown,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SkillInvoked {
  skillName: string;
  finding: string;
  duration: string;
}

interface RunbookCandidate {
  runbookName: string;
  triggerCondition?: string;
  expectedOutcome: string;
  estimatedDuration?: string;
}

interface RunbookTriggered {
  runbookName: string;
  status: string;
  result: string;
}

interface PolicyEnforced {
  policyName: string;
  rule?: string;
  decision: string;
  outcome: string;
}

interface Guardrail {
  framework: string;
  constraint: string;
  status: string;
}

interface DiagnosisDetails {
  rootCause: string;
  skillsInvoked?: SkillInvoked[];
  atlasSkillsInvoked?: SkillInvoked[];
  [key: string]: unknown;
}

interface Hypothesis {
  primaryHypothesis: string;
  confidence: number;
  runbookCandidates: RunbookCandidate[];
}

interface BusinessImpact {
  withAtlas: string;
  withoutAtlas: string;
  [key: string]: unknown;
}

interface RemediationData {
  status: string;
  runbooksTriggered: RunbookTriggered[];
  policiesEnforced: PolicyEnforced[];
}

interface Resolution {
  atlasAutonomousActions: string[];
  requiresHumanAction: string[];
  withoutAtlas: string;
}

interface HealingPipeline {
  id: string;
  title: string;
  agentId?: string;
  agentName: string;
  industry: string;
  severity: string;
  stage: string;
  issueType: string;
  issueDescription?: string;
  diagnosisDetails: DiagnosisDetails;
  hypothesis: Hypothesis;
  businessImpact: BusinessImpact;
  remediation: RemediationData;
  industryGuardrails: Guardrail[];
  resolution: Resolution;
  triggerSource?: string;
  priority?: string;
  status?: string;
}

// ─── Scenario Config ─────────────────────────────────────────────────────────

export interface SHScenarioConfig {
  title: string;
  subtitle: string;
  domain: string;
  agentCode: string;
  pipelineId: string;
  agentId: string;
  accentColor: string;
  complianceFrameworks: string[];
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
  high: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800",
  medium: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
  low: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
};

const STAGE_STYLES: Record<string, string> = {
  detected: "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800",
  diagnosed: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  hypothesis: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800",
  remediation: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800",
  resolved: "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800",
};

function StatusChip({ label, style }: { label: string; style: string }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium border uppercase tracking-wide ${style}`}>
      {label}
    </span>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
      }`}
    >
      {children}
    </button>
  );
}

function SkillCard({ skill, index }: { skill: SkillInvoked; index: number }) {
  return (
    <div className="border rounded-lg p-3 space-y-2" data-testid={`sh-skill-card-${index}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">
            {index + 1}
          </div>
          <span className="text-xs font-semibold">{skill.skillName}</span>
        </div>
        <span className="text-[10px] text-muted-foreground flex items-center gap-1 shrink-0">
          <Clock className="w-3 h-3" />
          {skill.duration}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed pl-8">{skill.finding}</p>
    </div>
  );
}

function RunbookCard({ rb, index }: { rb: RunbookTriggered | RunbookCandidate; index: number }) {
  const isTriggered = "status" in rb;
  const statusColor = isTriggered
    ? (rb as RunbookTriggered).status === "completed"
      ? "text-green-600 dark:text-green-400"
      : "text-orange-600 dark:text-orange-400"
    : "text-blue-600 dark:text-blue-400";
  const statusLabel = isTriggered ? (rb as RunbookTriggered).status : "candidate";

  return (
    <div className="border rounded-lg p-3 space-y-1.5" data-testid={`sh-runbook-card-${index}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Wrench className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs font-semibold">{rb.runbookName}</span>
        </div>
        <span className={`text-[10px] font-medium uppercase ${statusColor} shrink-0`}>{statusLabel}</span>
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed pl-5">
        {isTriggered ? (rb as RunbookTriggered).result : (rb as RunbookCandidate).expectedOutcome}
      </p>
    </div>
  );
}

function PolicyCard({ policy, index }: { policy: PolicyEnforced; index: number }) {
  return (
    <div className="border rounded-lg p-3 space-y-1.5" data-testid={`sh-policy-card-${index}`}>
      <div className="flex items-start gap-1.5">
        <Shield className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
        <div className="min-w-0">
          <span className="text-xs font-semibold block">{policy.policyName}</span>
          {policy.rule && <span className="text-[10px] text-muted-foreground">{policy.rule}</span>}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed pl-5">{policy.decision}</p>
      <div className="flex items-center gap-1 pl-5">
        <CheckCircle2 className="w-3 h-3 text-green-500" />
        <span className="text-[10px] text-green-600 dark:text-green-400">{policy.outcome}</span>
      </div>
    </div>
  );
}

// ─── Main Layout Component ────────────────────────────────────────────────────

export default function SHDemoLayout({ config }: { config: SHScenarioConfig }) {
  const [activeTab, setActiveTab] = useState<"skills" | "runbooks" | "policies">("skills");

  const { data: pipeline, isLoading, isError } = useQuery<HealingPipeline>({
    queryKey: ["/api/healing-pipelines", config.pipelineId],
    queryFn: () => fetch(`/api/healing-pipelines/${config.pipelineId}`).then((r) => r.json()),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !pipeline) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <AlertTriangle className="w-8 h-8 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">Unable to load scenario data.</p>
        <Link href="/demo">
          <Button variant="ghost" size="sm" className="mt-3 text-xs">
            <ArrowLeft className="w-3 h-3 mr-1" /> Back to Demo Center
          </Button>
        </Link>
      </div>
    );
  }

  const skills = pipeline.diagnosisDetails?.skillsInvoked ?? pipeline.diagnosisDetails?.atlasSkillsInvoked ?? [];
  const runbooksTriggered = pipeline.remediation?.runbooksTriggered ?? [];
  const runbookCandidates = pipeline.hypothesis?.runbookCandidates ?? [];
  const policiesEnforced = pipeline.remediation?.policiesEnforced ?? [];
  const guardrails = pipeline.industryGuardrails ?? [];
  const autonomousActions = pipeline.resolution?.atlasAutonomousActions ?? [];
  const humanActions = pipeline.resolution?.requiresHumanAction ?? [];

  const displayRunbooks: Array<RunbookTriggered | RunbookCandidate> =
    runbooksTriggered.length > 0 ? runbooksTriggered : runbookCandidates;

  return (
    <div className="flex flex-col min-h-full bg-background" data-testid="sh-demo-layout">
      {/* Header */}
      <div className="border-b bg-background px-6 py-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-2 mb-3">
            <Link href="/demo">
              <button
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                data-testid="sh-back-link"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Demo Center
              </button>
            </Link>
            <span className="text-muted-foreground/40 text-xs">›</span>
            <span className="text-xs text-muted-foreground">Self-Healing</span>
            <span className="text-muted-foreground/40 text-xs">›</span>
            <span className="text-xs">{config.domain}</span>
          </div>

          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                <span
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded border"
                  style={{
                    backgroundColor: `${config.accentColor}15`,
                    borderColor: `${config.accentColor}30`,
                    color: config.accentColor,
                  }}
                  data-testid="sh-agent-code"
                >
                  <Cpu className="w-3 h-3" />
                  {config.agentCode}
                </span>
                <StatusChip
                  label={pipeline.severity}
                  style={SEVERITY_STYLES[pipeline.severity] ?? SEVERITY_STYLES.medium}
                />
                <StatusChip
                  label={pipeline.stage}
                  style={STAGE_STYLES[pipeline.stage] ?? STAGE_STYLES.detected}
                />
                <Badge variant="outline" className="text-[10px]">
                  {config.domain}
                </Badge>
              </div>
              <h1 className="text-lg font-semibold leading-snug" data-testid="sh-pipeline-title">
                {pipeline.title}
              </h1>
              {pipeline.issueDescription && (
                <p className="text-xs text-muted-foreground mt-1 max-w-3xl leading-relaxed">
                  {pipeline.issueDescription}
                </p>
              )}
            </div>
            <Link href={`/agents/${config.agentId}`}>
              <Button
                variant="outline"
                size="sm"
                className="text-xs shrink-0 gap-1.5"
                data-testid="sh-view-agent-button"
              >
                <Activity className="w-3.5 h-3.5" />
                View Agent
              </Button>
            </Link>
          </div>

          {/* Compliance chips */}
          <div className="flex flex-wrap gap-1.5 mt-3">
            {config.complianceFrameworks.map((f) => (
              <span
                key={f}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground border border-border"
              >
                <Shield className="w-2.5 h-2.5" />
                {f}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 px-6 py-6">
        <div className="max-w-6xl mx-auto space-y-5">
          {/* Root Cause */}
          <div className="rounded-lg border bg-amber-50/50 dark:bg-amber-950/20 border-amber-200/60 dark:border-amber-800/40 p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-1">Root Cause Identified</p>
                <p className="text-xs text-amber-700/80 dark:text-amber-300/80 leading-relaxed">
                  {pipeline.diagnosisDetails?.rootCause ?? "Under investigation"}
                </p>
              </div>
            </div>
          </div>

          {/* Two-column: Platform Intelligence + With/Without Atlas */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            {/* Platform Intelligence in Action */}
            <div className="lg:col-span-3 rounded-lg border bg-card" data-testid="sh-platform-intelligence-panel">
              <div className="px-4 pt-4 pb-0">
                <div className="flex items-center gap-2 mb-1">
                  <Zap className="w-4 h-4 text-primary" />
                  <h2 className="text-sm font-semibold">Platform Intelligence in Action</h2>
                </div>
                <p className="text-[11px] text-muted-foreground mb-3">
                  How Atlas Platform components performed the autonomous healing.
                </p>
                <div className="flex border-b -mx-4 px-4">
                  <TabButton active={activeTab === "skills"} onClick={() => setActiveTab("skills")}>
                    Skills Invoked ({skills.length})
                  </TabButton>
                  <TabButton active={activeTab === "runbooks"} onClick={() => setActiveTab("runbooks")}>
                    Runbooks ({displayRunbooks.length})
                  </TabButton>
                  <TabButton active={activeTab === "policies"} onClick={() => setActiveTab("policies")}>
                    Policies Enforced ({policiesEnforced.length})
                  </TabButton>
                </div>
              </div>

              <div className="p-4 space-y-3 min-h-[240px]">
                {activeTab === "skills" && (
                  skills.length > 0 ? (
                    skills.map((s, i) => <SkillCard key={i} skill={s} index={i} />)
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-8">No skills recorded yet.</p>
                  )
                )}
                {activeTab === "runbooks" && (
                  displayRunbooks.length > 0 ? (
                    displayRunbooks.map((r, i) => <RunbookCard key={i} rb={r} index={i} />)
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-8">No runbooks recorded yet.</p>
                  )
                )}
                {activeTab === "policies" && (
                  policiesEnforced.length > 0 ? (
                    policiesEnforced.map((p, i) => <PolicyCard key={i} policy={p} index={i} />)
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-8">No policy enforcements recorded yet.</p>
                  )
                )}
              </div>
            </div>

            {/* With Atlas vs Without Atlas */}
            <div className="lg:col-span-2 space-y-4" data-testid="sh-comparison-panel">
              {/* With Atlas */}
              <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-green-600 dark:text-green-400" />
                  <h3 className="text-xs font-semibold text-green-700 dark:text-green-300">With Atlas</h3>
                </div>
                <p className="text-[11px] text-green-700/80 dark:text-green-300/80 leading-relaxed">
                  {pipeline.businessImpact?.withAtlas ?? "Autonomous healing in progress."}
                </p>
                {autonomousActions.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {autonomousActions.map((action, i) => (
                      <div key={i} className="flex items-start gap-1.5">
                        <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0 mt-0.5" />
                        <span className="text-[10px] text-green-600/80 dark:text-green-400/80">{action}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Without Atlas */}
              <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingDown className="w-4 h-4 text-red-500 dark:text-red-400" />
                  <h3 className="text-xs font-semibold text-red-700 dark:text-red-300">Without Atlas</h3>
                </div>
                <p className="text-[11px] text-red-700/80 dark:text-red-300/80 leading-relaxed">
                  {pipeline.businessImpact?.withoutAtlas ?? pipeline.resolution?.withoutAtlas ?? "Manual intervention required."}
                </p>
              </div>

              {/* Human Actions Still Needed */}
              {humanActions.length > 0 && (
                <div className="rounded-lg border bg-card p-4">
                  <p className="text-[11px] font-semibold mb-2 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                    Still Needs Human Action
                  </p>
                  <div className="space-y-1.5">
                    {humanActions.map((action, i) => (
                      <div key={i} className="flex items-start gap-1.5">
                        <span className="w-3.5 h-3.5 rounded-full border border-muted-foreground/40 flex items-center justify-center text-[8px] text-muted-foreground shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{action}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Industry Guardrails */}
          {guardrails.length > 0 && (
            <div className="rounded-lg border bg-card p-4" data-testid="sh-guardrails-panel">
              <div className="flex items-center gap-2 mb-3">
                <Shield className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-semibold">Industry Guardrails Enforced</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {guardrails.map((g, i) => (
                  <div
                    key={i}
                    className="rounded-lg border p-3 space-y-1"
                    data-testid={`sh-guardrail-${i}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold text-primary uppercase tracking-wider truncate">
                        {g.framework}
                      </span>
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">{g.constraint}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Primary Hypothesis */}
          {pipeline.hypothesis?.primaryHypothesis && (
            <div className="rounded-lg border bg-card p-4" data-testid="sh-hypothesis-panel">
              <div className="flex items-start gap-2">
                <Activity className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold mb-1">
                    Atlas Healing Hypothesis
                    {pipeline.hypothesis.confidence && (
                      <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                        {Math.round(pipeline.hypothesis.confidence * 100)}% confidence
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {pipeline.hypothesis.primaryHypothesis}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
