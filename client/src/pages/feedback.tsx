import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  MessageSquarePlus,
  Bug,
  Sparkles,
  HelpCircle,
  MessageSquare,
  CheckCircle2,
  Clock,
  Loader2,
  Image as ImageIcon,
  ChevronRight,
  Filter,
  Trash2,
  X,
} from "lucide-react";
import type { FeedbackItem } from "@shared/schema";

const TYPE_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  bug:         { label: "Bug",         icon: <Bug className="w-3 h-3" />,           color: "text-red-600 border-red-300 bg-red-50 dark:bg-red-950/30" },
  enhancement: { label: "Enhancement", icon: <Sparkles className="w-3 h-3" />,      color: "text-blue-600 border-blue-300 bg-blue-50 dark:bg-blue-950/30" },
  question:    { label: "Question",    icon: <HelpCircle className="w-3 h-3" />,    color: "text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/30" },
  general:     { label: "General",     icon: <MessageSquare className="w-3 h-3" />, color: "text-slate-600 border-slate-300 bg-slate-50 dark:bg-slate-950/30" },
};

const STATUS_META: Record<string, { label: string; color: string }> = {
  open:        { label: "Open",        color: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  in_progress: { label: "In Progress", color: "bg-amber-100 text-amber-700 border-amber-300" },
  resolved:    { label: "Resolved",    color: "bg-slate-100 text-slate-600 border-slate-300" },
};

const FEATURE_LABELS: Record<string, string> = {
  outcomes: "Outcomes",
  pipeline_builder: "Pipeline Builder",
  agent_management: "Agent Management",
  team_blueprints: "Team Blueprints",
  mcp_servers: "MCP Servers / Integrations",
  governance: "Governance & Compliance",
  observability: "Observability & Monitoring",
  pii_masking: "PII Masking",
  export_bundle: "Export / Bundle Export",
  evaluation: "Evaluation Framework",
  workflow_state: "Workflow State",
  knowledge_bases: "Knowledge Bases",
  skills_tools: "Skills & Tools",
  autonomy_engine: "Autonomy Engine",
  demo_center: "Demo Center",
  ui_ux: "UI / UX",
  performance: "Performance",
  other: "Other",
};

function timeAgo(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function FeedbackTracker() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<FeedbackItem | null>(null);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolveComment, setResolveComment] = useState("");
  const [resolveBy, setResolveBy] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [imgZoom, setImgZoom] = useState(false);

  const { data: items = [], isLoading } = useQuery<FeedbackItem[]>({
    queryKey: ["/api/feedback", statusFilter],
    queryFn: async () => {
      const url = statusFilter === "all" ? "/api/feedback" : `/api/feedback?status=${statusFilter}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to load feedback");
      return res.json();
    },
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, any> }) =>
      apiRequest("PATCH", `/api/feedback/${id}`, body),
    onSuccess: (updated: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/feedback"] });
      if (selected?.id === updated.id) setSelected(updated);
      toast({ title: "Feedback updated" });
      setResolveOpen(false);
      setResolveComment("");
      setResolveBy("");
    },
    onError: (e: any) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/feedback/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/feedback"] });
      if (selected?.id === deleteConfirmId) setSelected(null);
      setDeleteConfirmId(null);
      toast({ title: "Feedback deleted" });
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  function handleResolve() {
    if (!selected) return;
    patchMutation.mutate({
      id: selected.id,
      body: { status: "resolved", resolvedComment: resolveComment.trim() || null, resolvedBy: resolveBy.trim() || null },
    });
  }

  const counts = {
    open: items.filter(i => i.status === "open").length,
    in_progress: items.filter(i => i.status === "in_progress").length,
    resolved: items.filter(i => i.status === "resolved").length,
  };
  const total = items.length;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Left panel — list */}
      <div className="w-[420px] shrink-0 flex flex-col border-r">
        {/* Header */}
        <div className="px-5 py-4 border-b">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquarePlus className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-semibold">Feedback Tracker</h1>
            <Badge variant="outline" className="ml-auto text-xs">{total}</Badge>
          </div>
          {/* Summary pills */}
          <div className="flex gap-1.5 flex-wrap">
            {(["open", "in_progress", "resolved"] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s === statusFilter ? "all" : s)}
                data-testid={`filter-${s}`}
                className={`text-[10px] rounded-full border px-2.5 py-0.5 font-medium transition-colors ${
                  statusFilter === s ? STATUS_META[s].color : "border-border text-muted-foreground hover:border-primary/40"
                }`}
              >
                {STATUS_META[s].label} · {counts[s]}
              </button>
            ))}
            {statusFilter !== "all" && (
              <button onClick={() => setStatusFilter("all")} className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5">
                <X className="w-2.5 h-2.5" /> Clear
              </button>
            )}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {[1,2,3,4].map(i => <Skeleton key={i} className="h-20 w-full" />)}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-sm">
              <MessageSquare className="w-8 h-8 mb-2 opacity-30" />
              No feedback {statusFilter !== "all" ? `with status "${statusFilter}"` : "yet"}
            </div>
          ) : (
            <div className="divide-y">
              {items.map(item => {
                const typeMeta = TYPE_META[item.feedbackType] || TYPE_META.general;
                const statusMeta = STATUS_META[item.status] || STATUS_META.open;
                const isSelected = selected?.id === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setSelected(item)}
                    data-testid={`row-feedback-${item.id}`}
                    className={`w-full text-left px-4 py-3 hover:bg-muted/40 transition-colors flex items-start gap-3 ${isSelected ? "bg-muted/60" : ""}`}
                  >
                    <div className="shrink-0 mt-0.5">{typeMeta.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                        <span className="text-[10px] font-medium text-muted-foreground">
                          {FEATURE_LABELS[item.featureArea] || item.featureArea}
                        </span>
                        {item.subFeature && (
                          <>
                            <ChevronRight className="w-2.5 h-2.5 text-muted-foreground/50 shrink-0" />
                            <span className="text-[10px] text-muted-foreground">{item.subFeature}</span>
                          </>
                        )}
                      </div>
                      <p className="text-sm line-clamp-2">{item.feedbackText}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[9px] rounded-full border px-2 py-0.5 font-medium ${statusMeta.color}`}>
                          {statusMeta.label}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{timeAgo(item.submittedAt)}</span>
                        {item.submittedBy && (
                          <span className="text-[10px] text-muted-foreground">· {item.submittedBy}</span>
                        )}
                        {item.screenshotData && <ImageIcon className="w-3 h-3 text-muted-foreground/50" />}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right panel — detail */}
      <div className="flex-1 overflow-y-auto">
        {!selected ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-2">
            <MessageSquarePlus className="w-10 h-10 opacity-20" />
            <p>Select a feedback item to view details</p>
          </div>
        ) : (() => {
          const typeMeta = TYPE_META[selected.feedbackType] || TYPE_META.general;
          const statusMeta = STATUS_META[selected.status] || STATUS_META.open;
          return (
            <div className="max-w-2xl mx-auto px-6 py-6 space-y-5">
              {/* Top bar */}
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <Badge variant="outline" className={`text-[10px] gap-1 ${typeMeta.color}`}>
                      {typeMeta.icon}{typeMeta.label}
                    </Badge>
                    <Badge variant="outline" className={`text-[10px] ${statusMeta.color}`}>
                      {statusMeta.label}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{timeAgo(selected.submittedAt)}</span>
                    {selected.submittedBy && (
                      <span className="text-xs text-muted-foreground">· by {selected.submittedBy}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-sm">
                    <span className="font-medium">{FEATURE_LABELS[selected.featureArea] || selected.featureArea}</span>
                    {selected.subFeature && (
                      <>
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />
                        <span className="text-muted-foreground">{selected.subFeature}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {selected.status !== "in_progress" && selected.status !== "resolved" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => patchMutation.mutate({ id: selected.id, body: { status: "in_progress" } })}
                      disabled={patchMutation.isPending}
                      data-testid="button-mark-in-progress"
                    >
                      <Clock className="w-3 h-3 mr-1" />
                      In Progress
                    </Button>
                  )}
                  {selected.status !== "resolved" ? (
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => { setResolveComment(""); setResolveBy(""); setResolveOpen(true); }}
                      data-testid="button-resolve"
                    >
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Resolve
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => patchMutation.mutate({ id: selected.id, body: { status: "open", resolvedComment: null, resolvedBy: null } })}
                      disabled={patchMutation.isPending}
                      data-testid="button-reopen"
                    >
                      Reopen
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleteConfirmId(selected.id)}
                    data-testid="button-delete-feedback"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              <Separator />

              {/* Feedback text */}
              <div>
                <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Feedback</Label>
                <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap">{selected.feedbackText}</p>
              </div>

              {/* Screenshot */}
              {selected.screenshotData && (
                <div>
                  <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Screenshot</Label>
                  <div className="mt-2">
                    <p className="text-xs text-muted-foreground mb-1.5">{selected.screenshotFilename}</p>
                    <img
                      src={selected.screenshotData}
                      alt="feedback screenshot"
                      className="rounded-md border max-h-72 object-contain cursor-zoom-in"
                      onClick={() => setImgZoom(true)}
                      data-testid="img-screenshot"
                    />
                  </div>
                </div>
              )}

              {/* Resolution info */}
              {selected.status === "resolved" && (
                <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-4">
                  <div className="flex items-center gap-1.5 mb-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                      Resolved {timeAgo(selected.resolvedAt)}
                      {selected.resolvedBy && ` · by ${selected.resolvedBy}`}
                    </span>
                  </div>
                  {selected.resolvedComment && (
                    <p className="text-sm text-emerald-900 dark:text-emerald-200">{selected.resolvedComment}</p>
                  )}
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Resolve dialog */}
      <Dialog open={resolveOpen} onOpenChange={setResolveOpen}>
        <DialogContent className="sm:max-w-[400px]" data-testid="dialog-resolve">
          <DialogHeader>
            <DialogTitle>Resolve Feedback</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Resolution comment <span className="text-muted-foreground">(optional)</span></Label>
              <Textarea
                value={resolveComment}
                onChange={e => setResolveComment(e.target.value)}
                placeholder="Describe how this was addressed…"
                rows={3}
                className="resize-none"
                data-testid="textarea-resolve-comment"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Resolved by <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                value={resolveBy}
                onChange={e => setResolveBy(e.target.value)}
                placeholder="Name or team…"
                className="h-9"
                data-testid="input-resolved-by"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveOpen(false)}>Cancel</Button>
            <Button onClick={handleResolve} disabled={patchMutation.isPending} data-testid="button-confirm-resolve">
              {patchMutation.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
              Mark Resolved
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={!!deleteConfirmId} onOpenChange={v => { if (!v) setDeleteConfirmId(null); }}>
        <DialogContent className="sm:max-w-[360px]" data-testid="dialog-delete-confirm">
          <DialogHeader>
            <DialogTitle>Delete feedback?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">This action cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image zoom overlay */}
      {imgZoom && selected?.screenshotData && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center cursor-zoom-out"
          onClick={() => setImgZoom(false)}
        >
          <img
            src={selected.screenshotData}
            alt="screenshot full"
            className="max-w-[90vw] max-h-[90vh] rounded-md shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}
