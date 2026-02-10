import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Clock,
  Shield,
  AlertTriangle,
  FileCode,
  FlaskConical,
  Activity,
  ScrollText,
  Lightbulb,
  Link2,
  Hash,
  CheckCircle2,
  Tag,
  ShieldCheck,
  Users,
  MessageSquare,
  Zap,
  Target,
  Layers,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Wrench,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/status-badge";
import { DiffViewer } from "@/components/diff-viewer";
import { PermissionGate, usePermission } from "@/components/role-provider";
import type { Approval, Agent, EvalSuite, Policy, AuditEvent } from "@shared/schema";

interface ApprovalDetailData extends Approval {
  agent: Agent | null;
  outcome: { id: string; name: string; riskTier: string } | null;
  evalSuites: EvalSuite[];
  effectivePolicies: Policy[];
  auditTrail: AuditEvent[];
}

interface RequirementsData {
  approvalId: string;
  requirements: Array<{ rule: string; met: boolean; detail: string }>;
}

export default function ApprovalDetail() {
  const [, params] = useRoute("/approvals/:id");
  const approvalId = params?.id;
  const { toast } = useToast();
  const approvalPerm = usePermission("approve_changes");

  const [constraintsOpen, setConstraintsOpen] = useState(false);
  const [labelingOpen, setLabelingOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [requestChangesOpen, setRequestChangesOpen] = useState(false);
  const [requestChangesComment, setRequestChangesComment] = useState("");

  const [canaryPercent, setCanaryPercent] = useState("10");
  const [duration, setDuration] = useState("24h");
  const [maxTraffic, setMaxTraffic] = useState("1000");
  const [constraintNotes, setConstraintNotes] = useState("");

  const [labelingCases, setLabelingCases] = useState("");

  const [rejectReason, setRejectReason] = useState("");
  const [followUpDescription, setFollowUpDescription] = useState("");

  const { data: approval, isLoading } = useQuery<ApprovalDetailData>({
    queryKey: ["/api/approvals", approvalId],
    enabled: !!approvalId,
  });

  const { data: requirementsData } = useQuery<RequirementsData>({
    queryKey: ["/api/approvals", approvalId, "requirements"],
    enabled: !!approvalId,
  });

  const decideMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await apiRequest("PATCH", `/api/approvals/${approvalId}`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/approvals", approvalId] });
      queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
      toast({ title: "Approval updated" });
      setConstraintsOpen(false);
      setLabelingOpen(false);
      setRejectOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update approval", description: err.message, variant: "destructive" });
    },
  });

  const handleApprove = () => {
    decideMutation.mutate({ status: "approved", decidedBy: "Expert Validator" });
  };

  const handleApproveWithConstraints = () => {
    decideMutation.mutate({
      status: "approved",
      decidedBy: "Expert Validator",
      constraintsJson: {
        canaryPercent: Number(canaryPercent),
        duration,
        maxTraffic: Number(maxTraffic),
        notes: constraintNotes,
      },
    });
  };

  const handleRequestLabeling = () => {
    decideMutation.mutate({
      status: "pending",
      decidedBy: "Expert Validator",
      constraintsJson: {
        requiresHumanLabeling: true,
        labelingDescription: labelingCases,
      },
    });
  };

  const handleReject = () => {
    decideMutation.mutate({
      status: "rejected",
      decidedBy: "Expert Validator",
      followUpTask: {
        reason: rejectReason,
        description: followUpDescription,
      },
    });
  };

  const handleRequestChanges = () => {
    decideMutation.mutate({
      status: "changes_requested",
      decidedBy: "Expert Validator",
      constraintsJson: {
        requestedChanges: requestChangesComment,
        requestedBy: "Expert Validator",
      },
    } as any);
    setRequestChangesOpen(false);
    setRequestChangesComment("");
  };

  if (isLoading) {
    return (
      <div className="p-6 flex flex-col gap-4" data-testid="approval-detail-loading">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-6 w-96" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  if (!approval) {
    return (
      <div className="p-6 flex flex-col gap-4 items-center justify-center" data-testid="approval-detail-not-found">
        <AlertTriangle className="w-12 h-12 text-muted-foreground" />
        <p className="text-muted-foreground">Approval not found</p>
        <Link href="/approvals">
          <Button variant="outline" data-testid="button-back-approvals">Back to Approvals</Button>
        </Link>
      </div>
    );
  }

  const evidence = (approval.evidenceJson || {}) as Record<string, any>;
  const requirements = requirementsData?.requirements || [];
  const allRequirementsMet = requirements.length > 0 && requirements.every(r => r.met);
  const riskScore = approval.riskScore || 0;

  const computedRecommendation = (() => {
    if (approval.recommendedAction) return approval.recommendedAction;
    const hasUnmet = requirements.some(r => !r.met);
    if (hasUnmet) return "Request changes";
    if (riskScore > 7) return "Approve with conditions";
    if (riskScore > 4) return "Approve";
    return "Approve";
  })();

  const riskColor = riskScore > 7 ? "text-red-600 dark:text-red-400" : riskScore > 4 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400";

  const dueDate = approval.dueDate ? new Date(approval.dueDate) : null;
  const isOverdue = dueDate && dueDate < new Date();

  return (
    <div className="p-6 flex flex-col gap-6" data-testid="approval-detail-page">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Link href="/approvals">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <h1 className="text-xl font-semibold" data-testid="text-approval-name">
            {approval.objectName || approval.type}
          </h1>
          <StatusBadge status={approval.type} />
          <StatusBadge status={approval.status} />
          <Badge variant="outline" className={`text-xs font-medium ${riskColor}`} data-testid="badge-risk-score">
            Risk: {riskScore.toFixed(1)}
          </Badge>
          {approval.environment && (
            <StatusBadge status={approval.environment} />
          )}
          {dueDate && (
            <Badge
              variant="outline"
              className={`text-xs ${isOverdue ? "text-red-600 dark:text-red-400 border-red-500/20" : "text-muted-foreground"}`}
              data-testid="badge-due-date"
            >
              <Clock className="w-3 h-3 mr-1" />
              {isOverdue ? "Overdue: " : "Due: "}
              {dueDate.toLocaleDateString()}
            </Badge>
          )}
        </div>

        {approval.description && (
          <p className="text-sm text-muted-foreground" data-testid="text-description">
            {approval.description}
          </p>
        )}

        <PermissionGate action="approve_changes">
          <div className="flex items-center gap-2 flex-wrap" data-testid="action-buttons">
            <Button
              variant="default"
              onClick={handleApprove}
              disabled={decideMutation.isPending}
              data-testid="button-approve"
            >
              <CheckCircle className="w-4 h-4 mr-1.5" />
              Approve
            </Button>

            <Dialog open={constraintsOpen} onOpenChange={setConstraintsOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" data-testid="button-approve-constraints">
                  <Shield className="w-4 h-4 mr-1.5" />
                  Approve with Constraints
                </Button>
              </DialogTrigger>
              <DialogContent data-testid="dialog-constraints">
                <DialogHeader>
                  <DialogTitle>Approve with Constraints</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium">Canary Percentage</label>
                    <Input
                      type="number"
                      min="1"
                      max="100"
                      value={canaryPercent}
                      onChange={(e) => setCanaryPercent(e.target.value)}
                      data-testid="input-canary-percent"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium">Duration</label>
                    <Select value={duration} onValueChange={setDuration}>
                      <SelectTrigger data-testid="select-duration">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="12h">12 hours</SelectItem>
                        <SelectItem value="24h">24 hours</SelectItem>
                        <SelectItem value="48h">48 hours</SelectItem>
                        <SelectItem value="7d">7 days</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium">Max Traffic</label>
                    <Input
                      type="number"
                      min="1"
                      value={maxTraffic}
                      onChange={(e) => setMaxTraffic(e.target.value)}
                      data-testid="input-max-traffic"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium">Additional Notes</label>
                    <Textarea
                      value={constraintNotes}
                      onChange={(e) => setConstraintNotes(e.target.value)}
                      data-testid="textarea-constraint-notes"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setConstraintsOpen(false)} data-testid="button-cancel-constraints">
                    Cancel
                  </Button>
                  <Button
                    onClick={handleApproveWithConstraints}
                    disabled={decideMutation.isPending}
                    data-testid="button-submit-constraints"
                  >
                    Approve with Constraints
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={labelingOpen} onOpenChange={setLabelingOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" data-testid="button-request-labeling">
                  <Users className="w-4 h-4 mr-1.5" />
                  Request Human Labeling
                </Button>
              </DialogTrigger>
              <DialogContent data-testid="dialog-labeling">
                <DialogHeader>
                  <DialogTitle>Request Human Labeling</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium">Which eval cases need labeling?</label>
                    <Textarea
                      value={labelingCases}
                      onChange={(e) => setLabelingCases(e.target.value)}
                      placeholder="Describe the eval cases that need human labeling..."
                      data-testid="textarea-labeling-cases"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setLabelingOpen(false)} data-testid="button-cancel-labeling">
                    Cancel
                  </Button>
                  <Button
                    onClick={handleRequestLabeling}
                    disabled={decideMutation.isPending}
                    data-testid="button-submit-labeling"
                  >
                    Submit Request
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={requestChangesOpen} onOpenChange={setRequestChangesOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" data-testid="button-request-changes">
                  <MessageSquare className="w-4 h-4 mr-1.5" />
                  Request Changes
                </Button>
              </DialogTrigger>
              <DialogContent data-testid="dialog-request-changes">
                <DialogHeader>
                  <DialogTitle>Request Changes</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium">What changes are needed?</label>
                    <Textarea
                      value={requestChangesComment}
                      onChange={(e) => setRequestChangesComment(e.target.value)}
                      placeholder="Describe the changes needed before this can be approved..."
                      data-testid="textarea-request-changes"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setRequestChangesOpen(false)} data-testid="button-cancel-request-changes">
                    Cancel
                  </Button>
                  <Button
                    onClick={handleRequestChanges}
                    disabled={decideMutation.isPending || !requestChangesComment.trim()}
                    data-testid="button-submit-request-changes"
                  >
                    Submit Feedback
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="text-red-600 dark:text-red-400" data-testid="button-reject">
                  <XCircle className="w-4 h-4 mr-1.5" />
                  Reject + Follow-up
                </Button>
              </DialogTrigger>
              <DialogContent data-testid="dialog-reject">
                <DialogHeader>
                  <DialogTitle>Reject and Create Follow-up</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium">Rejection Reason</label>
                    <Textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Explain why this approval is being rejected..."
                      data-testid="textarea-reject-reason"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium">Follow-up Task Description</label>
                    <Textarea
                      value={followUpDescription}
                      onChange={(e) => setFollowUpDescription(e.target.value)}
                      placeholder="Describe what needs to be done before re-submitting..."
                      data-testid="textarea-followup-description"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setRejectOpen(false)} data-testid="button-cancel-reject">
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleReject}
                    disabled={decideMutation.isPending}
                    data-testid="button-submit-reject"
                  >
                    Reject
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </PermissionGate>
      </div>

      {approval.objectType === "export_package" && evidence.exportConfig && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="export-package-panels">
          <Card data-testid="panel-export-file-tree">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2 flex-wrap">
                <FileCode className="w-4 h-4 text-muted-foreground" />
                Exported File Tree
              </CardTitle>
              <Badge variant="outline" className="text-[10px]" data-testid="badge-file-count">
                {Array.isArray(evidence.fileTree) ? evidence.fileTree.length : 0} files
              </Badge>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-1.5">
                {Array.isArray(evidence.fileTree) && evidence.fileTree.length > 0 ? (
                  evidence.fileTree.map((fileName: string, i: number) => (
                    <div key={i} className="flex items-center gap-2 p-1.5 rounded-md bg-muted/30" data-testid={`export-file-${i}`}>
                      <FileCode className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="text-xs font-mono">{fileName}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">No file tree data</p>
                )}
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <Badge variant="outline" className="text-[10px]">{(evidence.exportConfig as any)?.framework || "unknown"}</Badge>
                  <Badge variant="outline" className="text-[10px]">{(evidence.exportConfig as any)?.format || "unknown"}</Badge>
                  <Badge variant="outline" className="text-[10px]">{(evidence.exportConfig as any)?.llmProvider || "unknown"}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="panel-export-deps">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2 flex-wrap">
                <Layers className="w-4 h-4 text-muted-foreground" />
                Dependency Diff
              </CardTitle>
              {(evidence.exportConfig as any)?.pinVersions && (
                <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-500/20" data-testid="badge-pinned">
                  Pinned
                </Badge>
              )}
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2">
                {(() => {
                  const fileTree = evidence.fileTree as string[] | undefined;
                  const fileContents = evidence.fileContents as Record<string, string> | undefined;
                  const depFile = fileTree?.find((f: string) => f === "package.json" || f === "requirements.txt");
                  if (depFile && fileContents?.[depFile]) {
                    return (
                      <div className="flex flex-col gap-1.5" data-testid="dep-file-preview">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium">{depFile}</span>
                          <Badge variant="outline" className="text-[10px]">new file</Badge>
                        </div>
                        <pre className="text-[11px] font-mono bg-muted/30 rounded-md p-2.5 overflow-auto max-h-48 whitespace-pre-wrap">{fileContents[depFile]}</pre>
                      </div>
                    );
                  }
                  return <p className="text-xs text-muted-foreground">No dependency file in export</p>;
                })()}
              </div>
            </CardContent>
          </Card>

          <Card data-testid="panel-export-eval-results">
            <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2 flex-wrap">
                <FlaskConical className="w-4 h-4 text-muted-foreground" />
                Eval Results Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2">
                {evidence.gateResults ? (
                  <>
                    <div className="flex items-center justify-between gap-2 flex-wrap" data-testid="gate-compile">
                      <span className="text-sm">Static Compile</span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${(evidence.gateResults as any).compileStatus === "passed" ? "text-emerald-600 dark:text-emerald-400 border-emerald-500/20" : (evidence.gateResults as any).compileStatus === "failed" ? "text-red-600 dark:text-red-400 border-red-500/20" : "text-muted-foreground"}`}
                        data-testid="badge-gate-compile"
                      >
                        {(evidence.gateResults as any).compileStatus === "passed" ? "Passed" : (evidence.gateResults as any).compileStatus === "failed" ? "Failed" : "Not run"}
                      </Badge>
                    </div>
                    {(evidence.gateResults as any).compileOutput && (
                      <pre className="text-[11px] font-mono bg-muted/30 rounded-md p-2 overflow-auto max-h-24 whitespace-pre-wrap" data-testid="output-compile">{(evidence.gateResults as any).compileOutput}</pre>
                    )}
                    <div className="flex items-center justify-between gap-2 flex-wrap" data-testid="gate-eval">
                      <span className="text-sm">Eval Suite</span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${(evidence.gateResults as any).evalStatus === "passed" ? "text-emerald-600 dark:text-emerald-400 border-emerald-500/20" : (evidence.gateResults as any).evalStatus === "failed" ? "text-red-600 dark:text-red-400 border-red-500/20" : "text-muted-foreground"}`}
                        data-testid="badge-gate-eval"
                      >
                        {(evidence.gateResults as any).evalStatus === "passed" ? "Passed" : (evidence.gateResults as any).evalStatus === "failed" ? "Failed" : "Not run"}
                      </Badge>
                    </div>
                    {(evidence.gateResults as any).evalOutput && (
                      <pre className="text-[11px] font-mono bg-muted/30 rounded-md p-2 overflow-auto max-h-24 whitespace-pre-wrap" data-testid="output-eval">{(evidence.gateResults as any).evalOutput}</pre>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">No gate results available</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card data-testid="panel-export-tool-stubs">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2 flex-wrap">
                <Wrench className="w-4 h-4 text-muted-foreground" />
                Tool Adapter Stubs
              </CardTitle>
              {(() => {
                const adapters = evidence.toolAdapters as Record<string, string> | undefined;
                if (!adapters) return null;
                const stubCount = Object.values(adapters).filter(v => v === "stub").length;
                return stubCount > 0 ? (
                  <Badge variant="outline" className="text-[10px] text-amber-600 dark:text-amber-400 border-amber-500/20" data-testid="badge-stub-count">
                    {stubCount} stub{stubCount !== 1 ? "s" : ""}
                  </Badge>
                ) : null;
              })()}
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-1.5">
                {evidence.toolAdapters && Object.keys(evidence.toolAdapters as Record<string, string>).length > 0 ? (
                  Object.entries(evidence.toolAdapters as Record<string, string>).map(([name, status]) => (
                    <div key={name} className="flex items-center justify-between gap-2 flex-wrap" data-testid={`tool-adapter-${name}`}>
                      <span className="text-sm">{name}</span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${status === "stub" ? "text-amber-600 dark:text-amber-400 border-amber-500/20" : status === "customer" ? "text-blue-600 dark:text-blue-400 border-blue-500/20" : "text-emerald-600 dark:text-emerald-400 border-emerald-500/20"}`}
                      >
                        {status === "stub" ? "Stub (new)" : status === "customer" ? "Customer" : "Built-in"}
                      </Badge>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">No tool adapters configured</p>
                )}
                {(() => {
                  const adapters = evidence.toolAdapters as Record<string, string> | undefined;
                  if (!adapters) return null;
                  const stubCount = Object.values(adapters).filter(v => v === "stub").length;
                  if (stubCount === 0) return null;
                  return (
                    <div className="flex items-start gap-2 mt-1.5 p-2.5 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                      <span className="text-xs text-amber-700 dark:text-amber-300">
                        {stubCount} tool adapter{stubCount !== 1 ? "s" : ""} generated as stubs with placeholder implementations. These require implementation before production use and introduce elevated tool permissions.
                      </span>
                    </div>
                  );
                })()}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Approval Requirements Panel */}
        <Card data-testid="panel-requirements">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 flex-wrap">
              <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
              Approval Requirements
            </CardTitle>
            <Badge variant="outline" className="text-[10px]" data-testid="badge-requirements-count">
              {requirements.filter(r => r.met).length}/{requirements.length} met
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3">
              {requirements.map((req, i) => (
                <div key={i} className="flex flex-col gap-1" data-testid={`requirement-${i}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    {req.met ? (
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    )}
                    <span className="text-sm font-medium">{req.rule}</span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${req.met ? "text-emerald-600 dark:text-emerald-400 border-emerald-500/20" : "text-amber-600 dark:text-amber-400 border-amber-500/20"}`}
                      data-testid={`badge-requirement-status-${i}`}
                    >
                      {req.met ? "Met" : "Unmet"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground pl-5.5">{req.detail}</p>
                </div>
              ))}
              {requirements.length === 0 && (
                <p className="text-xs text-muted-foreground">No requirements data available</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Diff Viewer Panel */}
        <Card data-testid="panel-diff-viewer">
          <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 flex-wrap">
              <FileCode className="w-4 h-4 text-muted-foreground" />
              Diff Viewer
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3">
              {approval.diffSummary && (
                <div className="flex flex-col gap-1" data-testid="diff-summary">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Summary</span>
                  <p className="text-sm">{approval.diffSummary}</p>
                </div>
              )}
              {evidence.configDiff && (
                <DiffViewer
                  mode="generic"
                  configDiff={
                    Array.isArray(evidence.configDiff)
                      ? evidence.configDiff.map((l: any) => typeof l === "string" ? l : JSON.stringify(l))
                      : [typeof evidence.configDiff === "string" ? evidence.configDiff : JSON.stringify(evidence.configDiff)]
                  }
                />
              )}
              {evidence.blueprintSummary && (
                <DiffViewer
                  mode="blueprint"
                  title="Blueprint Changes"
                  blueprintNodes={
                    (Array.isArray(evidence.blueprintSummary) ? evidence.blueprintSummary : [evidence.blueprintSummary]).map((node: any, i: number) => ({
                      nodeId: `node-${i}`,
                      name: typeof node === "string" ? node : node.name || JSON.stringify(node),
                      status: (node.change === "added" ? "added" : node.change === "removed" ? "removed" : node.change ? "modified" : "unchanged") as "added" | "removed" | "modified" | "unchanged",
                      changes: node.change ? [node.change] : undefined,
                    }))
                  }
                />
              )}
              {!approval.diffSummary && !evidence.configDiff && !evidence.blueprintSummary && (
                <p className="text-xs text-muted-foreground">No diff data available</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Eval Report Panel */}
        <Card data-testid="panel-eval-report">
          <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 flex-wrap">
              <FlaskConical className="w-4 h-4 text-muted-foreground" />
              Eval Report
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3">
              {evidence.evalResults?.before && evidence.evalResults?.after ? (
                <div className="flex flex-col gap-2" data-testid="eval-comparison">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Before / After Comparison</span>
                  <div className="flex flex-col gap-2">
                    {(evidence.evalResults.after as any[]).map((suite: any, i: number) => {
                      const before = (evidence.evalResults.before as any[])?.[i];
                      const passRate = suite.passRate ?? suite.pass_rate ?? 0;
                      const beforeRate = before?.passRate ?? before?.pass_rate ?? 0;
                      const delta = passRate - beforeRate;
                      const passColor = passRate >= 90 ? "text-emerald-600 dark:text-emerald-400" : passRate >= 70 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";
                      return (
                        <div key={i} className="flex items-center justify-between gap-2 flex-wrap" data-testid={`eval-comparison-${i}`}>
                          <span className="text-sm">{suite.name || `Suite ${i + 1}`}</span>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-muted-foreground">{beforeRate.toFixed(1)}%</span>
                            <ArrowLeft className="w-3 h-3 text-muted-foreground rotate-180" />
                            <span className={`text-sm font-medium ${passColor}`}>{passRate.toFixed(1)}%</span>
                            {delta > 0 ? (
                              <div className="flex items-center gap-1" data-testid={`eval-delta-improved-${i}`}>
                                <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                                <Badge
                                  variant="outline"
                                  className="text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                >
                                  +{delta.toFixed(1)}% improved
                                </Badge>
                              </div>
                            ) : delta < 0 ? (
                              <div className="flex items-center gap-1" data-testid={`eval-delta-regressed-${i}`}>
                                <TrendingDown className="w-3.5 h-3.5 text-red-500" />
                                <Badge
                                  variant="outline"
                                  className="text-[10px] text-red-600 dark:text-red-400 border-red-500/20"
                                >
                                  {delta.toFixed(1)}% regressed
                                </Badge>
                              </div>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-[10px] text-muted-foreground"
                              >
                                No change
                              </Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : approval.evalSuites && approval.evalSuites.length > 0 ? (
                <div className="flex flex-col gap-2" data-testid="eval-suites-list">
                  {approval.evalSuites.map((suite, i) => {
                    const passRate = suite.passRate || 0;
                    const passColor = passRate >= 90 ? "text-emerald-600 dark:text-emerald-400" : passRate >= 70 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";
                    return (
                      <div key={suite.id} className="flex items-center justify-between gap-2 flex-wrap" data-testid={`eval-suite-${suite.id}`}>
                        <span className="text-sm">{suite.name}</span>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-sm font-medium ${passColor}`}>{passRate.toFixed(1)}%</span>
                          <span className="text-xs text-muted-foreground">{suite.totalCases || 0} cases</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No eval data available</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Shadow Replay Panel */}
        <Card data-testid="panel-shadow-replay">
          <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 flex-wrap">
              <Activity className="w-4 h-4 text-muted-foreground" />
              Shadow Replay
            </CardTitle>
          </CardHeader>
          <CardContent>
            {evidence.shadowReplayResults ? (
              <div className="flex flex-col gap-3" data-testid="shadow-replay-data">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Divergences</span>
                    <span className="text-lg font-semibold" data-testid="text-divergence-count">
                      {evidence.shadowReplayResults.divergenceCount ?? evidence.shadowReplayResults.divergences ?? 0}
                    </span>
                  </div>
                  {evidence.shadowReplayResults.totalReplays && (
                    <div className="flex flex-col">
                      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Total Replays</span>
                      <span className="text-lg font-semibold">{evidence.shadowReplayResults.totalReplays}</span>
                    </div>
                  )}
                </div>
                {evidence.shadowReplayResults.samples && (
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Sample Comparisons</span>
                    {(evidence.shadowReplayResults.samples as any[]).map((sample: any, i: number) => (
                      <div key={i} className="rounded-md bg-muted/30 p-2 flex flex-col gap-1" data-testid={`shadow-sample-${i}`}>
                        <span className="text-xs font-medium">{sample.input || sample.name || `Sample ${i + 1}`}</span>
                        <div className="flex items-center gap-2 flex-wrap text-xs">
                          <span className="text-muted-foreground">Expected: {sample.expected || "N/A"}</span>
                          <span className={sample.matched === false ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}>
                            Actual: {sample.actual || "N/A"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground" data-testid="text-no-shadow-replay">
                No shadow replay data available
              </p>
            )}
          </CardContent>
        </Card>

        {/* Blast Radius Analysis Panel */}
        <Card data-testid="panel-blast-radius">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 flex-wrap">
              <Activity className="w-4 h-4 text-muted-foreground" />
              Blast Radius Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            {evidence.blastRadius ? (
              <div className="flex flex-col gap-3" data-testid="blast-radius-data">
                <div className="grid grid-cols-3 gap-2" data-testid="blast-radius-stats">
                  <div className="rounded-md border p-2.5 flex flex-col items-center gap-1" data-testid="stat-deployments">
                    <span className="text-lg font-semibold">
                      {(evidence.blastRadius as any).affectedDeployments?.length ?? (evidence.blastRadius as any).deploymentCount ?? 0}
                    </span>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Deployments</span>
                  </div>
                  <div className="rounded-md border p-2.5 flex flex-col items-center gap-1" data-testid="stat-outcomes">
                    <span className="text-lg font-semibold">
                      {(evidence.blastRadius as any).affectedOutcomes?.length ?? 0}
                    </span>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Outcomes</span>
                  </div>
                  <div className="rounded-md border p-2.5 flex flex-col items-center gap-1" data-testid="stat-agents">
                    <span className="text-lg font-semibold">
                      {(evidence.blastRadius as any).affectedAgents?.length ?? (evidence.blastRadius as any).agentCount ?? 1}
                    </span>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Agents</span>
                  </div>
                </div>

                {(evidence.blastRadius as any).affectedOutcomes?.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    {((evidence.blastRadius as any).affectedOutcomes as Array<{ name: string; riskTier?: string; status?: string }>).map((outcome, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/30 flex-wrap" data-testid={`blast-outcome-${idx}`}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Target className="w-3 h-3 text-muted-foreground shrink-0" />
                          <span className="text-xs font-medium">{outcome.name}</span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {outcome.riskTier && <StatusBadge status={outcome.riskTier} />}
                          {outcome.status && <StatusBadge status={outcome.status} />}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {(evidence.blastRadius as any).affectedSegments?.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    {((evidence.blastRadius as any).affectedSegments as Array<{ name: string; userCount?: number }>).map((seg, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/30 flex-wrap" data-testid={`blast-segment-${idx}`}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Layers className="w-3 h-3 text-muted-foreground shrink-0" />
                          <span className="text-xs font-medium">{seg.name}</span>
                        </div>
                        {seg.userCount && (
                          <span className="text-[10px] text-muted-foreground">{seg.userCount.toLocaleString()} users</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {(evidence.blastRadius as any).riskSummary && (
                  <div className="flex items-start gap-2 p-2.5 rounded-md bg-amber-500/5 border border-amber-500/10">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                    <span className="text-[11px]" data-testid="text-risk-summary">{(evidence.blastRadius as any).riskSummary}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-3" data-testid="blast-radius-derived">
                <div className="grid grid-cols-3 gap-2" data-testid="blast-radius-stats">
                  <div className="rounded-md border p-2.5 flex flex-col items-center gap-1" data-testid="stat-deployments">
                    <span className="text-lg font-semibold">1</span>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Deployments</span>
                  </div>
                  <div className="rounded-md border p-2.5 flex flex-col items-center gap-1" data-testid="stat-outcomes">
                    <span className="text-lg font-semibold">{approval.outcome ? 1 : 0}</span>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Outcomes</span>
                  </div>
                  <div className="rounded-md border p-2.5 flex flex-col items-center gap-1" data-testid="stat-agents">
                    <span className="text-lg font-semibold">{approval.agent ? 1 : 0}</span>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Agents</span>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  {approval.agent && (
                    <div className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/30 flex-wrap" data-testid="blast-derived-agent">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Users className="w-3 h-3 text-muted-foreground shrink-0" />
                        <span className="text-xs font-medium">Agent: {approval.agent.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {approval.environment && <StatusBadge status={approval.environment} />}
                        {approval.agent.riskTier && <StatusBadge status={approval.agent.riskTier} />}
                      </div>
                    </div>
                  )}
                  {approval.outcome && (
                    <div className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/30 flex-wrap" data-testid="blast-derived-outcome">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Target className="w-3 h-3 text-muted-foreground shrink-0" />
                        <span className="text-xs font-medium">Outcome: {approval.outcome.name}</span>
                      </div>
                      <StatusBadge status={approval.outcome.riskTier} />
                    </div>
                  )}
                  {!approval.agent && !approval.outcome && (
                    <p className="text-xs text-muted-foreground">No blast radius data available</p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Policy Deltas Panel */}
        <Card data-testid="panel-policy-deltas">
          <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 flex-wrap">
              <Shield className="w-4 h-4 text-muted-foreground" />
              Policy Deltas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3">
              {approval.effectivePolicies && approval.effectivePolicies.length > 0 ? (
                <div className="flex flex-col gap-2" data-testid="policies-list">
                  {approval.effectivePolicies.map((policy) => {
                    const policyDelta = evidence.policyDeltas?.find?.((d: any) => d.policyId === policy.id || d.name === policy.name);
                    return (
                      <div key={policy.id} className="flex items-center justify-between gap-2 flex-wrap" data-testid={`policy-${policy.id}`}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm">{policy.name}</span>
                          <Badge variant="outline" className="text-[10px]">{(policy as any).type || policy.domain}</Badge>
                          <StatusBadge status={(policy as any).severity || "LOW"} />
                        </div>
                        {policyDelta && (
                          <Badge variant="outline" className="text-[10px] text-amber-600 dark:text-amber-400 border-amber-500/20" data-testid={`badge-policy-changed-${policy.id}`}>
                            Changed
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No effective policies</p>
              )}
              {evidence.policyDeltas && !approval.effectivePolicies?.length && (
                <div className="flex flex-col gap-2" data-testid="policy-deltas-standalone">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Policy Changes</span>
                  {(Array.isArray(evidence.policyDeltas) ? evidence.policyDeltas : [evidence.policyDeltas]).map((delta: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-sm flex-wrap" data-testid={`policy-delta-${i}`}>
                      <Tag className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span>{delta.name || delta.policyId || `Policy ${i + 1}`}</span>
                      <Badge variant="outline" className="text-[10px]">{delta.change || "modified"}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Audit Preview Panel */}
        <Card data-testid="panel-audit-preview">
          <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 flex-wrap">
              <ScrollText className="w-4 h-4 text-muted-foreground" />
              Audit Trail
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3">
              {approval.auditTrail && approval.auditTrail.length > 0 ? (
                <div className="flex flex-col gap-2" data-testid="audit-trail-list">
                  {approval.auditTrail.map((event) => (
                    <div key={event.id} className="flex items-start gap-2" data-testid={`audit-event-${event.id}`}>
                      <div className="mt-0.5 shrink-0">
                        {event.eventHash ? (
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <Hash className="w-3.5 h-3.5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{event.action}</span>
                          <span className="text-xs text-muted-foreground">{event.actorId}</span>
                        </div>
                        {event.details && (
                          <p className="text-xs text-muted-foreground truncate">{event.details}</p>
                        )}
                        <span className="text-[10px] text-muted-foreground">
                          {event.createdAt ? new Date(event.createdAt).toLocaleString() : "N/A"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No audit events recorded yet</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recommended Action Panel */}
        <Card data-testid="panel-recommended-action">
          <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 flex-wrap">
              <Lightbulb className="w-4 h-4 text-muted-foreground" />
              Recommended Action
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3 flex-wrap" data-testid="recommended-action">
                {computedRecommendation.toLowerCase().includes("reject") || computedRecommendation.toLowerCase().includes("request changes") ? (
                  <XCircle className="w-5 h-5 text-amber-500 shrink-0" />
                ) : computedRecommendation.toLowerCase().includes("condition") ? (
                  <Shield className="w-5 h-5 text-blue-500 shrink-0" />
                ) : (
                  <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
                )}
                <span className="text-sm font-medium" data-testid="text-recommended-action">{computedRecommendation}</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                  <span>Risk Score: {riskScore.toFixed(1)}</span>
                  <span>Requirements: {requirements.filter(r => r.met).length}/{requirements.length} met</span>
                </div>
                {approval.agent && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                    <span>Agent: {approval.agent.name}</span>
                    {approval.agent.riskTier && <StatusBadge status={approval.agent.riskTier} />}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Policy Compliance Panel */}
        <Card data-testid="panel-policy-checks">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 flex-wrap">
              <Shield className="w-4 h-4 text-muted-foreground" />
              Policy Compliance
            </CardTitle>
            {(() => {
              const checks = evidence.policyChecks as Array<{ name: string; passed: boolean; detail?: string }> | undefined;
              const policies = approval.effectivePolicies;
              const source = checks || policies;
              if (!source || source.length === 0) return null;
              const passedCount = checks
                ? checks.filter(c => c.passed).length
                : policies.length;
              const totalCount = source.length;
              return (
                <Badge
                  variant="outline"
                  className={`text-[10px] ${passedCount === totalCount ? "text-emerald-600 dark:text-emerald-400 border-emerald-500/20" : "text-amber-600 dark:text-amber-400 border-amber-500/20"}`}
                  data-testid="badge-policy-summary"
                >
                  {passedCount}/{totalCount} passed
                </Badge>
              );
            })()}
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2">
              {evidence.policyChecks && Array.isArray(evidence.policyChecks) && evidence.policyChecks.length > 0 ? (
                (evidence.policyChecks as Array<{ name: string; passed: boolean; detail?: string }>).map((check, i) => (
                  <div key={i} className="flex items-start gap-2 p-2 rounded-md bg-muted/30" data-testid={`policy-check-${i}`}>
                    {check.passed ? (
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
                    )}
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-xs font-medium">{check.name}</span>
                      {check.detail && (
                        <span className="text-[11px] text-muted-foreground">{check.detail}</span>
                      )}
                    </div>
                  </div>
                ))
              ) : approval.effectivePolicies && approval.effectivePolicies.length > 0 ? (
                approval.effectivePolicies.map((policy) => (
                  <div key={policy.id} className="flex items-start gap-2 p-2 rounded-md bg-muted/30" data-testid={`policy-check-${policy.id}`}>
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-xs font-medium">{policy.name}</span>
                      <span className="text-[11px] text-muted-foreground">{policy.domain || (policy as any).type || "Active policy"}</span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground" data-testid="text-no-policy-checks">No policy checks available</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Approval Audit Trail Panel */}
        <Card data-testid="panel-audit-trail">
          <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 flex-wrap">
              <ScrollText className="w-4 h-4 text-muted-foreground" />
              Approval Audit Trail
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3">
              {approval.auditTrail && approval.auditTrail.length > 0 ? (
                <div className="flex flex-col gap-2" data-testid="audit-trail-events">
                  {[...approval.auditTrail]
                    .sort((a, b) => {
                      const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                      const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                      return db - da;
                    })
                    .map((event) => {
                      const eventTime = event.createdAt ? new Date(event.createdAt) : null;
                      const relativeTime = eventTime
                        ? (() => {
                            const diffMs = Date.now() - eventTime.getTime();
                            const diffMin = Math.floor(diffMs / 60000);
                            if (diffMin < 1) return "Just now";
                            if (diffMin < 60) return `${diffMin}m ago`;
                            const diffHrs = Math.floor(diffMin / 60);
                            if (diffHrs < 24) return `${diffHrs}h ago`;
                            const diffDays = Math.floor(diffHrs / 24);
                            return `${diffDays}d ago`;
                          })()
                        : "N/A";
                      return (
                        <div key={event.id} className="flex items-center gap-2 flex-wrap" data-testid={`audit-trail-event-${event.id}`}>
                          <span className="text-[10px] text-muted-foreground min-w-[52px] shrink-0">{relativeTime}</span>
                          <Badge variant="outline" className="text-[10px]" data-testid={`audit-trail-action-${event.id}`}>
                            {event.action}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{event.actorId}</span>
                          {event.details && (
                            <span className="text-[11px] text-muted-foreground truncate max-w-[200px]">{event.details}</span>
                          )}
                        </div>
                      );
                    })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground" data-testid="text-no-audit-events">No audit events</p>
              )}

              <div className="border-t pt-3 mt-1" data-testid="ai-recommendation-section">
                <div className="flex items-start gap-2 p-2.5 rounded-md bg-muted/30">
                  <Lightbulb className={`w-4 h-4 mt-0.5 shrink-0 ${
                    computedRecommendation.toLowerCase().includes("reject") || computedRecommendation.toLowerCase().includes("request changes")
                      ? "text-amber-500"
                      : computedRecommendation.toLowerCase().includes("condition")
                        ? "text-blue-500"
                        : "text-emerald-500"
                  }`} />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">AI Recommendation</span>
                    <span className={`text-sm font-medium ${
                      computedRecommendation.toLowerCase().includes("reject") || computedRecommendation.toLowerCase().includes("request changes")
                        ? "text-amber-600 dark:text-amber-400"
                        : computedRecommendation.toLowerCase().includes("condition")
                          ? "text-blue-600 dark:text-blue-400"
                          : "text-emerald-600 dark:text-emerald-400"
                    }`} data-testid="text-ai-recommendation">
                      {computedRecommendation}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
