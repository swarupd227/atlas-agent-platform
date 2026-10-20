/**
 * Reconcile the validated Azure Hilti Campaign Planning Orchestrator into an
 * Astra monorepo deployment.
 *
 * Required:
 *   SOURCE_DATABASE_URL=... TARGET_BASE_URL=... TARGET_ADMIN_PASSWORD=...
 *
 * Dry-run is the default. A production write additionally requires:
 *   DRY_RUN=0 CONFIRM_TARGET=AWS_PROD_MONOREPO
 *
 * The source database transaction is READ ONLY. Every target write uses the
 * authenticated product API so tenant checks, validation, and audit events run.
 */
import pg from "pg";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { canonicalModelId, providerForModel } from "../server/llm-provider";

const TEAM_NAME = (process.env.SOURCE_TEAM_NAME || "Hilti Campaign Planning Orchestrator").trim();
const EXPECTED_NODES = Number(process.env.EXPECTED_NODES || 10);
const EXPECTED_EDGES = Number(process.env.EXPECTED_EDGES || 10);
const EXPECTED_KNOWLEDGE_BASES = Number(process.env.EXPECTED_KNOWLEDGE_BASES || 7);
const EXPECTED_KNOWLEDGE_SOURCES = Number(process.env.EXPECTED_KNOWLEDGE_SOURCES || 25);

type Named = { id: string; name: string };
type JsonRow = Record<string, any>;

async function curlRequest(
  baseUrl: string,
  method: string,
  path: string,
  cookie: string,
  body?: unknown,
  includeHeaders = false,
): Promise<{ status: number; text: string; headers: string }> {
  const args = ["-sS", "--max-time", "90", "-X", method];
  if (cookie) args.push("-H", `Cookie: ${cookie}`);
  if (body !== undefined) args.push("-H", "Content-Type: application/json", "--data-binary", "@-");
  if (includeHeaders) args.push("-D", "-");
  args.push("-w", "\n__ASTRA_STATUS__:%{http_code}", `${baseUrl}${path}`);

  return await new Promise((resolve, reject) => {
    const child = spawn("curl", args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`curl ${method} ${path} failed: ${stderr.trim().slice(0, 240)}`));
      const marker = stdout.lastIndexOf("\n__ASTRA_STATUS__:");
      if (marker < 0) return reject(new Error(`curl ${method} ${path} returned no status marker`));
      const status = Number(stdout.slice(marker + "\n__ASTRA_STATUS__:".length).trim());
      const payload = stdout.slice(0, marker);
      if (!includeHeaders) return resolve({ status, text: payload, headers: "" });
      const separator = Math.max(payload.lastIndexOf("\r\n\r\n"), payload.lastIndexOf("\n\n"));
      const width = payload.slice(separator, separator + 4).startsWith("\r\n\r\n") ? 4 : 2;
      resolve({ status, headers: separator >= 0 ? payload.slice(0, separator) : payload, text: separator >= 0 ? payload.slice(separator + width) : "" });
    });
    child.stdin.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

export function normalizeResourceName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}
export function indexUniqueByNormalizedName<T extends Named>(rows: T[], kind: string): Map<string, T> {
  const result = new Map<string, T>();
  for (const row of rows) {
    const key = normalizeResourceName(row.name);
    const prior = result.get(key);
    if (prior && prior.id !== row.id) {
      throw new Error(`Ambiguous ${kind} name "${row.name}" matches both ${prior.id} and ${row.id}`);
    }
    result.set(key, row);
  }
  return result;
}

export function assertProductionWriteAllowed(write: boolean, confirmation: string | undefined): void {
  if (write && confirmation !== "AWS_PROD_MONOREPO") {
    throw new Error("Production writes require CONFIRM_TARGET=AWS_PROD_MONOREPO");
  }
}

function nodeKey(node: JsonRow): string {
  const stateKey = node.stateKey ?? node.state_key;
  return stateKey ? `state:${String(stateKey).trim()}` : `label:${normalizeResourceName(String(node.label || ""))}`;
}

