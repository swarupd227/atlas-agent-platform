import { useState, useCallback, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { useMutation } from "@tanstack/react-query";
import {
  Workflow, Zap, Users, Brain, Bell, Square,
  Trash2, ArrowRight, ChevronRight, Sparkles, Loader2,
  Play, Database, GitBranch,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export interface ProcessStep {
  id: string;
  type: "trigger" | "get_info" | "ai_reasoning" | "make_decision" | "expert_approval" | "take_action" | "send_notification" | "end";
  label: string;
  description: string;
  actor?: string;
  estimatedMins?: number;
}

const STEP_TYPES: Array<{
  type: ProcessStep["type"];
  label: string;
  color: string;
  bg: string;
  border: string;
  icon: typeof Zap;
  hint: string;
}> = [
  { type: "trigger", label: "Trigger", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30", icon: Zap, hint: "An event that starts the process" },
  { type: "get_info", label: "Get Information", color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/30", icon: Database, hint: "Collect or look up data needed" },
  { type: "ai_reasoning", label: "AI Reasoning", color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/30", icon: Brain, hint: "AI analyses and generates insights" },
  { type: "make_decision", label: "Make Decision", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30", icon: GitBranch, hint: "A branching point based on criteria" },
  { type: "expert_approval", label: "Expert Approval", color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30", icon: Users, hint: "Human review and sign-off required" },
  { type: "take_action", label: "Take Action", color: "text-cyan-600 dark:text-cyan-400", bg: "bg-cyan-500/10", border: "border-cyan-500/30", icon: Play, hint: "Execute a task or update a system" },
  { type: "send_notification", label: "Send Notification", color: "text-pink-600 dark:text-pink-400", bg: "bg-pink-500/10", border: "border-pink-500/30", icon: Bell, hint: "Alert or inform stakeholders" },
  { type: "end", label: "End", color: "text-slate-600 dark:text-slate-400", bg: "bg-slate-500/10", border: "border-slate-500/30", icon: Square, hint: "The process completes" },
];

const STEP_TYPE_MAP = Object.fromEntries(STEP_TYPES.map(t => [t.type, t]));

interface ProcessTemplate {
  id: string;
  name: string;
  description: string;
  category: "Finance" | "HR" | "IT" | "Operations";
  estimatedMins: number;
  steps: Array<Omit<ProcessStep, "id">>;
}

const PROCESS_TEMPLATES: ProcessTemplate[] = [
  {
    id: "invoice-approval",
    name: "Invoice Approval",
    description: "Automated invoice receipt, validation, and multi-level approval routing",
    category: "Finance",
    estimatedMins: 45,
    steps: [
      { type: "trigger", label: "Invoice Received", description: "New invoice arrives via email or portal", actor: "Supplier", estimatedMins: 0 },
      { type: "get_info", label: "Extract Invoice Data", description: "Pull invoice details, line items, and vendor info", actor: "System", estimatedMins: 2 },
      { type: "ai_reasoning", label: "Validate & Match PO", description: "AI checks line items against purchase order", actor: "AI", estimatedMins: 1 },
      { type: "make_decision", label: "Approval Threshold?", description: "Route based on invoice amount and policy", actor: "System", estimatedMins: 0 },
      { type: "expert_approval", label: "Manager Approval", description: "Finance manager reviews and approves", actor: "Finance Manager", estimatedMins: 30 },
      { type: "take_action", label: "Schedule Payment", description: "Add to payment run for next cycle", actor: "System", estimatedMins: 2 },
      { type: "send_notification", label: "Confirm to Supplier", description: "Send payment confirmation to vendor", actor: "System", estimatedMins: 1 },
      { type: "end", label: "Complete", description: "Invoice processed and archived", actor: "System", estimatedMins: 0 },
    ],
  },
  {
    id: "customer-onboarding",
    name: "Customer Onboarding",
    description: "End-to-end new customer setup from application to activation",
    category: "Operations",
    estimatedMins: 120,
    steps: [
      { type: "trigger", label: "Application Submitted", description: "Customer completes onboarding form", actor: "Customer", estimatedMins: 0 },
      { type: "get_info", label: "Gather Documents", description: "Collect ID, proof of address, signed agreements", actor: "Customer", estimatedMins: 20 },
      { type: "ai_reasoning", label: "KYC Risk Assessment", description: "AI screens for compliance and risk signals", actor: "AI", estimatedMins: 3 },
      { type: "make_decision", label: "Approval Needed?", description: "High-risk applications routed for manual review", actor: "System", estimatedMins: 0 },
      { type: "expert_approval", label: "Compliance Review", description: "Compliance officer signs off on application", actor: "Compliance", estimatedMins: 60 },
      { type: "take_action", label: "Provision Account", description: "Create accounts and access credentials", actor: "System", estimatedMins: 5 },
      { type: "send_notification", label: "Welcome Email", description: "Send welcome pack and next steps", actor: "System", estimatedMins: 1 },
      { type: "end", label: "Onboarded", description: "Customer is active and ready to transact", actor: "System", estimatedMins: 0 },
    ],
  },
  {
    id: "it-access-request",
    name: "IT Access Request",
    description: "Employee system access request with security policy enforcement",
    category: "IT",
    estimatedMins: 60,
    steps: [
      { type: "trigger", label: "Access Requested", description: "Employee submits access request form", actor: "Employee", estimatedMins: 0 },
      { type: "get_info", label: "Check Entitlements", description: "Lookup current role and access rights", actor: "System", estimatedMins: 1 },
      { type: "ai_reasoning", label: "Policy Check", description: "AI validates request against security policies", actor: "AI", estimatedMins: 1 },
      { type: "expert_approval", label: "Manager Approval", description: "Line manager approves the business need", actor: "Manager", estimatedMins: 30 },
      { type: "expert_approval", label: "IT Security Sign-off", description: "Security team validates no conflicts", actor: "IT Security", estimatedMins: 15 },
      { type: "take_action", label: "Provision Access", description: "Grant permissions and update AD groups", actor: "System", estimatedMins: 2 },
      { type: "send_notification", label: "Notify Employee", description: "Confirm access is active", actor: "System", estimatedMins: 1 },
      { type: "end", label: "Access Granted", description: "Request fulfilled and logged", actor: "System", estimatedMins: 0 },
    ],
  },
  {
    id: "data-quality-review",
    name: "Data Quality Review",
    description: "Automated data pipeline quality monitoring and remediation workflow",
    category: "Operations",
    estimatedMins: 30,
    steps: [
      { type: "trigger", label: "Data Pipeline Runs", description: "Scheduled pipeline completes ingestion", actor: "System", estimatedMins: 0 },
      { type: "get_info", label: "Sample Records", description: "Pull representative records from pipeline output", actor: "System", estimatedMins: 2 },
      { type: "ai_reasoning", label: "Quality Scoring", description: "AI scores completeness, accuracy, and freshness", actor: "AI", estimatedMins: 3 },
      { type: "make_decision", label: "Quality Threshold?", description: "Route if score falls below acceptable threshold", actor: "System", estimatedMins: 0 },
      { type: "expert_approval", label: "Data Steward Review", description: "Data steward inspects flagged anomalies", actor: "Data Steward", estimatedMins: 20 },
      { type: "take_action", label: "Apply Remediation", description: "Correct or quarantine failed records", actor: "System", estimatedMins: 5 },
      { type: "send_notification", label: "Quality Report", description: "Send summary report to data owners", actor: "System", estimatedMins: 1 },
      { type: "end", label: "Review Complete", description: "Pipeline certified or remediated", actor: "System", estimatedMins: 0 },
    ],
  },
  {
    id: "policy-exception",
    name: "Policy Exception Request",
    description: "Formal exception request process for policy deviations with governance trail",
    category: "Operations",
    estimatedMins: 180,
    steps: [
      { type: "trigger", label: "Exception Requested", description: "Business user submits policy exception form", actor: "Business User", estimatedMins: 0 },
      { type: "get_info", label: "Gather Context", description: "Collect justification, duration, and risk detail", actor: "Business User", estimatedMins: 15 },
      { type: "ai_reasoning", label: "Risk Analysis", description: "AI assesses impact and precedent for exception", actor: "AI", estimatedMins: 2 },
      { type: "expert_approval", label: "Risk Owner Approval", description: "Risk owner evaluates and approves exception", actor: "Risk Owner", estimatedMins: 60 },
      { type: "expert_approval", label: "Compliance Sign-off", description: "Compliance officer validates regulatory impact", actor: "Compliance", estimatedMins: 60 },
      { type: "take_action", label: "Apply Exception", description: "Grant temporary exception with expiry date", actor: "System", estimatedMins: 2 },
      { type: "send_notification", label: "Communicate Decision", description: "Notify requester and affected parties", actor: "System", estimatedMins: 1 },
      { type: "end", label: "Exception Logged", description: "Exception recorded in governance register", actor: "System", estimatedMins: 0 },
    ],
  },
  {
    id: "contract-review",
    name: "Contract Review",
    description: "AI-assisted contract analysis, redline negotiation, and legal approval workflow",
    category: "Operations",
    estimatedMins: 1440,
    steps: [
      { type: "trigger", label: "Contract Received", description: "Third-party contract arrives for review", actor: "Vendor", estimatedMins: 0 },
      { type: "get_info", label: "Extract Key Terms", description: "Parse clauses, dates, liabilities, and obligations", actor: "AI", estimatedMins: 5 },
      { type: "ai_reasoning", label: "Risk & Gap Analysis", description: "AI compares against standard playbook", actor: "AI", estimatedMins: 3 },
      { type: "expert_approval", label: "Legal Review", description: "Legal counsel reviews AI findings and redlines", actor: "Legal", estimatedMins: 1440 },
      { type: "make_decision", label: "Acceptable?", description: "Route for negotiation or escalation", actor: "Legal", estimatedMins: 0 },
      { type: "take_action", label: "Finalise Contract", description: "Apply approved redlines and prepare for signature", actor: "System", estimatedMins: 30 },
      { type: "send_notification", label: "Send for Execution", description: "Route to DocuSign for e-signature", actor: "System", estimatedMins: 2 },
      { type: "end", label: "Contract Executed", description: "Fully signed contract stored in CLM system", actor: "System", estimatedMins: 0 },
    ],
  },
  {
    id: "employee-request",
    name: "Employee Request",
    description: "Self-service HR request handling covering leave, benefits, and offboarding",
    category: "HR",
    estimatedMins: 90,
    steps: [
      { type: "trigger", label: "Request Submitted", description: "Employee submits HR request via portal", actor: "Employee", estimatedMins: 0 },
      { type: "get_info", label: "Check Eligibility", description: "Verify entitlements and current balances", actor: "System", estimatedMins: 1 },
      { type: "ai_reasoning", label: "Policy Alignment", description: "AI validates request against HR policies", actor: "AI", estimatedMins: 1 },
      { type: "make_decision", label: "Needs Approval?", description: "Simple requests auto-approved; complex ones escalated", actor: "System", estimatedMins: 0 },
      { type: "expert_approval", label: "Manager Approval", description: "Line manager reviews and approves request", actor: "Manager", estimatedMins: 60 },
      { type: "take_action", label: "Process Request", description: "Update HRIS and payroll system", actor: "System", estimatedMins: 3 },
      { type: "send_notification", label: "Confirm to Employee", description: "Send outcome confirmation and next steps", actor: "System", estimatedMins: 1 },
      { type: "end", label: "Complete", description: "Request fulfilled and recorded", actor: "System", estimatedMins: 0 },
    ],
  },
  {
    id: "support-escalation",
    name: "Support Escalation",
    description: "Intelligent customer support ticket triage, routing, and resolution workflow",
    category: "Operations",
    estimatedMins: 240,
    steps: [
      { type: "trigger", label: "Ticket Created", description: "Customer submits support ticket", actor: "Customer", estimatedMins: 0 },
      { type: "get_info", label: "Gather Context", description: "Pull account history and prior interactions", actor: "System", estimatedMins: 1 },
      { type: "ai_reasoning", label: "Classify & Prioritise", description: "AI categorises issue and assigns priority", actor: "AI", estimatedMins: 1 },
      { type: "make_decision", label: "Auto-Resolvable?", description: "Simple issues handled by AI; complex ones escalated", actor: "AI", estimatedMins: 0 },
      { type: "take_action", label: "AI Resolution", description: "AI generates and sends resolution response", actor: "AI", estimatedMins: 2 },
      { type: "expert_approval", label: "Agent Review", description: "Human agent handles escalated cases", actor: "Support Agent", estimatedMins: 180 },
      { type: "send_notification", label: "Resolution Sent", description: "Confirmation and CSAT survey sent to customer", actor: "System", estimatedMins: 1 },
      { type: "end", label: "Resolved", description: "Ticket closed and knowledge base updated", actor: "System", estimatedMins: 0 },
    ],
  },
];

const CATEGORIES = ["All", "Finance", "HR", "IT", "Operations"] as const;

function stepId() {
  return `step_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function StepCard({
  step,
  index,
  total,
  editing,
  onEdit,
  onDelete,
  onMoveLeft,
  onMoveRight,
  onLabelChange,
  onDescChange,
}: {
  step: ProcessStep;
  index: number;
  total: number;
  editing: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  onLabelChange: (v: string) => void;
  onDescChange: (v: string) => void;
}) {
  const meta = STEP_TYPE_MAP[step.type] || STEP_TYPES[0];
  const Icon = meta.icon;
  return (
    <div className="flex items-stretch gap-0 group/steprow">
      <div
        className={`flex flex-col rounded-xl border ${meta.border} ${meta.bg} p-3 w-44 shrink-0 cursor-pointer transition-all hover:shadow-md ${editing ? "ring-2 ring-primary" : ""}`}
        onClick={onEdit}
        data-testid={`process-step-card-${index}`}
      >
        <div className={`flex items-center gap-1.5 mb-1.5 ${meta.color}`}>
          <Icon className="w-3.5 h-3.5 shrink-0" />
          <span className="text-[10px] font-semibold uppercase tracking-wide truncate">{meta.label}</span>
        </div>
        {editing ? (
          <Input
            value={step.label}
            onChange={e => onLabelChange(e.target.value)}
            className="h-6 text-xs font-semibold mb-1 px-1"
            onClick={e => e.stopPropagation()}
            data-testid={`input-step-label-${index}`}
          />
        ) : (
          <p className="text-xs font-semibold text-foreground leading-snug mb-1 line-clamp-2">{step.label}</p>
        )}
        {editing ? (
          <Textarea
            value={step.description}
            onChange={e => onDescChange(e.target.value)}
            className="text-[10px] resize-none h-14 px-1 py-0.5"
            onClick={e => e.stopPropagation()}
            data-testid={`input-step-desc-${index}`}
          />
        ) : (
          <p className="text-[10px] text-muted-foreground leading-snug line-clamp-3">{step.description}</p>
        )}
        <div className="flex items-center gap-1 mt-2 opacity-0 group-hover/steprow:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onMoveLeft(); }}
            disabled={index === 0}
            className="p-0.5 rounded hover:bg-black/10 disabled:opacity-30"
            data-testid={`button-step-left-${index}`}
          >
            <ChevronRight className="w-3 h-3 rotate-180" />
          </button>
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onMoveRight(); }}
            disabled={index === total - 1}
            className="p-0.5 rounded hover:bg-black/10 disabled:opacity-30"
            data-testid={`button-step-right-${index}`}
          >
            <ChevronRight className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onDelete(); }}
            className="p-0.5 rounded hover:bg-red-500/20 text-red-500 ml-auto"
            data-testid={`button-step-delete-${index}`}
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
      {index < total - 1 && (
        <div className="flex items-center px-1 shrink-0">
          <ArrowRight className="w-4 h-4 text-muted-foreground/50" />
        </div>
      )}
    </div>
  );
}

export default function ProcessFlows() {
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const { toast } = useToast();

  const urlParams = useMemo(() => {
    const p = new URLSearchParams(searchString);
    return { outcomeName: p.get("outcomeName") || "", kpis: p.get("kpis") || "" };
  }, [searchString]);

  const [activeCategory, setActiveCategory] = useState<typeof CATEGORIES[number]>("All");
  const [steps, setSteps] = useState<ProcessStep[]>([]);
  const [activeTemplate, setActiveTemplate] = useState<ProcessTemplate | null>(null);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);

  const [aiDescription, setAiDescription] = useState(() => urlParams.outcomeName || "");
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [generatingBlueprint, setGeneratingBlueprint] = useState(false);
  const [flowName, setFlowName] = useState(() => urlParams.outcomeName ? `${urlParams.outcomeName} Flow` : "");

  const generateMutation = useMutation({
    mutationFn: async (description: string) => {
      const outcomeContext = urlParams.outcomeName
        ? { name: urlParams.outcomeName, kpis: urlParams.kpis.split(",").filter(Boolean).map(k => ({ name: k.trim() })) }
        : undefined;
      const res = await apiRequest("POST", "/api/ai/generate-process-flow", {
        description,
        ...(outcomeContext ? { outcomeContext } : {}),
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.steps && Array.isArray(data.steps)) {
        setSteps(data.steps.map((s: any) => ({ ...s, id: stepId() })));
        setFlowName(data.name || "Generated Flow");
        toast({ title: "Process flow generated" });
      }
    },
    onError: () => {
      toast({ title: "Generation failed", description: "Could not generate flow. Please try again.", variant: "destructive" });
    },
  });

  const loadTemplate = (tpl: ProcessTemplate) => {
    setActiveTemplate(tpl);
    setSteps(tpl.steps.map(s => ({ ...s, id: stepId() })));
    setFlowName(tpl.name);
    setEditingStepId(null);
  };

  const addStep = (type: ProcessStep["type"]) => {
    const meta = STEP_TYPE_MAP[type];
    const newStep: ProcessStep = {
      id: stepId(),
      type,
      label: meta.label,
      description: "Describe what happens in this step",
    };
    const endIdx = steps.findIndex(s => s.type === "end");
    if (endIdx > -1) {
      const newSteps = [...steps];
      newSteps.splice(endIdx, 0, newStep);
      setSteps(newSteps);
    } else {
      setSteps(prev => [...prev, newStep]);
    }
    setEditingStepId(newStep.id);
  };

  const deleteStep = (id: string) => {
    setSteps(prev => prev.filter(s => s.id !== id));
    if (editingStepId === id) setEditingStepId(null);
  };

  const moveStep = (idx: number, dir: -1 | 1) => {
    const newArr = [...steps];
    const target = idx + dir;
    if (target < 0 || target >= newArr.length) return;
    [newArr[idx], newArr[target]] = [newArr[target], newArr[idx]];
    setSteps(newArr);
  };

  const updateStep = (id: string, patch: Partial<ProcessStep>) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  };

  const handleGenerateBlueprint = async () => {
    if (steps.length === 0) {
      toast({ title: "Add at least one step first", variant: "destructive" });
      return;
    }
    setGeneratingBlueprint(true);
    try {
      const nodeTypeMap: Record<ProcessStep["type"], string> = {
        trigger: "tool_call",
        get_info: "rag",
        ai_reasoning: "llm_call",
        make_decision: "classifier",
        expert_approval: "human_review",
        take_action: "tool_call",
        send_notification: "tool_call",
        end: "schema_validate",
      };
      const blueprintNodes = steps.map((s, i) => ({
        id: `node_${i}`,
        type: nodeTypeMap[s.type] || "llm_call",
        label: s.label,
        config: { description: s.description },
        x: i * 200,
        y: 100,
      }));
      const blueprintEdges = steps.slice(0, -1).map((_, i) => ({
        from: `node_${i}`,
        to: `node_${i + 1}`,
      }));
      const res = await apiRequest("POST", "/api/blueprints", {
        name: flowName || "Business Process Blueprint",
        description: `Generated from Process Flow: ${flowName}`,
        blueprintJson: {
          nodes: blueprintNodes,
          edges: blueprintEdges,
          metadata: { processFlowSteps: steps, sourceFlowName: flowName },
        },
      });
      const bp = await res.json();
      toast({ title: "Blueprint created", description: "Redirecting to Blueprint Studio…" });
      navigate(`/blueprints/${bp.id}`);
    } catch {
      toast({ title: "Failed to create blueprint", variant: "destructive" });
    } finally {
      setGeneratingBlueprint(false);
    }
  };

  const filteredTemplates = activeCategory === "All"
    ? PROCESS_TEMPLATES
    : PROCESS_TEMPLATES.filter(t => t.category === activeCategory);

  const totalMins = steps.reduce((s, st) => s + (st.estimatedMins || 0), 0);

  return (
    <div className="flex flex-col h-full" data-testid="page-process-flows">
      <div className="flex items-center gap-3 p-4 border-b shrink-0">
        <Workflow className="w-5 h-5 text-primary" />
        <div>
          <h1 className="text-base font-semibold">Process Flow Studio</h1>
          <p className="text-xs text-muted-foreground">Design how your automation works in plain language</p>
        </div>
        <div className="flex-1" />
        {steps.length > 0 && (
          <Button
            size="sm"
            onClick={handleGenerateBlueprint}
            disabled={generatingBlueprint}
            data-testid="button-generate-blueprint"
          >
            {generatingBlueprint ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
            Generate Blueprint
          </Button>
        )}
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Left: Template Gallery */}
        <div className="w-72 border-r shrink-0 flex flex-col">
          <div className="p-3 border-b flex flex-col gap-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Templates</p>
            <div className="flex flex-wrap gap-1">
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat)}
                  className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${activeCategory === cat ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}
                  data-testid={`filter-category-${cat.toLowerCase()}`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
          <ScrollArea className="flex-1">
            <div className="flex flex-col gap-1 p-2">
              {filteredTemplates.map(tpl => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => loadTemplate(tpl)}
                  className={`w-full text-left p-2.5 rounded-lg border transition-colors ${activeTemplate?.id === tpl.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted/40"}`}
                  data-testid={`template-${tpl.id}`}
                >
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <p className="text-xs font-medium text-foreground truncate">{tpl.name}</p>
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">{tpl.category}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-snug line-clamp-2">{tpl.description}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">{tpl.steps.length} steps</p>
                </button>
              ))}
            </div>
          </ScrollArea>

          <div className="p-3 border-t">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setAiPanelOpen(v => !v)}
              data-testid="button-toggle-ai-panel"
            >
              <Sparkles className="w-3.5 h-3.5 mr-1.5 text-purple-500" />
              {aiPanelOpen ? "Close AI Panel" : "Describe Your Workflow"}
            </Button>
          </div>
        </div>

        {/* Main: Editor */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* AI Panel */}
          {aiPanelOpen && (
            <div className="border-b p-4 bg-muted/20 flex flex-col gap-2">
              <p className="text-xs font-semibold flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                Describe your workflow in plain English
              </p>
              <Textarea
                value={aiDescription}
                onChange={e => setAiDescription(e.target.value)}
                placeholder="e.g. When a new supplier invoice arrives, check it against our purchase order, get manager approval for invoices over $10K, then schedule payment and notify the supplier."
                className="text-sm resize-none h-20"
                data-testid="input-ai-description"
              />
              <div className="flex items-center justify-end gap-2">
                <Button
                  size="sm"
                  onClick={() => generateMutation.mutate(aiDescription)}
                  disabled={!aiDescription.trim() || generateMutation.isPending}
                  data-testid="button-ai-generate"
                >
                  {generateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
                  Generate Flow
                </Button>
              </div>
            </div>
          )}

          {/* Outcome context banner */}
          {urlParams.outcomeName && (
            <div className="px-4 py-2 bg-primary/5 border-b flex items-center gap-2" data-testid="banner-outcome-context">
              <Workflow className="w-3.5 h-3.5 text-primary shrink-0" />
              <p className="text-xs text-muted-foreground">
                Designing for outcome: <span className="font-medium text-foreground">{urlParams.outcomeName}</span>
                {urlParams.kpis && <span> · KPIs: {urlParams.kpis}</span>}
              </p>
            </div>
          )}

          {/* Canvas header */}
          <div className="flex items-center gap-3 p-3 border-b bg-muted/10">
            {steps.length > 0 ? (
              <>
                <Input
                  value={flowName}
                  onChange={e => setFlowName(e.target.value)}
                  className="h-7 text-sm font-medium w-56"
                  placeholder="Flow name…"
                  data-testid="input-flow-name"
                />
                <Badge variant="secondary" className="text-[10px]">{steps.length} steps</Badge>
                {totalMins > 0 && (
                  <span className="text-xs text-muted-foreground">{totalMins >= 60 ? `~${Math.round(totalMins / 60)}h` : `~${totalMins}m`} total</span>
                )}
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={() => { setSteps([]); setActiveTemplate(null); setFlowName(""); }}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="button-clear-flow"
                >
                  Clear
                </button>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">Select a template or describe your workflow to get started</span>
            )}
          </div>

          {/* Canvas */}
          <ScrollArea className="flex-1">
            <div className="p-6">
              {steps.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 gap-4">
                  <Workflow className="w-12 h-12 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">No steps yet</p>
                  <p className="text-xs text-muted-foreground">Pick a template from the left, or describe your workflow to auto-generate a flow</p>
                </div>
              ) : (
                <div className="flex flex-col gap-6">
                  <div className="flex items-start gap-0 flex-wrap">
                    {steps.map((step, i) => (
                      <StepCard
                        key={step.id}
                        step={step}
                        index={i}
                        total={steps.length}
                        editing={editingStepId === step.id}
                        onEdit={() => setEditingStepId(editingStepId === step.id ? null : step.id)}
                        onDelete={() => deleteStep(step.id)}
                        onMoveLeft={() => moveStep(i, -1)}
                        onMoveRight={() => moveStep(i, 1)}
                        onLabelChange={v => updateStep(step.id, { label: v })}
                        onDescChange={v => updateStep(step.id, { description: v })}
                      />
                    ))}
                  </div>

                  {/* Add step palette */}
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-medium text-muted-foreground">Add a step:</p>
                    <div className="flex flex-wrap gap-2">
                      {STEP_TYPES.map(t => {
                        const Icon = t.icon;
                        return (
                          <button
                            key={t.type}
                            type="button"
                            onClick={() => addStep(t.type)}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${t.border} ${t.bg} ${t.color} text-xs font-medium transition-all hover:shadow-sm`}
                            data-testid={`add-step-${t.type}`}
                          >
                            <Icon className="w-3 h-3 shrink-0" />
                            {t.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
