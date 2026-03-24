import { useState, useEffect, useRef, useCallback, type ComponentType, type FormEvent } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Clock,
  CheckCircle2,
  Loader2,
  ExternalLink,
  ArrowRight,
  XCircle,
  AlertTriangle,
  Undo2,
  FileText,
  MapPin,
  Building2,
  Shield,
  Bell,
  Play,
  User,
  Settings,
  Send,
  Webhook,
  Zap,
  Terminal,
  Cpu,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { KINECTIVE_AGENT, KINECTIVE_MCP_SERVERS, KINECTIVE_SKILLS, KINECTIVE_CONFIG } from "./kinective-constants";

type Scenario = "happy" | "invalid_address" | "system_failure";

interface AuditEntry {
  id: number;
  timestamp: string;
  action: string;
  system: string;
  details: string;
}

interface SystemUpdate {
  system: string;
  status: "success" | "failed" | "rolled_back" | "pending" | "skipped";
  confirmationId: string | null;
  error: string | null;
  rolledBackAt: string | null;
}

const POLL_INTERVAL = 3000;

const SCENARIO_LABELS: Record<Scenario, { label: string; description: string; color: string }> = {
  happy: {
    label: "Happy Path",
    description: "All 11 systems updated successfully",
    color: "bg-green-500/20 text-green-400 border-green-500/30",
  },
  invalid_address: {
    label: "Invalid Address",
    description: "USPS validation fails → human review",
    color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  },
  system_failure: {
    label: "System Failure + Rollback",
    description: "Card timeout → automated rollback",
    color: "bg-red-500/20 text-red-400 border-red-500/30",
  },
};

const SYSTEM_COLORS: Record<string, string> = {
  SignPlus: "bg-indigo-600",
  USPS: "bg-blue-600",
  "Kinective Gateway": "bg-emerald-600",
  "Digital Banking": "bg-cyan-600",
  "Statement Vendor": "bg-teal-600",
  "Card Management": "bg-orange-600",
  "Loan Origination": "bg-amber-600",
  CRM: "bg-violet-600",
  "Bill Pay": "bg-sky-600",
  "Fraud Detection": "bg-rose-600",
  Compliance: "bg-purple-600",
  ATLAS: "bg-orange-500",
};

const SCENARIO_PREFILL: Record<Scenario, { street: string; city: string; state: string; zip: string }> = {
  happy: { street: "1847 Lakewood Drive", city: "Austin", state: "TX", zip: "78701" },
  invalid_address: { street: "1847 Lakewod Drve", city: "Austin", state: "TX", zip: "" },
  system_failure: { street: "1847 Lakewood Drive", city: "Austin", state: "TX", zip: "78701" },
};

// ── Trigger Sequence Step ──────────────────────────────────────────────────
interface TriggerStep {
  label: string;
  detail: string;
  icon: ComponentType<{ className?: string }>;
  delayMs: number;
}

const TRIGGER_STEPS: TriggerStep[] = [
  { label: "Member submits via Alkami portal", detail: "Digital banking address form submitted", icon: User, delayMs: 0 },
  { label: "SignPlus generates & e-signs COA form", detail: "Form COA-2026-00412 auto-signed", icon: FileText, delayMs: 800 },
  { label: "Webhook fired to ATLAS", detail: "POST /webhooks/coa-submitted → 200 OK", icon: Webhook, delayMs: 1600 },
  { label: "Change of Address Agent started", detail: "Processing 11 downstream systems…", icon: Zap, delayMs: 2400 },
];

