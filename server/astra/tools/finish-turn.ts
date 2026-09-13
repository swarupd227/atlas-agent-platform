import { z } from "zod";
import type { AstraTool } from "../types";
import { FINISH_TURN } from "../engine";

/**
 * Ends the turn with suggestion chips. The engine handles this tool itself (it
 * never goes through the dispatcher); it is registered so the model sees its
 * schema.
 */
export const finishTurnTool: AstraTool<{ suggestions: Array<{ label: string; prompt: string }> }> = {
  name: FINISH_TURN,
  description:
    "End your turn. Provide two to four suggestions for what the user might say next, each phrased as the user's own next sentence (label is the short chip text, prompt is what gets sent).",
  input: z.object({
    suggestions: z
      .array(
        z.object({
          label: z.string().describe("Short chip text, a few words."),
          prompt: z.string().describe("The full sentence sent when the chip is clicked."),
        }),
      )
      .describe("Two to four next steps."),
  }),
  confirm: false,
  run: async () => ({ payload: { ok: true } }),
};
