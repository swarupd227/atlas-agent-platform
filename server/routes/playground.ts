import { Router } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { eq, desc } from "drizzle-orm";
import { getOrgId } from "../auth";
import { conversations, messages as chatMessages } from "@shared/schema";
import { buildAgentSystemPrompt } from "./helpers";
import { executePromptWithMcp, type RuntimeProgressEvent } from "../agent-runtime";
import { callClaude, stripJsonFences, anthropicClient } from "../claude";

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

      await db.insert(chatMessages).values({
        conversationId: sessionId,
        role: "user",
        content,
      });

      const existingMsgs = await db.select().from(chatMessages)
        .where(eq(chatMessages.conversationId, sessionId))
        .orderBy(chatMessages.createdAt);

      const systemPrompt = buildAgentSystemPrompt(agent);

      const mcpLinks = await storage.getAgentMcpServers(agentId);
      const mcpServerIds = mcpLinks.map(l => l.serverId);
      const hasMcpServers = mcpServerIds.length > 0;
      // Note: web_search_preview (OpenAI-only tool) has been removed in favour of
      // Claude streaming for all non-MCP chat. Agents configured with the
      // "web_search" built-in tool will fall through to the Claude path below.
      // Implement web search via an MCP server tool for Anthropic-compatible results.

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      let fullResponse = "";

      if (hasMcpServers) {
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
              modelId: "gpt-4.1",
              toolCalls: toolCalls.length > 0 ? toolCalls : null,
            });
          } catch {}

        } catch (err: any) {
          fullResponse = `I encountered an error while processing your request: ${err.message}`;
          res.write(`data: ${JSON.stringify({ type: "error", content: fullResponse })}\n\n`);
        }
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
