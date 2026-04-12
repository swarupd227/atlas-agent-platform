import SHDemoLayout from "./sh-demo-layout";
import type { SHScenarioConfig } from "./sh-demo-layout";

const config: SHScenarioConfig = {
  scenario: "manufacturing",
  title: "Factory Floor Anomaly Recovery Agent",
  subtitle: "CNC Bearing Wear Predictive Self-Healing",
  domain: "Manufacturing",
  agentCode: "SH-MFG-001",
  pipelineId: "2b4f6e7f-ee1a-4f2b-8f87-a675e0681d69",
  agentId: "d7617be4-d35b-453e-86a8-04de00ebd8fe",
  accentColor: "hsl(25 95% 53%)",
  complianceFrameworks: ["ISO 55001", "OSHA CFR 1910.217", "ISO 9001", "IEC 62443"],
};

export default function SHManufacturingDemo() {
  return <SHDemoLayout config={config} />;
}
