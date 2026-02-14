import { useState, useEffect, useRef, useCallback } from "react";
import { X, Play, Pause, SkipForward, SkipBack, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DemoSlide {
  image: string;
  title: string;
  headline: string;
  keywords: string[];
  narration: string;
}

const DEMO_SLIDES: DemoSlide[] = [
  {
    image: "/demo-screenshots/01-overview.png",
    title: "Command Center",
    headline: "Total Visibility. Instant Intelligence.",
    keywords: ["Platform Health", "KPI Tracking", "Agent Fleet Status"],
    narration:
      "Welcome to ALMP — the only AI agent platform built around your industry's context. Your command center delivers instant visibility into platform health, KPI progress, and agent fleet status across every environment. One dashboard. Complete operational intelligence.",
  },
  {
    image: "/demo-screenshots/08-outcomes.png",
    title: "Outcome Contracts",
    headline: "Pay for Results. Not Compute.",
    keywords: ["Outcome-Based Billing", "SLA Tracking", "Measurable ROI"],
    narration:
      "Define success on your terms with outcome contracts. Set KPIs, SLAs, and pricing models tied to measurable business results — not compute hours. Tamper-evident metering ensures every charge is backed by cryptographic proof. This is AI billing, reimagined for accountability.",
  },
  {
    image: "/demo-screenshots/02-agents.png",
    title: "Agent Registry",
    headline: "80% Autonomous. 20% Expert Validated.",
    keywords: ["Multi-Agent Teams", "Industry Context", "Adaptive Autonomy"],
    narration:
      "Your entire agent fleet, organized by industry context. The Agent Registry supports single agents, coordinated teams, and remote A2A agents — each operating with adaptive autonomy calibrated to your industry's risk profile. Build agents that reason within your regulatory and operational framework by default.",
  },
  {
    image: "/demo-screenshots/03-deployments.png",
    title: "Industry-Governed Deployments",
    headline: "Compliance-First. Zero Deployment Anxiety.",
    keywords: ["Mandatory Pipeline Stages", "Auto-Rollback", "Evidence Packages"],
    narration:
      "Deploy with confidence using industry-governed deployment pipelines. Healthcare gets clinical safety review and HIPAA attestation. Financial services gets regulatory compliance and suitability testing. Every deployment generates an evidence package for regulatory conformity — with auto-rollback triggers that activate on industry-specific safety events.",
  },
  {
    image: "/demo-screenshots/04-monitor.png",
    title: "Live Observability",
    headline: "From First Token to Final Outcome.",
    keywords: ["OpenTelemetry", "Drift Detection", "MCP Trace Waterfalls"],
    narration:
      "Real-time monitoring powered by OpenTelemetry with industry-calibrated baselines. Track every agent run, detect drift instantly, and drill into MCP trace waterfalls. Full observability with industry-specific KPI monitoring from the first token to the final outcome.",
  },
  {
    image: "/demo-screenshots/05-governance.png",
    title: "Certified Compliance",
    headline: "Governance That Enables. Not Blocks.",
    keywords: ["Policy-as-Code", "EU AI Act", "Immutable Audit Trails"],
    narration:
      "Enterprise-grade compliance woven into every layer. Policy-as-Code enforcement with OPA Rego and Cedar, SOC 2 and EU AI Act conformity frameworks, and immutable hash-chained audit trails. Five industry profiles — healthcare, financial services, manufacturing, insurance, and retail — each with pre-loaded regulatory frameworks.",
  },
  {
    image: "/demo-screenshots/07-approvals.png",
    title: "Approval Gates",
    headline: "The 20% That Makes the 80% Work.",
    keywords: ["Blast Radius Analysis", "Risk Scoring", "One-Click Decisions"],
    narration:
      "Expert validation gates where it matters most. Every approval comes with blast radius analysis, configuration diffs, and risk scoring calibrated to industry context. One-click decisions backed by evidence keep your agents moving safely through the pipeline.",
  },
  {
    image: "/demo-screenshots/06-billing.png",
    title: "Outcome Billing",
    headline: "Every Charge. Cryptographically Proven.",
    keywords: ["Tamper-Evident", "Invoice-to-Trace", "Outcome Metering"],
    narration:
      "Transparent, outcome-based billing with tamper-evident metering. Drill from invoice to event to trace — every charge cryptographically verified. Welcome to the new standard in AI agent billing, where you only pay for measurable results.",
  },
];

const TRANSITION_DURATION = 900;
const POST_NARRATION_PAUSE = 1500;

function startJazzyMusic(audioContext: AudioContext): () => void {
  const masterGain = audioContext.createGain();
  masterGain.gain.value = 0.045;
  masterGain.connect(audioContext.destination);

  const compressor = audioContext.createDynamicsCompressor();
  compressor.threshold.value = -20;
  compressor.knee.value = 10;
  compressor.ratio.value = 4;
  compressor.connect(masterGain);

  const reverbConvolver = audioContext.createConvolver();
  const reverbLength = audioContext.sampleRate * 1.5;
  const reverbBuffer = audioContext.createBuffer(2, reverbLength, audioContext.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = reverbBuffer.getChannelData(ch);
    for (let i = 0; i < reverbLength; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / reverbLength, 2.5);
    }
  }
  reverbConvolver.buffer = reverbBuffer;
  const reverbGain = audioContext.createGain();
  reverbGain.gain.value = 0.15;
  reverbConvolver.connect(reverbGain);
  reverbGain.connect(compressor);

  const dryGain = audioContext.createGain();
  dryGain.gain.value = 0.85;
  dryGain.connect(compressor);

  const jazzChords = [
    [130.81, 164.81, 196.00, 246.94, 311.13],
    [146.83, 185.00, 220.00, 277.18, 349.23],
    [164.81, 207.65, 246.94, 311.13, 392.00],
    [123.47, 155.56, 196.00, 233.08, 293.66],
    [138.59, 174.61, 207.65, 261.63, 329.63],
    [155.56, 196.00, 246.94, 293.66, 369.99],
    [116.54, 146.83, 174.61, 220.00, 277.18],
    [130.81, 164.81, 207.65, 246.94, 311.13],
  ];

  let chordIndex = 0;
  const activeNodes: { osc: OscillatorNode; gain: GainNode }[] = [];

  function playChord() {
    activeNodes.forEach(({ osc, gain }) => {
      const now = audioContext.currentTime;
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.3);
      setTimeout(() => { try { osc.stop(); } catch {} }, 400);
    });
    activeNodes.length = 0;

    const chord = jazzChords[chordIndex % jazzChords.length];
    chordIndex++;

    const types: OscillatorType[] = ["sine", "triangle", "sine", "triangle", "sine"];
    const volumes = [0.35, 0.25, 0.2, 0.18, 0.12];

    chord.forEach((freq, i) => {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const detune = (Math.random() - 0.5) * 6;

      osc.type = types[i % types.length];
      osc.frequency.value = freq;
      osc.detune.value = detune;

      const now = audioContext.currentTime;
      const attackTime = 0.8 + Math.random() * 0.4;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(volumes[i], now + attackTime);
      gain.gain.setValueAtTime(volumes[i], now + attackTime);
      gain.gain.linearRampToValueAtTime(volumes[i] * 0.6, now + 4);
      gain.gain.linearRampToValueAtTime(0, now + 7);

      osc.connect(gain);
      gain.connect(dryGain);
      gain.connect(reverbConvolver);
      osc.start(now);
      activeNodes.push({ osc, gain });
    });

    const bassOsc = audioContext.createOscillator();
    const bassGain = audioContext.createGain();
    bassOsc.type = "sine";
    bassOsc.frequency.value = chord[0] / 2;
    const now = audioContext.currentTime;
    bassGain.gain.setValueAtTime(0, now);
    bassGain.gain.linearRampToValueAtTime(0.3, now + 0.5);
    bassGain.gain.linearRampToValueAtTime(0.15, now + 4);
    bassGain.gain.linearRampToValueAtTime(0, now + 6.5);
    bassOsc.connect(bassGain);
    bassGain.connect(dryGain);
    bassOsc.start(now);
    activeNodes.push({ osc: bassOsc, gain: bassGain });
  }

  playChord();
  const interval = setInterval(playChord, 7000);

  return () => {
    clearInterval(interval);
    activeNodes.forEach(({ osc }) => { try { osc.stop(); } catch {} });
    masterGain.disconnect();
    compressor.disconnect();
    reverbGain.disconnect();
    dryGain.disconnect();
  };
}

