import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation, Link } from "wouter";
import type { Skill, SkillVersion } from "@shared/schema";
import { OntologyAutocomplete } from "@/components/ontology-autocomplete";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  ArrowLeft,
  Save,
  Sparkles,
  Loader2,
  Plus,
  Eye,
  EyeOff,
  Play,
  GitBranch,
  Network,
  CheckCircle2,
  AlertTriangle,
  Flag,
  Wrench,
  Server,
  Database,
  Layers,
  Shield,
  FileText,
  RotateCcw,
  Pencil,
  XCircle,
  ChevronDown,
  ChevronUp,
  Info,
  Activity,
  CheckCircle,
  XOctagon,
  Clock,
  Unlink,
} from "lucide-react";

const SECTION_TEMPLATES: Record<string, string> = {
  "Trigger Conditions": `## Trigger Conditions\n\n- When: [describe trigger event]\n- Conditions:\n  - [condition 1]\n  - [condition 2]\n- Priority: [high/medium/low]\n\n`,
  "Procedure": `## Procedure\n\n1. **Step 1**: [action]\n   - Tools: [tool names]\n   - Expected output: [description]\n2. **Step 2**: [action]\n   - Tools: [tool names]\n   - Expected output: [description]\n3. **Step 3**: [action]\n   - Validation: [check]\n\n`,
  "Decision Tree": `## Decision Tree\n\n- **IF** [condition A]:\n  - **THEN** [action A]\n  - **ELSE IF** [condition B]:\n    - **THEN** [action B]\n  - **ELSE**:\n    - **THEN** [fallback action]\n\n`,
  "Edge Cases": `## Edge Cases\n\n- **Case**: [edge case description]\n  - **Handling**: [how to handle]\n  - **Fallback**: [fallback behavior]\n- **Case**: [another edge case]\n  - **Handling**: [how to handle]\n\n`,
  "Output Format": `## Output Format\n\n\`\`\`json\n{\n  "status": "success | failure",\n  "result": {},\n  "metadata": {\n    "confidence": 0.0,\n    "sources": []\n  }\n}\n\`\`\`\n\n`,
};

function DescriptionQualityBar({ score, feedback }: { score: number | null; feedback: string }) {
  if (score === null) return null;
  const color = score >= 70 ? "bg-green-500" : score >= 40 ? "bg-yellow-500" : "bg-red-500";
  const textColor = score >= 70 ? "text-green-600 dark:text-green-400" : score >= 40 ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400";
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="w-24 h-1.5 rounded-full bg-muted overflow-visible">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(score, 100)}%` }} />
      </div>
      <span className={`text-xs font-medium ${textColor}`} data-testid="text-quality-score">{score.toFixed(0)}</span>
      {feedback && <span className="text-xs text-muted-foreground">{feedback}</span>}
    </div>
  );
}

interface SandboxResult {
  activationTriggered?: boolean;
  activationReason?: string;
  contextInjected?: string[];
  steps?: Array<{ step?: number; action: string; reasoning: string; toolsUsed?: string[] }>;
  output?: string;
  qualityScore?: number;
  issues?: string[];
  recommendations?: string[];
}

function SandboxResultCard({ title, result, loading }: { title: string; result: SandboxResult | null; loading: boolean }) {
  if (loading) {
    return (
      <Card className="flex-1">
        <CardHeader>
          <CardTitle className="text-sm">{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }
  if (!result) {
    return (
      <Card className="flex-1">
        <CardHeader>
          <CardTitle className="text-sm">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground" data-testid={`text-${title.toLowerCase().replace(/\s/g, "-")}-empty`}>Run a test to see results</p>
        </CardContent>
      </Card>
    );
  }
  const triggered = !!result.activationTriggered;
  const qColor = (result.qualityScore ?? 0) >= 70 ? "bg-green-500" : (result.qualityScore ?? 0) >= 40 ? "bg-yellow-500" : "bg-red-500";
  return (
    <Card className="flex-1">
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          {triggered ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <AlertTriangle className="w-4 h-4 text-yellow-500" />}
          <span className="text-sm font-medium" data-testid={`text-activation-${title.toLowerCase().replace(/\s/g, "-")}`}>
            {triggered ? "Activated" : "Not Activated"}
          </span>
        </div>
        {result.activationReason && <p className="text-xs text-muted-foreground">{result.activationReason}</p>}
        {result.contextInjected && result.contextInjected.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Context Injected:</p>
            <ul className="text-xs space-y-0.5">
              {result.contextInjected.map((c, i) => <li key={i} className="text-muted-foreground">- {c}</li>)}
            </ul>
          </div>
        )}
        {result.steps && result.steps.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Steps:</p>
            <ol className="text-xs space-y-1.5">
              {result.steps.map((s, i) => (
                <li key={i}>
                  <span className="font-medium">{i + 1}. {s.action}</span>
                  <p className="text-muted-foreground ml-3">{s.reasoning}</p>
                  {s.toolsUsed && Array.isArray(s.toolsUsed) && s.toolsUsed.length > 0 && (
                    <div className="flex gap-1 ml-3 mt-0.5 flex-wrap">
                      {s.toolsUsed.map((t, j) => <Badge key={j} variant="outline" className="text-[10px]">{t}</Badge>)}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}
        {result.output && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Output:</p>
            <p className="text-xs bg-muted p-2 rounded-md">{result.output}</p>
          </div>
        )}
        {result.qualityScore !== undefined && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Quality:</span>
            <div className="w-16 h-1.5 rounded-full bg-muted overflow-visible">
              <div className={`h-full rounded-full ${qColor}`} style={{ width: `${result.qualityScore}%` }} />
            </div>
            <span className="text-xs font-medium">{result.qualityScore}</span>
          </div>
        )}
        {result.issues && result.issues.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Issues:</p>
            <ul className="text-xs space-y-0.5">
              {result.issues.map((issue, i) => <li key={i} className="text-muted-foreground">- {issue}</li>)}
            </ul>
          </div>
        )}
        {result.recommendations && result.recommendations.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Recommendations:</p>
            <ul className="text-xs space-y-0.5">
              {result.recommendations.map((r, i) => <li key={i} className="text-muted-foreground">- {r}</li>)}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StudioLanding() {
  const [, navigate] = useLocation();
  const { data: skills = [], isLoading } = useQuery<Skill[]>({ queryKey: ["/api/skills"] });
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await apiRequest("POST", "/api/skills", {
        name: "New Skill",
        description: "Describe what this skill does...",
        industry: "financial_services",
        domain: "general",
        author: "studio",
        version: "1.0.0",
        complexity: "intermediate",
        status: "draft",
        trustTier: "customer-created",
      });
      const created = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/skills"] });
      navigate(`/skills/studio/${created.id}`);
    } catch (e: any) {
      toast({ title: "Failed to create skill", description: e.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  return (
    <ScrollArea className="h-full">
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-studio-title">Skill Studio</h1>
            <p className="text-sm text-muted-foreground mt-1">Create, edit, test, and version agent skills</p>
          </div>
          <Button onClick={handleCreate} disabled={creating} data-testid="button-create-skill">
            {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            Create New Skill
          </Button>
        </div>
        <Separator />
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
          </div>
        ) : skills.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Pencil className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">No skills yet. Create your first skill to get started.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {skills.map((s) => (
              <Link key={s.id} href={`/skills/studio/${s.id}`}>
                <Card className="cursor-pointer hover-elevate h-full" data-testid={`card-studio-skill-${s.id}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-sm leading-tight">{s.name}</CardTitle>
                      <Badge variant={s.status === "active" ? "default" : "secondary"} className="text-[10px] shrink-0">{s.status}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{s.description}</p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">v{s.version}</Badge>
                      <Badge variant="outline" className="text-[10px]">{s.industry?.replace(/_/g, " ")}</Badge>
                      <Badge variant="outline" className="text-[10px]">{s.complexity}</Badge>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

export default function SkillStudio() {
  const [, params] = useRoute("/skills/studio/:id");
  const id = params?.id;

  if (!id) return <StudioLanding />;

  return <SkillStudioEditor skillId={id} />;
}

