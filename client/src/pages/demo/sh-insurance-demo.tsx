import SHDemoLayout from "./sh-demo-layout";
import type { SHScenarioConfig } from "./sh-demo-layout";

const config: SHScenarioConfig = {
  scenario: "insurance",
  title: "Claims Workflow Recovery Agent",
  subtitle: "Fraud Model FPR Spike Self-Healing",
  domain: "Insurance",
  agentCode: "SH-INS-001",
  pipelineId: "b1e1acc7-620d-4d9b-9c76-f3d7138ae0ec",
  agentId: "d7d45853-f644-4a4a-b134-d114413a7780",
  accentColor: "hsl(330 80% 50%)",
  complianceFrameworks: ["NAIC Model Bulletin on AI", "NAIC Unfair Claims Act", "GDPR Art. 22", "SOX"],
};

export default function SHInsuranceDemo() {
  return <SHDemoLayout config={config} />;
}
