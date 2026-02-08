import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Sparkles,
  Send,
  Target,
  Bot,
  BarChart3,
  CheckCircle,
  ArrowRight,
  Lightbulb,
  Shield,
  Workflow,
  ClipboardCheck,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { OutcomeContract } from "@shared/schema";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface OutcomeProposal {
  type: "outcome_proposal";
  outcomeContract: {
    name: string;
    description: string;
    riskTier: string;
    pricingModel: string;
    pricePerUnit: number;
    riskThreshold: number;
    maxDriftPercent: number;
  };
  kpis: Array<{
    name: string;
    target: number;
    unit: string;
    measurement: string;
    currentBaseline: number | null;
  }>;
  proposedAgents: Array<{
    name: string;
    description: string;
    role: string;
    workflowSteps: string[];
    tools: string[];
    riskTier: string;
    autonomyMode: string;
    estimatedImpact: string;
  }>;
  validationChecklist: string[];
}

const STARTER_PROMPTS = [
  {
    icon: Target,
    label: "Reduce customer churn",
    prompt: "Our customer churn rate is around 8% monthly and we want to bring it down to under 4%. We're a SaaS company with about 2,000 customers.",
  },
  {
    icon: BarChart3,
    label: "Speed up support resolution",
    prompt: "Our customer support tickets take an average of 48 hours to resolve. We want to get that under 4 hours for common issues.",
  },
  {
    icon: Workflow,
    label: "Automate compliance checks",
    prompt: "We spend about 200 hours per month on manual compliance document reviews. We need to automate this while keeping accuracy above 99%.",
  },
  {
    icon: Lightbulb,
    label: "Improve lead qualification",
    prompt: "Our sales team wastes time on unqualified leads. We get about 500 leads a month but only 10% convert. We want to pre-qualify them automatically.",
  },
];

function extractProposal(content: string): OutcomeProposal | null {
  const jsonMatch = content.match(/```json\s*([\s\S]*?)```/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[1]);
    if (parsed.type === "outcome_proposal") return parsed;
    return null;
  } catch {
    return null;
  }
}

function renderMessageContent(content: string) {
  const jsonMatch = content.match(/```json\s*[\s\S]*?```/);
  if (!jsonMatch) return <p className="whitespace-pre-wrap text-sm">{content}</p>;

  const beforeJson = content.substring(0, jsonMatch.index).trim();
  const afterJson = content.substring((jsonMatch.index || 0) + jsonMatch[0].length).trim();

  return (
    <div className="flex flex-col gap-2">
      {beforeJson && <p className="whitespace-pre-wrap text-sm">{beforeJson}</p>}
      <div className="flex items-center gap-2 p-2 rounded-md bg-primary/5 border border-primary/10 flex-wrap">
        <ClipboardCheck className="w-4 h-4 text-primary shrink-0" />
        <span className="text-xs font-medium">Outcome proposal generated — see the review panel below</span>
      </div>
      {afterJson && <p className="whitespace-pre-wrap text-sm">{afterJson}</p>}
    </div>
  );
}

