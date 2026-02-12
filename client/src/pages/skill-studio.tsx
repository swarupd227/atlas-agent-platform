import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import type { Skill, SkillVersion } from "@shared/schema";
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

export default function SkillStudio() {
  const [, params] = useRoute("/skills/studio/:id");
  const id = params?.id;
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

  const { data: versions = [] } = useQuery<SkillVersion[]>({
    queryKey: ["/api/skills", id, "versions"],
    enabled: !!id,
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

  const handleDescriptionChange = (val: string) => {
    setDescription(val);
    fetchQualityScore(val, industry, domain);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const parsedTags = tags.split(",").map(t => t.trim()).filter(Boolean);
      const parsedAllowedTools = allowedTools.split("\n").map(t => t.trim()).filter(Boolean);
      const parsedMcpServers = requiredMcpServers.split("\n").map(t => t.trim()).filter(Boolean);
      const parsedDataClassifications = requiredDataClassifications.split("\n").map(t => t.trim()).filter(Boolean);

      await apiRequest("PATCH", `/api/skills/${id}`, {
        name,
        description,
        industry,
        domain,
        tags: parsedTags,
        allowedTools: parsedAllowedTools,
        requiredMcpServers: parsedMcpServers,
        requiredDataClassifications: parsedDataClassifications,
        disableModelInvocation,
        contextMode,
        userInvocable,
        version,
        complexity,
        markdownBody,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/skills", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/skills"] });
      toast({ title: "Skill saved successfully" });
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
        <Button
          variant="outline"
          size="sm"
          onClick={handleSave}
          disabled={saving}
          data-testid="button-save"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>

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
          </TabsTrigger>
        </TabsList>

        <TabsContent value="editor" className="flex-1 min-h-0 mt-0">
          <ScrollArea className="h-full">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-5">
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">YAML Frontmatter</h3>
                <Separator />
                <div className="space-y-1.5">
                  <Label htmlFor="skill-name">Name</Label>
                  <Input id="skill-name" value={name} onChange={e => setName(e.target.value)} data-testid="input-name" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="skill-description">Description</Label>
                  <Textarea id="skill-description" value={description} onChange={e => handleDescriptionChange(e.target.value)} rows={3} data-testid="input-description" />
                  <DescriptionQualityBar score={qualityScore} feedback={qualityFeedback} />
                </div>
                <div className="space-y-1.5">
                  <Label>Industry</Label>
                  <Select value={industry} onValueChange={setIndustry}>
                    <SelectTrigger data-testid="select-industry">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="financial_services">Financial Services</SelectItem>
                      <SelectItem value="healthcare">Healthcare</SelectItem>
                      <SelectItem value="manufacturing">Manufacturing</SelectItem>
                      <SelectItem value="retail">Retail</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="skill-domain">Domain</Label>
                  <Input id="skill-domain" value={domain} onChange={e => setDomain(e.target.value)} data-testid="input-domain" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="skill-tags">Tags (comma-separated)</Label>
                  <Input id="skill-tags" value={tags} onChange={e => setTags(e.target.value)} placeholder="compliance, fraud, kyc" data-testid="input-tags" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="skill-allowed-tools">Allowed Tools (one per line)</Label>
                  <Textarea id="skill-allowed-tools" value={allowedTools} onChange={e => setAllowedTools(e.target.value)} rows={3} placeholder="mcp:*&#10;tool:search" data-testid="input-allowed-tools" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="skill-mcp-servers">Required MCP Servers (one per line)</Label>
                  <Textarea id="skill-mcp-servers" value={requiredMcpServers} onChange={e => setRequiredMcpServers(e.target.value)} rows={2} data-testid="input-mcp-servers" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="skill-data-class">Required Data Classifications (one per line)</Label>
                  <Textarea id="skill-data-class" value={requiredDataClassifications} onChange={e => setRequiredDataClassifications(e.target.value)} rows={2} data-testid="input-data-classifications" />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="skill-disable-model">Disable Model Invocation</Label>
                  <Switch id="skill-disable-model" checked={disableModelInvocation} onCheckedChange={setDisableModelInvocation} data-testid="switch-disable-model" />
                </div>
                <div className="space-y-1.5">
                  <Label>Context Mode</Label>
                  <Select value={contextMode} onValueChange={setContextMode}>
                    <SelectTrigger data-testid="select-context-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fork">Fork</SelectItem>
                      <SelectItem value="inline">Inline</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="skill-user-invocable">User Invocable</Label>
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
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Markdown Body</h3>
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
                  <Textarea
                    value={markdownBody}
                    onChange={e => setMarkdownBody(e.target.value)}
                    rows={24}
                    className="font-mono text-sm"
                    placeholder="# Skill Instructions&#10;&#10;Write the skill's markdown body here..."
                    data-testid="input-markdown-body"
                  />
                )}
                <Button variant="outline" size="sm" onClick={() => setShowPreview(!showPreview)} data-testid="button-toggle-preview">
                  {showPreview ? <EyeOff className="w-3.5 h-3.5 mr-1.5" /> : <Eye className="w-3.5 h-3.5 mr-1.5" />}
                  {showPreview ? "Edit" : "Preview"}
                </Button>
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
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {toolsList.map((tool, i) => (
                        <div key={i} className="flex items-center gap-2">
                          {isDeprecated(tool) ? <Flag className="w-3.5 h-3.5 text-red-500" /> : <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
                          <span className="text-sm flex-1">{tool}</span>
                          <Badge variant="outline" className="text-[10px]">tool</Badge>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {serversList.length > 0 && (
                  <Card data-testid="card-dep-mcp-servers">
                    <CardHeader>
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Server className="w-4 h-4" /> MCP Servers
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {serversList.map((srv, i) => (
                        <div key={i} className="flex items-center gap-2">
                          {isDeprecated(srv) ? <Flag className="w-3.5 h-3.5 text-red-500" /> : <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
                          <span className="text-sm flex-1">{srv}</span>
                          <Badge variant="outline" className="text-[10px]">server</Badge>
                        </div>
                      ))}
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
      </Tabs>
    </div>
  );
}
