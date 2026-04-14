/**
 * migrate-pkg-sched-to-prod.ts
 *
 * Run this ONCE against the PRODUCTION org to provision all 4 PKG scheduling agents,
 * their MCP servers, tools, KBs, skills, and policies.
 *
 * Usage: TARGET_ORG=production npx tsx scripts/migrate-pkg-sched-to-prod.ts
 *
 * NEVER run db:push — it drops the pgvector embedding column. Use this script.
 *
 * The script calls the same ensurePackagingSchedAgents() function used in dev,
 * but resolves storage against the production org.
 */

import dotenv from "dotenv";
dotenv.config();

import { storage } from "../server/storage";
import {
  makePkgSchedMcpServerDefs,
  PKG_SCHED_KB_DEFS,
  PKG_SCHED_SKILLS,
  PKG_SCHED_AGENT_DEFS,
  PKG_SCHED_POLICY_DEFS,
  PKG_SCHED_ONTOLOGY_CONCEPTS,
  PKG_SCHED_SYSTEM_PROMPTS,
  PKG_SCHED_AGENT_POLICIES,
  PKG_AGT_001_NAME, PKG_AGT_002_NAME, PKG_AGT_003_NAME, PKG_AGT_004_NAME,
} from "../server/pkg-sched-shared-defs";

// ── Production base URL ────────────────────────────────────────────────────────
const PROD_BASE_URL = process.env.PROD_BASE_URL || "https://atlas-platform.replit.app";
const PKG_SCHED_MCP_SERVERS = makePkgSchedMcpServerDefs(PROD_BASE_URL);

