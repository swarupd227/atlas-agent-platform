/**
 * What an agent loop says to the model when its reply stopped at the output
 * limit instead of ending.
 *
 * A stop reason of max_tokens is not "the model is done": it is a reply cut
 * off partway, which read as a finished answer in every loop that ended on
 * "no tool calls" alone. Each loop now asks once, with the cut-off text kept
 * in the history so the next reply continues it; a second cut-off stands and
 * is said. One wording, so the three loops behave the same.
 */
export const CONTINUE_CUT_OFF_REPLY =
  "Your previous reply was cut off at the output length limit. Continue from exactly where you stopped and finish the answer, more briefly. Do not repeat what you already wrote.";
