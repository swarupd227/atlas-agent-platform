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
  FlaskConical,
  Rocket,
  RotateCcw,
  Activity,
  Bell,
  Target,
  ListChecks,
  PlugZap,
  Database,
  PhoneForwarded,
  Settings,
  Eye,
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
  { number: 5, label: "Guardrails" },
  { number: 6, label: "Eval Suite" },
  { number: 7, label: "Rollout Plan" },
  { number: 8, label: "Review & Create" },
];

interface ToolConfig {
  name: string;
  description: string;
  permissionScope?: string;
  dataClasses?: string[];
  failureModes?: string[];
  rateLimit?: string;
  costPerCall?: number;
  accessTier?: string;
  writeAccess?: boolean;
}

const TOOL_CATALOG: ToolConfig[] = [
  { name: "search_knowledge_base", description: "Search internal knowledge base articles", permissionScope: "READ", dataClasses: ["internal_docs"], failureModes: ["timeout", "index_unavailable"], rateLimit: "100/min", costPerCall: 0.001, accessTier: "OPEN" },
  { name: "query_database", description: "Execute read-only database queries", permissionScope: "READ", dataClasses: ["customer_data", "product_data"], failureModes: ["connection_error", "query_timeout"], rateLimit: "50/min", costPerCall: 0.002, accessTier: "STANDARD" },
  { name: "send_email", description: "Send emails to customers or internal teams", permissionScope: "WRITE", dataClasses: ["contact_info", "pii"], failureModes: ["smtp_error", "rate_limit"], rateLimit: "20/min", costPerCall: 0.005, accessTier: "RESTRICTED", writeAccess: true },
  { name: "update_crm_record", description: "Create or update CRM records", permissionScope: "WRITE", dataClasses: ["customer_data", "sales_data"], failureModes: ["api_error", "validation_error"], rateLimit: "30/min", costPerCall: 0.003, accessTier: "RESTRICTED", writeAccess: true },
  { name: "create_ticket", description: "Create support tickets in ticketing system", permissionScope: "WRITE", dataClasses: ["support_data"], failureModes: ["api_error", "duplicate_detection"], rateLimit: "40/min", costPerCall: 0.002, accessTier: "STANDARD", writeAccess: true },
  { name: "web_search", description: "Search the web for current information", permissionScope: "READ", dataClasses: ["public_data"], failureModes: ["api_quota", "timeout"], rateLimit: "30/min", costPerCall: 0.01, accessTier: "OPEN" },
  { name: "execute_code", description: "Execute sandboxed code for data analysis", permissionScope: "EXECUTE", dataClasses: ["computed_data"], failureModes: ["sandbox_error", "timeout", "memory_limit"], rateLimit: "10/min", costPerCall: 0.02, accessTier: "RESTRICTED" },
  { name: "deploy_model", description: "Deploy or update ML model endpoints", permissionScope: "ADMIN", dataClasses: ["model_artifacts", "infrastructure"], failureModes: ["deployment_error", "resource_limit"], rateLimit: "5/min", costPerCall: 0.05, accessTier: "CRITICAL", writeAccess: true },
  { name: "process_payment", description: "Process financial transactions", permissionScope: "ADMIN", dataClasses: ["financial_data", "pii"], failureModes: ["payment_declined", "fraud_detection"], rateLimit: "10/min", costPerCall: 0.03, accessTier: "CRITICAL", writeAccess: true },
  { name: "extract_document", description: "Extract structured data from documents", permissionScope: "READ", dataClasses: ["document_data"], failureModes: ["ocr_error", "format_unsupported"], rateLimit: "20/min", costPerCall: 0.015, accessTier: "STANDARD" },
];

interface WorkflowNode {
  id: string;
  type: string;
  label: string;
  x?: number;
  y?: number;
  config?: {
    prompt?: string;
    model?: string;
    temperature?: number;
    maxRetries?: number;
    timeoutMs?: number;
    costBudget?: number;
    logLevel?: string;
    redactFields?: string[];
    fallbackModel?: string;
    targetSystem?: string;
    policyId?: string;
    escalationOwner?: string;
  };
}

interface WorkflowConnection {
  from: string;
  to: string;
  edgeType?: string;
  retries?: number;
  backoffMs?: number;
  condition?: string;
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
  workflowConnections: WorkflowConnection[];
  policyBindings: string[];
  evalBindings: string[];
  rollbackPlan: string;
  guardrailsConfig: {
    policyBundleIds: string[];
    stopConditions: string[];
    escalationTriggers: string[];
    forbiddenOutputs: string[];
    allowedActions: string[];
  };
  evalSuiteConfig: {
    baselineSuiteIds: string[];
    customCases: Array<{ name: string; input: string; expectedOutput: string }>;
    pilotThreshold: number;
    prodThreshold: number;
  };
  rolloutConfig: {
    shadowModeDuration: string;
    canarySteps: number[];
    autoRollbackTriggers: string[];
    rollbackStrategy: string;
    healthCheckInterval: string;
  };
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
  workflowConnections: [],
  policyBindings: [],
  evalBindings: [],
  rollbackPlan: "",
  guardrailsConfig: {
    policyBundleIds: [],
    stopConditions: [],
    escalationTriggers: [],
    forbiddenOutputs: [],
    allowedActions: [],
  },
  evalSuiteConfig: {
    baselineSuiteIds: [],
    customCases: [],
    pilotThreshold: 80,
    prodThreshold: 90,
  },
  rolloutConfig: {
    shadowModeDuration: "7d",
    canarySteps: [5, 25, 50, 100],
    autoRollbackTriggers: [],
    rollbackStrategy: "immediate",
    healthCheckInterval: "5m",
  },
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

