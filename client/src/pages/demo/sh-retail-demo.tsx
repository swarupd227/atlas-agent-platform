import SHDemoLayout from "./sh-demo-layout";
import type { SHScenarioConfig } from "./sh-demo-layout";

const config: SHScenarioConfig = {
  scenario: "retail",
  title: "Order Fulfillment Recovery Agent",
  subtitle: "WMS API Cascade Failure Self-Healing",
  domain: "Retail / E-Commerce",
  agentCode: "SH-RETAIL-001",
  accentColor: "hsl(142 71% 45%)",
  complianceFrameworks: ["Consumer Protection", "PCI-DSS v4.0", "GDPR", "CCPA"],
};

export default function SHRetailDemo() {
  return <SHDemoLayout config={config} />;
}
