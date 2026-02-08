import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { AgentTemplate, OutcomeContract } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Headphones,
  FileText,
  TrendingUp,
  Shield,
  BookOpen,
  Scale,
  Bot,
  Plus,
  Trash2,
  ArrowLeft,
  ArrowRight,
  Check,
  MessageSquare,
  Send,
  Sparkles,
  Wrench,
  Library,
  Loader2,
  Gauge,
  Clock,
  DollarSign,
  Zap,
  AlertTriangle,
  ShieldCheck,
  Info,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const iconMap: Record<string, LucideIcon> = {
  headphones: Headphones,
  "file-text": FileText,
  "trending-up": TrendingUp,
  shield: Shield,
  "book-open": BookOpen,
  scale: Scale,
  bot: Bot,
};

const STEPS = [
  { number: 1, label: "Basic Info" },
  { number: 2, label: "Choose Path" },
  { number: 3, label: "Model & Tools" },
  { number: 4, label: "Memory & Workflow" },
  { number: 5, label: "Review & Create" },
];

interface ToolConfig {
  name: string;
  description: string;
}

interface WorkflowNode {
  id: string;
  type: string;
  label: string;
}

interface WizardState {
  name: string;
  description: string;
  owner: string;
  riskTier: string;
  autonomyMode: string;
  outcomeId: string;
  modelProvider: string;
  modelName: string;
  toolsConfig: ToolConfig[];
  permissionsConfig: {
    dataAccess: string[];
    apiAccess: string[];
    writeAccess: string[];
  };
  memoryRagEnabled: boolean;
  memoryRagConfig: {
    vectorStore: string;
    retrievalStrategy: string;
    chunkSize: number;
    topK: number;
  };
  workflowNodes: WorkflowNode[];
  policyBindings: string[];
  evalBindings: string[];
  rollbackPlan: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface TemplateMatch {
  id: string;
  matchScore: number;
  reasoning: string;
}

type CreationPath = "manual" | "template" | "ai" | null;

const defaultWizardState: WizardState = {
  name: "",
  description: "",
  owner: "",
  riskTier: "MEDIUM",
  autonomyMode: "assisted",
  outcomeId: "",
  modelProvider: "openai",
  modelName: "gpt-4.1",
  toolsConfig: [],
  permissionsConfig: { dataAccess: [], apiAccess: [], writeAccess: [] },
  memoryRagEnabled: false,
  memoryRagConfig: {
    vectorStore: "pinecone",
    retrievalStrategy: "similarity",
    chunkSize: 512,
    topK: 5,
  },
  workflowNodes: [],
  policyBindings: [],
  evalBindings: [],
  rollbackPlan: "",
};

export default function AgentWizard() {
  const [currentStep, setCurrentStep] = useState(1);
  const [wizardState, setWizardState] = useState<WizardState>({ ...defaultWizardState });
  const [creationPath, setCreationPath] = useState<CreationPath>(null);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiStreaming, setAiStreaming] = useState(false);
  const [templateMatches, setTemplateMatches] = useState<TemplateMatch[]>([]);
  const [matchingInProgress, setMatchingInProgress] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();
  const searchParams = useSearch();
  const { toast } = useToast();

  const { data: templates, isLoading: templatesLoading } = useQuery<AgentTemplate[]>({
    queryKey: ["/api/agent-templates"],
  });

