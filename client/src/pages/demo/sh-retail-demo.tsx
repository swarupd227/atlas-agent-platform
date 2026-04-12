import SHDemoLayout from "./sh-demo-layout";
import type { SHScenarioConfig } from "./sh-demo-layout";

const config: SHScenarioConfig = {
  scenario: "retail",
  title: "Order Fulfillment Recovery Agent",
  subtitle: "WMS API Cascade Failure Self-Healing",
  domain: "Retail / E-Commerce",
  agentCode: "SH-RETAIL-001",
  pipelineId: "9ac7e395-4f4f-4ad3-8076-0b0ad66975bb",
  agentId: "56ef232d-8d91-428d-8e81-d8ef03c6ecfa",
  accentColor: "hsl(142 71% 45%)",
  complianceFrameworks: ["Consumer Protection", "PCI-DSS v4.0", "GDPR", "CCPA"],
};

export default function SHRetailDemo() {
  return <SHDemoLayout config={config} />;
}