interface DemoPlayerProps {
  onClose: () => void;
}

export default function DemoPlayer({ onClose }: DemoPlayerProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [prevSlide, setPrevSlide] = useState<number | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [audioReady, setAudioReady] = useState(false);
  const [musicStarted, setMusicStarted] = useState(false);
  const [keywordVisible, setKeywordVisible] = useState<boolean[]>([]);
  const [headlineVisible, setHeadlineVisible] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const musicCleanupRef = useRef<(() => void) | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const slideStartRef = useRef<number>(Date.now());
  const audioCacheRef = useRef<Map<number, string>>(new Map());
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keywordTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const isMutedRef = useRef(isMuted);
  const narrationEndedRef = useRef(false);

  isMutedRef.current = isMuted;

  const slide = DEMO_SLIDES[currentSlide];
  const prevSlideData = prevSlide !== null ? DEMO_SLIDES[prevSlide] : null;

  const initMusic = useCallback(() => {
    if (musicStarted) return;
    setMusicStarted(true);
    const ac = new AudioContext();
    audioContextRef.current = ac;
    if (isMutedRef.current) ac.suspend();
    const cleanup = startJazzyMusic(ac);
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

  const showKeywords = useCallback((slideIndex: number) => {
    keywordTimersRef.current.forEach(clearTimeout);
    keywordTimersRef.current = [];

    const kw = DEMO_SLIDES[slideIndex].keywords;
    setKeywordVisible(new Array(kw.length).fill(false));

    setHeadlineVisible(false);
    const headlineTimer = setTimeout(() => setHeadlineVisible(true), 400);
    keywordTimersRef.current.push(headlineTimer);

    kw.forEach((_, i) => {
      const timer = setTimeout(() => {
        setKeywordVisible((prev) => {
          const next = [...prev];
          next[i] = true;
          return next;
        });
      }, 1200 + i * 600);
      keywordTimersRef.current.push(timer);
    });
  }, []);

  const playSlideAudio = useCallback(async (slideIndex: number) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }

    setAudioReady(false);
    setIsLoading(true);
    narrationEndedRef.current = false;

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

    audio.addEventListener("ended", () => {
      narrationEndedRef.current = true;
    }, { once: true });

    audio.addEventListener("error", () => {
      setAudioReady(true);
      setIsLoading(false);
    }, { once: true });

    audio.load();
  }, [fetchAudio]);

  const changeSlide = useCallback((newIndex: number) => {
    if (transitioning) return;
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);

    if (audioRef.current) {
      audioRef.current.pause();
    }

    setPrevSlide(currentSlide);
    setTransitioning(true);

    transitionTimerRef.current = setTimeout(() => {
      setCurrentSlide(newIndex);
      setPrevSlide(null);
      setTransitioning(false);
      slideStartRef.current = Date.now();
      setProgress(0);
      showKeywords(newIndex);
    }, TRANSITION_DURATION);
  }, [currentSlide, transitioning, showKeywords]);

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
    if (!transitioning) {
      playSlideAudio(currentSlide);
    }
  }, [currentSlide, transitioning]);

  useEffect(() => {
    showKeywords(0);
  }, []);

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

    if (!isPlaying || transitioning) return;

    const rawDuration = audioRef.current?.duration;
    const audioDuration = rawDuration && isFinite(rawDuration)
      ? rawDuration * 1000 + POST_NARRATION_PAUSE
      : 14000;
    const totalDuration = Math.max(audioDuration, 10000);

    progressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - slideStartRef.current;
      const pct = Math.min((elapsed / totalDuration) * 100, 100);
      setProgress(pct);

      if (pct >= 100 && narrationEndedRef.current) {
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
  }, [isPlaying, currentSlide, audioReady, transitioning, changeSlide]);

  useEffect(() => {
    if (isPlaying && audioRef.current && audioReady && !transitioning) {
      initMusic();
      audioRef.current.play().catch(() => {});
    } else if (!isPlaying && audioRef.current) {
      audioRef.current.pause();
    }
  }, [isPlaying, audioReady, transitioning, initMusic]);

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
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
      keywordTimersRef.current.forEach(clearTimeout);
    };
  }, []);

  const goToSlide = (index: number) => {
    if (index === currentSlide) return;
    initMusic();
    changeSlide(index);
    setIsPlaying(true);
  };

  const handlePlayPause = () => {
    initMusic();
    setIsPlaying(!isPlaying);
  };

  const effectiveSlide = transitioning ? currentSlide : currentSlide;
  const effectiveSlideData = DEMO_SLIDES[effectiveSlide];

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col" data-testid="demo-player">
      <style>{`
        @keyframes slideInUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeInScale {
          from { opacity: 0; transform: scale(0.92); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(30px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes gentleFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        @keyframes kenBurns {
          0% { transform: scale(1); }
          100% { transform: scale(1.04); }
        }
        .slide-headline {
          animation: slideInUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .slide-keyword {
          animation: slideInRight 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .slide-narration-text {
          animation: fadeInScale 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          animation-delay: 0.3s;
          opacity: 0;
        }
        .slide-image-active {
          animation: kenBurns 15s ease-out forwards;
        }
      `}</style>

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
            className="text-white/70"
            onClick={() => setIsMuted(!isMuted)}
            data-testid="button-demo-mute"
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="text-white/70"
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
            {prevSlideData && transitioning && (
              <img
                src={prevSlideData.image}
                alt={prevSlideData.title}
                className="absolute inset-0 w-full h-full object-cover"
                style={{
                  zIndex: 1,
                  opacity: 0,
                  transition: `opacity ${TRANSITION_DURATION}ms cubic-bezier(0.4, 0, 0.2, 1)`,
                }}
              />
            )}

            <img
              key={`slide-${effectiveSlide}`}
              src={effectiveSlideData.image}
              alt={effectiveSlideData.title}
              className={`w-full h-auto relative ${!transitioning ? "slide-image-active" : ""}`}
              style={{
                zIndex: 2,
                opacity: transitioning ? 0 : 1,
                transform: transitioning ? "scale(1.06)" : undefined,
                transition: `opacity ${TRANSITION_DURATION}ms cubic-bezier(0.4, 0, 0.2, 1), transform ${TRANSITION_DURATION}ms cubic-bezier(0.4, 0, 0.2, 1)`,
              }}
              data-testid="img-demo-slide"
            />

            <div
              className="absolute inset-x-0 bottom-0 pt-24 pb-6 px-8"
              style={{
                zIndex: 3,
                background: "linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.85) 30%, rgba(0,0,0,0.5) 60%, transparent 100%)",
              }}
            >
              {headlineVisible && !transitioning && (
                <div className="slide-headline mb-3">
                  <span className="inline-block text-xs font-bold uppercase tracking-[0.2em] text-blue-400/90 mb-2">
                    {slide.title}
                  </span>
                  <h3 className="text-white text-2xl sm:text-3xl font-bold leading-tight" data-testid="text-demo-headline">
                    {slide.headline}
                  </h3>
                </div>
              )}

              {!transitioning && (
                <div className="flex items-center gap-2 flex-wrap mt-3 mb-3">
                  {slide.keywords.map((kw, i) => (
                    <span
                      key={`${currentSlide}-${i}`}
                      className="slide-keyword"
                      style={{
                        opacity: keywordVisible[i] ? 1 : 0,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "3px 10px",
                        borderRadius: "4px",
                        background: "rgba(59, 130, 246, 0.2)",
                        border: "1px solid rgba(59, 130, 246, 0.3)",
                        color: "rgba(147, 197, 253, 0.95)",
                        fontSize: "11px",
                        fontWeight: 600,
                        letterSpacing: "0.04em",
                        textTransform: "uppercase" as const,
                        backdropFilter: "blur(8px)",
                      }}
                      data-testid={`badge-keyword-${i}`}
                    >
                      {kw}
                    </span>
                  ))}
                </div>
              )}

              {!transitioning && (
                <p className="slide-narration-text text-white/70 text-sm leading-relaxed max-w-3xl" data-testid="text-demo-narration">
                  {slide.narration}
                </p>
              )}
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
              className="text-white/70"
              onClick={() => currentSlide > 0 && goToSlide(currentSlide - 1)}
              disabled={currentSlide === 0}
              data-testid="button-demo-prev"
            >
              <SkipBack className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="text-white/70"
              onClick={handlePlayPause}
              data-testid="button-demo-play"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="text-white/70"
              onClick={() => currentSlide < DEMO_SLIDES.length - 1 && goToSlide(currentSlide + 1)}
              disabled={currentSlide === DEMO_SLIDES.length - 1}
              data-testid="button-demo-next"
            >
              <SkipForward className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full"
              style={{
                width: `${progress}%`,
                transition: "width 100ms linear",
              }}
              data-testid="bar-demo-progress"
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {DEMO_SLIDES.map((s, i) => (
            <button
              key={i}
              onClick={() => goToSlide(i)}
              className={`shrink-0 rounded overflow-hidden border-2 transition-all duration-300 ${
                i === currentSlide
                  ? "border-blue-500 opacity-100 scale-105"
                  : i < currentSlide
                    ? "border-blue-500/30 opacity-60"
                    : "border-transparent opacity-40 hover:opacity-70"
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
