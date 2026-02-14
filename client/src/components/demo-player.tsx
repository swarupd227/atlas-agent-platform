import { useState, useEffect, useRef, useCallback } from "react";
import { X, Play, Pause, SkipForward, SkipBack, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DemoSlide {
  image: string;
  title: string;
  headline: string;
  keywords: string[];
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
    narration:
      "Every enterprise is racing to deploy AI agents. But here's the problem nobody talks about: building an agent takes a week. Running it safely in production — with compliance, governance, and reliability — takes months. And when it breaks at 3 AM? That's when the real cost hits. Nous Agent Orchestrator solves this. It's the only platform where AI agents understand your industry from the first login, deploy from battle-tested templates in hours, and heal themselves when something goes wrong — with a full audit trail that satisfies your compliance team. Let me show you what this looks like for a real SaaS company running autonomous customer support.",
    isOpening: true,
  },
  {
    image: "/demo-screenshots/01-overview.png",
    title: "Industry Workspace Selector",
    headline: "The Platform Speaks Your Industry.",
    keywords: ["Industry Context Engine", "Auto-Activated Compliance", "Domain Knowledge"],
    narration:
      "The very first thing Nous Agent Orchestrator asks is: what's your industry? This isn't a settings page — it's an intelligence layer. When NovaBill selected Technology / SaaS, the platform auto-loaded 35 industry-specific agent skills, activated 38 SOC 2 controls, turned on GDPR and CCPA policies, and configured industry-standard terminology throughout the entire interface. No other platform does this. On AWS Bedrock, you start with a blank canvas. On LangChain, you start with code. On Nous, you start with your industry already understood.",
  },
  {
    image: "/demo-screenshots/08-outcomes.png",
    title: "Outcome Portfolio Dashboard",
    headline: "Business Results. Not AI Metrics.",
    keywords: ["KPI Tracking", "Revenue & Margins", "Industry Benchmarks"],
    narration:
      "This is the Outcome Dashboard — the first screen every user sees after login. Notice: no model names, no token counts, no infrastructure metrics. Business results. NovaBill's support agent is resolving 73% of tickets autonomously, at an average of 2.4 minutes per resolution, with a 4.3 customer satisfaction score. All three KPIs are green. The margin is 84% — that's $112,000 in revenue at $18,000 cost this quarter. And the benchmark line tells NovaBill they're performing in the 82nd percentile compared to other SaaS companies on the platform. That's intelligence no standalone agent builder can offer.",
  },
  {
    image: "/demo-screenshots/02-agents.png",
    title: "Golden Template Gallery",
    headline: "Deploy in Hours. Not Months.",
    keywords: ["Battle-Tested Templates", "73 Deployments", "Complete Solutions"],
    narration:
      "This is the Golden Repository — think of it as an app store for production-ready agents. NovaBill chose this L1 Support template. 73 companies have deployed it before them, which means the skills, the test cases, and the deployment pipeline have been refined across dozens of real-world environments. Look at what comes inside: the agent blueprint, eight industry-specific skills like Billing Inquiry and Escalation Decision, pre-wired connections to Zendesk and Stripe, SOC 2 governance baked in, 420 evaluation test cases, and a complete deployment pipeline with shadow replay and canary stages. NovaBill connected their systems and had a working agent in shadow testing within 3 hours.",
  },
  {
    image: "/demo-screenshots/04-monitor.png",
    title: "Agent Cockpit — Live Trace",
    headline: "Watch the Agent Think and Act.",
    keywords: ["Real-Time Traces", "MCP Tool Calls", "$0.018 Per Resolution"],
    narration:
      "Here's the agent working in real time. A customer can't export invoices. Watch the steps: classified the intent in under a second, activated the right skill, searched the knowledge base, pulled the customer's browser info from the help desk, identified a known Chrome issue, and sent the fix — 4.2 seconds, cost: less than two cents. Look at the governance sidebar. The agent detected an email address in the ticket and auto-redacted it from our logs. SOC 2 and GDPR compliance checks passed automatically. And notice the context budget at the bottom — the platform curates exactly 24,000 tokens of relevant knowledge for this task, not a bloated 128K dump. Focused context, better answers.",
  },
  {
    image: "/demo-screenshots/07-approvals.png",
    title: "Adaptive Autonomy Console",
    headline: "It Knows When to Ask a Human.",
    keywords: ["Risk-Based Escalation", "Approve & Teach", "Earned Trust"],
    narration:
      "Remember on the last screen, the PDF export question was auto-approved because it was low risk — just an informational response. This is different. A customer wants a $2,400 refund. The agent did all the work: verified the seats, checked the billing history, calculated the policy-eligible refund of $864, and prepared a counter-offer. But it stopped. Two rules triggered: amount exceeds $100, and the customer is asking for more than policy allows. The agent did 95% of the work. A human makes the judgment call. And see that Approve and Teach button? If the validator approves and clicks that, the platform learns: next time a similar case comes in, handle it autonomously. That's how NovaBill went from 85% to 91% autonomy in two months — not by removing guardrails, but by the system earning trust one decision at a time.",
  },
  {
    image: "/demo-screenshots/03-deployments.png",
    title: "Self-Healing Pipeline",
    headline: "The Platform Fixes Itself.",
    keywords: ["2-Hour Resolution", "Zero Humans", "$340K Protected"],
    narration:
      "Tuesday, 3 AM. Nobody is awake. The platform detects the resolution rate for billing questions has dropped from 73% to 58%. In 7 minutes, it diagnoses the root cause: NovaBill pushed a routine billing system update that renamed two API fields. By 3:31, the platform has written a fix — a 12-line update to the Billing Inquiry skill. But here's what makes this different from a hotfix: the platform doesn't just deploy. It validates. Shadow replay against 420 test cases: 99.5% pass rate. Then 5% of live tickets as a canary: 96% resolution versus 57% in the control group. Then 25%. Then full deployment. By 5:15 AM, fully restored. Two hours. Zero humans. $340,000 in quarterly revenue protected.",
  },
  {
    image: "/demo-screenshots/05-governance.png",
    title: "Shadow Replay & Canary Results",
    headline: "Every Fix Is Validated Before Deploy.",
    keywords: ["420 Test Cases", "99.5% Pass Rate", "Evidence-Based Deployment"],
    narration:
      "This is the evidence behind the autonomous deployment. 420 test cases from our golden evaluation dataset — refined across 73 deployments. The billing dispute category — the one that was broken — now passes at 100%. Every other category: 100%. The only flags are two pre-existing adversarial edge cases, not regressions. And look at the canary results: side by side, the patched version resolved tickets at 96% versus 57% for the broken version. This isn't hope-based deployment. This is evidence-based deployment. Same rigor as traditional software CI/CD, applied to AI agents for the first time.",
  },
  {
    image: "/demo-screenshots/06-billing.png",
    title: "Compliance & Audit Trail",
    headline: "Full Governance. Automatically.",
    keywords: ["SHA-256 Hash Chain", "SOC 2 Type II", "One-Click Export"],
    narration:
      "Every action the platform took — detection, diagnosis, fix, validation, deployment — is in this audit trail. 34 events, each cryptographically hash-chained so they're tamper-proof. Each event is tagged with the SOC 2 controls it provides evidence for. And on the right: a one-click compliance report. 38 SOC 2 controls, 36 fully evidenced with artifacts generated automatically from platform operations. When NovaBill's auditor asks what happened to your AI system on February 4th, this is the answer — no scrambling, no screenshots, no interviews. The platform generates compliance evidence as a byproduct of doing its job.",
  },
  {
    image: "/demo-screenshots/01-overview.png",
    title: "Nous Agent Orchestrator",
    headline: "Your Agents. Your Industry. Your Context.",
    keywords: ["Industry-Native", "Regulation-Ready", "Enterprise-Grade"],
    narration:
      "Let me bring this together. In eight screens, you've seen a platform that understands your industry from the first login, deploys production-ready agents in hours from battle-tested templates, shows business results not infrastructure metrics, knows when to act and when to ask a human, detects issues, heals itself, and validates the fix through the same safety pipeline as any human-authored change, and generates a tamper-proof, SOC 2-compliant audit trail as a byproduct of doing its job. For NovaBill, that meant $972,000 in annualized cost savings, 84% margins on outcome revenue, and $340,000 in quarterly revenue protected while everyone slept. That's Nous Agent Orchestrator. Not just a platform to build agents — but the platform to run them in production, safely, at scale, in your industry.",
    isClosing: true,
  },
];

