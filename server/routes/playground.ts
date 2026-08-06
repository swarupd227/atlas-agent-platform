import { Router } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { eq, desc } from "drizzle-orm";
import { getOrgId } from "../auth";
import { getRequestRole } from "../permissions";
import { conversations, messages as chatMessages } from "@shared/schema";
import { buildAgentSystemPrompt, recomputeOutcomeKpis } from "./helpers";
import { executePromptWithMcp, type RuntimeProgressEvent } from "../agent-runtime";
import { callClaude, stripJsonFences, anthropicClient } from "../claude";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || undefined,
});

// A successful Playground execution against an outcome-bound agent produced
// real usage but never fed the metering pipeline -- Billing -> Invoices reads
// entirely off outcomeEvents (server/routes/governance.ts's metering
// dashboard filters allEvents by outcomeId), and this route only ever wrote
// a run_traces record. Same gap already fixed for team/blueprint DAG runs in
// dag-execution-engine.ts; this is the single-agent Playground equivalent
// (test finding TC_BILL_013). Fire-and-forget: metering must never break the
// chat response already streaming back to the user.
async function recordPlaygroundOutcomeEvent(
  agent: { id: string; outcomeId: string | null; organizationId: string | null },
  costUsd?: number,
): Promise<void> {
  if (!agent.outcomeId) return;
  try {
    await storage.createOutcomeEvent({
      organizationId: agent.organizationId ?? undefined,
      outcomeId: agent.outcomeId,
      agentId: agent.id,
      type: "playground_execution",
      billable: true,
      unitCount: 1,
      unitValue: costUsd || undefined,
    });
    await recomputeOutcomeKpis(agent.outcomeId, agent.organizationId ?? undefined);
  } catch (err: any) {
    console.error(`[playground] failed to record outcome event for agent ${agent.id}:`, err.message);
  }
}

