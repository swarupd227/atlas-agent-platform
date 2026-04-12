import SHDemoLayout from "./sh-demo-layout";
import type { SHScenarioConfig } from "./sh-demo-layout";

const config: SHScenarioConfig = {
  scenario: "insurance",
  title: "Claims Workflow Recovery Agent",
  subtitle: "Fraud Model FPR Spike Self-Healing",
  domain: "Insurance",
  agentCode: "SH-INS-001",
  accentColor: "hsl(330 80% 50%)",
  complianceFrameworks: ["NAIC Model Bulletin on AI", "NAIC Unfair Claims Act", "GDPR Art. 22", "SOX"],
};

export default function SHInsuranceDemo() {
  return <SHDemoLayout config={config} />;
}