function SkillStudioEditor({ skillId: id }: { skillId: string }) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("editor");

  const { data: skill, isLoading } = useQuery<Skill>({
    queryKey: ["/api/skills", id],
    enabled: !!id,
  });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [industry, setIndustry] = useState("financial_services");
  const [domain, setDomain] = useState("");
  const [tags, setTags] = useState("");
  const [allowedTools, setAllowedTools] = useState("");
  const [requiredMcpServers, setRequiredMcpServers] = useState("");
  const [requiredDataClassifications, setRequiredDataClassifications] = useState("");
  const [disableModelInvocation, setDisableModelInvocation] = useState(false);
  const [contextMode, setContextMode] = useState("inline");
  const [userInvocable, setUserInvocable] = useState(true);
  const [version, setVersion] = useState("1.0.0");
  const [complexity, setComplexity] = useState("intermediate");
  const [markdownBody, setMarkdownBody] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);

  const [qualityScore, setQualityScore] = useState<number | null>(null);
  const [qualityFeedback, setQualityFeedback] = useState("");
  const qualityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [builderInput, setBuilderInput] = useState("");
  const [builderSkillName, setBuilderSkillName] = useState("");
  const [builderIndustry, setBuilderIndustry] = useState("financial_services");
  const [builderDomain, setBuilderDomain] = useState("");
  const [builderLoading, setBuilderLoading] = useState(false);
  const [builderResult, setBuilderResult] = useState<any>(null);

  const [testScenario, setTestScenario] = useState("");
  const [testLoading, setTestLoading] = useState(false);
  const [withSkillResult, setWithSkillResult] = useState<SandboxResult | null>(null);
  const [withoutSkillResult, setWithoutSkillResult] = useState<SandboxResult | null>(null);

  const [selectedVersion, setSelectedVersion] = useState<SkillVersion | null>(null);
  const [versionChangelog, setVersionChangelog] = useState("");
  const [savingVersion, setSavingVersion] = useState(false);

  const [runningEval, setRunningEval] = useState(false);

  interface OntologyTagValidation {
    totalTags: number;
    resolvedTags: number;
    unresolvedTags: string[];
    resolved: Array<{ tag: string; conceptId: string; conceptLabel: string }>;
  }
  const [tagValidation, setTagValidation] = useState<OntologyTagValidation | null>(null);
  const [tagValidating, setTagValidating] = useState(false);
  const tagValidationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const validateOntologyTags = useCallback((currentTags: string, currentIndustry: string) => {
    if (tagValidationTimer.current) clearTimeout(tagValidationTimer.current);
    const parsedTags = currentTags.split(",").map(t => t.trim()).filter(Boolean);
    if (parsedTags.length === 0 || !id) {
      setTagValidation(null);
      return;
    }
    tagValidationTimer.current = setTimeout(async () => {
      setTagValidating(true);
      try {
        const res = await apiRequest("POST", `/api/skills/${id}/validate-ontology-tags`, {
          tags: parsedTags,
          industry: currentIndustry,
        });
        const data: OntologyTagValidation = await res.json();
        setTagValidation(data);
      } catch {
        setTagValidation(null);
      } finally {
        setTagValidating(false);
      }
    }, 600);
  }, [id]);

  const handleRunEval = async () => {
    setRunningEval(true);
    try {
      await apiRequest("POST", `/api/skills/${id}/eval/run`);
      queryClient.invalidateQueries({ queryKey: ["/api/skills", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/eval/results", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/skills"] });
      toast({ title: "Skill eval completed", description: "Evaluation results are now available." });
    } catch (e: any) {
      toast({ title: "Eval failed", description: e.message || "Could not run skill evaluation", variant: "destructive" });
    } finally {
      setRunningEval(false);
    }
  };

  interface PolicyViolation {
    policyId: string;
    policyName: string;
    ruleName: string;
    severity: "critical" | "warning" | "info";
    message: string;
    suggestion: string;
  }
  interface ValidationResult {
    valid: boolean;
    canSave: boolean;
    violations: PolicyViolation[];
    summary: { total: number; critical: number; warnings: number; info: number; policiesChecked: number };
  }
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [validating, setValidating] = useState(false);
  const [showValidation, setShowValidation] = useState(false);

  const { data: versions = [] } = useQuery<SkillVersion[]>({
    queryKey: ["/api/skills", id, "versions"],
    enabled: !!id,
  });

  const { data: ontologyTerms = [] } = useQuery<Array<{ id: string; label: string; category: string; description: string; synonyms: string[]; tags: string[] }>>({
    queryKey: ["/api/ontology/terms", industry],
    queryFn: async () => {
      const res = await fetch(`/api/ontology/terms?industry=${encodeURIComponent(industry)}&prefix=`);
      return res.json();
    },
    enabled: !!industry,
  });

  const { data: registeredMcpTools = [] } = useQuery<Array<{ id: string; serverId: string; name: string; description: string | null }>>({
    queryKey: ["/api/mcp-tools"],
  });

  const { data: registeredMcpServers = [] } = useQuery<Array<{ id: string; name: string; status: string }>>({
    queryKey: ["/api/mcp-servers"],
  });

  const toolRefsList = useMemo(() => allowedTools.split("\n").map(t => t.trim()).filter(Boolean), [allowedTools]);
  const serverRefsList = useMemo(() => requiredMcpServers.split("\n").map(t => t.trim()).filter(Boolean), [requiredMcpServers]);

  const { data: depValidation } = useQuery<{
    tools: { ref: string; valid: boolean; toolName: string | null; serverName: string | null }[];
    servers: { ref: string; valid: boolean; serverName: string | null; status: string | null }[];
    brokenTools: { ref: string }[];
    brokenServers: { ref: string }[];
    hasBrokenDependencies: boolean;
  }>({
    queryKey: ["/api/mcp-servers/tools/validate", toolRefsList, serverRefsList],
    queryFn: async () => {
      if (toolRefsList.length === 0 && serverRefsList.length === 0) {
        return { tools: [], servers: [], brokenTools: [], brokenServers: [], hasBrokenDependencies: false };
      }
      const params = new URLSearchParams();
      if (toolRefsList.length > 0) params.set("tool_ids", JSON.stringify(toolRefsList));
      if (serverRefsList.length > 0) params.set("server_ids", JSON.stringify(serverRefsList));
      const res = await fetch(`/api/mcp-servers/tools/validate?${params}`);
      return res.json();
    },
    enabled: toolRefsList.length > 0 || serverRefsList.length > 0,
  });

  useEffect(() => {
    if (skill) {
      setName(skill.name);
      setDescription(skill.description);
      setIndustry(skill.industry);
      setDomain(skill.domain);
      setTags((skill.tags as string[] | null)?.join(", ") ?? "");
      setAllowedTools((skill.allowedTools as string[] | null)?.join("\n") ?? "");
      setRequiredMcpServers((skill.requiredMcpServers as string[] | null)?.join("\n") ?? "");
      setRequiredDataClassifications((skill.requiredDataClassifications as string[] | null)?.join("\n") ?? "");
      setDisableModelInvocation(skill.disableModelInvocation ?? false);
      setContextMode(skill.contextMode ?? "inline");
      setUserInvocable(skill.userInvocable ?? true);
      setVersion(skill.version);
      setComplexity(skill.complexity);
      setMarkdownBody(skill.markdownBody ?? "");
      setQualityScore(skill.descriptionQualityScore ?? null);
      const loadedTags = (skill.tags as string[] | null)?.join(", ") ?? "";
      if (loadedTags && skill.industry) {
        validateOntologyTags(loadedTags, skill.industry);
      }
    }
  }, [skill]);

  const fetchQualityScore = useCallback((desc: string, ind: string, dom: string) => {
    if (qualityTimer.current) clearTimeout(qualityTimer.current);
    if (!desc || desc.length < 10) {
      setQualityScore(null);
      setQualityFeedback("");
      return;
    }
    qualityTimer.current = setTimeout(async () => {
      try {
        const res = await apiRequest("POST", "/api/ai/skill-description-quality", { description: desc, industry: ind, domain: dom });
        const data = await res.json();
        setQualityScore(data.score ?? null);
        setQualityFeedback(data.feedback ?? "");
      } catch {
        // silently fail
      }
    }, 800);
  }, []);

  const clearValidation = () => {
    if (validationResult) setValidationResult(null);
  };

  const handleDescriptionChange = (val: string) => {
    setDescription(val);
    clearValidation();
    fetchQualityScore(val, industry, domain);
  };

  const getSkillPayload = () => ({
    name,
    description,
    industry,
    domain,
    industryContextId: industry,
    allowedTools: allowedTools.split("\n").map(t => t.trim()).filter(Boolean),
    requiredMcpServers: requiredMcpServers.split("\n").map(t => t.trim()).filter(Boolean),
    requiredDataClassifications: requiredDataClassifications.split("\n").map(t => t.trim()).filter(Boolean),
    markdownBody,
  });

  const handleValidate = async (): Promise<ValidationResult | null> => {
    setValidating(true);
    try {
      const res = await apiRequest("POST", "/api/policies/validate-skill", getSkillPayload());
      const result: ValidationResult = await res.json();
      setValidationResult(result);
      setShowValidation(true);
      return result;
    } catch (e: any) {
      toast({ title: "Validation failed", description: e.message, variant: "destructive" });
      return null;
    } finally {
      setValidating(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await handleValidate();
      if (!result) {
        toast({
          title: "Policy validation unavailable",
          description: "Could not validate skill against policies. Save blocked for safety.",
          variant: "destructive",
        });
        setSaving(false);
        return;
      }
      if (!result.canSave) {
        toast({
          title: "Save blocked by policy violations",
          description: `${result.summary.critical} critical violation${result.summary.critical !== 1 ? "s" : ""} must be resolved before saving`,
          variant: "destructive",
        });
        setSaving(false);
        return;
      }

      const parsedTags = tags.split(",").map(t => t.trim()).filter(Boolean);
      const payload = getSkillPayload();

      await apiRequest("PATCH", `/api/skills/${id}`, {
        ...payload,
        tags: parsedTags,
        disableModelInvocation,
        contextMode,
        userInvocable,
        version,
        complexity,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/skills", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/skills"] });

      if (result.summary.warnings > 0) {
        toast({ title: "Skill saved with warnings", description: `${result.summary.warnings} policy warning${result.summary.warnings !== 1 ? "s" : ""} detected. Review recommended.` });
      } else {
        toast({ title: "Skill saved successfully" });
      }
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleGenerate = async () => {
    if (!builderInput) return;
    setBuilderLoading(true);
    setBuilderResult(null);
    try {
      const res = await apiRequest("POST", "/api/ai/skill-instruction-builder", {
        naturalLanguageInput: builderInput,
        skillName: builderSkillName || undefined,
        industry: builderIndustry,
        domain: builderDomain || undefined,
      });
      const data = await res.json();
      setBuilderResult(data);
    } catch (e: any) {
      toast({ title: "Generation failed", description: e.message, variant: "destructive" });
    } finally {
      setBuilderLoading(false);
    }
  };

  const applyBuilderResult = () => {
    if (!builderResult) return;
    if (builderResult.name) setName(builderResult.name);
    if (builderResult.description) setDescription(builderResult.description);
    if (builderResult.markdownBody) setMarkdownBody(builderResult.markdownBody);
    if (builderResult.industry) setIndustry(builderResult.industry);
    if (builderResult.domain) setDomain(builderResult.domain);
    if (builderResult.tags) setTags(Array.isArray(builderResult.tags) ? builderResult.tags.join(", ") : "");
    if (builderResult.dependencies) {
      // dependencies is handled on save via the skill object
    }
    setActiveTab("editor");
    toast({ title: "Applied generated content to editor" });
  };

  const handleRunTest = async () => {
    if (!testScenario) return;
    setTestLoading(true);
    setWithSkillResult(null);
    setWithoutSkillResult(null);
    try {
      const [withRes, withoutRes] = await Promise.all([
        apiRequest("POST", "/api/ai/skill-test-sandbox", {
          skillName: name,
          description,
          markdownBody,
          testScenario,
          withSkill: true,
        }),
        apiRequest("POST", "/api/ai/skill-test-sandbox", {
          skillName: name,
          description,
          markdownBody,
          testScenario,
          withSkill: false,
        }),
      ]);
      const [withData, withoutData] = await Promise.all([withRes.json(), withoutRes.json()]);
      setWithSkillResult(withData);
      setWithoutSkillResult(withoutData);
    } catch (e: any) {
      toast({ title: "Test failed", description: e.message, variant: "destructive" });
    } finally {
      setTestLoading(false);
    }
  };

  const handleSaveVersion = async () => {
    setSavingVersion(true);
    try {
      await apiRequest("POST", `/api/skills/${id}/versions`, {
        skillId: id,
        version,
        changeLog: versionChangelog || "Version snapshot",
        yamlFrontmatter: { name, description, industry, domain, tags: tags.split(",").map(t => t.trim()).filter(Boolean), complexity },
        markdownBody,
        snapshotData: { name, description, industry, domain, version, complexity, allowedTools: allowedTools.split("\n").filter(Boolean), requiredMcpServers: requiredMcpServers.split("\n").filter(Boolean) },
        author: "user",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/skills", id, "versions"] });
      setVersionChangelog("");
      toast({ title: "Version saved" });
    } catch (e: any) {
      toast({ title: "Failed to save version", description: e.message, variant: "destructive" });
    } finally {
      setSavingVersion(false);
    }
  };

  const handleRollback = async (ver: SkillVersion) => {
    try {
      const patch: Record<string, any> = {};
      if (ver.markdownBody) patch.markdownBody = ver.markdownBody;
      if (ver.yamlFrontmatter) {
        const ym = ver.yamlFrontmatter as any;
        if (ym.name) patch.name = ym.name;
        if (ym.description) patch.description = ym.description;
        if (ym.industry) patch.industry = ym.industry;
        if (ym.domain) patch.domain = ym.domain;
        if (ym.tags) patch.tags = ym.tags;
        if (ym.complexity) patch.complexity = ym.complexity;
      }
      if (ver.version) patch.version = ver.version;
      await apiRequest("PATCH", `/api/skills/${id}`, patch);
      queryClient.invalidateQueries({ queryKey: ["/api/skills", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/skills"] });
      toast({ title: `Rolled back to version ${ver.version}` });
    } catch (e: any) {
      toast({ title: "Rollback failed", description: e.message, variant: "destructive" });
    }
  };

  const insertTemplate = (key: string) => {
    setMarkdownBody(prev => prev + (prev.endsWith("\n") || prev === "" ? "" : "\n") + SECTION_TEMPLATES[key]);
  };

  const renderPreview = () => {
    const sections = markdownBody.split(/^## /m).filter(Boolean);
    return (
      <div className="space-y-4">
        {sections.map((section, i) => {
          const lines = section.split("\n");
          const heading = lines[0];
          const body = lines.slice(1).join("\n").trim();
          return (
            <div key={i}>
              <h3 className="text-sm font-semibold mb-1">{heading}</h3>
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap">{body}</pre>
            </div>
          );
        })}
      </div>
    );
  };

  const deps = (skill?.dependencies as Array<{ name: string; type: string }> | null) ?? [];
  const toolsList = (skill?.allowedTools as string[] | null) ?? [];
  const serversList = (skill?.requiredMcpServers as string[] | null) ?? [];
  const dataSources = deps.filter(d => d.type === "data-source");
  const skillDeps = deps.filter(d => d.type === "skill");
  const policyDeps = deps.filter(d => d.type === "policy");

  const isDeprecated = (depName: string) => depName.toLowerCase().includes("deprecated") || depName.toLowerCase().includes("legacy");

  if (isLoading) {
    return (
      <div className="p-5 space-y-4" data-testid="page-skill-studio-loading">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[500px] w-full" />
      </div>
    );
  }

  if (!skill) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4" data-testid="page-skill-studio-empty">
        <Layers className="w-12 h-12 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">Skill not found</p>
        <Link href="/skills">
          <Button variant="outline" size="sm" data-testid="button-back-empty">
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Skills
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" data-testid="page-skill-studio">
      <div className="flex items-center gap-3 p-3 border-b shrink-0 sticky top-0 z-50 bg-background flex-wrap">
        <Link href="/skills">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <span className="font-semibold text-lg" data-testid="text-skill-name">{name || skill.name}</span>
        <Badge variant="outline" className="text-xs" data-testid="badge-version">v{version}</Badge>
        <Badge variant="secondary" className="text-xs" data-testid="badge-status">{skill.status}</Badge>
        <div className="flex-1" />
        {validationResult && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowValidation(!showValidation)}
            className="gap-1.5"
            data-testid="button-toggle-validation"
          >
            {validationResult.summary.critical > 0 ? (
              <XCircle className="w-3.5 h-3.5 text-red-500" />
            ) : validationResult.summary.warnings > 0 ? (
              <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
            )}
            <span className="text-xs">
              {validationResult.summary.critical > 0
                ? `${validationResult.summary.critical} critical`
                : validationResult.summary.warnings > 0
                  ? `${validationResult.summary.warnings} warning${validationResult.summary.warnings !== 1 ? "s" : ""}`
                  : "Compliant"}
            </span>
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleValidate()}
          disabled={validating}
          data-testid="button-validate-policies"
        >
          {validating ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Shield className="w-3.5 h-3.5 mr-1.5" />}
          {validating ? "Validating..." : "Validate Against Policies"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSave}
          disabled={saving || (validationResult !== null && !validationResult.canSave)}
          data-testid="button-save"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
          {saving ? "Saving..." : "Save"}
        </Button>
        <Separator orientation="vertical" className="h-6" />
        <Button
          variant="outline"
          size="sm"
          onClick={handleRunEval}
          disabled={runningEval}
          data-testid="button-run-skill-eval"
        >
          {runningEval ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-1.5" />}
          {runningEval ? "Running Eval..." : "Run Skill Eval"}
        </Button>
        {skill?.lastEvalPassRate != null && (
          <Badge
            variant="secondary"
            className={`text-[10px] no-default-hover-elevate no-default-active-elevate ${
              skill.lastEvalPassRate >= 90
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                : skill.lastEvalPassRate >= 70
                  ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                  : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
            }`}
            data-testid="badge-eval-pass-rate"
          >
            Eval {skill.lastEvalPassRate.toFixed(0)}%
          </Badge>
        )}
        {depValidation?.hasBrokenDependencies && (
          <Badge
            variant="secondary"
            className="text-[10px] bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 no-default-hover-elevate no-default-active-elevate"
            data-testid="badge-broken-deps"
          >
            <Unlink className="w-3 h-3 mr-1" />
            {(depValidation.brokenTools.length + depValidation.brokenServers.length)} Broken Dep{(depValidation.brokenTools.length + depValidation.brokenServers.length) !== 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      {showValidation && validationResult && (
        <div className="border-b px-4 py-3 bg-muted/30" data-testid="panel-policy-validation">
          <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-semibold">Policy Compliance</span>
              <Badge variant="outline" className="text-[10px]">{validationResult.summary.policiesChecked} policies checked</Badge>
            </div>
            <div className="flex items-center gap-2">
              {validationResult.summary.critical > 0 && (
                <Badge variant="destructive" className="text-[10px]" data-testid="badge-critical-count">
                  <XCircle className="w-3 h-3 mr-0.5" /> {validationResult.summary.critical} Critical
                </Badge>
              )}
              {validationResult.summary.warnings > 0 && (
                <Badge variant="outline" className="text-[10px] bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30" data-testid="badge-warning-count">
                  <AlertTriangle className="w-3 h-3 mr-0.5" /> {validationResult.summary.warnings} Warning{validationResult.summary.warnings !== 1 ? "s" : ""}
                </Badge>
              )}
              {validationResult.valid && validationResult.summary.total === 0 && (
                <Badge variant="outline" className="text-[10px] bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30" data-testid="badge-compliant">
                  <CheckCircle2 className="w-3 h-3 mr-0.5" /> Fully Compliant
                </Badge>
              )}
              <Button variant="ghost" size="icon" onClick={() => setShowValidation(false)} data-testid="button-close-validation">
                <ChevronUp className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {validationResult.violations.length > 0 ? (
            <div className="space-y-2 max-h-[250px] overflow-y-auto">
              {validationResult.violations.map((v, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-3 p-2.5 rounded-md border ${
                    v.severity === "critical"
                      ? "bg-red-500/10 border-red-500/30"
                      : v.severity === "warning"
                        ? "bg-yellow-500/10 border-yellow-500/30"
                        : "bg-blue-500/10 border-blue-500/30"
                  }`}
                  data-testid={`violation-${i}`}
                >
                  {v.severity === "critical" ? (
                    <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  ) : v.severity === "warning" ? (
                    <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
                  ) : (
                    <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold" data-testid={`violation-message-${i}`}>{v.message}</span>
                      <Badge variant="outline" className="text-[9px] shrink-0">{v.policyName}</Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5" data-testid={`violation-suggestion-${i}`}>{v.suggestion}</p>
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5">Rule: {v.ruleName}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 p-3 rounded-md bg-green-500/10 border border-green-500/30">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <span className="text-sm text-green-600 dark:text-green-400">All policy checks passed. Skill is compliant.</span>
            </div>
          )}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <TabsList className="shrink-0 mx-3 mt-3" data-testid="tabs-studio">
          <TabsTrigger value="editor" data-testid="tab-editor">
            <FileText className="w-3.5 h-3.5 mr-1.5" /> Editor
          </TabsTrigger>
          <TabsTrigger value="builder" data-testid="tab-builder">
            <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Instruction Builder
          </TabsTrigger>
          <TabsTrigger value="sandbox" data-testid="tab-sandbox">
            <Play className="w-3.5 h-3.5 mr-1.5" /> Sandbox
          </TabsTrigger>
          <TabsTrigger value="versions" data-testid="tab-versions">
            <GitBranch className="w-3.5 h-3.5 mr-1.5" /> Versions
          </TabsTrigger>
          <TabsTrigger value="dependencies" data-testid="tab-dependencies">
            <Network className="w-3.5 h-3.5 mr-1.5" /> Dependencies
            {depValidation?.hasBrokenDependencies && <Unlink className="w-3 h-3 ml-1 text-red-500" />}
          </TabsTrigger>
          <TabsTrigger value="eval" data-testid="tab-eval">
            <Activity className="w-3.5 h-3.5 mr-1.5" /> Eval Results
          </TabsTrigger>
          <TabsTrigger value="knowledge-queries" data-testid="tab-knowledge-queries">
            <Database className="w-3.5 h-3.5 mr-1.5" /> Knowledge Queries
          </TabsTrigger>
        </TabsList>

        <TabsContent value="editor" className="flex-1 min-h-0 mt-0">
          <ScrollArea className="h-full">
            <div className="p-5 space-y-5">
              {!markdownBody && !description && (
                <Card className="border-dashed" data-testid="card-getting-started">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="rounded-md bg-primary/10 p-2 shrink-0">
                        <Sparkles className="w-5 h-5 text-primary" />
                      </div>
                      <div className="space-y-2 min-w-0">
                        <p className="text-sm font-medium">Getting Started</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Build your agent skill in two parts: <strong>Step 1</strong> fill in the metadata on the left (name, description, industry, etc.) and <strong>Step 2</strong> write the instructions on the right using markdown. Use the template buttons to quickly scaffold common sections, or switch to the <strong>Instruction Builder</strong> tab to have AI generate everything from a plain-language description.
                        </p>
                        <div className="flex items-center gap-2 flex-wrap pt-1">
                          <Button variant="outline" size="sm" onClick={() => setActiveTab("builder")} data-testid="button-try-ai-builder">
                            <Sparkles className="w-3 h-3 mr-1" /> Try AI Instruction Builder
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="flex items-center gap-6 text-xs text-muted-foreground" data-testid="progress-steps">
                <div className="flex items-center gap-1.5">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold ${name && description ? "bg-primary text-primary-foreground" : "border border-muted-foreground/40"}`}>1</div>
                  <span className={name && description ? "text-foreground font-medium" : ""}>Metadata</span>
                </div>
                <div className="h-px flex-1 max-w-8 bg-border" />
                <div className="flex items-center gap-1.5">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold ${markdownBody ? "bg-primary text-primary-foreground" : "border border-muted-foreground/40"}`}>2</div>
                  <span className={markdownBody ? "text-foreground font-medium" : ""}>Instructions</span>
                </div>
                <div className="h-px flex-1 max-w-8 bg-border" />
                <div className="flex items-center gap-1.5">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold ${name && description && markdownBody ? "bg-primary text-primary-foreground" : "border border-muted-foreground/40"}`}>3</div>
                  <span className={name && description && markdownBody ? "text-foreground font-medium" : ""}>Save & Test</span>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Step 1: Skill Metadata</h3>
                  </div>
                  <p className="text-xs text-muted-foreground -mt-2">Define what the skill is, which industry it applies to, and its classification details.</p>
                  <Separator />
                  <div className="space-y-1.5">
                    <Label htmlFor="skill-name">Name</Label>
                    <Input id="skill-name" value={name} onChange={e => { setName(e.target.value); clearValidation(); }} placeholder="e.g., Real-Time Sanctions Screening" data-testid="input-name" />
                    <p className="text-[11px] text-muted-foreground">A clear, descriptive name for this skill</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="skill-description">Description</Label>
                    <OntologyAutocomplete value={description} onChange={handleDescriptionChange} industry={industry} multiline rows={3} placeholder="Describe what this skill does, when it activates, and what outcome it produces..." testId="input-description" />
                    <DescriptionQualityBar score={qualityScore} feedback={qualityFeedback} />
                    <p className="text-[11px] text-muted-foreground">Type to get ontology-aware suggestions from your industry knowledge graph</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Industry</Label>
                    <Select value={industry} onValueChange={(val) => { setIndustry(val); validateOntologyTags(tags, val); }}>
                      <SelectTrigger data-testid="select-industry">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="financial_services">Financial Services</SelectItem>
                        <SelectItem value="healthcare">Healthcare</SelectItem>
                        <SelectItem value="manufacturing">Manufacturing</SelectItem>
                        <SelectItem value="retail">Retail</SelectItem>
                        <SelectItem value="technology_saas">Technology / SaaS</SelectItem>
                        <SelectItem value="custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="skill-domain">Domain</Label>
                    <OntologyAutocomplete value={domain} onChange={(val) => { setDomain(val); clearValidation(); }} industry={industry} placeholder="e.g., KYC/AML, Claims Processing" testId="input-domain" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="skill-tags">Tags (comma-separated)</Label>
                    <OntologyAutocomplete value={tags} onChange={(val) => { setTags(val); validateOntologyTags(val, industry); }} industry={industry} placeholder="compliance, fraud, kyc" testId="input-tags" />
                    {(() => {
                      const parsedTags = tags.split(",").map(t => t.trim()).filter(Boolean);
                      if (parsedTags.length === 0) return null;
                      return (
                        <div className="space-y-1.5 mt-1.5" data-testid="ontology-tag-validation">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {parsedTags.map((tag, idx) => {
                              const isResolved = tagValidation?.resolved.some(r => r.tag === tag);
                              const isUnresolved = tagValidation?.unresolvedTags.includes(tag);
                              const resolvedInfo = tagValidation?.resolved.find(r => r.tag === tag);
                              return (
                                <div key={idx} className="flex items-center gap-1" data-testid={`tag-resolution-${idx}`}>
                                  <Badge
                                    variant="outline"
                                    className={`text-[10px] gap-1 ${
                                      isResolved
                                        ? "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30"
                                        : isUnresolved
                                          ? "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/30"
                                          : ""
                                    } no-default-hover-elevate no-default-active-elevate`}
                                  >
                                    {tagValidating ? (
                                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                    ) : isResolved ? (
                                      <CheckCircle className="w-2.5 h-2.5 text-green-500" />
                                    ) : isUnresolved ? (
                                      <AlertTriangle className="w-2.5 h-2.5 text-yellow-500" />
                                    ) : null}
                                    {tag}
                                  </Badge>
                                  {isResolved && resolvedInfo && (
                                    <span className="text-[9px] text-muted-foreground" data-testid={`tag-concept-${idx}`}>
                                      {resolvedInfo.conceptLabel}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          {tagValidation && tagValidation.unresolvedTags.length > 0 && (
                            <p className="text-[10px] text-yellow-600 dark:text-yellow-400" data-testid="text-unresolved-tags-warning">
                              {tagValidation.unresolvedTags.length} tag{tagValidation.unresolvedTags.length !== 1 ? "s" : ""} don't match any known ontology concept
                            </p>
                          )}
                          {tagValidation && tagValidation.unresolvedTags.length === 0 && tagValidation.totalTags > 0 && (
                            <p className="text-[10px] text-green-600 dark:text-green-400" data-testid="text-all-tags-resolved">
                              All tags resolve to ontology concepts
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {(() => {
                    const allText = `${description} ${domain}`;
                    const upperSnakeTokens = allText.match(/[A-Z][A-Z0-9_]{2,}/g) || [];
                    const uniqueTokens = Array.from(new Set(upperSnakeTokens));
                    const matchedTerms = uniqueTokens.filter(token =>
                      ontologyTerms.some(t => t.label.replace(/\s+/g, "_").toUpperCase() === token)
                    );
                    if (matchedTerms.length === 0) return null;
                    return (
                      <div className="space-y-1.5" data-testid="ontology-terms-referenced">
                        <p className="text-[11px] font-medium text-muted-foreground">Ontology Terms Referenced</p>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {matchedTerms.map(token => (
                            <Badge key={token} variant="secondary" className="text-[10px] bg-purple-500/15 text-purple-600 dark:text-purple-400 no-default-hover-elevate no-default-active-elevate">
                              {token}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  <Separator />
                  <p className="text-xs text-muted-foreground font-medium">Advanced Configuration</p>

                  {depValidation?.hasBrokenDependencies && (
                    <div className="flex items-center gap-2 p-2.5 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800" data-testid="alert-broken-deps">
                      <Unlink className="w-4 h-4 text-red-500 shrink-0" />
                      <div className="text-xs text-red-700 dark:text-red-400">
                        <span className="font-medium">Broken dependencies detected.</span> {depValidation.brokenTools.length > 0 && `${depValidation.brokenTools.length} tool(s)`}{depValidation.brokenTools.length > 0 && depValidation.brokenServers.length > 0 && ", "}{depValidation.brokenServers.length > 0 && `${depValidation.brokenServers.length} server(s)`} not found in registry.
                      </div>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor="skill-allowed-tools">Allowed Tools</Label>
                      {registeredMcpTools.length > 0 && (
                        <Select
                          value=""
                          onValueChange={(val) => {
                            const current = allowedTools.split("\n").map(t => t.trim()).filter(Boolean);
                            if (!current.includes(val)) {
                              setAllowedTools([...current, val].join("\n"));
                              clearValidation();
                            }
                          }}
                        >
                          <SelectTrigger className="w-[220px]" data-testid="select-add-tool">
                            <Plus className="w-3 h-3 mr-1" />
                            <span className="text-xs">Add from registry</span>
                          </SelectTrigger>
                          <SelectContent>
                            {registeredMcpTools.map(tool => {
                              const srv = registeredMcpServers.find(s => s.id === tool.serverId);
                              return (
                                <SelectItem key={tool.id} value={tool.name} data-testid={`option-tool-${tool.id}`}>
                                  <span className="text-xs">{tool.name}</span>
                                  {srv && <span className="text-[10px] text-muted-foreground ml-1">({srv.name})</span>}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                    {toolRefsList.length > 0 ? (
                      <div className="space-y-1" data-testid="list-allowed-tools">
                        {toolRefsList.map((ref, idx) => {
                          const validation = depValidation?.tools.find(t => t.ref === ref);
                          const isBroken = validation ? !validation.valid : false;
                          return (
                            <div key={idx} className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md border text-xs ${isBroken ? "border-red-300 bg-red-50/50 dark:border-red-800 dark:bg-red-900/10" : "border-border"}`} data-testid={`tool-ref-${idx}`}>
                              <div className="flex items-center gap-2 min-w-0">
                                {isBroken ? (
                                  <Unlink className="w-3.5 h-3.5 text-red-500 shrink-0" data-testid={`icon-broken-tool-${idx}`} />
                                ) : (
                                  <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />
                                )}
                                <span className="truncate">{ref}</span>
                                {validation?.serverName && !isBroken && (
                                  <span className="text-[10px] text-muted-foreground shrink-0">({validation.serverName})</span>
                                )}
                                {isBroken && (
                                  <Badge variant="secondary" className="text-[9px] px-1.5 py-0 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 no-default-hover-elevate no-default-active-elevate shrink-0">Not in registry</Badge>
                                )}
                              </div>
                              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => {
                                const updated = toolRefsList.filter((_, i) => i !== idx);
                                setAllowedTools(updated.join("\n"));
                                clearValidation();
                              }} data-testid={`button-remove-tool-${idx}`}>
                                <XCircle className="w-3 h-3" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground py-1">No tools configured. Add tools from the MCP Server Registry.</p>
                    )}
                    <Textarea id="skill-allowed-tools" value={allowedTools} onChange={e => { setAllowedTools(e.target.value); clearValidation(); }} rows={2} placeholder="mcp:sanctions-api&#10;tool:search" className="text-[11px]" data-testid="input-allowed-tools" />
                    <p className="text-[11px] text-muted-foreground">Type tool names manually or select from the registry above</p>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor="skill-mcp-servers">Required MCP Servers</Label>
                      {registeredMcpServers.length > 0 && (
                        <Select
                          value=""
                          onValueChange={(val) => {
                            const current = requiredMcpServers.split("\n").map(t => t.trim()).filter(Boolean);
                            if (!current.includes(val)) {
                              setRequiredMcpServers([...current, val].join("\n"));
                            }
                          }}
                        >
                          <SelectTrigger className="w-[220px]" data-testid="select-add-server">
                            <Plus className="w-3 h-3 mr-1" />
                            <span className="text-xs">Add from registry</span>
                          </SelectTrigger>
                          <SelectContent>
                            {registeredMcpServers.map(srv => (
                              <SelectItem key={srv.id} value={srv.name} data-testid={`option-server-${srv.id}`}>
                                <span className="text-xs">{srv.name}</span>
                                <Badge variant="secondary" className="ml-1 text-[9px] py-0 no-default-hover-elevate no-default-active-elevate">{srv.status}</Badge>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                    {serverRefsList.length > 0 ? (
                      <div className="space-y-1" data-testid="list-required-servers">
                        {serverRefsList.map((ref, idx) => {
                          const validation = depValidation?.servers.find(s => s.ref === ref);
                          const isBroken = validation ? !validation.valid : false;
                          return (
                            <div key={idx} className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md border text-xs ${isBroken ? "border-red-300 bg-red-50/50 dark:border-red-800 dark:bg-red-900/10" : "border-border"}`} data-testid={`server-ref-${idx}`}>
                              <div className="flex items-center gap-2 min-w-0">
                                {isBroken ? (
                                  <Unlink className="w-3.5 h-3.5 text-red-500 shrink-0" data-testid={`icon-broken-server-${idx}`} />
                                ) : (
                                  <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />
                                )}
                                <span className="truncate">{ref}</span>
                                {isBroken && (
                                  <Badge variant="secondary" className="text-[9px] px-1.5 py-0 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 no-default-hover-elevate no-default-active-elevate shrink-0">Not in registry</Badge>
                                )}
                              </div>
                              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => {
                                const updated = serverRefsList.filter((_, i) => i !== idx);
                                setRequiredMcpServers(updated.join("\n"));
                              }} data-testid={`button-remove-server-${idx}`}>
                                <XCircle className="w-3 h-3" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground py-1">No servers required. Add servers from the MCP Server Registry.</p>
                    )}
                    <Textarea id="skill-mcp-servers" value={requiredMcpServers} onChange={e => setRequiredMcpServers(e.target.value)} rows={2} placeholder="compliance-server&#10;data-warehouse" className="text-[11px]" data-testid="input-mcp-servers" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="skill-data-class">Required Data Classifications (one per line)</Label>
                    <Textarea id="skill-data-class" value={requiredDataClassifications} onChange={e => { setRequiredDataClassifications(e.target.value); clearValidation(); }} rows={2} placeholder="PII&#10;financial-records" data-testid="input-data-classifications" />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="skill-disable-model">Disable Model Invocation</Label>
                      <p className="text-[11px] text-muted-foreground">Prevent the skill from calling LLM models</p>
                    </div>
                    <Switch id="skill-disable-model" checked={disableModelInvocation} onCheckedChange={setDisableModelInvocation} data-testid="switch-disable-model" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Context Mode</Label>
                    <Select value={contextMode} onValueChange={setContextMode}>
                      <SelectTrigger data-testid="select-context-mode">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fork">Fork (isolated context)</SelectItem>
                        <SelectItem value="inline">Inline (shared context)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="skill-user-invocable">User Invocable</Label>
                      <p className="text-[11px] text-muted-foreground">Allow users to trigger this skill manually</p>
                    </div>
                    <Switch id="skill-user-invocable" checked={userInvocable} onCheckedChange={setUserInvocable} data-testid="switch-user-invocable" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="skill-version">Version</Label>
                    <Input id="skill-version" value={version} onChange={e => setVersion(e.target.value)} data-testid="input-version" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Complexity</Label>
                    <Select value={complexity} onValueChange={setComplexity}>
                      <SelectTrigger data-testid="select-complexity">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="beginner">Beginner</SelectItem>
                        <SelectItem value="intermediate">Intermediate</SelectItem>
                        <SelectItem value="advanced">Advanced</SelectItem>
                        <SelectItem value="expert">Expert</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Step 2: Skill Instructions</h3>
                  </div>
                  <p className="text-xs text-muted-foreground -mt-1">Write step-by-step instructions the agent follows when this skill activates. Use the template buttons below to add common sections.</p>
                  <Separator />
                  <div className="flex items-center gap-2 flex-wrap">
                    {Object.keys(SECTION_TEMPLATES).map(key => (
                      <Button key={key} variant="outline" size="sm" onClick={() => insertTemplate(key)} data-testid={`button-add-${key.toLowerCase().replace(/\s/g, "-")}`}>
                        <Plus className="w-3 h-3 mr-1" /> {key}
                      </Button>
                    ))}
                  </div>
                  {showPreview ? (
                    <Card>
                      <CardContent className="p-4">
                        {renderPreview()}
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="relative">
                      <Textarea
                        value={markdownBody}
                        onChange={e => { setMarkdownBody(e.target.value); clearValidation(); }}
                        rows={24}
                        className="font-mono text-sm"
                        placeholder={"# Skill Instructions\n\nClick a template button above to get started, or write your own instructions.\n\nExample structure:\n- Trigger Conditions: When should this skill activate?\n- Procedure: What steps should the agent follow?\n- Decision Tree: How should the agent handle different scenarios?\n- Edge Cases: What unusual situations should be handled?\n- Output Format: What should the result look like?"}
                        data-testid="input-markdown-body"
                      />
                    </div>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button variant="outline" size="sm" onClick={() => setShowPreview(!showPreview)} data-testid="button-toggle-preview">
                      {showPreview ? <EyeOff className="w-3.5 h-3.5 mr-1.5" /> : <Eye className="w-3.5 h-3.5 mr-1.5" />}
                      {showPreview ? "Edit" : "Preview"}
                    </Button>
                    {name && description && markdownBody && (
                      <Button size="sm" onClick={handleSave} disabled={saving} data-testid="button-save-bottom">
                        {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                        Save Skill
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="builder" className="flex-1 min-h-0 mt-0">
          <ScrollArea className="h-full">
            <div className="p-5 space-y-4 max-w-3xl">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Sparkles className="w-4 h-4" /> AI Instruction Builder
              </h3>
              <Separator />
              <div className="space-y-1.5">
                <Label htmlFor="builder-input">Describe the workflow</Label>
                <Textarea
                  id="builder-input"
                  value={builderInput}
                  onChange={e => setBuilderInput(e.target.value)}
                  rows={6}
                  placeholder="Describe the workflow this skill should handle in plain language..."
                  data-testid="input-builder-description"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="builder-skill-name">Skill Name (optional)</Label>
                <Input id="builder-skill-name" value={builderSkillName} onChange={e => setBuilderSkillName(e.target.value)} placeholder="e.g., Transaction Monitoring" data-testid="input-builder-skill-name" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Industry</Label>
                  <Select value={builderIndustry} onValueChange={setBuilderIndustry}>
                    <SelectTrigger data-testid="select-builder-industry">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="financial_services">Financial Services</SelectItem>
                      <SelectItem value="healthcare">Healthcare</SelectItem>
                      <SelectItem value="manufacturing">Manufacturing</SelectItem>
                      <SelectItem value="retail">Retail</SelectItem>
                      <SelectItem value="technology_saas">Technology / SaaS</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="builder-domain">Domain</Label>
                  <Input id="builder-domain" value={builderDomain} onChange={e => setBuilderDomain(e.target.value)} placeholder="e.g., Compliance" data-testid="input-builder-domain" />
                </div>
              </div>
              <Button onClick={handleGenerate} disabled={builderLoading || !builderInput} data-testid="button-generate-skill">
                {builderLoading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1.5" />}
                {builderLoading ? "Generating..." : "Generate SKILL.md"}
              </Button>

              {builderResult && (
                <Card data-testid="card-builder-result">
                  <CardHeader>
                    <CardTitle className="text-sm">Generated Skill</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {builderResult.name && (
                      <div>
                        <span className="text-xs font-medium text-muted-foreground">Name:</span>
                        <p className="text-sm font-medium" data-testid="text-generated-name">{builderResult.name}</p>
                      </div>
                    )}
                    {builderResult.description && (
                      <div>
                        <span className="text-xs font-medium text-muted-foreground">Description:</span>
                        <p className="text-sm" data-testid="text-generated-description">{builderResult.description}</p>
                      </div>
                    )}
                    {builderResult.markdownBody && (
                      <div>
                        <span className="text-xs font-medium text-muted-foreground">Markdown Body:</span>
                        <ScrollArea className="h-48 mt-1">
                          <pre className="text-xs bg-muted p-3 rounded-md whitespace-pre-wrap" data-testid="text-generated-markdown">{builderResult.markdownBody}</pre>
                        </ScrollArea>
                      </div>
                    )}
                    {builderResult.dependencies && Array.isArray(builderResult.dependencies) && builderResult.dependencies.length > 0 && (
                      <div>
                        <span className="text-xs font-medium text-muted-foreground">Dependencies:</span>
                        <div className="flex gap-1 flex-wrap mt-1">
                          {builderResult.dependencies.map((d: any, i: number) => (
                            <Badge key={i} variant="outline" className="text-[10px]">{typeof d === "string" ? d : d.name}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {builderResult.tags && Array.isArray(builderResult.tags) && builderResult.tags.length > 0 && (
                      <div>
                        <span className="text-xs font-medium text-muted-foreground">Tags:</span>
                        <div className="flex gap-1 flex-wrap mt-1">
                          {builderResult.tags.map((t: string, i: number) => (
                            <Badge key={i} variant="secondary" className="text-[10px]">{t}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    <Separator />
                    <Button onClick={applyBuilderResult} data-testid="button-apply-generated">
                      Apply to Editor
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="sandbox" className="flex-1 min-h-0 mt-0">
          <ScrollArea className="h-full">
            <div className="p-5 space-y-4">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Play className="w-4 h-4" /> Skill Testing Sandbox
              </h3>
              <Separator />
              <div className="space-y-1.5">
                <Label htmlFor="test-scenario">Test Scenario</Label>
                <Textarea
                  id="test-scenario"
                  value={testScenario}
                  onChange={e => setTestScenario(e.target.value)}
                  rows={4}
                  placeholder="Describe a scenario to test this skill against..."
                  data-testid="input-test-scenario"
                />
              </div>
              <Button onClick={handleRunTest} disabled={testLoading || !testScenario} data-testid="button-run-test">
                {testLoading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Play className="w-4 h-4 mr-1.5" />}
                {testLoading ? "Running..." : "Run Test"}
              </Button>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SandboxResultCard title="With Skill" result={withSkillResult} loading={testLoading} />
                <SandboxResultCard title="Without Skill" result={withoutSkillResult} loading={testLoading} />
              </div>
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="versions" className="flex-1 min-h-0 mt-0">
          <ScrollArea className="h-full">
            <div className="p-5 space-y-4">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <GitBranch className="w-4 h-4" /> Version Control
              </h3>
              <Separator />
              <div className="flex items-end gap-3 flex-wrap">
                <div className="space-y-1.5 flex-1 min-w-[200px]">
                  <Label htmlFor="version-changelog">Changelog</Label>
                  <Input id="version-changelog" value={versionChangelog} onChange={e => setVersionChangelog(e.target.value)} placeholder="Describe changes..." data-testid="input-version-changelog" />
                </div>
                <Button onClick={handleSaveVersion} disabled={savingVersion} data-testid="button-save-version">
                  {savingVersion ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
                  Save Version
                </Button>
              </div>

              <div className="space-y-2">
                {versions.length === 0 ? (
                  <p className="text-sm text-muted-foreground" data-testid="text-no-versions">No versions saved yet</p>
                ) : (
                  versions.map((ver) => (
                    <Card
                      key={ver.id}
                      className={`hover-elevate cursor-pointer ${selectedVersion?.id === ver.id ? "ring-2 ring-ring" : ""}`}
                      onClick={() => setSelectedVersion(selectedVersion?.id === ver.id ? null : ver)}
                      data-testid={`card-version-${ver.id}`}
                    >
                      <CardContent className="p-3 flex items-center gap-3 flex-wrap">
                        <Badge variant="outline" className="text-xs" data-testid={`badge-ver-${ver.id}`}>v{ver.version}</Badge>
                        <span className="text-sm font-medium flex-1">{ver.changeLog || "No changelog"}</span>
                        <span className="text-xs text-muted-foreground">{ver.author}</span>
                        <span className="text-xs text-muted-foreground">
                          {ver.createdAt ? new Date(ver.createdAt).toLocaleDateString() : ""}
                        </span>
                        {ver.promotedToProduction && <Badge variant="secondary" className="text-[10px]">Production</Badge>}
                        {(ver.shadowReplayResults as any) && <Badge variant="outline" className="text-[10px]">Shadow Results</Badge>}
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>

              {selectedVersion && (
                <Card data-testid="card-version-diff">
                  <CardHeader>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <CardTitle className="text-sm">Version Diff: v{selectedVersion.version}</CardTitle>
                      <Button variant="outline" size="sm" onClick={() => handleRollback(selectedVersion)} data-testid="button-rollback">
                        <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Rollback
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Current</p>
                        <pre className="text-xs bg-muted p-3 rounded-md whitespace-pre-wrap max-h-64 overflow-auto" data-testid="text-diff-current">{markdownBody || "(empty)"}</pre>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">v{selectedVersion.version}</p>
                        <pre className="text-xs bg-muted p-3 rounded-md whitespace-pre-wrap max-h-64 overflow-auto" data-testid="text-diff-version">{selectedVersion.markdownBody || "(empty)"}</pre>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="dependencies" className="flex-1 min-h-0 mt-0">
          <ScrollArea className="h-full">
            <div className="p-5 space-y-4">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Network className="w-4 h-4" /> Dependency Graph
              </h3>
              <Separator />

              <div className="flex items-center justify-center mb-4">
                <Badge variant="default" className="text-sm" data-testid="badge-skill-center">{skill.name}</Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {toolsList.length > 0 && (
                  <Card data-testid="card-dep-mcp-tools">
                    <CardHeader>
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Wrench className="w-4 h-4" /> MCP Tools
                        {depValidation?.brokenTools && depValidation.brokenTools.length > 0 && (
                          <Badge variant="secondary" className="text-[9px] px-1.5 py-0 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 no-default-hover-elevate no-default-active-elevate">
                            {depValidation.brokenTools.length} broken
                          </Badge>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {toolsList.map((tool, i) => {
                        const vResult = depValidation?.tools.find(t => t.ref === tool);
                        const isBroken = vResult ? !vResult.valid : false;
                        return (
                          <div key={i} className={`flex items-center gap-2 ${isBroken ? "text-red-600 dark:text-red-400" : ""}`} data-testid={`dep-tool-${i}`}>
                            {isBroken ? <Unlink className="w-3.5 h-3.5 text-red-500" /> : isDeprecated(tool) ? <Flag className="w-3.5 h-3.5 text-red-500" /> : <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
                            <span className="text-sm flex-1">{tool}</span>
                            {isBroken ? (
                              <Badge variant="secondary" className="text-[9px] px-1.5 py-0 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 no-default-hover-elevate no-default-active-elevate">not in registry</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px]">tool</Badge>
                            )}
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                )}

                {serversList.length > 0 && (
                  <Card data-testid="card-dep-mcp-servers">
                    <CardHeader>
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Server className="w-4 h-4" /> MCP Servers
                        {depValidation?.brokenServers && depValidation.brokenServers.length > 0 && (
                          <Badge variant="secondary" className="text-[9px] px-1.5 py-0 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 no-default-hover-elevate no-default-active-elevate">
                            {depValidation.brokenServers.length} broken
                          </Badge>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {serversList.map((srv, i) => {
                        const vResult = depValidation?.servers.find(s => s.ref === srv);
                        const isBroken = vResult ? !vResult.valid : false;
                        return (
                          <div key={i} className={`flex items-center gap-2 ${isBroken ? "text-red-600 dark:text-red-400" : ""}`} data-testid={`dep-server-${i}`}>
                            {isBroken ? <Unlink className="w-3.5 h-3.5 text-red-500" /> : isDeprecated(srv) ? <Flag className="w-3.5 h-3.5 text-red-500" /> : <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
                            <span className="text-sm flex-1">{srv}</span>
                            {isBroken ? (
                              <Badge variant="secondary" className="text-[9px] px-1.5 py-0 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 no-default-hover-elevate no-default-active-elevate">not in registry</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px]">server</Badge>
                            )}
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                )}

                {dataSources.length > 0 && (
                  <Card data-testid="card-dep-data-sources">
                    <CardHeader>
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Database className="w-4 h-4" /> Data Sources
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {dataSources.map((ds, i) => (
                        <div key={i} className="flex items-center gap-2">
                          {isDeprecated(ds.name) ? <Flag className="w-3.5 h-3.5 text-red-500" /> : <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
                          <span className="text-sm flex-1">{ds.name}</span>
                          <Badge variant="outline" className="text-[10px]">data-source</Badge>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {skillDeps.length > 0 && (
                  <Card data-testid="card-dep-skills">
                    <CardHeader>
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Layers className="w-4 h-4" /> Other Skills
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {skillDeps.map((sd, i) => (
                        <div key={i} className="flex items-center gap-2">
                          {isDeprecated(sd.name) ? <Flag className="w-3.5 h-3.5 text-red-500" /> : <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
                          <span className="text-sm flex-1">{sd.name}</span>
                          <Badge variant="outline" className="text-[10px]">skill</Badge>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {policyDeps.length > 0 && (
                  <Card data-testid="card-dep-policies">
                    <CardHeader>
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Shield className="w-4 h-4" /> Policies
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {policyDeps.map((pd, i) => (
                        <div key={i} className="flex items-center gap-2">
                          {isDeprecated(pd.name) ? <Flag className="w-3.5 h-3.5 text-red-500" /> : <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
                          <span className="text-sm flex-1">{pd.name}</span>
                          <Badge variant="outline" className="text-[10px]">policy</Badge>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {toolsList.length === 0 && serversList.length === 0 && deps.length === 0 && (
                  <Card className="col-span-full">
                    <CardContent className="py-8 text-center">
                      <Network className="w-8 h-8 mx-auto text-muted-foreground/50 mb-2" />
                      <p className="text-sm text-muted-foreground" data-testid="text-no-dependencies">No dependencies configured</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="eval" className="flex-1 min-h-0 mt-0">
          <ScrollArea className="h-full">
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Activity className="w-4 h-4" /> Skill Evaluation Results
                </h3>
                <Button size="sm" onClick={handleRunEval} disabled={runningEval} data-testid="button-run-eval-tab">
                  {runningEval ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-1.5" />}
                  {runningEval ? "Running..." : "Run Eval"}
                </Button>
              </div>
              <Separator />
              <SkillEvalResultsPanel skillId={id} />
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="knowledge-queries" className="flex-1 min-h-0 mt-0">
          <ScrollArea className="h-full">
            <div className="p-5 space-y-4">
              <KnowledgeQueriesPanel skillId={id} industry={skill?.industry || "general"} />
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SkillEvalResultsPanel({ skillId }: { skillId: string }) {
  const { data, isLoading } = useQuery<{
    run: any;
    caseResults: any[];
    failingCases: any[];
  }>({
    queryKey: ["/api/eval/results", skillId],
    queryFn: async () => {
      const res = await fetch(`/api/eval/results?skill_id=${skillId}`);
      if (!res.ok) throw new Error("Failed to load eval results");
      return res.json();
    },
    enabled: !!skillId,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!data?.run) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Activity className="w-8 h-8 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground" data-testid="text-no-eval">No evaluation runs yet. Click "Run Eval" to generate test cases and evaluate this skill.</p>
        </CardContent>
      </Card>
    );
  }

  const run = data.run;
  const passRate = run.passRate ?? 0;

  return (
    <div className="space-y-4">
      <Card data-testid="card-eval-summary">
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Pass Rate</p>
              <p className={`text-xl font-bold ${passRate >= 90 ? "text-green-600 dark:text-green-400" : passRate >= 70 ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400"}`} data-testid="text-pass-rate">
                {passRate.toFixed(1)}%
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Cases</p>
              <p className="text-xl font-bold" data-testid="text-total-cases">{run.totalCases || data.caseResults?.length || 0}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <Badge
                variant="secondary"
                className={`no-default-hover-elevate no-default-active-elevate ${run.status === "completed" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"}`}
                data-testid="badge-eval-status"
              >
                {run.status}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Run Date</p>
              <p className="text-sm flex items-center gap-1" data-testid="text-eval-date">
                <Clock className="w-3 h-3" />
                {new Date(run.completedAt || run.startedAt || run.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>
          {(run.avgLatencyMs != null || run.totalLatencyMs != null) && (
            <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
              <span>Avg Latency: {run.avgLatencyMs ?? run.totalLatencyMs}ms</span>
              {(run.avgCostUsd != null || run.totalCost != null) && <span>Avg Cost: ${Number(run.avgCostUsd ?? run.totalCost).toFixed(4)}</span>}
            </div>
          )}
        </CardContent>
      </Card>

      {data.failingCases.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <XOctagon className="w-4 h-4 text-red-500" /> Failing Test Cases ({data.failingCases.length})
          </h4>
          <div className="space-y-2">
            {data.failingCases.map((cr: any, i: number) => (
              <Card key={cr.id || i} data-testid={`card-failing-case-${i}`}>
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">Case {cr.caseId?.slice(0, 8) || i + 1}</p>
                      {cr.failingStep && (
                        <p className="text-xs text-muted-foreground mt-0.5">Step: {cr.failingStep}</p>
                      )}
                    </div>
                    <Badge variant="destructive" className="text-[10px] shrink-0 no-default-hover-elevate no-default-active-elevate">
                      fail
                    </Badge>
                  </div>
                  {cr.failingReason && (
                    <div className="mt-2 text-xs">
                      <p className="text-muted-foreground mb-0.5">Reason:</p>
                      <pre className="bg-muted rounded p-2 overflow-x-auto text-[10px] whitespace-pre-wrap">{cr.failingReason}</pre>
                    </div>
                  )}
                  {cr.actualOutput && (
                    <div className="mt-2 text-xs">
                      <p className="text-muted-foreground mb-0.5">Actual Output:</p>
                      <pre className="bg-muted rounded p-2 overflow-x-auto text-[10px]">{typeof cr.actualOutput === "string" ? cr.actualOutput : JSON.stringify(cr.actualOutput, null, 2)}</pre>
                    </div>
                  )}
                  {cr.latencyMs != null && (
                    <div className="mt-1 flex items-center gap-3 text-[10px] text-muted-foreground">
                      <span>Latency: {cr.latencyMs}ms</span>
                      {cr.costUsd != null && <span>Cost: ${Number(cr.costUsd).toFixed(4)}</span>}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {data.failingCases.length === 0 && (
        <Card>
          <CardContent className="py-6 text-center">
            <CheckCircle className="w-8 h-8 mx-auto text-green-500 mb-2" />
            <p className="text-sm text-muted-foreground" data-testid="text-all-pass">All test cases passed</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface KGQueryTemplate {
  id: string;
  name: string;
  description: string;
  queryPattern: string;
  variables: string[];
  category: string;
  createdAt: string;
}

function KnowledgeQueriesPanel({ skillId, industry }: { skillId: string; industry: string }) {
  const { toast } = useToast();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formPattern, setFormPattern] = useState("");
  const [formVars, setFormVars] = useState("");
  const [formCategory, setFormCategory] = useState("regulatory");
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testVarValues, setTestVarValues] = useState<Record<string, string>>({});
  const [testResults, setTestResults] = useState<any>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: queries = [], isLoading, refetch } = useQuery<KGQueryTemplate[]>({
    queryKey: ["/api/skills", skillId, "knowledge-queries"],
  });

  const resetForm = () => {
    setFormName(""); setFormDesc(""); setFormPattern(""); setFormVars(""); setFormCategory("regulatory");
    setShowAddForm(false); setEditingId(null);
  };

  const startEdit = (q: KGQueryTemplate) => {
    setFormName(q.name); setFormDesc(q.description); setFormPattern(q.queryPattern);
    setFormVars(q.variables.join(", ")); setFormCategory(q.category);
    setEditingId(q.id); setShowAddForm(true);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formPattern.trim()) {
      toast({ title: "Name and query pattern are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const variables = formVars.split(",").map(v => v.trim()).filter(Boolean);
      const body = { name: formName, description: formDesc, queryPattern: formPattern, variables, category: formCategory };
      if (editingId) {
        await apiRequest("PATCH", `/api/skills/${skillId}/knowledge-queries/${editingId}`, body);
        toast({ title: "Query template updated" });
      } else {
        await apiRequest("POST", `/api/skills/${skillId}/knowledge-queries`, body);
        toast({ title: "Query template added" });
      }
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["/api/skills", skillId, "knowledge-queries"] });
    } catch (e: any) {
      toast({ title: "Error saving template", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (queryId: string) => {
    try {
      await apiRequest("DELETE", `/api/skills/${skillId}/knowledge-queries/${queryId}`);
      toast({ title: "Query template deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/skills", skillId, "knowledge-queries"] });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleTest = async (q: KGQueryTemplate) => {
    setTestingId(q.id);
    setTestLoading(true);
    setTestResults(null);
    try {
      const response = await apiRequest("POST", "/api/knowledge-graph/query-template/execute", {
        queryPattern: q.queryPattern,
        variables: testVarValues,
        industryId: industry,
      });
      const data = await response.json();
      setTestResults(data);
    } catch (e: any) {
      toast({ title: "Execution failed", description: e.message, variant: "destructive" });
    } finally {
      setTestLoading(false);
    }
  };

  const CATEGORY_OPTIONS = [
    { value: "regulatory", label: "Regulatory" },
    { value: "compliance", label: "Compliance" },
    { value: "risk", label: "Risk Assessment" },
    { value: "domain", label: "Domain Knowledge" },
    { value: "general", label: "General" },
  ];

  if (isLoading) return <Skeleton className="h-32" />;

  return (
    <div className="space-y-5" data-testid="panel-knowledge-queries">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Database className="w-4 h-4" /> Knowledge Graph Query Templates
          </h3>
          <p className="text-xs text-muted-foreground">
            Define KG queries that this skill executes at runtime. Use {"{variable}"} placeholders for dynamic parameters.
          </p>
        </div>
        <Button size="sm" onClick={() => { resetForm(); setShowAddForm(true); }} data-testid="button-add-kg-query">
          <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Query Template
        </Button>
      </div>

      <Separator />

      {showAddForm && (
        <Card className="border-primary/30" data-testid="card-kg-query-form">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">{editingId ? "Edit" : "New"} Query Template</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Name</Label>
                <Input
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="e.g., Regulatory Disclosure Lookup"
                  data-testid="input-kg-query-name"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Category</Label>
                <Select value={formCategory} onValueChange={setFormCategory}>
                  <SelectTrigger data-testid="select-kg-query-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description</Label>
              <Input
                value={formDesc}
                onChange={e => setFormDesc(e.target.value)}
                placeholder="What this query retrieves from the Knowledge Graph"
                data-testid="input-kg-query-desc"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Query Pattern</Label>
              <Textarea
                value={formPattern}
                onChange={e => setFormPattern(e.target.value)}
                placeholder="regulations applicable to {state} + {account_type}"
                rows={3}
                className="font-mono text-xs"
                data-testid="input-kg-query-pattern"
              />
              <p className="text-[10px] text-muted-foreground">
                Use {"{variable_name}"} for dynamic placeholders. At runtime, these are replaced with actual values from the skill context.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Variables (comma-separated)</Label>
              <Input
                value={formVars}
                onChange={e => setFormVars(e.target.value)}
                placeholder="state, account_type"
                data-testid="input-kg-query-vars"
              />
            </div>
            <div className="flex items-center gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={resetForm} data-testid="button-cancel-kg-query">Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={saving} data-testid="button-save-kg-query">
                {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                {editingId ? "Update" : "Save"} Template
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {queries.length === 0 && !showAddForm && (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center">
            <Database className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm font-medium mb-1">No Knowledge Graph queries defined</p>
            <p className="text-xs text-muted-foreground mb-4">
              Add query templates so this skill can dynamically retrieve domain knowledge from the Knowledge Graph at runtime.
            </p>
            <Button size="sm" variant="outline" onClick={() => setShowAddForm(true)} data-testid="button-add-first-query">
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Add First Query
            </Button>
          </CardContent>
        </Card>
      )}

      {queries.map(q => (
        <Card key={q.id} data-testid={`card-kg-query-${q.id}`}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium" data-testid={`text-kg-query-name-${q.id}`}>{q.name}</span>
                  <Badge variant="outline" className="text-[10px]">{q.category}</Badge>
                </div>
                {q.description && <p className="text-xs text-muted-foreground">{q.description}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(q)} data-testid={`button-edit-kg-query-${q.id}`}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={() => handleDelete(q.id)} data-testid={`button-delete-kg-query-${q.id}`}>
                  <XCircle className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            <div className="p-2.5 rounded-md bg-muted/50 font-mono text-xs leading-relaxed" data-testid={`text-kg-query-pattern-${q.id}`}>
              {q.queryPattern}
            </div>

            {q.variables.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Variables:</span>
                {q.variables.map(v => (
                  <Badge key={v} variant="secondary" className="text-[10px] font-mono">{`{${v}}`}</Badge>
                ))}
              </div>
            )}

            <Separator />

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Test Query</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { if (testingId === q.id) { setTestingId(null); setTestResults(null); } else { setTestingId(q.id); setTestVarValues({}); setTestResults(null); } }}
                  data-testid={`button-toggle-test-${q.id}`}
                >
                  <Play className="w-3 h-3 mr-1" /> {testingId === q.id ? "Close" : "Test"}
                </Button>
              </div>

              {testingId === q.id && (
                <div className="space-y-3 p-3 rounded-md border bg-muted/20">
                  {q.variables.length > 0 && (
                    <div className="grid grid-cols-2 gap-3">
                      {q.variables.map(v => (
                        <div key={v} className="space-y-1">
                          <Label className="text-[10px] font-mono">{`{${v}}`}</Label>
                          <Input
                            value={testVarValues[v] || ""}
                            onChange={e => setTestVarValues(prev => ({ ...prev, [v]: e.target.value }))}
                            placeholder={`Enter ${v}`}
                            className="h-8 text-xs"
                            data-testid={`input-test-var-${v}`}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                  <Button size="sm" onClick={() => handleTest(q)} disabled={testLoading} data-testid={`button-execute-test-${q.id}`}>
                    {testLoading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-1.5" />}
                    Execute Query
                  </Button>

                  {testResults && (
                    <div className="space-y-2 mt-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">{testResults.resultCount} results</Badge>
                        <span className="text-[10px] text-muted-foreground font-mono">Resolved: {testResults.resolvedQuery}</span>
                      </div>
                      {testResults.results?.map((r: any, i: number) => (
                        <div key={i} className="p-2.5 rounded-md bg-background border text-xs space-y-1" data-testid={`test-result-${i}`}>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{r.label}</span>
                            <Badge variant="secondary" className="text-[9px]">{r.category}</Badge>
                          </div>
                          <p className="text-muted-foreground text-[11px] line-clamp-2">{r.description}</p>
                          {r.enrichment?.regulatoryRelevance && (
                            <p className="text-[10px] text-amber-600 dark:text-amber-400">
                              <Shield className="w-3 h-3 inline mr-1" />
                              {r.enrichment.regulatoryRelevance}
                            </p>
                          )}
                          {r.linkedRegulations && (r.linkedRegulations as any[]).length > 0 && (
                            <div className="flex gap-1 flex-wrap mt-1">
                              {(r.linkedRegulations as any[]).slice(0, 5).map((reg: any, ri: number) => (
                                <Badge key={ri} variant="outline" className="text-[9px]">{typeof reg === "string" ? reg : reg.name || reg.id}</Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                      {testResults.resultCount === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-3">No matching concepts found. Try different variable values or check the Knowledge Graph.</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
