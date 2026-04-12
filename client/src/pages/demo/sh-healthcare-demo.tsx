import SHDemoLayout from "./sh-demo-layout";
import type { SHScenarioConfig } from "./sh-demo-layout";

const config: SHScenarioConfig = {
  scenario: "healthcare",
  title: "Clinical Data Integrity Monitor",
  subtitle: "FHIR EHR Feed Self-Healing",
  domain: "Healthcare",
  agentCode: "SH-HEALTH-001",
  accentColor: "hsl(199 89% 42%)",
  complianceFrameworks: ["HIPAA", "FDA 21 CFR Part 11", "HL7 FHIR R4", "US Core 6.1"],
};

export default function SHHealthcareDemo() {
  return <SHDemoLayout config={config} />;
}
