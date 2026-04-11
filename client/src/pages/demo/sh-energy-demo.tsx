import SHDemoLayout from "./sh-demo-layout";
import type { SHScenarioConfig } from "./sh-demo-layout";

const config: SHScenarioConfig = {
  title: "Grid Operations Stability Agent",
  subtitle: "Wind Farm Offshore Outage Self-Healing",
  domain: "Energy / Utilities",
  agentCode: "SH-ENERGY-001",
  pipelineId: "5409183e-3be8-4021-82a4-41aa49cd25b2",
  agentId: "88069f50-e374-4a16-ba9f-76a044fceca3",
  accentColor: "hsl(262 80% 58%)",
  complianceFrameworks: ["NERC CIP-014", "FERC Order 881", "IEC 62351", "OSHA 1910.269"],
};

export default function SHEnergyDemo() {
  return <SHDemoLayout config={config} />;
}
