import SHDemoLayout from "./sh-demo-layout";
import type { SHScenarioConfig } from "./sh-demo-layout";

const config: SHScenarioConfig = {
  scenario: "healthcare",
  title: "Clinical Data Integrity Monitor",
  subtitle: "FHIR EHR Feed Self-Healing",
  domain: "Healthcare",
  agentCode: "SH-HEALTH-001",
  pipelineId: "1ee20f24-1242-4434-af37-b52c5b2d2f4e",
  agentId: "5db8101f-4ea0-4c10-ae54-2038081a5e0a",
  accentColor: "hsl(199 89% 42%)",
  complianceFrameworks: ["HIPAA", "FDA 21 CFR Part 11", "HL7 FHIR R4", "US Core 6.1"],
};

export default function SHHealthcareDemo() {
  return <SHDemoLayout config={config} />;
}
