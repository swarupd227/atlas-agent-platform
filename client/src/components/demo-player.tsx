import { useState, useEffect, useRef, useCallback } from "react";
import { X, Play, Pause, SkipForward, SkipBack, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DemoSlide {
  image: string;
  title: string;
  headline: string;
  keywords: string[];
  highlights: string[];
  narration: string;
  isOpening?: boolean;
  isClosing?: boolean;
}

const DEMO_SLIDES: DemoSlide[] = [
  {
    image: "/demo-screenshots/01-overview.png",
    title: "Nous Agent Orchestrator",
    headline: "Your Industry. Your Agents. Your Context.",
    keywords: ["Industry-Native AI", "Autonomous Operations", "Compliance-First"],
    highlights: [
      "Agents that understand your industry from day one",
      "Deploy from battle-tested templates in hours",
      "Self-healing with full audit trails",
    ],
    narration:
      "Every enterprise wants AI agents. But running them safely — with compliance, governance, and reliability — takes months. Nawse Agent Orchestrator changes that. Agents understand your industry from login, deploy from battle-tested templates in hours, and heal themselves when something breaks — with a full audit trail. Let me show you what this looks like.",
    isOpening: true,
  },
  {
    image: "/demo-screenshots/01-overview.png",
    title: "Industry Workspace",
    headline: "The Platform Speaks Your Industry.",
    keywords: ["Context Engine", "Auto-Compliance", "Domain Knowledge"],
    highlights: [
      "35 industry-specific agent skills auto-loaded",
      "38 SOC 2 controls activated instantly",
      "GDPR and CCPA policies turned on by default",
    ],
    narration:
      "The first thing Nawse asks is: what's your industry? When NovaBill selected SaaS, the platform auto-loaded 35 agent skills, activated 38 SOC 2 controls, and turned on GDPR and CCPA policies. On other platforms, you start with a blank canvas. On Nawse, you start with your industry already understood.",
  },
  {
    image: "/demo-screenshots/08-outcomes.png",
    title: "Outcome Dashboard",
    headline: "Business Results. Not AI Metrics.",
    keywords: ["KPI Tracking", "84% Margins", "82nd Percentile"],
    highlights: [
      "73% autonomous resolution rate",
      "$112K revenue at $18K cost this quarter",
      "Industry benchmarking across the platform",
    ],
    narration:
      "The Outcome Dashboard shows business results — not model names or token counts. NovaBill's agent resolves 73% of tickets autonomously at 84% margins. And the benchmark line shows they're in the 82nd percentile compared to other SaaS companies on the platform.",
  },
  {
    image: "/demo-screenshots/02-agents.png",
    title: "Golden Templates",
    headline: "Deploy in Hours. Not Months.",
    keywords: ["73 Deployments", "420 Test Cases", "3-Hour Setup"],
    highlights: [
      "Production-ready agent templates refined across dozens of companies",
      "Pre-wired integrations, governance, and test suites included",
      "NovaBill: shadow testing in under 3 hours",
    ],
    narration:
      "The Golden Repository is an app store for production-ready agents. NovaBill's L1 Support template has been deployed by 73 companies — with skills, test cases, and pipelines refined across real-world environments. They connected their systems and were in shadow testing within 3 hours.",
  },
  {
    image: "/demo-screenshots/04-monitor.png",
    title: "Agent Cockpit",
    headline: "Watch the Agent Think and Act.",
    keywords: ["4.2s Resolution", "$0.018 Cost", "Auto-Redaction"],
    highlights: [
      "Real-time trace of every agent decision",
      "Automatic PII redaction for SOC 2 and GDPR",
      "Curated 24K token context — not a 128K dump",
    ],
    narration:
      "Here's the agent working live. A customer can't export invoices — the agent classifies, searches the knowledge base, identifies the issue, and sends the fix. 4.2 seconds, under two cents. It auto-redacts PII from logs and curates exactly 24,000 tokens of relevant context. Focused context, better answers.",
  },
  {
    image: "/demo-screenshots/07-approvals.png",
    title: "Adaptive Autonomy",
    headline: "It Knows When to Ask a Human.",
    keywords: ["Risk-Based Escalation", "Approve & Teach", "85% to 91% Autonomy"],
    highlights: [
      "Agent does 95% of the work, human makes the judgment call",
      "Approve & Teach: platform learns from every decision",
      "NovaBill: 85% to 91% autonomy in two months",
    ],
    narration:
      "A customer wants a $2,400 refund. The agent verified the billing, calculated the policy-eligible amount, and prepared a counter-offer — but stopped. The amount exceeds policy limits. A human makes the call. With Approve and Teach, the platform learns from each decision. That's how NovaBill went from 85% to 91% autonomy in two months.",
  },
  {
    image: "/demo-screenshots/03-deployments.png",
    title: "Self-Healing Pipeline",
    headline: "The Platform Fixes Itself.",
    keywords: ["3 AM Detection", "Zero Humans", "$340K Protected"],
    highlights: [
      "Detected resolution rate drop at 3 AM — diagnosed in 7 minutes",
      "Wrote a fix, validated against 420 test cases, deployed via canary",
      "Fully restored by 5:15 AM — zero human intervention",
    ],
    narration:
      "Tuesday, 3 AM. Resolution rate drops from 73% to 58%. The platform diagnoses the cause in 7 minutes — a billing API field rename. It writes a fix, validates against 420 test cases, runs a canary at 5%, then 25%, then full deployment. Fully restored by 5:15 AM. Zero humans. $340,000 in quarterly revenue protected.",
  },
  {
    image: "/demo-screenshots/05-governance.png",
    title: "Shadow Replay & Canary",
    headline: "Evidence-Based Deployment.",
    keywords: ["420 Test Cases", "99.5% Pass Rate", "96% vs 57%"],
    highlights: [
      "Golden evaluation dataset refined across 73 deployments",
      "Canary results: 96% resolution vs 57% for broken version",
      "Same CI/CD rigor as traditional software, applied to AI agents",
    ],
    narration:
      "The evidence behind that autonomous fix: 420 test cases from a golden dataset refined across 73 deployments. The broken category now passes at 100%. Canary results: 96% resolution versus 57% for the broken version. This is evidence-based deployment — same rigor as traditional CI/CD, applied to AI agents.",
  },
  {
    image: "/demo-screenshots/06-billing.png",
    title: "Compliance & Audit",
    headline: "Full Governance. Automatically.",
    keywords: ["SHA-256 Hash Chain", "SOC 2 Type II", "One-Click Export"],
    highlights: [
      "34 tamper-proof events, cryptographically hash-chained",
      "36 of 38 SOC 2 controls fully evidenced automatically",
      "One-click compliance report for auditors",
    ],
    narration:
      "Every action — detection, diagnosis, fix, validation, deployment — is in a tamper-proof audit trail. 34 hash-chained events, each tagged with SOC 2 controls. 36 of 38 controls fully evidenced from platform operations. When an auditor asks what happened, this is the answer — generated automatically as a byproduct of doing the job.",
  },
  {
    image: "/demo-screenshots/01-overview.png",
    title: "Nous Agent Orchestrator",
    headline: "Your Agents. Your Industry. Your Context.",
    keywords: ["Industry-Native", "Regulation-Ready", "Enterprise-Grade"],
    highlights: [
      "$972K annualized cost savings for NovaBill",
      "84% margins on outcome revenue",
      "$340K quarterly revenue protected while everyone slept",
    ],
    narration:
      "In eight screens: a platform that understands your industry, deploys agents in hours, shows business results, knows when to ask a human, heals itself, validates every fix, and generates a tamper-proof audit trail — automatically. For NovaBill: $972,000 in cost savings, 84% margins, and $340,000 protected while everyone slept. That's Nawse Agent Orchestrator.",
    isClosing: true,
  },
];

const TRANSITION_DURATION = 900;
const POST_NARRATION_PAUSE = 1500;

function startRockMusic(audioContext: AudioContext): () => void {
  const masterGain = audioContext.createGain();
  masterGain.gain.value = 0.35;
  masterGain.connect(audioContext.destination);

  const compressor = audioContext.createDynamicsCompressor();
  compressor.threshold.value = -12;
  compressor.knee.value = 4;
  compressor.ratio.value = 8;
  compressor.attack.value = 0.002;
  compressor.release.value = 0.1;
  compressor.connect(masterGain);

  const reverbConvolver = audioContext.createConvolver();
  const reverbLength = audioContext.sampleRate * 0.8;
  const reverbBuffer = audioContext.createBuffer(2, reverbLength, audioContext.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = reverbBuffer.getChannelData(ch);
    for (let i = 0; i < reverbLength; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / reverbLength, 3);
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

  const bpm = 120;
  const beatDuration = 60 / bpm;
  const barDuration = beatDuration * 4;

  const powerChords = [
    [82.41, 123.47, 164.81],
    [92.50, 138.59, 185.00],
    [73.42, 110.00, 146.83],
    [98.00, 146.83, 196.00],
    [87.31, 130.81, 174.61],
    [77.78, 116.54, 155.56],
    [82.41, 123.47, 164.81],
    [110.00, 164.81, 220.00],
  ];

  let chordIndex = 0;
  let beatCount = 0;
  const activeNodes: { osc: OscillatorNode; gain: GainNode }[] = [];
  let beatIntervalId: ReturnType<typeof setInterval> | null = null;
  let barIntervalId: ReturnType<typeof setInterval> | null = null;

  function playKick(time: number) {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(180, time);
    osc.frequency.exponentialRampToValueAtTime(35, time + 0.1);
    gain.gain.setValueAtTime(0.9, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);
    osc.connect(gain);
    gain.connect(dryGain);
    osc.start(time);
    osc.stop(time + 0.4);

    const click = audioContext.createOscillator();
    const clickGain = audioContext.createGain();
    click.type = "square";
    click.frequency.value = 1200;
    clickGain.gain.setValueAtTime(0.3, time);
    clickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.02);
    click.connect(clickGain);
    clickGain.connect(dryGain);
    click.start(time);
    click.stop(time + 0.05);
  }

  function playSnare(time: number) {
    const osc = audioContext.createOscillator();
    const oscGain = audioContext.createGain();
    osc.type = "triangle";
    osc.frequency.value = 200;
    oscGain.gain.setValueAtTime(0.5, time);
    oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
    osc.connect(oscGain);
    oscGain.connect(dryGain);
    oscGain.connect(reverbConvolver);
    osc.start(time);
    osc.stop(time + 0.15);

    const noiseLen = audioContext.sampleRate * 0.12;
    const noiseBuf = audioContext.createBuffer(1, noiseLen, audioContext.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) {
      nd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / noiseLen, 1.5);
    }
    const noiseSrc = audioContext.createBufferSource();
    noiseSrc.buffer = noiseBuf;
    const noiseGain = audioContext.createGain();
    noiseGain.gain.setValueAtTime(0.4, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);

    const snareFilter = audioContext.createBiquadFilter();
    snareFilter.type = "highpass";
    snareFilter.frequency.value = 1500;
    noiseSrc.connect(snareFilter);
    snareFilter.connect(noiseGain);
    noiseGain.connect(dryGain);
    noiseGain.connect(reverbConvolver);
    noiseSrc.start(time);
  }

  function playHihat(time: number, open: boolean) {
    const bufferSize = audioContext.sampleRate * (open ? 0.15 : 0.04);
    const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, open ? 2 : 5);
    }
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    const hihatGain = audioContext.createGain();
    hihatGain.gain.setValueAtTime(open ? 0.25 : 0.18, time);
    hihatGain.gain.exponentialRampToValueAtTime(0.001, time + (open ? 0.15 : 0.04));

    const hihatFilter = audioContext.createBiquadFilter();
    hihatFilter.type = "highpass";
    hihatFilter.frequency.value = 6000;
    source.connect(hihatFilter);
    hihatFilter.connect(hihatGain);
    hihatGain.connect(dryGain);
    source.start(time);
  }

  function playCrash(time: number) {
    const bufferSize = audioContext.sampleRate * 0.8;
    const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 1.5);
    }
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    const crashGain = audioContext.createGain();
    crashGain.gain.setValueAtTime(0.3, time);
    crashGain.gain.exponentialRampToValueAtTime(0.001, time + 0.8);

    const crashFilter = audioContext.createBiquadFilter();
    crashFilter.type = "bandpass";
    crashFilter.frequency.value = 5000;
    crashFilter.Q.value = 0.5;
    source.connect(crashFilter);
    crashFilter.connect(crashGain);
    crashGain.connect(dryGain);
    crashGain.connect(reverbConvolver);
    source.start(time);
  }

  function scheduleBeat() {
    const now = audioContext.currentTime;
    const beatInBar = beatCount % 8;

    if (beatInBar === 0) {
      playKick(now);
      playCrash(now);
    } else if (beatInBar === 4) {
      playKick(now);
    } else if (beatInBar === 2 || beatInBar === 6) {
      playSnare(now);
    }

    if (beatInBar === 3 || beatInBar === 7) {
      playKick(now);
    }

    const isOpen = beatInBar === 1 || beatInBar === 5;
    playHihat(now, isOpen);

    if (beatInBar % 2 === 0) {
      playHihat(now + beatDuration * 0.5, false);
    }

    beatCount++;
  }

  function playPowerChord() {
    activeNodes.forEach(({ osc, gain }) => {
      const now = audioContext.currentTime;
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.3);
      setTimeout(() => { try { osc.stop(); } catch {} }, 400);
    });
    activeNodes.length = 0;

    const chord = powerChords[chordIndex % powerChords.length];
    chordIndex++;
    const now = audioContext.currentTime;

    chord.forEach((freq, i) => {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = "sawtooth";
      osc.frequency.value = freq;
      osc.detune.value = (Math.random() - 0.5) * 15;

      const distortion = audioContext.createWaveShaper();
      const curve = new Float32Array(256);
      for (let j = 0; j < 256; j++) {
        const x = (j / 128) - 1;
        curve[j] = Math.tanh(x * 2.5);
      }
      distortion.curve = curve;

      const vol = [0.22, 0.18, 0.14][i] || 0.12;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(vol, now + 0.05);
      gain.gain.setValueAtTime(vol, now + barDuration * 0.7);
      gain.gain.linearRampToValueAtTime(vol * 0.4, now + barDuration * 0.95);

      osc.connect(distortion);
      distortion.connect(gain);
      gain.connect(dryGain);
      gain.connect(reverbConvolver);
      osc.start(now);
      activeNodes.push({ osc, gain });

      const osc2 = audioContext.createOscillator();
      const gain2 = audioContext.createGain();
      osc2.type = "sawtooth";
      osc2.frequency.value = freq * 1.005;
      osc2.detune.value = 8;
      gain2.gain.setValueAtTime(0, now);
      gain2.gain.linearRampToValueAtTime(vol * 0.7, now + 0.08);
      gain2.gain.setValueAtTime(vol * 0.7, now + barDuration * 0.6);
      gain2.gain.linearRampToValueAtTime(0, now + barDuration * 0.9);
      osc2.connect(distortion);
      distortion.connect(gain2);
      gain2.connect(dryGain);
      osc2.start(now);
      activeNodes.push({ osc: osc2, gain: gain2 });
    });

    const bassOsc = audioContext.createOscillator();
    const bassGain = audioContext.createGain();
    bassOsc.type = "sawtooth";
    bassOsc.frequency.value = chord[0] / 2;

    const bassFilter = audioContext.createBiquadFilter();
    bassFilter.type = "lowpass";
    bassFilter.frequency.value = 300;
    bassFilter.Q.value = 2;

    bassGain.gain.setValueAtTime(0, now);
    bassGain.gain.linearRampToValueAtTime(0.5, now + 0.03);
    bassGain.gain.setValueAtTime(0.5, now + barDuration * 0.6);
    bassGain.gain.linearRampToValueAtTime(0.2, now + barDuration * 0.9);
    bassOsc.connect(bassFilter);
    bassFilter.connect(bassGain);
    bassGain.connect(dryGain);
    bassOsc.start(now);
    activeNodes.push({ osc: bassOsc, gain: bassGain });
  }

  playPowerChord();
  scheduleBeat();

  beatIntervalId = setInterval(scheduleBeat, beatDuration * 1000);
  barIntervalId = setInterval(playPowerChord, barDuration * 1000);

  return () => {
    if (beatIntervalId) clearInterval(beatIntervalId);
    if (barIntervalId) clearInterval(barIntervalId);
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
  const [highlightsVisible, setHighlightsVisible] = useState<boolean[]>([]);

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
    const cleanup = startRockMusic(ac);
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
    const hl = DEMO_SLIDES[slideIndex].highlights;
    setKeywordVisible(new Array(kw.length).fill(false));
    setHighlightsVisible(new Array(hl.length).fill(false));

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
      }, 1200 + i * 500);
      keywordTimersRef.current.push(timer);
    });

    hl.forEach((_, i) => {
      const timer = setTimeout(() => {
        setHighlightsVisible((prev) => {
          const next = [...prev];
          next[i] = true;
          return next;
        });
      }, 2000 + i * 700);
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

  const isCinematicSlide = (slide.isOpening || slide.isClosing) && !transitioning;
  const isLastSlide = currentSlide === DEMO_SLIDES.length - 1;
  const demoFinished = isLastSlide && !isPlaying && progress >= 99;

  function renderHighlights(highlights: string[], visible: boolean[]) {
    return (
      <div className="flex flex-col gap-2 mt-4">
        {highlights.map((hl, i) => (
          <div
            key={i}
            className="highlight-item flex items-start gap-2"
            style={{
              opacity: visible[i] ? 1 : 0,
              transform: visible[i] ? "translateX(0)" : "translateX(16px)",
              transition: "opacity 0.5s ease, transform 0.5s ease",
            }}
            data-testid={`text-highlight-${i}`}
          >
            <span className="shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full bg-blue-400/70" />
            <span className="text-white/70 text-sm leading-relaxed">{hl}</span>
          </div>
        ))}
      </div>
    );
  }

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
        @keyframes kenBurns {
          0% { transform: scale(1); }
          100% { transform: scale(1.04); }
        }
        @keyframes cinematicGradient {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes particleFloat {
          0% { transform: translateY(0) translateX(0); opacity: 0; }
          10% { opacity: 0.6; }
          90% { opacity: 0.6; }
          100% { transform: translateY(-100vh) translateX(20px); opacity: 0; }
        }
        .slide-headline {
          animation: slideInUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .slide-keyword {
          animation: slideInRight 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .slide-image-active {
          animation: kenBurns 15s ease-out forwards;
        }
        .cinematic-headline {
          background: linear-gradient(135deg, #60a5fa, #a78bfa, #60a5fa);
          background-size: 200% 200%;
          animation: slideInUp 1s cubic-bezier(0.16, 1, 0.3, 1) forwards, cinematicGradient 4s ease infinite;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .cinematic-cta {
          animation: fadeInScale 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          animation-delay: 1.5s;
          opacity: 0;
        }
        .cinematic-subtitle {
          animation: fadeInScale 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          animation-delay: 0.5s;
          opacity: 0;
        }
      `}</style>

      <div className="flex items-center justify-between gap-4 px-4 py-3 bg-black/80 border-b border-white/10">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-white/90 text-sm font-semibold tracking-wide uppercase">
            Nous Agent Orchestrator
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

        {isCinematicSlide ? (
          <div className="relative w-full max-w-6xl mx-auto px-8">
            <div className="relative rounded-lg overflow-hidden shadow-2xl shadow-blue-500/10 border border-white/5">
              <img
                src={slide.image}
                alt={slide.title}
                className="w-full h-auto slide-image-active"
                style={{ filter: "brightness(0.15) blur(4px)" }}
                data-testid="img-demo-slide"
              />

              <div className="absolute inset-0" style={{ zIndex: 2 }}>
                {[...Array(12)].map((_, i) => (
                  <div
                    key={i}
                    className="absolute rounded-full bg-blue-400/20"
                    style={{
                      width: `${2 + Math.random() * 3}px`,
                      height: `${2 + Math.random() * 3}px`,
                      left: `${5 + Math.random() * 90}%`,
                      bottom: `-5%`,
                      animation: `particleFloat ${8 + Math.random() * 12}s linear infinite`,
                      animationDelay: `${Math.random() * 8}s`,
                    }}
                  />
                ))}
              </div>

              <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-8" style={{ zIndex: 3 }}>
                {headlineVisible && (
                  <div className="mb-6">
                    {slide.isOpening && (
                      <div className="cinematic-subtitle mb-6">
                        <span className="text-white/50 text-base tracking-[0.3em] uppercase font-light">
                          Introducing
                        </span>
                      </div>
                    )}
                    <span className="inline-block text-sm font-bold uppercase tracking-[0.25em] text-blue-400/80 mb-4 slide-headline">
                      {slide.title}
                    </span>
                    <h2 className="cinematic-headline text-4xl sm:text-5xl md:text-6xl font-bold leading-tight" data-testid="text-demo-headline">
                      {slide.headline}
                    </h2>
                  </div>
                )}

                <div className="flex items-center gap-2 flex-wrap justify-center mt-4 mb-4">
                  {slide.keywords.map((kw, i) => (
                    <span
                      key={`${currentSlide}-${i}`}
                      className="slide-keyword"
                      style={{
                        opacity: keywordVisible[i] ? 1 : 0,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "5px 14px",
                        borderRadius: "6px",
                        background: "rgba(59, 130, 246, 0.15)",
                        border: "1px solid rgba(59, 130, 246, 0.3)",
                        color: "rgba(147, 197, 253, 0.95)",
                        fontSize: "12px",
                        fontWeight: 600,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase" as const,
                        backdropFilter: "blur(8px)",
                      }}
                      data-testid={`badge-keyword-${i}`}
                    >
                      {kw}
                    </span>
                  ))}
                </div>

                {renderHighlights(slide.highlights, highlightsVisible)}

                {demoFinished && (
                  <div className="cinematic-cta mt-8">
                    <Button
                      size="lg"
                      className="gap-2 text-base px-8"
                      onClick={onClose}
                      data-testid="button-demo-get-started"
                    >
                      Get Started
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
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
                key={`slide-${currentSlide}`}
                src={slide.image}
                alt={slide.title}
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
                  <div className="flex items-center gap-2 flex-wrap mt-3 mb-2">
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

                {!transitioning && renderHighlights(slide.highlights, highlightsVisible)}
              </div>
            </div>
          </div>
        )}

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
          {DEMO_SLIDES.map((s, i) => {
            const isThumbCinematic = s.isOpening || s.isClosing;
            return (
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
                {isThumbCinematic ? (
                  <div className="w-20 h-12 bg-gradient-to-br from-gray-900 via-blue-950 to-gray-900 flex items-center justify-center">
                    <span className="text-[8px] font-bold text-blue-400/80 uppercase tracking-wider">
                      {s.isOpening ? "Intro" : "Closing"}
                    </span>
                  </div>
                ) : (
                  <img
                    src={s.image}
                    alt={s.title}
                    className="w-20 h-12 object-cover object-top"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
