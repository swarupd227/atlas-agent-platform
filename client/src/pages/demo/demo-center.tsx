import { useState, useMemo } from "react";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import {
  Building2,
  UserX,
  MapPin,
  FileText,
  Mail,
  Shield,
  Scale,
  Search,
  Play,
  ArrowRight,
  Layers,
  Clock,
  Tag,
} from "lucide-react";

interface Demo {
  id: string;
  title: string;
  client: string;
  description: string;
  industry: string;
  industryId: string;
  route: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  duration: string;
  screens: number;
  tags: string[];
}

const DEMOS: Demo[] = [
  {
    id: "blackrock-synthetic-worker",
    title: "Synthetic Worker Lifecycle",
    client: "AIM",
    description:
      "End-to-end agentic workflow for onboarding, managing, and offboarding synthetic (AI) workers within a financial services enterprise. Covers provisioning, compliance checks, and audit trails.",
    industry: "Financial Services",
    industryId: "financial_services",
    route: "/demo/blackrock",
    icon: Building2,
    iconColor: "hsl(220 70% 50%)",
    duration: "12 min",
    screens: 4,
    tags: ["Onboarding", "Compliance", "Lifecycle Management"],
  },
  {
    id: "blackrock-portal-offboarding",
    title: "Partner Portal Offboarding",
    client: "AIM",
    description:
      "Automated partner offboarding workflow including access revocation, data sanitisation, and regulatory notification. Demonstrates multi-step orchestration across IAM and compliance systems.",
    industry: "Financial Services",
    industryId: "financial_services",
    route: "/demo/blackrock2",
    icon: UserX,
    iconColor: "hsl(220 70% 50%)",
    duration: "10 min",
    screens: 4,
    tags: ["Offboarding", "Access Management", "IAM"],
  },
  {
    id: "kinective-change-of-address",
    title: "Change of Address Workflow",
    client: "XNective",
    description:
      "Intelligent address-change processing for financial accounts. Agent validates identity, cross-references fraud signals, updates downstream systems, and dispatches confirmation — all autonomously.",
    industry: "Financial Services",
    industryId: "financial_services",
    route: "/demo/kinective-coa",
    icon: MapPin,
    iconColor: "hsl(220 70% 50%)",
    duration: "8 min",
    screens: 4,
    tags: ["Customer Service", "Fraud Prevention", "Data Orchestration"],
  },
  {
    id: "moodys-credit-assessment",
    title: "Credit Assessment Package",
    client: "Moody's",
    description:
      "Automated assembly of structured credit assessment packages from raw analyst inputs. Includes data ingestion, model scoring, committee memo drafting, and regulatory submission.",
    industry: "Financial Services",
    industryId: "financial_services",
    route: "/demo/moodys",
    icon: FileText,
    iconColor: "hsl(220 70% 50%)",
    duration: "15 min",
    screens: 5,
    tags: ["Credit Rating", "Analytics", "Document Generation"],
  },
  {
    id: "hearst-nba-email",
    title: "NBA Email Orchestration",
    client: "XYZ",
    description:
      "Next Best Action engine for personalised email campaign orchestration. Analyses reader engagement signals, selects optimal content, and triggers delivery — with human review gates for brand safety.",
    industry: "Media & Entertainment",
    industryId: "media_entertainment",
    route: "/demo/hearst",
    icon: Mail,
    iconColor: "hsl(280 60% 50%)",
    duration: "10 min",
    screens: 4,
    tags: ["Marketing Automation", "Personalisation", "NBA"],
  },
  {
    id: "fitch-asset-quality",
    title: "Asset Quality Early Warning",
    client: "ABC",
    description:
      "Real-time asset quality monitoring pipeline that ingests portfolio signals, runs early-warning models, generates analyst alerts, and drafts escalation memos before conditions deteriorate.",
    industry: "Financial Services",
    industryId: "financial_services",
    route: "/demo/fitch",
    icon: Shield,
    iconColor: "hsl(220 70% 50%)",
    duration: "12 min",
    screens: 4,
    tags: ["Risk Monitoring", "Early Warning", "Portfolio Analytics"],
  },
  {
    id: "littler-compliance-engine",
    title: "Multi-State Compliance Engine",
    client: "Littler Mendelson",
    description:
      "AI-powered compliance gap analysis across 50-state employment law. Identifies jurisdiction-specific obligations, cross-references ATLAS policy rules, and produces actionable remediation plans.",
    industry: "Legal Services",
    industryId: "legal_services",
    route: "/demo/littler",
    icon: Scale,
    iconColor: "hsl(220 35% 40%)",
    duration: "14 min",
    screens: 4,
    tags: ["Employment Law", "Compliance", "Multi-Jurisdiction"],
  },
];

