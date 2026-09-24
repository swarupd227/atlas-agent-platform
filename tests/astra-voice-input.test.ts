/**
 * Speaking to Astra.
 *
 * Two paths: Chrome and Edge dictate on the device, Firefox and Safari record
 * a clip that the platform transcribes. The rules that matter to the person
 * holding the mic are that the words land where the caret is, that they are
 * told which path is running, and that nothing is ever sent for them.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { audioExt, insertSpoken, micFailure, micLabel, recordingMimeType, voiceMode, voiceNote, LONGEST_RECORDING_MS, SHORTEST_CLIP_BYTES } from "../client/src/astra/voice";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");
const composer = read("client", "src", "astra", "composer.tsx");
const hook = read("client", "src", "astra", "use-voice-input.ts");
const route = read("server", "routes", "voice.ts");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("which path this browser takes", () => {
  it("prefers the browser's own dictation, which never leaves the device", () => {
    expect(voiceMode({ speechRecognition: true, mediaRecorder: true, microphone: true })).toBe("browser");
    expect(voiceNote("browser")).toContain("Your browser turns speech into text");
  });

  it("records and transcribes where there is no dictation", () => {
    expect(voiceMode({ speechRecognition: false, mediaRecorder: true, microphone: true })).toBe("record");
    // The person is told the audio leaves their machine, because it does.
    expect(voiceNote("record")).toContain("the clip leaves your device");
  });

  it("offers nothing when the browser can't record at all", () => {
    expect(voiceMode({ speechRecognition: false, mediaRecorder: false, microphone: true })).toBe("off");
    expect(voiceMode({ speechRecognition: false, mediaRecorder: true, microphone: false })).toBe("off");
    expect(voiceNote("off")).toBe("");
  });

  it("says on both paths that speaking doesn't send", () => {
    for (const mode of ["browser", "record"] as const) expect(voiceNote(mode)).toContain("Nothing is sent until you send the message");
  });
});

describe("where the words land", () => {
  it("goes in at the caret, spaced like typing", () => {
    expect(insertSpoken("", 0, "book a review")).toEqual({ text: "book a review", caret: 13 });
    expect(insertSpoken("draft", 5, "the note")).toEqual({ text: "draft the note", caret: 14 });
    // Mid-sentence: a space is added on the far side too.
    expect(insertSpoken("draft note", 5, "the")).toEqual({ text: "draft the note", caret: 9 });
  });

  it("adds no space where the person already typed one", () => {
    expect(insertSpoken("draft ", 6, "the note")).toEqual({ text: "draft the note", caret: 14 });
    expect(insertSpoken("draft  note", 6, "the")).toEqual({ text: "draft the note", caret: 9 });
  });

  it("ignores silence, and a caret outside the text", () => {
    expect(insertSpoken("draft", 5, "   ")).toEqual({ text: "draft", caret: 5 });
    expect(insertSpoken("draft", 99, "it")).toEqual({ text: "draft it", caret: 8 });
  });
});

describe("when the microphone won't work", () => {
  it("says what to do, not what the browser called it", () => {
    expect(micFailure("NotAllowedError")).toContain("Allow it in your browser's address bar");
    expect(micFailure("not-allowed")).toContain("Allow it in your browser's address bar");
    expect(micFailure("NotFoundError")).toContain("No microphone was found");
    expect(micFailure("NotReadableError")).toContain("Another app is using the microphone");
    expect(micFailure(undefined, "Dictation stopped.")).toBe("Dictation stopped.");
  });

  it("labels the button by what pressing it does", () => {
    expect(micLabel("idle")).toBe("Dictate a message");
    expect(micLabel("listening")).toBe("Stop dictation");
  });
});

describe("the recorded clip", () => {
  it("asks the browser which container it can make", () => {
    expect(recordingMimeType((t) => t === "audio/mp4")).toBe("audio/mp4");
    expect(recordingMimeType((t) => t === "audio/webm;codecs=opus")).toBe("audio/webm;codecs=opus");
    expect(recordingMimeType(() => false)).toBeUndefined();
  });

  it("names the file by what it actually is", () => {
    expect(audioExt("audio/webm;codecs=opus")).toBe("webm");
    expect(audioExt("audio/mp4")).toBe("mp4");
    expect(audioExt(undefined)).toBe("webm");
  });

  it("doesn't send a clip too short to hold words, or run on forever", () => {
    expect(SHORTEST_CLIP_BYTES).toBeGreaterThan(0);
    expect(LONGEST_RECORDING_MS).toBe(3 * 60_000);
    expect(hook).toContain("setTimeout(() => stopRecording(), LONGEST_RECORDING_MS)");
    expect(hook).toContain("if (blob.size < SHORTEST_CLIP_BYTES)");
  });

  it("releases the microphone as soon as the clip is closed", () => {
    expect(hook).toContain("stream.getTracks().forEach((t) => t.stop());");
  });

  it("offers no mic on an insecure origin, where both APIs fail anyway", () => {
    expect(hook).toContain('if (window.isSecureContext === false) return "off";');
  });
});

describe("the composer", () => {
  it("has a mic that fills the box and never sends", () => {
    expect(composer).toContain('data-testid="astra-mic"');
    expect(composer).toContain('type="button"');
    expect(composer).toContain("onClick={voice.toggle}");
    // The only send paths stay the submit button and Enter.
    const mic = composer.slice(composer.indexOf('data-testid="astra-mic"') - 700, composer.indexOf('data-testid="astra-mic"'));
    expect(code(mic)).not.toContain("onSend");
    expect(code(mic)).not.toContain("submit()");
  });

  it("puts spoken words at the caret rather than at the end", () => {
    expect(composer).toContain("insertSpoken(current, pendingCaret.current ?? caretRef.current, spoken)");
  });

  it("shows what the mic is doing, and stops it when the message goes", () => {
    expect(composer).toContain('data-testid="astra-voice-status"');
    expect(composer).toContain('role="status"');
    expect(composer).toContain("voice.stop();");
    expect(composer).toContain("aria-label={micLabel(voice.state)}");
  });
});

describe("the transcription route", () => {
  it("only transcribes: no analysis, no storage", () => {
    expect(route).toContain('router.post("/api/ai/transcribe", checkPermission("use_astra")');
    expect(route).toContain("multer.memoryStorage()");
    expect(code(route)).not.toMatch(/callClaude|diskStorage|createJob|storage\./);
  });

  it("is mounted where the AI budget applies", () => {
    const routes = read("server", "routes.ts");
    expect(routes).toContain('import voiceRouter from "./routes/voice"');
    expect(routes).toContain("app.use(voiceRouter);");
    expect(routes.indexOf('app.use("/api/ai", aiAssistRateLimiter)')).toBeLessThan(routes.indexOf("app.use(voiceRouter);"));
  });

  it("says plainly when the deployment has no transcription configured", () => {
    expect(route).toContain("Dictation isn't configured on this deployment. You can type the message instead.");
  });
});
