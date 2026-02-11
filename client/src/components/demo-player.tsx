import { useState, useEffect, useRef, useCallback } from "react";
import { X, Play, Pause, SkipForward, SkipBack, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";

const DEMO_SLIDES = [
  {
    image: "/demo-screenshots/01-overview.png",
    title: "Command Center",
    narration:
      "Welcome to ALMP — the future of AI agent operations. Your command center gives you instant visibility into platform health, KPI progress, and agent status. Everything your team needs, in one intelligent dashboard.",
  },
  {
    image: "/demo-screenshots/08-outcomes.png",
    title: "Outcome Contracts",
    narration:
      "Define what success looks like with outcome contracts. Set KPIs, SLAs, and pricing models tied to measurable business results. You pay for outcomes, not compute cycles. This is billing, reimagined.",
  },
  {
    image: "/demo-screenshots/02-agents.png",
    title: "Agent Registry",
    narration:
      "Your entire agent fleet at your fingertips. The Agent Registry lets you deploy, monitor, and manage hundreds of AI agents across your organization. Each agent operates eighty percent autonomously, with twenty percent expert validation for critical decisions.",
  },
  {
    image: "/demo-screenshots/03-deployments.png",
    title: "Release Orchestrator",
    narration:
      "Deploy with confidence using shadow testing, canary rollouts, and automated promotion. Our Release Orchestrator eliminates deployment anxiety with built-in safeguards and rollback at every stage.",
  },
  {
    image: "/demo-screenshots/04-monitor.png",
    title: "Live Observability",
    narration:
      "Real-time monitoring powered by OpenTelemetry. Track every agent run, detect drift instantly, and drill into MCP trace waterfalls. Full observability from the first token to the final outcome.",
  },
  {
    image: "/demo-screenshots/05-governance.png",
    title: "Enterprise Governance",
    narration:
      "Enterprise-grade compliance built into every layer. Policy enforcement, SOC 2 and EU AI Act frameworks, immutable audit trails, and automated compliance scoring. Governance that enables, not blocks.",
  },
  {
    image: "/demo-screenshots/07-approvals.png",
    title: "Approval Gates",
    narration:
      "The twenty percent that makes the eighty work. Unified approval gates combine expert validation with MCP elicitation flows. Risk analysis, blast radius evidence, and one-click decisions keep your agents moving safely.",
  },
  {
    image: "/demo-screenshots/06-billing.png",
    title: "Outcome Billing",
    narration:
      "Transparent, outcome-based billing with tamper-evident metering. Drill from invoice to event to trace. Every charge is backed by cryptographic proof. Welcome to the new standard in AI billing.",
  },
];

const SLIDE_DURATION = 12000;
const CROSSFADE_DURATION = 700;

function startAmbientMusic(audioContext: AudioContext): () => void {
  const masterGain = audioContext.createGain();
  masterGain.gain.value = 0.06;
  masterGain.connect(audioContext.destination);

  const oscillators: OscillatorNode[] = [];

  const chords = [
    [130.81, 164.81, 196.00, 261.63],
    [146.83, 174.61, 220.00, 293.66],
    [123.47, 155.56, 185.00, 246.94],
    [138.59, 164.81, 207.65, 277.18],
  ];

  let chordIndex = 0;

  function playChord() {
    oscillators.forEach((o) => { try { o.stop(); } catch {} });
    oscillators.length = 0;

    const chord = chords[chordIndex % chords.length];
    chordIndex++;

    chord.forEach((freq, i) => {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = i === 0 ? "sine" : "triangle";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, audioContext.currentTime);
      gain.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 2);
      gain.gain.linearRampToValueAtTime(0.15, audioContext.currentTime + 8);
      gain.gain.linearRampToValueAtTime(0, audioContext.currentTime + 11);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start();
      oscillators.push(osc);
    });
  }

  playChord();
  const interval = setInterval(playChord, 10000);

  return () => {
    clearInterval(interval);
    oscillators.forEach((o) => { try { o.stop(); } catch {} });
    masterGain.disconnect();
  };
}

interface DemoPlayerProps {
  onClose: () => void;
}