function edgeKey(edge: JsonRow): string {
  return [edge.sourceNodeId, edge.targetNodeId, normalizeResourceName(String(edge.label || ""))].join("|");
}

function mapNodeBody(node: JsonRow, blueprintId: string, agentIds: Map<string, string>): JsonRow {
  const sourceAgentId = node.refAgentId ?? node.ref_agent_id;
  const refAgentId = sourceAgentId ? agentIds.get(sourceAgentId) : undefined;
  if (sourceAgentId && !refAgentId) throw new Error(`No target agent mapping for graph node ${node.label}`);
  return {
    blueprintId,
    nodeType: node.nodeType ?? node.node_type,
    label: String(node.label).trim(),
    positionX: node.positionX ?? node.position_x ?? 0,
    positionY: node.positionY ?? node.position_y ?? 0,
    refAgentId: refAgentId ?? null,
    refRemoteAgentId: node.refRemoteAgentId ?? node.ref_remote_agent_id ?? null,
    refToolIds: node.refToolIds ?? node.ref_tool_ids ?? [],
    refPolicyId: node.refPolicyId ?? node.ref_policy_id ?? null,
    gateType: node.gateType ?? node.gate_type ?? null,
    config: node.config ?? null,
    stateKey: node.stateKey ?? node.state_key ?? null,
    outputSchema: node.outputSchema ?? node.output_schema ?? null,
    fallbackOutput: node.fallbackOutput ?? node.fallback_output ?? null,
    timeoutMs: node.timeoutMs ?? node.timeout_ms ?? 30_000,
    retryPolicy: node.retryPolicy ?? node.retry_policy ?? null,
    refTeamAgentId: node.refTeamAgentId ?? node.ref_team_agent_id ?? null,
    outputContractId: node.outputContractId ?? node.output_contract_id ?? null,
    refSkillId: node.refSkillId ?? node.ref_skill_id ?? null,
    refKnowledgeBaseId: node.refKnowledgeBaseId ?? node.ref_knowledge_base_id ?? null,
  };
}

function mapEdgeBody(edge: JsonRow, blueprintId: string, nodeIds: Map<string, string>): JsonRow {
  const sourceId = edge.sourceNodeId ?? edge.source_node_id;
  const targetId = edge.targetNodeId ?? edge.target_node_id;
  const sourceNodeId = nodeIds.get(sourceId);
  const targetNodeId = nodeIds.get(targetId);
  if (!sourceNodeId || !targetNodeId) throw new Error(`No target node mapping for edge ${sourceId} -> ${targetId}`);
  return {
    blueprintId,
    sourceNodeId,
    targetNodeId,
    label: edge.label ?? null,
    contentPartTypes: edge.contentPartTypes ?? edge.content_part_types ?? [],
    allowedMetadata: edge.allowedMetadata ?? edge.allowed_metadata ?? null,
    slaTimeoutMs: edge.slaTimeoutMs ?? edge.sla_timeout_ms ?? null,
    failureMode: edge.failureMode ?? edge.failure_mode ?? "escalate",
    retryPolicy: edge.retryPolicy ?? edge.retry_policy ?? null,
    condition: edge.condition ?? null,
    config: edge.config ?? null,
    evaluationMode: edge.evaluationMode ?? edge.evaluation_mode ?? "ai",
    rule: edge.rule ?? null,
  };
}

export function remapTeamGraph(
  nodes: JsonRow[],
  edges: JsonRow[],
  agentIds: Map<string, string>,
  nodeIds: Map<string, string>,
  blueprintId: string,
): { nodes: JsonRow[]; edges: JsonRow[] } {
  return {
    nodes: nodes.map((node) => mapNodeBody(node, blueprintId, agentIds)),
    edges: edges.map((edge) => mapEdgeBody(edge, blueprintId, nodeIds)),
  };
}

class TargetApi {
  private cookie = "";
  private readonly useCurl = process.env.HTTP_TRANSPORT === "curl";
  constructor(private readonly baseUrl: string, private readonly username: string, private readonly password: string) {}

