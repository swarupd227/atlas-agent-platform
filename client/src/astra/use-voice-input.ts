import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSpeechToText } from "@/hooks/use-speech-to-text";
import { LONGEST_RECORDING_MS, SHORTEST_CLIP_BYTES, audioExt, micFailure, recordingMimeType, voiceMode, voiceNote, type VoiceMode } from "./voice";

/**
 * The mic behind Astra's composer. Chrome and Edge dictate on the device;
 * everywhere else we record a clip and have the platform transcribe it.
 *
 * Whatever comes back is handed to `onText` and goes into the message box.
 * This hook never sends a message.
 */
export interface VoiceInput {
  mode: VoiceMode;
  state: "idle" | "listening" | "transcribing";
  /** Words heard but not yet final, so the person can see it is working. */
  interim: string;
  error: string | null;
  note: string;
  toggle: () => void;
  stop: () => void;
}

export function useVoiceInput({ onText }: { onText: (spoken: string) => void }): VoiceInput {
  const mode = useMemo<VoiceMode>(() => {
    if (typeof window === "undefined") return "off";
    // Both APIs need a secure origin; on plain http the mic would be offered
    // and then fail with nothing the person could act on.
    if (window.isSecureContext === false) return "off";
    return voiceMode({
      speechRecognition: !!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition,
      mediaRecorder: typeof (window as any).MediaRecorder !== "undefined",
      microphone: typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia,
    });
  }, []);

  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  const speech = useSpeechToText({ onTranscript: (t) => onTextRef.current(t) });

  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopRecording = useCallback(() => {
    if (stopTimer.current) {
      clearTimeout(stopTimer.current);
      stopTimer.current = null;
    }
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (!recorder) return;
    try {
      if (recorder.state !== "inactive") recorder.stop();
    } catch {
      /* already stopped */
    }
    setRecording(false);
  }, []);

  const startRecording = useCallback(async () => {
    setRecordError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e: any) {
      setRecordError(micFailure(e?.name));
      return;
    }
    const mimeType = recordingMimeType((t) => {
      try {
        return (window as any).MediaRecorder?.isTypeSupported?.(t) ?? false;
      } catch {
        return false;
      }
    });
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch (e: any) {
      stream.getTracks().forEach((t) => t.stop());
      setRecordError(micFailure(e?.name));
      return;
    }

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = async () => {
      // Release the mic as soon as the clip is closed: a live indicator in the
      // browser chrome while nothing is being recorded is its own small alarm.
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
      if (blob.size < SHORTEST_CLIP_BYTES) {
        setRecordError("That was too short to make out. Press the mic and speak again.");
        return;
      }
      setTranscribing(true);
      try {
        const form = new FormData();
        form.append("audio", blob, `dictation.${audioExt(blob.type)}`);
        const res = await fetch("/api/ai/transcribe", { method: "POST", body: form, credentials: "include" });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setRecordError(body?.error || "The clip could not be transcribed. You can type it instead.");
          return;
        }
        const text = (body?.text || "").trim();
        if (!text) {
          setRecordError("No words were found in that clip.");
          return;
        }
        onTextRef.current(text);
      } catch {
        setRecordError("The clip could not be sent for transcription. You can type it instead.");
      } finally {
        setTranscribing(false);
      }
    };

    try {
      recorder.start();
    } catch (e: any) {
      stream.getTracks().forEach((t) => t.stop());
      setRecordError(micFailure(e?.name));
      return;
    }
    recorderRef.current = recorder;
    setRecording(true);
    // Somebody who forgets they pressed record shouldn't send ten minutes of
    // the room to a transcription service.
    stopTimer.current = setTimeout(() => stopRecording(), LONGEST_RECORDING_MS);
  }, [stopRecording]);

  useEffect(() => {
    return () => {
      if (stopTimer.current) clearTimeout(stopTimer.current);
      const recorder = recorderRef.current;
      recorderRef.current = null;
      try {
        if (recorder && recorder.state !== "inactive") recorder.stop();
      } catch {
        /* already stopped */
      }
    };
  }, []);

  const toggle = useCallback(() => {
    if (mode === "browser") {
      speech.toggleListening();
      return;
    }
    if (mode === "record") {
      if (recorderRef.current) stopRecording();
      else void startRecording();
    }
  }, [mode, speech.toggleListening, speech.isListening, startRecording, stopRecording]);

  const stop = useCallback(() => {
    if (mode === "browser") speech.stopListening();
    else stopRecording();
  }, [mode, speech.stopListening, stopRecording]);

  const listening = mode === "browser" ? speech.isListening : recording;
  // `no-speech` and `aborted` are the browser restarting itself mid-sentence;
  // showing them would blink an error at someone who is simply pausing.
  const speechError = speech.error && speech.error !== "no-speech" && speech.error !== "aborted" ? micFailure(speech.error) : null;

  return {
    mode,
    state: transcribing ? "transcribing" : listening ? "listening" : "idle",
    interim: mode === "browser" ? speech.interimText : "",
    error: mode === "browser" ? speechError : recordError,
    note: voiceNote(mode),
    toggle,
    stop,
  };
}
