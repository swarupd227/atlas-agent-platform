import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  CheckCircle2,
  FileText,
  Settings2,
  ClipboardCheck,
  Target,
  BarChart3,
  Shield,
  Activity,
  Check,
  ExternalLink,
  Bot,
  Loader2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  OUTCOME_TEMPLATES,
  useIndustry,
  type OutcomeTemplate,
  type OutcomeTemplateKpi,
} from "@/components/industry-provider";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface KpiEntry {
  name: string;
  target: number;
  unit: string;
  baseline: number;
  slaThreshold: number;
  weight: number;
}

interface OutcomeBuilderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function OutcomeBuilderDialog({ open, onOpenChange, onSuccess }: OutcomeBuilderDialogProps) {
  const { industry } = useIndustry();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [step, setStep] = useState(1);
  const [selectedTemplate, setSelectedTemplate] = useState<OutcomeTemplate | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [riskTier, setRiskTier] = useState("MEDIUM");
  const [pricingModel, setPricingModel] = useState("PER_OUTCOME_EVENT");
  const [pricePerUnit, setPricePerUnit] = useState(0);
  const [riskThreshold, setRiskThreshold] = useState(0.8);
  const [maxDriftPercent, setMaxDriftPercent] = useState(10);
  const [slaDescription, setSlaDescription] = useState("");
  const [kpis, setKpis] = useState<KpiEntry[]>([]);

  const [createdOutcomeId, setCreatedOutcomeId] = useState<string | null>(null);
  const [requestingPlan, setRequestingPlan] = useState(false);
  const [planRequested, setPlanRequested] = useState(false);

