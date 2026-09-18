import { z } from "zod";
import { LOAD_TOOLS, PACK_IDS } from "../packs";
import type { AstraTool } from "../types";

/**
 * Load a studio pack's tools into this conversation. Handled by the engine
 * (like finish_turn), which records the pack on the thread; run() is never
 * called.
 */
export const loadToolsTool: AstraTool<{ pack: string }> = {
  name: LOAD_TOOLS,
  description:
    "Load a studio pack's tools into this conversation when the user asks for something in it. The tools are available from your next step on and stay loaded. Don't load packs speculatively.",
  input: z.object({ pack: z.string().describe(`The pack to load: ${PACK_IDS.join(", ")}.`) }),
  confirm: false,
  run: async () => {
    throw new Error("load_tools is handled by the engine");
  },
};
