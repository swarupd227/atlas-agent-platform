/**
 * Dictation for Astra Cowork.
 *
 * Chrome and Edge transcribe on the device and never reach this route. It
 * exists for Firefox and Safari, which have no dictation of their own: they
 * record a clip and post it here.
 *
 * The clip is held in memory for the length of the request, transcribed, and
 * dropped -- it is never written to disk and never stored. Nothing else is
 * done with it: no analysis, no proposals, no LLM pass. The text goes straight
 * back to the message box the person is typing in.
 */
import { Router } from "express";
import multer from "multer";
import { createGuardedOpenAi, toFile, awsOnlyActive, AwsOnlyBlockedError } from "../ai-egress";
import { checkPermission } from "../permissions";

const router = Router();

// A minute or two of speech, not a meeting recording; the composer stops at
// three minutes. Held in memory, so the cap matters.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Built on first use, so a deployment with no OpenAI key still starts.
const openaiClient = createGuardedOpenAi("Dictation");
const openai = () => openaiClient;

router.post("/api/ai/transcribe", checkPermission("use_astra"), upload.single("audio"), async (req, res) => {
  if (await awsOnlyActive()) {
    return res.status(409).json({ error: new AwsOnlyBlockedError("Dictation").message });
  }
  if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY && !process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: "Dictation isn't configured on this deployment. You can type the message instead." });
  }
  if (!req.file) {
    return res.status(400).json({ error: "No audio was received." });
  }
  try {
    const ext = (req.file.originalname.split(".").pop() || "webm").toLowerCase().replace(/[^a-z0-9]/g, "");
    const audio = await toFile(req.file.buffer, `dictation.${ext || "webm"}`);
    const transcription = await openai().audio.transcriptions.create({
      file: audio,
      model: "gpt-4o-mini-transcribe",
    });
    res.json({ text: (transcription.text || "").trim() });
  } catch (error) {
    console.error("Dictation transcription failed:", error);
    res.status(502).json({ error: "The clip could not be transcribed. You can type the message instead." });
  }
});

export default router;
