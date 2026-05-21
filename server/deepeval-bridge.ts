/**
 * Atlas → DeepEval Python service bridge
 *
 * Calls the DeepEval FastAPI sidecar at DEEPEVAL_SERVICE_URL (default
 * http://localhost:8001) and maps its response to the existing LlmJudgeResult
 * shape so nothing downstream needs to change.
 *
 * On any network / HTTP error the caller receives a thrown Error; eval-judge.ts
 * catches this and falls back to the generic LLM judge so eval runs are never
 * blocked by the Python service being unavailable.
 */

import type { LlmJudgeResult } from "./eval-judge";

export interface DeepEvalMeasureParams {
  metricType: string;
  input: string;
  actual_output: string;
  expected_output?: string;
  retrieval_context?: string[];
  tools_called?: unknown[];
  criteria?: string;
  evaluation_steps?: string[];
  threshold?: number;
  strict_mode?: boolean;
  judge_model?: string;
}

interface DeepEvalServiceResponse {
  score: number;
  passed: boolean;
  reason: string;
  steps: string[];
  latency_ms: number;
}

export type DeepEvalJudgeResult = LlmJudgeResult & {
  evaluationSteps?: string[];
};

const TIMEOUT_MS = 30_000;

export async function measureWithDeepEval(
  params: DeepEvalMeasureParams,
): Promise<DeepEvalJudgeResult> {
  const serviceUrl = process.env.DEEPEVAL_SERVICE_URL ?? "http://localhost:8000";
  const wallStart = Date.now();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const resp = await fetch(`${serviceUrl}/measure`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
      signal: controller.signal,
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`DeepEval service HTTP ${resp.status}: ${text.slice(0, 200)}`);
    }

    const data = (await resp.json()) as DeepEvalServiceResponse;
    const latencyMs = Date.now() - wallStart;

    return {
      isPassed: data.passed,
      confidence: Math.max(0, Math.min(1, data.score)),
      reason: data.reason || (data.passed ? "Test case passed" : "Test case failed"),
      latencyMs,
      evaluationSteps: data.steps?.length ? data.steps : undefined,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function checkDeepEvalHealth(): Promise<boolean> {
  const serviceUrl = process.env.DEEPEVAL_SERVICE_URL ?? "http://localhost:8000";
  try {
    const resp = await fetch(`${serviceUrl}/health`, { signal: AbortSignal.timeout(3_000) });
    return resp.ok;
  } catch {
    return false;
  }
}
