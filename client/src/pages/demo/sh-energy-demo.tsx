import SHDemoLayout from "./sh-demo-layout";
import type { SHScenarioConfig } from "./sh-demo-layout";

const config: SHScenarioConfig = {
  scenario: "energy",
  title: "Grid Operations Stability Agent",
  subtitle: "Wind Farm Offshore Outage Self-Healing",
  domain: "Energy / Utilities",
  agentCode: "SH-ENERGY-001",
  accentColor: "hsl(262 80% 58%)",
  complianceFrameworks: ["NERC CIP-014", "FERC Order 881", "IEC 62351", "OSHA 1910.269"],
};

export default function SHEnergyDemo() {
  return <SHDemoLayout config={config} />;
}
