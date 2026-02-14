import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Send,
  Plus,
  Trash2,
  Bot,
  User,
  Settings2,
  MessageSquare,
  Loader2,
  ChevronRight,
  Shield,
  Zap,
  Wrench,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Gauge,
  ThumbsUp,
  ThumbsDown,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  Target,
} from "lucide-react";
import type { Agent } from "@shared/schema";

interface PlaygroundSession {
  id: number;
  title: string;
  agentId: string;
  createdAt: string;
}

interface ChatMessage {
  id: number;
  conversationId: number;
  role: string;
  content: string;
  createdAt: string;
}

interface RiskAssessment {
  title: string;
  score: number;
  level: string;
  factors: Array<{ name: string; impact: string; detail: string }>;
}

interface Decision {
  title: string;
  outcome: string;
  confidence: number;
  reasoning: string[];
  conditions?: string[];
}

interface ApprovalRequired {
  action: string;
  risk_level: string;
  reason: string;
  details: string;
}

interface ParsedSegment {
  type: "text" | "risk_assessment" | "decision" | "approval_required";
  content: string;
  data?: RiskAssessment | Decision | ApprovalRequired;
}

function parseStructuredBlocks(text: string): ParsedSegment[] {
  const segments: ParsedSegment[] = [];
  const blockRegex = /```(risk_assessment|decision|approval_required)\s*\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = blockRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const before = text.slice(lastIndex, match.index).trim();
      if (before) segments.push({ type: "text", content: before });
    }
    try {
      const data = JSON.parse(match[2].trim());
      segments.push({ type: match[1] as ParsedSegment["type"], content: match[2], data });
    } catch {
      segments.push({ type: "text", content: match[0] });
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex).trim();
    if (remaining) segments.push({ type: "text", content: remaining });
  }

  return segments.length > 0 ? segments : [{ type: "text", content: text }];
}

export default function AgentPlayground() {
  const { id: agentId } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [pendingUserMsg, setPendingUserMsg] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: agent, isLoading: agentLoading } = useQuery<Agent>({
    queryKey: ["/api/agents", agentId],
  });

  const { data: sessions = [], isLoading: sessionsLoading } = useQuery<PlaygroundSession[]>({
    queryKey: [`/api/agents/${agentId}/playground/sessions`],
    enabled: !!agentId,
  });

  const { data: messages = [], isLoading: messagesLoading } = useQuery<ChatMessage[]>({
    queryKey: [`/api/agents/${agentId}/playground/sessions/${activeSessionId}/messages`],
    enabled: !!activeSessionId,
  });

  const createSession = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/agents/${agentId}/playground/sessions`);
      return res.json();
    },
    onSuccess: (data: PlaygroundSession) => {
      queryClient.invalidateQueries({ queryKey: [`/api/agents/${agentId}/playground/sessions`] });
      setActiveSessionId(data.id);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create session", description: err.message, variant: "destructive" });
    },
  });

  const deleteSession = useMutation({
    mutationFn: async (sessionId: number) => {
      await apiRequest("DELETE", `/api/agents/${agentId}/playground/sessions/${sessionId}`);
    },
    onSuccess: (_: unknown, sessionId: number) => {
      queryClient.invalidateQueries({ queryKey: [`/api/agents/${agentId}/playground/sessions`] });
      if (activeSessionId === sessionId) {
        setActiveSessionId(null);
      }
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  const sendMessage = useCallback(async (overrideContent?: string) => {
    const msgToSend = overrideContent || inputValue.trim();
    if (!msgToSend || !activeSessionId || isStreaming) return;
    if (!overrideContent) setInputValue("");
    setPendingUserMsg(msgToSend);
    setIsStreaming(true);
    setStreamingContent("");

    try {
      const response = await fetch(`/api/agents/${agentId}/playground/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Role": localStorage.getItem("almp-role") || "admin",
        },
        body: JSON.stringify({ content: msgToSend, sessionId: activeSessionId }),
      });

      if (!response.ok) {
        throw new Error(`Failed: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const payload = JSON.parse(line.slice(6));
              if (payload.content) {
                accumulated += payload.content;
                setStreamingContent(accumulated);
              }
              if (payload.error) {
                toast({ title: "Error", description: payload.error, variant: "destructive" });
              }
            } catch {}
          }
        }
      }

      queryClient.invalidateQueries({
        queryKey: [`/api/agents/${agentId}/playground/sessions/${activeSessionId}/messages`],
      });
    } catch (err: any) {
      toast({ title: "Chat error", description: err.message, variant: "destructive" });
    } finally {
      setIsStreaming(false);
      setStreamingContent("");
      setPendingUserMsg(null);
    }
  }, [inputValue, activeSessionId, isStreaming, agentId, toast]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleApprovalAction = (action: string, approved: boolean) => {
    const response = approved
      ? `APPROVED: I approve the action "${action}". Please proceed.`
      : `REJECTED: I reject the action "${action}". Do not proceed.`;
    sendMessage(response);
  };

  const riskColor = (tier: string) => {
    switch (tier?.toUpperCase()) {
      case "LOW": return "text-green-600 dark:text-green-400";
      case "MEDIUM": return "text-yellow-600 dark:text-yellow-400";
      case "HIGH": return "text-orange-600 dark:text-orange-400";
      case "CRITICAL": return "text-red-600 dark:text-red-400";
      default: return "text-muted-foreground";
    }
  };

  if (agentLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertTriangle className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">Agent not found</p>
        <Link href="/agents">
          <Button variant="outline" data-testid="link-back-agents">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Agents
          </Button>
        </Link>
      </div>
    );
  }

  const tools = Array.isArray(agent.toolsConfig) ? (agent.toolsConfig as Array<{ name?: string; description?: string }>) : [];
  const compliance = Array.isArray(agent.complianceTags) ? agent.complianceTags : [];
  const policies = Array.isArray(agent.policyBindings) ? (agent.policyBindings as Array<{ policyName?: string; enforcement?: string }>) : [];

  return (
    <div className="flex h-full" data-testid="agent-playground">
      <div className="flex flex-col w-64 border-r bg-muted/30 shrink-0">
        <div className="p-3 border-b">
          <Link href={`/agents/${agentId}`}>
            <Button variant="ghost" size="sm" className="w-full justify-start gap-2 mb-2" data-testid="link-back-agent">
              <ArrowLeft className="h-4 w-4" />
              Back to Agent
            </Button>
          </Link>
          <Button
            onClick={() => createSession.mutate()}
            disabled={createSession.isPending}
            className="w-full gap-2"
            size="sm"
            data-testid="button-new-session"
          >
            {createSession.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            New Session
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {sessionsLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))
            ) : sessions.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No sessions yet</p>
            ) : (
              sessions.map((s) => (
                <div
                  key={s.id}
                  className={`group flex items-center gap-2 rounded-md px-2 py-2 text-sm cursor-pointer hover-elevate ${
                    activeSessionId === s.id ? "bg-accent" : ""
                  }`}
                  onClick={() => setActiveSessionId(s.id)}
                  data-testid={`session-item-${s.id}`}
                >
                  <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate flex-1 text-foreground">
                    {new Date(s.createdAt).toLocaleString(undefined, {
                      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                    })}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 invisible group-hover:visible shrink-0"
                    onClick={(e) => { e.stopPropagation(); deleteSession.mutate(s.id); }}
                    data-testid={`button-delete-session-${s.id}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        <div className="p-3 border-t">
          <Button
            variant="ghost"
            size="sm"
            className={`w-full justify-start gap-2 ${showConfig ? "bg-accent" : ""}`}
            onClick={() => setShowConfig(!showConfig)}
            data-testid="button-toggle-config"
          >
            <Settings2 className="h-4 w-4" />
            Agent Config
          </Button>
        </div>
      </div>

      <div className="flex flex-1 flex-col min-w-0">
        <div className="flex items-center gap-3 px-4 py-2 border-b">
          <Bot className="h-5 w-5 text-primary" />
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold truncate" data-testid="text-agent-name">{agent.name}</h2>
            <p className="text-xs text-muted-foreground truncate">{agent.description || "Agent Playground"}</p>
          </div>
          <Badge variant="outline" className={riskColor(agent.riskTier)} data-testid="badge-risk-tier">
            <Shield className="h-3 w-3 mr-1" />
            {agent.riskTier}
          </Badge>
          <Badge variant="secondary" data-testid="badge-autonomy">
            <Zap className="h-3 w-3 mr-1" />
            {agent.autonomyMode}
          </Badge>
        </div>

        {!activeSessionId ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-muted-foreground">
            <Bot className="h-16 w-16 opacity-30" />
            <div className="text-center space-y-2">
              <p className="text-lg font-medium text-foreground">Agent Playground</p>
              <p className="text-sm max-w-md">
                Test {agent.name} in a live conversation. Create a new session to begin chatting with this agent using its configured tools, policies, and behavior.
              </p>
            </div>
            <Button
              onClick={() => createSession.mutate()}
              disabled={createSession.isPending}
              className="gap-2"
              data-testid="button-start-session"
            >
              {createSession.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Start New Session
            </Button>
          </div>
        ) : (
          <>
            <ScrollArea className="flex-1 px-4 py-3">
              {messagesLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className={`flex gap-3 ${i % 2 === 0 ? "" : "justify-end"}`}>
                      <Skeleton className="h-16 w-3/4 rounded-lg" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-4 max-w-3xl mx-auto">
                  {messages.length === 0 && !isStreaming && (
                    <div className="text-center py-12 text-muted-foreground">
                      <Bot className="h-10 w-10 mx-auto mb-3 opacity-40" />
                      <p className="text-sm">Send a message to start the conversation</p>
                    </div>
                  )}

                  {messages.map((msg) => (
                    <MessageBubble
                      key={msg.id}
                      role={msg.role}
                      content={msg.content}
                      agentName={agent.name}
                      onApproval={handleApprovalAction}
                      isStreaming={false}
                      canInteract={!isStreaming}
                    />
                  ))}

                  {pendingUserMsg && (
                    <MessageBubble role="user" content={pendingUserMsg} agentName={agent.name} onApproval={handleApprovalAction} canInteract={false} />
                  )}

                  {isStreaming && streamingContent && (
                    <MessageBubble role="assistant" content={streamingContent} agentName={agent.name} isStreaming onApproval={handleApprovalAction} canInteract={false} />
                  )}

                  {isStreaming && !streamingContent && (
                    <div className="flex gap-3">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Bot className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {agent.name} is thinking...
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>

            <div className="border-t px-4 py-3">
              <div className="max-w-3xl mx-auto flex gap-2">
                <Textarea
                  ref={textareaRef}
                  placeholder={`Message ${agent.name}...`}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isStreaming}
                  className="min-h-[44px] max-h-[120px] resize-none"
                  rows={1}
                  data-testid="input-chat-message"
                />
                <Button
                  onClick={() => sendMessage()}
                  disabled={!inputValue.trim() || isStreaming}
                  size="icon"
                  data-testid="button-send-message"
                >
                  {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {showConfig && (
        <div className="w-72 border-l bg-muted/20 shrink-0 overflow-auto">
          <div className="p-4 space-y-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              Agent Configuration
            </h3>
            <Separator />

            <ConfigSection title="Model" icon={<Bot className="h-3.5 w-3.5" />}>
              <p className="text-xs text-muted-foreground">{agent.modelProvider || "openai"} / {agent.modelName || "gpt-4.1"}</p>
            </ConfigSection>

            <ConfigSection title="Risk & Autonomy" icon={<Shield className="h-3.5 w-3.5" />}>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={riskColor(agent.riskTier)}>{agent.riskTier}</Badge>
                <Badge variant="secondary">{agent.autonomyMode}</Badge>
              </div>
            </ConfigSection>

            {tools.length > 0 && (
              <ConfigSection title={`Tools (${tools.length})`} icon={<Wrench className="h-3.5 w-3.5" />}>
                <div className="space-y-1">
                  {tools.map((t, i) => (
                    <div key={i} className="text-xs">
                      <span className="font-medium text-foreground">{t.name || `Tool ${i + 1}`}</span>
                      {t.description && <span className="text-muted-foreground ml-1">- {t.description}</span>}
                    </div>
                  ))}
                </div>
              </ConfigSection>
            )}

            {compliance.length > 0 && (
              <ConfigSection title="Compliance" icon={<Shield className="h-3.5 w-3.5" />}>
                <div className="flex flex-wrap gap-1">
                  {compliance.map((tag, i) => (
                    <Badge key={i} variant="outline" className="text-xs">{tag}</Badge>
                  ))}
                </div>
              </ConfigSection>
            )}

            {policies.length > 0 && (
              <ConfigSection title={`Policies (${policies.length})`} icon={<AlertTriangle className="h-3.5 w-3.5" />}>
                <div className="space-y-1">
                  {policies.map((p, i) => (
                    <div key={i} className="text-xs flex items-center gap-1">
                      <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span>{p.policyName || `Policy ${i + 1}`}</span>
                      <Badge variant="secondary" className="text-[10px] ml-auto">{p.enforcement || "soft"}</Badge>
                    </div>
                  ))}
                </div>
              </ConfigSection>
            )}

            <ConfigSection title="Version" icon={<Clock className="h-3.5 w-3.5" />}>
              <p className="text-xs text-muted-foreground">v{agent.currentVersion || "1.0.0"}</p>
            </ConfigSection>
          </div>
        </div>
      )}
    </div>
  );
}

function RiskGauge({ score, level }: { score: number; level: string }) {
  const clampedScore = Math.max(0, Math.min(100, score));
  const rotation = (clampedScore / 100) * 180 - 90;
  const colorMap: Record<string, string> = {
    low: "text-green-500",
    medium: "text-yellow-500",
    high: "text-orange-500",
    critical: "text-red-500",
  };
  const bgColorMap: Record<string, string> = {
    low: "from-green-500/20 to-green-500/5",
    medium: "from-yellow-500/20 to-yellow-500/5",
    high: "from-orange-500/20 to-orange-500/5",
    critical: "from-red-500/20 to-red-500/5",
  };
  const color = colorMap[level] || colorMap.medium;
  const bgGradient = bgColorMap[level] || bgColorMap.medium;

  return (
    <div className={`flex flex-col items-center gap-1 rounded-lg p-3 bg-gradient-to-b ${bgGradient}`} data-testid="risk-gauge">
      <div className="relative w-24 h-14 overflow-hidden">
        <svg viewBox="0 0 120 70" className="w-full h-full">
          <path d="M 10 65 A 50 50 0 0 1 110 65" fill="none" stroke="currentColor" strokeWidth="8" className="text-muted/30" strokeLinecap="round" />
          <path
            d="M 10 65 A 50 50 0 0 1 110 65"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            className={color}
            strokeLinecap="round"
            strokeDasharray={`${clampedScore * 1.57} 157`}
          />
          <line
            x1="60" y1="65" x2="60" y2="25"
            stroke="currentColor"
            strokeWidth="2"
            className={color}
            transform={`rotate(${rotation}, 60, 65)`}
          />
          <circle cx="60" cy="65" r="4" fill="currentColor" className={color} />
        </svg>
      </div>
      <span className={`text-2xl font-bold ${color}`}>{clampedScore}</span>
      <span className="text-xs text-muted-foreground uppercase tracking-wide">{level} risk</span>
    </div>
  );
}

function RiskAssessmentCard({ data }: { data: RiskAssessment }) {
  const [expanded, setExpanded] = useState(true);
  return (
    <Card className="my-2" data-testid="card-risk-assessment">
      <CardHeader className="py-2 px-3 flex flex-row items-center gap-2 justify-between">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm">{data.title || "Risk Assessment"}</CardTitle>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setExpanded(!expanded)} data-testid="button-toggle-risk-details">
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </Button>
      </CardHeader>
      <CardContent className="px-3 pb-3 pt-0">
        <RiskGauge score={data.score} level={(data.level || "medium").toLowerCase()} />
        {expanded && data.factors && data.factors.length > 0 && (
          <div className="mt-3 space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Risk Factors</p>
            {data.factors.map((f, i) => {
              const impactIcon = f.impact === "positive"
                ? <CheckCircle className="h-3 w-3 text-green-500 shrink-0" />
                : f.impact === "negative"
                ? <XCircle className="h-3 w-3 text-red-500 shrink-0" />
                : <Target className="h-3 w-3 text-muted-foreground shrink-0" />;
              return (
                <div key={i} className="flex items-start gap-2 text-xs" data-testid={`risk-factor-${i}`}>
                  {impactIcon}
                  <div>
                    <span className="font-medium text-foreground">{f.name}</span>
                    <span className="text-muted-foreground ml-1">— {f.detail}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DecisionCard({ data }: { data: Decision }) {
  const [expanded, setExpanded] = useState(true);
  const outcomeConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof CheckCircle }> = {
    approved: { label: "Approved", variant: "default", icon: CheckCircle },
    rejected: { label: "Rejected", variant: "destructive", icon: XCircle },
    review_required: { label: "Review Required", variant: "secondary", icon: ShieldAlert },
    escalated: { label: "Escalated", variant: "outline", icon: AlertTriangle },
  };
  const normalizedOutcome = (data.outcome || "review_required").toLowerCase();
  const config = outcomeConfig[normalizedOutcome] || outcomeConfig.review_required;
  const OutcomeIcon = config.icon;

  return (
    <Card className="my-2" data-testid="card-decision">
      <CardHeader className="py-2 px-3 flex flex-row items-center gap-2 justify-between">
        <div className="flex items-center gap-2">
          <OutcomeIcon className="h-4 w-4" />
          <CardTitle className="text-sm">{data.title || "Decision"}</CardTitle>
          <Badge variant={config.variant} data-testid="badge-decision-outcome">{config.label}</Badge>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setExpanded(!expanded)} data-testid="button-toggle-decision-details">
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </Button>
      </CardHeader>
      {expanded && (
        <CardContent className="px-3 pb-3 pt-0 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Confidence:</span>
            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.min(100, data.confidence)}%` }}
              />
            </div>
            <span className="text-xs font-medium">{data.confidence}%</span>
          </div>
          {data.reasoning && data.reasoning.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Reasoning</p>
              {data.reasoning.map((r, i) => (
                <div key={i} className="flex items-start gap-2 text-xs" data-testid={`reasoning-${i}`}>
                  <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                  <span>{r}</span>
                </div>
              ))}
            </div>
          )}
          {data.conditions && data.conditions.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Conditions</p>
              {data.conditions.map((c, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-yellow-600 dark:text-yellow-400">
                  <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                  <span>{c}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function ApprovalGateCard({
  data,
  onApproval,
  canInteract,
}: {
  data: ApprovalRequired;
  onApproval: (action: string, approved: boolean) => void;
  canInteract: boolean;
}) {
  const normalizedRiskLevel = (data.risk_level || "medium").toLowerCase();
  const levelBg: Record<string, string> = {
    low: "bg-green-500/10",
    medium: "bg-yellow-500/10",
    high: "bg-orange-500/10",
    critical: "bg-red-500/10",
  };
  const cardBg = levelBg[normalizedRiskLevel] || levelBg.medium;

  return (
    <Card className={`my-2 ${cardBg}`} data-testid="card-approval-gate">
      <CardHeader className="py-2 px-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-yellow-500" />
          <CardTitle className="text-sm">Human Approval Required</CardTitle>
          <Badge variant="outline" className="text-xs uppercase">{data.risk_level}</Badge>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3 pt-0 space-y-2">
        <div className="text-sm">
          <span className="font-medium text-foreground">Action: </span>
          <span>{data.action}</span>
        </div>
        <div className="text-xs text-muted-foreground">{data.reason}</div>
        {data.details && (
          <div className="text-xs bg-muted/50 rounded-md p-2">{data.details}</div>
        )}
        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            onClick={() => onApproval(data.action, true)}
            disabled={!canInteract}
            className="gap-1"
            data-testid="button-approve"
          >
            <ThumbsUp className="h-3 w-3" />
            Approve
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => onApproval(data.action, false)}
            disabled={!canInteract}
            className="gap-1"
            data-testid="button-reject"
          >
            <ThumbsDown className="h-3 w-3" />
            Reject
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function MessageBubble({
  role,
  content,
  agentName,
  isStreaming,
  onApproval,
  canInteract,
}: {
  role: string;
  content: string;
  agentName: string;
  isStreaming?: boolean;
  onApproval: (action: string, approved: boolean) => void;
  canInteract: boolean;
}) {
  const isUser = role === "user";
  const segments = isUser ? [{ type: "text" as const, content }] : parseStructuredBlocks(content);

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`} data-testid={`message-${role}`}>
      <div
        className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
          isUser ? "bg-primary text-primary-foreground" : "bg-primary/10"
        }`}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4 text-primary" />}
      </div>
      <div className={`max-w-[75%] space-y-1 ${isUser ? "items-end" : ""}`}>
        {segments.map((seg, i) => {
          if (seg.type === "risk_assessment" && seg.data) {
            return <RiskAssessmentCard key={i} data={seg.data as RiskAssessment} />;
          }
          if (seg.type === "decision" && seg.data) {
            return <DecisionCard key={i} data={seg.data as Decision} />;
          }
          if (seg.type === "approval_required" && seg.data) {
            return <ApprovalGateCard key={i} data={seg.data as ApprovalRequired} onApproval={onApproval} canInteract={canInteract} />;
          }
          return (
            <div
              key={i}
              className={`rounded-lg px-3 py-2 text-sm leading-relaxed ${
                isUser ? "bg-primary text-primary-foreground" : "bg-muted"
              }`}
            >
              <div className="whitespace-pre-wrap break-words">{seg.content}</div>
            </div>
          );
        })}
        {isStreaming && (
          <span className="inline-block w-1.5 h-4 bg-current opacity-70 animate-pulse ml-0.5 align-text-bottom" />
        )}
      </div>
    </div>
  );
}

function ConfigSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <h4 className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 uppercase tracking-wide">
        {icon}
        {title}
      </h4>
      {children}
    </div>
  );
}
