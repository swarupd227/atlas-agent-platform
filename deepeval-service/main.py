"""
Atlas DeepEval Measurement Service
===================================
Lightweight FastAPI sidecar that wraps the open-source DeepEval library and
exposes a /measure endpoint that Atlas's TypeScript eval engine calls.

Atlas keeps all platform value-adds (multi-tenancy, governance, gates, UI).
This service owns only the metric computation algorithms.

Supported metricType values
---------------------------
  g-eval                  GEval (multi-step chain-of-thought, criteria-driven)
  answer-relevancy        AnswerRelevancyMetric
  faithfulness            FaithfulnessMetric (requires retrieval_context)
  hallucination           HallucinationMetric (requires retrieval_context)
  contextual-precision    ContextualPrecisionMetric (requires retrieval_context)
  contextual-recall       ContextualRecallMetric (requires retrieval_context)
  contextual-relevancy    ContextualRelevancyMetric (requires retrieval_context)
  bias                    BiasMetric
  toxicity                ToxicityMetric
  summarization           SummarizationMetric
"""

import os
import time
import logging
from typing import Any, List, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s [deepeval-svc] %(message)s")
log = logging.getLogger(__name__)


def _configure_gateway_env() -> None:
    """
    Map Replit AI integration env vars onto the canonical SDK names so that
    DeepEval's model clients automatically pick up the Replit gateway without
    any monkey-patching.

    Priority (highest wins):
      1. User-supplied OPENAI_API_KEY / ANTHROPIC_API_KEY (already set)
      2. Replit AI_INTEGRATIONS_* keys (gateway tokens)
    """
    # OpenAI gateway
    if not os.environ.get("OPENAI_API_KEY"):
        integration_key = os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY", "")
        integration_url = os.environ.get("AI_INTEGRATIONS_OPENAI_BASE_URL", "")
        if integration_key:
            os.environ["OPENAI_API_KEY"] = integration_key
        if integration_url:
            os.environ["OPENAI_API_BASE"] = integration_url   # openai-python ≤ 0.x
            os.environ["OPENAI_BASE_URL"] = integration_url   # openai-python ≥ 1.x
            log.info("OpenAI → Replit AI gateway (%s)", integration_url)

    # Anthropic gateway
    if not os.environ.get("ANTHROPIC_BASE_URL"):
        integration_url = os.environ.get("AI_INTEGRATIONS_ANTHROPIC_BASE_URL", "")
        if not os.environ.get("ANTHROPIC_API_KEY"):
            integration_key = os.environ.get("AI_INTEGRATIONS_ANTHROPIC_API_KEY", "")
            if integration_key:
                os.environ["ANTHROPIC_API_KEY"] = integration_key
        if integration_url:
            os.environ["ANTHROPIC_BASE_URL"] = integration_url
            log.info("Anthropic → Replit AI gateway (%s)", integration_url)


_configure_gateway_env()

app = FastAPI(title="Atlas DeepEval Service", version="0.1.0")


# ---------------------------------------------------------------------------
# Model resolver
# ---------------------------------------------------------------------------

def _resolve_model(judge_model: Optional[str]) -> Any:
    """
    Return a DeepEval-compatible model instance or name string.

    Priority:
      1. Explicit judge_model from request
      2. DEEPEVAL_DEFAULT_MODEL env var
      3. Auto-detect from available API keys:
         - ANTHROPIC_API_KEY → claude-3-5-haiku-20241022
         - OPENAI_API_KEY    → gpt-4o-mini
    """
    model_name = judge_model or os.environ.get("DEEPEVAL_DEFAULT_MODEL")

    if not model_name:
        # Prefer OpenAI-compatible gateway (set by _configure_gateway_env or user key)
        if os.environ.get("OPENAI_API_KEY"):
            model_name = "gpt-4o-mini"
        elif os.environ.get("ANTHROPIC_API_KEY"):
            model_name = "claude-3-5-sonnet-20241022"
        else:
            model_name = "gpt-4o-mini"

    if model_name.startswith("claude"):
        try:
            from deepeval.models import AnthropicModel
            # Pass base_url from env so the Replit gateway is used when set
            base_url = os.environ.get("ANTHROPIC_BASE_URL")
            if base_url:
                return AnthropicModel(model=model_name, base_url=base_url)
            return AnthropicModel(model=model_name)
        except Exception as e:
            log.warning("AnthropicModel init failed (%s); falling back to string model name", e)
            return model_name

    return model_name


# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------