const TRANSITION_DURATION = 900;
const POST_NARRATION_PAUSE = 1500;

function startBeatsMusic(audioContext: AudioContext): () => void {
  const masterGain = audioContext.createGain();
  masterGain.gain.value = 0.08;
  masterGain.connect(audioContext.destination);

  const compressor = audioContext.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.knee.value = 8;
  compressor.ratio.value = 6;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.15;
  compressor.connect(masterGain);

  const reverbConvolver = audioContext.createConvolver();
  const reverbLength = audioContext.sampleRate * 1.2;
  const reverbBuffer = audioContext.createBuffer(2, reverbLength, audioContext.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = reverbBuffer.getChannelData(ch);
    for (let i = 0; i < reverbLength; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / reverbLength, 3);
    }
  }
  reverbConvolver.buffer = reverbBuffer;
  const reverbGain = audioContext.createGain();
  reverbGain.gain.value = 0.12;
  reverbConvolver.connect(reverbGain);
  reverbGain.connect(compressor);

  const dryGain = audioContext.createGain();
  dryGain.gain.value = 0.88;
  dryGain.connect(compressor);

  const bpm = 90;
  const beatDuration = 60 / bpm;
  const barDuration = beatDuration * 4;

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
  let beatIntervalId: ReturnType<typeof setInterval> | null = null;
  let barIntervalId: ReturnType<typeof setInterval> | null = null;

  function playKick(time: number) {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.12);
    gain.gain.setValueAtTime(0.5, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
    osc.connect(gain);
    gain.connect(dryGain);
    osc.start(time);
    osc.stop(time + 0.35);
  }

  function playHihat(time: number, accent: boolean) {
    const bufferSize = audioContext.sampleRate * 0.05;
    const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 4);
    }
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    const hihatGain = audioContext.createGain();
    const vol = accent ? 0.18 : 0.08;
    hihatGain.gain.setValueAtTime(vol, time);
    hihatGain.gain.exponentialRampToValueAtTime(0.001, time + (accent ? 0.08 : 0.04));

    const hihatFilter = audioContext.createBiquadFilter();
    hihatFilter.type = "highpass";
    hihatFilter.frequency.value = 7000;
    source.connect(hihatFilter);
    hihatFilter.connect(hihatGain);
    hihatGain.connect(dryGain);
    hihatGain.connect(reverbConvolver);
    source.start(time);
  }

  function playSnare(time: number) {
    const osc = audioContext.createOscillator();
    const oscGain = audioContext.createGain();
    osc.type = "triangle";
    osc.frequency.value = 180;
    oscGain.gain.setValueAtTime(0.25, time);
    oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
    osc.connect(oscGain);
    oscGain.connect(dryGain);
    osc.start(time);
    osc.stop(time + 0.2);

    const noiseLen = audioContext.sampleRate * 0.08;
    const noiseBuf = audioContext.createBuffer(1, noiseLen, audioContext.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) {
      nd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / noiseLen, 2);
    }
    const noiseSrc = audioContext.createBufferSource();
    noiseSrc.buffer = noiseBuf;
    const noiseGain = audioContext.createGain();
    noiseGain.gain.setValueAtTime(0.15, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

    const snareFilter = audioContext.createBiquadFilter();
    snareFilter.type = "highpass";
    snareFilter.frequency.value = 2000;
    noiseSrc.connect(snareFilter);
    snareFilter.connect(noiseGain);
    noiseGain.connect(dryGain);
    noiseSrc.start(time);
  }

  let beatCount = 0;
  function scheduleBeat() {
    const now = audioContext.currentTime;
    const beatInBar = beatCount % 4;

    if (beatInBar === 0) {
      playKick(now);
    } else if (beatInBar === 2) {
      playSnare(now);
    }

    playHihat(now, beatInBar === 0 || beatInBar === 2);

    if (beatInBar === 1 || beatInBar === 3) {
      playHihat(now + beatDuration * 0.5, false);
    }

    beatCount++;
  }

  function playChord() {
    activeNodes.forEach(({ osc, gain }) => {
      const now = audioContext.currentTime;
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.4);
      setTimeout(() => { try { osc.stop(); } catch {} }, 500);
    });
    activeNodes.length = 0;

    const chord = jazzChords[chordIndex % jazzChords.length];
    chordIndex++;

    const types: OscillatorType[] = ["sine", "triangle", "sine", "triangle", "sine"];
    const volumes = [0.3, 0.22, 0.18, 0.15, 0.1];

    chord.forEach((freq, i) => {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const detune = (Math.random() - 0.5) * 8;

      osc.type = types[i % types.length];
      osc.frequency.value = freq;
      osc.detune.value = detune;

      const now = audioContext.currentTime;
      const attackTime = 0.4 + Math.random() * 0.3;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(volumes[i], now + attackTime);
      gain.gain.linearRampToValueAtTime(volumes[i] * 0.7, now + barDuration * 0.6);
      gain.gain.linearRampToValueAtTime(0, now + barDuration * 0.95);

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
    bassGain.gain.linearRampToValueAtTime(0.35, now + 0.3);
    bassGain.gain.linearRampToValueAtTime(0.2, now + barDuration * 0.5);
    bassGain.gain.linearRampToValueAtTime(0, now + barDuration * 0.9);
    bassOsc.connect(bassGain);
    bassGain.connect(dryGain);
    bassOsc.start(now);
    activeNodes.push({ osc: bassOsc, gain: bassGain });
  }

  playChord();
  scheduleBeat();

  beatIntervalId = setInterval(scheduleBeat, beatDuration * 1000);
  barIntervalId = setInterval(playChord, barDuration * 1000);

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
    const cleanup = startBeatsMusic(ac);
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

  const isCinematicSlide = (slide.isOpening || slide.isClosing) && !transitioning;
  const isLastSlide = currentSlide === DEMO_SLIDES.length - 1;
  const demoFinished = isLastSlide && !isPlaying && progress >= 99;

  const contentSlideNumber = slide.isOpening ? null : slide.isClosing ? null : currentSlide;

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
        @keyframes cinematicPulse {
          0%, 100% { opacity: 0.7; }
          50% { opacity: 1; }
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
        .slide-narration-text {
          animation: fadeInScale 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          animation-delay: 0.3s;
          opacity: 0;
        }
        .slide-image-active {
          animation: kenBurns 15s ease-out forwards;
        }
        .cinematic-headline {
          animation: slideInUp 1s cubic-bezier(0.16, 1, 0.3, 1) forwards;
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

                <div className="flex items-center gap-2 flex-wrap justify-center mt-4 mb-6">
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

                <p className="slide-narration-text text-white/60 text-sm leading-relaxed max-w-2xl" data-testid="text-demo-narration">
                  {slide.narration}
                </p>

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
                      {contentSlideNumber !== null ? `${contentSlideNumber} of 8` : ""} {slide.title}
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
