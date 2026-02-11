import { useState } from "react";
import { useIndustry, INDUSTRIES, type IndustryId } from "./industry-provider";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  BookOpen,
  Cpu,
  ShieldCheck,
  FileText,
  ArrowRight,
  Check,
} from "lucide-react";

export function IndustryWorkspaceSelector() {
  const { isSelected, setIndustry } = useIndustry();
  const [selectedId, setSelectedId] = useState<IndustryId | null>(null);
  const [confirming, setConfirming] = useState(false);

  if (isSelected) return null;

  const selected = selectedId ? INDUSTRIES.find((i) => i.id === selectedId) : null;

  const handleConfirm = () => {
    if (selectedId) {
      setIndustry(selectedId);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col" data-testid="industry-workspace-selector">
      <div className="flex-1 flex flex-col items-center justify-center p-6 overflow-auto">
        <div className="max-w-5xl w-full space-y-8">
          <div className="text-center space-y-3">
            <h1 className="text-3xl font-bold tracking-tight" data-testid="text-workspace-title">
              Select Your Industry Workspace
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Choose your industry to activate pre-configured ontologies, regulatory frameworks,
              agent skills, and golden templates tailored to your domain.
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIndustry("custom")}
              className="text-muted-foreground"
              data-testid="button-skip-workspace"
            >
              Skip for now (use default workspace)
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {INDUSTRIES.map((industry) => {
              const isActive = selectedId === industry.id;
              const Icon = industry.icon;

              return (
                <Card
                  key={industry.id}
                  className={`cursor-pointer transition-all duration-200 relative ${
                    isActive
                      ? "ring-2 ring-primary shadow-md"
                      : "hover-elevate"
                  }`}
                  onClick={() => {
                    setSelectedId(industry.id);
                    setConfirming(false);
                  }}
                  data-testid={`card-industry-${industry.id}`}
                >
                  {isActive && (
                    <div className="absolute top-3 right-3">
                      <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center">
                        <Check className="h-3.5 w-3.5 text-primary-foreground" />
                      </div>
                    </div>
                  )}
                  <CardContent className="p-5 space-y-4">
                    <div className="flex items-start gap-3">
                      <div
                        className="h-10 w-10 rounded-md flex items-center justify-center shrink-0"
                        style={{ backgroundColor: industry.color + "20", color: industry.color }}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-sm leading-tight" data-testid={`text-industry-name-${industry.id}`}>
                          {industry.label}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {industry.description}
                        </p>
                      </div>
                    </div>

                    {industry.id !== "custom" ? (
                      <div className="grid grid-cols-2 gap-2">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <BookOpen className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{industry.ontology.split("(")[0].trim()}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Cpu className="h-3.5 w-3.5 shrink-0" />
                          <span>{industry.agentSkills} skills</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                          <span>{industry.regulatoryFrameworks.length} frameworks</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <FileText className="h-3.5 w-3.5 shrink-0" />
                          <span>{industry.goldenTemplates} templates</span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span>Start with a blank workspace and build your own configuration</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {selected && !confirming && (
            <div className="flex justify-center">
              <Button
                size="lg"
                onClick={() => setConfirming(true)}
                data-testid="button-continue-workspace"
              >
                Continue with {selected.shortLabel}
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          )}

          {selected && confirming && (
            <Card className="max-w-2xl mx-auto" data-testid="card-workspace-confirm">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <selected.icon className="h-5 w-5" style={{ color: selected.color }} />
                  <h3 className="font-semibold">{selected.label} Workspace</h3>
                </div>

                {selected.id !== "custom" && (
                  <>
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Ontology</p>
                      <p className="text-sm text-muted-foreground">{selected.ontology}</p>
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm font-medium">Regulatory Frameworks</p>
                      <div className="flex flex-wrap gap-1.5">
                        {selected.regulatoryFrameworks.map((fw) => (
                          <Badge key={fw} variant="secondary" className="text-xs">
                            {fw}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm font-medium">Sub-Verticals</p>
                      <div className="flex flex-wrap gap-1.5">
                        {selected.subVerticals.map((sv) => (
                          <Badge key={sv} variant="outline" className="text-xs">
                            {sv}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                <div className="flex items-center justify-between gap-3 pt-2">
                  <p className="text-xs text-muted-foreground">
                    You can switch your workspace anytime from the header bar.
                  </p>
                  <Button onClick={handleConfirm} data-testid="button-confirm-workspace">
                    Activate Workspace
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