async function migrate() {
  console.log("[migrate-pkg-sched-to-prod] Starting Advantive SCN-1.1 production migration…");
  console.log(`[migrate-pkg-sched-to-prod] Base URL: ${PROD_BASE_URL}`);

  // ── 1. Ontology Concepts ─────────────────────────────────────────────────────
  console.log("[migrate-pkg-sched-to-prod] Step 1/6: Ontology concepts…");
  const allConcepts = await storage.getOntologyConcepts().catch(() => [] as Awaited<ReturnType<typeof storage.getOntologyConcepts>>);
  const conceptIdByLabel: Record<string, string> = {};
  for (const c of PKG_SCHED_ONTOLOGY_CONCEPTS) {
    let concept = allConcepts.find(x => x.label === c.label);
    if (!concept) {
      concept = await storage.createOntologyConcept({ label: c.label, category: c.category, description: c.description, tags: c.tags, status: "active" });
      console.log(`  Created concept: ${c.label}`);
    } else {
      console.log(`  Concept exists: ${c.label}`);
    }
    conceptIdByLabel[c.label] = concept.id;
  }

  // ── 2. Knowledge Bases ────────────────────────────────────────────────────────
  console.log("[migrate-pkg-sched-to-prod] Step 2/6: Knowledge bases…");
  const kbIdByName: Record<string, string> = {};
  const allKbs = await storage.getKnowledgeBases().catch(() => [] as Awaited<ReturnType<typeof storage.getKnowledgeBases>>);
  for (const kbDef of PKG_SCHED_KB_DEFS) {
    let kb = allKbs.find(k => k.name === kbDef.name);
    if (!kb) {
      kb = await storage.createKnowledgeBase({ name: kbDef.name, description: kbDef.description, industry: "manufacturing", status: "active", embeddingModel: "text-embedding-3-small", embeddingDimensions: 1536, chunkSize: 512, chunkOverlap: 50 });
      console.log(`  Created KB: ${kbDef.name}`);
    } else {
      console.log(`  KB exists: ${kbDef.name}`);
    }
    kbIdByName[kbDef.name] = kb.id;
  }

  // ── 3. Policies ───────────────────────────────────────────────────────────────
  console.log("[migrate-pkg-sched-to-prod] Step 3/6: Governance policies…");
  const policyIdByName: Record<string, string> = {};
  const allPolicies = await storage.getPolicies().catch(() => [] as Awaited<ReturnType<typeof storage.getPolicies>>);
  for (const pDef of PKG_SCHED_POLICY_DEFS) {
    let policy = allPolicies.find(p => p.name === pDef.name);
    if (!policy) {
      policy = await storage.createPolicy({ name: pDef.name, domain: pDef.domain, description: pDef.description, status: "active", policyJson: pDef.policyJson, version: "1.0.0", effectiveDate: new Date().toISOString().split("T")[0] });
      console.log(`  Created policy: ${pDef.name}`);
    } else {
      console.log(`  Policy exists: ${pDef.name}`);
    }
    policyIdByName[pDef.name] = policy.id;
  }

  // ── 4. Skills ─────────────────────────────────────────────────────────────────
  console.log("[migrate-pkg-sched-to-prod] Step 4/6: Skills…");
  const skillIdByName: Record<string, string> = {};
  const allSkills = await storage.getSkills().catch(() => [] as Awaited<ReturnType<typeof storage.getSkills>>);
  for (const skillDef of PKG_SCHED_SKILLS) {
    let skill = allSkills.find(s => s.name === skillDef.name);
    if (!skill) {
      skill = await storage.createSkill({ name: skillDef.name, description: skillDef.description, domain: skillDef.domain, industry: skillDef.industry, version: skillDef.version, author: skillDef.author, trustTier: "platform-provided", complexity: (skillDef.yamlFrontmatter.complexity as string) || "intermediate", status: "active", tags: skillDef.tags as unknown as string[], contextMode: "summary", markdownBody: skillDef.markdownBody, yamlFrontmatter: { ...skillDef.yamlFrontmatter } });
      console.log(`  Created skill: ${skillDef.name}`);
    } else {
      console.log(`  Skill exists: ${skillDef.name}`);
    }
    skillIdByName[skillDef.name] = skill.id;
  }

  // ── 5. MCP Servers + Tools ────────────────────────────────────────────────────
  console.log("[migrate-pkg-sched-to-prod] Step 5/6: MCP servers + tools…");
  const mcpServerIdByName: Record<string, string> = {};
  const allServers = await storage.getMcpServers().catch(() => [] as Awaited<ReturnType<typeof storage.getMcpServers>>);
  for (const serverDef of PKG_SCHED_MCP_SERVERS) {
    let server = allServers.find(s => s.name === serverDef.name);
    if (!server) {
      server = await storage.createMcpServer({ name: serverDef.name, description: serverDef.description, transportType: "streamable-http", url: serverDef.url, status: "registered", riskTier: "LOW", allowlisted: true, addedBy: "migrate-pkg-sched-to-prod", capabilities: { tools: true, resources: false, prompts: false, sampling: false }, serverInfo: { vendor: "Advantive / Kiwiplan / ATLAS Demo", version: "1.0.0" } });
      console.log(`  Created MCP server: ${serverDef.name}`);
    } else {
      await storage.updateMcpServer(server.id, { url: serverDef.url });
      console.log(`  Updated MCP server URL: ${serverDef.name}`);
    }
    mcpServerIdByName[serverDef.name] = server.id;

    const existingTools = await storage.getMcpServerTools(server.id).catch(() => [] as Awaited<ReturnType<typeof storage.getMcpServerTools>>);
    const existingToolNames = new Set(existingTools.map(t => t.name));
    for (const tool of serverDef.tools) {
      if (existingToolNames.has(tool.name)) {
        console.log(`    Tool exists: ${tool.name}`);
        continue;
      }
      await storage.createMcpServerTool({ serverId: server.id, name: tool.name, description: tool.description, inputSchema: { type: "object", properties: {}, required: [] }, annotations: { endpoint: tool.endpoint, method: tool.method }, enabled: true, riskClassification: "low" });
      console.log(`    Created tool: ${tool.name}`);
    }
  }

  // ── 6. Agents + Links ─────────────────────────────────────────────────────────
  console.log("[migrate-pkg-sched-to-prod] Step 6/6: Agents + platform links…");
  const allAgents = await storage.getAgents().catch(() => [] as any[]);
  for (const def of PKG_SCHED_AGENT_DEFS) {
    let agent = allAgents.find((a: any) => a.name === def.name);
    const mcpServerId = mcpServerIdByName[def.mcpServerName];
    const kbId        = kbIdByName[def.kbName];
    const systemPrompt = PKG_SCHED_SYSTEM_PROMPTS[def.externalId] || "";
    const agentPolicies = PKG_SCHED_AGENT_POLICIES[def.externalId] || [];

    if (!agent) {
      agent = await storage.createAgent({ name: def.name, description: def.description, status: "active", systemPrompt, industry: "manufacturing", department: def.department, autonomyMode: "autonomous", maxToolIterations: 6, model: "openai/gpt-4.1", riskTier: "MEDIUM", complianceTags: def.complianceTags as unknown as string[], ontologyTags: def.ontologyTags as unknown as string[], policyBindings: agentPolicies.map(p => ({ name: p.name, type: p.type })), runtimeConfig: { externalId: def.externalId, skillNames: def.skillNames as unknown as string[], demo: "pkg-sched" } });
      console.log(`  Created agent: ${def.name} (${(agent as any).id})`);
    } else {
      console.log(`  Agent exists: ${def.name} (${(agent as any).id})`);
    }

    if (mcpServerId) {
      const existingMcpLinks = await storage.getAgentMcpServers((agent as any).id).catch(() => [] as any[]);
      if (!existingMcpLinks.some((l: any) => l.mcpServerId === mcpServerId || l.id === mcpServerId)) {
        await storage.createAgentMcpServer({ agentId: (agent as any).id, mcpServerId }).catch(e => console.warn(`    MCP link warn: ${e.message}`));
        console.log(`  Linked MCP: ${def.mcpServerName}`);
      }
    }

    if (kbId) {
      const existingKbLinks = await storage.getAgentKnowledgeBases((agent as any).id).catch(() => [] as any[]);
      if (!existingKbLinks.some((l: any) => l.knowledgeBaseId === kbId || l.id === kbId)) {
        await storage.createAgentKnowledgeBase({ agentId: (agent as any).id, knowledgeBaseId: kbId }).catch(e => console.warn(`    KB link warn: ${e.message}`));
        console.log(`  Linked KB: ${def.kbName}`);
      }
    }

    for (const skillName of def.skillNames) {
      const skillId = skillIdByName[skillName];
      if (!skillId) continue;
      const existingSkillLinks = await storage.getAgentSkills((agent as any).id).catch(() => [] as any[]);
      if (!existingSkillLinks.some((l: any) => l.skillId === skillId || l.id === skillId)) {
        await storage.createAgentSkill({ agentId: (agent as any).id, skillId }).catch(e => console.warn(`    Skill link warn: ${e.message}`));
        console.log(`  Linked skill: ${skillName}`);
      }
    }
  }

  console.log("\n[migrate-pkg-sched-to-prod] ✓ Migration complete.");
  console.log(`  Agents provisioned: ${[PKG_AGT_001_NAME, PKG_AGT_002_NAME, PKG_AGT_003_NAME, PKG_AGT_004_NAME].join(", ")}`);
  console.log(`  MCP Servers: ${PKG_SCHED_MCP_SERVERS.map(s => s.name).join(", ")}`);
  console.log(`  Knowledge Bases: ${PKG_SCHED_KB_DEFS.map(k => k.name).join(", ")}`);
  console.log(`  Skills: ${PKG_SCHED_SKILLS.length} skills (3 per agent)`);
  console.log(`  Policies: ${PKG_SCHED_POLICY_DEFS.length} governance policies`);
}

migrate().catch(err => {
  console.error("[migrate-pkg-sched-to-prod] ✗ Migration failed:", err);
  process.exit(1);
});
