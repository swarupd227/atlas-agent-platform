// How an eval runs an agent. Kept apart from eval-agent-run so the rule can be tested on its own.

export interface EvalRunShape {
  mcpServerCount: number;
  skillCount: number;
  knowledgeBaseCount: number;
  activeDeploymentCount: number;
}

/**
 * "runtime" when the agent's answer depends on tools, skills, knowledge or a deployment;
 * "direct" for a plain prompt-only agent, where a single model call is the same thing.
 */
export function evalRunMode(shape: EvalRunShape): "runtime" | "direct" {
  return shape.mcpServerCount > 0 || shape.skillCount > 0 || shape.knowledgeBaseCount > 0 || shape.activeDeploymentCount > 0
    ? "runtime"
    : "direct";
}