  async ready(): Promise<void> {
    if (this.useCurl) {
      const response = await curlRequest(this.baseUrl, "GET", "/ready", "");
      if (response.status < 200 || response.status >= 300) throw new Error(`Target readiness check failed (${response.status})`);
      return;
    }
    const response = await fetch(`${this.baseUrl}/ready`, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Target readiness check failed (${response.status})`);
  }

  async login(): Promise<void> {
    if (this.useCurl) {
      const response = await curlRequest(this.baseUrl, "POST", "/api/auth/login", "", { username: this.username, password: this.password }, true);
      if (response.status < 200 || response.status >= 300) throw new Error(`Target login failed (${response.status}): ${response.text.slice(0, 160)}`);
      const auth = /set-cookie:\s*auth_token=([^;]+)/i.exec(response.headers)?.[1];
      if (!auth) throw new Error("Target login returned no auth cookie");
      this.cookie = `auth_token=${auth}`;
      return;
    }
    const response = await fetch(`${this.baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: this.username, password: this.password }),
      signal: AbortSignal.timeout(45_000),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Target login failed (${response.status}): ${text.slice(0, 160)}`);
    const cookies: string[] = (response.headers as any).getSetCookie?.() ?? [response.headers.get("set-cookie") ?? ""];
    const auth = cookies.map((entry) => /auth_token=([^;]+)/.exec(entry)?.[1]).find(Boolean);
    if (!auth) throw new Error("Target login returned no auth cookie");
    this.cookie = `auth_token=${auth}`;
  }

  async call(method: string, path: string, body?: unknown): Promise<any> {
    if (this.useCurl) {
      const response = await curlRequest(this.baseUrl, method, path, this.cookie, body);
      if (response.status < 200 || response.status >= 300) throw new Error(`${method} ${path} failed (${response.status}): ${response.text.slice(0, 240)}`);
      return response.text ? JSON.parse(response.text) : null;
    }
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { Cookie: this.cookie, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
      signal: AbortSignal.timeout(90_000),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`${method} ${path} failed (${response.status}): ${text.slice(0, 240)}`);
    return text ? JSON.parse(text) : null;
  }
}

type Snapshot = {
  team: JsonRow;
  blueprint: JsonRow;
  agents: JsonRow[];
  nodes: JsonRow[];
  edges: JsonRow[];
  links: JsonRow[];
  knowledgeBases: JsonRow[];
  sources: JsonRow[];
  skills: JsonRow[];
  policies: JsonRow[];
};

function jsonIds(value: unknown, keys: string[]): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry === "string") return [entry];
    if (!entry || typeof entry !== "object") return [];
    const id = keys.map((key) => (entry as any)[key]).find((candidate) => typeof candidate === "string");
    return id ? [id] : [];
  });
}

async function readSourceSnapshot(connectionString: string): Promise<Snapshot> {
  const client = new pg.Client({
    connectionString,
    ssl: process.env.SOURCE_DB_SSL === "0" ? undefined : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const teamRows = (await client.query(
      "select to_jsonb(a) as row from agents a where lower(btrim(a.name)) = lower($1)",
      [TEAM_NAME],
    )).rows.map((item) => item.row);
    if (teamRows.length !== 1) throw new Error(`Expected one source team named ${TEAM_NAME}, found ${teamRows.length}`);
    const team = teamRows[0];
    if (!team.blueprint_id) throw new Error("Source team has no blueprint");

    const blueprint = (await client.query("select to_jsonb(b) as row from blueprints b where b.id = $1", [team.blueprint_id])).rows[0]?.row;
    if (!blueprint) throw new Error(`Source blueprint ${team.blueprint_id} was not found`);
    const nodes = (await client.query("select to_jsonb(n) as row from team_blueprint_nodes n where n.blueprint_id = $1 order by n.position_y, n.position_x, n.id", [team.blueprint_id])).rows.map((item) => item.row);
    const edges = (await client.query("select to_jsonb(e) as row from team_blueprint_edges e where e.blueprint_id = $1 order by e.created_at, e.id", [team.blueprint_id])).rows.map((item) => item.row);
    if (nodes.length !== EXPECTED_NODES || edges.length !== EXPECTED_EDGES) {
      throw new Error(`Approved source topology changed: expected ${EXPECTED_NODES} nodes/${EXPECTED_EDGES} edges, found ${nodes.length}/${edges.length}`);
    }
    if (nodes.some((node) => node.ref_agent_id
      ? node.ref_policy_id || node.ref_skill_id || node.ref_knowledge_base_id || node.ref_team_agent_id
      : node.node_type !== "edge_gate")) {
      throw new Error("Approved source topology changed: expected worker-agent nodes plus explicit edge gates only");
    }

    const workerIds = [...new Set(nodes.map((node) => node.ref_agent_id).filter(Boolean))];
    const agents = (await client.query("select to_jsonb(a) as row from agents a where a.id = any($1::varchar[])", [[team.id, ...workerIds]])).rows.map((item) => item.row);
    if (agents.length !== workerIds.length + 1) throw new Error(`Expected the team plus ${workerIds.length} workers, found ${agents.length} agents`);

    const agentIds = agents.map((agent) => agent.id);
    const links = (await client.query("select to_jsonb(l) as row from agent_knowledge_bases l where l.agent_id = any($1::varchar[])", [agentIds])).rows.map((item) => item.row);
    const kbIds = [...new Set(links.map((link) => link.knowledge_base_id))];
    const knowledgeBases = kbIds.length
      ? (await client.query("select to_jsonb(k) as row from knowledge_bases k where k.id = any($1::varchar[])", [kbIds])).rows.map((item) => item.row)
      : [];
    const sources = kbIds.length
      ? (await client.query("select to_jsonb(s) as row from knowledge_sources s where s.knowledge_base_id = any($1::varchar[]) order by s.knowledge_base_id, s.created_at, s.id", [kbIds])).rows.map((item) => item.row)
      : [];

    const skillIds = [...new Set(agents.flatMap((agent) => jsonIds(agent.preloaded_skills, ["skillId", "id"])))];
    const policyIds = [...new Set(agents.flatMap((agent) => jsonIds(agent.policy_bindings, ["policyId", "id"])))];
    const skills = skillIds.length
      ? (await client.query("select to_jsonb(s) as row from skills s where s.id = any($1::varchar[])", [skillIds])).rows.map((item) => item.row)
      : [];
    const policies = policyIds.length
      ? (await client.query("select to_jsonb(p) as row from policies p where p.id = any($1::varchar[])", [policyIds])).rows.map((item) => item.row)
      : [];
    if (links.length !== EXPECTED_KNOWLEDGE_BASES || knowledgeBases.length !== EXPECTED_KNOWLEDGE_BASES || sources.length !== EXPECTED_KNOWLEDGE_SOURCES) {
      throw new Error(
        `Approved source dependencies changed: expected ${EXPECTED_KNOWLEDGE_BASES} KB links/bases and ${EXPECTED_KNOWLEDGE_SOURCES} sources, ` +
        `found ${links.length}/${knowledgeBases.length}/${sources.length}`,
      );
    }
    if (skills.length !== 1 || policies.length !== 1) {
      throw new Error(`Approved source dependencies changed: expected one skill and one policy, found ${skills.length}/${policies.length}`);
    }
    await client.query("COMMIT");
    return { team, blueprint, agents, nodes, edges, links, knowledgeBases, sources, skills, policies };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

const AGENT_FIELD_MAP: Array<[string, string]> = [
  ["name", "name"], ["agent_type", "agentType"], ["description", "description"], ["owner", "owner"],
  ["status", "status"], ["risk_tier", "riskTier"], ["autonomy_mode", "autonomyMode"], ["current_version", "currentVersion"],
  ["environment", "environment"], ["model_provider", "modelProvider"], ["model_name", "modelName"],
  ["document_generation_mode", "documentGenerationMode"], ["blueprint_json", "blueprintJson"], ["tools_config", "toolsConfig"],
  ["permissions_config", "permissionsConfig"], ["memory_rag_config", "memoryRagConfig"], ["policy_bindings", "policyBindings"],
  ["eval_bindings", "evalBindings"], ["rollback_plan", "rollbackPlan"], ["tool_access_class", "toolAccessClass"],
  ["workspace_audience", "workspaceAudience"], ["compliance_tags", "complianceTags"], ["ontology_tags", "ontologyTags"],
  ["runtime_config", "runtimeConfig"], ["memory_governance_rules", "memoryGovernanceRules"], ["system_prompt", "systemPrompt"],
  ["department", "department"], ["requires_revalidation", "requiresRevalidation"], ["revalidation_reason", "revalidationReason"],
  ["max_tool_iterations", "maxToolIterations"], ["preloaded_skills", "preloadedSkills"], ["is_curated_journey", "isCuratedJourney"],
  ["journey_industry_id", "journeyIndustryId"], ["journey_sub_vertical", "journeySubVertical"], ["industry_id", "industryId"], ["sub_vertical", "subVertical"],
];

function remapBindings(items: unknown, ids: Map<string, string>, key: "skillId" | "policyId"): unknown {
  if (!Array.isArray(items)) return items;
  return items.map((entry) => {
    if (typeof entry === "string") return ids.get(entry) ?? entry;
    if (!entry || typeof entry !== "object") return entry;
    const sourceId = (entry as any)[key] ?? (entry as any).id;
    const targetId = ids.get(sourceId) ?? sourceId;
    return { ...(entry as any), ...(key in (entry as any) ? { [key]: targetId } : { id: targetId }) };
  });
}

function trimToolNames(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((tool) => tool && typeof tool === "object" && typeof (tool as any).name === "string"
    ? { ...(tool as any), name: (tool as any).name.trim() }
    : tool);
}

export function canonicalModelSelection(provider: string | undefined, model: string): { modelProvider: string | undefined; modelName: string } {
  const modelName = canonicalModelId(undefined, model);
  return { modelProvider: providerForModel(modelName) ?? provider, modelName };
}

export function modelSelectionMatches(
  actual: { modelProvider?: string; modelName?: string },
  sourceProvider: string | undefined,
  sourceModel: string,
): boolean {
  const expected = canonicalModelSelection(sourceProvider, sourceModel);
  return actual.modelProvider === expected.modelProvider && actual.modelName === expected.modelName;
}

function agentBody(agent: JsonRow, skillIds: Map<string, string>, policyIds: Map<string, string>): JsonRow {
  const body: JsonRow = {};
  for (const [source, target] of AGENT_FIELD_MAP) if (agent[source] !== undefined) body[target] = agent[source];
  body.name = String(body.name).trim();
  Object.assign(body, canonicalModelSelection(body.modelProvider, String(body.modelName || "")));
  body.toolsConfig = trimToolNames(body.toolsConfig);
  body.preloadedSkills = remapBindings(body.preloadedSkills, skillIds, "skillId");
  body.policyBindings = remapBindings(body.policyBindings, policyIds, "policyId");
  delete body.blueprintJson;
  return body;
}

function kbBody(kb: JsonRow): JsonRow {
  return {
    name: String(kb.name).trim(), description: kb.description, industry: kb.industry, status: kb.status,
    vectorDbType: kb.vector_db_type, vectorDbConfig: kb.vector_db_config, embeddingModel: kb.embedding_model,
    embeddingDimensions: kb.embedding_dimensions, chunkSize: kb.chunk_size, chunkOverlap: kb.chunk_overlap,
    stalenessThresholdDays: kb.staleness_threshold_days,
  };
}

function wantedRows<T extends Named>(all: T[], names: string[]): T[] {
  const wanted = new Set(names.map(normalizeResourceName));
  return all.filter((row) => wanted.has(normalizeResourceName(row.name)));
}

function matchSourceRows<T extends Named>(sourceRows: T[], targetRows: T[], kind: string): Map<string, T> {
  const result = new Map<string, T>();
  for (const source of sourceRows) {
    const sameId = targetRows.find((target) => target.id === source.id);
    if (sameId) {
      result.set(source.id, sameId);
      continue;
    }
    const matches = targetRows.filter((target) => normalizeResourceName(target.name) === normalizeResourceName(source.name));
    if (matches.length > 1) {
      throw new Error(`Ambiguous ${kind} name "${source.name}" matches ${matches.map((match) => match.id).join(", ")}`);
    }
    if (matches[0]) result.set(source.id, matches[0]);
  }
  return result;
}

async function dependencyMap(sourceRows: JsonRow[], targetRows: JsonRow[], kind: string): Promise<Map<string, string>> {
  const targetByName = indexUniqueByNormalizedName(wantedRows(targetRows, sourceRows.map((row) => row.name)), kind);
  const result = new Map<string, string>();
  for (const source of sourceRows) {
    const target = targetRows.find((row) => row.id === source.id) ?? targetByName.get(normalizeResourceName(source.name));
    if (!target) throw new Error(`Target is missing required ${kind} "${source.name}" (${source.id})`);
    result.set(source.id, target.id);
  }
  return result;
}

async function reconcile(snapshot: Snapshot, api: TargetApi, write: boolean): Promise<JsonRow> {
  const [targetAgents, targetKbs, targetSkills, targetPolicies] = await Promise.all([
    api.call("GET", "/api/agents"), api.call("GET", "/api/knowledge-bases"),
    api.call("GET", "/api/skills"), api.call("GET", "/api/policies"),
  ]);
  const targetAgentMatches = matchSourceRows(snapshot.agents, targetAgents, "agent");
  const targetKbMatches = matchSourceRows(snapshot.knowledgeBases, targetKbs, "knowledge base");
  const skillIds = await dependencyMap(snapshot.skills, targetSkills, "skill");
  const policyIds = await dependencyMap(snapshot.policies, targetPolicies, "policy");

  const plan = {
    target: process.env.TARGET_BASE_URL,
    dryRun: !write,
    team: TEAM_NAME,
    agents: { create: 0, update: 0 },
    knowledgeBases: { create: 0, update: 0, addSources: 0 },
    graph: { nodes: snapshot.nodes.length, edges: snapshot.edges.length },
    bindings: snapshot.links.length,
    dependencies: { skills: skillIds.size, policies: policyIds.size },
  };
  for (const source of snapshot.agents) targetAgentMatches.has(source.id) ? plan.agents.update++ : plan.agents.create++;
  for (const source of snapshot.knowledgeBases) targetKbMatches.has(source.id) ? plan.knowledgeBases.update++ : plan.knowledgeBases.create++;
  for (const source of snapshot.sources) {
    const kb = snapshot.knowledgeBases.find((item) => item.id === source.knowledge_base_id);
    const targetKb = kb ? targetKbMatches.get(kb.id) : undefined;
    if (!targetKb) plan.knowledgeBases.addSources++;
    else {
      const listed: JsonRow[] = await api.call("GET", `/api/knowledge-bases/${targetKb.id}/sources`);
      if (!listed.some((item) => normalizeResourceName(item.name) === normalizeResourceName(source.name))) plan.knowledgeBases.addSources++;
    }
  }
  console.log(JSON.stringify({ phase: "plan", ...plan }, null, 2));
  if (!write) return plan;

  const kbIds = new Map<string, string>();
  for (const source of snapshot.knowledgeBases) {
    const existing = targetKbMatches.get(source.id);
    const target = existing
      ? await api.call("PATCH", `/api/knowledge-bases/${existing.id}`, kbBody(source))
      : await api.call("POST", "/api/knowledge-bases", kbBody(source));
    kbIds.set(source.id, target.id);
  }
  for (const source of snapshot.sources) {
    const targetKbId = kbIds.get(source.knowledge_base_id);
    if (!targetKbId) throw new Error(`No target KB mapping for source ${source.name}`);
    const listed: JsonRow[] = await api.call("GET", `/api/knowledge-bases/${targetKbId}/sources`);
    const matches = listed.filter((item) => normalizeResourceName(item.name) === normalizeResourceName(source.name));
    if (matches.length > 1) throw new Error(`Ambiguous source name "${source.name}" in target KB ${targetKbId}`);
    if (matches.length === 1) continue;
    if (typeof source.content === "string" && source.content.trim()) {
      await api.call("POST", `/api/knowledge-bases/${targetKbId}/sources/text`, { title: String(source.name).trim(), content: source.content });
    } else if (source.url) {
      await api.call("POST", `/api/knowledge-bases/${targetKbId}/sources/url`, { name: String(source.name).trim(), url: source.url, crawl: false });
    } else {
      throw new Error(`Source "${source.name}" has neither extracted content nor a URL`);
    }
  }

  const agentIds = new Map<string, string>();
  for (const source of snapshot.agents) {
    const body = agentBody(source, skillIds, policyIds);
    const existing = targetAgentMatches.get(source.id);
    const target = existing
      ? await api.call("PATCH", `/api/agents/${existing.id}`, body)
      : await api.call("POST", "/api/agents", body);
    agentIds.set(source.id, target.id);
  }

  for (const link of snapshot.links) {
    const targetAgentId = agentIds.get(link.agent_id);
    const targetKbId = kbIds.get(link.knowledge_base_id);
    if (!targetAgentId || !targetKbId) throw new Error("Could not map a knowledge-base binding");
    const current = await api.call("GET", `/api/agents/${targetAgentId}/knowledge-bases`);
    if (!(current.links || []).some((item: JsonRow) => item.knowledgeBaseId === targetKbId)) {
      await api.call("POST", `/api/agents/${targetAgentId}/knowledge-bases`, {
        knowledgeBaseId: targetKbId,
        priority: link.priority,
        retrievalConfig: link.retrieval_config,
      });
    }
  }

  const targetTeamId = agentIds.get(snapshot.team.id);
  if (!targetTeamId) throw new Error("Target team was not reconciled");
  const targetTeam = await api.call("GET", `/api/agents/${targetTeamId}`);
  let blueprintId = targetTeam.blueprintId as string | undefined;
  if (!blueprintId) {
    const created = await api.call("POST", "/api/blueprints", {
      name: String(snapshot.blueprint.name).trim(), description: snapshot.blueprint.description,
      agentId: targetTeamId, status: "draft", blueprintJson: snapshot.blueprint.blueprint_json,
      patternType: snapshot.blueprint.pattern_type, tags: snapshot.blueprint.tags ?? [], isShared: false,
    });
    blueprintId = created.id;
    await api.call("PATCH", `/api/agents/${targetTeamId}`, { blueprintId });
  } else {
    await api.call("PATCH", `/api/blueprints/${blueprintId}`, {
      name: String(snapshot.blueprint.name).trim(), description: snapshot.blueprint.description,
      agentId: targetTeamId, blueprintJson: snapshot.blueprint.blueprint_json,
      patternType: snapshot.blueprint.pattern_type, tags: snapshot.blueprint.tags ?? [], isShared: false,
    });
  }

  const existingGraph = await api.call("GET", `/api/blueprints/${blueprintId}/team-graph`);
  const sourceNodeByKey = new Map<string, JsonRow>();
  for (const node of snapshot.nodes) {
    const key = nodeKey(node);
    if (sourceNodeByKey.has(key)) throw new Error(`Ambiguous source graph node key ${key}`);
    sourceNodeByKey.set(key, node);
  }
  const targetNodeByKey = new Map<string, JsonRow>();
  for (const node of existingGraph.nodes || []) {
    const key = nodeKey(node);
    if (targetNodeByKey.has(key)) throw new Error(`Ambiguous target graph node key ${key}`);
    targetNodeByKey.set(key, node);
  }
  const nodeIds = new Map<string, string>();
  for (const source of snapshot.nodes) {
    const key = nodeKey(source);
    const existing = targetNodeByKey.get(key);
    const body = mapNodeBody(source, blueprintId, agentIds);
    const target = existing
      ? await api.call("PATCH", `/api/team-blueprint-nodes/${existing.id}`, body)
      : await api.call("POST", "/api/team-blueprint-nodes", body);
    nodeIds.set(source.id, target.id);
  }

  const mappedEdges = snapshot.edges.map((edge) => mapEdgeBody(edge, blueprintId, nodeIds));
  const targetEdgeByKey = new Map<string, JsonRow>();
  for (const edge of existingGraph.edges || []) {
    const key = edgeKey(edge);
    if (targetEdgeByKey.has(key)) throw new Error(`Ambiguous target graph edge key ${key}`);
    targetEdgeByKey.set(key, edge);
  }
  const wantedEdgeKeys = new Set<string>();
  for (const body of mappedEdges) {
    const key = edgeKey(body);
    wantedEdgeKeys.add(key);
    const existing = targetEdgeByKey.get(key);
    if (existing) await api.call("PATCH", `/api/team-blueprint-edges/${existing.id}`, body);
    else await api.call("POST", "/api/team-blueprint-edges", body);
  }
  for (const edge of existingGraph.edges || []) if (!wantedEdgeKeys.has(edgeKey(edge))) await api.call("DELETE", `/api/team-blueprint-edges/${edge.id}`);
  for (const node of existingGraph.nodes || []) if (!sourceNodeByKey.has(nodeKey(node))) await api.call("DELETE", `/api/team-blueprint-nodes/${node.id}`);

  const verifiedGraph = await api.call("GET", `/api/blueprints/${blueprintId}/team-graph`);
  if (verifiedGraph.nodes?.length !== EXPECTED_NODES || verifiedGraph.edges?.length !== EXPECTED_EDGES) {
    throw new Error(`Target graph verification failed: ${verifiedGraph.nodes?.length ?? 0} nodes/${verifiedGraph.edges?.length ?? 0} edges`);
  }
  for (const source of snapshot.agents) {
    const id = agentIds.get(source.id)!;
    const target = await api.call("GET", `/api/agents/${id}`);
    const sourceModel = String(source.model_name || "");
    const expected = canonicalModelSelection(source.model_provider, sourceModel);
    if (!modelSelectionMatches(target, source.model_provider, sourceModel)) {
      throw new Error(
        `Model verification failed for ${source.name}: expected ${expected.modelProvider}/${expected.modelName}, found ${target.modelProvider}/${target.modelName}`,
      );
    }
  }
  for (const sourceKb of snapshot.knowledgeBases) {
    const targetKbId = kbIds.get(sourceKb.id)!;
    const expected = snapshot.sources.filter((source) => source.knowledge_base_id === sourceKb.id).length;
    const actual = (await api.call("GET", `/api/knowledge-bases/${targetKbId}/sources`)).length;
    if (actual < expected) throw new Error(`Knowledge source verification failed for ${sourceKb.name}: expected at least ${expected}, found ${actual}`);
  }
  return { ...plan, verified: true, targetTeamId, targetBlueprintId: blueprintId };
}

async function main(): Promise<void> {
  const sourceDatabaseUrl = process.env.SOURCE_DATABASE_URL || "";
  const targetBaseUrl = (process.env.TARGET_BASE_URL || "").replace(/\/+$/, "");
  const targetPassword = process.env.TARGET_ADMIN_PASSWORD || "";
  const write = process.env.DRY_RUN === "0";
  if (!sourceDatabaseUrl || !targetBaseUrl || !targetPassword) {
    throw new Error("SOURCE_DATABASE_URL, TARGET_BASE_URL, and TARGET_ADMIN_PASSWORD are required");
  }
  assertProductionWriteAllowed(write, process.env.CONFIRM_TARGET);
  const api = new TargetApi(targetBaseUrl, process.env.TARGET_ADMIN_USER || "admin", targetPassword);
  await api.ready();
  await api.login();
  const snapshot = await readSourceSnapshot(sourceDatabaseUrl);
  if (write) {
    console.error(`\nPRODUCTION WRITE: ${targetBaseUrl}\nTeam: ${TEAM_NAME}\nStarting in 5 seconds...\n`);
    await new Promise((resolve) => setTimeout(resolve, Number(process.env.WRITE_DELAY_MS || 5_000)));
  }
  const result = await reconcile(snapshot, api, write);
  console.log(JSON.stringify({ phase: write ? "applied" : "dry-run", ...result }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