export default function DemoPlayer({ onClose }: DemoPlayerProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [displaySlide, setDisplaySlide] = useState(0);
  const [outgoingSlide, setOutgoingSlide] = useState<number | null>(null);
  const [crossfadePhase, setCrossfadePhase] = useState<"idle" | "active">("idle");
  const [isPlaying, setIsPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [audioReady, setAudioReady] = useState(false);
  const [musicStarted, setMusicStarted] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const musicCleanupRef = useRef<(() => void) | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const slideStartRef = useRef<number>(Date.now());
  const audioCacheRef = useRef<Map<number, string>>(new Map());
  const crossfadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMutedRef = useRef(isMuted);

  isMutedRef.current = isMuted;

  const slide = DEMO_SLIDES[displaySlide];
  const outgoingSlideData = outgoingSlide !== null ? DEMO_SLIDES[outgoingSlide] : null;

  const initMusic = useCallback(() => {
    if (musicStarted) return;
    setMusicStarted(true);
    const ac = new AudioContext();
    audioContextRef.current = ac;
    if (isMutedRef.current) ac.suspend();
    const cleanup = startAmbientMusic(ac);
    musicCleanupRef.current = cleanup;
  }, [musicStarted]);

  const fetchAudio = useCallback(async (slideIndex: number): Promise<string | null> => {
    if (audioCacheRef.current.has(slideIndex)) {
      return audioCacheRef.current.get(slideIndex)!;
    }
    try {
      const response = await fetch("/api/demo/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: DEMO_SLIDES[slideIndex].narration,
          voice: "nova",
        }),
      });
      if (!response.ok) throw new Error("TTS failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      audioCacheRef.current.set(slideIndex, url);
      return url;
    } catch (err) {
      console.error("Failed to generate narration:", err);
      return null;
    }
  }, []);

  const playSlideAudio = useCallback(async (slideIndex: number) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }

    setAudioReady(false);
    setIsLoading(true);

    const url = await fetchAudio(slideIndex);
    if (!url) {
      setIsLoading(false);
      setAudioReady(true);
      return;
    }

    const audio = new Audio(url);
    audio.muted = isMutedRef.current;
    audioRef.current = audio;

    audio.addEventListener("canplaythrough", () => {
      setAudioReady(true);
      setIsLoading(false);
    }, { once: true });

    audio.addEventListener("error", () => {
      setAudioReady(true);
      setIsLoading(false);
    }, { once: true });

    audio.load();
  }, [fetchAudio]);

  const changeSlide = useCallback((newIndex: number) => {
    if (crossfadeTimerRef.current) clearTimeout(crossfadeTimerRef.current);
    setOutgoingSlide(displaySlide);
    setDisplaySlide(newIndex);
    setCurrentSlide(newIndex);
    slideStartRef.current = Date.now();
    setProgress(0);
    requestAnimationFrame(() => {
      setCrossfadePhase("active");
    });
    crossfadeTimerRef.current = setTimeout(() => {
      setCrossfadePhase("idle");
      setOutgoingSlide(null);
    }, CROSSFADE_DURATION);
  }, [displaySlide]);

  useEffect(() => {
    const preloadNext = async () => {
      const next = currentSlide + 1;
      if (next < DEMO_SLIDES.length) {
        fetchAudio(next);
      }
    };
    preloadNext();
  }, [currentSlide, fetchAudio]);

  useEffect(() => {
    playSlideAudio(currentSlide);
  }, [currentSlide]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
    }
    if (audioContextRef.current) {
      if (isMuted) {
        audioContextRef.current.suspend();
      } else {
        audioContextRef.current.resume();
      }
    }
  }, [isMuted]);

  useEffect(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }

    if (!isPlaying) return;

    const audioDuration = audioRef.current?.duration
      ? audioRef.current.duration * 1000 + 2000
      : SLIDE_DURATION;
    const totalDuration = Math.max(audioDuration, SLIDE_DURATION);

    progressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - slideStartRef.current;
      const pct = Math.min((elapsed / totalDuration) * 100, 100);
      setProgress(pct);

      if (pct >= 100) {
        if (currentSlide < DEMO_SLIDES.length - 1) {
          changeSlide(currentSlide + 1);
        } else {
          setIsPlaying(false);
        }
      }
    }, 50);

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [isPlaying, currentSlide, audioReady, changeSlide]);

  useEffect(() => {
    if (isPlaying && audioRef.current && audioReady) {
      initMusic();
      audioRef.current.play().catch(() => {});
    } else if (!isPlaying && audioRef.current) {
      audioRef.current.pause();
    }
  }, [isPlaying, audioReady, initMusic]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === " " || e.key === "k") {
        e.preventDefault();
        setIsPlaying((prev) => !prev);
      }
      if (e.key === "ArrowRight" && currentSlide < DEMO_SLIDES.length - 1) {
        changeSlide(currentSlide + 1);
        setIsPlaying(true);
      }
      if (e.key === "ArrowLeft" && currentSlide > 0) {
        changeSlide(currentSlide - 1);
        setIsPlaying(true);
      }
      if (e.key === "m") {
        setIsMuted((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [currentSlide, onClose, changeSlide]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
      audioCacheRef.current.forEach((url) => URL.revokeObjectURL(url));
      if (musicCleanupRef.current) musicCleanupRef.current();
      if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
      if (crossfadeTimerRef.current) clearTimeout(crossfadeTimerRef.current);
    };
  }, []);

  const goToSlide = (index: number) => {
    initMusic();
    changeSlide(index);
    setIsPlaying(true);
  };

  const handlePlayPause = () => {
    initMusic();
    setIsPlaying(!isPlaying);
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col" data-testid="demo-player">
      <div className="flex items-center justify-between gap-4 px-4 py-3 bg-black/80 border-b border-white/10">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-white/90 text-sm font-semibold tracking-wide uppercase">
            ALMP Platform Demo
          </div>
          <div className="text-white/40 text-xs">
            {currentSlide + 1} / {DEMO_SLIDES.length}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="text-white/70 hover:text-white"
            onClick={() => setIsMuted(!isMuted)}
            data-testid="button-demo-mute"
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="text-white/70 hover:text-white"
            onClick={onClose}
            data-testid="button-demo-close"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden flex items-center justify-center bg-gradient-to-br from-gray-950 via-black to-gray-900">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/10 via-transparent to-purple-900/10" />

        <div className="relative w-full max-w-6xl mx-auto px-8">
          <div className="relative rounded-lg overflow-hidden shadow-2xl shadow-blue-500/10 border border-white/5">
            {outgoingSlideData && (
              <img
                src={outgoingSlideData.image}
                alt={outgoingSlideData.title}
                className="absolute inset-0 w-full h-full object-cover"
                style={{
                  zIndex: 1,
                  opacity: crossfadePhase === "active" ? 0 : 1,
                  transition: `opacity ${CROSSFADE_DURATION}ms ease-in-out`,
                }}
              />
            )}
            <img
              src={slide.image}
              alt={slide.title}
              className="w-full h-auto relative"
              style={{
                zIndex: 2,
                opacity: outgoingSlide !== null ? (crossfadePhase === "active" ? 1 : 0) : 1,
                transition: outgoingSlide !== null ? `opacity ${CROSSFADE_DURATION}ms ease-in-out` : undefined,
              }}
              data-testid="img-demo-slide"
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent pt-20 pb-6 px-8" style={{ zIndex: 3 }}>
              <h3 className="text-white text-2xl font-bold mb-2" data-testid="text-demo-title">
                {slide.title}
              </h3>
              <p className="text-white/70 text-sm leading-relaxed max-w-3xl" data-testid="text-demo-narration">
                {slide.narration}
              </p>
            </div>
          </div>
        </div>

        {isLoading && (
          <div className="absolute top-4 right-4 flex items-center gap-2 bg-black/60 rounded-full px-3 py-1.5 text-xs text-white/60">
            <div className="w-3 h-3 border border-white/30 border-t-white/80 rounded-full animate-spin" />
            Generating narration...
          </div>
        )}
      </div>

      <div className="bg-black/80 border-t border-white/10 px-4 py-3">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="text-white/70 hover:text-white"
              onClick={() => currentSlide > 0 && goToSlide(currentSlide - 1)}
              disabled={currentSlide === 0}
              data-testid="button-demo-prev"
            >
              <SkipBack className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="text-white/70 hover:text-white"
              onClick={handlePlayPause}
              data-testid="button-demo-play"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="text-white/70 hover:text-white"
              onClick={() => currentSlide < DEMO_SLIDES.length - 1 && goToSlide(currentSlide + 1)}
              disabled={currentSlide === DEMO_SLIDES.length - 1}
              data-testid="button-demo-next"
            >
              <SkipForward className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-100"
              style={{ width: `${progress}%` }}
              data-testid="bar-demo-progress"
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {DEMO_SLIDES.map((s, i) => (
            <button
              key={i}
              onClick={() => goToSlide(i)}
              className={`shrink-0 rounded overflow-hidden border-2 transition-all duration-200 ${
                i === currentSlide
                  ? "border-blue-500 opacity-100 scale-105"
                  : "border-transparent opacity-50 hover:opacity-80"
              }`}
              data-testid={`button-demo-thumb-${i}`}
            >
              <img
                src={s.image}
                alt={s.title}
                className="w-20 h-12 object-cover object-top"
              />
            </button>
          ))}
        </div>
      </div>

    </div>
  );
}
