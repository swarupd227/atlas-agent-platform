import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Paperclip, X, Image as ImageIcon, MessageSquarePlus } from "lucide-react";

const FEEDBACK_TYPES = [
  { value: "bug", label: "Bug Report" },
  { value: "enhancement", label: "Enhancement" },
  { value: "question", label: "Question" },
  { value: "general", label: "General Feedback" },
];

const FEATURE_AREAS = [
  { value: "pipeline_builder", label: "Pipeline Builder" },
  { value: "agent_management", label: "Agent Management" },
  { value: "team_blueprints", label: "Team Blueprints" },
  { value: "mcp_servers", label: "MCP Servers / Integrations" },
  { value: "governance", label: "Governance & Compliance" },
  { value: "observability", label: "Observability & Monitoring" },
  { value: "pii_masking", label: "PII Masking" },
  { value: "export_bundle", label: "Export / Bundle Export" },
  { value: "evaluation", label: "Evaluation Framework" },
  { value: "workflow_state", label: "Workflow State" },
  { value: "knowledge_bases", label: "Knowledge Bases" },
  { value: "skills_tools", label: "Skills & Tools" },
  { value: "autonomy_engine", label: "Autonomy Engine" },
  { value: "demo_center", label: "Demo Center" },
  { value: "ui_ux", label: "UI / UX" },
  { value: "performance", label: "Performance" },
  { value: "other", label: "Other" },
];

interface FeedbackModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MAX_SCREENSHOT_BYTES = 4 * 1024 * 1024; // 4 MB

export function FeedbackModal({ open, onOpenChange }: FeedbackModalProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [feedbackType, setFeedbackType] = useState("general");
  const [featureArea, setFeatureArea] = useState("");
  const [subFeature, setSubFeature] = useState("");
  const [feedbackText, setFeedbackText] = useState("");
  const [submittedBy, setSubmittedBy] = useState("");
  const [screenshot, setScreenshot] = useState<{ data: string; filename: string } | null>(null);
  const [screenshotError, setScreenshotError] = useState("");

  function reset() {
    setFeedbackType("general");
    setFeatureArea("");
    setSubFeature("");
    setFeedbackText("");
    setSubmittedBy("");
    setScreenshot(null);
    setScreenshotError("");
  }

  const submitMutation = useMutation({
    mutationFn: (body: Record<string, any>) => apiRequest("POST", "/api/feedback", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/feedback"] });
      toast({ title: "Feedback submitted", description: "Thanks — we'll review it shortly." });
      reset();
      onOpenChange(false);
    },
    onError: (e: any) => toast({ title: "Submit failed", description: e.message, variant: "destructive" }),
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setScreenshotError("");
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setScreenshotError("Only image files are accepted."); return; }
    if (file.size > MAX_SCREENSHOT_BYTES) { setScreenshotError("Image must be under 4 MB."); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setScreenshot({ data: ev.target?.result as string, filename: file.name });
    };
    reader.readAsDataURL(file);
  }

  function handleSubmit() {
    if (!featureArea || !feedbackText.trim()) return;
    submitMutation.mutate({
      feedbackType,
      featureArea,
      subFeature: subFeature.trim() || null,
      feedbackText: feedbackText.trim(),
      submittedBy: submittedBy.trim() || null,
      screenshotData: screenshot?.data || null,
      screenshotFilename: screenshot?.filename || null,
    });
  }

  const canSubmit = !!featureArea && feedbackText.trim().length > 0 && !submitMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[520px]" data-testid="dialog-feedback">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquarePlus className="w-4 h-4 text-primary" />
            Share Feedback
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Row 1: Type + Feature Area */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Type</Label>
              <Select value={feedbackType} onValueChange={setFeedbackType}>
                <SelectTrigger className="h-9" data-testid="select-feedback-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FEEDBACK_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">Feature Area <span className="text-destructive">*</span></Label>
              <Select value={featureArea} onValueChange={setFeatureArea}>
                <SelectTrigger className="h-9" data-testid="select-feature-area">
                  <SelectValue placeholder="Select area…" />
                </SelectTrigger>
                <SelectContent>
                  {FEATURE_AREAS.map(f => (
                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Sub-feature */}
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Sub-feature / Specific area <span className="text-muted-foreground">(optional)</span></Label>
            <Input
              value={subFeature}
              onChange={e => setSubFeature(e.target.value)}
              placeholder="e.g. Stage type dropdown, Token map security…"
              className="h-9"
              data-testid="input-sub-feature"
            />
          </div>

          {/* Feedback text */}
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Feedback <span className="text-destructive">*</span></Label>
            <Textarea
              value={feedbackText}
              onChange={e => setFeedbackText(e.target.value)}
              placeholder="Describe the issue, idea, or question…"
              rows={4}
              className="resize-none"
              data-testid="textarea-feedback"
            />
          </div>

          {/* Name (optional) */}
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Your name <span className="text-muted-foreground">(optional)</span></Label>
            <Input
              value={submittedBy}
              onChange={e => setSubmittedBy(e.target.value)}
              placeholder="Who's submitting this?"
              className="h-9"
              data-testid="input-submitted-by"
            />
          </div>

          {/* Screenshot */}
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Screenshot <span className="text-muted-foreground">(optional, max 4 MB)</span></Label>
            {screenshot ? (
              <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
                <ImageIcon className="w-4 h-4 text-primary shrink-0" />
                <span className="text-xs flex-1 truncate">{screenshot.filename}</span>
                <button
                  onClick={() => { setScreenshot(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                  className="text-muted-foreground hover:text-destructive"
                  data-testid="button-remove-screenshot"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors w-full"
                  data-testid="button-attach-screenshot"
                >
                  <Paperclip className="w-3.5 h-3.5" />
                  Attach screenshot
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                  data-testid="input-screenshot-file"
                />
                {screenshotError && (
                  <p className="text-xs text-destructive mt-1">{screenshotError}</p>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }} data-testid="button-cancel-feedback">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit} data-testid="button-submit-feedback">
            {submitMutation.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
            Submit Feedback
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function FeedbackTrigger() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-muted-foreground/70 hover:text-muted-foreground hover:bg-sidebar-accent/40 rounded-md transition-colors"
        data-testid="button-open-feedback"
        title="Share feedback"
      >
        <MessageSquarePlus className="w-3.5 h-3.5 shrink-0" />
        <span>Feedback</span>
      </button>
      <FeedbackModal open={open} onOpenChange={setOpen} />
    </>
  );
}
