import { useState, useRef, useEffect, useCallback, useMemo } from "react";
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
import { Switch } from "@/components/ui/switch";
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
  Globe,
  ExternalLink,
  BookOpen,
  Columns2,
  Sparkles,
  Search,
  Brain,
  Activity,
  ListChecks,
} from "lucide-react";
import type { Agent } from "@shared/schema";

const COMPLIANCE_DESCRIPTIONS: Record<string, string> = {
  TILA: "Truth in Lending Act",
  ECOA: "Equal Credit Opportunity Act",
  FCRA: "Fair Credit Reporting Act",
  HMDA: "Home Mortgage Disclosure Act",
  SOC2: "SOC 2 Trust Services",
  GDPR: "Data Protection (EU)",
  "PII-Handler": "PII Protection Protocol",
  DOT: "Transportation Regulations",
  IATA: "Aviation Standards",
};

const AUTONOMY_DESCRIPTIONS: Record<string, string> = {
  manual: "All actions require explicit human approval before execution",
  assisted: "Agent suggests actions but waits for human confirmation",
  supervised: "Agent acts autonomously with human oversight and intervention capability",
  autonomous: "Agent operates independently with full decision-making authority",
};

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

interface Citation {
  url: string;
  title: string;
}

interface CitationAnnotation {
  url: string;
  title: string;
  tags: string[];
}

interface ParsedSegment {
  type: "text" | "risk_assessment" | "decision" | "approval_required";
  content: string;
  data?: RiskAssessment | Decision | ApprovalRequired;
  citations?: Citation[];
}

type ProgressEventType = "discovery" | "planning" | "tool_call_start" | "tool_call_result" | "llm_thinking" | "iteration_complete" | "final_analysis" | "compliance_check" | "error";

interface ProgressEvent {
  type: ProgressEventType;
  timestamp: string;
  [key: string]: unknown;
}

interface ExecutionTraceData {
  events: ProgressEvent[];
  startedAt?: string;
  completedAt?: string;
}

const PROGRESS_LABELS: Record<ProgressEventType, { label: string; icon: typeof Search }> = {
  discovery: { label: "Discovering tools", icon: Search },
  planning: { label: "Planning execution", icon: Brain },
  tool_call_start: { label: "Calling tool", icon: Wrench },
  tool_call_result: { label: "Tool result", icon: Activity },
  llm_thinking: { label: "Analyzing", icon: Brain },
  iteration_complete: { label: "Iteration complete", icon: CheckCircle },
  final_analysis: { label: "Final analysis", icon: Sparkles },
  compliance_check: { label: "Compliance check", icon: Shield },
  error: { label: "Error", icon: AlertTriangle },
};

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