const INDUSTRY_FILTERS = [
  { id: "all", label: "All Industries" },
  { id: "financial_services", label: "Financial Services" },
  { id: "legal_services", label: "Legal Services" },
  { id: "media_entertainment", label: "Media & Entertainment" },
];

const industryBadgeStyle: Record<string, string> = {
  financial_services:
    "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  legal_services:
    "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  media_entertainment:
    "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800",
};

export default function DemoCenter() {
  const [search, setSearch] = useState("");
  const [industryFilter, setIndustryFilter] = useState("all");

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return DEMOS.filter((d) => {
      const matchesIndustry =
        industryFilter === "all" || d.industryId === industryFilter;
      const matchesSearch =
        !q ||
        d.title.toLowerCase().includes(q) ||
        d.client.toLowerCase().includes(q) ||
        d.description.toLowerCase().includes(q) ||
        d.tags.some((t) => t.toLowerCase().includes(q)) ||
        d.industry.toLowerCase().includes(q);
      return matchesIndustry && matchesSearch;
    });
  }, [search, industryFilter]);

  return (
    <div className="flex flex-col min-h-full">
      <div className="border-b bg-background px-6 py-5">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4">
            <div className="flex-1">
              <h1 className="text-2xl font-semibold tracking-tight" data-testid="heading-demo-center">
                Demo Center
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Interactive agentic workflow demonstrations across industries and use cases.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Layers className="w-3.5 h-3.5" />
              <span>{DEMOS.length} demos available</span>
            </div>
          </div>

          <div className="mt-4 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search demos, clients, tags…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
                data-testid="input-demo-search"
              />
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {INDUSTRY_FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setIndustryFilter(f.id)}
                  data-testid={`filter-industry-${f.id}`}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    industryFilter === f.id
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 px-6 py-6">
        <div className="max-w-5xl mx-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <Search className="w-8 h-8 text-muted-foreground mb-3 opacity-40" />
              <p className="text-sm font-medium text-muted-foreground">No demos match your search</p>
              <p className="text-xs text-muted-foreground mt-1">Try a different keyword or clear the filter</p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-3 text-xs"
                onClick={() => { setSearch(""); setIndustryFilter("all"); }}
                data-testid="button-clear-demo-filters"
              >
                Clear filters
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map((demo) => {
                const Icon = demo.icon;
                return (
                  <Card
                    key={demo.id}
                    className="flex flex-col group hover:shadow-md transition-shadow border"
                    data-testid={`card-demo-${demo.id}`}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div
                          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                          style={{ backgroundColor: `${demo.iconColor}18`, border: `1px solid ${demo.iconColor}30` }}
                        >
                          <Icon className="w-4.5 h-4.5" style={{ color: demo.iconColor }} />
                        </div>
                        <Badge
                          variant="outline"
                          className={`text-[10px] shrink-0 ${industryBadgeStyle[demo.industryId] || ""}`}
                          data-testid={`badge-demo-industry-${demo.id}`}
                        >
                          {demo.industry}
                        </Badge>
                      </div>
                      <div className="mt-2">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                          {demo.client}
                        </p>
                        <h3 className="text-sm font-semibold leading-snug mt-0.5" data-testid={`title-demo-${demo.id}`}>
                          {demo.title}
                        </h3>
                      </div>
                    </CardHeader>

                    <CardContent className="pb-3 flex-1">
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {demo.description}
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {demo.tags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground"
                          >
                            <Tag className="w-2.5 h-2.5" />
                            {tag}
                          </span>
                        ))}
                      </div>
                    </CardContent>

                    <CardFooter className="pt-0 pb-4 flex items-center justify-between">
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {demo.duration}
                        </span>
                        <span className="flex items-center gap-1">
                          <Layers className="w-3 h-3" />
                          {demo.screens} screens
                        </span>
                      </div>
                      <Link href={demo.route}>
                        <Button
                          size="sm"
                          className="h-7 px-3 text-xs gap-1.5"
                          data-testid={`button-launch-demo-${demo.id}`}
                        >
                          <Play className="w-3 h-3" />
                          Launch
                          <ArrowRight className="w-3 h-3" />
                        </Button>
                      </Link>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
