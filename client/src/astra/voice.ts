/**
 * Speaking to Astra instead of typing.
 *
 * Two paths, because browsers differ: Chrome and Edge have built-in dictation
 * (SpeechRecognition), which transcribes on the device as you speak. Firefox
 * and Safari don't, so there we record the clip and send it to the platform's
 * own transcription endpoint. The person is told which one is happening,
 * because "on your device" and "sent to a server" are not the same promise.
 *
 * Dictation only ever fills the message box. It never sends.
 */

export type VoiceMode = "browser" | "record" | "off";

/** What this browser can do. Pass the real objects; this file touches no globals. */
export function voiceMode(env: { speechRecognition: boolean; mediaRecorder: boolean; microphone: boolean }): VoiceMode {
  if (env.speechRecognition) return "browser";
  if (env.mediaRecorder && env.microphone) return "record";
  return "off";
}

/** Where the audio goes, in one sentence, for the person about to speak. */
export function voiceNote(mode: VoiceMode): string {
  if (mode === "browser") return "Your browser turns speech into text. Nothing is sent until you send the message.";
  if (mode === "record") return "Your browser has no dictation, so the clip leaves your device and is transcribed by the platform's AI provider. Nothing is sent until you send the message.";
  return "";
}

/** The mic button's label — it is also the accessible name, so it says what pressing does. */
export function micLabel(state: "idle" | "listening" | "transcribing"): string {
  if (state === "listening") return "Stop dictation";
  if (state === "transcribing") return "Transcribing…";
  return "Dictate a message";
}

/**
 * A failed microphone, said plainly. The browser's own message ("Permission
 * dismissed") tells the person nothing about what to do next.
 */
export function micFailure(name: string | undefined, fallback?: string): string {
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
    case "not-allowed":
    case "permission-denied":
      return "The microphone is blocked for this site. Allow it in your browser's address bar, then press the mic again.";
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "audio-capture":
      return "No microphone was found. Plug one in or pick one in your system settings.";
    case "NotReadableError":
      return "Another app is using the microphone. Close it and press the mic again.";
    case "no-speech":
      return "Nothing was heard. Press the mic and speak again.";
    default:
      return fallback || "Dictation stopped. Press the mic to try again.";
  }
}

/** Insert dictated words at the caret, with the spacing a person would have typed. */
export function insertSpoken(text: string, caret: number, spoken: string): { text: string; caret: number } {
  const words = spoken.trim();
  if (!words) return { text, caret };
  const at = Math.max(0, Math.min(caret, text.length));
  const before = text.slice(0, at);
  const after = text.slice(at);
  const lead = before && !/\s$/.test(before) ? " " : "";
  const tail = after && !/^\s/.test(after) ? " " : "";
  const insert = `${lead}${words}${tail}`;
  return { text: `${before}${insert}${after}`, caret: at + lead.length + words.length };
}

/**
 * The container to record in. Browsers disagree: Firefox gives webm/opus,
 * Safari mp4. Ask, rather than assume, and let the browser choose if neither
 * is offered.
 */
export function recordingMimeType(isSupported: (type: string) => boolean): string | undefined {
  for (const type of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (isSupported(type)) return type;
  }
  return undefined;
}

/** The file extension the transcription API should see for a recorded clip. */
export function audioExt(mimeType: string | undefined): string {
  const base = (mimeType || "").split(";")[0].trim().toLowerCase();
  switch (base) {
    case "audio/mp4":
      return "mp4";
    case "audio/mpeg":
      return "mp3";
    case "audio/ogg":
      return "ogg";
    case "audio/wav":
    case "audio/x-wav":
      return "wav";
    default:
      return "webm";
  }
}

/** A clip too short to hold words; transcribing it wastes a call and returns noise. */
export const SHORTEST_CLIP_BYTES = 1200;

/** A recording that has run long enough that the person has probably walked away. */
export const LONGEST_RECORDING_MS = 3 * 60_000;
