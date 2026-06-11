import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import {
  Search,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Play,
  Download,
  Key,
  Terminal,
  Code2,
  BookOpen,
  Zap,
  Shield,
  ExternalLink,
  FileCode,
  Loader2,
} from "lucide-react";
import { SiPython, SiTypescript } from "react-icons/si";

interface OpenAPISpec {
  openapi: string;
  info: { title: string; version: string; description: string };
  servers: Array<{ url: string; description: string }>;
  tags: Array<{ name: string; description: string }>;
  paths: Record<string, Record<string, PathOperation>>;
  components: {
    securitySchemes: Record<string, any>;
    schemas: Record<string, any>;
  };
}

interface PathOperation {
  tags: string[];
  summary: string;
  description?: string;
  parameters?: Array<{
    name: string;
    in: string;
    required?: boolean;
    schema: { type: string; format?: string; enum?: string[] };
  }>;
  requestBody?: {
    required?: boolean;
    content: Record<string, { schema: any }>;
  };
  responses: Record<string, { description: string; content?: any }>;
  security?: any[];
}

interface EndpointEntry {
  path: string;
  method: string;
  operation: PathOperation;
  tag: string;
}

const METHOD_COLORS: Record<string, string> = {
  get: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
  post: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30",
  patch: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  put: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30",
  delete: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
};

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 gap-1.5 text-xs"
      data-testid={`button-copy-${label || "code"}`}
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  return (
    <div className="relative group">
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <CopyButton text={code} label={language} />
      </div>
      <pre className="bg-zinc-950 dark:bg-zinc-900 text-zinc-100 rounded-lg p-4 overflow-x-auto text-xs leading-relaxed font-mono border border-zinc-800">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function generateCurl(baseUrl: string, method: string, path: string, operation: PathOperation): string {
  let resolvedPath = path.replace(/\{(\w+)\}/g, (_, name) => `<${name.toUpperCase()}>`);
  const lines = [`curl -X ${method.toUpperCase()} "${baseUrl}${resolvedPath}"`];
  lines.push(`  -H "Authorization: Bearer nous_YOUR_API_KEY"`);

  const bodySchema = operation.requestBody?.content?.["application/json"]?.schema;
  if (bodySchema && (method === "post" || method === "patch" || method === "put")) {
    lines.push(`  -H "Content-Type: application/json"`);
    const exampleBody = generateExampleFromSchema(bodySchema);
    lines.push(`  -d '${JSON.stringify(exampleBody, null, 2)}'`);
  }
  return lines.join(" \\\n");
}

function generatePython(baseUrl: string, method: string, path: string, operation: PathOperation): string {
  const pathParams = (path.match(/\{(\w+)\}/g) || []).map((p) => p.slice(1, -1));
  let resolvedPath = path.replace(/\{(\w+)\}/g, (_, p) => `{${p}}`);
  const lines = [
    `import requests`,
    ``,
    `API_KEY = "nous_YOUR_API_KEY"`,
    `BASE_URL = "${baseUrl}"`,
    ``,
  ];
  for (const p of pathParams) {
    lines.push(`${p} = "YOUR_${p.toUpperCase()}"  # Replace with actual value`);
  }
  if (pathParams.length) lines.push(``);
  lines.push(
    `headers = {`,
    `    "Authorization": f"Bearer {API_KEY}",`,
    `    "Content-Type": "application/json",`,
    `}`,
    ``,
  );

  const bodySchema = operation.requestBody?.content?.["application/json"]?.schema;
  if (bodySchema && (method === "post" || method === "patch" || method === "put")) {
    const exampleBody = generateExampleFromSchema(bodySchema);
    lines.push(`payload = ${JSON.stringify(exampleBody, null, 4).replace(/null/g, "None").replace(/true/g, "True").replace(/false/g, "False")}`);
    lines.push(``);
    lines.push(`response = requests.${method}(`);
    lines.push(`    f"{BASE_URL}${resolvedPath}",`);
    lines.push(`    headers=headers,`);
    lines.push(`    json=payload,`);
    lines.push(`)`);
  } else {
    lines.push(`response = requests.${method}(`);
    lines.push(`    f"{BASE_URL}${resolvedPath}",`);
    lines.push(`    headers=headers,`);
    lines.push(`)`);
  }
  lines.push(``);
  lines.push(`print(response.status_code)`);
  lines.push(`print(response.json())`);
  return lines.join("\n");
}

function generateTypeScript(baseUrl: string, method: string, path: string, operation: PathOperation): string {
  const pathParams = (path.match(/\{(\w+)\}/g) || []).map((p) => p.slice(1, -1));
  let resolvedPath = path.replace(/\{(\w+)\}/g, (_, p) => `\${${p}}`);
  const lines = [
    `const API_KEY = "nous_YOUR_API_KEY";`,
    `const BASE_URL = "${baseUrl}";`,
    ``,
  ];
  for (const p of pathParams) {
    lines.push(`const ${p} = "YOUR_${p.toUpperCase()}"; // Replace with actual value`);
  }
  if (pathParams.length) lines.push(``);

  const bodySchema = operation.requestBody?.content?.["application/json"]?.schema;
  const fetchOptions: string[] = [
    `  method: "${method.toUpperCase()}",`,
    `  headers: {`,
    `    "Authorization": \`Bearer \${API_KEY}\`,`,
    `    "Content-Type": "application/json",`,
    `  },`,
  ];

  if (bodySchema && (method === "post" || method === "patch" || method === "put")) {
    const exampleBody = generateExampleFromSchema(bodySchema);
    fetchOptions.push(`  body: JSON.stringify(${JSON.stringify(exampleBody, null, 4).split("\n").join("\n  ")}),`);
  }

  lines.push(`const response = await fetch(\`\${BASE_URL}${resolvedPath}\`, {`);
  lines.push(...fetchOptions);
  lines.push(`});`);
  lines.push(``);
  lines.push(`const data = await response.json();`);
  lines.push(`console.log(data);`);
  return lines.join("\n");
}

function generateExampleFromSchema(schema: any): any {
  if (!schema) return {};
  if (schema.$ref) {
    return { "...": "See schema definition" };
  }
  if (schema.example !== undefined) return schema.example;
  if (schema.type === "string") return schema.example || "string_value";
  if (schema.type === "integer" || schema.type === "number") return schema.example || 1;
  if (schema.type === "boolean") return schema.default ?? true;
  if (schema.type === "array") {
    return [generateExampleFromSchema(schema.items || {})];
  }
  if (schema.type === "object" || schema.properties) {
    const obj: Record<string, any> = {};
    const props = schema.properties || {};
    for (const [key, val] of Object.entries(props)) {
      obj[key] = generateExampleFromSchema(val);
    }
    return obj;
  }
  return {};
}

function EndpointCard({ entry, baseUrl }: { entry: EndpointEntry; baseUrl: string }) {
  const [expanded, setExpanded] = useState(false);
  const [tryItOpen, setTryItOpen] = useState(false);
  const [tryItBody, setTryItBody] = useState("");
  const [tryItResponse, setTryItResponse] = useState<{ status: number; body: string; time: number } | null>(null);
  const [tryItLoading, setTryItLoading] = useState(false);
  const [codeTab, setCodeTab] = useState("curl");
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [queryValues, setQueryValues] = useState<Record<string, string>>({});
  const [tryItApiKey, setTryItApiKey] = useState("");
  const { toast } = useToast();

  const { path, method, operation } = entry;
  const params = operation.parameters?.filter((p) => p.in === "path") || [];
  const queryParams = operation.parameters?.filter((p) => p.in === "query") || [];
  const bodySchema = operation.requestBody?.content?.["application/json"]?.schema;
  const hasBody = !!bodySchema && (method === "post" || method === "patch" || method === "put");

  const executeTryIt = async () => {
    setTryItLoading(true);
    setTryItResponse(null);
    const start = performance.now();
    try {
      let resolvedPath = path;
      params.forEach((p) => {
        const val = paramValues[p.name] || `EXAMPLE_${p.name.toUpperCase()}`;
        resolvedPath = resolvedPath.replace(`{${p.name}}`, val);
      });

      const queryParts: string[] = [];
      queryParams.forEach((p) => {
        const val = queryValues[p.name];
        if (val) queryParts.push(`${encodeURIComponent(p.name)}=${encodeURIComponent(val)}`);
      });
      if (queryParts.length) resolvedPath += `?${queryParts.join("&")}`;

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (tryItApiKey.trim()) {
        headers["Authorization"] = `Bearer ${tryItApiKey.trim()}`;
      }

      const fetchOpts: RequestInit = {
        method: method.toUpperCase(),
        headers,
      };
      if (hasBody && tryItBody.trim()) {
        fetchOpts.body = tryItBody;
      }
      const resp = await fetch(resolvedPath, fetchOpts);
      const elapsed = performance.now() - start;
      let body: string;
      try {
        const json = await resp.json();
        body = JSON.stringify(json, null, 2);
      } catch {
        body = await resp.text();
      }
      setTryItResponse({ status: resp.status, body, time: Math.round(elapsed) });
    } catch (err: any) {
      setTryItResponse({ status: 0, body: `Error: ${err.message}`, time: Math.round(performance.now() - start) });
    }
    setTryItLoading(false);
  };

  return (
    <div className="border rounded-lg overflow-hidden" data-testid={`endpoint-${method}-${path.replace(/[^a-z0-9]/gi, "-")}`}>
      <button
        className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left"
        onClick={() => setExpanded(!expanded)}
        data-testid={`button-toggle-endpoint-${method}-${path.replace(/[^a-z0-9]/gi, "-")}`}
      >
        <Badge variant="outline" className={`${METHOD_COLORS[method]} font-mono text-[10px] uppercase px-2 py-0.5 shrink-0`}>
          {method}
        </Badge>
        <code className="text-sm font-mono text-foreground flex-1 truncate">{path}</code>
        <span className="text-xs text-muted-foreground truncate max-w-[300px] hidden md:inline">{operation.summary}</span>
        {expanded ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="border-t p-4 space-y-4 bg-muted/20">
          {operation.description && (
            <p className="text-sm text-muted-foreground">{operation.description}</p>
          )}

          {params.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Path Parameters</h4>
              <div className="space-y-1">
                {params.map((p) => (
                  <div key={p.name} className="flex items-center gap-2 text-sm">
                    <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{p.name}</code>
                    <span className="text-xs text-muted-foreground">{p.schema.type}{p.schema.format ? ` (${p.schema.format})` : ""}</span>
                    {p.required && <Badge variant="outline" className="text-[9px]">required</Badge>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {queryParams.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Query Parameters</h4>
              <div className="space-y-1">
                {queryParams.map((p) => (
                  <div key={p.name} className="flex items-center gap-2 text-sm">
                    <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{p.name}</code>
                    <span className="text-xs text-muted-foreground">{p.schema.type}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {hasBody && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Request Body</h4>
              <CodeBlock
                code={JSON.stringify(generateExampleFromSchema(bodySchema), null, 2)}
                language="json"
              />
            </div>
          )}

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Responses</h4>
            <div className="space-y-1">
              {Object.entries(operation.responses).map(([code, resp]) => (
                <div key={code} className="flex items-center gap-2 text-sm">
                  <Badge variant="outline" className={`text-[10px] ${code.startsWith("2") ? "text-green-600 dark:text-green-400" : code.startsWith("4") ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
                    {code}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{(resp as any).description}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Code Examples</h4>
            <Tabs value={codeTab} onValueChange={setCodeTab}>
              <TabsList className="h-8">
                <TabsTrigger value="curl" className="text-xs gap-1"><Terminal className="h-3 w-3" />cURL</TabsTrigger>
                <TabsTrigger value="python" className="text-xs gap-1"><SiPython className="h-3 w-3" />Python</TabsTrigger>
                <TabsTrigger value="typescript" className="text-xs gap-1"><SiTypescript className="h-3 w-3" />TypeScript</TabsTrigger>
              </TabsList>
              <TabsContent value="curl" className="mt-2">
                <CodeBlock code={generateCurl(baseUrl, method, path, operation)} language="bash" />
              </TabsContent>
              <TabsContent value="python" className="mt-2">
                <CodeBlock code={generatePython(baseUrl, method, path, operation)} language="python" />
              </TabsContent>
              <TabsContent value="typescript" className="mt-2">
                <CodeBlock code={generateTypeScript(baseUrl, method, path, operation)} language="typescript" />
              </TabsContent>
            </Tabs>
          </div>

          <Collapsible open={tryItOpen} onOpenChange={setTryItOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5" data-testid="button-try-it">
                <Play className="h-3.5 w-3.5" />
                {tryItOpen ? "Close" : "Try It"}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 space-y-3">
              <div className="border rounded-lg p-3 space-y-3 bg-background">
                <div className="space-y-2">
                  <label className="text-xs font-medium flex items-center gap-1.5">
                    <Key className="h-3 w-3" />
                    API Key (optional)
                  </label>
                  <Input
                    className="h-8 text-xs font-mono"
                    placeholder="nous_YOUR_API_KEY"
                    type="password"
                    value={tryItApiKey}
                    onChange={(e) => setTryItApiKey(e.target.value)}
                    data-testid="input-api-key"
                  />
                  <p className="text-[10px] text-muted-foreground">Leave empty to use your current session cookie. Set for API key-protected endpoints.</p>
                </div>
                {params.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-xs font-medium">Path Parameters</label>
                    {params.map((p) => (
                      <div key={p.name} className="flex items-center gap-2">
                        <code className="text-xs font-mono w-24 shrink-0">{p.name}</code>
                        <Input
                          className="h-8 text-xs font-mono"
                          placeholder={`Enter ${p.name}`}
                          value={paramValues[p.name] || ""}
                          onChange={(e) => setParamValues((prev) => ({ ...prev, [p.name]: e.target.value }))}
                          data-testid={`input-param-${p.name}`}
                        />
                      </div>
                    ))}
                  </div>
                )}
                {queryParams.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-xs font-medium">Query Parameters</label>
                    {queryParams.map((p) => (
                      <div key={p.name} className="flex items-center gap-2">
                        <code className="text-xs font-mono w-24 shrink-0">{p.name}</code>
                        <Input
                          className="h-8 text-xs font-mono"
                          placeholder={`Enter ${p.name} (optional)`}
                          value={queryValues[p.name] || ""}
                          onChange={(e) => setQueryValues((prev) => ({ ...prev, [p.name]: e.target.value }))}
                          data-testid={`input-query-${p.name}`}
                        />
                      </div>
                    ))}
                  </div>
                )}
                {hasBody && (
                  <div className="space-y-2">
                    <label className="text-xs font-medium">Request Body (JSON)</label>
                    <Textarea
                      className="font-mono text-xs min-h-[100px]"
                      placeholder={JSON.stringify(generateExampleFromSchema(bodySchema), null, 2)}
                      value={tryItBody}
                      onChange={(e) => setTryItBody(e.target.value)}
                      data-testid="textarea-request-body"
                    />
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={executeTryIt} disabled={tryItLoading} data-testid="button-execute-request">
                    {tryItLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Play className="h-3.5 w-3.5 mr-1.5" />}
                    Execute
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard.writeText(generateCurl(baseUrl, method, path, operation));
                      toast({ title: "Copied cURL command to clipboard" });
                    }}
                    data-testid="button-copy-curl"
                  >
                    <Copy className="h-3.5 w-3.5 mr-1.5" />
                    Copy as cURL
                  </Button>
                </div>

                {tryItResponse && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs">
                      <Badge variant="outline" className={tryItResponse.status >= 200 && tryItResponse.status < 300 ? "text-green-600 dark:text-green-400" : tryItResponse.status >= 400 ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}>
                        {tryItResponse.status || "Error"}
                      </Badge>
                      <span className="text-muted-foreground">{tryItResponse.time}ms</span>
                    </div>
                    <pre className="bg-zinc-950 dark:bg-zinc-900 text-zinc-100 rounded-lg p-3 overflow-x-auto text-xs font-mono max-h-[300px] overflow-y-auto border border-zinc-800">
                      {tryItResponse.body}
                    </pre>
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}
    </div>
  );
}

function generatePythonSdk(baseUrl: string): string {
  return `"""
ASTRA Agents - Python SDK Client
Auto-generated client for the ASTRA Agents API.
"""
import requests
from typing import Optional, Dict, Any, List


class NousClient:
    """Client for the ASTRA Agents API."""

    def __init__(self, base_url: str = "${baseUrl}", api_key: str = ""):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        })

    def _request(self, method: str, path: str, **kwargs) -> Dict[str, Any]:
        url = f"{self.base_url}{path}"
        response = self.session.request(method, url, **kwargs)
        response.raise_for_status()
        return response.json()

    # --- Agents ---

    def list_agents(self) -> List[Dict]:
        """List all agents."""
        return self._request("GET", "/api/agents")

    def get_agent(self, agent_id: str) -> Dict:
        """Get agent by ID."""
        return self._request("GET", f"/api/agents/{agent_id}")

    def create_agent(self, name: str, role: str, model: str = "gpt-4o", **kwargs) -> Dict:
        """Create a new agent."""
        payload = {"name": name, "role": role, "model": model, **kwargs}
        return self._request("POST", "/api/agents", json=payload)

    def update_agent(self, agent_id: str, **kwargs) -> Dict:
        """Update an agent's configuration."""
        return self._request("PATCH", f"/api/agents/{agent_id}", json=kwargs)

    def delete_agent(self, agent_id: str) -> Dict:
        """Delete an agent."""
        return self._request("DELETE", f"/api/agents/{agent_id}")

    # --- Runtime & Execution ---

    def run_agent(self, agent_id: str, input_text: str) -> Dict:
        """Execute an agent with the given input."""
        return self._request("POST", "/api/runtime/run", json={
            "agentId": agent_id,
            "input": input_text,
        })

    def invoke_agent(self, agent_id: str, input_text: str) -> Dict:
        """Invoke an agent via the API Gateway (requires API key)."""
        return self._request("POST", f"/api/gateway/v1/invoke/{agent_id}", json={
            "input": input_text,
        })

    def test_agent(self, agent_id: str, input_text: str) -> Dict:
        """Run a test execution of an agent."""
        return self._request("POST", f"/api/agents/{agent_id}/run-test", json={
            "input": input_text,
        })

    def get_run(self, run_id: str) -> Dict:
        """Get runtime run details and execution trace."""
        return self._request("GET", f"/api/agent-runtime/runs/{run_id}")

    # --- Deployments ---

    def list_deployments(self) -> List[Dict]:
        """List all deployments."""
        return self._request("GET", "/api/deployments")

    def create_deployment(self, agent_id: str, version: str, **kwargs) -> Dict:
        """Create a new deployment."""
        payload = {"agentId": agent_id, "version": version, **kwargs}
        return self._request("POST", "/api/deployments", json=payload)

    def promote_deployment(self, deployment_id: str) -> Dict:
        """Promote a deployment to the next stage."""
        return self._request("POST", f"/api/deployments/{deployment_id}/promote")

    def rollback_deployment(self, deployment_id: str) -> Dict:
        """Rollback a deployment."""
        return self._request("POST", f"/api/deployments/{deployment_id}/rollback")

    def get_deployment_readiness(self, deployment_id: str) -> Dict:
        """Check deployment readiness."""
        return self._request("GET", f"/api/deployments/{deployment_id}/readiness")

    # --- Governance ---

    def list_policies(self) -> List[Dict]:
        """List all policies."""
        return self._request("GET", "/api/policies")

    def check_policy(self, agent_id: str, content: str) -> Dict:
        """Run a policy check against content."""
        return self._request("POST", "/api/policy-check", json={
            "agentId": agent_id,
            "content": content,
        })

    # --- Traces ---

    def list_traces(self, agent_id: Optional[str] = None) -> List[Dict]:
        """List execution traces."""
        params = {}
        if agent_id:
            params["agentId"] = agent_id
        return self._request("GET", "/api/traces", params=params)

    def get_trace(self, trace_id: int) -> Dict:
        """Get trace details."""
        return self._request("GET", f"/api/traces/{trace_id}")

    # --- Knowledge Base ---

    def list_knowledge_bases(self) -> List[Dict]:
        """List all knowledge bases."""
        return self._request("GET", "/api/knowledge-bases")

    def search_knowledge_base(self, kb_id: int, query: str, top_k: int = 5) -> Dict:
        """Search a knowledge base."""
        return self._request("POST", f"/api/knowledge-bases/{kb_id}/search", json={
            "query": query,
            "topK": top_k,
        })

    def query_knowledge_base(self, kb_id: int, query: str) -> Dict:
        """RAG query against a knowledge base."""
        return self._request("POST", f"/api/knowledge-bases/{kb_id}/query", json={
            "query": query,
        })

    # --- API Keys ---

    def create_api_key(self, agent_id: str, name: str, scopes: List[str] = None) -> Dict:
        """Generate a new API key for an agent."""
        payload: Dict[str, Any] = {"name": name}
        if scopes:
            payload["scopes"] = scopes
        return self._request("POST", f"/api/agents/{agent_id}/api-keys", json=payload)

    def list_api_keys(self, agent_id: str) -> List[Dict]:
        """List API keys for an agent."""
        return self._request("GET", f"/api/agents/{agent_id}/api-keys")

    def revoke_api_key(self, agent_id: str, key_id: int) -> Dict:
        """Revoke an API key."""
        return self._request("DELETE", f"/api/agents/{agent_id}/api-keys/{key_id}")

    # --- Outcomes ---

    def list_outcomes(self) -> List[Dict]:
        """List all outcomes."""
        return self._request("GET", "/api/outcomes")

    def get_outcome(self, outcome_id: str) -> Dict:
        """Get outcome details."""
        return self._request("GET", f"/api/outcomes/{outcome_id}")

    # --- Evaluations ---

    def list_evals(self) -> List[Dict]:
        """List evaluation suites."""
        return self._request("GET", "/api/evals")

    # --- Triggers ---

    def list_triggers(self, agent_id: str) -> List[Dict]:
        """List triggers for an agent."""
        return self._request("GET", f"/api/agents/{agent_id}/triggers")

    def create_trigger(self, agent_id: str, trigger_type: str, config: Dict = None) -> Dict:
        """Create a trigger for an agent."""
        payload: Dict[str, Any] = {"triggerType": trigger_type}
        if config:
            payload["config"] = config
        return self._request("POST", f"/api/agents/{agent_id}/triggers", json=payload)


# --- Usage Example ---
if __name__ == "__main__":
    client = NousClient(
        base_url="${baseUrl}",
        api_key="nous_YOUR_API_KEY",
    )

    # List agents
    agents = client.list_agents()
    print(f"Found {len(agents)} agents")

    # Run an agent
    if agents:
        result = client.run_agent(agents[0]["id"], "Analyze Q4 performance")
        print(f"Result: {result.get('output', '')[:200]}")
`;
}

function generateTypeScriptSdk(baseUrl: string): string {
  return `/**
 * ASTRA Agents - TypeScript SDK Client
 * Auto-generated client for the ASTRA Agents API.
 */

interface RequestOptions {
  method: string;
  path: string;
  body?: any;
  params?: Record<string, string>;
}

export class NousClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string = "${baseUrl}", apiKey: string = "") {
    this.baseUrl = baseUrl.replace(/\\/$/, "");
    this.apiKey = apiKey;
  }

  private async request<T = any>(options: RequestOptions): Promise<T> {
    const url = new URL(\`\${this.baseUrl}\${options.path}\`);
    if (options.params) {
      Object.entries(options.params).forEach(([k, v]) => url.searchParams.set(k, v));
    }
    const response = await fetch(url.toString(), {
      method: options.method,
      headers: {
        "Authorization": \`Bearer \${this.apiKey}\`,
        "Content-Type": "application/json",
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(\`API Error \${response.status}: \${error.message || response.statusText}\`);
    }
    return response.json();
  }

  // --- Agents ---

  async listAgents(): Promise<Agent[]> {
    return this.request({ method: "GET", path: "/api/agents" });
  }

  async getAgent(agentId: string): Promise<Agent> {
    return this.request({ method: "GET", path: \`/api/agents/\${agentId}\` });
  }

  async createAgent(data: CreateAgentInput): Promise<Agent> {
    return this.request({ method: "POST", path: "/api/agents", body: data });
  }

  async updateAgent(agentId: string, data: Partial<CreateAgentInput>): Promise<Agent> {
    return this.request({ method: "PATCH", path: \`/api/agents/\${agentId}\`, body: data });
  }

  async deleteAgent(agentId: string): Promise<void> {
    return this.request({ method: "DELETE", path: \`/api/agents/\${agentId}\` });
  }

  // --- Runtime & Execution ---

  async runAgent(agentId: string, input: string): Promise<RuntimeResult> {
    return this.request({ method: "POST", path: "/api/runtime/run", body: { agentId, input } });
  }

  async invokeAgent(agentId: string, input: string): Promise<RuntimeResult> {
    return this.request({ method: "POST", path: \`/api/gateway/v1/invoke/\${agentId}\`, body: { input } });
  }

  async testAgent(agentId: string, input: string): Promise<RuntimeResult> {
    return this.request({ method: "POST", path: \`/api/agents/\${agentId}/run-test\`, body: { input } });
  }

  async getRun(runId: string): Promise<any> {
    return this.request({ method: "GET", path: \`/api/agent-runtime/runs/\${runId}\` });
  }

  // --- Deployments ---

  async listDeployments(): Promise<any[]> {
    return this.request({ method: "GET", path: "/api/deployments" });
  }

  async createDeployment(data: { agentId: string; version: string }): Promise<any> {
    return this.request({ method: "POST", path: "/api/deployments", body: data });
  }

  async promoteDeployment(deploymentId: string): Promise<any> {
    return this.request({ method: "POST", path: \`/api/deployments/\${deploymentId}/promote\` });
  }

  async rollbackDeployment(deploymentId: string): Promise<any> {
    return this.request({ method: "POST", path: \`/api/deployments/\${deploymentId}/rollback\` });
  }

  // --- Governance ---

  async listPolicies(): Promise<any[]> {
    return this.request({ method: "GET", path: "/api/policies" });
  }

  async checkPolicy(agentId: string, content: string): Promise<any> {
    return this.request({ method: "POST", path: "/api/policy-check", body: { agentId, content } });
  }

  // --- Traces ---

  async listTraces(agentId?: string): Promise<any[]> {
    return this.request({ method: "GET", path: "/api/traces", params: agentId ? { agentId } : undefined });
  }

  async getTrace(traceId: number): Promise<any> {
    return this.request({ method: "GET", path: \`/api/traces/\${traceId}\` });
  }

  // --- Knowledge Base ---

  async listKnowledgeBases(): Promise<any[]> {
    return this.request({ method: "GET", path: "/api/knowledge-bases" });
  }

  async searchKnowledgeBase(kbId: number, query: string, topK = 5): Promise<any> {
    return this.request({ method: "POST", path: \`/api/knowledge-bases/\${kbId}/search\`, body: { query, topK } });
  }

  async queryKnowledgeBase(kbId: number, query: string): Promise<any> {
    return this.request({ method: "POST", path: \`/api/knowledge-bases/\${kbId}/query\`, body: { query } });
  }

  // --- API Keys ---

  async createApiKey(agentId: string, name: string): Promise<{ id: number; key: string; name: string }> {
    return this.request({ method: "POST", path: \`/api/agents/\${agentId}/api-keys\`, body: { name } });
  }

  async listApiKeys(agentId: string): Promise<any[]> {
    return this.request({ method: "GET", path: \`/api/agents/\${agentId}/api-keys\` });
  }

  async revokeApiKey(agentId: string, keyId: number): Promise<void> {
    return this.request({ method: "DELETE", path: \`/api/agents/\${agentId}/api-keys/\${keyId}\` });
  }

  // --- Outcomes ---

  async listOutcomes(): Promise<any[]> {
    return this.request({ method: "GET", path: "/api/outcomes" });
  }

  // --- Triggers ---

  async listTriggers(agentId: string): Promise<any[]> {
    return this.request({ method: "GET", path: \`/api/agents/\${agentId}/triggers\` });
  }

  async createTrigger(agentId: string, triggerType: string, config?: any): Promise<any> {
    return this.request({ method: "POST", path: \`/api/agents/\${agentId}/triggers\`, body: { triggerType, config } });
  }
}

// --- Types ---

interface Agent {
  id: string;
  name: string;
  role: string;
  model: string;
  status: string;
  industry?: string;
  autonomyMode?: string;
  maxToolIterations?: number;
  createdAt: string;
}

interface CreateAgentInput {
  name: string;
  role: string;
  model: string;
  systemPrompt?: string;
  industry?: string;
  autonomyMode?: string;
  maxToolIterations?: number;
}

interface RuntimeResult {
  traceId: string;
  output: string;
  toolCalls?: any[];
  policyResults?: any[];
  duration: number;
}

// --- Usage Example ---
// const client = new NousClient("${baseUrl}", "nous_YOUR_API_KEY");
// const agents = await client.listAgents();
// const result = await client.runAgent(agents[0].id, "Analyze performance");
`;
}

export default function DeveloperPortal() {
  const { data: spec, isLoading } = useQuery<OpenAPISpec>({
    queryKey: ["/api/openapi.json"],
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState("reference");

  const baseUrl = spec?.servers?.[0]?.url || window.location.origin;

  const endpoints = useMemo(() => {
    if (!spec?.paths) return [];
    const result: EndpointEntry[] = [];
    for (const [path, methods] of Object.entries(spec.paths)) {
      for (const [method, operation] of Object.entries(methods)) {
        if (typeof operation !== "object" || !operation.tags) continue;
        result.push({
          path,
          method,
          operation: operation as PathOperation,
          tag: (operation as PathOperation).tags[0] || "Other",
        });
      }
    }
    return result;
  }, [spec]);

  const groupedEndpoints = useMemo(() => {
    const groups: Record<string, EndpointEntry[]> = {};
    const filtered = endpoints.filter((e) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        e.path.toLowerCase().includes(q) ||
        e.method.toLowerCase().includes(q) ||
        e.operation.summary?.toLowerCase().includes(q) ||
        e.operation.description?.toLowerCase().includes(q) ||
        e.tag.toLowerCase().includes(q)
      );
    });
    for (const e of filtered) {
      if (!groups[e.tag]) groups[e.tag] = [];
      groups[e.tag].push(e);
    }
    return groups;
  }, [endpoints, searchQuery]);

  const tagDescriptions = useMemo(() => {
    const map: Record<string, string> = {};
    spec?.tags?.forEach((t) => { map[t.name] = t.description; });
    return map;
  }, [spec]);

  const toggleGroup = (tag: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  const expandAll = () => {
    setExpandedGroups(new Set(Object.keys(groupedEndpoints)));
  };

  const collapseAll = () => {
    setExpandedGroups(new Set());
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6" data-testid="page-developer-portal">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Developer Portal</h1>
        <p className="text-muted-foreground">
          API reference, code examples, and SDKs for programmatic access to ASTRA Agents.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="quickstart" className="gap-1.5" data-testid="tab-quickstart">
            <Zap className="h-3.5 w-3.5" />Quick Start
          </TabsTrigger>
          <TabsTrigger value="auth" className="gap-1.5" data-testid="tab-auth">
            <Shield className="h-3.5 w-3.5" />Authentication
          </TabsTrigger>
          <TabsTrigger value="reference" className="gap-1.5" data-testid="tab-reference">
            <BookOpen className="h-3.5 w-3.5" />API Reference
          </TabsTrigger>
          <TabsTrigger value="sdks" className="gap-1.5" data-testid="tab-sdks">
            <Code2 className="h-3.5 w-3.5" />SDKs & Libraries
          </TabsTrigger>
        </TabsList>

        <TabsContent value="quickstart" className="mt-4 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Zap className="h-5 w-5" /> Quick Start Guide</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold shrink-0">1</div>
                  <div className="space-y-2 flex-1">
                    <h3 className="font-semibold">Generate an API Key</h3>
                    <p className="text-sm text-muted-foreground">
                      Navigate to any agent's detail page, open the "API Gateway" tab, and click "Generate Key". 
                      Store the key securely — it's only shown once.
                    </p>
                    <CodeBlock code={`# Your API key looks like:\nnous_k7x9m2p4q8r1...`} language="bash" />
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold shrink-0">2</div>
                  <div className="space-y-2 flex-1">
                    <h3 className="font-semibold">Make Your First API Call</h3>
                    <p className="text-sm text-muted-foreground">
                      Use the API key to invoke an agent. You can use either the <code>Authorization</code> header or the <code>X-API-Key</code> header.
                    </p>
                    <CodeBlock code={`curl -X POST "${baseUrl}/api/gateway/v1/invoke/YOUR_AGENT_ID" \\\n  -H "Authorization: Bearer nous_YOUR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"input": "Analyze the latest sales data"}'`} language="bash" />
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold shrink-0">3</div>
                  <div className="space-y-2 flex-1">
                    <h3 className="font-semibold">Check the Response</h3>
                    <p className="text-sm text-muted-foreground">
                      The response includes the agent's output, tool calls made, policy check results, and a trace ID for observability.
                    </p>
                    <CodeBlock code={`{\n  "traceId": "tr_abc123",\n  "output": "Based on the sales data analysis...",\n  "toolCalls": [\n    {"tool": "crm_search", "result": "..."}\n  ],\n  "policyResults": [\n    {"policy": "PII Redaction", "passed": true}\n  ],\n  "duration": 2340\n}`} language="json" />
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold mb-2">Other Common Operations</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[
                    { label: "List all agents", code: `curl "${baseUrl}/api/agents" -H "Authorization: Bearer nous_KEY"` },
                    { label: "Get execution trace", code: `curl "${baseUrl}/api/agent-runtime/runs/RUN_ID" -H "Authorization: Bearer nous_KEY"` },
                    { label: "Run policy check", code: `curl -X POST "${baseUrl}/api/policy-check" -H "Authorization: Bearer nous_KEY" -d '{"agentId":"...","content":"..."}'` },
                    { label: "List deployments", code: `curl "${baseUrl}/api/deployments" -H "Authorization: Bearer nous_KEY"` },
                  ].map((item) => (
                    <div key={item.label} className="space-y-1">
                      <span className="text-xs font-medium">{item.label}</span>
                      <CodeBlock code={item.code} language="bash" />
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="auth" className="mt-4 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Key className="h-5 w-5" /> Authentication</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <h3 className="font-semibold">API Key Authentication</h3>
                <p className="text-sm text-muted-foreground">
                  All programmatic API access uses API keys. Keys are scoped to individual agents and prefixed with <code className="bg-muted px-1 rounded">nous_</code> for easy identification.
                </p>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-semibold">Supported Headers</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border rounded-lg p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge>Recommended</Badge>
                      <code className="text-xs font-mono">Authorization</code>
                    </div>
                    <CodeBlock code={`Authorization: Bearer nous_abc123def456...`} language="http" />
                  </div>
                  <div className="border rounded-lg p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">Alternative</Badge>
                      <code className="text-xs font-mono">X-API-Key</code>
                    </div>
                    <CodeBlock code={`X-API-Key: nous_abc123def456...`} language="http" />
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-semibold">Key Management</h4>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p><strong>Generation:</strong> Create keys from any agent's detail page under the "API Gateway" tab, or via <code className="bg-muted px-1 rounded">POST /api/agents/:agentId/api-keys</code>.</p>
                  <p><strong>Security:</strong> Keys are hashed (SHA-256) before storage. The raw key is only shown once during creation.</p>
                  <p><strong>Scopes:</strong> Keys default to <code className="bg-muted px-1 rounded">["invoke"]</code> scope. Additional scopes can be added at creation time.</p>
                  <p><strong>Expiration:</strong> Keys can optionally be set to expire after a given number of days.</p>
                  <p><strong>Revocation:</strong> Revoke a key anytime via the UI or <code className="bg-muted px-1 rounded">DELETE /api/agents/:agentId/api-keys/:keyId</code>.</p>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-semibold">Session Authentication (Dashboard)</h4>
                <p className="text-sm text-muted-foreground">
                  The web dashboard uses JWT-based session cookies. After login, an <code className="bg-muted px-1 rounded">auth_token</code> httpOnly cookie is set automatically. 
                  This is not used for programmatic access — use API keys instead.
                </p>
              </div>

              <div className="space-y-3 border-t pt-4">
                <h4 className="text-sm font-semibold">Error Responses</h4>
                <div className="space-y-2">
                  {[
                    { code: "401", desc: "Missing or invalid API key", body: '{"message": "API key required"}' },
                    { code: "403", desc: "Key does not match the agent or has expired", body: '{"message": "API key does not belong to this agent"}' },
                    { code: "403", desc: "Key has been revoked", body: '{"message": "API key has been deactivated"}' },
                  ].map((err, i) => (
                    <div key={i} className="flex items-start gap-3 text-sm">
                      <Badge variant="outline" className="text-red-600 dark:text-red-400 text-[10px] shrink-0">{err.code}</Badge>
                      <div>
                        <span className="text-muted-foreground">{err.desc}</span>
                        <code className="block text-xs font-mono mt-1 text-muted-foreground">{err.body}</code>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reference" className="mt-4 space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search endpoints by path, method, or description..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="input-search-endpoints"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={expandAll} data-testid="button-expand-all">Expand All</Button>
              <Button variant="outline" size="sm" onClick={collapseAll} data-testid="button-collapse-all">Collapse All</Button>
              <Button variant="outline" size="sm" asChild>
                <a href="/api/openapi.json" target="_blank" data-testid="link-openapi-spec">
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  OpenAPI Spec
                </a>
              </Button>
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            {endpoints.length} endpoints across {Object.keys(groupedEndpoints).length} categories
            {searchQuery && ` (${Object.values(groupedEndpoints).reduce((s, g) => s + g.length, 0)} matching)`}
          </div>

          <div className="space-y-3">
            {Object.entries(groupedEndpoints).map(([tag, entries]) => {
              const isOpen = expandedGroups.has(tag);
              return (
                <Card key={tag}>
                  <button
                    className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors text-left"
                    onClick={() => toggleGroup(tag)}
                    data-testid={`button-group-${tag.replace(/[^a-z0-9]/gi, "-")}`}
                  >
                    <div className="space-y-0.5">
                      <h3 className="font-semibold text-sm">{tag}</h3>
                      {tagDescriptions[tag] && (
                        <p className="text-xs text-muted-foreground">{tagDescriptions[tag]}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-[10px]">{entries.length}</Badge>
                      {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </div>
                  </button>
                  {isOpen && (
                    <CardContent className="pt-0 space-y-2">
                      {entries.map((entry) => (
                        <EndpointCard key={`${entry.method}-${entry.path}`} entry={entry} baseUrl={baseUrl} />
                      ))}
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="sdks" className="mt-4 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <SiPython className="h-5 w-5" />
                  Python SDK
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  A ready-to-use Python client using <code className="bg-muted px-1 rounded">requests</code>. Covers agents, runtime, deployments, governance, knowledge bases, and more.
                </p>
                <div className="flex gap-2">
                  <CopyButton text={generatePythonSdk(baseUrl)} label="python-sdk" />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 text-xs"
                    onClick={() => {
                      const blob = new Blob([generatePythonSdk(baseUrl)], { type: "text/plain" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "nous_client.py";
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    data-testid="button-download-python"
                  >
                    <Download className="h-3 w-3" />
                    Download nous_client.py
                  </Button>
                </div>
                <ScrollArea className="h-[500px]">
                  <CodeBlock code={generatePythonSdk(baseUrl)} language="python" />
                </ScrollArea>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <SiTypescript className="h-5 w-5" />
                  TypeScript SDK
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  A fully typed TypeScript client using <code className="bg-muted px-1 rounded">fetch</code>. Includes TypeScript interfaces for all request/response types.
                </p>
                <div className="flex gap-2">
                  <CopyButton text={generateTypeScriptSdk(baseUrl)} label="typescript-sdk" />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 text-xs"
                    onClick={() => {
                      const blob = new Blob([generateTypeScriptSdk(baseUrl)], { type: "text/plain" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "nous-client.ts";
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    data-testid="button-download-typescript"
                  >
                    <Download className="h-3 w-3" />
                    Download nous-client.ts
                  </Button>
                </div>
                <ScrollArea className="h-[500px]">
                  <CodeBlock code={generateTypeScriptSdk(baseUrl)} language="typescript" />
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCode className="h-5 w-5" />
                OpenAPI Specification
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                The complete OpenAPI 3.0 specification is available as a JSON file. Use it to generate clients in any language, import into Postman, or integrate with your CI/CD pipeline.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" asChild data-testid="button-view-openapi">
                  <a href="/api/openapi.json" target="_blank">
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                    View Raw Spec
                  </a>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const blob = new Blob([JSON.stringify(spec, null, 2)], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "nous-openapi.json";
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  data-testid="button-download-openapi"
                >
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  Download JSON
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
