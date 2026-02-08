import { Shield, ShieldAlert } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface PolicyViolation {
  policyName: string;
  rule: string;
  severity: string;
  message: string;
}

interface PolicyViolationDialogProps {
  open: boolean;
  onClose: () => void;
  violations: PolicyViolation[];
  sandboxAvailable?: boolean;
  onRequestApproval: () => void;
  requestApprovalPending?: boolean;
  testIdPrefix?: string;
}

export function PolicyViolationDialog({
  open,
  onClose,
  violations,
  sandboxAvailable,
  onRequestApproval,
  requestApprovalPending,
  testIdPrefix = "policy",
}: PolicyViolationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <ShieldAlert className="w-5 h-5 text-amber-500" />
            Policy Guardrail Triggered
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            This action cannot be auto-applied because it exceeds policy bounds. Expert approval is required.
          </p>
          {violations.map((v, idx) => (
            <div
              key={idx}
              className="flex flex-col gap-1 p-3 rounded-md bg-amber-500/5 border border-amber-500/10"
              data-testid={`${testIdPrefix}-violation-${idx}`}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-[10px]">{v.policyName}</Badge>
                <Badge
                  variant="outline"
                  className={`text-[10px] ${v.severity === "high" ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`}
                >
                  {v.severity}
                </Badge>
              </div>
              <span className="text-xs font-medium">{v.rule}</span>
              <span className="text-[11px] text-muted-foreground">{v.message}</span>
            </div>
          ))}
          {sandboxAvailable && (
            <div
              className="flex items-center gap-2 p-2 rounded-md bg-blue-500/5 border border-blue-500/10 flex-wrap"
              data-testid={`${testIdPrefix}-sandbox-notice`}
            >
              <Shield className="w-3.5 h-3.5 text-blue-500" />
              <span className="text-[11px] text-muted-foreground">
                Sandbox testing is available for non-production environments
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 pt-2 flex-wrap">
          <Button
            variant="outline"
            onClick={onClose}
            data-testid={`${testIdPrefix}-cancel`}
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              onRequestApproval();
              onClose();
            }}
            disabled={requestApprovalPending}
            data-testid={`${testIdPrefix}-request-approval`}
          >
            <Shield className="w-4 h-4 mr-1.5" />
            Request Expert Approval
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
