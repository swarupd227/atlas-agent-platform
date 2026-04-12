import SHDemoLayout from "./sh-demo-layout";
import type { SHScenarioConfig } from "./sh-demo-layout";

const config: SHScenarioConfig = {
  scenario: "financial",
  title: "Fraud Detection Model Recovery Agent",
  subtitle: "BNPL Merchant Category Population Shift Self-Healing",
  domain: "Financial Services",
  agentCode: "SH-FIN-001",
  accentColor: "hsl(220 70% 50%)",
  complianceFrameworks: ["SR 11-7 Model Risk", "FCRA", "PCI-DSS v4.0", "GDPR Art. 22"],
};

export default function SHFinancialDemo() {
  return <SHDemoLayout config={config} />;
}