  const { data: outcomes } = useQuery<OutcomeContract[]>({
    queryKey: ["/api/outcomes"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/agents", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      toast({ title: "Agent created successfully" });
      navigate("/agents");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create agent", description: err.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    const templateId = params.get("templateId");
    if (templateId && templates) {
      const template = templates.find((t) => t.id === templateId);
      if (template) {
        updateState({
          name: template.name,
          description: template.description || "",
          riskTier: template.defaultRiskTier || "MEDIUM",
          autonomyMode: template.defaultAutonomyMode || "assisted",
        });
        applyTemplate(template);
        setCreationPath("template");
        setSelectedTemplateId(templateId);
        setCurrentStep(3);
      }
    }
  }, [searchParams, templates]);

  function updateState(updates: Partial<WizardState>) {
    setWizardState((prev) => ({ ...prev, ...updates }));
  }

  function applyTemplate(template: AgentTemplate) {
    updateState({
      modelProvider: template.modelProvider || "openai",
      modelName: template.modelName || "gpt-4.1",
      toolsConfig: Array.isArray(template.toolsConfig) ? (template.toolsConfig as ToolConfig[]) : [],
      permissionsConfig: {
        dataAccess: [],
        apiAccess: [],
        writeAccess: [],
        ...(template.permissionsConfig as Record<string, string[]> || {}),
      },
      memoryRagEnabled: !!template.memoryRagConfig,
      memoryRagConfig: template.memoryRagConfig
        ? (template.memoryRagConfig as WizardState["memoryRagConfig"])
        : defaultWizardState.memoryRagConfig,
      workflowNodes: template.blueprintJson
        ? Array.isArray((template.blueprintJson as Record<string, unknown>).nodes)
          ? ((template.blueprintJson as Record<string, unknown>).nodes as WorkflowNode[])
          : []
        : [],
      policyBindings: Array.isArray(template.policyBindings) ? (template.policyBindings as string[]) : [],
      evalBindings: Array.isArray(template.evalBindings) ? (template.evalBindings as string[]) : [],
      rollbackPlan: template.rollbackPlan
        ? typeof template.rollbackPlan === "string"
          ? template.rollbackPlan
          : JSON.stringify(template.rollbackPlan)
        : "",
    });
    toast({ title: `Template "${template.name}" applied` });
  }

  async function runAiMatching() {
    if (!templates || templates.length === 0) return;
    setMatchingInProgress(true);
    setTemplateMatches([]);

    const linkedOutcome = outcomes?.find((o) => o.id === wizardState.outcomeId);

    try {
      const res = await apiRequest("POST", "/api/ai/match-templates", {
        basicInfo: {
          name: wizardState.name,
          description: wizardState.description,
          owner: wizardState.owner,
          riskTier: wizardState.riskTier,
          autonomyMode: wizardState.autonomyMode,
          outcomeName: linkedOutcome?.name || "",
        },
        templates,
      });
      const data = await res.json();
      setTemplateMatches(data.matches || []);
    } catch {
      toast({ title: "Template matching failed", description: "Could not analyze templates. You can still select manually.", variant: "destructive" });
    } finally {
      setMatchingInProgress(false);
    }
  }

  async function sendAiMessage() {
    if (!aiInput.trim() || aiStreaming) return;
    const userMsg: ChatMessage = { role: "user", content: aiInput.trim() };
    const newMessages = [...chatMessages, userMsg];
    setChatMessages(newMessages);
    setAiInput("");
    setAiStreaming(true);

    try {
      const res = await fetch("/api/ai/agent-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages, wizardState }),
      });

      if (!res.ok) throw new Error("AI request failed");

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let assistantContent = "";
      setChatMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.content) {
                assistantContent += parsed.content;
                setChatMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: "assistant", content: assistantContent };
                  return updated;
                });
              }
            } catch {
              // skip
            }
          }
        }
      }
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, I couldn't process that request. Please try again." },
      ]);
    } finally {
      setAiStreaming(false);
    }
  }

  function handleCreate() {
    const payload: Record<string, unknown> = {
      name: wizardState.name,
      description: wizardState.description,
      owner: wizardState.owner,
      riskTier: wizardState.riskTier,
      autonomyMode: wizardState.autonomyMode,
      outcomeId: wizardState.outcomeId || undefined,
      modelProvider: wizardState.modelProvider,
      modelName: wizardState.modelName,
      toolsConfig: wizardState.toolsConfig,
      permissionsConfig: wizardState.permissionsConfig,
      memoryRagConfig: wizardState.memoryRagEnabled ? wizardState.memoryRagConfig : null,
      blueprintJson: { nodes: wizardState.workflowNodes },
      policyBindings: wizardState.policyBindings,
      evalBindings: wizardState.evalBindings,
      rollbackPlan: wizardState.rollbackPlan ? { summary: wizardState.rollbackPlan } : null,
    };
    createMutation.mutate(payload);
  }

  function handleChoosePath(path: CreationPath) {
    setCreationPath(path);
    if (path === "template") {
      runAiMatching();
    } else if (path === "ai") {
      setAiPanelOpen(true);
      setCurrentStep(3);
    } else if (path === "manual") {
      setCurrentStep(3);
    }
  }

  function handleSelectTemplate(template: AgentTemplate) {
    setSelectedTemplateId(template.id);
    applyTemplate(template);
    setCurrentStep(3);
  }

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="page-agent-wizard">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Agent Design Wizard</h1>
          <p className="text-sm text-muted-foreground">Create a new AI agent step by step</p>
        </div>
        {currentStep >= 3 && (
          <Button
            variant="outline"
            onClick={() => setAiPanelOpen(true)}
            data-testid="button-ai-assistant"
          >
            <Sparkles className="w-4 h-4 mr-1.5" />
            AI Assistant
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2 sticky top-0 z-30 bg-background py-3 border-b -mx-6 px-6">
        {STEPS.map((step, idx) => (
          <div key={step.number} className="flex items-center gap-2 flex-1" data-testid={`step-${step.number}`}>
            <button
              onClick={() => {
                if (step.number <= currentStep) setCurrentStep(step.number);
              }}
              className={`flex items-center gap-2 text-sm font-medium transition-colors ${
                currentStep === step.number
                  ? "text-foreground"
                  : currentStep > step.number
                    ? "text-muted-foreground"
                    : "text-muted-foreground/50"
              }`}
            >
              <div
                className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold shrink-0 ${
                  currentStep === step.number
                    ? "bg-primary text-primary-foreground"
                    : currentStep > step.number
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {currentStep > step.number ? <Check className="w-3.5 h-3.5" /> : step.number}
              </div>
              <span className="hidden md:inline whitespace-nowrap">{step.label}</span>
            </button>
            {idx < STEPS.length - 1 && (
              <div className={`flex-1 h-px ${currentStep > step.number ? "bg-primary/40" : "bg-border"}`} />
            )}
          </div>
        ))}
      </div>

      <div className="min-h-[400px]">
        {currentStep === 1 && (
          <Step1BasicInfo state={wizardState} updateState={updateState} outcomes={outcomes} />
        )}
        {currentStep === 2 && (
          <Step2ChoosePath
            creationPath={creationPath}
            onChoosePath={handleChoosePath}
            templates={templates}
            templatesLoading={templatesLoading}
            templateMatches={templateMatches}
            matchingInProgress={matchingInProgress}
            selectedTemplateId={selectedTemplateId}
            onSelectTemplate={handleSelectTemplate}
            onRunMatching={runAiMatching}
            wizardState={wizardState}
          />
        )}
        {currentStep === 3 && (
          <Step3ModelTools state={wizardState} updateState={updateState} />
        )}
        {currentStep === 4 && (
          <Step4MemoryWorkflow state={wizardState} updateState={updateState} />
        )}
        {currentStep === 5 && (
          <Step5Review
            state={wizardState}
            onCreate={handleCreate}
            isPending={createMutation.isPending}
            outcomes={outcomes}
          />
        )}
      </div>

      <div className="flex items-center justify-between gap-4 border-t pt-4">
        <Button
          variant="outline"
          onClick={() => {
            if (currentStep === 3 && creationPath === "template" && !selectedTemplateId) {
              setCurrentStep(2);
            } else {
              setCurrentStep((s) => Math.max(1, s - 1));
            }
          }}
          disabled={currentStep === 1}
          data-testid="button-back-step"
        >
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          Back
        </Button>
        {currentStep < 5 ? (
          <Button
            onClick={() => {
              if (currentStep === 1) {
                setCurrentStep(2);
              } else {
                setCurrentStep((s) => Math.min(5, s + 1));
              }
            }}
            disabled={currentStep === 1 && !wizardState.name}
            data-testid="button-next-step"
          >
            Next
            <ArrowRight className="w-4 h-4 ml-1.5" />
          </Button>
        ) : (
          <Button
            onClick={handleCreate}
            disabled={createMutation.isPending || !wizardState.name}
            data-testid="button-create-agent"
          >
            {createMutation.isPending ? "Creating..." : "Create Agent"}
          </Button>
        )}
      </div>

      <Sheet open={aiPanelOpen} onOpenChange={setAiPanelOpen}>
        <SheetContent side="right" className="flex flex-col w-full sm:max-w-md p-0">
          <SheetHeader className="p-4 border-b">
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              AI Assistant
            </SheetTitle>
            <SheetDescription>Get help designing your agent configuration</SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
            {chatMessages.length === 0 && (
              <div className="flex flex-col items-center justify-center flex-1 gap-2 text-center py-8">
                <MessageSquare className="w-8 h-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  Describe your agent use case and I'll help configure it.
                </p>
              </div>
            )}
            {chatMessages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`rounded-md px-3 py-2 text-sm max-w-[85%] ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                  style={{ whiteSpace: "pre-wrap" }}
                >
                  {msg.content}
                  {msg.role === "assistant" && msg.content === "" && aiStreaming && (
                    <span className="text-muted-foreground">Thinking...</span>
                  )}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="border-t p-4 flex items-center gap-2">
            <Input
              placeholder="Ask about agent design..."
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendAiMessage()}
              disabled={aiStreaming}
              data-testid="input-ai-message"
            />
            <Button
              size="icon"
              onClick={sendAiMessage}
              disabled={aiStreaming || !aiInput.trim()}
              data-testid="button-send-ai-message"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Step1BasicInfo({
  state,
  updateState,
  outcomes,
}: {
  state: WizardState;
  updateState: (u: Partial<WizardState>) => void;
  outcomes: OutcomeContract[] | undefined;
}) {
  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <h2 className="text-lg font-medium">Basic Information</h2>
      <p className="text-sm text-muted-foreground">
        Tell us about the agent you want to create. This information helps us suggest the best configuration approach.
      </p>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="wizard-name">Agent Name *</Label>
          <Input
            id="wizard-name"
            value={state.name}
            onChange={(e) => updateState({ name: e.target.value })}
            placeholder="e.g., Customer Support Agent"
            data-testid="input-agent-name"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="wizard-desc">Description</Label>
          <Textarea
            id="wizard-desc"
            value={state.description}
            onChange={(e) => updateState({ description: e.target.value })}
            placeholder="What does this agent do? Describe the use case, goals, and expected outcomes..."
            data-testid="input-agent-description"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="wizard-owner">Owner</Label>
          <Input
            id="wizard-owner"
            value={state.owner}
            onChange={(e) => updateState({ owner: e.target.value })}
            placeholder="Team or person responsible"
            data-testid="input-agent-owner"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label>Risk Tier</Label>
            <Select value={state.riskTier} onValueChange={(v) => updateState({ riskTier: v })}>
              <SelectTrigger data-testid="select-risk-tier">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="LOW">Low</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="HIGH">High</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Autonomy Mode</Label>
            <Select value={state.autonomyMode} onValueChange={(v) => updateState({ autonomyMode: v })}>
              <SelectTrigger data-testid="select-autonomy-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="assisted">Assisted</SelectItem>
                <SelectItem value="autonomous">Autonomous</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {outcomes && outcomes.length > 0 && (
          <div className="flex flex-col gap-2">
            <Label>Link to Outcome</Label>
            <Select value={state.outcomeId || "_none"} onValueChange={(v) => updateState({ outcomeId: v === "_none" ? "" : v })}>
              <SelectTrigger data-testid="select-outcome">
                <SelectValue placeholder="Select an outcome" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">None</SelectItem>
                {outcomes.map((o) => (
                  <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </div>
  );
}

function Step2ChoosePath({
  creationPath,
  onChoosePath,
  templates,
  templatesLoading,
  templateMatches,
  matchingInProgress,
  selectedTemplateId,
  onSelectTemplate,
  onRunMatching,
  wizardState,
}: {
  creationPath: CreationPath;
  onChoosePath: (path: CreationPath) => void;
  templates: AgentTemplate[] | undefined;
  templatesLoading: boolean;
  templateMatches: TemplateMatch[];
  matchingInProgress: boolean;
  selectedTemplateId: string | null;
  onSelectTemplate: (t: AgentTemplate) => void;
  onRunMatching: () => void;
  wizardState: WizardState;
}) {
  const [showAllTemplates, setShowAllTemplates] = useState(false);

  if (creationPath === "template") {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-medium">Template Suggestions</h2>
            <p className="text-sm text-muted-foreground">
              {matchingInProgress
                ? "AI is analyzing your requirements against our template library..."
                : "AI-ranked templates based on your agent description and requirements"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAllTemplates(!showAllTemplates)}
              data-testid="button-toggle-all-templates"
            >
              {showAllTemplates ? "Show AI Suggestions" : "Browse All Templates"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onChoosePath(null)}
              data-testid="button-change-path"
            >
              Change Path
            </Button>
          </div>
        </div>

        {matchingInProgress && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">Analyzing your requirements...</p>
            <p className="text-xs text-muted-foreground">
              Matching "{wizardState.name}" against {templates?.length || 0} templates
            </p>
          </div>
        )}

        {!matchingInProgress && !showAllTemplates && templateMatches.length > 0 && (
          <div className="flex flex-col gap-3">
            {templateMatches.map((match) => {
              const template = templates?.find((t) => t.id === match.id);
              if (!template) return null;
              const IconComponent = iconMap[template.icon || "bot"] || Bot;
              const isSelected = selectedTemplateId === template.id;
              return (
                <Card
                  key={match.id}
                  className={`hover-elevate cursor-pointer transition-colors ${isSelected ? "ring-2 ring-primary" : ""}`}
                  onClick={() => onSelectTemplate(template)}
                  data-testid={`match-card-${match.id}`}
                >
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      <div className="w-11 h-11 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                        <IconComponent className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-medium text-sm">{template.name}</h3>
                          <Badge
                            variant={match.matchScore >= 80 ? "default" : match.matchScore >= 50 ? "secondary" : "outline"}
                            className="text-[10px]"
                          >
                            {match.matchScore}% match
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                          {template.description}
                        </p>
                        <div className="mt-2 p-2 bg-muted/50 rounded-md">
                          <p className="text-xs text-muted-foreground">
                            <Sparkles className="w-3 h-3 inline mr-1" />
                            {match.reasoning}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <Badge variant="outline" className="text-[10px]">{template.category}</Badge>
                        <Badge variant="outline" className="text-[10px]">{template.complexity}</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {!matchingInProgress && !showAllTemplates && templateMatches.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Library className="w-8 h-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              No AI suggestions available. Browse templates manually or try again.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onRunMatching} data-testid="button-retry-matching">
                Retry AI Matching
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowAllTemplates(true)}>
                Browse All
              </Button>
            </div>
          </div>
        )}

        {!matchingInProgress && showAllTemplates && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templatesLoading &&
              Array.from({ length: 3 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-5">
                    <div className="animate-pulse flex flex-col gap-3">
                      <div className="flex gap-3">
                        <div className="w-10 h-10 rounded-md bg-muted" />
                        <div className="flex-1 space-y-2">
                          <div className="h-4 bg-muted rounded w-3/4" />
                          <div className="h-3 bg-muted rounded w-1/2" />
                        </div>
                      </div>
                      <div className="h-8 bg-muted rounded" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            {templates?.map((template) => {
              const IconComponent = iconMap[template.icon || "bot"] || Bot;
              const match = templateMatches.find((m) => m.id === template.id);
              return (
                <Card
                  key={template.id}
                  className="hover-elevate cursor-pointer"
                  onClick={() => onSelectTemplate(template)}
                  data-testid={`template-card-${template.id}`}
                >
                  <CardContent className="p-5 flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                        <IconComponent className="w-5 h-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-medium text-sm">{template.name}</h3>
                        <p className="text-xs text-muted-foreground line-clamp-2">{template.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">{template.category}</Badge>
                      <Badge variant="secondary" className="text-[10px]">{template.complexity}</Badge>
                      {match && (
                        <Badge variant="default" className="text-[10px] ml-auto">
                          {match.matchScore}% match
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <h2 className="text-lg font-medium">How would you like to build your agent?</h2>
      <p className="text-sm text-muted-foreground">
        Choose the approach that works best for you. You can always adjust the configuration later.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card
          className="hover-elevate cursor-pointer"
          onClick={() => onChoosePath("manual")}
          data-testid="path-manual"
        >
          <CardContent className="p-6 flex flex-col items-center text-center gap-4">
            <div className="w-14 h-14 rounded-md bg-muted flex items-center justify-center">
              <Wrench className="w-7 h-7 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">Manual Configuration</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Build your agent from scratch with full control over every setting
              </p>
            </div>
            <Badge variant="outline" className="text-[10px]">Full Control</Badge>
          </CardContent>
        </Card>

        <Card
          className="hover-elevate cursor-pointer ring-1 ring-primary/20"
          onClick={() => onChoosePath("template")}
          data-testid="path-template"
        >
          <CardContent className="p-6 flex flex-col items-center text-center gap-4">
            <div className="w-14 h-14 rounded-md bg-primary/10 flex items-center justify-center">
              <Library className="w-7 h-7 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">Use Template</h3>
              <p className="text-xs text-muted-foreground mt-1">
                AI suggests the best matching templates based on your agent's description
              </p>
            </div>
            <Badge className="text-[10px]">Recommended</Badge>
          </CardContent>
        </Card>

        <Card
          className="hover-elevate cursor-pointer"
          onClick={() => onChoosePath("ai")}
          data-testid="path-ai"
        >
          <CardContent className="p-6 flex flex-col items-center text-center gap-4">
            <div className="w-14 h-14 rounded-md bg-muted flex items-center justify-center">
              <Sparkles className="w-7 h-7 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">Conversational AI</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Chat with AI to design your agent through natural conversation
              </p>
            </div>
            <Badge variant="outline" className="text-[10px]">AI-Guided</Badge>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Step3ModelTools({
  state,
  updateState,
}: {
  state: WizardState;
  updateState: (u: Partial<WizardState>) => void;
}) {
  function addTool() {
    updateState({ toolsConfig: [...state.toolsConfig, { name: "", description: "" }] });
  }
  function removeTool(i: number) {
    updateState({ toolsConfig: state.toolsConfig.filter((_, idx) => idx !== i) });
  }
  function updateTool(i: number, field: keyof ToolConfig, value: string) {
    const updated = [...state.toolsConfig];
    updated[i] = { ...updated[i], [field]: value };
    updateState({ toolsConfig: updated });
  }

  function updatePermission(field: "dataAccess" | "apiAccess" | "writeAccess", value: string) {
    updateState({
      permissionsConfig: {
        ...state.permissionsConfig,
        [field]: value
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      },
    });
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <h2 className="text-lg font-medium">Model & Tools Configuration</h2>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Model Settings</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label>Model Provider</Label>
              <Select value={state.modelProvider} onValueChange={(v) => updateState({ modelProvider: v })}>
                <SelectTrigger data-testid="select-model-provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="anthropic">Anthropic</SelectItem>
                  <SelectItem value="google">Google</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Model Name</Label>
              <Input
                value={state.modelName}
                onChange={(e) => updateState({ modelName: e.target.value })}
                placeholder="e.g., gpt-4.1"
                data-testid="input-model-name"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <CardTitle className="text-sm font-medium">Tools</CardTitle>
          <Button variant="outline" size="sm" onClick={addTool} data-testid="button-add-tool">
            <Plus className="w-3.5 h-3.5 mr-1" /> Add Tool
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {state.toolsConfig.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No tools configured. Add tools to extend your agent's capabilities.
            </p>
          )}
          {state.toolsConfig.map((tool, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="flex-1 grid grid-cols-2 gap-2">
                <Input
                  placeholder="Tool name"
                  value={tool.name}
                  onChange={(e) => updateTool(i, "name", e.target.value)}
                  data-testid={`input-tool-name-${i}`}
                />
                <Input
                  placeholder="Tool description"
                  value={tool.description}
                  onChange={(e) => updateTool(i, "description", e.target.value)}
                  data-testid={`input-tool-desc-${i}`}
                />
              </div>
              <Button variant="ghost" size="icon" onClick={() => removeTool(i)} data-testid={`button-remove-tool-${i}`}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Permissions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>Data Access (comma-separated)</Label>
            <Input
              value={(state.permissionsConfig?.dataAccess || []).join(", ")}
              onChange={(e) => updatePermission("dataAccess", e.target.value)}
              placeholder="e.g., customer_data, product_catalog"
              data-testid="input-data-access"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>API Access (comma-separated)</Label>
            <Input
              value={(state.permissionsConfig?.apiAccess || []).join(", ")}
              onChange={(e) => updatePermission("apiAccess", e.target.value)}
              placeholder="e.g., search_api, email_api"
              data-testid="input-api-access"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Write Access (comma-separated)</Label>
            <Input
              value={(state.permissionsConfig?.writeAccess || []).join(", ")}
              onChange={(e) => updatePermission("writeAccess", e.target.value)}
              placeholder="e.g., ticket_system, crm"
              data-testid="input-write-access"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Step4MemoryWorkflow({
  state,
  updateState,
}: {
  state: WizardState;
  updateState: (u: Partial<WizardState>) => void;
}) {
  function addNode() {
    const newId = `node_${state.workflowNodes.length + 1}`;
    updateState({
      workflowNodes: [...state.workflowNodes, { id: newId, type: "llm_call", label: "" }],
    });
  }
  function removeNode(i: number) {
    updateState({ workflowNodes: state.workflowNodes.filter((_, idx) => idx !== i) });
  }
  function updateNode(i: number, field: keyof WorkflowNode, value: string) {
    const updated = [...state.workflowNodes];
    updated[i] = { ...updated[i], [field]: value };
    updateState({ workflowNodes: updated });
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <h2 className="text-lg font-medium">Memory & Workflow</h2>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Memory / RAG Configuration</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Label>RAG Enabled</Label>
            <Select
              value={state.memoryRagEnabled ? "enabled" : "disabled"}
              onValueChange={(v) => updateState({ memoryRagEnabled: v === "enabled" })}
            >
              <SelectTrigger className="w-40" data-testid="select-rag-toggle">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="enabled">Enabled</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {state.memoryRagEnabled && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label>Vector Store</Label>
                <Select
                  value={state.memoryRagConfig.vectorStore}
                  onValueChange={(v) =>
                    updateState({ memoryRagConfig: { ...state.memoryRagConfig, vectorStore: v } })
                  }
                >
                  <SelectTrigger data-testid="select-vector-store">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pinecone">Pinecone</SelectItem>
                    <SelectItem value="chromadb">ChromaDB</SelectItem>
                    <SelectItem value="weaviate">Weaviate</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Retrieval Strategy</Label>
                <Select
                  value={state.memoryRagConfig.retrievalStrategy}
                  onValueChange={(v) =>
                    updateState({ memoryRagConfig: { ...state.memoryRagConfig, retrievalStrategy: v } })
                  }
                >
                  <SelectTrigger data-testid="select-retrieval-strategy">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="similarity">Similarity</SelectItem>
                    <SelectItem value="hybrid">Hybrid</SelectItem>
                    <SelectItem value="mmr">MMR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Chunk Size</Label>
                <Input
                  type="number"
                  value={state.memoryRagConfig.chunkSize}
                  onChange={(e) =>
                    updateState({
                      memoryRagConfig: { ...state.memoryRagConfig, chunkSize: parseInt(e.target.value) || 512 },
                    })
                  }
                  data-testid="input-chunk-size"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Top K</Label>
                <Input
                  type="number"
                  value={state.memoryRagConfig.topK}
                  onChange={(e) =>
                    updateState({
                      memoryRagConfig: { ...state.memoryRagConfig, topK: parseInt(e.target.value) || 5 },
                    })
                  }
                  data-testid="input-top-k"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <CardTitle className="text-sm font-medium">Workflow Nodes</CardTitle>
          <Button variant="outline" size="sm" onClick={addNode} data-testid="button-add-node">
            <Plus className="w-3.5 h-3.5 mr-1" /> Add Node
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {state.workflowNodes.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No workflow nodes configured. Add nodes to define your agent's execution graph.
            </p>
          )}
          {state.workflowNodes.map((node, i) => (
            <div key={i} className="flex items-start gap-2">
              <Badge variant="outline" className="mt-2 shrink-0 text-[10px]">{node.id}</Badge>
              <Select value={node.type} onValueChange={(v) => updateNode(i, "type", v)}>
                <SelectTrigger className="w-44" data-testid={`select-node-type-${i}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="schema_validate">Schema Validate</SelectItem>
                  <SelectItem value="rag">RAG</SelectItem>
                  <SelectItem value="llm_call">LLM Call</SelectItem>
                  <SelectItem value="classifier">Classifier</SelectItem>
                  <SelectItem value="router">Router</SelectItem>
                  <SelectItem value="tool_call">Tool Call</SelectItem>
                  <SelectItem value="human_review">Human Review</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="Node label"
                value={node.label}
                onChange={(e) => updateNode(i, "label", e.target.value)}
                className="flex-1"
                data-testid={`input-node-label-${i}`}
              />
              <Button variant="ghost" size="icon" onClick={() => removeNode(i)} data-testid={`button-remove-node-${i}`}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Step5Review({
  state,
  onCreate,
  isPending,
  outcomes,
}: {
  state: WizardState;
  onCreate: () => void;
  isPending: boolean;
  outcomes: OutcomeContract[] | undefined;
}) {
  const linkedOutcome = outcomes?.find((o) => o.id === state.outcomeId);

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <h2 className="text-lg font-medium">Review & Create</h2>
      <p className="text-sm text-muted-foreground">
        Review your agent configuration before creating.
      </p>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Name</span>
            <span className="font-medium" data-testid="review-name">{state.name || "—"}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Description</span>
            <span className="font-medium text-right max-w-xs truncate">{state.description || "—"}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Owner</span>
            <span className="font-medium">{state.owner || "—"}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Risk Tier</span>
            <Badge variant="outline" className="text-[10px]">{state.riskTier}</Badge>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Autonomy Mode</span>
            <Badge variant="outline" className="text-[10px]">{state.autonomyMode}</Badge>
          </div>
          {linkedOutcome && (
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Linked Outcome</span>
              <span className="font-medium">{linkedOutcome.name}</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Model & Tools</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Provider</span>
            <span className="font-medium">{state.modelProvider}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Model</span>
            <span className="font-medium">{state.modelName}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Tools</span>
            <span className="font-medium">
              {state.toolsConfig.length > 0
                ? state.toolsConfig.map((t) => t.name).join(", ")
                : "None"}
            </span>
          </div>
          {((state.permissionsConfig?.dataAccess || []).length > 0 ||
            (state.permissionsConfig?.apiAccess || []).length > 0 ||
            (state.permissionsConfig?.writeAccess || []).length > 0) && (
            <>
              {(state.permissionsConfig?.dataAccess || []).length > 0 && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Data Access</span>
                  <span className="font-medium">{(state.permissionsConfig?.dataAccess || []).join(", ")}</span>
                </div>
              )}
              {(state.permissionsConfig?.apiAccess || []).length > 0 && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">API Access</span>
                  <span className="font-medium">{(state.permissionsConfig?.apiAccess || []).join(", ")}</span>
                </div>
              )}
              {(state.permissionsConfig?.writeAccess || []).length > 0 && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Write Access</span>
                  <span className="font-medium">{(state.permissionsConfig?.writeAccess || []).join(", ")}</span>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {state.memoryRagEnabled && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Memory / RAG</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Vector Store</span>
              <span className="font-medium">{state.memoryRagConfig.vectorStore}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Retrieval Strategy</span>
              <span className="font-medium">{state.memoryRagConfig.retrievalStrategy}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Chunk Size</span>
              <span className="font-medium">{state.memoryRagConfig.chunkSize}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Top K</span>
              <span className="font-medium">{state.memoryRagConfig.topK}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {state.workflowNodes.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Workflow Nodes</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {state.workflowNodes.map((node) => (
              <div key={node.id} className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">{node.id}</Badge>
                <Badge variant="secondary" className="text-[10px]">{node.type}</Badge>
                <span className="text-muted-foreground">{node.label || "Unlabeled"}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {state.policyBindings.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Policy Bindings</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-sm text-muted-foreground flex flex-col gap-1">
              {state.policyBindings.map((p, i) => (
                <li key={i}>{typeof p === "object" ? `${(p as any).policyName || ""} (${(p as any).enforcement || "soft"})` : String(p)}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {state.evalBindings.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Eval Bindings</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-sm text-muted-foreground flex flex-col gap-1">
              {state.evalBindings.map((e, i) => (
                <li key={i}>{typeof e === "object" ? `${(e as any).suiteName || ""} (${(e as any).schedule || "manual"})` : String(e)}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {state.rollbackPlan && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Rollback Plan</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {typeof state.rollbackPlan === "object"
                ? `Triggers: ${((state.rollbackPlan as any)?.triggerConditions || []).join(", ")} | Target: ${(state.rollbackPlan as any)?.rollbackTargetVersion || "previous_stable"}`
                : String(state.rollbackPlan || "Not configured")}
            </p>
          </CardContent>
        </Card>
      )}

      <PerformanceSimulation state={state} />

      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="flex items-start gap-3 pt-4">
          <ShieldCheck className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="flex flex-col gap-1" data-testid="validation-gate-notice">
            <span className="text-sm font-medium">Expert Validation Required</span>
            <span className="text-xs text-muted-foreground">
              Creating this agent will automatically generate an evaluation suite with test cases derived from your tools and workflow,
              and submit a blueprint review to the expert validation queue. An expert validator must verify domain assumptions,
              regulatory constraints, and escalation paths before deployment.
            </span>
          </div>
        </CardContent>
      </Card>

      <Button
        className="w-full"
        onClick={onCreate}
        disabled={isPending || !state.name}
        data-testid="button-create-agent"
      >
        {isPending ? "Creating Agent..." : "Create Agent"}
      </Button>
    </div>
  );
}

function PerformanceSimulation({ state }: { state: WizardState }) {
  const toolCount = state.toolsConfig.filter(t => t.name).length;
  const nodeCount = state.workflowNodes.length;
  const hasRag = state.memoryRagEnabled;

  const modelLatencyBase: Record<string, number> = {
    "gpt-4.1": 800, "gpt-4": 900, "gpt-4o": 400, "gpt-4o-mini": 200,
    "gpt-3.5-turbo": 150, "claude-3.5-sonnet": 700, "claude-3-opus": 1200,
    "gemini-pro": 500, "gemini-1.5-pro": 600, "llama-3.1-70b": 350,
  };
  const modelCostBase: Record<string, number> = {
    "gpt-4.1": 0.03, "gpt-4": 0.06, "gpt-4o": 0.005, "gpt-4o-mini": 0.0003,
    "gpt-3.5-turbo": 0.002, "claude-3.5-sonnet": 0.015, "claude-3-opus": 0.075,
    "gemini-pro": 0.007, "gemini-1.5-pro": 0.014, "llama-3.1-70b": 0.009,
  };

  const baseLatency = modelLatencyBase[state.modelName] || 500;
  const baseCost = modelCostBase[state.modelName] || 0.01;

  const toolLatencyAdd = toolCount * 120;
  const ragLatencyAdd = hasRag ? 200 : 0;
  const nodeLatencyMultiplier = Math.max(1, nodeCount * 0.8);
  const estLatencyMs = Math.round((baseLatency + toolLatencyAdd + ragLatencyAdd) * nodeLatencyMultiplier);

  const toolCostAdd = toolCount * 0.002;
  const ragCostAdd = hasRag ? 0.005 : 0;
  const nodeCostMultiplier = Math.max(1, nodeCount * 0.7);
  const estCostPerRun = parseFloat(((baseCost + toolCostAdd + ragCostAdd) * nodeCostMultiplier).toFixed(4));

  const throughputPerMin = Math.max(1, Math.round(60000 / estLatencyMs));

  const riskFactors: string[] = [];
  if (state.riskTier === "HIGH") riskFactors.push("High risk tier requires enhanced monitoring");
  if (state.autonomyMode === "autonomous") riskFactors.push("Fully autonomous mode - no human checkpoint");
  if (toolCount > 3) riskFactors.push(`${toolCount} tools increase attack surface`);
  if (!hasRag && nodeCount > 3) riskFactors.push("Complex workflow without RAG may reduce accuracy");
  if (!state.rollbackPlan) riskFactors.push("No rollback plan configured");
  const hasWriteTools = state.toolsConfig.some(t => /write|send|delete|create/i.test(t.name));
  if (hasWriteTools) riskFactors.push("Write/send tools carry higher blast radius");

  const riskLevel = riskFactors.length >= 3 ? "high" : riskFactors.length >= 1 ? "medium" : "low";

  return (
    <Card data-testid="performance-simulation">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Gauge className="w-4 h-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Performance Simulation</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="flex flex-col gap-1 p-3 rounded-md bg-muted/30" data-testid="sim-latency">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Est. Latency</span>
            </div>
            <span className="text-lg font-semibold">{estLatencyMs >= 1000 ? `${(estLatencyMs / 1000).toFixed(1)}s` : `${estLatencyMs}ms`}</span>
          </div>
          <div className="flex flex-col gap-1 p-3 rounded-md bg-muted/30" data-testid="sim-cost">
            <div className="flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Cost / Run</span>
            </div>
            <span className="text-lg font-semibold">${estCostPerRun}</span>
          </div>
          <div className="flex flex-col gap-1 p-3 rounded-md bg-muted/30" data-testid="sim-throughput">
            <div className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Throughput</span>
            </div>
            <span className="text-lg font-semibold">{throughputPerMin}/min</span>
          </div>
          <div className="flex flex-col gap-1 p-3 rounded-md bg-muted/30" data-testid="sim-risk">
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Risk Level</span>
            </div>
            <Badge
              variant={riskLevel === "high" ? "destructive" : riskLevel === "medium" ? "secondary" : "outline"}
              className="w-fit"
              data-testid="sim-risk-badge"
            >
              {riskLevel.toUpperCase()}
            </Badge>
          </div>
        </div>

        {riskFactors.length > 0 && (
          <div className="flex flex-col gap-1.5" data-testid="sim-risk-factors">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Risk Factors</span>
            {riskFactors.map((factor, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                <Info className="w-3 h-3 shrink-0" />
                <span>{factor}</span>
              </div>
            ))}
          </div>
        )}

        <p className="text-[10px] text-muted-foreground">
          Estimates based on model characteristics, tool count, workflow complexity, and RAG configuration. Actual performance may vary.
        </p>
      </CardContent>
    </Card>
  );
}
