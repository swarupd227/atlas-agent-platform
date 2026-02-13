import { useState, useRef, useCallback, useEffect } from "react";

interface UseSpeechToTextOptions {
  onTranscript?: (text: string) => void;
  lang?: string;
}

interface UseSpeechToTextReturn {
  isListening: boolean;
  interimText: string;
  isSupported: boolean;
  startListening: () => void;
  stopListening: () => void;
  toggleListening: () => void;
}

export function useSpeechToText(options: UseSpeechToTextOptions = {}): UseSpeechToTextReturn {
  const { onTranscript, lang = "en-US" } = options;
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const recognitionRef = useRef<any>(null);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  const isSupported = typeof window !== "undefined" &&
    (!!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      const ref = recognitionRef.current;
      if (ref._deactivate) ref._deactivate();
      recognitionRef.current = null;
      try { ref.stop(); } catch {}
    }
    setIsListening(false);
    setInterimText("");
  }, []);

  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition || recognitionRef.current) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;
    let active = true;

    let processedUpTo = 0;
    recognition.onresult = (event: any) => {
      let newFinalText = "";
      let interim = "";
      for (let i = processedUpTo; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          newFinalText += result[0].transcript + " ";
          processedUpTo = i + 1;
        } else {
          interim += result[0].transcript;
        }
      }
      if (newFinalText && onTranscriptRef.current) {
        onTranscriptRef.current(newFinalText);
      }
      setInterimText(interim);
    };

    recognition.onerror = () => {};
    recognition.onend = () => {
      if (active && recognitionRef.current) {
        try { recognitionRef.current.start(); } catch {}
      }
    };

    recognition.start();
    recognitionRef.current = recognition;
    (recognition as any)._active = () => active;
    (recognition as any)._deactivate = () => { active = false; };
    setIsListening(true);
    setInterimText("");
  }, [lang]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        const ref = recognitionRef.current;
        if (ref._deactivate) ref._deactivate();
        recognitionRef.current = null;
        try { ref.stop(); } catch {}
      }
    };
  }, []);

  return { isListening, interimText, isSupported, startListening, stopListening, toggleListening };
}
