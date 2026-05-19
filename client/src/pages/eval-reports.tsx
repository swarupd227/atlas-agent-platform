import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Shield,
  FileText,
  Calendar,
  Download,
  Play,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Loader2,
  ChevronRight,
  ChevronDown,
  BarChart3,
  Lock,
  Scale,
  Heart,
  Landmark,
  Plus,
  Trash2,
  Info,
  TrendingUp,
} from "lucide-react";

// ── Template definitions ──────────────────────────────────────────────────────

interface Template {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  badge: string;
}

const TEMPLATES: Template[] = [
  {
    id: "aiuc1",
    name: "AIUC-1 Posture Report",
    description: "Five-pillar compliance assessment: Transparency, Accountability, Privacy, Safety, and Fairness.",
    icon: <Shield className="h-5 w-5" />,
    color: "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400",
    badge: "AIUC-1",
  },
  {
    id: "hipaa",
    name: "HIPAA Compliance Report",
    description: "PHI leakage metrics, tool-call audit, and data-access pattern analysis for healthcare AI.",
    icon: <Heart className="h-5 w-5" />,
    color: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
    badge: "HIPAA",
  },
  {
    id: "gdpr",
    name: "GDPR Article 22 Report",
    description: "Automated decision-making and profiling compliance for EU data protection regulation.",
    icon: <Lock className="h-5 w-5" />,
    color: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
    badge: "GDPR",
  },
  {
    id: "naic",
    name: "NAIC Model AI Bulletin",
    description: "Insurance AI governance covering fairness, explainability, and accountability pillars.",
    icon: <Landmark className="h-5 w-5" />,
    color: "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400",
    badge: "NAIC",
  },
  {
    id: "soc2",
    name: "SOC 2 Type II Evidence Pack",
    description: "Security, availability, processing integrity, confidentiality, and privacy control evidence.",
    icon: <BarChart3 className="h-5 w-5" />,
    color: "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
    badge: "SOC 2",
  },
  {
    id: "fair_lending",
    name: "Fair Lending (ECOA) Report",
    description: "Disparate impact and bias probe analysis for AI-driven lending decisions.",
    icon: <Scale className="h-5 w-5" />,
    color: "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400",
    badge: "ECOA",
  },
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface ReportSection {
  title: string;
  score: number | null;
  status: "pass" | "fail" | "warning" | "info";
  content: string;
  evidence: string[];
}

interface GeneratedReport {
  id: string;
  templateType: string;
  templateName: string;
  generatedAt: string;
  timeWindowDays: number;
  agentIds: string[];
  executiveSummary: string;
  overallScore: number | null;
  sections: ReportSection[];
  evidenceTable: any[];
  gaps: string[];
  recommendations: string[];
  stats: { totalRuns: number; avgPassRate: number; avgLatencyMs: number; totalCostUsd: number };
}

interface ReportSchedule {
  id: string;
  templateType: string;
  agentIds: string[];
  cadence: string;
  recipients: string[];
  timeWindowDays: number;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
}

// ── Status chip ───────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: ReportSection["status"] }) {
  const map = {
    pass: { label: "PASS", icon: <CheckCircle2 className="h-3.5 w-3.5" />, cls: "text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400" },
    fail: { label: "FAIL", icon: <XCircle className="h-3.5 w-3.5" />, cls: "text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400" },
    warning: { label: "WARN", icon: <AlertTriangle className="h-3.5 w-3.5" />, cls: "text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-400" },
    info: { label: "INFO", icon: <Info className="h-3.5 w-3.5" />, cls: "text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400" },
  };
  const { label, icon, cls } = map[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {icon} {label}
    </span>
  );
}

// ── Score gauge ───────────────────────────────────────────────────────────────

function ScoreGauge({ score, size = "sm" }: { score: number | null; size?: "sm" | "lg" }) {
  if (score === null) return <span className="text-muted-foreground text-sm">—</span>;
  const color = score >= 90 ? "text-green-600" : score >= 70 ? "text-yellow-600" : "text-red-600";
  if (size === "lg") {
    return (
      <div className="text-center">
        <div className={`text-5xl font-bold tabular-nums ${color}`}>{score}</div>
        <div className="text-sm text-muted-foreground mt-1">/ 100</div>
      </div>
    );
  }
  return <span className={`text-sm font-bold tabular-nums ${color}`}>{score}%</span>;
}