const router = Router();

  router.get("/api/agents/:agentId/playground/sessions", async (req, res) => {
    try {
      const { agentId } = req.params;
      const allConversations = await db.select().from(conversations).where(eq(conversations.agentId, agentId)).orderBy(desc(conversations.createdAt));
      res.json(allConversations);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.post("/api/agents/:agentId/playground/sessions", async (req, res) => {
    try {
      const { agentId } = req.params;
      const agent = await storage.getAgent(agentId, getOrgId(req));
      if (!agent) return res.status(404).json({ error: "Agent not found" });
      const [conversation] = await db.insert(conversations).values({
        title: `${agent.name} - Playground`,
        agentId,
      }).returning();
      res.status(201).json(conversation);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.get("/api/agents/:agentId/playground/sessions/:sessionId/messages", async (req, res) => {
    try {
      const { agentId } = req.params;
      const sessionId = parseInt(req.params.sessionId);
      const [session] = await db.select().from(conversations).where(eq(conversations.id, sessionId));
      if (!session || session.agentId !== agentId) return res.status(404).json({ error: "Session not found" });
      const msgs = await db.select().from(chatMessages).where(eq(chatMessages.conversationId, sessionId)).orderBy(chatMessages.createdAt);
      res.json(msgs);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.delete("/api/agents/:agentId/playground/sessions/:sessionId", async (req, res) => {
    try {
      const { agentId } = req.params;
      const sessionId = parseInt(req.params.sessionId);
      const [session] = await db.select().from(conversations).where(eq(conversations.id, sessionId));
      if (!session || session.agentId !== agentId) return res.status(404).json({ error: "Session not found" });
      await db.delete(chatMessages).where(eq(chatMessages.conversationId, sessionId));
      await db.delete(conversations).where(eq(conversations.id, sessionId));
      res.status(204).send();
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  router.post("/api/agents/:agentId/playground/chat", async (req, res) => {
    try {
      const playgroundStartTime = Date.now();
      const { agentId } = req.params;
      const { content, sessionId } = req.body;

      if (!content || typeof content !== "string" || !sessionId) {
        return res.status(400).json({ error: "content (string) and sessionId are required" });
      }

      const agent = await storage.getAgent(agentId, getOrgId(req));
      if (!agent) return res.status(404).json({ error: "Agent not found" });

      const [session] = await db.select().from(conversations).where(eq(conversations.id, sessionId));
      if (!session || session.agentId !== agentId) return res.status(404).json({ error: "Session not found for this agent" });

      // Sessions are created with a generic "{agent} - Playground" title
      // (identical for every session against the same agent, so the list is
      // impossible to scan) -- retitle from the first real message so the
      // sidebar shows what each session was actually about.
      if (session.title === `${agent.name} - Playground`) {
        const retitled = content.length > 60 ? `${content.slice(0, 57)}...` : content;
        await db.update(conversations).set({ title: retitled }).where(eq(conversations.id, sessionId));
      }

      await db.insert(chatMessages).values({
        conversationId: sessionId,
        role: "user",
        content,
      });

      const existingMsgs = await db.select().from(chatMessages)
        .where(eq(chatMessages.conversationId, sessionId))
        .orderBy(chatMessages.createdAt);

      const systemPrompt = buildAgentSystemPrompt(agent);

      const agentTools = Array.isArray(agent.toolsConfig)
        ? (agent.toolsConfig as Array<{ name?: string; type?: string }>)
        : [];
      const webSearchEnabled = agentTools.some(t => t.name === "web_search" && t.type === "builtin");

      const mcpLinks = await storage.getAgentMcpServers(agentId);
      const mcpServerIds = mcpLinks.map(l => l.serverId);
      const hasMcpServers = mcpServerIds.length > 0;
      // An agent can be linked to a knowledge base (agentKnowledgeBases) with no
      // MCP servers at all -- executePromptWithMcp already has a working
      // "kb-only" mode (agent-runtime.ts, gated on hasKnowledgeBases, not on
      // mcpServerIds.length) that does real pgvector retrieval. Before this,
      // such an agent fell straight to the plain-Claude branch below with zero
      // retrieval, so it would narrate "searching the knowledge base..." and
      // then answer from the model's own guess -- not the agent's real,
      // ingested content, and with no execution trace to catch it.
      const linkedKbs = await storage.getAgentKnowledgeBases(agentId);
      const hasKnowledgeBases = linkedKbs.length > 0;
      // web_search_preview (OpenAI-only tool) is retained as an explicit exception
      // for agents configured with the "web_search" built-in tool. All other non-MCP
      // chat uses Claude (claude-opus-4-5). Audio transcription also stays on OpenAI.

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      let fullResponse = "";

      if (hasMcpServers || hasKnowledgeBases) {
        res.write(`data: ${JSON.stringify({ content: "" })}\n\n`);

        const conversationHistory = existingMsgs.length > 1
          ? existingMsgs.slice(0, -1).map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n\n")
          : "";
        const mcpPrompt = conversationHistory
          ? `## Conversation History\n${conversationHistory}\n\n## Current User Message\n${content}`
          : content;

        try {
          const playgroundOntologyTags = Array.isArray(agent.ontologyTags) ? (agent.ontologyTags as Array<{ conceptId: string; conceptLabel: string }>) : [];

          const onProgress = (event: RuntimeProgressEvent) => {
            try {
              res.write(`data: ${JSON.stringify({ type: event.type, timestamp: event.timestamp, ...event.data })}\n\n`);
            } catch {}
          };

          const result = await executePromptWithMcp(
            agentId,
            "playground",
            undefined,
            mcpServerIds,
            mcpPrompt,
            (agent as any).industry || undefined,
            systemPrompt,
            { conversational: true, ontologyLabels: playgroundOntologyTags.map(t => t.conceptLabel), maxToolIterations: agent.maxToolIterations ?? 5 },
            onProgress,
            undefined,
            getRequestRole(req),
          );

          if (!result.success && result.summary?.error) {
            fullResponse = `I wasn't able to complete your request: ${result.summary.error}`;
          } else {
            fullResponse = (result as any).conversationalResponse
              || result.summary?.analysis?.summary
              || "I processed your request but couldn't generate a detailed response.";
          }
          res.write(`data: ${JSON.stringify({ type: "complete", content: fullResponse })}\n\n`);

          try {
            const toolCalls = result.steps
              .filter((s: any) => s.type === "api_call" && s.mcpResolved)
              .map((s: any) => ({ tool: s.mcpTool, server: s.mcpServer, input: s.input, output: s.output, status: s.status, error: s.error }));
            await storage.createTrace({
              agentId,
              environment: "playground",
              status: result.success ? "completed" : "failed",
              latencyMs: result.summary?.latencyMs || 0,
              inputSummary: `Playground: ${content.length > 120 ? content.substring(0, 117) + "..." : content}`,
              outputSummary: fullResponse.length > 300 ? fullResponse.substring(0, 297) + "..." : fullResponse,
              stepsJson: result.steps,
              modelId: "claude-opus-4-5",
              toolCalls: toolCalls.length > 0 ? toolCalls : null,
            });
            if (result.success) {
              await recordPlaygroundOutcomeEvent(agent, result.summary?.costUsd);
            }
          } catch {}

        } catch (err: any) {
          fullResponse = `I encountered an error while processing your request: ${err.message}`;
          res.write(`data: ${JSON.stringify({ type: "error", content: fullResponse })}\n\n`);
        }
      } else if (webSearchEnabled) {
        const inputMessages: Array<{ role: "developer" | "user" | "assistant"; content: string }> = [
          { role: "developer", content: systemPrompt },
          ...existingMsgs.map(m => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
        ];

        const stream = await openai.responses.create({
          model: agent.modelName || "gpt-4.1",
          input: inputMessages,
          tools: [{ type: "web_search_preview" as any }],
          stream: true,
        } as any);

        const citations: Array<{ url: string; title: string }> = [];

        for await (const event of stream as any) {
          if (event.type === "response.output_text.delta") {
            const delta = event.delta || "";
            if (delta) {
              fullResponse += delta;
              res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
            }
          }
          if (event.type === "response.completed") {
            const output = event.response?.output;
            if (Array.isArray(output)) {
              for (const item of output) {
                if (item.type === "message" && Array.isArray(item.content)) {
                  for (const block of item.content) {
                    if (block.type === "output_text" && Array.isArray(block.annotations)) {
                      for (const ann of block.annotations) {
                        if (ann.type === "url_citation" && ann.url) {
                          citations.push({ url: ann.url, title: ann.title || ann.url });
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }

        if (citations.length > 0) {
          const citationBlock = "\n\n---\n**Sources:**\n" + citations.map((c, i) => `${i + 1}. [${c.title}](${c.url})`).join("\n");
          fullResponse += citationBlock;
          res.write(`data: ${JSON.stringify({ content: citationBlock })}\n\n`);
        }

        try {
          await storage.createTrace({
            agentId,
            environment: "playground",
            status: "completed",
            latencyMs: Date.now() - playgroundStartTime,
            inputSummary: `Playground: ${content.length > 120 ? content.substring(0, 117) + "..." : content}`,
            outputSummary: fullResponse.length > 300 ? fullResponse.substring(0, 297) + "..." : fullResponse,
            modelId: agent.modelName || "gpt-4.1",
          });
          await recordPlaygroundOutcomeEvent(agent);
        } catch {}
      } else {
        const claudeMsgs = existingMsgs.map(m => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));

        const claudeStream = anthropicClient.messages.stream({
          model: "claude-opus-4-5",
          system: systemPrompt,
          messages: claudeMsgs,
          max_tokens: 4096,
        });

        claudeStream.on("text", (text) => {
          fullResponse += text;
          res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
        });

        await claudeStream.finalMessage();

        try {
          await storage.createTrace({
            agentId,
            environment: "playground",
            status: "completed",
            latencyMs: Date.now() - playgroundStartTime,
            inputSummary: `Playground: ${content.length > 120 ? content.substring(0, 117) + "..." : content}`,
            outputSummary: fullResponse.length > 300 ? fullResponse.substring(0, 297) + "..." : fullResponse,
            modelId: "claude-opus-4-5",
          });
          await recordPlaygroundOutcomeEvent(agent);
        } catch {}
      }

      await db.insert(chatMessages).values({
        conversationId: sessionId,
        role: "assistant",
        content: fullResponse,
      });

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (e: any) {
      console.error("Playground chat error:", e);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: e.message });
      }
    }
  });

  router.post("/api/agents/:agentId/playground/chat-generic", async (req, res) => {
    try {
      const { agentId } = req.params;
      const { content, sessionId } = req.body;

      if (!content || typeof content !== "string") {
        return res.status(400).json({ error: "content (string) is required" });
      }

      const agent = await storage.getAgent(agentId, getOrgId(req));
      if (!agent) return res.status(404).json({ error: "Agent not found" });

      const existingMsgs = sessionId
        ? await db.select().from(chatMessages)
            .where(eq(chatMessages.conversationId, sessionId))
            .orderBy(chatMessages.createdAt)
        : [];

      const genericPrompt = buildAgentSystemPrompt(agent, { generic: true });

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      let fullResponse = "";

      const genericMsgs = [
        ...existingMsgs.map(m => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        { role: "user" as const, content },
      ];

      const claudeGenericStream = anthropicClient.messages.stream({
        model: "claude-opus-4-5",
        system: genericPrompt,
        messages: genericMsgs,
        max_tokens: 4096,
      });

      claudeGenericStream.on("text", (text) => {
        fullResponse += text;
        res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
      });

      await claudeGenericStream.finalMessage();

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (e: any) {
      console.error("Generic chat error:", e);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: e.message });
      }
    }
  });

  router.post("/api/agents/:agentId/playground/chat-annotate-citations", async (req, res) => {
    try {
      const { agentId } = req.params;
      const { citations } = req.body;

      if (!Array.isArray(citations) || citations.length === 0) {
        return res.json({ annotations: [] });
      }

      const agent = await storage.getAgent(agentId, getOrgId(req));
      if (!agent) return res.status(404).json({ error: "Agent not found" });

      const compliance = Array.isArray(agent.complianceTags) ? agent.complianceTags : [];
      const policies = Array.isArray(agent.policyBindings)
        ? (agent.policyBindings as Array<{ policyName?: string; name?: string; description?: string }>)
        : [];

      if (compliance.length === 0 && policies.length === 0) {
        return res.json({ annotations: citations.map((c: any) => ({ ...c, tags: [] })) });
      }

      const frameworks = [
        ...compliance.map((t: string) => t),
        ...policies.map(p => p.policyName || p.name || ""),
      ].filter(Boolean);

      const prompt = `Given these regulatory frameworks and compliance tags: ${frameworks.join(", ")}

The agent's compliance tag abbreviations are: ${compliance.join(", ")}

And these web search citations:
${citations.map((c: any, i: number) => `${i + 1}. "${c.title}" (${c.url})`).join("\n")}

For each citation, determine which regulatory frameworks (if any) it is relevant to.
IMPORTANT: Use SHORT abbreviation tags only (2-6 characters), matching the compliance tag abbreviations when possible. Examples: DOT, IATA, PCI-DSS, GDPR, TILA, ECOA, FCRA, HMDA, SOC2. Do NOT use long descriptive names like "Passenger Data Protection" - use abbreviations like "GDPR" or "DOT" instead.

Return ONLY a JSON array where each element has:
- index: the 0-based index
- tags: array of SHORT abbreviation tags (empty array if none match)

Return ONLY valid JSON array, no explanation.`;

      const annotateRaw = await callClaude({
        system: "",
        user: prompt,
        model: "claude-haiku-4-5",
        maxTokens: 1024,
      });

      let parsed: any[] = [];
      try {
        const cleaned = stripJsonFences(annotateRaw);
        parsed = JSON.parse(cleaned);
      } catch {
        const arrayMatch = annotateRaw.match(/\[[\s\S]*\]/);
        if (arrayMatch) {
          try { parsed = JSON.parse(arrayMatch[0]); } catch { /* fallback */ }
        }
      }

      const annotated = citations.map((c: any, i: number) => {
        const match = parsed.find((p: any) => p.index === i);
        return { ...c, tags: match?.tags || [] };
      });

      res.json({ annotations: annotated });
    } catch (e: any) {
      console.error("Citation annotation error:", e);
      res.status(500).json({ error: e.message });
    }
  });

export default router;