function TriggerSequence({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(-1);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const firedRef = useRef(false);

  useEffect(() => {
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    TRIGGER_STEPS.forEach((s, i) => {
      timeouts.push(setTimeout(() => {
        setStep(i);
        if (i === TRIGGER_STEPS.length - 1) {
          timeouts.push(setTimeout(() => {
            if (!firedRef.current) {
              firedRef.current = true;
              onCompleteRef.current();
            }
          }, 800));
        }
      }, s.delayMs + 400));
    });
    return () => timeouts.forEach(clearTimeout);
  }, []);

  return (
    <div className="mt-4 space-y-2" data-testid="trigger-sequence">
      {TRIGGER_STEPS.map((s, i) => {
        const Icon = s.icon;
        const done = step >= i;
        const active = step === i;
        return (
          <div
            key={i}
            className={`flex items-center gap-3 py-2 px-3 rounded-lg border transition-all duration-500 ${
              done
                ? i < TRIGGER_STEPS.length - 1
                  ? "bg-green-500/10 border-green-500/30"
                  : "bg-orange-500/10 border-orange-500/30"
                : "bg-zinc-800/40 border-zinc-700/50 opacity-40"
            }`}
          >
            <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
              done
                ? i < TRIGGER_STEPS.length - 1
                  ? "bg-green-500/20 text-green-400"
                  : "bg-orange-500/20 text-orange-400"
                : "bg-zinc-700 text-zinc-500"
            }`}>
              {active && i === TRIGGER_STEPS.length - 1 ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : done ? (
                i < TRIGGER_STEPS.length - 1 ? (
                  <CheckCircle2 className="w-3 h-3" />
                ) : (
                  <Icon className="w-3 h-3" />
                )
              ) : (
                <Icon className="w-3 h-3" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className={`text-xs font-medium ${done ? (i < TRIGGER_STEPS.length - 1 ? "text-zinc-200" : "text-orange-300") : "text-zinc-500"}`}>
                {s.label}
              </div>
              {done && (
                <div className={`text-[10px] font-mono ${i < TRIGGER_STEPS.length - 1 ? "text-green-500/70" : "text-orange-500/70"}`}>
                  {s.detail}
                </div>
              )}
            </div>
            <div className="text-[10px] font-mono shrink-0">
              {done ? (
                <Badge variant="outline" className={`${i < TRIGGER_STEPS.length - 1 ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-orange-500/20 text-orange-400 border-orange-500/30"} text-[9px]`}>
                  {i < TRIGGER_STEPS.length - 1 ? "✓" : "→"}
                </Badge>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Member Card + Change Address Dialog ────────────────────────────────────
function MemberCard({
  scenario,
  running,
  onTriggerComplete,
}: {
  scenario: Scenario;
  running: boolean;
  onTriggerComplete: () => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showTrigger, setShowTrigger] = useState(false);
  const prefill = SCENARIO_PREFILL[scenario];
  const [form, setForm] = useState(prefill);
  const { toast } = useToast();

  useEffect(() => {
    setForm(SCENARIO_PREFILL[scenario]);
  }, [scenario]);

  const submitCoa = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/demo-api/kinective/submit-coa", { scenario });
      return res.json();
    },
    onSuccess: () => {
      onTriggerComplete();
      setShowTrigger(true);
    },
    onError: (err: any) => {
      if (err?.message?.startsWith("409")) {
        onTriggerComplete();
        setShowTrigger(true);
        return;
      }
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setDialogOpen(false);
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    submitCoa.mutate();
  };

  const handleTriggerComplete = useCallback(() => {
    setDialogOpen(false);
    setShowTrigger(false);
  }, []);

  return (
    <>
      <Card className="bg-zinc-900 border-zinc-800" data-testid="member-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <User className="w-4 h-4 text-cyan-400" />
            Member Profile
            <Badge variant="outline" className="ml-auto bg-cyan-500/20 text-cyan-400 border-cyan-500/30 text-[10px]">
              Alkami Digital Banking
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-emerald-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
              SM
            </div>
            <div>
              <div className="text-sm font-semibold text-zinc-100">Sarah Mitchell</div>
              <div className="text-xs text-zinc-500 font-mono">MBR-2026-84291</div>
            </div>
            <Badge variant="outline" className="ml-auto text-[10px] bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
              Active Member
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs border-t border-zinc-800 pt-3">
            <div>
              <span className="text-zinc-500">Member Since:</span>
              <div className="text-zinc-300">March 2018</div>
            </div>
            <div>
              <span className="text-zinc-500">Account Type:</span>
              <div className="text-zinc-300">Regular Shares + Auto Loan</div>
            </div>
            <div className="col-span-2">
              <span className="text-zinc-500">Current Address:</span>
              <div className="text-zinc-300">420 Elm St, Springfield, IL 62701</div>
            </div>
          </div>

          <Button
            className="w-full bg-cyan-600 hover:bg-cyan-700 text-white text-sm"
            onClick={() => setDialogOpen(true)}
            disabled={running}
            data-testid="change-address-button"
          >
            <MapPin className="w-4 h-4 mr-2" />
            Change Address
          </Button>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!showTrigger && !submitCoa.isPending) setDialogOpen(open); }}>
        <DialogContent className="bg-zinc-900 border-zinc-700 text-white max-w-md" data-testid="coa-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-cyan-400" />
              Change of Address
            </DialogTitle>
            <DialogDescription className="text-zinc-400 text-xs">
              Sarah Mitchell · MBR-2026-84291 · Alkami Digital Banking
            </DialogDescription>
          </DialogHeader>

          {!showTrigger ? (
            <form onSubmit={handleSubmit} className="space-y-4" data-testid="coa-form">
              <div className="bg-zinc-800/50 rounded-lg p-3 text-xs text-zinc-400 border border-zinc-700">
                <span className="text-zinc-500">Current address:</span>{" "}
                <span className="text-zinc-300">420 Elm St, Springfield, IL 62701</span>
              </div>

              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-zinc-400">Street Address</Label>
                  <Input
                    value={form.street}
                    onChange={(e) => setForm({ ...form, street: e.target.value })}
                    className="bg-zinc-800 border-zinc-700 text-zinc-100 text-sm mt-1"
                    placeholder="Street address"
                    data-testid="input-street"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-1">
                    <Label className="text-xs text-zinc-400">City</Label>
                    <Input
                      value={form.city}
                      onChange={(e) => setForm({ ...form, city: e.target.value })}
                      className="bg-zinc-800 border-zinc-700 text-zinc-100 text-sm mt-1"
                      placeholder="City"
                      data-testid="input-city"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-zinc-400">State</Label>
                    <Input
                      value={form.state}
                      onChange={(e) => setForm({ ...form, state: e.target.value })}
                      className="bg-zinc-800 border-zinc-700 text-zinc-100 text-sm mt-1"
                      placeholder="ST"
                      maxLength={2}
                      data-testid="input-state"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-zinc-400">ZIP</Label>
                    <Input
                      value={form.zip}
                      onChange={(e) => setForm({ ...form, zip: e.target.value })}
                      className="bg-zinc-800 border-zinc-700 text-zinc-100 text-sm mt-1"
                      placeholder="ZIP"
                      data-testid="input-zip"
                    />
                  </div>
                </div>
              </div>

              {scenario === "invalid_address" && (
                <div className="flex items-start gap-2 text-xs bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0 mt-0.5" />
                  <span className="text-yellow-400">Address contains errors — USPS validation will fail and route to human review.</span>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                  onClick={() => setDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1 bg-cyan-600 hover:bg-cyan-700 text-white"
                  disabled={submitCoa.isPending}
                  data-testid="submit-coa-button"
                >
                  {submitCoa.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Send className="w-4 h-4 mr-2" />
                  )}
                  Submit Change
                </Button>
              </div>
            </form>
          ) : (
            <div data-testid="trigger-sequence-container">
              <div className="text-xs text-zinc-400 mb-1">Initiating COA pipeline…</div>
              <TriggerSequence onComplete={handleTriggerComplete} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── System Configuration Panel ─────────────────────────────────────────────
const ALL_SYSTEMS = [
  "Kinective Gateway (Core Banking)",
  "Digital Banking (Alkami)",
  "Statement Vendor (Doxim)",
  "Card Management (PSCU)",
  "Loan Origination",
  "CRM (Salesforce)",
  "Bill Pay",
  "Fraud Detection",
  "BSA/AML Compliance",
  "SignPlus Archive",
  "Member Notification",
];

const SYSTEM_TOOLS_MAP: Record<string, string[]> = {
  "Kinective Gateway (Core Banking)": ["update_member_address", "get_member_profile"],
  "Digital Banking (Alkami)": ["update_digital_address", "notify_digital_banking"],
  "Statement Vendor (Doxim)": ["update_statement_address"],
  "Card Management (PSCU)": ["update_card_address"],
  "Loan Origination": ["update_loan_address"],
  "CRM (Salesforce)": ["update_crm_contact", "create_interaction_record"],
  "Bill Pay": ["update_bill_pay_address"],
  "Fraud Detection": ["flag_address_change"],
  "BSA/AML Compliance": ["log_bsa_event", "create_compliance_record"],
  "SignPlus Archive": ["archive_signed_document"],
  "Member Notification": ["notify_digital_banking"],
};

function SystemConfigPanel() {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const configQuery = useQuery<{ enabledSystems: string[]; allSystems: string[] }>({
    queryKey: ["/demo-api/kinective/config"],
  });

  const enabledSystems = configQuery.data?.enabledSystems ?? ALL_SYSTEMS;
  const enabledCount = enabledSystems.length;

  const configMutation = useMutation({
    mutationFn: async (systems: string[]) => {
      const res = await apiRequest("POST", "/demo-api/kinective/config", { enabledSystems: systems });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/demo-api/kinective/config"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update system config", variant: "destructive" });
    },
  });

  const toggle = (system: string) => {
    const current = enabledSystems;
    const next = current.includes(system)
      ? current.filter((s) => s !== system)
      : [...current, system];
    configMutation.mutate(next);
  };

  const enableAll = () => configMutation.mutate([...ALL_SYSTEMS]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="bg-zinc-900 border-zinc-800" data-testid="system-config-panel">
        <CollapsibleTrigger className="w-full text-left">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              {open ? (
                <ChevronDown className="w-4 h-4 text-zinc-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-zinc-400" />
              )}
              <Settings className="w-3.5 h-3.5 text-zinc-400" />
              System Configuration
              <Badge
                variant="outline"
                className={`ml-auto text-[10px] ${
                  enabledCount === ALL_SYSTEMS.length
                    ? "bg-green-500/20 text-green-400 border-green-500/30"
                    : "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                }`}
                data-testid="enabled-count-badge"
              >
                {enabledCount} of {ALL_SYSTEMS.length} enabled
              </Badge>
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-1">
            <div className="text-[10px] text-zinc-500 mb-3">
              Toggle systems to include or exclude them from the next pipeline run. Disabled systems will be marked as "skipped".
            </div>
            {ALL_SYSTEMS.map((system) => {
              const enabled = enabledSystems.includes(system);
              const tools = SYSTEM_TOOLS_MAP[system] || [];
              return (
                <div
                  key={system}
                  className={`flex items-center gap-3 py-2 px-2 rounded-lg border transition-colors ${
                    enabled
                      ? "bg-zinc-800/30 border-zinc-700/50"
                      : "bg-zinc-900/50 border-zinc-800/50 opacity-60"
                  }`}
                  data-testid={`system-config-row-${system.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`}
                >
                  <Switch
                    checked={enabled}
                    onCheckedChange={() => toggle(system)}
                    className="data-[state=checked]:bg-emerald-600 shrink-0"
                    data-testid={`system-toggle-${system.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs font-medium ${enabled ? "text-zinc-200" : "text-zinc-500"}`}>
                      {system}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {tools.map((t) => (
                        <span
                          key={t}
                          className={`text-[9px] font-mono px-1 rounded ${
                            enabled ? "bg-zinc-700 text-zinc-400" : "bg-zinc-800 text-zinc-600"
                          }`}
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                  {!enabled && (
                    <Badge variant="outline" className="text-[9px] bg-zinc-800 text-zinc-500 border-zinc-700 shrink-0">
                      skipped
                    </Badge>
                  )}
                </div>
              );
            })}

            {enabledCount < ALL_SYSTEMS.length && (
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-2 border-zinc-700 text-zinc-400 hover:bg-zinc-800 text-xs"
                onClick={enableAll}
                data-testid="enable-all-button"
              >
                Enable All Systems
              </Button>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}


function SignedFormPanel({ scenario, hasRun }: { scenario: Scenario; hasRun: boolean }) {
  const formData = scenario === "invalid_address"
    ? {
        form_id: "COA-2026-00412",
        member: "Sarah Mitchell",
        dob: "1982-04-15",
        old: "420 Elm St, Springfield, IL 62701",
        new_addr: "1847 Lakewod Drve, Austin TX",
        status: "SIGNED",
        note: "Typo in street name, missing ZIP code",
      }
    : {
        form_id: "COA-2026-00412",
        member: "Sarah Mitchell",
        dob: "1982-04-15",
        old: "420 Elm St, Springfield, IL 62701",
        new_addr: "1847 Lakewood Drive, Austin, TX 78701",
        status: "SIGNED",
        note: null,
      };

  return (
    <Card className="bg-zinc-900 border-zinc-800" data-testid="signed-form-panel">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <FileText className="w-4 h-4 text-indigo-400" />
          SignPlus — Signed COA Form
          {hasRun ? (
            <Badge variant="outline" className="ml-auto bg-green-500/20 text-green-400 border-green-500/30 text-[10px]">
              {formData.status} ✓
            </Badge>
          ) : (
            <Badge variant="outline" className="ml-auto bg-zinc-700/40 text-zinc-500 border-zinc-700 text-[10px]">
              AWAITING SUBMISSION
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        {!hasRun ? (
          <div className="py-4 text-center text-zinc-500">
            <FileText className="w-6 h-6 mx-auto mb-2 opacity-30" />
            <div>Submit a Change of Address via the member card above to begin.</div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-zinc-500">Form ID:</span>{" "}
                <span className="text-zinc-200 font-mono">{formData.form_id}</span>
              </div>
              <div>
                <span className="text-zinc-500">Member:</span>{" "}
                <span className="text-zinc-200">{formData.member}</span>
              </div>
              <div>
                <span className="text-zinc-500">DOB:</span>{" "}
                <span className="text-zinc-200">{formData.dob}</span>
              </div>
              <div>
                <span className="text-zinc-500">Member ID:</span>{" "}
                <span className="text-zinc-200 font-mono">MBR-2026-84291</span>
              </div>
            </div>
            <div className="border-t border-zinc-800 pt-2">
              <div className="mb-1">
                <span className="text-zinc-500">Old Address:</span>{" "}
                <span className="text-zinc-400">{formData.old}</span>
              </div>
              <div>
                <span className="text-zinc-500">New Address:</span>{" "}
                <span className={formData.note ? "text-yellow-400" : "text-zinc-200"}>{formData.new_addr}</span>
              </div>
              {formData.note && (
                <div className="mt-1 text-yellow-500/80 text-[10px] flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> {formData.note}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ValidationPanel({ scenario, hasRun }: { scenario: Scenario; hasRun: boolean }) {
  if (!hasRun) {
    return (
      <Card className="bg-zinc-900 border-zinc-800" data-testid="validation-panel">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <MapPin className="w-4 h-4 text-zinc-500" />
            USPS Address Validation
            <Badge variant="outline" className="ml-auto bg-zinc-700/40 text-zinc-500 border-zinc-700 text-[10px]">
              PENDING
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs">
          <div className="py-3 text-center text-zinc-600">
            <MapPin className="w-6 h-6 mx-auto mb-2 opacity-20" />
            <div>Waiting for address submission…</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (scenario === "invalid_address") {
    return (
      <Card className="bg-zinc-900 border-yellow-500/30" data-testid="validation-panel">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <MapPin className="w-4 h-4 text-yellow-400" />
            USPS Address Validation
            <Badge variant="outline" className="ml-auto bg-red-500/20 text-red-400 border-red-500/30 text-[10px]">
              NOT FOUND
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs space-y-2">
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-400">
            <div className="font-semibold mb-1">Address could not be verified</div>
            <div className="text-red-400/80">
              Street name "Lakewod Drve" could not be matched. Missing ZIP code. Routed to human review queue.
            </div>
          </div>
          <div className="text-zinc-500">No downstream system updates will be performed.</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-zinc-900 border-zinc-800" data-testid="validation-panel">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <MapPin className="w-4 h-4 text-blue-400" />
          USPS Address Validation
          <Badge variant="outline" className="ml-auto bg-green-500/20 text-green-400 border-green-500/30 text-[10px]">
            VERIFIED ✓
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="text-xs space-y-2">
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-green-400">
          <div className="font-semibold mb-1">Address Standardized</div>
          <div className="font-mono">1847 LAKEWOOD DR, AUSTIN TX 78701-3847</div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-zinc-400">
          <div><span className="text-zinc-500">ZIP+4:</span> 78701-3847</div>
          <div><span className="text-zinc-500">Deliverable:</span> Yes</div>
        </div>
      </CardContent>
    </Card>
  );
}

function SystemUpdatesPanel({ scenario, updates, running }: { scenario: Scenario; updates: SystemUpdate[]; running: boolean }) {
  const statusIcon = (s: SystemUpdate["status"], idx: number) => {
    if (s === "pending" && running) {
      return <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" style={{ animationDelay: `${idx * 120}ms` }} />;
    }
    switch (s) {
      case "success": return <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />;
      case "failed": return <XCircle className="w-3.5 h-3.5 text-red-400" />;
      case "rolled_back": return <Undo2 className="w-3.5 h-3.5 text-yellow-400" />;
      case "skipped": return <AlertTriangle className="w-3.5 h-3.5 text-zinc-500" />;
      default: return <Clock className="w-3.5 h-3.5 text-zinc-500" />;
    }
  };

  const statusBadge = (s: SystemUpdate["status"], idx: number) => {
    if (s === "pending" && running) {
      return (
        <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30 text-[10px] animate-pulse" style={{ animationDelay: `${idx * 120}ms` }}>
          PROCESSING…
        </Badge>
      );
    }
    const colors: Record<string, string> = {
      success: "bg-green-500/20 text-green-400 border-green-500/30",
      failed: "bg-red-500/20 text-red-400 border-red-500/30",
      rolled_back: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
      skipped: "bg-zinc-500/20 text-zinc-500 border-zinc-500/30",
      pending: "bg-zinc-500/20 text-zinc-500 border-zinc-500/30",
    };
    const labels: Record<string, string> = {
      success: "UPDATED ✓",
      failed: "FAILED ✗",
      rolled_back: "ROLLED BACK ↩",
      skipped: "SKIPPED",
      pending: "PENDING",
    };
    return (
      <Badge variant="outline" className={`${colors[s]} text-[10px]`}>
        {labels[s]}
      </Badge>
    );
  };

  const successCount = updates.filter((u) => u.status === "success").length;
  const total = updates.length;
  const allPending = updates.every((u) => u.status === "pending");

  return (
    <Card className="bg-zinc-900 border-zinc-800" data-testid="system-updates-panel">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Building2 className="w-4 h-4 text-emerald-400" />
          System Updates
          {running && (
            <Badge variant="outline" className="ml-auto bg-blue-500/10 text-blue-400 border-blue-500/30 text-[10px] animate-pulse">
              AGENT RUNNING…
            </Badge>
          )}
          {!running && scenario === "happy" && successCount === total && !allPending && (
            <Badge variant="outline" className="ml-auto bg-green-500/20 text-green-400 border-green-500/30 text-[10px]">
              {successCount}/{total} COMPLETE
            </Badge>
          )}
          {!running && scenario === "happy" && successCount < total && !allPending && (
            <Badge variant="outline" className="ml-auto bg-zinc-500/20 text-zinc-400 border-zinc-500/30 text-[10px]">
              {successCount}/{total} updated
            </Badge>
          )}
          {!running && scenario === "invalid_address" && !allPending && (
            <Badge variant="outline" className="ml-auto bg-zinc-500/20 text-zinc-500 border-zinc-500/30 text-[10px]">
              BLOCKED — USPS GATE
            </Badge>
          )}
          {!running && scenario === "system_failure" && !allPending && (
            <Badge variant="outline" className="ml-auto bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px]">
              FULL ROLLBACK
            </Badge>
          )}
          {!running && allPending && (
            <Badge variant="outline" className="ml-auto bg-zinc-700/40 text-zinc-500 border-zinc-700 text-[10px]">
              AWAITING RUN
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {updates.map((u, i) => (
            <div
              key={i}
              className={`flex items-center justify-between py-1.5 px-2 rounded text-xs hover:bg-zinc-800/50 transition-colors ${
                u.status === "pending" && running ? "bg-blue-500/5" : ""
              }`}
              data-testid={`system-update-${i}`}
            >
              <div className="flex items-center gap-2">
                {statusIcon(u.status, i)}
                <span className={u.status === "pending" && running ? "text-blue-300/80" : "text-zinc-300"}>{u.system}</span>
              </div>
              <div className="flex items-center gap-2">
                {u.confirmationId && (
                  <span className="text-zinc-500 font-mono text-[10px]">{u.confirmationId}</span>
                )}
                {u.error && (
                  <span className="text-red-400/70 text-[10px] max-w-[200px] truncate">{u.error}</span>
                )}
                {statusBadge(u.status, i)}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function RollbackPanel({ entries, scenario }: { entries: { system: string; status: string; rolledBackAt: string }[]; scenario: Scenario }) {
  if (scenario === "invalid_address") {
    return (
      <Card className="bg-zinc-900 border-zinc-800" data-testid="rollback-panel">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Undo2 className="w-4 h-4 text-zinc-500" />
            Rollback Log
            <Badge variant="outline" className="ml-auto bg-zinc-700/30 text-zinc-400 border-zinc-600 text-[10px]">
              NO ROLLBACK NEEDED
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 py-2 px-3 rounded bg-yellow-500/5 border border-yellow-500/20">
            <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0" />
            <div className="text-xs">
              <span className="text-yellow-400 font-semibold">Routed to Human Review</span>
              <span className="text-zinc-400 ml-2">No systems were modified — address validation failed before propagation.</span>
            </div>
            <Badge variant="outline" className="ml-auto bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px] shrink-0">
              COA-REVIEW-00412
            </Badge>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (entries.length === 0) return null;

  return (
    <Card className="bg-zinc-900 border-yellow-500/20" data-testid="rollback-panel">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Undo2 className="w-4 h-4 text-yellow-400" />
          Rollback Log
          <Badge variant="outline" className="ml-auto bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px]">
            {entries.length} ROLLED BACK
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {entries.map((e, i) => (
            <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded text-xs bg-yellow-500/5">
              <div className="flex items-center gap-2">
                <Undo2 className="w-3 h-3 text-yellow-400" />
                <span className="text-zinc-300">{e.system}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-zinc-500 text-[10px]">
                  {new Date(e.rolledBackAt).toLocaleTimeString()}
                </span>
                <Badge variant="outline" className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px]">
                  RESTORED ✓
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function NotificationPanel({ scenario, hasRun }: { scenario: Scenario; hasRun: boolean }) {
  const notifications: Record<Scenario, { type: string; message: string; color: string }[]> = {
    happy: [
      { type: "Member Email", message: "Address change confirmation sent to sarah.mitchell@email.com", color: "text-green-400" },
      { type: "Member SMS", message: "SMS confirmation sent to (217) 555-0148", color: "text-green-400" },
      { type: "Ops Log", message: "COA-2026-00412 completed. All 11 systems updated.", color: "text-blue-400" },
    ],
    invalid_address: [
      { type: "Ops Alert", message: "COA-2026-00412: USPS validation failed. Manual review required.", color: "text-yellow-400" },
      { type: "Member Callback", message: "Callback link sent: Please verify your new address", color: "text-yellow-400" },
      { type: "Review Ticket", message: "Ticket #TKT-84291 opened in ops queue", color: "text-orange-400" },
    ],
    system_failure: [
      { type: "Member Notice", message: "Address change request could not be completed. All updates have been reverted — your account remains unchanged.", color: "text-yellow-400" },
      { type: "Retry Scheduled", message: "COA-2026-00412 queued for retry at next maintenance window (02:00 UTC)", color: "text-orange-400" },
      { type: "Ops Ticket", message: "Ticket #TKT-84292: PSCU timeout. Full rollback executed — all systems restored to prior state.", color: "text-red-400" },
    ],
  };

  return (
    <Card className="bg-zinc-900 border-zinc-800" data-testid="notification-panel">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Bell className="w-4 h-4 text-sky-400" />
          Notifications
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!hasRun ? (
          <div className="py-3 text-center text-zinc-600 text-xs">
            <Bell className="w-6 h-6 mx-auto mb-2 opacity-20" />
            <div>No notifications yet.</div>
          </div>
        ) : (
          <div className="space-y-1.5">
            {notifications[scenario].map((n, i) => (
              <div key={i} className="flex items-start gap-2 text-xs py-1">
                <Badge variant="outline" className="text-[10px] bg-zinc-800 border-zinc-700 text-zinc-400 shrink-0">
                  {n.type}
                </Badge>
                <span className={n.color}>{n.message}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface KinectiveLogEntry {
  id: number;
  time: string;
  type: "run_start" | "setup" | "agent_start" | "tool_call_start" | "tool_call_result" | "run_complete" | "error";
  message: string;
  tool?: string;
  system?: string;
  success?: boolean;
}

function KinectiveLogFeed({ entries, running, complete }: { entries: KinectiveLogEntry[]; running: boolean; complete: boolean }) {
  const feedRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [entries]);

  return (
    <Card className="bg-zinc-900 border-zinc-800 flex flex-col" style={{ minHeight: 320 }} data-testid="kinective-log-feed">
      <CardHeader className="pb-3 shrink-0">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Terminal className="w-4 h-4 text-cyan-400" />
          Live Agent Trace
          {running && (
            <Badge variant="outline" className="ml-auto bg-cyan-500/10 text-cyan-400 border-cyan-500/30 text-[10px] animate-pulse">
              AI RUNNING
            </Badge>
          )}
          {!running && entries.length > 0 && (
            <Badge variant="outline" className="ml-auto bg-zinc-800 border-zinc-700 text-zinc-400 text-[10px]">
              {entries.filter(e => e.type === "tool_call_result").length} tool calls
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0 pb-4">
        {entries.length === 0 && !running && !complete && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-6">
            <Terminal className="w-6 h-6 text-zinc-600" />
            <p className="text-xs text-zinc-500">AI agent tool calls will stream here in real time.</p>
          </div>
        )}
        {(entries.length > 0 || running) && (
          <div ref={feedRef} className="h-full overflow-y-auto px-5 py-2 space-y-0.5 font-mono text-[11px]" data-testid="kinective-feed-scroll">
            {entries.map((ev) => (
              <div key={ev.id} className="flex items-start gap-2.5" data-testid={`kinective-log-${ev.id}`}>
                <span className="text-zinc-600 shrink-0 pt-0.5 w-16">{ev.time}</span>
                <span className={`leading-relaxed flex items-center gap-1.5 ${
                  ev.type === "run_start" || ev.type === "setup"          ? "text-zinc-500" :
                  ev.type === "agent_start"                               ? "text-cyan-400 font-semibold" :
                  ev.type === "tool_call_start"                           ? "text-blue-400" :
                  ev.type === "tool_call_result" && ev.success            ? "text-emerald-400" :
                  ev.type === "tool_call_result" && ev.success === false  ? "text-red-400" :
                  ev.type === "run_complete"                              ? "text-emerald-400 font-semibold" :
                  ev.type === "error"                                     ? "text-red-400" :
                  "text-zinc-300"
                }`}>
                  {ev.type === "tool_call_start"                           && <Zap         className="inline w-3 h-3 shrink-0 text-blue-400" />}
                  {ev.type === "tool_call_result" && ev.success            && <CheckCircle2 className="inline w-3 h-3 shrink-0 text-emerald-400" />}
                  {ev.type === "tool_call_result" && ev.success === false  && <XCircle      className="inline w-3 h-3 shrink-0 text-red-400" />}
                  {ev.type === "agent_start"                               && <Cpu          className="inline w-3 h-3 shrink-0 text-cyan-400" />}
                  {ev.type === "run_complete"                              && <CheckCircle2 className="inline w-3 h-3 shrink-0 text-emerald-400" />}
                  {ev.type === "error"                                     && <XCircle      className="inline w-3 h-3 shrink-0 text-red-400" />}
                  <span>{ev.message}</span>
                </span>
              </div>
            ))}
            {running && entries.length > 0 && (
              <div className="flex items-center gap-2.5 text-zinc-500 mt-1">
                <span className="w-16 shrink-0" />
                <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                <span className="italic text-[10px]">Agent working…</span>
              </div>
            )}
            {running && entries.length === 0 && (
              <div className="flex items-center gap-2.5 text-zinc-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Initializing agent…</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ActivityFeed({ entries }: { entries: AuditEntry[] }) {
  return (
    <Card className="bg-zinc-900 border-zinc-800" data-testid="activity-feed">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Clock className="w-4 h-4 text-zinc-400" />
          Live Activity Feed
          <Badge variant="outline" className="ml-auto bg-zinc-800 border-zinc-700 text-zinc-400 text-[10px]">
            {entries.length} events
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1 max-h-[400px] overflow-y-auto">
          {entries.length === 0 && (
            <div className="text-zinc-500 text-xs py-4 text-center">
              No activity yet. Use "Change Address" to trigger the pipeline.
            </div>
          )}
          {[...entries].reverse().map((entry) => {
            const sysColor = Object.entries(SYSTEM_COLORS).find(([k]) =>
              entry.system.toLowerCase().includes(k.toLowerCase())
            )?.[1] || "bg-zinc-600";

            return (
              <div
                key={entry.id}
                className="flex items-start gap-2 py-1.5 px-2 rounded text-xs hover:bg-zinc-800/50"
                data-testid={`audit-entry-${entry.id}`}
              >
                <span className="text-zinc-500 font-mono text-[10px] shrink-0 mt-0.5">
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </span>
                <Badge className={`${sysColor} text-white text-[10px] shrink-0`}>
                  {entry.system}
                </Badge>
                <span className="text-zinc-300">{entry.details}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default function KinectiveDemo() {
  const [scenario, setScenario] = useState<Scenario>("happy");
  const [running, setRunning] = useState(false);
  const [agentTeamOpen, setAgentTeamOpen] = useState(false);
  const [logEntries, setLogEntries] = useState<KinectiveLogEntry[]>([]);
  const [complete, setComplete] = useState(false);
  const sseRef = useRef<EventSource | null>(null);
  const logCounter = useRef(0);
  const lastStartedAt = useRef<number>(0);
  const { toast } = useToast();

  const traceQuery = useQuery<{ traceId: string | null; running: boolean }>({
    queryKey: ["/demo-api/kinective/trace-id"],
    refetchInterval: running ? POLL_INTERVAL : false,
  });

  const systemUpdatesQuery = useQuery<{ updates: SystemUpdate[] }>({
    queryKey: ["/demo-api/kinective/system-updates"],
    refetchInterval: running ? POLL_INTERVAL : false,
  });

  const rollbackQuery = useQuery<{ entries: { system: string; status: string; rolledBackAt: string }[] }>({
    queryKey: ["/demo-api/kinective/rollback-log"],
    refetchInterval: running ? POLL_INTERVAL : false,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/demo-api/kinective/trace-id"] });
    queryClient.invalidateQueries({ queryKey: ["/demo-api/kinective/system-updates"] });
    queryClient.invalidateQueries({ queryKey: ["/demo-api/kinective/rollback-log"] });
    queryClient.invalidateQueries({ queryKey: ["/demo-api/kinective/config"] });
  };

  const startRunning = () => {
    lastStartedAt.current = Date.now();
    setRunning(true);
    invalidateAll();
  };

  useEffect(() => {
    if (
      traceQuery.data &&
      traceQuery.data.running === false &&
      running &&
      traceQuery.dataUpdatedAt > lastStartedAt.current
    ) {
      setRunning(false);
    }
  }, [traceQuery.data, traceQuery.dataUpdatedAt, running]);

  // Close SSE on unmount
  useEffect(() => {
    return () => { sseRef.current?.close(); };
  }, []);

  const openKinectiveStream = (scenarioName: Scenario) => {
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }
    setLogEntries([]);
    setComplete(false);
    logCounter.current = 0;

    const now = () => {
      const d = new Date();
      return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
    };
    const addEntry = (type: KinectiveLogEntry["type"], message: string, extra?: Partial<KinectiveLogEntry>) => {
      const id = ++logCounter.current;
      setLogEntries((prev) => [...prev, { id, time: now(), type, message, ...extra }]);
    };

    const es = new EventSource(`/demo-api/kinective/stream?scenario=${scenarioName}`);
    sseRef.current = es;

    es.addEventListener("run_start", (e: MessageEvent) => {
      startRunning();
      try {
        const d = JSON.parse(e.data);
        addEntry("run_start", `Live run started — scenario: ${d.scenario || scenarioName}`);
      } catch { addEntry("run_start", "COA pipeline starting…"); }
    });

    es.addEventListener("setup", (e: MessageEvent) => {
      try { const d = JSON.parse(e.data); addEntry("setup", d.message || "Setting up…"); } catch {}
    });

    es.addEventListener("agent_start", (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data);
        addEntry("agent_start", `Executing ${d.agentName || "Change of Address Agent"}…`);
      } catch { addEntry("agent_start", "Executing Change of Address Agent…"); }
    });

    es.addEventListener("agent_event", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "tool_call_start") {
          addEntry("tool_call_start", `→ Calling: ${data.tool}`, { tool: data.tool, system: data.system });
        } else if (data.type === "tool_call_result") {
          const suffix = data.system ? ` → ${data.system}` : "";
          const msg = data.success
            ? `✓ ${data.tool}${suffix}: success`
            : `✗ ${data.tool}${suffix}: ${data.error || "failed"}`;
          addEntry("tool_call_result", msg, { tool: data.tool, system: data.system, success: data.success ?? true });
          queryClient.invalidateQueries({ queryKey: ["/demo-api/kinective/system-updates"] });
        }
      } catch {}
    });

    es.addEventListener("run_complete", (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data);
        addEntry("run_complete", d.message || "COA pipeline complete — all systems processed");
      } catch { addEntry("run_complete", "COA pipeline complete"); }
      setRunning(false);
      setComplete(true);
      invalidateAll();
      es.close();
      sseRef.current = null;
    });

    es.addEventListener("error", (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data);
        addEntry("error", `Error: ${d.message || "Connection error"}`);
      } catch { addEntry("error", "Stream error"); }
      setRunning(false);
      es.close();
      sseRef.current = null;
    });

    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) {
        setRunning(false);
        sseRef.current = null;
      }
    };
  };

  const resetMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/demo-api/kinective/full-reset", {});
      return res.json();
    },
    onSuccess: () => {
      sseRef.current?.close();
      sseRef.current = null;
      setLogEntries([]);
      setComplete(false);
      logCounter.current = 0;
      setRunning(false);
      setScenario("happy");
      invalidateAll();
      toast({ title: "Demo Reset", description: "Demo reset — ready for next run" });
    },
  });

  const handlePipelineStarted = () => {
    openKinectiveStream(scenario);
  };

  const systemUpdates = systemUpdatesQuery.data?.updates || [];
  const rollbackEntries = rollbackQuery.data?.entries || [];
  const traceId = traceQuery.data?.traceId;
  const hasRun = running || complete;

  const mcpServerList = Object.values(KINECTIVE_MCP_SERVERS);

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="border-b border-zinc-800 bg-zinc-950">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold" data-testid="kinective-demo-title">
                  Kinective — Change of Address
                </h1>
                <Badge variant="outline" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                  Credit Union
                </Badge>
              </div>
              <p className="text-sm text-zinc-400 mt-1">
                Automated COA processing: SignPlus intake → USPS validation → 11-system orchestration → compliance
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => resetMutation.mutate()}
                disabled={resetMutation.isPending}
                className="border-zinc-600 text-zinc-200 hover:bg-zinc-800 hover:border-zinc-500"
                data-testid="reset-demo-button"
              >
                {resetMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                )}
                Reset Demo
              </Button>
              <Link href={`/agents/${KINECTIVE_AGENT.id}`}>
                <Button variant="outline" size="sm" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800" data-testid="view-agent-button">
                  <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                  View Agent
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>


      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-sm text-zinc-400 font-medium">Scenario:</span>
          {(Object.keys(SCENARIO_LABELS) as Scenario[]).map((s) => (
            <Button
              key={s}
              variant={scenario === s ? "default" : "outline"}
              size="sm"
              onClick={async () => {
                if (s === scenario) return;
                setScenario(s);
                try {
                  await apiRequest("POST", "/demo-api/kinective/full-reset", {});
                  invalidateAll();
                  setRunning(false);
                } catch (_) {}
              }}
              className={
                scenario === s
                  ? "bg-zinc-700 text-white border-zinc-600"
                  : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"
              }
              disabled={running}
              data-testid={`scenario-${s}`}
            >
              {SCENARIO_LABELS[s].label}
            </Button>
          ))}

          <div className="ml-auto flex items-center gap-3">
            {traceId && !running && (
              <Link href={`/traces/${traceId}`}>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                  data-testid="view-trace-button"
                >
                  View Live Trace <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                </Button>
              </Link>
            )}
            <Button
              onClick={() => openKinectiveStream(scenario)}
              disabled={running}
              variant="outline"
              size="sm"
              className="border-zinc-600 text-zinc-300 hover:bg-zinc-800"
              data-testid="run-scenario-button"
            >
              {running ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Run Scenario
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="mb-4">
          <SystemConfigPanel />
        </div>

        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-7 space-y-4">
            <MemberCard
              scenario={scenario}
              running={running}
              onTriggerComplete={handlePipelineStarted}
            />
            <SignedFormPanel scenario={scenario} hasRun={hasRun} />
            <ValidationPanel scenario={scenario} hasRun={hasRun} />
            <SystemUpdatesPanel scenario={scenario} updates={systemUpdates} running={running} />
            {(scenario === "system_failure" || scenario === "invalid_address") && <RollbackPanel entries={rollbackEntries} scenario={scenario} />}
            <NotificationPanel scenario={scenario} hasRun={hasRun} />
          </div>

          <div className="col-span-5 space-y-4">
            <KinectiveLogFeed entries={logEntries} running={running} complete={complete} />

            <Collapsible open={agentTeamOpen} onOpenChange={setAgentTeamOpen}>
              <Card className="bg-zinc-900 border-zinc-800">
                <CollapsibleTrigger className="w-full">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      {agentTeamOpen ? (
                        <ChevronDown className="w-4 h-4 text-zinc-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-zinc-400" />
                      )}
                      Agent Configuration
                      <Badge variant="outline" className="ml-auto bg-zinc-800 border-zinc-700 text-zinc-400 text-[10px]">
                        1 agent · {mcpServerList.length} MCP servers · {KINECTIVE_SKILLS.length} skills
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="space-y-3 pt-0">
                    <div className="bg-zinc-800/50 rounded-lg p-3 text-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <Link href={`/agents/${KINECTIVE_AGENT.id}`}>
                          <span className="text-blue-400 hover:underline cursor-pointer font-medium">
                            {KINECTIVE_AGENT.name}
                          </span>
                        </Link>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] bg-green-500/20 text-green-400 border-green-500/30">
                            {KINECTIVE_CONFIG.riskTier}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] bg-blue-500/20 text-blue-400 border-blue-500/30">
                            autonomous
                          </Badge>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {KINECTIVE_CONFIG.complianceTags.map((tag) => (
                          <Badge key={tag} variant="outline" className="text-[9px] bg-zinc-700/50 text-zinc-400 border-zinc-600">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-zinc-500 mb-2 font-medium">MCP Servers ({mcpServerList.length})</div>
                      <div className="space-y-1">
                        {mcpServerList.map((srv) => (
                          <div key={srv.id} className="flex items-center justify-between text-xs py-1 px-2 rounded hover:bg-zinc-800/50">
                            <span className="text-zinc-300">{srv.name}</span>
                            <span className="text-zinc-500 text-[10px]">{srv.tools.length} tools</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-zinc-500 mb-2 font-medium">Skills ({KINECTIVE_SKILLS.length})</div>
                      <div className="flex flex-wrap gap-1">
                        {KINECTIVE_SKILLS.map((sk) => (
                          <Badge key={sk.id} variant="outline" className="text-[10px] bg-zinc-800 border-zinc-700 text-zinc-400">
                            {sk.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          </div>
        </div>
      </div>
    </div>
  );
}