// ── Collapsible section row ───────────────────────────────────────────────────

function SectionRow({ section }: { section: ReportSection }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        data-testid={`section-toggle-${section.title}`}
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-3 p-3 hover:bg-muted/50 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <StatusChip status={section.status} />
          <span className="font-medium text-sm truncate">{section.title}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {section.score !== null && <ScoreGauge score={section.score} />}
          {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>
      {open && (
        <div className="border-t bg-muted/20 p-4 space-y-3">
          <p className="text-sm text-muted-foreground">{section.content}</p>
          {section.evidence.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Evidence</p>
              <ul className="space-y-0.5">
                {section.evidence.map((e, i) => (
                  <li key={i} className="text-xs flex items-start gap-1.5">
                    <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
                    {e}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Report viewer ─────────────────────────────────────────────────────────────

function ReportViewer({ report, onClose }: { report: GeneratedReport; onClose: () => void }) {
  const tmpl = TEMPLATES.find(t => t.id === report.templateType);
  const passingCount = report.sections.filter(s => s.status === "pass").length;
  const failingCount = report.sections.filter(s => s.status === "fail").length;
  const warnCount = report.sections.filter(s => s.status === "warning").length;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-6 border-b">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              {tmpl && <Badge className={`text-xs ${tmpl.color}`}>{tmpl.badge}</Badge>}
              <h2 className="font-bold text-lg">{report.templateName}</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              Generated {new Date(report.generatedAt).toLocaleString()} · {report.timeWindowDays}-day window
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" data-testid="download-report-btn">
              <Download className="h-4 w-4 mr-1.5" /> Download
            </Button>
            <Button variant="ghost" size="sm" data-testid="close-report-btn" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>

        {/* Summary row */}
        <div className="mt-4 grid grid-cols-5 gap-4">
          <div className="text-center">
            <ScoreGauge score={report.overallScore} size="lg" />
            <p className="text-xs text-muted-foreground mt-1">Overall Score</p>
          </div>
          <div className="col-span-4 grid grid-cols-4 gap-3">
            <div className="rounded-lg bg-muted/40 p-3 text-center">
              <p className="text-xl font-bold text-green-600">{passingCount}</p>
              <p className="text-xs text-muted-foreground">Controls Passing</p>
            </div>
            <div className="rounded-lg bg-muted/40 p-3 text-center">
              <p className="text-xl font-bold text-red-600">{failingCount}</p>
              <p className="text-xs text-muted-foreground">Controls Failing</p>
            </div>
            <div className="rounded-lg bg-muted/40 p-3 text-center">
              <p className="text-xl font-bold text-yellow-600">{warnCount}</p>
              <p className="text-xs text-muted-foreground">Warnings</p>
            </div>
            <div className="rounded-lg bg-muted/40 p-3 text-center">
              <p className="text-xl font-bold">{report.stats.totalRuns}</p>
              <p className="text-xs text-muted-foreground">Eval Runs</p>
            </div>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
          {/* Executive summary */}
          <div>
            <h3 className="font-semibold text-sm mb-2">Executive Summary</h3>
            <div className="rounded-lg border bg-muted/20 p-4">
              <p className="text-sm leading-relaxed">{report.executiveSummary}</p>
            </div>
          </div>

          {/* Controls */}
          <div>
            <h3 className="font-semibold text-sm mb-3">Controls & Findings</h3>
            <div className="space-y-2">
              {report.sections.map((section, i) => (
                <SectionRow key={i} section={section} />
              ))}
            </div>
          </div>

          {/* Evidence table */}
          {report.evidenceTable.length > 0 && (
            <div>
              <h3 className="font-semibold text-sm mb-3">Evidence Table</h3>
              <div className="rounded-lg border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="text-left px-3 py-2 font-semibold">Run ID</th>
                        <th className="text-right px-3 py-2 font-semibold">Pass Rate</th>
                        <th className="text-right px-3 py-2 font-semibold">Cases</th>
                        <th className="text-right px-3 py-2 font-semibold">Avg Latency</th>
                        <th className="text-right px-3 py-2 font-semibold">Cost</th>
                        <th className="text-right px-3 py-2 font-semibold">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.evidenceTable.map((row, i) => (
                        <tr key={i} className="border-t hover:bg-muted/20 transition-colors">
                          <td className="px-3 py-2 font-mono text-muted-foreground">{row.runId?.slice(0, 12)}…</td>
                          <td className="px-3 py-2 text-right">
                            <span className={row.passRate >= 0.9 ? "text-green-600 font-medium" : row.passRate >= 0.7 ? "text-yellow-600" : "text-red-600 font-medium"}>
                              {row.passRate != null ? `${Math.round(row.passRate * 100)}%` : "—"}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right">{row.totalGoldens ?? "—"}</td>
                          <td className="px-3 py-2 text-right">{row.avgLatencyMs != null ? `${row.avgLatencyMs}ms` : "—"}</td>
                          <td className="px-3 py-2 text-right">{row.costUsd != null ? `$${row.costUsd.toFixed(4)}` : "—"}</td>
                          <td className="px-3 py-2 text-right text-muted-foreground">
                            {row.startedAt ? new Date(row.startedAt).toLocaleDateString() : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Gaps */}
          {report.gaps.length > 0 && (
            <div>
              <h3 className="font-semibold text-sm mb-2 flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-yellow-500" /> Identified Gaps
              </h3>
              <ul className="space-y-1.5">
                {report.gaps.map((gap, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                    {gap}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recommendations */}
          <div>
            <h3 className="font-semibold text-sm mb-2 flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-blue-500" /> Recommendations
            </h3>
            <ul className="space-y-1.5">
              {report.recommendations.map((rec, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                  {rec}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

// ── Schedule builder ──────────────────────────────────────────────────────────

function ScheduleBuilder() {
  const { toast } = useToast();
  const [templateType, setTemplateType] = useState("");
  const [cadence, setCadence] = useState("monthly");
  const [recipients, setRecipients] = useState("");
  const [timeWindowDays, setTimeWindowDays] = useState("30");
  const [enabled, setEnabled] = useState(true);

  const { data: schedules = [], isLoading } = useQuery<ReportSchedule[]>({
    queryKey: ["/api/eval/report-schedules"],
  });

  const createSchedule = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/eval/report-schedules", data).then(r => r.json()),
    onSuccess: () => {
      toast({ title: "Schedule created" });
      queryClient.invalidateQueries({ queryKey: ["/api/eval/report-schedules"] });
      setTemplateType("");
      setRecipients("");
    },
    onError: () => toast({ title: "Error creating schedule", variant: "destructive" }),
  });

  const toggleSchedule = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiRequest("PUT", `/api/eval/report-schedules/${id}`, { enabled }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/eval/report-schedules"] }),
  });

  return (
    <div className="space-y-6">
      {/* Create form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Plus className="h-4 w-4" /> New Schedule
          </CardTitle>
          <CardDescription className="text-xs">Automate report generation on a recurring cadence.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs mb-1.5 block">Report Template</Label>
              <Select value={templateType} onValueChange={setTemplateType}>
                <SelectTrigger data-testid="schedule-template-select">
                  <SelectValue placeholder="Select template…" />
                </SelectTrigger>
                <SelectContent>
                  {TEMPLATES.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Cadence</Label>
              <Select value={cadence} onValueChange={setCadence}>
                <SelectTrigger data-testid="schedule-cadence-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Time Window (days)</Label>
              <Input
                type="number"
                min={7}
                max={365}
                value={timeWindowDays}
                data-testid="schedule-window-input"
                onChange={e => setTimeWindowDays(e.target.value)}
                className="h-9"
              />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Recipients (comma-separated emails)</Label>
              <Input
                placeholder="alice@example.com, bob@example.com"
                value={recipients}
                data-testid="schedule-recipients-input"
                onChange={e => setRecipients(e.target.value)}
                className="h-9"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="schedule-enabled"
              data-testid="schedule-enabled-switch"
              checked={enabled}
              onCheckedChange={setEnabled}
            />
            <Label htmlFor="schedule-enabled" className="text-sm">Enable immediately</Label>
          </div>
          <Button
            data-testid="create-schedule-btn"
            disabled={!templateType || createSchedule.isPending}
            onClick={() => createSchedule.mutate({
              templateType,
              cadence,
              timeWindowDays: parseInt(timeWindowDays),
              recipients: recipients.split(",").map(r => r.trim()).filter(Boolean),
              enabled,
            })}
          >
            {createSchedule.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Plus className="h-4 w-4 mr-1.5" />}
            Create Schedule
          </Button>
        </CardContent>
      </Card>

      {/* Existing schedules */}
      <div>
        <h3 className="font-semibold text-sm mb-3">Active Schedules</h3>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}
          </div>
        ) : schedules.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
            No schedules configured yet. Create one above.
          </div>
        ) : (
          <div className="space-y-2">
            {schedules.map(sched => {
              const tmpl = TEMPLATES.find(t => t.id === sched.templateType);
              return (
                <div key={sched.id} className="rounded-lg border p-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {tmpl && (
                      <div className={`p-2 rounded-md ${tmpl.color}`}>{tmpl.icon}</div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{tmpl?.name ?? sched.templateType}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-xs text-muted-foreground capitalize">{sched.cadence}</span>
                        <span className="text-xs text-muted-foreground">·</span>
                        <span className="text-xs text-muted-foreground">{sched.timeWindowDays}d window</span>
                        {sched.nextRunAt && (
                          <>
                            <span className="text-xs text-muted-foreground">·</span>
                            <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                              <Clock className="h-3 w-3" /> Next: {new Date(sched.nextRunAt).toLocaleDateString()}
                            </span>
                          </>
                        )}
                        {sched.recipients.length > 0 && (
                          <>
                            <span className="text-xs text-muted-foreground">·</span>
                            <span className="text-xs text-muted-foreground">{sched.recipients.length} recipient(s)</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Switch
                      data-testid={`toggle-schedule-${sched.id}`}
                      checked={sched.enabled}
                      onCheckedChange={v => toggleSchedule.mutate({ id: sched.id, enabled: v })}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type ActiveView = "templates" | "schedule";

export default function EvalReports() {
  const { toast } = useToast();
  const [activeView, setActiveView] = useState<ActiveView>("templates");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [timeWindowDays, setTimeWindowDays] = useState("30");
  const [generatedReport, setGeneratedReport] = useState<GeneratedReport | null>(null);

  const { data: agents = [] } = useQuery<any[]>({
    queryKey: ["/api/agents"],
  });

  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);

  const generateReport = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/eval/reports", data).then(r => r.json()),
    onSuccess: (report: GeneratedReport) => {
      setGeneratedReport(report);
      toast({ title: "Report generated successfully" });
    },
    onError: () => toast({ title: "Failed to generate report", variant: "destructive" }),
  });

  if (generatedReport) {
    return (
      <div className="h-full">
        <ReportViewer report={generatedReport} onClose={() => setGeneratedReport(null)} />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* ── Left: template grid + nav ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Nav tabs */}
        <div className="border-b px-6 py-3 flex items-center gap-1">
          <Button
            variant={activeView === "templates" ? "default" : "ghost"}
            size="sm"
            data-testid="templates-tab-btn"
            onClick={() => setActiveView("templates")}
          >
            <FileText className="h-4 w-4 mr-1.5" /> Report Templates
          </Button>
          <Button
            variant={activeView === "schedule" ? "default" : "ghost"}
            size="sm"
            data-testid="schedule-tab-btn"
            onClick={() => setActiveView("schedule")}
          >
            <Calendar className="h-4 w-4 mr-1.5" /> Schedule Builder
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-6">
            {activeView === "templates" ? (
              <div>
                <div className="mb-6">
                  <h2 className="font-bold text-lg">Compliance Report Templates</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Select a template to generate a compliance report from your eval run data.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {TEMPLATES.map(tmpl => (
                    <Card
                      key={tmpl.id}
                      data-testid={`template-card-${tmpl.id}`}
                      className={`cursor-pointer transition-all hover:shadow-md ${
                        selectedTemplate === tmpl.id
                          ? "ring-2 ring-primary border-primary"
                          : "hover:border-primary/40"
                      }`}
                      onClick={() => setSelectedTemplate(tmpl.id === selectedTemplate ? null : tmpl.id)}
                    >
                      <CardContent className="pt-5">
                        <div className="flex items-start gap-3">
                          <div className={`p-2.5 rounded-lg ${tmpl.color} shrink-0`}>{tmpl.icon}</div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className="text-[10px] px-1.5">{tmpl.badge}</Badge>
                            </div>
                            <h3 className="font-semibold text-sm mt-1 leading-tight">{tmpl.name}</h3>
                            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{tmpl.description}</p>
                          </div>
                        </div>
                        {selectedTemplate === tmpl.id && (
                          <div className="mt-3 pt-3 border-t">
                            <div className="flex items-center justify-between text-xs text-primary font-medium">
                              <span>Selected — configure on the right</span>
                              <ChevronRight className="h-3.5 w-3.5" />
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <div className="mb-6">
                  <h2 className="font-bold text-lg">Schedule Builder</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Configure automated compliance reports on a weekly, monthly, or quarterly cadence.
                  </p>
                </div>
                <ScheduleBuilder />
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* ── Right: generation panel ── */}
      {activeView === "templates" && (
        <div className="w-80 border-l flex flex-col shrink-0">
          <div className="p-4 border-b">
            <h3 className="font-semibold text-sm">Generate Report</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {selectedTemplate
                ? TEMPLATES.find(t => t.id === selectedTemplate)?.name
                : "Select a template to generate"}
            </p>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
              {!selectedTemplate ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Shield className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">Select a template from the left</p>
                </div>
              ) : (
                <>
                  {/* Template summary */}
                  <div className={`rounded-lg p-3 ${TEMPLATES.find(t => t.id === selectedTemplate)?.color}`}>
                    <div className="flex items-center gap-2">
                      {TEMPLATES.find(t => t.id === selectedTemplate)?.icon}
                      <span className="font-medium text-sm">{TEMPLATES.find(t => t.id === selectedTemplate)?.name}</span>
                    </div>
                  </div>

                  <Separator />

                  {/* Agent filter */}
                  <div>
                    <Label className="text-xs mb-1.5 block">Filter Agents (optional)</Label>
                    <p className="text-xs text-muted-foreground mb-2">Leave empty to include all org agents.</p>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {agents.slice(0, 20).map((agent: any) => (
                        <label
                          key={agent.id}
                          data-testid={`agent-filter-${agent.id}`}
                          className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5"
                        >
                          <input
                            type="checkbox"
                            className="rounded"
                            checked={selectedAgentIds.includes(agent.id)}
                            onChange={e => {
                              if (e.target.checked) setSelectedAgentIds(ids => [...ids, agent.id]);
                              else setSelectedAgentIds(ids => ids.filter(id => id !== agent.id));
                            }}
                          />
                          <span className="truncate">{agent.name}</span>
                        </label>
                      ))}
                      {agents.length === 0 && <p className="text-xs text-muted-foreground">No agents found</p>}
                    </div>
                  </div>

                  <Separator />

                  {/* Time window */}
                  <div>
                    <Label className="text-xs mb-1.5 block">Time Window</Label>
                    <Select value={timeWindowDays} onValueChange={setTimeWindowDays}>
                      <SelectTrigger data-testid="generate-window-select" className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="7">Last 7 days</SelectItem>
                        <SelectItem value="14">Last 14 days</SelectItem>
                        <SelectItem value="30">Last 30 days</SelectItem>
                        <SelectItem value="60">Last 60 days</SelectItem>
                        <SelectItem value="90">Last 90 days</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Separator />

                  {/* Generate button */}
                  <Button
                    className="w-full"
                    data-testid="generate-report-btn"
                    disabled={generateReport.isPending}
                    onClick={() => generateReport.mutate({
                      templateType: selectedTemplate,
                      agentIds: selectedAgentIds,
                      timeWindowDays: parseInt(timeWindowDays),
                      format: "json",
                    })}
                  >
                    {generateReport.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Generating…
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-1.5" /> Generate Report
                      </>
                    )}
                  </Button>

                  <div className="rounded-lg bg-muted/30 p-3 text-xs text-muted-foreground space-y-1.5">
                    <div className="flex items-start gap-1.5">
                      <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <p>Report is generated from your eval run history. No external data is shared.</p>
                    </div>
                  </div>
                </>
              )}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
