import { useState, useMemo } from "react";
import { useIndustry, INDUSTRIES, type IndustryId, type DataClassification, type WorkspaceConfig } from "./industry-provider";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BookOpen,
  Cpu,
  ShieldCheck,
  FileText,
  ArrowRight,
  ArrowLeft,
  Check,
  Globe,
  Server,
  Lock,
} from "lucide-react";

type WizardStep = "select" | "configure" | "review";

export function IndustryWorkspaceSelector() {
  const { isSelected, setIndustry, setWorkspaceConfig } = useIndustry();
  const [selectedId, setSelectedId] = useState<IndustryId | null>(null);
  const [step, setStep] = useState<WizardStep>("select");

  const [chosenSubVerticals, setChosenSubVerticals] = useState<string[]>([]);
  const [chosenJurisdictions, setChosenJurisdictions] = useState<string[]>([]);
  const [chosenIntegrations, setChosenIntegrations] = useState<string[]>([]);
  const [dataClassDefault, setDataClassDefault] = useState<DataClassification>("internal");

  const selected = selectedId ? INDUSTRIES.find((i) => i.id === selectedId) : null;

  const integrationCategories = useMemo(() => {
    if (!selected) return {};
    const cats: Record<string, typeof selected.integrationSystems> = {};
    for (const sys of selected.integrationSystems) {
      if (!cats[sys.category]) cats[sys.category] = [];
      cats[sys.category].push(sys);
    }
    return cats;
  }, [selected]);

  if (isSelected) return null;

  const handleContinueToConfig = () => {
    if (selectedId === "custom") {
      handleActivate();
      return;
    }
    setStep("configure");
  };

  const handleContinueToReview = () => {
    setStep("review");
  };

  const handleActivate = () => {
    if (!selectedId) return;
    const config: WorkspaceConfig = {
      subVerticals: chosenSubVerticals,
      jurisdictions: chosenJurisdictions,
      integrations: chosenIntegrations,
      dataClassificationDefault: dataClassDefault,
    };
    setWorkspaceConfig(config);
    setIndustry(selectedId);
  };

  const toggleItem = (list: string[], item: string, setter: (v: string[]) => void) => {
    setter(list.includes(item) ? list.filter((i) => i !== item) : [...list, item]);
  };

  const DATA_CLASS_OPTIONS: { value: DataClassification; label: string; description: string }[] = [
    { value: "public", label: "Public", description: "No restrictions on data access" },
    { value: "internal", label: "Internal", description: "Accessible within organization" },
    { value: "confidential", label: "Confidential", description: "Limited access, business-sensitive" },
    { value: "restricted", label: "Restricted", description: "Strictest controls, regulated data" },
  ];

  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col" data-testid="industry-workspace-selector">
      <div className="flex-1 flex flex-col items-center justify-center p-6 overflow-auto">
        <div className="max-w-5xl w-full space-y-8">

          {step === "select" && (
            <>
              <div className="text-center space-y-3">
                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground mb-2">
                  <Badge variant="default" className="text-[10px]">1</Badge>
                  <span className="font-medium">Select Industry</span>
                  <ArrowRight className="h-3 w-3" />
                  <Badge variant="outline" className="text-[10px]">2</Badge>
                  <span>Configure</span>
                  <ArrowRight className="h-3 w-3" />
                  <Badge variant="outline" className="text-[10px]">3</Badge>
                  <span>Review</span>
                </div>
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
                        isActive ? "ring-2 ring-primary shadow-md" : "hover-elevate"
                      }`}
                      onClick={() => setSelectedId(industry.id)}
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

              {selected && (
                <div className="flex justify-center">
                  <Button
                    size="lg"
                    onClick={handleContinueToConfig}
                    data-testid="button-continue-workspace"
                  >
                    {selectedId === "custom" ? "Activate Custom Workspace" : `Configure ${selected.shortLabel} Workspace`}
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              )}
            </>
          )}

          {step === "configure" && selected && (
            <>
              <div className="text-center space-y-3">
                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground mb-2">
                  <Badge variant="outline" className="text-[10px]">1</Badge>
                  <span>Select Industry</span>
                  <ArrowRight className="h-3 w-3" />
                  <Badge variant="default" className="text-[10px]">2</Badge>
                  <span className="font-medium">Configure</span>
                  <ArrowRight className="h-3 w-3" />
                  <Badge variant="outline" className="text-[10px]">3</Badge>
                  <span>Review</span>
                </div>
                <h1 className="text-3xl font-bold tracking-tight" data-testid="text-configure-title">
                  Configure {selected.label} Workspace
                </h1>
                <p className="text-muted-foreground max-w-2xl mx-auto">
                  Specify your sub-vertical, applicable jurisdictions, integration landscape, and data classification defaults.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-4xl mx-auto">
                <Card data-testid="card-config-subverticals">
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-center gap-2">
                      <selected.icon className="h-4 w-4" style={{ color: selected.color }} />
                      <h3 className="font-semibold text-sm">Sub-Vertical</h3>
                    </div>
                    <p className="text-xs text-muted-foreground">Select the segments most relevant to your operations.</p>
                    <div className="flex flex-wrap gap-2">
                      {selected.subVerticals.map((sv) => {
                        const active = chosenSubVerticals.includes(sv);
                        return (
                          <Badge
                            key={sv}
                            variant={active ? "default" : "outline"}
                            className={`cursor-pointer toggle-elevate ${active ? "toggle-elevated" : ""}`}
                            onClick={() => toggleItem(chosenSubVerticals, sv, setChosenSubVerticals)}
                            data-testid={`badge-subvertical-${sv.replace(/[\s\/&]/g, "-").toLowerCase()}`}
                          >
                            {active && <Check className="h-3 w-3 mr-1" />}
                            {sv}
                          </Badge>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                <Card data-testid="card-config-jurisdictions">
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-blue-500" />
                      <h3 className="font-semibold text-sm">Jurisdictions</h3>
                    </div>
                    <p className="text-xs text-muted-foreground">Determines which regulatory frameworks are active.</p>
                    <div className="flex flex-wrap gap-2">
                      {selected.jurisdictions.map((j) => {
                        const active = chosenJurisdictions.includes(j);
                        return (
                          <Badge
                            key={j}
                            variant={active ? "default" : "outline"}
                            className={`cursor-pointer toggle-elevate ${active ? "toggle-elevated" : ""}`}
                            onClick={() => toggleItem(chosenJurisdictions, j, setChosenJurisdictions)}
                            data-testid={`badge-jurisdiction-${j.toLowerCase()}`}
                          >
                            {active && <Check className="h-3 w-3 mr-1" />}
                            {j}
                          </Badge>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                <Card data-testid="card-config-integrations">
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-center gap-2">
                      <Server className="h-4 w-4 text-orange-500" />
                      <h3 className="font-semibold text-sm">Integration Landscape</h3>
                    </div>
                    <p className="text-xs text-muted-foreground">Select the core systems your organization uses.</p>
                    <div className="space-y-3">
                      {Object.entries(integrationCategories).map(([category, systems]) => (
                        <div key={category} className="space-y-1.5">
                          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{category}</p>
                          <div className="flex flex-wrap gap-2">
                            {systems.map((sys) => {
                              const active = chosenIntegrations.includes(sys.id);
                              return (
                                <Badge
                                  key={sys.id}
                                  variant={active ? "default" : "outline"}
                                  className={`cursor-pointer toggle-elevate ${active ? "toggle-elevated" : ""}`}
                                  onClick={() => toggleItem(chosenIntegrations, sys.id, setChosenIntegrations)}
                                  data-testid={`badge-integration-${sys.id}`}
                                >
                                  {active && <Check className="h-3 w-3 mr-1" />}
                                  {sys.name}
                                </Badge>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card data-testid="card-config-data-classification">
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-center gap-2">
                      <Lock className="h-4 w-4 text-red-500" />
                      <h3 className="font-semibold text-sm">Data Classification Default</h3>
                    </div>
                    <p className="text-xs text-muted-foreground">Set the default classification for new data assets and agent outputs.</p>
                    <div className="space-y-2">
                      {DATA_CLASS_OPTIONS.map((opt) => {
                        const active = dataClassDefault === opt.value;
                        return (
                          <div
                            key={opt.value}
                            className={`flex items-center gap-3 p-2.5 rounded-md cursor-pointer transition-colors ${
                              active ? "bg-primary/10 ring-1 ring-primary/30" : "hover-elevate"
                            }`}
                            onClick={() => setDataClassDefault(opt.value)}
                            data-testid={`option-dataclass-${opt.value}`}
                          >
                            <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                              active ? "border-primary" : "border-muted-foreground/40"
                            }`}>
                              {active && <div className="h-2 w-2 rounded-full bg-primary" />}
                            </div>
                            <div>
                              <p className="text-sm font-medium">{opt.label}</p>
                              <p className="text-[11px] text-muted-foreground">{opt.description}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="flex items-center justify-center gap-3">
                <Button variant="outline" onClick={() => setStep("select")} data-testid="button-back-to-select">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
                <Button size="lg" onClick={handleContinueToReview} data-testid="button-continue-to-review">
                  Review Configuration
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </>
          )}

          {step === "review" && selected && (
            <>
              <div className="text-center space-y-3">
                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground mb-2">
                  <Badge variant="outline" className="text-[10px]">1</Badge>
                  <span>Select Industry</span>
                  <ArrowRight className="h-3 w-3" />
                  <Badge variant="outline" className="text-[10px]">2</Badge>
                  <span>Configure</span>
                  <ArrowRight className="h-3 w-3" />
                  <Badge variant="default" className="text-[10px]">3</Badge>
                  <span className="font-medium">Review</span>
                </div>
                <h1 className="text-3xl font-bold tracking-tight" data-testid="text-review-title">
                  Review Workspace Configuration
                </h1>
                <p className="text-muted-foreground max-w-2xl mx-auto">
                  Confirm your {selected.label} workspace settings. You can adjust these anytime from the header.
                </p>
              </div>

              <Card className="max-w-3xl mx-auto" data-testid="card-workspace-review">
                <CardContent className="p-6 space-y-5">
                  <div className="flex items-center gap-3 pb-3 border-b">
                    <div
                      className="h-10 w-10 rounded-md flex items-center justify-center shrink-0"
                      style={{ backgroundColor: selected.color + "20", color: selected.color }}
                    >
                      <selected.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{selected.label} Workspace</h3>
                      <p className="text-xs text-muted-foreground">{selected.ontology}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-2">
                      <p className="text-sm font-medium flex items-center gap-1.5">
                        <selected.icon className="h-3.5 w-3.5" style={{ color: selected.color }} />
                        Sub-Verticals
                      </p>
                      {chosenSubVerticals.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {chosenSubVerticals.map((sv) => (
                            <Badge key={sv} variant="secondary" className="text-xs">{sv}</Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">All sub-verticals (none selected)</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm font-medium flex items-center gap-1.5">
                        <Globe className="h-3.5 w-3.5 text-blue-500" />
                        Jurisdictions
                      </p>
                      {chosenJurisdictions.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {chosenJurisdictions.map((j) => (
                            <Badge key={j} variant="secondary" className="text-xs">{j}</Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">All jurisdictions (none selected)</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm font-medium flex items-center gap-1.5">
                        <Server className="h-3.5 w-3.5 text-orange-500" />
                        Integrations
                      </p>
                      {chosenIntegrations.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {chosenIntegrations.map((id) => {
                            const sys = selected.integrationSystems.find((s) => s.id === id);
                            return (
                              <Badge key={id} variant="secondary" className="text-xs">{sys?.name || id}</Badge>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">None selected</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm font-medium flex items-center gap-1.5">
                        <Lock className="h-3.5 w-3.5 text-red-500" />
                        Data Classification Default
                      </p>
                      <Badge variant="outline" className="text-xs capitalize">{dataClassDefault}</Badge>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 pt-3 border-t">
                    <Button variant="outline" onClick={() => setStep("configure")} data-testid="button-back-to-configure">
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Adjust
                    </Button>
                    <Button onClick={handleActivate} data-testid="button-confirm-workspace">
                      Activate Workspace
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
