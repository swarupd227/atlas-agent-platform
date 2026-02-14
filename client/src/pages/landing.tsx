import { useState, lazy, Suspense } from "react";
import { Link } from "wouter";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  ArrowRight,
  Play,
  Bot,
  Target,
  Shield,
  Zap,
  BarChart3,
  CheckCircle,
  Brain,
  BookOpen,
  Trophy,
  Layers,
  Network,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const DemoPlayer = lazy(() => import("@/components/demo-player"));

const features = [
  {
    icon: Brain,
    title: "Industry Context Engine",
    description: "Agents reason within your industry's regulatory, operational, and domain ontology by default.",
  },
  {
    icon: SlidersHorizontal,
    title: "Adaptive Autonomy",
    description: "Dynamic oversight calibrated to industry risk, regulatory requirements, and real-time context.",
  },
  {
    icon: Trophy,
    title: "Golden Repository",
    description: "Certified templates, evaluation datasets, and pre-validated agent configurations by industry.",
  },
  {
    icon: Network,
    title: "Knowledge Graph",
    description: "Industry ontologies, entity resolution, and graph-based knowledge retrieval built in.",
  },
];

const capabilities = [
  {
    icon: Target,
    title: "Outcome-Driven Billing",
    description: "Pay for measurable results, not compute time. Full metering pipeline with tamper-evident invoicing.",
  },
  {
    icon: SlidersHorizontal,
    title: "Adaptive Autonomy Engine",
    description: "Dynamic, context-aware human oversight replacing static ratios — calibrated to industry risk and regulatory requirements in real time.",
  },
  {
    icon: Shield,
    title: "Regulatory Compliance",
    description: "Policy-as-Code with OPA Rego and Cedar, automated regulatory detection, and industry-specific compliance frameworks.",
  },
  {
    icon: Zap,
    title: "Self-Healing Operations",
    description: "Industry-aware diagnosis, AI-generated remediation with regulatory guardrails, and closed-loop autonomous recovery.",
  },
  {
    icon: BarChart3,
    title: "Industry Observability",
    description: "OpenTelemetry traces, MCP span waterfalls, industry-specific KPI monitoring, and drift detection calibrated to domain baselines.",
  },
  {
    icon: CheckCircle,
    title: "Context-Aware Approvals",
    description: "Expert validation gates with blast radius analysis, risk scoring, and approval thresholds that adapt to industry context.",
  },
];

const industryHighlights = [
  { name: "Financial Services", examples: "SOX compliance, PCI-DSS, transaction monitoring" },
  { name: "Healthcare", examples: "HIPAA enforcement, clinical decision support, PHI redaction" },
  { name: "Manufacturing", examples: "ISO 9001 quality, predictive maintenance, safety protocols" },
  { name: "Insurance", examples: "ACORD standards, claims automation, actuarial compliance" },
  { name: "Retail", examples: "PCI compliance, demand forecasting, customer data governance" },
];

export default function Landing() {
  const [showDemo, setShowDemo] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {showDemo && (
        <Suspense fallback={
          <div className="fixed inset-0 z-[9999] bg-black flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
          </div>
        }>
          <DemoPlayer onClose={() => setShowDemo(false)} />
        </Suspense>
      )}
      <header className="flex items-center justify-between gap-2 px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-md bg-primary">
            <Bot className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight" data-testid="text-brand-name">Nous</div>
            <div className="text-xs text-muted-foreground leading-tight">Agent Orchestrator</div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm" data-testid="link-login">
              Log In
            </Button>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-purple-500/5 dark:from-primary/10 dark:to-purple-500/10" />
          <div className="relative max-w-4xl mx-auto px-6 pt-20 pb-16 text-center">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-tight" data-testid="text-hero-headline">
              Your Agents,{" "}
              <span className="bg-gradient-to-r from-[hsl(270,80%,60%)] via-[hsl(200,85%,50%)] to-[hsl(170,70%,45%)] bg-clip-text text-transparent">
                Your Industry Context
              </span>
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed" data-testid="text-hero-subtitle">
              The only AI agent platform where agents reason within your industry's
              regulatory, operational, and domain context by default — with adaptive
              autonomy calibrated to real-time risk.
            </p>
            <div className="mt-10 flex items-center justify-center gap-4 flex-wrap">
              <Link href="/dashboard">
                <Button size="lg" className="gap-2" data-testid="button-get-started">
                  Get Started <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <Button
                variant="outline"
                size="lg"
                className="gap-2"
                onClick={() => setShowDemo(true)}
                data-testid="button-watch-demo"
              >
                <Play className="w-4 h-4" /> Watch Demo
              </Button>
            </div>
          </div>
        </section>

        <section className="border-t border-b bg-card/50">
          <div className="max-w-5xl mx-auto px-6 py-10">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {features.map((feature) => (
                <div key={feature.title} className="flex flex-col items-center text-center gap-3" data-testid={`feature-${feature.title.toLowerCase().replace(/\s+/g, "-")}`}>
                  <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10">
                    <feature.icon className="w-6 h-6 text-primary" />
                  </div>
                  <span className="text-sm font-medium">{feature.title}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="max-w-6xl mx-auto px-6 py-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tight" data-testid="text-capabilities-heading">
              Industry-Native Agent Operations
            </h2>
            <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
              From context engineering to adaptive autonomy to regulatory compliance —
              every layer is built around your industry's requirements.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {capabilities.map((cap) => (
              <Card key={cap.title} className="hover-elevate" data-testid={`card-capability-${cap.title.toLowerCase().replace(/\s+/g, "-")}`}>
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary/10 shrink-0">
                      <cap.icon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold mb-1">{cap.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{cap.description}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="border-t bg-card/30">
          <div className="max-w-5xl mx-auto px-6 py-16">
            <div className="text-center mb-10">
              <h2 className="text-2xl font-bold tracking-tight" data-testid="text-industries-heading">
                Built for Regulated Industries
              </h2>
              <p className="mt-2 text-sm text-muted-foreground max-w-xl mx-auto">
                Pre-loaded with industry ontologies, regulatory frameworks, and domain-specific guardrails.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {industryHighlights.map((ind) => (
                <Card key={ind.name} data-testid={`card-industry-${ind.name.toLowerCase().replace(/\s+/g, "-")}`}>
                  <CardContent className="p-4 flex flex-col gap-1.5">
                    <span className="text-sm font-medium">{ind.name}</span>
                    <span className="text-xs text-muted-foreground leading-relaxed">{ind.examples}</span>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t">
          <div className="max-w-4xl mx-auto px-6 py-20 text-center">
            <h2 className="text-3xl font-bold tracking-tight" data-testid="text-cta-heading">
              Ready to Deploy Agents That Understand Your Industry?
            </h2>
            <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
              Start with your industry's regulatory context, ontology, and compliance
              frameworks already built in — not bolted on.
            </p>
            <div className="mt-8 flex items-center justify-center gap-4 flex-wrap">
              <Link href="/dashboard">
                <Button size="lg" className="gap-2" data-testid="button-cta-get-started">
                  Get Started <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="max-w-6xl mx-auto px-6 py-8 flex items-center justify-between gap-4 flex-wrap text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4" />
            <span>Nous Agent Orchestrator</span>
          </div>
          <div>Industry-native AI agent operations</div>
        </div>
      </footer>
    </div>
  );
}