class MeasureRequest(BaseModel):
    metricType: str
    input: str
    actual_output: str
    expected_output: Optional[str] = None
    retrieval_context: Optional[List[str]] = None
    tools_called: Optional[List[Any]] = None
    criteria: Optional[str] = None
    evaluation_steps: Optional[List[str]] = None
    threshold: float = 0.5
    strict_mode: bool = False
    judge_model: Optional[str] = None


class MeasureResponse(BaseModel):
    score: float
    passed: bool
    reason: str
    steps: List[str]
    latency_ms: int


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok", "service": "deepeval"}


@app.post("/measure", response_model=MeasureResponse)
def measure(req: MeasureRequest):
    """
    Run a single DeepEval metric measurement synchronously.
    FastAPI executes sync endpoints in a thread-pool automatically,
    so blocking DeepEval/LLM calls are safe here.
    """
    from deepeval.test_case import LLMTestCase, LLMTestCaseParams

    start = time.time()
    model = _resolve_model(req.judge_model)
    log.info("measure metricType=%s model=%s threshold=%.2f", req.metricType, model, req.threshold)

    # Build test case — only pass fields that are populated
    tc_kwargs: dict = {
        "input": req.input,
        "actual_output": req.actual_output,
    }
    if req.expected_output is not None:
        tc_kwargs["expected_output"] = req.expected_output
    if req.retrieval_context:
        tc_kwargs["retrieval_context"] = req.retrieval_context
    test_case = LLMTestCase(**tc_kwargs)

    metric = _build_metric(req, model, test_case)

    metric.measure(test_case)

    latency_ms = int((time.time() - start) * 1000)
    log.info(
        "metric=%s score=%.3f passed=%s latency=%dms",
        req.metricType, metric.score or 0, metric.is_successful(), latency_ms,
    )

    # GEval exposes evaluation_steps after measurement
    steps: List[str] = []
    ev_steps = getattr(metric, "evaluation_steps", None)
    if ev_steps:
        steps = [str(s) for s in ev_steps]

    return MeasureResponse(
        score=float(metric.score) if metric.score is not None else 0.0,
        passed=bool(metric.is_successful()),
        reason=getattr(metric, "reason", "") or "",
        steps=steps,
        latency_ms=latency_ms,
    )


def _build_metric(req: MeasureRequest, model: Any, test_case: "LLMTestCase") -> Any:  # noqa: F821
    """Instantiate the correct DeepEval metric class for the requested type."""
    from deepeval.metrics import (
        GEval,
        AnswerRelevancyMetric,
        FaithfulnessMetric,
        HallucinationMetric,
        ContextualPrecisionMetric,
        ContextualRecallMetric,
        ContextualRelevancyMetric,
        BiasMetric,
        ToxicityMetric,
        SummarizationMetric,
    )
    from deepeval.test_case import LLMTestCaseParams

    mt = req.metricType

    if mt == "g-eval":
        eval_params = [LLMTestCaseParams.INPUT, LLMTestCaseParams.ACTUAL_OUTPUT]
        if req.expected_output is not None:
            eval_params.append(LLMTestCaseParams.EXPECTED_OUTPUT)
        if req.retrieval_context:
            eval_params.append(LLMTestCaseParams.RETRIEVAL_CONTEXT)
        return GEval(
            name="GEval",
            criteria=req.criteria or "Evaluate whether the actual output adequately addresses the input.",
            evaluation_steps=req.evaluation_steps or None,
            evaluation_params=eval_params,
            model=model,
            threshold=req.threshold,
            strict_mode=req.strict_mode,
        )

    if mt == "answer-relevancy":
        return AnswerRelevancyMetric(
            threshold=req.threshold,
            model=model,
            strict_mode=req.strict_mode,
        )

    if mt == "faithfulness":
        return FaithfulnessMetric(
            threshold=req.threshold,
            model=model,
            strict_mode=req.strict_mode,
        )

    if mt == "hallucination":
        # HallucinationMetric expects `context` on the test case (not retrieval_context)
        if req.retrieval_context:
            test_case.context = req.retrieval_context
        return HallucinationMetric(
            threshold=req.threshold,
            model=model,
        )

    if mt == "contextual-precision":
        return ContextualPrecisionMetric(threshold=req.threshold, model=model)

    if mt == "contextual-recall":
        return ContextualRecallMetric(threshold=req.threshold, model=model)

    if mt == "contextual-relevancy":
        return ContextualRelevancyMetric(threshold=req.threshold, model=model)

    if mt == "bias":
        return BiasMetric(threshold=req.threshold, model=model)

    if mt == "toxicity":
        return ToxicityMetric(threshold=req.threshold, model=model)

    if mt == "summarization":
        return SummarizationMetric(threshold=req.threshold, model=model)

    raise HTTPException(status_code=400, detail=f"Unsupported metricType: {mt!r}")