function extractCitationsFromText(text: string): Citation[] {
  const citations: Citation[] = [];
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let m;
  while ((m = linkRegex.exec(text)) !== null) {
    citations.push({ title: m[1], url: m[2] });
  }
  return citations;
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
  const [compareMode, setCompareMode] = useState(false);
  const [genericStreamingContent, setGenericStreamingContent] = useState("");
  const [genericMessages, setGenericMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [annotatedCitations, setAnnotatedCitations] = useState<CitationAnnotation[]>([]);
  const [progressEvents, setProgressEvents] = useState<ProgressEvent[]>([]);
  const [currentProgressLabel, setCurrentProgressLabel] = useState<string>("");
  const [executionTraces, setExecutionTraces] = useState<Map<number, ExecutionTraceData>>(new Map());
  const [nextTraceId, setNextTraceId] = useState(0);
  const prevSessionRef = useRef<number | null>(null);
  if (prevSessionRef.current !== activeSessionId) {
    prevSessionRef.current = activeSessionId;
    if (executionTraces.size > 0) {
      setExecutionTraces(new Map());
      setNextTraceId(0);
      setProgressEvents([]);
      setCurrentProgressLabel("");
    }
  }
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const genericMessagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: agent, isLoading: agentLoading } = useQuery<Agent>({
    queryKey: ["/api/agents", agentId],
  });

  const agentOntologyTags = useMemo(() => {
    if (!agent?.ontologyTags) return [] as Array<{ conceptId: string; conceptLabel: string }>;
    return Array.isArray(agent.ontologyTags)
      ? (agent.ontologyTags as Array<{ conceptId: string; conceptLabel: string }>)
      : [];
  }, [agent?.ontologyTags]);

  const ontologyLabelMap = useMemo(() => {
    const labelMap: Record<string, { displayLabel: string; conceptLabel: string }> = {};
    if (agentOntologyTags.length === 0) return labelMap;

    const toolsCfg = Array.isArray(agent?.toolsConfig)
      ? (agent.toolsConfig as Array<{ name?: string; description?: string; parameters?: Array<{ name: string; enrichedFrom?: string }> }>)
      : [];

    const conceptsByLabel: Record<string, { label: string }> = {};
    for (const tag of agentOntologyTags) {
      conceptsByLabel[tag.conceptLabel.toLowerCase()] = { label: tag.conceptLabel };
    }

    const verbMap: Record<string, string> = {
      search: "searched",
      query: "queried",
      read: "retrieved data from",
      write: "updated",
      update: "updated",
      create: "created record in",
      send: "sent via",
      execute: "executed on",
      deploy: "deployed to",
      process: "processed via",
      extract: "extracted from",
      get: "retrieved from",
      fetch: "fetched from",
      delete: "removed from",
      validate: "validated against",
      check: "checked via",
    };

    for (const tool of toolsCfg) {
      if (!tool.name) continue;
      const rawName = tool.name;
      const nameParts = rawName.toLowerCase().split("_");

      let bestMatch: { label: string } | null = null;
      let matchedVerb = "";

      const enrichedConcepts = (tool.parameters || [])
        .filter(p => p.enrichedFrom)
        .map(p => p.enrichedFrom!);
      if (enrichedConcepts.length > 0) {
        const conceptName = enrichedConcepts[0];
        const found = conceptsByLabel[conceptName.toLowerCase()];
        if (found) bestMatch = found;
      }

      if (!bestMatch) {
        for (const part of nameParts) {
          if (conceptsByLabel[part]) {
            bestMatch = conceptsByLabel[part];
            break;
          }
        }
      }

      if (!bestMatch) {
        const fullNoVerb = nameParts.slice(1).join(" ");
        if (conceptsByLabel[fullNoVerb]) {
          bestMatch = conceptsByLabel[fullNoVerb];
        }
      }

      if (!bestMatch) {
        for (const part of nameParts) {
          for (const [conceptKey, concept] of Object.entries(conceptsByLabel)) {
            if (part.length > 3 && (conceptKey.includes(part) || part.includes(conceptKey))) {
              bestMatch = concept;
              break;
            }
          }
          if (bestMatch) break;
        }
      }

      if (bestMatch) {
        for (const part of nameParts) {
          if (verbMap[part]) {
            matchedVerb = verbMap[part];
            break;
          }
        }
        const displayLabel = matchedVerb
          ? `${matchedVerb} ${bestMatch.label}`
          : bestMatch.label;
        labelMap[rawName] = { displayLabel, conceptLabel: bestMatch.label };
      }
    }

    return labelMap;
  }, [agentOntologyTags, agent?.toolsConfig]);

  const applyOntologyLabels = useCallback((text: string): string => {
    if (Object.keys(ontologyLabelMap).length === 0) return text;
    let result = text;
    const sortedKeys = Object.keys(ontologyLabelMap).sort((a, b) => b.length - a.length);
    for (const rawName of sortedKeys) {
      const { displayLabel, conceptLabel } = ontologyLabelMap[rawName];
      const escaped = rawName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`\\b${escaped}\\b`, 'g');
      result = result.replace(pattern, `${displayLabel} [${conceptLabel}]`);
    }
    return result;
  }, [ontologyLabelMap]);

  const hasWebSearch = Array.isArray(agent?.toolsConfig) &&
    (agent.toolsConfig as Array<{ name?: string; type?: string }>).some(
      (t) => t.name === "web_search" && t.type === "builtin"
    );

  const toggleWebSearch = useMutation({
    mutationFn: async (enable: boolean) => {
      const currentTools = Array.isArray(agent?.toolsConfig)
        ? (agent.toolsConfig as Array<{ name?: string; type?: string; description?: string }>)
        : [];
      const withoutWebSearch = currentTools.filter((t) => t.name !== "web_search");
      const newTools = enable
        ? [...withoutWebSearch, { name: "web_search", type: "builtin", description: "Search the web for real-time information, news, and data" }]
        : withoutWebSearch;
      const res = await apiRequest("PATCH", `/api/agents/${agentId}`, { toolsConfig: newTools });
      return res.json();
    },
    onSuccess: (_: unknown, enabled: boolean) => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents", agentId] });
      toast({
        title: enabled ? "Web Search enabled" : "Web Search disabled",
        description: enabled
          ? "The agent can now search the web for real-time information."
          : "The agent will no longer search the web.",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update", description: err.message, variant: "destructive" });
    },
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
      setGenericMessages([]);
      setAnnotatedCitations([]);
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
        setGenericMessages([]);
        setAnnotatedCitations([]);
      }
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  useEffect(() => {
    genericMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [genericMessages, genericStreamingContent]);

  const sendMessage = useCallback(async (overrideContent?: string) => {
    const msgToSend = overrideContent || inputValue.trim();
    if (!msgToSend || !activeSessionId || isStreaming) return;
    if (!overrideContent) setInputValue("");
    setPendingUserMsg(msgToSend);
    setIsStreaming(true);
    setStreamingContent("");
    setGenericStreamingContent("");

    const compliance = Array.isArray(agent?.complianceTags) ? agent.complianceTags : [];
    const policies = Array.isArray(agent?.policyBindings) ? agent.policyBindings : [];
    const hasComplianceContext = compliance.length > 0 || policies.length > 0;

    const collectedProgressEvents: ProgressEvent[] = [];

    const streamResponse = async (
      url: string,
      body: object,
      onChunk: (accumulated: string) => void,
      onProgressEvent?: (event: ProgressEvent) => void,
    ): Promise<{ content: string; traceEvents: ProgressEvent[] }> => {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Role": localStorage.getItem("almp-role") || "admin",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`Failed: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let accumulated = "";
      const traceEvents: ProgressEvent[] = [];
      let lineBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        lineBuffer += text;
        const lines = lineBuffer.split("\n");
        lineBuffer = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const payload = JSON.parse(line.slice(6));

              if (payload.type && payload.type !== "complete" && !payload.done) {
                const progressEvent: ProgressEvent = {
                  type: payload.type as ProgressEventType,
                  timestamp: payload.timestamp || new Date().toISOString(),
                  ...payload,
                };
                traceEvents.push(progressEvent);
                if (onProgressEvent) {
                  onProgressEvent(progressEvent);
                }

                const config = PROGRESS_LABELS[payload.type as ProgressEventType];
                if (config) {
                  let label = config.label;
                  if (payload.type === "tool_call_start" && payload.tool) {
                    label = `Calling ${payload.tool}...`;
                  } else if (payload.type === "tool_call_result" && payload.tool) {
                    label = payload.success ? `${payload.tool} completed` : `${payload.tool} failed`;
                  } else if (payload.type === "discovery" && payload.toolCount) {
                    label = `Found ${payload.toolCount} tools`;
                  } else if (payload.type === "planning") {
                    label = "Planning execution...";
                  } else if (payload.type === "llm_thinking") {
                    label = `Analyzing (iteration ${payload.iteration || 1})...`;
                  } else if (payload.type === "final_analysis") {
                    label = "Generating response...";
                  } else if (payload.type === "compliance_check") {
                    label = payload.allPassed ? "Compliance checks passed" : "Compliance issues detected";
                  } else if (payload.type === "error") {
                    label = `Error: ${payload.message || "Unknown"}`;
                  }
                  setCurrentProgressLabel(label);
                }
              }

              if (payload.type === "complete" && payload.content) {
                accumulated = payload.content;
                onChunk(accumulated);
              } else if (payload.content && !payload.type) {
                accumulated += payload.content;
                onChunk(accumulated);
              }

              if (payload.error) {
                toast({ title: "Error", description: payload.error, variant: "destructive" });
              }
            } catch {}
          }
        }
      }

      return { content: accumulated, traceEvents };
    };

    try {
      const contextualizedPromise = streamResponse(
        `/api/agents/${agentId}/playground/chat`,
        { content: msgToSend, sessionId: activeSessionId },
        (acc) => setStreamingContent(acc),
        (event) => {
          collectedProgressEvents.push(event);
          setProgressEvents([...collectedProgressEvents]);
        },
      );

      let genericPromise: Promise<{ content: string; traceEvents: ProgressEvent[] }> | null = null;
      if (compareMode) {
        genericPromise = streamResponse(
          `/api/agents/${agentId}/playground/chat-generic`,
          { content: msgToSend, sessionId: activeSessionId },
          (acc) => setGenericStreamingContent(acc)
        );
      }

      const results = await Promise.all(
        [contextualizedPromise, genericPromise].filter(Boolean) as Promise<{ content: string; traceEvents: ProgressEvent[] }>[]
      );
      const contextualizedResult = results[0]?.content || "";

      if (compareMode && results[1] !== undefined) {
        setGenericMessages((prev) => [
          ...prev,
          { role: "user", content: msgToSend },
          { role: "assistant", content: results[1].content },
        ]);
      }

      const traceEvents = results[0]?.traceEvents || [];
      if (traceEvents.length > 0) {
        const traceId = nextTraceId;
        setNextTraceId((prev) => prev + 1);
        setExecutionTraces((prev) => {
          const newMap = new Map(prev);
          newMap.set(traceId, {
            events: traceEvents,
            startedAt: traceEvents[0]?.timestamp,
            completedAt: traceEvents[traceEvents.length - 1]?.timestamp,
          });
          return newMap;
        });
      }

      queryClient.invalidateQueries({
        queryKey: [`/api/agents/${agentId}/playground/sessions/${activeSessionId}/messages`],
      });

      if (hasWebSearch && hasComplianceContext && contextualizedResult) {
        const citations = extractCitationsFromText(contextualizedResult);
        if (citations.length > 0) {
          try {
            const annotRes = await fetch(`/api/agents/${agentId}/playground/chat-annotate-citations`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Role": localStorage.getItem("almp-role") || "admin",
              },
              body: JSON.stringify({ citations }),
            });
            if (annotRes.ok) {
              const annotData = await annotRes.json();
              if (annotData.annotations) {
                setAnnotatedCitations((prev) => [...prev, ...annotData.annotations]);
              }
            }
          } catch {}
        }
      }
    } catch (err: any) {
      toast({ title: "Chat error", description: err.message, variant: "destructive" });
    } finally {
      setIsStreaming(false);
      setStreamingContent("");
      setGenericStreamingContent("");
      setPendingUserMsg(null);
      setProgressEvents([]);
      setCurrentProgressLabel("");
    }
  }, [inputValue, activeSessionId, isStreaming, agentId, toast, compareMode, hasWebSearch, agent, nextTraceId]);

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
  const policies = Array.isArray(agent.policyBindings) ? (agent.policyBindings as Array<{ policyName?: string; enforcement?: string; description?: string }>) : [];
  const ontologyTags = agent.ontologyTags as Record<string, unknown> | null;
  const hasContextActive = compliance.length > 0 || policies.length > 0;

  const renderChatMessages = (
    msgList: Array<{ id?: number; role: string; content: string }>,
    streaming: boolean,
    streamContent: string,
    endRef: React.RefObject<HTMLDivElement>,
    showProgress?: boolean,
  ) => (
    <div className="space-y-4 max-w-3xl mx-auto">
      {msgList.length === 0 && !streaming && (
        <div className="text-center py-12 text-muted-foreground">
          <Bot className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Send a message to start the conversation</p>
        </div>
      )}

      {msgList.map((msg, idx) => (
        <MessageBubble
          key={msg.id || `generic-${idx}`}
          role={msg.role}
          content={msg.content}
          agentName={agent.name}
          onApproval={handleApprovalAction}
          isStreaming={false}
          canInteract={!isStreaming}
          annotations={annotatedCitations}
          transformText={applyOntologyLabels}
        />
      ))}

      {pendingUserMsg && (
        <MessageBubble role="user" content={pendingUserMsg} agentName={agent.name} onApproval={handleApprovalAction} canInteract={false} annotations={[]} transformText={applyOntologyLabels} />
      )}

      {streaming && streamContent && (
        <MessageBubble role="assistant" content={streamContent} agentName={agent.name} isStreaming onApproval={handleApprovalAction} canInteract={false} annotations={[]} transformText={applyOntologyLabels} />
      )}

      {streaming && !streamContent && (
        showProgress ? (
          <StreamingProgressIndicator
            agentName={agent.name}
            progressEvents={progressEvents}
            currentLabel={currentProgressLabel}
          />
        ) : (
          <div className="flex gap-3">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Thinking...
            </div>
          </div>
        )
      )}

      <div ref={endRef} />
    </div>
  );

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

      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2 border-b">
          <Bot className="h-5 w-5 text-primary shrink-0" />
          <h2 className="text-sm font-semibold truncate min-w-0" data-testid="text-agent-name">{agent.name}</h2>
          <div className="flex items-center gap-1.5 shrink-0 ml-auto">
            {hasContextActive && (
              <Badge variant="outline" data-testid="badge-context-active">
                <Sparkles className="h-3 w-3 mr-1" />
                Context
              </Badge>
            )}
            {hasWebSearch && (
              <Badge variant="outline" data-testid="badge-web-search">
                <Globe className="h-3 w-3 mr-1" />
                Web
              </Badge>
            )}
            <Badge variant="outline" className={riskColor(agent.riskTier)} data-testid="badge-risk-tier">
              <Shield className="h-3 w-3 mr-1" />
              {agent.riskTier}
            </Badge>
            <Button
              variant={compareMode ? "default" : "outline"}
              size="sm"
              onClick={() => setCompareMode(!compareMode)}
              data-testid="button-compare-mode"
            >
              <Columns2 className="h-3.5 w-3.5 mr-1" />
              Compare
            </Button>
          </div>
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
        ) : compareMode ? (
          <>
            <div className="flex flex-1 min-h-0">
              <div className="flex-1 flex flex-col min-w-0" data-testid="panel-contextualized">
                <div className="px-3 py-1.5 border-b bg-muted/30 flex items-center gap-2">
                  <Bot className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-medium truncate">{agent.name}</span>
                  <Badge variant="outline">Contextualized</Badge>
                </div>
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
                    renderChatMessages(messages, isStreaming, streamingContent, messagesEndRef, true)
                  )}
                </ScrollArea>
              </div>
              <Separator orientation="vertical" />
              <div className="flex-1 flex flex-col min-w-0" data-testid="panel-generic">
                <div className="px-3 py-1.5 border-b bg-muted/30 flex items-center gap-2">
                  <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium">Generic AI</span>
                  <Badge variant="secondary">No Context</Badge>
                </div>
                <ScrollArea className="flex-1 px-4 py-3">
                  {renderChatMessages(genericMessages, isStreaming, genericStreamingContent, genericMessagesEndRef, false)}
                </ScrollArea>
              </div>
            </div>
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

                  {messages.map((msg, idx) => {
                    const assistantIdx = messages.filter((m, i) => m.role === "assistant" && i <= idx).length - 1;
                    const trace = msg.role === "assistant" ? executionTraces.get(assistantIdx) : undefined;
                    return (
                      <div key={msg.id}>
                        <MessageBubble
                          role={msg.role}
                          content={msg.content}
                          agentName={agent.name}
                          onApproval={handleApprovalAction}
                          isStreaming={false}
                          canInteract={!isStreaming}
                          annotations={annotatedCitations}
                          transformText={applyOntologyLabels}
                        />
                        {trace && <ExecutionTracePanel trace={trace} />}
                      </div>
                    );
                  })}

                  {pendingUserMsg && (
                    <MessageBubble role="user" content={pendingUserMsg} agentName={agent.name} onApproval={handleApprovalAction} canInteract={false} annotations={[]} transformText={applyOntologyLabels} />
                  )}

                  {isStreaming && streamingContent && (
                    <MessageBubble role="assistant" content={streamingContent} agentName={agent.name} isStreaming onApproval={handleApprovalAction} canInteract={false} annotations={[]} transformText={applyOntologyLabels} />
                  )}

                  {isStreaming && !streamingContent && (
                    <StreamingProgressIndicator
                      agentName={agent.name}
                      progressEvents={progressEvents}
                      currentLabel={currentProgressLabel}
                    />
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
              <p className="text-[10px] text-muted-foreground mt-1">
                {AUTONOMY_DESCRIPTIONS[agent.autonomyMode] || agent.autonomyMode}
              </p>
            </ConfigSection>

            <ConfigSection title="Web Search" icon={<Globe className="h-3.5 w-3.5" />}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-foreground">Live Web Access</p>
                <Switch
                  checked={hasWebSearch}
                  onCheckedChange={(checked) => toggleWebSearch.mutate(checked)}
                  disabled={toggleWebSearch.isPending}
                  data-testid="switch-web-search"
                />
              </div>
            </ConfigSection>

            {tools.length > 0 && (
              <ConfigSection title={`Tools (${tools.length})`} icon={<Wrench className="h-3.5 w-3.5" />}>
                <div className="space-y-1.5">
                  {tools.map((t, i) => {
                    const rawName = t.name || `Tool ${i + 1}`;
                    const mapped = ontologyLabelMap[rawName];
                    return (
                      <div key={i} className="text-xs" data-testid={`config-tool-${i}`}>
                        {mapped ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium text-foreground">{mapped.displayLabel}</span>
                            <div className="flex items-center gap-1">
                              <Badge variant="secondary" className="text-[9px] text-emerald-600 dark:text-emerald-400">
                                <BookOpen className="w-2.5 h-2.5 mr-0.5" />
                                {mapped.conceptLabel}
                              </Badge>
                              <span className="text-[9px] text-muted-foreground font-mono">{rawName}</span>
                            </div>
                          </div>
                        ) : (
                          <span className="font-medium text-foreground">{rawName}</span>
                        )}
                        {t.description && (
                          <p className="text-[10px] text-muted-foreground">{t.description}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ConfigSection>
            )}

            {compliance.length > 0 && (
              <ConfigSection title="Compliance" icon={<Shield className="h-3.5 w-3.5" />}>
                <div className="space-y-1">
                  {compliance.map((tag, i) => (
                    <div key={i} data-testid={`badge-compliance-${tag}`}>
                      <Badge variant="outline">{tag}</Badge>
                      {COMPLIANCE_DESCRIPTIONS[tag] && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">{COMPLIANCE_DESCRIPTIONS[tag]}</p>
                      )}
                    </div>
                  ))}
                </div>
              </ConfigSection>
            )}

            {policies.length > 0 && (
              <ConfigSection title={`Policies (${policies.length})`} icon={<AlertTriangle className="h-3.5 w-3.5" />}>
                <div className="space-y-1.5">
                  {policies.map((p, i) => {
                    const isHard = (p.enforcement || "").toUpperCase().includes("HARD");
                    return (
                      <div key={i} data-testid={`policy-item-${i}`}>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-medium text-foreground">{p.policyName || `Policy ${i + 1}`}</span>
                          <Badge variant={isHard ? "destructive" : "secondary"}>
                            {isHard ? "hard" : "soft"}
                          </Badge>
                        </div>
                        {p.description && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">{p.description}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ConfigSection>
            )}

            {ontologyTags && typeof ontologyTags === "object" && Object.keys(ontologyTags).length > 0 && (() => {
              const ont = ontologyTags as Record<string, unknown>;
              return (
                <ConfigSection title="Domain Knowledge" icon={<BookOpen className="h-3.5 w-3.5" />}>
                  {ont.domain ? (
                    <p className="text-xs font-medium text-foreground" data-testid="badge-ontology-domain">
                      {String(ont.domain)}
                    </p>
                  ) : null}
                  {Object.entries(ont)
                    .filter(([key]) => key !== "domain")
                    .map(([key, value], i) => (
                      <div key={i} className="mt-1">
                        <p className="text-[10px] text-muted-foreground capitalize mb-0.5">{key.replace(/([A-Z])/g, " $1").trim()}</p>
                        <div className="flex flex-wrap gap-1" data-testid={`badge-ontology-${key}`}>
                          {Array.isArray(value) ? value.map((item: unknown, j: number) => (
                            <Badge key={j} variant="secondary" className="no-default-hover-elevate no-default-active-elevate">
                              {String(item)}
                            </Badge>
                          )) : (
                            <Badge variant="secondary" className="no-default-hover-elevate no-default-active-elevate">
                              {String(value)}
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                </ConfigSection>
              );
            })()}

            <ConfigSection title="Version" icon={<Clock className="h-3.5 w-3.5" />}>
              <p className="text-xs text-muted-foreground">v{agent.currentVersion || "1.0.0"}</p>
            </ConfigSection>
          </div>
        </div>
      )}
    </div>
  );
}

function StreamingProgressIndicator({
  agentName,
  progressEvents,
  currentLabel,
}: {
  agentName: string;
  progressEvents: ProgressEvent[];
  currentLabel: string;
}) {
  return (
    <div className="flex gap-3" data-testid="streaming-progress">
      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
        <Bot className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span className="text-foreground font-medium">{currentLabel || `${agentName} is thinking...`}</span>
        </div>
        {progressEvents.length > 0 && (
          <div className="space-y-1 pl-1">
            {progressEvents.map((event, i) => {
              const config = PROGRESS_LABELS[event.type];
              if (!config) return null;
              const Icon = config.icon;
              const isLatest = i === progressEvents.length - 1;
              let detail = "";
              if (event.type === "discovery") {
                detail = `Found ${event.toolCount || 0} tools`;
                if (Array.isArray(event.tools)) {
                  detail += `: ${(event.tools as Array<{ tool: string }>).map(t => t.tool).join(", ")}`;
                }
              } else if (event.type === "tool_call_start") {
                detail = `${event.tool}${event.server ? ` (${event.server})` : ""}`;
              } else if (event.type === "tool_call_result") {
                detail = `${event.tool}: ${event.success ? "success" : "failed"}`;
              } else if (event.type === "planning") {
                detail = event.toolCallsPlanned ? `${event.toolCallsPlanned} tool calls planned` : "Planning...";
              } else if (event.type === "llm_thinking") {
                detail = `Iteration ${event.iteration || 1}`;
              } else if (event.type === "compliance_check") {
                detail = event.allPassed ? "All checks passed" : `${(event.failedChecks as string[] || []).length} issues`;
              }
              return (
                <div
                  key={i}
                  className={`flex items-center gap-2 text-xs ${isLatest ? "text-foreground" : "text-muted-foreground"}`}
                  data-testid={`progress-step-${i}`}
                >
                  {event.type === "tool_call_result" ? (
                    event.success ? (
                      <CheckCircle className="h-3 w-3 text-green-500 shrink-0" />
                    ) : (
                      <XCircle className="h-3 w-3 text-red-500 shrink-0" />
                    )
                  ) : event.type === "error" ? (
                    <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />
                  ) : isLatest ? (
                    <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                  ) : (
                    <Icon className="h-3 w-3 shrink-0" />
                  )}
                  <span>{detail || config.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ExecutionTracePanel({ trace }: { trace: ExecutionTraceData }) {
  const [expanded, setExpanded] = useState(false);

  const toolCalls = trace.events.filter(e => e.type === "tool_call_start" || e.type === "tool_call_result");
  const discoveryEvent = trace.events.find(e => e.type === "discovery");
  const complianceEvent = trace.events.find(e => e.type === "compliance_check");
  const errors = trace.events.filter(e => e.type === "error");
  const iterations = trace.events.filter(e => e.type === "iteration_complete");

  let durationMs = 0;
  if (trace.startedAt && trace.completedAt) {
    durationMs = new Date(trace.completedAt).getTime() - new Date(trace.startedAt).getTime();
  }

  const toolCallStarts = trace.events.filter(e => e.type === "tool_call_start");
  const toolCallResults = trace.events.filter(e => e.type === "tool_call_result");
  const successfulCalls = toolCallResults.filter(e => e.success);
  const failedCalls = toolCallResults.filter(e => !e.success);

  return (
    <div className="ml-11 mt-1" data-testid="execution-trace">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        data-testid="button-toggle-trace"
      >
        <ListChecks className="h-3 w-3" />
        <span>Execution Trace</span>
        <span className="text-muted-foreground">
          ({toolCallStarts.length} tool call{toolCallStarts.length !== 1 ? "s" : ""}
          {durationMs > 0 ? `, ${(durationMs / 1000).toFixed(1)}s` : ""})
        </span>
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {expanded && (
        <div className="mt-2 space-y-1.5 border-l-2 border-muted pl-3" data-testid="trace-details">
          {discoveryEvent && (
            <div className="flex items-center gap-2 text-xs" data-testid="trace-discovery">
              <Search className="h-3 w-3 text-primary shrink-0" />
              <span className="text-foreground">
                Discovered {String(discoveryEvent.toolCount || 0)} tools
              </span>
              {Array.isArray(discoveryEvent.tools) && (
                <span className="text-muted-foreground truncate">
                  ({(discoveryEvent.tools as Array<{ tool: string }>).map(t => t.tool).join(", ")})
                </span>
              )}
            </div>
          )}

          {toolCallStarts.map((event, i) => {
            const result = toolCallResults.find(
              (r) => r.tool === event.tool && r.iteration === event.iteration
            ) || toolCallResults[i];
            return (
              <div key={i} className="flex items-start gap-2 text-xs" data-testid={`trace-tool-${i}`}>
                {result ? (
                  result.success ? (
                    <CheckCircle className="h-3 w-3 text-green-500 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="h-3 w-3 text-red-500 shrink-0 mt-0.5" />
                  )
                ) : (
                  <Wrench className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                )}
                <div className="min-w-0">
                  <span className="font-medium text-foreground">{String(event.tool)}</span>
                  {event.server ? (
                    <span className="text-muted-foreground ml-1">({String(event.server)})</span>
                  ) : null}
                  {result && !result.success && result.error ? (
                    <span className="text-red-500 dark:text-red-400 ml-1">{String(result.error)}</span>
                  ) : null}
                </div>
              </div>
            );
          })}

          {iterations.length > 1 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="trace-iterations">
              <Brain className="h-3 w-3 shrink-0" />
              <span>{iterations.length} iteration{iterations.length !== 1 ? "s" : ""} completed</span>
            </div>
          )}

          {complianceEvent && (
            <div className="flex items-center gap-2 text-xs" data-testid="trace-compliance">
              {complianceEvent.allPassed ? (
                <CheckCircle className="h-3 w-3 text-green-500 shrink-0" />
              ) : (
                <AlertTriangle className="h-3 w-3 text-yellow-500 shrink-0" />
              )}
              <span className={complianceEvent.allPassed ? "text-foreground" : "text-yellow-600 dark:text-yellow-400"}>
                {complianceEvent.allPassed
                  ? `${complianceEvent.checksCount || 0} compliance checks passed`
                  : `Compliance issues: ${(complianceEvent.failedChecks as string[] || []).join(", ")}`}
              </span>
            </div>
          )}

          {errors.length > 0 && errors.map((err, i) => (
            <div key={`err-${i}`} className="flex items-center gap-2 text-xs text-red-500 dark:text-red-400" data-testid={`trace-error-${i}`}>
              <AlertTriangle className="h-3 w-3 shrink-0" />
              <span>{String(err.message || "Unknown error")}</span>
            </div>
          ))}

          <div className="flex items-center gap-3 text-[10px] text-muted-foreground pt-1">
            {durationMs > 0 && (
              <span className="flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" />
                {(durationMs / 1000).toFixed(1)}s
              </span>
            )}
            <span className="flex items-center gap-1">
              <Wrench className="h-2.5 w-2.5" />
              {successfulCalls.length}/{toolCallStarts.length} successful
            </span>
            {failedCalls.length > 0 && (
              <span className="flex items-center gap-1 text-red-500 dark:text-red-400">
                <XCircle className="h-2.5 w-2.5" />
                {failedCalls.length} failed
              </span>
            )}
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
  annotations,
  transformText,
}: {
  role: string;
  content: string;
  agentName: string;
  isStreaming?: boolean;
  onApproval: (action: string, approved: boolean) => void;
  canInteract: boolean;
  annotations: CitationAnnotation[];
  transformText?: (text: string) => string;
}) {
  const isUser = role === "user";
  const applyTransform = (t: string) => (!isUser && transformText ? transformText(t) : t);
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
      <div className={`space-y-1 ${isUser ? "max-w-[75%] items-end" : "max-w-[85%]"}`}>
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
              <div className="whitespace-pre-wrap break-words">
                <RenderTextWithLinks text={applyTransform(seg.content)} isUser={isUser} annotations={annotations} />
              </div>
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

function RenderTextWithLinks({ text, isUser, annotations }: { text: string; isUser: boolean; annotations: CitationAnnotation[] }) {
  const conceptBadgeRegex = /\[([^\]]+)\]/g;
  const renderWithConceptBadges = (inputText: string, keyPrefix: string): React.ReactNode[] => {
    const nodes: React.ReactNode[] = [];
    let lastIdx = 0;
    let match;
    const regex = new RegExp(conceptBadgeRegex.source, 'g');
    while ((match = regex.exec(inputText)) !== null) {
      const before = inputText.slice(lastIdx, match.index);
      if (before) nodes.push(before);
      const prevChar = match.index > 0 ? inputText[match.index - 1] : "";
      if (prevChar === "(") {
        nodes.push(match[0]);
      } else {
        nodes.push(
          <Badge key={`${keyPrefix}-concept-${match.index}`} variant="secondary" className="text-[9px] text-emerald-600 dark:text-emerald-400 no-default-hover-elevate no-default-active-elevate inline-flex" data-testid="badge-ontology-concept">
            <BookOpen className="w-2.5 h-2.5 mr-0.5" />
            {match[1]}
          </Badge>
        );
      }
      lastIdx = match.index + match[0].length;
    }
    if (lastIdx < inputText.length) nodes.push(inputText.slice(lastIdx));
    return nodes;
  };

  const parts = text.split(/(\[([^\]]+)\]\(([^)]+)\))/g);
  const elements: React.ReactNode[] = [];
  let i = 0;
  while (i < parts.length) {
    if (i + 3 < parts.length && parts[i + 1] && parts[i + 1].startsWith("[")) {
      if (parts[i]) elements.push(...renderWithConceptBadges(parts[i], `pre-${i}`));
      const linkUrl = parts[i + 3];
      const linkTitle = parts[i + 2];
      const annotation = annotations.find((a) => a.url === linkUrl);
      elements.push(
        <span key={i} className="inline-flex flex-col">
          <a
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-0.5 underline underline-offset-2 ${
              isUser ? "text-primary-foreground/90 hover:text-primary-foreground" : "text-primary hover:text-primary/80"
            }`}
            data-testid="link-citation"
          >
            {linkTitle}
            <ExternalLink className="h-3 w-3 inline shrink-0" />
          </a>
          {annotation && annotation.tags && annotation.tags.length > 0 && (
            <span className="flex flex-wrap gap-0.5 mt-0.5">
              {annotation.tags.map((tag, ti) => (
                <Badge key={ti} variant="secondary" className="text-[9px] no-default-hover-elevate no-default-active-elevate" data-testid="badge-citation-tag">
                  {tag}
                </Badge>
              ))}
            </span>
          )}
        </span>
      );
      i += 4;
    } else {
      if (parts[i]) elements.push(...renderWithConceptBadges(parts[i], `txt-${i}`));
      i++;
    }
  }
  return <>{elements}</>;
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
