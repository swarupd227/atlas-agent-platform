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
  Building2,
} from "lucide-react";

type WizardStep = "select" | "configure" | "review";

export function IndustryWorkspaceSelector() {
  const { isSelected, setIndustry, setWorkspaceConfig } = useIndustry();
  const [selectedId, setSelectedId] = useState<IndustryId | null>(null);
  const [step, setStep] = useState<WizardStep>("select");

  const [chosenSubVerticals, setChosenSubVerticals] = useState<string[]>([]);
  const [chosenDepartments, setChosenDepartments] = useState<string[]>([]);
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
      departments: chosenDepartments,
      dataClassificationDefault: dataClassDefault,
    };
    setWorkspaceConfig(config);
    setIndustry(selectedId);
  };

  const toggleItem = (list: string[], item: string, setter: (v: string[]) => void) => {
    setter(list.includes(item) ? list.filter((i) => i !== item) : [...list, item]);
  };

  const DATA_CLASS_OPTIONS: { value: DataClassification; label: string; description: string }[] = [
    { value: "public", label: "Public", description: "No restrictions" },
    { value: "internal", label: "Internal", description: "Within org" },
    { value: "confidential", label: "Confidential", description: "Business-sensitive" },
    { value: "restricted", label: "Restricted", description: "Regulated data" },
  ];

  const StepBreadcrumb = ({ current }: { current: WizardStep }) => (
    <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground mb-1">
      <Badge variant={current === "select" ? "default" : "outline"} className="text-[10px]">1</Badge>
      <span className={current === "select" ? "font-medium" : ""}>Select</span>
      <ArrowRight className="h-3 w-3" />
      <Badge variant={current === "configure" ? "default" : "outline"} className="text-[10px]">2</Badge>
      <span className={current === "configure" ? "font-medium" : ""}>Configure</span>
      <ArrowRight className="h-3 w-3" />
      <Badge variant={current === "review" ? "default" : "outline"} className="text-[10px]">3</Badge>
      <span className={current === "review" ? "font-medium" : ""}>Review</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col" data-testid="industry-workspace-selector">
      <div className="flex-1 flex flex-col items-center justify-center p-4 overflow-auto">
        <div className="max-w-5xl w-full space-y-4">

          {step === "select" && (
            <>
              <div className="text-center space-y-2">
                <StepBreadcrumb current="select" />
                <h1 className="text-2xl font-bold tracking-tight" data-testid="text-workspace-title">
                  Select Your Industry Workspace
                </h1>
                <p className="text-muted-foreground text-sm max-w-2xl mx-auto">
                  Activate pre-configured ontologies, regulatory frameworks, agent skills, and templates for your domain.
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIndustry("custom")}
                  className="text-muted-foreground"
                  data-testid="button-skip-workspace"
                >
                  Skip for now
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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
                        <div className="absolute top-2.5 right-2.5">
                          <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                            <Check className="h-3 w-3 text-primary-foreground" />
                          </div>
                        </div>
                      )}
                      <CardContent className="p-4 space-y-2.5">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="h-8 w-8 rounded-md flex items-center justify-center shrink-0"
                            style={{ backgroundColor: industry.color + "20", color: industry.color }}
                          >
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-semibold text-sm leading-tight" data-testid={`text-industry-name-${industry.id}`}>
                              {industry.label}
                            </h3>
                          </div>
                        </div>
                        {industry.id !== "custom" ? (
                          <div className="grid grid-cols-2 gap-1">
                            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <BookOpen className="h-3 w-3 shrink-0" />
                              <span className="truncate">{industry.ontology.split("(")[0].trim()}</span>
                            </div>
                            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <Cpu className="h-3 w-3 shrink-0" />
                              <span>{industry.agentSkills} skills</span>
                            </div>
                            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <ShieldCheck className="h-3 w-3 shrink-0" />
                              <span>{industry.regulatoryFrameworks.length} frameworks</span>
                            </div>
                            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <FileText className="h-3 w-3 shrink-0" />
                              <span>{industry.goldenTemplates} templates</span>
                            </div>
                          </div>
                        ) : (
                          <p className="text-[11px] text-muted-foreground">Start with a blank workspace</p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {selected && (
                <div className="flex justify-center">
                  <Button
                    onClick={handleContinueToConfig}
                    data-testid="button-continue-workspace"
                  >
                    {selectedId === "custom" ? "Activate Custom Workspace" : `Configure ${selected.shortLabel}`}
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              )}
            </>
          )}

          {step === "configure" && selected && (
            <>
              <div className="text-center space-y-0.5">
                <StepBreadcrumb current="configure" />
                <h1 className="text-xl font-bold tracking-tight" data-testid="text-configure-title">
                  Configure {selected.label}
                </h1>
                <p className="text-muted-foreground text-xs max-w-xl mx-auto">
                  Select the segments, departments, jurisdictions, and systems relevant to your organization.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 max-w-5xl mx-auto">
                <Card data-testid="card-config-subverticals">
                  <CardContent className="p-4 space-y-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-md flex items-center justify-center shrink-0" style={{ backgroundColor: selected.color + "20", color: selected.color }}>
                        <selected.icon className="h-3 w-3" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-xs">Sub-Verticals</h3>
                        <p className="text-[10px] text-muted-foreground">Select segments relevant to your operations</p>
                      </div>
                    </div>
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

                <Card data-testid="card-config-departments">
                  <CardContent className="p-4 space-y-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-md flex items-center justify-center shrink-0 bg-violet-500/15 text-violet-500">
                        <Building2 className="h-3 w-3" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-xs">Departments</h3>
                        <p className="text-[10px] text-muted-foreground">Select departments that will use AI agents</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selected.departments.map((dept) => {
                        const active = chosenDepartments.includes(dept);
                        return (
                          <Badge
                            key={dept}
                            variant={active ? "default" : "outline"}
                            className={`cursor-pointer toggle-elevate ${active ? "toggle-elevated" : ""}`}
                            onClick={() => toggleItem(chosenDepartments, dept, setChosenDepartments)}
                            data-testid={`badge-department-${dept.replace(/[\s\/&]/g, "-").toLowerCase()}`}
                          >
                            {active && <Check className="h-3 w-3 mr-1" />}
                            {dept}
                          </Badge>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                <Card data-testid="card-config-jurisdictions">
                  <CardContent className="p-4 space-y-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-md flex items-center justify-center shrink-0 bg-blue-500/15 text-blue-500">
                        <Globe className="h-3 w-3" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-xs">Jurisdictions</h3>
                        <p className="text-[10px] text-muted-foreground">Determines which regulatory frameworks apply</p>
                      </div>
                    </div>
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

                <Card data-testid="card-config-data-classification">
                  <CardContent className="p-4 space-y-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-md flex items-center justify-center shrink-0 bg-red-500/15 text-red-500">
                        <Lock className="h-3 w-3" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-xs">Data Classification</h3>
                        <p className="text-[10px] text-muted-foreground">Default for new data assets and agent outputs</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {DATA_CLASS_OPTIONS.map((opt) => {
                        const active = dataClassDefault === opt.value;
                        return (
                          <Badge
                            key={opt.value}
                            variant={active ? "default" : "outline"}
                            className={`cursor-pointer toggle-elevate ${active ? "toggle-elevated" : ""}`}
                            onClick={() => setDataClassDefault(opt.value)}
                            data-testid={`option-dataclass-${opt.value}`}
                          >
                            {active && <Check className="h-3 w-3 mr-1" />}
                            {opt.label}
                          </Badge>
                        );
                      })}
                    </div>
                    {dataClassDefault && (
                      <p className="text-[11px] text-muted-foreground">
                        {DATA_CLASS_OPTIONS.find((o) => o.value === dataClassDefault)?.description}
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card className="lg:col-span-2" data-testid="card-config-integrations">
                  <CardContent className="p-4 space-y-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-md flex items-center justify-center shrink-0 bg-orange-500/15 text-orange-500">
                        <Server className="h-3 w-3" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-xs">Integration Landscape</h3>
                        <p className="text-[10px] text-muted-foreground">Select the core systems your organization uses</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {Object.entries(integrationCategories).map(([category, systems]) => (
                        <div key={category} className="space-y-1.5">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{category}</p>
                          <div className="flex flex-wrap gap-1.5">
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
              </div>

              <div className="flex items-center justify-center gap-3">
                <Button variant="outline" onClick={() => setStep("select")} data-testid="button-back-to-select">
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
                <Button onClick={handleContinueToReview} data-testid="button-continue-to-review">
                  Review Configuration
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </>
          )}

          {step === "review" && selected && (
            <>
              <div className="text-center space-y-1">
                <StepBreadcrumb current="review" />
                <h1 className="text-2xl font-bold tracking-tight" data-testid="text-review-title">
                  Review Configuration
                </h1>
                <p className="text-muted-foreground text-sm max-w-xl mx-auto">
                  Confirm your {selected.label} workspace. Adjustable anytime from the header.
                </p>
              </div>

              <Card className="max-w-3xl mx-auto" data-testid="card-workspace-review">
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-center gap-3 pb-3 border-b">
                    <div
                      className="h-9 w-9 rounded-md flex items-center justify-center shrink-0"
                      style={{ backgroundColor: selected.color + "20", color: selected.color }}
                    >
                      <selected.icon className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm">{selected.label} Workspace</h3>
                      <p className="text-[11px] text-muted-foreground">{selected.ontology}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium flex items-center gap-1">
                        <selected.icon className="h-3 w-3" style={{ color: selected.color }} />
                        Sub-Verticals
                      </p>
                      {chosenSubVerticals.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {chosenSubVerticals.map((sv) => (
                            <Badge key={sv} variant="secondary" className="text-[10px]">{sv}</Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-muted-foreground">All</p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <p className="text-xs font-medium flex items-center gap-1">
                        <Building2 className="h-3 w-3 text-violet-500" />
                        Departments
                      </p>
                      {chosenDepartments.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {chosenDepartments.map((dept) => (
                            <Badge key={dept} variant="secondary" className="text-[10px]">{dept}</Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-muted-foreground">All</p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <p className="text-xs font-medium flex items-center gap-1">
                        <Globe className="h-3 w-3 text-blue-500" />
                        Jurisdictions
                      </p>
                      {chosenJurisdictions.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {chosenJurisdictions.map((j) => (
                            <Badge key={j} variant="secondary" className="text-[10px]">{j}</Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-muted-foreground">All</p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <p className="text-xs font-medium flex items-center gap-1">
                        <Server className="h-3 w-3 text-orange-500" />
                        Integrations
                      </p>
                      {chosenIntegrations.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {chosenIntegrations.map((id) => {
                            const sys = selected.integrationSystems.find((s) => s.id === id);
                            return (
                              <Badge key={id} variant="secondary" className="text-[10px]">{sys?.name || id}</Badge>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-[11px] text-muted-foreground">None</p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <p className="text-xs font-medium flex items-center gap-1">
                        <Lock className="h-3 w-3 text-red-500" />
                        Data Classification
                      </p>
                      <Badge variant="outline" className="text-[10px] capitalize">{dataClassDefault}</Badge>
                    </div>
                  </div>

                  {selected.defaultGovernancePolicies.length > 0 && (
                    <div className="space-y-2.5 pt-3 border-t" data-testid="section-auto-governance">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-green-500" />
                        <p className="text-xs font-semibold">Auto-Configured Governance</p>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {selected.defaultGovernancePolicies.map((policy, idx) => (
                          <div
                            key={idx}
                            className="flex items-start gap-2 py-1.5 px-2.5 rounded-md bg-muted/30"
                            data-testid={`row-governance-policy-${idx}`}
                          >
                            <Check className="h-3.5 w-3.5 mt-0.5 shrink-0 text-green-500" />
                            <div className="min-w-0">
                              <span className="text-xs font-medium">{policy.label}:</span>{" "}
                              <span className="text-xs text-muted-foreground">{policy.description}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-3 pt-3 border-t">
                    <Button variant="outline" size="sm" onClick={() => setStep("configure")} data-testid="button-back-to-configure">
                      <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                      Adjust
                    </Button>
                    <Button size="sm" onClick={handleActivate} data-testid="button-confirm-workspace">
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