export default function OutcomeDiscover() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [proposal, setProposal] = useState<OutcomeProposal | null>(null);
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set());
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const createOutcomeMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/outcomes", data);
      const outcome = await res.json();
      await apiRequest("POST", "/api/approvals", {
        type: "outcome_review",
        objectType: "outcome_contract",
        objectId: outcome.id,
        objectName: outcome.name,
        riskScore: data.riskTier === "HIGH" ? 8 : data.riskTier === "MEDIUM" ? 5 : 3,
        requestedBy: "system",
        status: "pending",
        evidencePackage: {
          proposedKpis: proposal?.kpis || [],
          proposedAgents: proposal?.proposedAgents || [],
          validationChecklist: proposal?.validationChecklist || [],
          outcomeContract: data,
          discoveryConversation: messages.length,
        },
      });
      return outcome;
    },
    onSuccess: (outcome: OutcomeContract) => {
      queryClient.invalidateQueries({ queryKey: ["/api/outcomes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
      toast({ title: "Outcome Contract created", description: `"${outcome.name}" has been sent for expert validation.` });
      navigate(`/outcomes/${outcome.id}`);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create outcome", description: err.message, variant: "destructive" });
    },
  });

  async function sendMessage(text?: string) {
    const msg = text || input.trim();
    if (!msg || streaming) return;
    const userMsg: ChatMessage = { role: "user", content: msg };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setStreaming(true);

    try {
      const res = await fetch("/api/ai/outcome-discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      });

      if (!res.ok) throw new Error("Discovery request failed");
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let assistantContent = "";
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        const lines = text.split("\n").filter((l) => l.startsWith("data: "));
        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.done) break;
            if (data.content) {
              assistantContent += data.content;
              const currentContent = assistantContent;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: currentContent };
                return updated;
              });
            }
          } catch {}
        }
      }

      const extracted = extractProposal(assistantContent);
      if (extracted) {
        setProposal(extracted);
        setCheckedItems(new Set());
      }
    } catch (err) {
      toast({ title: "Discovery assistant error", description: "Please try again.", variant: "destructive" });
    } finally {
      setStreaming(false);
    }
  }

  function handleAcceptProposal() {
    if (!proposal) return;
    createOutcomeMutation.mutate({
      name: proposal.outcomeContract.name,
      description: proposal.outcomeContract.description,
      riskTier: proposal.outcomeContract.riskTier,
      pricingModel: proposal.outcomeContract.pricingModel,
      pricePerUnit: proposal.outcomeContract.pricePerUnit,
      riskThreshold: proposal.outcomeContract.riskThreshold,
      maxDriftPercent: proposal.outcomeContract.maxDriftPercent,
    });
  }

  function toggleCheckItem(idx: number) {
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  const allChecked = proposal ? checkedItems.size === proposal.validationChecklist.length : false;

  return (
    <div className="flex flex-col h-full" data-testid="page-outcome-discover">
      {messages.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-8 max-w-2xl mx-auto">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
              <Sparkles className="w-7 h-7 text-primary" />
            </div>
            <h1 className="text-2xl font-semibold" data-testid="text-discover-title">What business outcome do you want to achieve?</h1>
            <p className="text-muted-foreground text-sm max-w-md">
              Describe your business challenge in plain language. The platform will map your workflows, propose AI agent roles, define success metrics, and draft an Outcome Contract.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
            {STARTER_PROMPTS.map((sp, i) => (
              <Card
                key={i}
                className="hover-elevate cursor-pointer"
                onClick={() => sendMessage(sp.prompt)}
                data-testid={`card-starter-${i}`}
              >
                <CardContent className="flex items-start gap-3 p-4">
                  <sp.icon className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <div className="flex flex-col gap-1 min-w-0">
                    <span className="text-sm font-medium">{sp.label}</span>
                    <span className="text-xs text-muted-foreground line-clamp-2">{sp.prompt}</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex items-center gap-2 w-full max-w-lg">
            <Textarea
              placeholder="Describe your business goal or challenge..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              className="resize-none text-sm"
              rows={2}
              data-testid="input-discover-message"
            />
            <Button
              size="icon"
              onClick={() => sendMessage()}
              disabled={!input.trim()}
              data-testid="button-send-discover"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col lg:flex-row min-h-0">
          <div className="flex-1 flex flex-col min-h-0 min-w-0">
            <div className="flex items-center gap-2 p-4 border-b shrink-0 flex-wrap">
              <Sparkles className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-medium">Outcome Discovery</h2>
              {proposal && <Badge variant="outline" className="text-[10px] text-green-600 dark:text-green-400">Proposal Ready</Badge>}
            </div>

            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`rounded-md px-3 py-2 max-w-[85%] ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                    data-testid={`chat-message-${i}`}
                  >
                    {msg.role === "assistant" ? renderMessageContent(msg.content) : (
                      <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                    )}
                  </div>
                </div>
              ))}
              {streaming && messages[messages.length - 1]?.content === "" && (
                <div className="flex items-center gap-2 text-muted-foreground text-xs">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Analyzing your business goals...
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="border-t p-4 flex items-center gap-2 shrink-0">
              <Input
                placeholder="Tell me more about your goals..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                disabled={streaming}
                data-testid="input-discover-chat"
              />
              <Button
                size="icon"
                onClick={() => sendMessage()}
                disabled={streaming || !input.trim()}
                data-testid="button-send-discover-chat"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {proposal && (
            <div className="lg:w-[420px] border-t lg:border-t-0 lg:border-l overflow-y-auto shrink-0" data-testid="panel-proposal">
              <div className="p-4 border-b">
                <h3 className="text-sm font-semibold flex items-center gap-2 flex-wrap">
                  <Target className="w-4 h-4 text-primary" />
                  Outcome Proposal
                </h3>
              </div>

              <div className="p-4 flex flex-col gap-4">
                <Card>
                  <CardHeader className="p-3 pb-1">
                    <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 flex-wrap">
                      <Target className="w-3.5 h-3.5" />
                      Outcome Contract
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0 flex flex-col gap-2">
                    <span className="text-sm font-semibold" data-testid="text-proposal-name">{proposal.outcomeContract.name}</span>
                    <span className="text-xs text-muted-foreground">{proposal.outcomeContract.description}</span>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">{proposal.outcomeContract.riskTier} Risk</Badge>
                      <Badge variant="outline" className="text-[10px]">{proposal.outcomeContract.pricingModel.replace(/_/g, " ")}</Badge>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="p-3 pb-1">
                    <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 flex-wrap">
                      <BarChart3 className="w-3.5 h-3.5" />
                      Success Metrics ({proposal.kpis.length} KPIs)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0 flex flex-col gap-2">
                    {proposal.kpis.map((kpi, i) => (
                      <div key={i} className="flex flex-col gap-1 p-2 rounded-md bg-muted/50" data-testid={`kpi-proposal-${i}`}>
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-xs font-medium">{kpi.name}</span>
                          <Badge variant="outline" className="text-[10px]">Target: {kpi.target}{kpi.unit}</Badge>
                        </div>
                        <span className="text-[11px] text-muted-foreground">{kpi.measurement}</span>
                        {kpi.currentBaseline !== null && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] text-muted-foreground">Current: {kpi.currentBaseline}{kpi.unit}</span>
                            <ArrowRight className="w-3 h-3 text-muted-foreground" />
                            <span className="text-[10px] text-green-600 dark:text-green-400">Target: {kpi.target}{kpi.unit}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="p-3 pb-1">
                    <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 flex-wrap">
                      <Bot className="w-3.5 h-3.5" />
                      Proposed Agents ({proposal.proposedAgents.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0 flex flex-col gap-2">
                    {proposal.proposedAgents.map((agent, i) => (
                      <div key={i} className="flex flex-col gap-1.5 p-2 rounded-md bg-muted/50" data-testid={`agent-proposal-${i}`}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold">{agent.name}</span>
                          <Badge variant="outline" className="text-[10px]">{agent.autonomyMode}</Badge>
                        </div>
                        <span className="text-[11px] text-muted-foreground">{agent.description}</span>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] font-medium text-muted-foreground">Workflow:</span>
                          <div className="flex items-center gap-1 flex-wrap">
                            {agent.workflowSteps.map((step, j) => (
                              <span key={j} className="flex items-center gap-0.5">
                                {j > 0 && <ChevronRight className="w-2.5 h-2.5 text-muted-foreground" />}
                                <Badge variant="secondary" className="text-[9px]">{step}</Badge>
                              </span>
                            ))}
                          </div>
                        </div>
                        <span className="text-[10px] text-green-600 dark:text-green-400">{agent.estimatedImpact}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="p-3 pb-1">
                    <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 flex-wrap">
                      <ClipboardCheck className="w-3.5 h-3.5" />
                      Validation Checklist
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0 flex flex-col gap-1.5">
                    {proposal.validationChecklist.map((item, i) => (
                      <label
                        key={i}
                        className="flex items-start gap-2 p-1.5 rounded-md cursor-pointer hover-elevate"
                        data-testid={`check-validation-${i}`}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 accent-primary"
                          checked={checkedItems.has(i)}
                          onChange={() => toggleCheckItem(i)}
                        />
                        <span className={`text-xs ${checkedItems.has(i) ? "line-through text-muted-foreground" : ""}`}>{item}</span>
                      </label>
                    ))}
                    <div className="mt-1">
                      <Progress value={(checkedItems.size / proposal.validationChecklist.length) * 100} className="h-1.5" />
                      <span className="text-[10px] text-muted-foreground">{checkedItems.size}/{proposal.validationChecklist.length} validated</span>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex flex-col gap-2">
                  <Button
                    onClick={handleAcceptProposal}
                    disabled={createOutcomeMutation.isPending}
                    className="w-full"
                    data-testid="button-accept-proposal"
                  >
                    {createOutcomeMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    ) : (
                      <CheckCircle className="w-4 h-4 mr-1.5" />
                    )}
                    Create Outcome Contract
                  </Button>
                  <p className="text-[10px] text-center text-muted-foreground">
                    {allChecked
                      ? "All validation items confirmed — ready to create"
                      : `${proposal.validationChecklist.length - checkedItems.size} validation items remaining (optional)`}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}