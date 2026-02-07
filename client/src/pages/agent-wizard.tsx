import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
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
  { number: 1, label: "Starting Point" },
  { number: 2, label: "Basic Info" },
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
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiStreaming, setAiStreaming] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();
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

  function updateState(updates: Partial<WizardState>) {
    setWizardState((prev) => ({ ...prev, ...updates }));
  }

  function applyTemplate(template: AgentTemplate) {
    updateState({
      name: template.name,
      description: template.description || "",
      riskTier: template.defaultRiskTier || "MEDIUM",
      autonomyMode: template.defaultAutonomyMode || "assisted",
      modelProvider: template.modelProvider || "openai",
      modelName: template.modelName || "gpt-4.1",
      toolsConfig: Array.isArray(template.toolsConfig) ? (template.toolsConfig as ToolConfig[]) : [],
      permissionsConfig: template.permissionsConfig
        ? (template.permissionsConfig as WizardState["permissionsConfig"])
        : { dataAccess: [], apiAccess: [], writeAccess: [] },
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
    setCurrentStep(2);
    toast({ title: `Template "${template.name}" applied` });
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

      if (!res.ok) {
        throw new Error("AI request failed");
      }

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
              // skip unparseable lines
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

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="page-agent-wizard">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Agent Design Wizard</h1>
          <p className="text-sm text-muted-foreground">Create a new AI agent step by step</p>
        </div>
        <Button
          variant="outline"
          onClick={() => setAiPanelOpen(true)}
          data-testid="button-ai-assistant"
        >
          <Sparkles className="w-4 h-4 mr-1.5" />
          AI Assistant
        </Button>
      </div>

      <div className="flex items-center gap-2 sticky top-0 z-30 bg-background py-3 border-b -mx-6 px-6">
        {STEPS.map((step, idx) => (
          <div key={step.number} className="flex items-center gap-2 flex-1" data-testid={`step-${step.number}`}>
            <button
              onClick={() => setCurrentStep(step.number)}
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
          <Step1Templates
            templates={templates}
            loading={templatesLoading}
            onApplyTemplate={applyTemplate}
            onStartScratch={() => setCurrentStep(2)}
          />
        )}
        {currentStep === 2 && (
          <Step2BasicInfo state={wizardState} updateState={updateState} outcomes={outcomes} />
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
          onClick={() => setCurrentStep((s) => Math.max(1, s - 1))}
          disabled={currentStep === 1}
          data-testid="button-back-step"
        >
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          Back
        </Button>
        {currentStep < 5 ? (
          <Button
            onClick={() => setCurrentStep((s) => Math.min(5, s + 1))}
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
                  Ask me anything about agent design, best practices, or configuration help.
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

function Step1Templates({
  templates,
  loading,
  onApplyTemplate,
  onStartScratch,
}: {
  templates: AgentTemplate[] | undefined;
  loading: boolean;
  onApplyTemplate: (t: AgentTemplate) => void;
  onStartScratch: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-medium">Choose a Starting Point</h2>
      <p className="text-sm text-muted-foreground">
        Select a template to pre-fill your agent configuration, or start from scratch.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="hover-elevate cursor-pointer" data-testid="template-card-scratch">
          <CardContent className="p-5 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center shrink-0">
                <Plus className="w-5 h-5 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <h3 className="font-medium text-sm">Start from Scratch</h3>
                <p className="text-xs text-muted-foreground">Configure everything manually</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={onStartScratch} data-testid="button-use-template-scratch">
              Get Started
            </Button>
          </CardContent>
        </Card>

        {loading &&
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

        {templates?.map((template, index) => {
          const IconComponent = iconMap[template.icon || "bot"] || Bot;
          return (
            <Card key={template.id} className="hover-elevate" data-testid={`template-card-${index}`}>
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
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onApplyTemplate(template)}
                  data-testid={`button-use-template-${index}`}
                >
                  Use Template
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Step2BasicInfo({
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
            placeholder="What does this agent do?"
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
              value={state.permissionsConfig.dataAccess.join(", ")}
              onChange={(e) => updatePermission("dataAccess", e.target.value)}
              placeholder="e.g., customer_data, product_catalog"
              data-testid="input-data-access"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>API Access (comma-separated)</Label>
            <Input
              value={state.permissionsConfig.apiAccess.join(", ")}
              onChange={(e) => updatePermission("apiAccess", e.target.value)}
              placeholder="e.g., search_api, email_api"
              data-testid="input-api-access"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Write Access (comma-separated)</Label>
            <Input
              value={state.permissionsConfig.writeAccess.join(", ")}
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
          {(state.permissionsConfig.dataAccess.length > 0 ||
            state.permissionsConfig.apiAccess.length > 0 ||
            state.permissionsConfig.writeAccess.length > 0) && (
            <>
              {state.permissionsConfig.dataAccess.length > 0 && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Data Access</span>
                  <span className="font-medium">{state.permissionsConfig.dataAccess.join(", ")}</span>
                </div>
              )}
              {state.permissionsConfig.apiAccess.length > 0 && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">API Access</span>
                  <span className="font-medium">{state.permissionsConfig.apiAccess.join(", ")}</span>
                </div>
              )}
              {state.permissionsConfig.writeAccess.length > 0 && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Write Access</span>
                  <span className="font-medium">{state.permissionsConfig.writeAccess.join(", ")}</span>
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
                <li key={i}>{p}</li>
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
                <li key={i}>{e}</li>
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
            <p className="text-sm text-muted-foreground">{state.rollbackPlan}</p>
          </CardContent>
        </Card>
      )}

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
