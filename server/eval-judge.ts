import { getDefaultProvider } from "./llm-provider";

export interface CriterionResult {
  criterion: string;
  met: boolean;
}

export interface DimensionJudgeResult {
  dimId: string;
  criteriaResults: CriterionResult[];
}

export interface LlmJudgeResult {
  isPassed: boolean;
  confidence: number;
  reason: string;
  latencyMs: number;
  dimensionResults?: DimensionJudgeResult[];
}

export interface AgentRunResult {
  output: string;
  latencyMs: number;
}

export function buildAgentContext(agent: { name?: string | null; description?: string | null; systemPrompt?: string | null }): string {
  const parts: string[] = [];
  if (agent.name) parts.push(`Agent name: ${agent.name}`);
  if (agent.description) parts.push(`Description: ${agent.description}`);
  if (agent.systemPrompt) parts.push(`System prompt:\n${agent.systemPrompt}`);
  return parts.join("\n\n");
}

export async function runAgentOnInput(
  systemPrompt: string | null | undefined,
  inputData: Record<string, unknown>,
): Promise<AgentRunResult> {
  const provider = getDefaultProvider();
  const start = Date.now();

  let userMessage: string;
  if (typeof inputData.prompt === "string") {
    userMessage = inputData.prompt;
  } else if (typeof inputData.input === "string") {
    userMessage = inputData.input;
  } else if (typeof inputData.message === "string") {
    userMessage = inputData.message;
  } else if (typeof inputData.query === "string") {
    userMessage = inputData.query;
  } else {
    userMessage = JSON.stringify(inputData, null, 2);
  }

  try {
    const result = await provider.complete(
      [
        { role: "system", content: systemPrompt || "You are a helpful AI assistant." },
        { role: "user", content: userMessage },
      ],
      {
        temperature: 0,
        maxTokens: 1000,
      },
    );
    return { output: result.content, latencyMs: Date.now() - start };
  } catch (err: any) {
    console.error("[eval-judge] Agent execution failed:", err.message);
    return { output: "", latencyMs: Date.now() - start };
  }
}

export async function runLlmJudge(
  testName: string,
  inputData: Record<string, unknown>,
  expectedOutput: Record<string, unknown> | null,
  agentContext: string,
  actualOutput: string | null,
  industryDimensions?: Array<{ id: string; name: string; scoringCriteria: string[] }>,
): Promise<LlmJudgeResult> {
  const provider = getDefaultProvider();
  const start = Date.now();

  const hasDimensions = industryDimensions && industryDimensions.length > 0;

  const dimensionsSchema = hasDimensions
    ? `,\n  "dimensions": {\n    "[dimId]": {\n      "criteria_results": [\n        { "criterion": "[exact criterion text]", "met": boolean }\n      ]\n    }\n  }`
    : "";

  const systemPrompt = `You are an expert AI system evaluator. Your job is to assess whether an AI agent's actual output meets the test requirements.

You will receive:
- A test case name
- The input provided to the agent
- The expected output or pass criteria
- The agent's actual output
- The agent's configuration/context

Your task:
1. Compare the agent's actual output against the expected criteria
2. Determine whether the actual output passes the test requirements
3. Return a structured JSON assessment

Return ONLY valid JSON with this schema:
{
  "passed": boolean,
  "confidence": number (0.0 to 1.0),
  "reason": string (one concise sentence explaining the verdict)${dimensionsSchema}
}`;

  const criteriaBlock = hasDimensions
    ? `\n\nIndustry Evaluation Dimensions:\n${industryDimensions!.map(d =>
        `Dimension "${d.id}" — ${d.name}:\n${d.scoringCriteria.map(c => `  - ${c}`).join("\n")}`
      ).join("\n\n")}\n\nFor each dimension, evaluate whether each criterion is met by the agent's actual output. Include ALL dimensions and ALL criteria in the "dimensions" field, using the exact criterion text as the "criterion" value.`
    : "";

  const userPrompt = `Test Case: "${testName}"

Input to agent:
${JSON.stringify(inputData, null, 2)}

Expected output / pass criteria:
${expectedOutput ? JSON.stringify(expectedOutput, null, 2) : "(none specified — evaluate whether the output is appropriate and error-free)"}

Agent's actual output:
${actualOutput && actualOutput.trim() ? actualOutput : "(no output produced — treat as a failing response)"}

Agent context:
${agentContext || "(no additional context)"}${criteriaBlock}`;

  try {
    const result = await provider.complete(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      {
        responseFormat: "json",
        temperature: 0,
        maxTokens: hasDimensions ? 1200 : 500,
      },
    );

    const latencyMs = Date.now() - start;

    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(result.content);
    } catch {
      console.warn("[eval-judge] Failed to parse judge response, defaulting to fail");
      return { isPassed: false, confidence: 0.5, reason: "Evaluator response was not valid JSON", latencyMs };
    }

    const isPassed = parsed.passed === true;
    const confidence = typeof parsed.confidence === "number"
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.7;
    const reason = typeof parsed.reason === "string"
      ? parsed.reason
      : (isPassed ? "Test case passed" : "Test case failed");

    let dimensionResults: DimensionJudgeResult[] | undefined;
    if (hasDimensions && parsed.dimensions && typeof parsed.dimensions === "object") {
      const dims = parsed.dimensions as Record<string, unknown>;
      dimensionResults = industryDimensions!.map(dim => {
        const dimData = dims[dim.id] as Record<string, unknown> | undefined;
        const rawCriteria = Array.isArray(dimData?.criteria_results)
          ? (dimData!.criteria_results as Array<Record<string, unknown>>)
          : [];

        const criteriaResults: CriterionResult[] = dim.scoringCriteria.map(criterion => {
          const match = rawCriteria.find(
            cr => typeof cr.criterion === "string" && cr.criterion.toLowerCase().trim() === criterion.toLowerCase().trim()
          );
          return {
            criterion,
            met: match ? Boolean(match.met) : false,
          };
        });

        return { dimId: dim.id, criteriaResults };
      });
    }

    return { isPassed, confidence, reason, latencyMs, dimensionResults };
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    console.error("[eval-judge] LLM judge call failed:", err.message);
    return {
      isPassed: false,
      confidence: 0,
      reason: `Evaluator error: ${err.message}`,
      latencyMs,
    };
  }
}
