import SHDemoLayout from "./sh-demo-layout";
import type { SHScenarioConfig } from "./sh-demo-layout";

const config: SHScenarioConfig = {
  title: "Fraud Detection Model Recovery Agent",
  subtitle: "BNPL Merchant Category Population Shift Self-Healing",
  domain: "Financial Services",
  agentCode: "SH-FIN-001",
  pipelineId: "49e8484f-4cd9-4b05-a66c-06c2d9cc3255",
  agentId: "461e8ef7-5fb1-4ad3-8db1-215a1e59cfc3",
  accentColor: "hsl(220 70% 50%)",
  complianceFrameworks: ["SR 11-7 Model Risk", "FCRA", "PCI-DSS v4.0", "GDPR Art. 22"],
};

export default function SHFinancialDemo() {
  return <SHDemoLayout config={config} />;
}