  const [outcomeLockedFromUrl, setOutcomeLockedFromUrl] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    const outcomeIdParam = params.get("outcomeId");
    const outcomeNameParam = params.get("outcomeName");
    const nameParam = params.get("name");
    const descParam = params.get("description");
    const riskParam = params.get("riskTier");
    const autonomyParam = params.get("autonomyMode");
    if (outcomeIdParam) {
      updateState({ outcomeId: outcomeIdParam });
      setOutcomeLockedFromUrl(true);
    }
    if (nameParam) updateState({ name: nameParam });
    else if (outcomeNameParam && !wizardState.name) {
      updateState({ name: `${outcomeNameParam} Agent` });
    }
    if (descParam) updateState({ description: descParam });
    if (riskParam) updateState({ riskTier: riskParam });
    if (autonomyParam) updateState({ autonomyMode: autonomyParam });
  }, [searchParams]);

  useEffect(() => {
    if (outcomeLockedFromUrl && outcomes && wizardState.outcomeId && !wizardState.owner) {
      const linkedOutcome = outcomes.find((o) => o.id === wizardState.outcomeId);
      if (linkedOutcome) {
        updateState({ owner: `${linkedOutcome.name} Team` });
      }
    }
  }, [outcomes, outcomeLockedFromUrl, wizardState.outcomeId]);

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
      guardrailsConfig: wizardState.guardrailsConfig,
      evalSuiteConfig: wizardState.evalSuiteConfig,
      rolloutConfig: wizardState.rolloutConfig,
      rollbackPlan: wizardState.rolloutConfig ? {
        rollbackStrategy: wizardState.rolloutConfig.rollbackStrategy,
        healthCheckInterval: wizardState.rolloutConfig.healthCheckInterval,
        autoRollbackTriggers: wizardState.rolloutConfig.autoRollbackTriggers,
        shadowModeDuration: wizardState.rolloutConfig.shadowModeDuration,
        canarySteps: wizardState.rolloutConfig.canarySteps,
      } : null,
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
    <div className="flex flex-col gap-6 p-6 pb-20" data-testid="page-agent-wizard">
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

      <div className="flex items-center gap-2 bg-background py-3 border-b -mx-6 px-6 sticky top-0 z-30">
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
          <Step1BasicInfo state={wizardState} updateState={updateState} outcomes={outcomes} outcomeLockedFromUrl={outcomeLockedFromUrl} />
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
          <Step5Guardrails state={wizardState} updateState={updateState} />
        )}
        {currentStep === 6 && (
          <Step6EvalSuite state={wizardState} updateState={updateState} />
        )}
        {currentStep === 7 && (
          <Step7RolloutPlan state={wizardState} updateState={updateState} />
        )}
        {currentStep === 8 && (
          <Step5Review
            state={wizardState}
            onCreate={handleCreate}
            isPending={createMutation.isPending}
            outcomes={outcomes}
          />
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 flex items-center justify-between gap-4 border-t pt-4 pb-4 px-6 bg-background z-50">
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
        {currentStep < 8 ? (
          <Button
            onClick={() => {
              if (currentStep === 1) {
                setCurrentStep(2);
              } else {
                setCurrentStep((s) => Math.min(8, s + 1));
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
  outcomeLockedFromUrl,
}: {
  state: WizardState;
  updateState: (u: Partial<WizardState>) => void;
  outcomes: OutcomeContract[] | undefined;
  outcomeLockedFromUrl?: boolean;
}) {
  const linkedOutcome = outcomeLockedFromUrl && outcomes ? outcomes.find((o) => o.id === state.outcomeId) : null;
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
        {outcomeLockedFromUrl && linkedOutcome ? (
          <div className="flex flex-col gap-2">
            <Label>Linked Outcome</Label>
            <div className="flex items-center gap-2 p-2 rounded-md bg-muted/40 border" data-testid="locked-outcome">
              <Target className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium">{linkedOutcome.name}</span>
              <Badge variant="secondary" className="ml-auto">Pre-linked</Badge>
            </div>
            <span className="text-xs text-muted-foreground">This agent is being created for a specific outcome contract.</span>
          </div>
        ) : outcomes && outcomes.length > 0 ? (
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
        ) : null}
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
  const [catalogFilter, setCatalogFilter] = useState<string>("all");
  const [showCatalog, setShowCatalog] = useState(false);

  function addToolFromCatalog(catalogTool: ToolConfig) {
    const alreadyAdded = state.toolsConfig.some(t => t.name === catalogTool.name);
    if (!alreadyAdded) {
      updateState({ toolsConfig: [...state.toolsConfig, { ...catalogTool }] });
    }
  }

  function addCustomTool() {
    updateState({ toolsConfig: [...state.toolsConfig, { name: "", description: "", permissionScope: "READ", accessTier: "STANDARD" }] });
  }

  function removeTool(i: number) {
    updateState({ toolsConfig: state.toolsConfig.filter((_, idx) => idx !== i) });
  }

  function updateTool(i: number, field: keyof ToolConfig, value: string | number | boolean | string[]) {
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

  const tierColors: Record<string, string> = {
    OPEN: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    STANDARD: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
    RESTRICTED: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    CRITICAL: "bg-red-500/10 text-red-700 dark:text-red-400",
  };

  const scopeColors: Record<string, string> = {
    READ: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    WRITE: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    EXECUTE: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
    ADMIN: "bg-red-500/10 text-red-700 dark:text-red-400",
  };

  const filteredCatalog = catalogFilter === "all" ? TOOL_CATALOG : TOOL_CATALOG.filter(t => t.accessTier === catalogFilter);

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
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
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-medium">Tool Catalog</CardTitle>
            {state.toolsConfig.length > 0 && <Badge variant="outline" className="text-[10px]">{state.toolsConfig.length} selected</Badge>}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowCatalog(!showCatalog)} data-testid="button-toggle-catalog">
              <Library className="w-3.5 h-3.5 mr-1" /> {showCatalog ? "Hide" : "Browse"} Catalog
            </Button>
            <Button variant="outline" size="sm" onClick={addCustomTool} data-testid="button-add-custom-tool">
              <Plus className="w-3.5 h-3.5 mr-1" /> Custom Tool
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {showCatalog && (
            <div className="flex flex-col gap-3 pb-4 border-b">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider mr-1">Filter:</span>
                {["all", "OPEN", "STANDARD", "RESTRICTED", "CRITICAL"].map(tier => (
                  <Button
                    key={tier}
                    variant={catalogFilter === tier ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCatalogFilter(tier)}
                    data-testid={`button-filter-tier-${tier.toLowerCase()}`}
                  >
                    {tier === "all" ? "All" : tier}
                  </Button>
                ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {filteredCatalog.map(tool => {
                  const isSelected = state.toolsConfig.some(t => t.name === tool.name);
                  return (
                    <div
                      key={tool.name}
                      className={`flex flex-col gap-2 p-3 rounded-md border cursor-pointer transition-colors ${isSelected ? "border-primary bg-primary/5" : "hover-elevate"}`}
                      onClick={() => !isSelected && addToolFromCatalog(tool)}
                      data-testid={`catalog-tool-${tool.name}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium font-mono">{tool.name}</span>
                        <div className="flex items-center gap-1">
                          <Badge variant="outline" className={`text-[9px] ${tierColors[tool.accessTier || "STANDARD"]}`}>
                            {tool.accessTier}
                          </Badge>
                          <Badge variant="outline" className={`text-[9px] ${scopeColors[tool.permissionScope || "READ"]}`}>
                            {tool.permissionScope}
                          </Badge>
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground">{tool.description}</p>
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{tool.rateLimit}</span>
                        <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" />${tool.costPerCall}/call</span>
                        {tool.writeAccess && <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400"><AlertTriangle className="w-3 h-3" />Write</span>}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {tool.dataClasses?.map(dc => (
                          <Badge key={dc} variant="secondary" className="text-[9px]">{dc}</Badge>
                        ))}
                      </div>
                      {isSelected && (
                        <Badge variant="default" className="text-[9px] w-fit">Selected</Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {state.toolsConfig.length === 0 && !showCatalog && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No tools configured. Browse the catalog or add a custom tool.
            </p>
          )}

          {state.toolsConfig.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Selected Tools</span>
              {state.toolsConfig.map((tool, i) => (
                <div key={i} className="flex items-start gap-2 p-3 rounded-md border" data-testid={`selected-tool-${i}`}>
                  <div className="flex-1 flex flex-col gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {tool.name ? (
                        <span className="text-xs font-medium font-mono">{tool.name}</span>
                      ) : (
                        <Input
                          placeholder="Tool name"
                          value={tool.name}
                          onChange={(e) => updateTool(i, "name", e.target.value)}
                          className="h-7 text-xs w-48"
                          data-testid={`input-tool-name-${i}`}
                        />
                      )}
                      {tool.accessTier && (
                        <Badge variant="outline" className={`text-[9px] ${tierColors[tool.accessTier]}`}>
                          {tool.accessTier}
                        </Badge>
                      )}
                      {tool.permissionScope && (
                        <Badge variant="outline" className={`text-[9px] ${scopeColors[tool.permissionScope]}`}>
                          {tool.permissionScope}
                        </Badge>
                      )}
                    </div>
                    {!tool.description && !TOOL_CATALOG.some(c => c.name === tool.name) ? (
                      <Input
                        placeholder="Tool description"
                        value={tool.description}
                        onChange={(e) => updateTool(i, "description", e.target.value)}
                        className="h-7 text-xs"
                        data-testid={`input-tool-desc-${i}`}
                      />
                    ) : (
                      <p className="text-[11px] text-muted-foreground">{tool.description}</p>
                    )}
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                      {tool.rateLimit && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{tool.rateLimit}</span>}
                      {tool.costPerCall !== undefined && <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" />${tool.costPerCall}/call</span>}
                      {tool.failureModes && tool.failureModes.length > 0 && (
                        <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{tool.failureModes.length} failure modes</span>
                      )}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeTool(i)} data-testid={`button-remove-tool-${i}`}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
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

const NODE_TYPES: { type: string; label: string; icon: LucideIcon; color: string }[] = [
  { type: "trigger", label: "Trigger", icon: Zap, color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  { type: "llm_call", label: "LLM Call", icon: Sparkles, color: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20" },
  { type: "tool_call", label: "Tool Call", icon: Wrench, color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" },
  { type: "tool_proxy", label: "Tool Proxy", icon: PlugZap, color: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20" },
  { type: "condition", label: "Condition", icon: AlertTriangle, color: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20" },
  { type: "policy_check", label: "Policy Check", icon: Shield, color: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20" },
  { type: "human_review", label: "Human Review", icon: ShieldCheck, color: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20" },
  { type: "escalation", label: "Escalation", icon: PhoneForwarded, color: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20" },
  { type: "writeback", label: "Writeback", icon: Database, color: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20" },
  { type: "classifier", label: "Classifier", icon: Gauge, color: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20" },
  { type: "router", label: "Router", icon: ArrowRight, color: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20" },
  { type: "schema_validate", label: "Validate", icon: Check, color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  { type: "rag", label: "RAG", icon: BookOpen, color: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20" },
  { type: "output_format", label: "Output Format", icon: FileText, color: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20" },
];

function Step4MemoryWorkflow({
  state,
  updateState,
}: {
  state: WizardState;
  updateState: (u: Partial<WizardState>) => void;
}) {
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeIdx, setSelectedEdgeIdx] = useState<number | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  function addNodeToCanvas(type: string) {
    const count = state.workflowNodes.length;
    const newId = `node_${count + 1}`;
    const x = 40 + (count % 3) * 220;
    const y = 40 + Math.floor(count / 3) * 140;
    updateState({
      workflowNodes: [...state.workflowNodes, { id: newId, type, label: "", x, y, config: {} }],
    });
  }

  function removeNode(id: string) {
    updateState({
      workflowNodes: state.workflowNodes.filter(n => n.id !== id),
      workflowConnections: (state.workflowConnections || []).filter((c: WorkflowConnection) => c.from !== id && c.to !== id),
    });
    if (connectingFrom === id) setConnectingFrom(null);
    if (selectedNodeId === id) setSelectedNodeId(null);
  }

  function updateNodeLabel(index: number, label: string) {
    const updated = [...state.workflowNodes];
    updated[index] = { ...updated[index], label };
    updateState({ workflowNodes: updated });
  }

  function updateNodeConfig(nodeId: string, configUpdate: Record<string, unknown>) {
    const updated = state.workflowNodes.map(n =>
      n.id === nodeId ? { ...n, config: { ...(n.config || {}), ...configUpdate } } : n
    );
    updateState({ workflowNodes: updated });
  }

  function updateEdgeConfig(edgeIdx: number, updates: Partial<WorkflowConnection>) {
    const conns = [...(state.workflowConnections || [])] as WorkflowConnection[];
    conns[edgeIdx] = { ...conns[edgeIdx], ...updates };
    updateState({ workflowConnections: conns });
  }

  function updateNodePosition(id: string, x: number, y: number) {
    const updated = state.workflowNodes.map(n => n.id === id ? { ...n, x, y } : n);
    updateState({ workflowNodes: updated });
  }

  function startConnection(nodeId: string) {
    setConnectingFrom(prev => prev === nodeId ? null : nodeId);
  }

  function completeConnection(nodeId: string) {
    if (!connectingFrom || connectingFrom === nodeId) return;
    const existing = (state.workflowConnections || []) as WorkflowConnection[];
    const alreadyExists = existing.some(c => c.from === connectingFrom && c.to === nodeId);
    if (!alreadyExists) {
      updateState({ workflowConnections: [...existing, { from: connectingFrom, to: nodeId, edgeType: "default", retries: 0, backoffMs: 1000 }] });
    }
    setConnectingFrom(null);
  }

  function removeConnection(from: string, to: string) {
    const existing = (state.workflowConnections || []) as WorkflowConnection[];
    updateState({ workflowConnections: existing.filter(c => !(c.from === from && c.to === to)) });
    setSelectedEdgeIdx(null);
  }

  const selectedNode = selectedNodeId ? state.workflowNodes.find(n => n.id === selectedNodeId) : null;
  const selectedEdge = selectedEdgeIdx !== null ? (state.workflowConnections as WorkflowConnection[])?.[selectedEdgeIdx] : null;

  const edgeTypeColors: Record<string, string> = {
    default: "hsl(var(--primary))",
    fallback: "hsl(var(--destructive))",
    human_gate: "hsl(130, 60%, 50%)",
    retry: "hsl(45, 90%, 50%)",
  };

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
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
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-medium">Visual Workflow</CardTitle>
            {state.workflowNodes.length > 0 && <Badge variant="outline" className="text-[10px]">{state.workflowNodes.length} nodes</Badge>}
          </div>
          {connectingFrom && (
            <Badge variant="outline" className="text-[10px] animate-pulse">
              Click a target node to connect
            </Badge>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-1.5 flex-wrap pb-2 border-b">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider mr-1">Add:</span>
            {NODE_TYPES.map((nt) => (
              <Button
                key={nt.type}
                variant="outline"
                size="sm"
                onClick={() => addNodeToCanvas(nt.type)}
                data-testid={`button-add-${nt.type}`}
              >
                <nt.icon className="w-3 h-3 mr-1" />
                {nt.label}
              </Button>
            ))}
          </div>

          <div className="flex gap-3">
            <div
              ref={canvasRef}
              className="relative border rounded-md bg-muted/20 flex-1"
              style={{ minHeight: "400px", height: `${Math.max(400, (Math.floor(state.workflowNodes.length / 3) + 1) * 160 + 60)}px` }}
              data-testid="workflow-canvas"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const nodeId = e.dataTransfer.getData("nodeId");
                if (!nodeId || !canvasRef.current) return;
                const rect = canvasRef.current.getBoundingClientRect();
                const offsetX = parseInt(e.dataTransfer.getData("offsetX") || "0");
                const offsetY = parseInt(e.dataTransfer.getData("offsetY") || "0");
                const newX = Math.max(0, e.clientX - offsetX);
                const newY = Math.max(0, e.clientY - offsetY);
                const relX = Math.max(0, Math.min(newX - rect.left, rect.width - 200));
                const relY = Math.max(0, newY - rect.top);
                updateNodePosition(nodeId, relX, relY);
              }}
            >
              <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
                {state.workflowConnections?.map((conn: WorkflowConnection, i: number) => {
                  const fromNode = state.workflowNodes.find(n => n.id === conn.from);
                  const toNode = state.workflowNodes.find(n => n.id === conn.to);
                  if (!fromNode || !toNode) return null;
                  const fx = (fromNode.x || 0) + 100;
                  const fy = (fromNode.y || 0) + 55;
                  const tx = (toNode.x || 0) + 100;
                  const ty = (toNode.y || 0) + 15;
                  const midY = (fy + ty) / 2;
                  const edgeColor = edgeTypeColors[conn.edgeType || "default"] || edgeTypeColors.default;
                  const isDashed = conn.edgeType === "fallback" || conn.edgeType === "human_gate";
                  return (
                    <g key={i}>
                      <path
                        d={`M ${fx} ${fy} C ${fx} ${midY}, ${tx} ${midY}, ${tx} ${ty}`}
                        fill="none"
                        stroke={edgeColor}
                        strokeWidth="2"
                        strokeOpacity={selectedEdgeIdx === i ? "0.9" : "0.4"}
                        strokeDasharray={isDashed ? "6 3" : "none"}
                        markerEnd="url(#arrowhead)"
                        className="cursor-pointer pointer-events-auto"
                        onClick={() => setSelectedEdgeIdx(selectedEdgeIdx === i ? null : i)}
                      />
                      {conn.edgeType && conn.edgeType !== "default" && (
                        <text
                          x={(fx + tx) / 2 + 12}
                          y={(fy + ty) / 2 - 4}
                          fill={edgeColor}
                          fontSize="9"
                          className="pointer-events-none"
                        >{conn.edgeType}{conn.retries ? ` (${conn.retries}x)` : ""}</text>
                      )}
                      <circle
                        cx={(fx + tx) / 2}
                        cy={(fy + ty) / 2}
                        r="8"
                        fill="hsl(var(--destructive))"
                        fillOpacity="0.7"
                        className="cursor-pointer pointer-events-auto"
                        onClick={() => removeConnection(conn.from, conn.to)}
                        data-testid={`button-remove-connection-${i}`}
                      />
                      <text
                        x={(fx + tx) / 2}
                        y={(fy + ty) / 2 + 1}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="white"
                        fontSize="10"
                        className="pointer-events-none"
                      >x</text>
                    </g>
                  );
                })}
                <defs>
                  <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="hsl(var(--primary))" fillOpacity="0.4" />
                  </marker>
                </defs>
              </svg>

              {state.workflowNodes.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <p className="text-sm text-muted-foreground">Click a node type above to add it to the canvas</p>
                </div>
              )}
              {state.workflowNodes.map((node, i) => {
                const nodeType = NODE_TYPES.find(nt => nt.type === node.type) || NODE_TYPES[0];
                const NodeIcon = nodeType.icon;
                const isSelected = selectedNodeId === node.id;
                return (
                  <div
                    key={node.id}
                    className={`absolute border rounded-md p-2.5 flex flex-col gap-1.5 w-[200px] cursor-move ${nodeType.color} ${connectingFrom === node.id ? "ring-2 ring-primary" : ""} ${isSelected ? "ring-2 ring-foreground" : ""}`}
                    style={{ left: node.x || 0, top: node.y || 0, zIndex: 2 }}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("nodeId", node.id);
                      e.dataTransfer.setData("offsetX", String(e.clientX - (node.x || 0)));
                      e.dataTransfer.setData("offsetY", String(e.clientY - (node.y || 0)));
                    }}
                    data-testid={`workflow-node-${node.id}`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5">
                        <NodeIcon className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-semibold uppercase tracking-wider">{nodeType.label}</span>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <Button variant="ghost" size="icon" onClick={() => setSelectedNodeId(isSelected ? null : node.id)} data-testid={`button-config-node-${node.id}`}>
                          <Settings className="w-3 h-3" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => removeNode(node.id)} data-testid={`button-remove-node-${node.id}`}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                    <Input
                      value={node.label}
                      onChange={(e) => updateNodeLabel(i, e.target.value)}
                      placeholder="Node label..."
                      className="h-7 text-xs"
                      data-testid={`input-node-label-${node.id}`}
                    />
                    <div className="flex items-center justify-between gap-1 mt-0.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-[10px]"
                        onClick={() => startConnection(node.id)}
                        data-testid={`button-connect-from-${node.id}`}
                      >
                        Connect
                      </Button>
                      {connectingFrom && connectingFrom !== node.id && (
                        <Button
                          variant="default"
                          size="sm"
                          className="text-[10px] animate-pulse"
                          onClick={() => completeConnection(node.id)}
                          data-testid={`button-connect-to-${node.id}`}
                        >
                          Link here
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {(selectedNode || selectedEdge) && (
              <div className="w-64 shrink-0 border rounded-md p-3 flex flex-col gap-3 bg-muted/10" data-testid="workflow-config-sidebar">
                {selectedNode && (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider">Node Config</span>
                      <Button variant="ghost" size="icon" onClick={() => setSelectedNodeId(null)} data-testid="button-close-node-config">
                        <ArrowRight className="w-3 h-3" />
                      </Button>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label className="text-[10px]">Prompt / Instructions</Label>
                      <Textarea
                        value={selectedNode.config?.prompt || ""}
                        onChange={(e) => updateNodeConfig(selectedNode.id, { prompt: e.target.value })}
                        placeholder="System prompt or instructions..."
                        className="text-xs min-h-[60px]"
                        data-testid="input-node-prompt"
                      />
                    </div>
                    {(selectedNode.type === "llm_call" || selectedNode.type === "classifier" || selectedNode.type === "rag") && (
                      <>
                        <div className="flex flex-col gap-2">
                          <Label className="text-[10px]">Model Override</Label>
                          <Input
                            value={selectedNode.config?.model || ""}
                            onChange={(e) => updateNodeConfig(selectedNode.id, { model: e.target.value })}
                            placeholder="Default model"
                            className="h-7 text-xs"
                            data-testid="input-node-model"
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label className="text-[10px]">Temperature</Label>
                          <Input
                            type="number"
                            step="0.1"
                            min="0"
                            max="2"
                            value={selectedNode.config?.temperature ?? 0.7}
                            onChange={(e) => updateNodeConfig(selectedNode.id, { temperature: parseFloat(e.target.value) || 0.7 })}
                            className="h-7 text-xs"
                            data-testid="input-node-temperature"
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label className="text-[10px]">Fallback Model</Label>
                          <Input
                            value={selectedNode.config?.fallbackModel || ""}
                            onChange={(e) => updateNodeConfig(selectedNode.id, { fallbackModel: e.target.value })}
                            placeholder="e.g., gpt-4o-mini"
                            className="h-7 text-xs"
                            data-testid="input-node-fallback-model"
                          />
                        </div>
                      </>
                    )}
                    {(selectedNode.type === "writeback" || selectedNode.type === "tool_proxy") && (
                      <div className="flex flex-col gap-2">
                        <Label className="text-[10px]">Target System</Label>
                        <Input
                          value={selectedNode.config?.targetSystem || ""}
                          onChange={(e) => updateNodeConfig(selectedNode.id, { targetSystem: e.target.value })}
                          placeholder="e.g., CRM, ticket system"
                          className="h-7 text-xs"
                          data-testid="input-node-target-system"
                        />
                      </div>
                    )}
                    {selectedNode.type === "escalation" && (
                      <div className="flex flex-col gap-2">
                        <Label className="text-[10px]">Escalation Owner</Label>
                        <Input
                          value={selectedNode.config?.escalationOwner || ""}
                          onChange={(e) => updateNodeConfig(selectedNode.id, { escalationOwner: e.target.value })}
                          placeholder="Team or person"
                          className="h-7 text-xs"
                          data-testid="input-node-escalation-owner"
                        />
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-1">
                        <Label className="text-[10px]">Max Retries</Label>
                        <Input
                          type="number"
                          min="0"
                          value={selectedNode.config?.maxRetries ?? 3}
                          onChange={(e) => updateNodeConfig(selectedNode.id, { maxRetries: parseInt(e.target.value) || 0 })}
                          className="h-7 text-xs"
                          data-testid="input-node-retries"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className="text-[10px]">Timeout (ms)</Label>
                        <Input
                          type="number"
                          min="0"
                          value={selectedNode.config?.timeoutMs ?? 30000}
                          onChange={(e) => updateNodeConfig(selectedNode.id, { timeoutMs: parseInt(e.target.value) || 30000 })}
                          className="h-7 text-xs"
                          data-testid="input-node-timeout"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label className="text-[10px]">Cost Budget ($)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={selectedNode.config?.costBudget ?? ""}
                        onChange={(e) => updateNodeConfig(selectedNode.id, { costBudget: parseFloat(e.target.value) || 0 })}
                        placeholder="Max cost per call"
                        className="h-7 text-xs"
                        data-testid="input-node-cost-budget"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label className="text-[10px]">Observability Log Level</Label>
                      <Select
                        value={selectedNode.config?.logLevel || "info"}
                        onValueChange={(v) => updateNodeConfig(selectedNode.id, { logLevel: v })}
                      >
                        <SelectTrigger className="h-7 text-xs" data-testid="select-node-log-level">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="debug">Debug</SelectItem>
                          <SelectItem value="info">Info</SelectItem>
                          <SelectItem value="warn">Warning</SelectItem>
                          <SelectItem value="error">Error Only</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}

                {selectedEdge && selectedEdgeIdx !== null && (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider">Edge Rules</span>
                      <Button variant="ghost" size="icon" onClick={() => setSelectedEdgeIdx(null)} data-testid="button-close-edge-config">
                        <ArrowRight className="w-3 h-3" />
                      </Button>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label className="text-[10px]">Edge Type</Label>
                      <Select
                        value={selectedEdge.edgeType || "default"}
                        onValueChange={(v) => updateEdgeConfig(selectedEdgeIdx, { edgeType: v })}
                      >
                        <SelectTrigger className="h-7 text-xs" data-testid="select-edge-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="default">Default</SelectItem>
                          <SelectItem value="fallback">Fallback Path</SelectItem>
                          <SelectItem value="retry">Retry Loop</SelectItem>
                          <SelectItem value="human_gate">Human Required Gate</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {(selectedEdge.edgeType === "retry" || selectedEdge.edgeType === "fallback") && (
                      <>
                        <div className="flex flex-col gap-2">
                          <Label className="text-[10px]">Max Retries</Label>
                          <Input
                            type="number"
                            min="0"
                            value={selectedEdge.retries ?? 3}
                            onChange={(e) => updateEdgeConfig(selectedEdgeIdx, { retries: parseInt(e.target.value) || 0 })}
                            className="h-7 text-xs"
                            data-testid="input-edge-retries"
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label className="text-[10px]">Backoff (ms)</Label>
                          <Input
                            type="number"
                            min="0"
                            value={selectedEdge.backoffMs ?? 1000}
                            onChange={(e) => updateEdgeConfig(selectedEdgeIdx, { backoffMs: parseInt(e.target.value) || 1000 })}
                            className="h-7 text-xs"
                            data-testid="input-edge-backoff"
                          />
                        </div>
                      </>
                    )}
                    <div className="flex flex-col gap-2">
                      <Label className="text-[10px]">Condition</Label>
                      <Input
                        value={selectedEdge.condition || ""}
                        onChange={(e) => updateEdgeConfig(selectedEdgeIdx, { condition: e.target.value })}
                        placeholder="e.g., output.confidence > 0.8"
                        className="h-7 text-xs"
                        data-testid="input-edge-condition"
                      />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StringListCard({
  title,
  icon: Icon,
  items,
  onAdd,
  onRemove,
  placeholder,
  testIdPrefix,
}: {
  title: string;
  icon: LucideIcon;
  items: string[];
  onAdd: (val: string) => void;
  onRemove: (idx: number) => void;
  placeholder: string;
  testIdPrefix: string;
}) {
  const [inputVal, setInputVal] = useState("");
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 pb-3">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Input
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            placeholder={placeholder}
            onKeyDown={(e) => {
              if (e.key === "Enter" && inputVal.trim()) {
                onAdd(inputVal.trim());
                setInputVal("");
              }
            }}
            data-testid={`input-${testIdPrefix}`}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (inputVal.trim()) {
                onAdd(inputVal.trim());
                setInputVal("");
              }
            }}
            data-testid={`button-add-${testIdPrefix}`}
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> Add
          </Button>
        </div>
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-2">No items added yet.</p>
        )}
        {items.map((item, i) => (
          <div key={i} className="flex items-center justify-between gap-2 text-sm">
            <span data-testid={`text-${testIdPrefix}-${i}`}>{item}</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onRemove(i)}
              data-testid={`button-remove-${testIdPrefix}-${i}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function Step5Guardrails({
  state,
  updateState,
}: {
  state: WizardState;
  updateState: (u: Partial<WizardState>) => void;
}) {
  const { data: policies, isLoading: policiesLoading } = useQuery<Array<{
    id: string;
    name: string;
    domain: string;
    description: string;
  }>>({
    queryKey: ["/api/policies"],
  });

  function togglePolicy(policyId: string) {
    const current = state.guardrailsConfig.policyBundleIds;
    const updated = current.includes(policyId)
      ? current.filter((id) => id !== policyId)
      : [...current, policyId];
    updateState({
      guardrailsConfig: { ...state.guardrailsConfig, policyBundleIds: updated },
    });
  }

  function addItem(field: keyof typeof state.guardrailsConfig, val: string) {
    const current = state.guardrailsConfig[field] as string[];
    updateState({
      guardrailsConfig: { ...state.guardrailsConfig, [field]: [...current, val] },
    });
  }

  function removeItem(field: keyof typeof state.guardrailsConfig, idx: number) {
    const current = state.guardrailsConfig[field] as string[];
    updateState({
      guardrailsConfig: { ...state.guardrailsConfig, [field]: current.filter((_, i) => i !== idx) },
    });
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div className="flex items-center gap-2">
        <Shield className="w-5 h-5 text-muted-foreground" />
        <h2 className="text-lg font-medium">Guardrails</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Configure safety policies, stop conditions, and escalation triggers to control agent behavior.
      </p>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2 pb-3">
          <ListChecks className="w-4 h-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Policy Bundles</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {policiesLoading && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!policiesLoading && (!policies || policies.length === 0) && (
            <p className="text-sm text-muted-foreground text-center py-4">No policies available.</p>
          )}
          {policies?.map((policy) => {
            const isSelected = state.guardrailsConfig.policyBundleIds.includes(policy.id);
            return (
              <div
                key={policy.id}
                className={`flex items-center gap-3 p-3 rounded-md cursor-pointer transition-colors ${
                  isSelected ? "bg-primary/10 ring-1 ring-primary/30" : "bg-muted/30 hover-elevate"
                }`}
                onClick={() => togglePolicy(policy.id)}
                data-testid={`toggle-policy-${policy.id}`}
              >
                <div className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                  isSelected ? "bg-primary border-primary" : "border-border"
                }`}>
                  {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{policy.name}</span>
                    <Badge variant="outline" className="text-[10px]">{policy.domain}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{policy.description}</p>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <StringListCard
        title="Stop Conditions"
        icon={AlertTriangle}
        items={state.guardrailsConfig.stopConditions}
        onAdd={(val) => addItem("stopConditions", val)}
        onRemove={(idx) => removeItem("stopConditions", idx)}
        placeholder="e.g., PII detected in output"
        testIdPrefix="stop-condition"
      />

      <StringListCard
        title="Escalation Triggers"
        icon={Bell}
        items={state.guardrailsConfig.escalationTriggers}
        onAdd={(val) => addItem("escalationTriggers", val)}
        onRemove={(idx) => removeItem("escalationTriggers", idx)}
        placeholder="e.g., Write action to production DB"
        testIdPrefix="escalation-trigger"
      />

      <StringListCard
        title="Forbidden Outputs"
        icon={Shield}
        items={state.guardrailsConfig.forbiddenOutputs}
        onAdd={(val) => addItem("forbiddenOutputs", val)}
        onRemove={(idx) => removeItem("forbiddenOutputs", idx)}
        placeholder="e.g., Never output raw SQL queries"
        testIdPrefix="forbidden-output"
      />

      <StringListCard
        title="Allowed Actions"
        icon={Target}
        items={state.guardrailsConfig.allowedActions}
        onAdd={(val) => addItem("allowedActions", val)}
        onRemove={(idx) => removeItem("allowedActions", idx)}
        placeholder="e.g., Read from customer database"
        testIdPrefix="allowed-action"
      />
    </div>
  );
}

function Step6EvalSuite({
  state,
  updateState,
}: {
  state: WizardState;
  updateState: (u: Partial<WizardState>) => void;
}) {
  const { data: evalSuites, isLoading: suitesLoading } = useQuery<Array<{
    id: string;
    name: string;
    type: string;
    totalCases: number;
    passRate: number;
  }>>({
    queryKey: ["/api/eval-suites"],
  });

  const [newCase, setNewCase] = useState({ name: "", input: "", expectedOutput: "" });

  function toggleSuite(suiteId: string) {
    const current = state.evalSuiteConfig.baselineSuiteIds;
    const updated = current.includes(suiteId)
      ? current.filter((id) => id !== suiteId)
      : [...current, suiteId];
    updateState({
      evalSuiteConfig: { ...state.evalSuiteConfig, baselineSuiteIds: updated },
    });
  }

  function addCustomCase() {
    if (!newCase.name.trim() || !newCase.input.trim()) return;
    updateState({
      evalSuiteConfig: {
        ...state.evalSuiteConfig,
        customCases: [...state.evalSuiteConfig.customCases, { ...newCase }],
      },
    });
    setNewCase({ name: "", input: "", expectedOutput: "" });
  }

  function removeCustomCase(idx: number) {
    updateState({
      evalSuiteConfig: {
        ...state.evalSuiteConfig,
        customCases: state.evalSuiteConfig.customCases.filter((_, i) => i !== idx),
      },
    });
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div className="flex items-center gap-2">
        <FlaskConical className="w-5 h-5 text-muted-foreground" />
        <h2 className="text-lg font-medium">Eval Suite</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Select baseline evaluation suites, add custom test cases, and set acceptance thresholds.
      </p>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Baseline Suites</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {suitesLoading && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!suitesLoading && (!evalSuites || evalSuites.length === 0) && (
            <p className="text-sm text-muted-foreground text-center py-4">No eval suites available.</p>
          )}
          {evalSuites?.map((suite) => {
            const isSelected = state.evalSuiteConfig.baselineSuiteIds.includes(suite.id);
            return (
              <div
                key={suite.id}
                className={`flex items-center justify-between gap-3 p-3 rounded-md cursor-pointer transition-colors ${
                  isSelected ? "bg-primary/10 ring-1 ring-primary/30" : "bg-muted/30 hover-elevate"
                }`}
                onClick={() => toggleSuite(suite.id)}
                data-testid={`toggle-suite-${suite.id}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                    isSelected ? "bg-primary border-primary" : "border-border"
                  }`}>
                    {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{suite.name}</span>
                      <Badge variant="outline" className="text-[10px]">{suite.type}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {suite.totalCases} cases | {suite.passRate}% pass rate
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <CardTitle className="text-sm font-medium">Custom Test Cases</CardTitle>
          <Badge variant="secondary" className="text-[10px]">
            {state.evalSuiteConfig.customCases.length} cases
          </Badge>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 p-3 rounded-md bg-muted/30">
            <div className="flex flex-col gap-2">
              <Label>Case Name</Label>
              <Input
                value={newCase.name}
                onChange={(e) => setNewCase({ ...newCase, name: e.target.value })}
                placeholder="e.g., Happy path - basic query"
                data-testid="input-case-name"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Input</Label>
              <Textarea
                value={newCase.input}
                onChange={(e) => setNewCase({ ...newCase, input: e.target.value })}
                placeholder="Test input for the agent..."
                data-testid="input-case-input"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Expected Output</Label>
              <Textarea
                value={newCase.expectedOutput}
                onChange={(e) => setNewCase({ ...newCase, expectedOutput: e.target.value })}
                placeholder="Expected agent response..."
                data-testid="input-case-expected"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={addCustomCase}
              disabled={!newCase.name.trim() || !newCase.input.trim()}
              data-testid="button-add-custom-case"
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Case
            </Button>
          </div>
          {state.evalSuiteConfig.customCases.map((tc, i) => (
            <div key={i} className="flex items-start justify-between gap-2 p-3 rounded-md bg-muted/20">
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium" data-testid={`text-case-name-${i}`}>{tc.name}</span>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">Input: {tc.input}</p>
                {tc.expectedOutput && (
                  <p className="text-xs text-muted-foreground line-clamp-1">Expected: {tc.expectedOutput}</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeCustomCase(i)}
                data-testid={`button-remove-case-${i}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Acceptance Thresholds</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label>Pilot Threshold (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={state.evalSuiteConfig.pilotThreshold}
                onChange={(e) =>
                  updateState({
                    evalSuiteConfig: {
                      ...state.evalSuiteConfig,
                      pilotThreshold: parseInt(e.target.value) || 0,
                    },
                  })
                }
                data-testid="input-pilot-threshold"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Production Threshold (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={state.evalSuiteConfig.prodThreshold}
                onChange={(e) =>
                  updateState({
                    evalSuiteConfig: {
                      ...state.evalSuiteConfig,
                      prodThreshold: parseInt(e.target.value) || 0,
                    },
                  })
                }
                data-testid="input-prod-threshold"
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
              <span>0%</span>
              <span>Pilot: {state.evalSuiteConfig.pilotThreshold}%</span>
              <span>Prod: {state.evalSuiteConfig.prodThreshold}%</span>
              <span>100%</span>
            </div>
            <div className="h-3 rounded-full bg-muted overflow-hidden flex">
              <div
                className="h-full bg-amber-500/60 transition-all"
                style={{ width: `${state.evalSuiteConfig.pilotThreshold}%` }}
              />
              <div
                className="h-full bg-green-500/60 transition-all"
                style={{ width: `${Math.max(0, state.evalSuiteConfig.prodThreshold - state.evalSuiteConfig.pilotThreshold)}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Step7RolloutPlan({
  state,
  updateState,
}: {
  state: WizardState;
  updateState: (u: Partial<WizardState>) => void;
}) {
  const [newStepVal, setNewStepVal] = useState("");
  const [newTriggerVal, setNewTriggerVal] = useState("");

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div className="flex items-center gap-2">
        <Rocket className="w-5 h-5 text-muted-foreground" />
        <h2 className="text-lg font-medium">Rollout Plan</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Configure shadow mode, canary deployment steps, and rollback strategies.
      </p>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Shadow Mode</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            In shadow mode, the agent runs alongside the existing system without affecting real traffic. Outputs are logged for comparison.
          </p>
          <div className="flex flex-col gap-2">
            <Label>Duration</Label>
            <Select
              value={state.rolloutConfig.shadowModeDuration}
              onValueChange={(v) =>
                updateState({ rolloutConfig: { ...state.rolloutConfig, shadowModeDuration: v } })
              }
            >
              <SelectTrigger data-testid="select-shadow-duration">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3d">3 days</SelectItem>
                <SelectItem value="7d">1 week</SelectItem>
                <SelectItem value="14d">2 weeks</SelectItem>
                <SelectItem value="30d">1 month</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Canary Steps</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            Define the traffic percentage progression for canary deployment.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            {state.rolloutConfig.canarySteps.map((step, i) => (
              <div key={i} className="flex items-center gap-1">
                <div className="flex items-center gap-1 p-1.5 rounded-md bg-muted/50">
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={step}
                    onChange={(e) => {
                      const updated = [...state.rolloutConfig.canarySteps];
                      updated[i] = parseInt(e.target.value) || 0;
                      updateState({ rolloutConfig: { ...state.rolloutConfig, canarySteps: updated } });
                    }}
                    className="w-16 text-center"
                    data-testid={`input-canary-step-${i}`}
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      updateState({
                        rolloutConfig: {
                          ...state.rolloutConfig,
                          canarySteps: state.rolloutConfig.canarySteps.filter((_, idx) => idx !== i),
                        },
                      });
                    }}
                    data-testid={`button-remove-canary-${i}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
                {i < state.rolloutConfig.canarySteps.length - 1 && (
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              max={100}
              value={newStepVal}
              onChange={(e) => setNewStepVal(e.target.value)}
              placeholder="e.g., 75"
              className="w-24"
              onKeyDown={(e) => {
                if (e.key === "Enter" && newStepVal.trim()) {
                  const val = parseInt(newStepVal);
                  if (val > 0 && val <= 100) {
                    updateState({
                      rolloutConfig: {
                        ...state.rolloutConfig,
                        canarySteps: [...state.rolloutConfig.canarySteps, val].sort((a, b) => a - b),
                      },
                    });
                    setNewStepVal("");
                  }
                }
              }}
              data-testid="input-new-canary-step"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const val = parseInt(newStepVal);
                if (val > 0 && val <= 100) {
                  updateState({
                    rolloutConfig: {
                      ...state.rolloutConfig,
                      canarySteps: [...state.rolloutConfig.canarySteps, val].sort((a, b) => a - b),
                    },
                  });
                  setNewStepVal("");
                }
              }}
              data-testid="button-add-canary-step"
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Step
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2 pb-3">
          <RotateCcw className="w-4 h-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Auto-Rollback Triggers</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Input
              value={newTriggerVal}
              onChange={(e) => setNewTriggerVal(e.target.value)}
              placeholder="e.g., Error rate > 5%"
              onKeyDown={(e) => {
                if (e.key === "Enter" && newTriggerVal.trim()) {
                  updateState({
                    rolloutConfig: {
                      ...state.rolloutConfig,
                      autoRollbackTriggers: [...state.rolloutConfig.autoRollbackTriggers, newTriggerVal.trim()],
                    },
                  });
                  setNewTriggerVal("");
                }
              }}
              data-testid="input-rollback-trigger"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (newTriggerVal.trim()) {
                  updateState({
                    rolloutConfig: {
                      ...state.rolloutConfig,
                      autoRollbackTriggers: [...state.rolloutConfig.autoRollbackTriggers, newTriggerVal.trim()],
                    },
                  });
                  setNewTriggerVal("");
                }
              }}
              data-testid="button-add-rollback-trigger"
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Add
            </Button>
          </div>
          {state.rolloutConfig.autoRollbackTriggers.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-2">No rollback triggers configured.</p>
          )}
          {state.rolloutConfig.autoRollbackTriggers.map((trigger, i) => (
            <div key={i} className="flex items-center justify-between gap-2 text-sm">
              <span data-testid={`text-rollback-trigger-${i}`}>{trigger}</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() =>
                  updateState({
                    rolloutConfig: {
                      ...state.rolloutConfig,
                      autoRollbackTriggers: state.rolloutConfig.autoRollbackTriggers.filter((_, idx) => idx !== i),
                    },
                  })
                }
                data-testid={`button-remove-rollback-trigger-${i}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-3">
            <RotateCcw className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Rollback Strategy</CardTitle>
          </CardHeader>
          <CardContent>
            <Select
              value={state.rolloutConfig.rollbackStrategy}
              onValueChange={(v) =>
                updateState({ rolloutConfig: { ...state.rolloutConfig, rollbackStrategy: v } })
              }
            >
              <SelectTrigger data-testid="select-rollback-strategy">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="immediate">Immediate</SelectItem>
                <SelectItem value="gradual">Gradual</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-3">
            <Activity className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Health Check Interval</CardTitle>
          </CardHeader>
          <CardContent>
            <Select
              value={state.rolloutConfig.healthCheckInterval}
              onValueChange={(v) =>
                updateState({ rolloutConfig: { ...state.rolloutConfig, healthCheckInterval: v } })
              }
            >
              <SelectTrigger data-testid="select-health-check-interval">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1m">Every 1 minute</SelectItem>
                <SelectItem value="5m">Every 5 minutes</SelectItem>
                <SelectItem value="15m">Every 15 minutes</SelectItem>
                <SelectItem value="30m">Every 30 minutes</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      </div>
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
            <div className="flex justify-between gap-2 flex-wrap">
              <span className="text-muted-foreground">Connections</span>
              <span>{state.workflowConnections?.length || 0}</span>
            </div>
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

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Guardrails</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Policy Bundles</span>
            <span className="font-medium" data-testid="review-policy-count">{state.guardrailsConfig.policyBundleIds.length} selected</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Stop Conditions</span>
            <span className="font-medium" data-testid="review-stop-conditions-count">{state.guardrailsConfig.stopConditions.length} configured</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Escalation Triggers</span>
            <span className="font-medium" data-testid="review-escalation-count">{state.guardrailsConfig.escalationTriggers.length} configured</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Forbidden Outputs</span>
            <span className="font-medium">{state.guardrailsConfig.forbiddenOutputs.length} defined</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Allowed Actions</span>
            <span className="font-medium">{state.guardrailsConfig.allowedActions.length} defined</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Eval Suite</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Baseline Suites</span>
            <span className="font-medium" data-testid="review-suites-count">{state.evalSuiteConfig.baselineSuiteIds.length} selected</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Custom Cases</span>
            <span className="font-medium" data-testid="review-custom-cases-count">{state.evalSuiteConfig.customCases.length} cases</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Pilot Threshold</span>
            <span className="font-medium">{state.evalSuiteConfig.pilotThreshold}%</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Production Threshold</span>
            <span className="font-medium">{state.evalSuiteConfig.prodThreshold}%</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Rocket className="w-4 h-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Rollout Plan</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Shadow Mode Duration</span>
            <span className="font-medium" data-testid="review-shadow-duration">{state.rolloutConfig.shadowModeDuration}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Canary Steps</span>
            <div className="flex items-center gap-1">
              {state.rolloutConfig.canarySteps.map((s, i) => (
                <span key={i} className="font-medium">
                  {s}%{i < state.rolloutConfig.canarySteps.length - 1 ? " \u2192 " : ""}
                </span>
              ))}
            </div>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Rollback Strategy</span>
            <Badge variant="outline" className="text-[10px]" data-testid="review-rollback-strategy">{state.rolloutConfig.rollbackStrategy}</Badge>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Health Check Interval</span>
            <span className="font-medium">{state.rolloutConfig.healthCheckInterval}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Auto-Rollback Triggers</span>
            <span className="font-medium">{state.rolloutConfig.autoRollbackTriggers.length} configured</span>
          </div>
        </CardContent>
      </Card>

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
            {(state.riskTier === "HIGH" ||
              (state.permissionsConfig?.writeAccess || []).length > 0 ||
              state.outcomeId) && (
              <div className="flex flex-col gap-1 mt-2">
                {state.riskTier === "HIGH" && (
                  <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    <span>High risk tier requires enhanced review</span>
                  </div>
                )}
                {(state.permissionsConfig?.writeAccess || []).length > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    <span>Tools have write access - elevated blast radius</span>
                  </div>
                )}
                {state.outcomeId && (
                  <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    <span>Outcome linked to high-impact KPIs</span>
                  </div>
                )}
              </div>
            )}
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
