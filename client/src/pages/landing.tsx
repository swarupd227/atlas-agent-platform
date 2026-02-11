import { useState, lazy, Suspense } from "react";
import { Link } from "wouter";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  MessageSquare,
  Network,
  Library,
  Plug,
  ArrowRight,
  Play,
  Bot,
  Target,
  Shield,
  Zap,
  BarChart3,
  CheckCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const DemoPlayer = lazy(() => import("@/components/demo-player"));

const features = [
  {
    icon: MessageSquare,
    title: "Conversational Design",
    description: "Define agent behaviors through natural language with AI-assisted Outcome Builder.",
  },
  {
    icon: Network,
    title: "Multi-Agent Orchestration",
    description: "Coordinate teams of agents with A2A protocol and graph-based workflows.",
  },
  {
    icon: Library,
    title: "150+ Agent Templates",
    description: "Pre-built agent configurations for common enterprise use cases.",
  },
  {
    icon: Plug,
    title: "Enterprise Integrations",
    description: "MCP servers, tools, resources, and prompts with governed access controls.",
  },
];

const capabilities = [
  {
    icon: Target,
    title: "Outcome-Driven Billing",
    description: "Pay for measurable results, not compute time. Full metering pipeline with tamper-evident invoicing.",
  },
  {
    icon: Bot,
    title: "80/20 Autonomous Model",
    description: "Agents operate 80% autonomously with 20% expert validation for high-risk decisions.",
  },
  {
    icon: Shield,
    title: "Enterprise Governance",
    description: "Policy enforcement, compliance frameworks (SOC2, EU AI Act, GDPR), and immutable audit trails.",
  },
  {
    icon: Zap,
    title: "Self-Healing Loop",
    description: "Automated incident detection, AI-proposed patches, and deployment with full traceability.",
  },
  {
    icon: BarChart3,
    title: "Full Observability",
    description: "OpenTelemetry traces, MCP span waterfalls, drift detection, and real-time monitoring dashboards.",
  },
  {
    icon: CheckCircle,
    title: "Approval Gates",
    description: "Unified MCP elicitation and expert validation with risk analysis and blast radius evidence.",
  },
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
            <div className="text-sm font-semibold leading-tight" data-testid="text-brand-name">ALMP</div>
            <div className="text-xs text-muted-foreground leading-tight">Agent Lifecycle Management</div>
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
              Manage Your Agents,{" "}
              <span className="bg-gradient-to-r from-[hsl(270,80%,60%)] via-[hsl(200,85%,50%)] to-[hsl(170,70%,45%)] bg-clip-text text-transparent">
                Deliver Outcomes
              </span>
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed" data-testid="text-hero-subtitle">
              Design agents conversationally, orchestrate multi-agent teams,
              and deploy with enterprise governance — with outcome-based billing
              and self-healing built-in.
            </p>
            <div className="mt-10 flex items-center justify-center gap-4 flex-wrap">
              <Link href="/dashboard">
                <Button size="lg" className="gap-2 text-base px-8" data-testid="button-get-started">
                  Get Started <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <Button
                variant="outline"
                size="lg"
                className="gap-2 text-base px-8"
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
              Everything You Need for AI Agent Operations
            </h2>
            <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
              From design to deployment to billing — a complete lifecycle platform
              with governance and observability at every stage.
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

        <section className="border-t">
          <div className="max-w-4xl mx-auto px-6 py-20 text-center">
            <h2 className="text-3xl font-bold tracking-tight" data-testid="text-cta-heading">
              Ready to Transform Your AI Operations?
            </h2>
            <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
              Start managing your agents with enterprise-grade governance,
              outcome-based billing, and full lifecycle observability.
            </p>
            <div className="mt-8 flex items-center justify-center gap-4 flex-wrap">
              <Link href="/dashboard">
                <Button size="lg" className="gap-2 text-base px-8" data-testid="button-cta-get-started">
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
            <span>ALMP - Agent Lifecycle Management Platform</span>
          </div>
          <div>Built for enterprise AI operations</div>
        </div>
      </footer>
    </div>
  );
}
