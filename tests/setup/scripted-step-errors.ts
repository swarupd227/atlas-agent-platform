/**
 * Makes an assertion inside a scripted model step actually fail its test.
 *
 * Most Astra suites check a tool's payload from inside the script itself -- the
 * step that runs after `use("list_runs")` reads the tool result and asserts on
 * it. The engine, correctly, treats an exception from the model call as a model
 * failure and ends the turn, so until this hook existed the `expect()` inside
 * that step was swallowed: the turn stopped early, the test asserted nothing
 * further, and it passed. Proved on 2026-09-27 with a deliberately false
 * assertion that passed, and confirmed by the real break it was hiding.
 *
 * It lives here rather than in each suite so no new suite has to remember it.
 * Only assertion failures are collected: a step that throws on purpose (see
 * tests/astra-engine.test.ts, which makes the model blow up to prove the engine
 * recovers) is a fixture and must stay one.
 */
import { afterEach } from "vitest";
import { takeScriptedStepError } from "../../server/astra/scripted-brain";

afterEach(() => {
  const err = takeScriptedStepError();
  if (err) throw err;
});