  const governancePolicies = industry?.defaultGovernancePolicies || [];

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        outcome: {
          name,
          description,
          riskTier,
          pricingModel,
          pricePerUnit,
          riskThreshold,
          maxDriftPercent,
        },
        kpis: kpis.map((k) => ({
          name: k.name,
          target: k.target,
          unit: k.unit,
          baseline: k.baseline,
          slaThreshold: k.slaThreshold,
          weight: k.weight,
        })),
        constraints: governancePolicies.map((p) => ({
          label: p.label,
          description: p.description,
        })),
      };
      const res = await apiRequest("POST", "/api/outcomes/with-kpis", payload);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/outcomes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/kpis"] });
      toast({ title: "Outcome contract created" });
      onSuccess();

      const outcomeId = data?.outcome?.id;
      if (outcomeId) {
        setCreatedOutcomeId(outcomeId);
        setStep(4);
      } else {
        resetAndClose();
      }
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create outcome", description: err.message, variant: "destructive" });
    },
  });

  async function requestAgentPlan() {
    if (!createdOutcomeId) return;
    setRequestingPlan(true);
    try {
      await apiRequest("PATCH", `/api/outcomes/${createdOutcomeId}`, {
        status: "awaiting_agent_plan",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/outcomes"] });
      setPlanRequested(true);
      toast({ title: "Agent plan requested", description: "An Agent Engineer can now generate the development plan for this outcome." });
    } catch (err: any) {
      toast({ title: "Failed to request agent plan", description: err.message, variant: "destructive" });
    } finally {
      setRequestingPlan(false);
    }
  }

  function resetAndClose() {
    setStep(1);
    setSelectedTemplate(null);
    setName("");
    setDescription("");
    setRiskTier("MEDIUM");
    setPricingModel("PER_OUTCOME_EVENT");
    setPricePerUnit(0);
    setRiskThreshold(0.8);
    setMaxDriftPercent(10);
    setSlaDescription("");
    setKpis([]);
    setCreatedOutcomeId(null);
    setRequestingPlan(false);
    setPlanRequested(false);
    onOpenChange(false);
  }

  function selectTemplate(template: OutcomeTemplate) {
    setSelectedTemplate(template);
    setName(template.name);
    setDescription(template.description);
    setRiskTier(template.riskTier);
    setPricingModel(template.pricingModel);
    setPricePerUnit(template.pricePerUnit);
    setRiskThreshold(template.riskThreshold);
    setMaxDriftPercent(template.maxDriftPercent);
    setSlaDescription(template.slaDescription);
    setKpis(
      template.kpis.map((k: OutcomeTemplateKpi) => ({
        name: k.name,
        target: k.target,
        unit: k.unit,
        baseline: k.baseline ?? 0,
        slaThreshold: k.slaThreshold ?? 0,
        weight: k.weight ?? 1,
      }))
    );
    setStep(2);
  }

  function selectBlank() {
    setSelectedTemplate(null);
    setName("");
    setDescription("");
    setRiskTier("MEDIUM");
    setPricingModel("PER_OUTCOME_EVENT");
    setPricePerUnit(0);
    setRiskThreshold(0.8);
    setMaxDriftPercent(10);
    setSlaDescription("");
    setKpis([]);
    setStep(2);
  }

  function addKpi() {
    setKpis([...kpis, { name: "", target: 0, unit: "percent", baseline: 0, slaThreshold: 0, weight: 1 }]);
  }

  function removeKpi(index: number) {
    setKpis(kpis.filter((_, i) => i !== index));
  }

  function updateKpi(index: number, field: keyof KpiEntry, value: string | number) {
    const updated = [...kpis];
    if (field === "name" || field === "unit") {
      updated[index] = { ...updated[index], [field]: value as string };
    } else {
      updated[index] = { ...updated[index], [field]: Number(value) || 0 };
    }
    setKpis(updated);
  }

  const industryTemplates = OUTCOME_TEMPLATES.filter((t) => t.industry === industry?.id);
  const otherTemplates = OUTCOME_TEMPLATES.filter((t) => t.industry !== industry?.id);

  const industryLabel = (id: string) => {
    const labels: Record<string, string> = {
      financial_services: "Financial Services",
      insurance: "Insurance",
      healthcare: "Healthcare",
      manufacturing: "Manufacturing",
      retail: "Retail",
      technology_saas: "Technology / SaaS",
      custom: "Custom",
    };
    return labels[id] || id;
  };

  const stepLabels = [
    { num: 1, label: "Template", icon: FileText },
    { num: 2, label: "Configure", icon: Settings2 },
    { num: 3, label: "Review", icon: ClipboardCheck },
    { num: 4, label: "Handoff", icon: Bot },
  ];

  const canProceedToReview = name.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetAndClose(); else onOpenChange(o); }}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto" data-testid="dialog-outcome-builder">
        <DialogHeader>
          <DialogTitle data-testid="text-wizard-title">Outcome Builder</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 mb-4 flex-wrap" data-testid="wizard-steps">
          {stepLabels.map((s, i) => (
            <div key={s.num} className="flex items-center gap-2">
              {i > 0 && <div className="w-8 border-t border-border" />}
              <div
                className={`flex items-center gap-1.5 text-sm ${
                  step === s.num
                    ? "font-medium"
                    : step > s.num
                    ? "text-muted-foreground"
                    : "text-muted-foreground/50"
                }`}
                data-testid={`step-indicator-${s.num}`}
              >
                {step > s.num ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                ) : (
                  <s.icon className="w-4 h-4" />
                )}
                <span>{s.label}</span>
              </div>
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="flex flex-col gap-4" data-testid="step-template-selection">
            <Card
              className="hover-elevate cursor-pointer"
              onClick={selectBlank}
              data-testid="card-blank-contract"
            >
              <CardContent className="flex items-center gap-3 p-4">
                <Target className="w-5 h-5 text-muted-foreground" />
                <div className="flex-1">
                  <p className="font-medium">Blank Contract</p>
                  <p className="text-sm text-muted-foreground">Start from scratch with an empty outcome contract</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </CardContent>
            </Card>

            {industryTemplates.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium text-muted-foreground" data-testid="text-industry-templates-header">
                  {industry?.label} Templates
                </p>
                {industryTemplates.map((t) => (
                  <TemplateCard key={t.id} template={t} industryLabel={industryLabel} onClick={() => selectTemplate(t)} />
                ))}
              </div>
            )}

            {otherTemplates.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium text-muted-foreground" data-testid="text-other-templates-header">
                  Other Templates
                </p>
                {otherTemplates.map((t) => (
                  <TemplateCard key={t.id} template={t} industryLabel={industryLabel} onClick={() => selectTemplate(t)} />
                ))}
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-5" data-testid="step-configure">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm font-medium">Outcome Details</p>
              </div>
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="builder-name">Name</Label>
                  <Input
                    id="builder-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Outcome name"
                    data-testid="input-builder-name"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="builder-description">Description</Label>
                  <Textarea
                    id="builder-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe the outcome..."
                    data-testid="input-builder-description"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label>Risk Tier</Label>
                    <Select value={riskTier} onValueChange={setRiskTier}>
                      <SelectTrigger data-testid="select-risk-tier">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="LOW">LOW</SelectItem>
                        <SelectItem value="MEDIUM">MEDIUM</SelectItem>
                        <SelectItem value="HIGH">HIGH</SelectItem>
                        <SelectItem value="CRITICAL">CRITICAL</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="builder-risk-threshold">Risk Threshold</Label>
                    <Input
                      id="builder-risk-threshold"
                      type="number"
                      step="0.01"
                      value={riskThreshold}
                      onChange={(e) => setRiskThreshold(Number(e.target.value) || 0)}
                      data-testid="input-risk-threshold"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="builder-max-drift">Max Drift %</Label>
                    <Input
                      id="builder-max-drift"
                      type="number"
                      value={maxDriftPercent}
                      onChange={(e) => setMaxDriftPercent(Number(e.target.value) || 0)}
                      data-testid="input-max-drift"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-muted-foreground" />
                  <p className="text-sm font-medium">KPIs</p>
                  <Badge variant="outline" className="text-xs">{kpis.length}</Badge>
                </div>
                <Button size="sm" variant="outline" onClick={addKpi} data-testid="button-add-kpi">
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add KPI
                </Button>
              </div>
              {kpis.length === 0 && (
                <p className="text-sm text-muted-foreground" data-testid="text-no-kpis">No KPIs configured yet. Add one to get started.</p>
              )}
              {kpis.map((kpi, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[1fr_80px_80px_auto] gap-2 items-end bg-muted/30 rounded-md p-2"
                  data-testid={`kpi-row-${i}`}
                >
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs text-muted-foreground">Name</Label>
                    <Input
                      value={kpi.name}
                      onChange={(e) => updateKpi(i, "name", e.target.value)}
                      placeholder="KPI name"
                      data-testid={`input-kpi-name-${i}`}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs text-muted-foreground">Target</Label>
                    <Input
                      type="number"
                      value={kpi.target}
                      onChange={(e) => updateKpi(i, "target", e.target.value)}
                      data-testid={`input-kpi-target-${i}`}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs text-muted-foreground">Unit</Label>
                    <Input
                      value={kpi.unit}
                      onChange={(e) => updateKpi(i, "unit", e.target.value)}
                      data-testid={`input-kpi-unit-${i}`}
                    />
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => removeKpi(i)}
                    data-testid={`button-remove-kpi-${i}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>

            {governancePolicies.length > 0 && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-muted-foreground" />
                  <p className="text-sm font-medium">Governance Constraints</p>
                  <Badge variant="outline" className="text-xs">{governancePolicies.length}</Badge>
                </div>
                {governancePolicies.map((p, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 bg-muted/30 rounded-md p-2"
                    data-testid={`constraint-row-${i}`}
                  >
                    <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-500 dark:text-emerald-400 shrink-0" />
                    <div className="flex flex-col gap-0.5">
                      <p className="text-sm font-medium" data-testid={`text-constraint-label-${i}`}>{p.label}</p>
                      <p className="text-xs text-muted-foreground" data-testid={`text-constraint-desc-${i}`}>{p.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm font-medium">Contract Model</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>Pricing Model</Label>
                  <Select value={pricingModel} onValueChange={setPricingModel}>
                    <SelectTrigger data-testid="select-pricing-model">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PER_OUTCOME_EVENT">Per Outcome Event</SelectItem>
                      <SelectItem value="FIXED_MONTHLY">Fixed Monthly</SelectItem>
                      <SelectItem value="TIERED">Tiered</SelectItem>
                      <SelectItem value="USAGE_BASED">Usage Based</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="builder-price">Price per Unit</Label>
                  <Input
                    id="builder-price"
                    type="number"
                    step="0.01"
                    value={pricePerUnit}
                    onChange={(e) => setPricePerUnit(Number(e.target.value) || 0)}
                    data-testid="input-price-per-unit"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="builder-sla">SLA Description</Label>
                <Input
                  id="builder-sla"
                  value={slaDescription}
                  onChange={(e) => setSlaDescription(e.target.value)}
                  placeholder="Describe the SLA terms..."
                  data-testid="input-sla-description"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep(1)} data-testid="button-back-to-templates">
                <ChevronLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              <Button onClick={() => setStep(3)} disabled={!canProceedToReview} data-testid="button-proceed-review">
                Review <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-5" data-testid="step-review">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm font-medium">Outcome Summary</p>
              </div>
              <div className="bg-muted/30 rounded-md p-3 flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="font-medium" data-testid="text-review-name">{name}</p>
                  <Badge variant="outline" data-testid="badge-review-risk-tier">{riskTier}</Badge>
                </div>
                {description && (
                  <p className="text-sm text-muted-foreground" data-testid="text-review-description">{description}</p>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm font-medium">KPIs</p>
                <Badge variant="outline" className="text-xs">{kpis.length}</Badge>
              </div>
              {kpis.length === 0 ? (
                <p className="text-sm text-muted-foreground">No KPIs configured</p>
              ) : (
                <div className="border rounded-md overflow-hidden">
                  <table className="w-full text-sm" data-testid="table-review-kpis">
                    <thead>
                      <tr className="bg-muted/30">
                        <th className="text-left p-2 font-medium">Name</th>
                        <th className="text-right p-2 font-medium">Target</th>
                        <th className="text-left p-2 font-medium">Unit</th>
                        <th className="text-right p-2 font-medium">SLA Threshold</th>
                        <th className="text-right p-2 font-medium">Weight</th>
                      </tr>
                    </thead>
                    <tbody>
                      {kpis.map((kpi, i) => (
                        <tr key={i} className="border-t" data-testid={`review-kpi-row-${i}`}>
                          <td className="p-2" data-testid={`text-review-kpi-name-${i}`}>{kpi.name}</td>
                          <td className="p-2 text-right" data-testid={`text-review-kpi-target-${i}`}>{kpi.target}</td>
                          <td className="p-2 text-muted-foreground">{kpi.unit}</td>
                          <td className="p-2 text-right text-muted-foreground">{kpi.slaThreshold}</td>
                          <td className="p-2 text-right text-muted-foreground">{kpi.weight}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {governancePolicies.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-muted-foreground" />
                  <p className="text-sm font-medium">Constraints</p>
                  <Badge variant="outline" className="text-xs">{governancePolicies.length}</Badge>
                </div>
                <div className="flex flex-col gap-1">
                  {governancePolicies.map((p, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm" data-testid={`review-constraint-${i}`}>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 shrink-0" />
                      <span>{p.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm font-medium">Contract Terms</p>
              </div>
              <div className="bg-muted/30 rounded-md p-3 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Pricing Model:</span>{" "}
                  <span data-testid="text-review-pricing-model">{pricingModel.replace(/_/g, " ")}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Price per Unit:</span>{" "}
                  <span data-testid="text-review-price">${pricePerUnit.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Risk Threshold:</span>{" "}
                  <span data-testid="text-review-risk-threshold">{riskThreshold}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Max Drift:</span>{" "}
                  <span data-testid="text-review-max-drift">{maxDriftPercent}%</span>
                </div>
                {slaDescription && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">SLA:</span>{" "}
                    <span data-testid="text-review-sla">{slaDescription}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep(2)} data-testid="button-back-to-configure">
                <ChevronLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
                data-testid="button-create-outcome-contract"
              >
                {createMutation.isPending ? "Creating..." : "Create Outcome Contract"}
              </Button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col gap-5" data-testid="step-handoff">
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/10">
                <Check className="w-6 h-6 text-emerald-500 dark:text-emerald-400" />
              </div>
              <p className="text-lg font-medium" data-testid="text-success-title">Outcome Contract Created</p>
              <p className="text-sm text-muted-foreground text-center max-w-md">
                Your outcome contract and KPIs have been saved. The next step is for an Agent Engineer
                to generate an Agent Development Plan and create the agents that will deliver your KPIs.
              </p>
            </div>

            {!planRequested ? (
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="flex items-start gap-4 p-4">
                  <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary/10 shrink-0">
                    <Bot className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex flex-col gap-2 flex-1">
                    <p className="text-sm font-medium">Request Agent Development Plan</p>
                    <p className="text-xs text-muted-foreground">
                      Flag this outcome as ready for agent planning. An Agent Engineer will be notified
                      to generate AI-driven agent proposals, configure workflows, and assign tools.
                    </p>
                    <Button
                      size="sm"
                      onClick={requestAgentPlan}
                      disabled={requestingPlan}
                      className="w-fit"
                      data-testid="button-request-agent-plan"
                    >
                      {requestingPlan ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Requesting...
                        </>
                      ) : (
                        <>
                          <Bot className="w-4 h-4 mr-1.5" /> Request Agent Plan
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-emerald-500/20 bg-emerald-500/5">
                <CardContent className="flex items-center gap-3 p-4">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 dark:text-emerald-400 shrink-0" />
                  <div className="flex flex-col gap-0.5">
                    <p className="text-sm font-medium" data-testid="text-plan-requested">Agent Plan Requested</p>
                    <p className="text-xs text-muted-foreground">
                      This outcome is now marked as awaiting agent planning. Agent Engineers can view it on the Outcomes page or the outcome detail page to generate proposals.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="flex items-center justify-center gap-3 pt-2">
              <Button variant="outline" onClick={resetAndClose} data-testid="button-close-wizard">
                Close
              </Button>
              {createdOutcomeId && (
                <Button
                  onClick={() => {
                    resetAndClose();
                    navigate(`/outcomes/${createdOutcomeId}`);
                  }}
                  data-testid="button-view-outcome"
                >
                  View Outcome <ExternalLink className="w-4 h-4 ml-1.5" />
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TemplateCard({
  template,
  industryLabel,
  onClick,
}: {
  template: OutcomeTemplate;
  industryLabel: (id: string) => string;
  onClick: () => void;
}) {
  return (
    <Card
      className="hover-elevate cursor-pointer"
      onClick={onClick}
      data-testid={`card-template-${template.id}`}
    >
      <CardContent className="flex items-start gap-3 p-4">
        <div className="flex-1 flex flex-col gap-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium" data-testid={`text-template-name-${template.id}`}>{template.name}</p>
          </div>
          <p className="text-sm text-muted-foreground line-clamp-2" data-testid={`text-template-desc-${template.id}`}>
            {template.description}
          </p>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="outline" className="text-xs" data-testid={`badge-template-industry-${template.id}`}>
              {industryLabel(template.industry)}
            </Badge>
            <Badge variant="outline" className="text-xs" data-testid={`badge-template-risk-${template.id}`}>
              {template.riskTier}
            </Badge>
            <Badge variant="outline" className="text-xs" data-testid={`badge-template-kpis-${template.id}`}>
              {template.kpis.length} KPIs
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground" data-testid={`text-template-sla-${template.id}`}>
            {template.slaDescription}
          </p>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground mt-1 shrink-0" />
      </CardContent>
    </Card>
  );
}
