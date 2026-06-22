// Shared meeting-transcription + opportunity/proposal analysis.
// Used by the synchronous endpoint (short clips) and the async job worker
// (long meetings, up to ~1 hour). Kept in one place so both paths behave
// identically.
import OpenAI, { toFile } from "openai";
import { callClaude } from "./claude";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || undefined,
});

export function aiConfigured(): boolean {
  return !!(process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY);
}

const industrySystemsMap: Record<string, string> = {
  financial_services: "core banking, KYC/AML, compliance reporting, trade settlement, regulatory filings",
  healthcare: "EHR/EMR, prior authorization, claims processing, HEDIS measures, patient scheduling",
  manufacturing: "ERP, MES, OEE dashboards, quality management, predictive maintenance",
  insurance: "policy admin, claims management, underwriting, actuarial systems, regulatory filings",
  retail: "inventory management, POS, demand forecasting, vendor portals, e-commerce",
  technology_saas: "CI/CD pipelines, incident management, compliance monitoring, API gateways",
};
const industryRegsMap: Record<string, string> = {
  financial_services: "BSA/AML, SOX, PCI-DSS, FINRA, SEC rules",
  healthcare: "HIPAA, HITECH, CMS conditions, FDA 21 CFR Part 11",
  manufacturing: "ISO 9001, OSHA, EPA environmental rules",
  insurance: "State insurance regulations, NAIC model laws, ACORD standards",
  retail: "PCI-DSS, CCPA/CPRA, FTC Act",
  technology_saas: "SOC 2 Type II, GDPR, CCPA, ISO 27001",
};

export interface MeetingIndustry { id: string; label: string }

export interface MeetingAnalysis {
  transcript: string;
  opportunities: any[];
  topProposal?: any;
}

/** Transcribe an audio buffer (OpenAI) and analyze it into opportunities + an optional proposal. */
export async function runMeetingTranscription(
  audioBuffer: Buffer,
  filename: string,
  industry: MeetingIndustry | null,
  generateTopProposal: boolean,
): Promise<MeetingAnalysis> {
  const ext = filename.split(".").pop() || "webm";
  const audioFile = await toFile(audioBuffer, `audio.${ext}`);

  const transcription = await openai.audio.transcriptions.create({
    file: audioFile,
    model: "gpt-4o-mini-transcribe",
  });
  const transcript = transcription.text;

  const industryContext = industry
    ? `\n\nContext: This meeting is from a "${industry.label}" industry environment. Use industry-specific terminology, reference relevant systems (${industrySystemsMap[industry.id] || "industry-relevant systems"}) and applicable regulations (${industryRegsMap[industry.id] || "general compliance frameworks"}).`
    : "";

  const rawContent = await callClaude({
    system: `You are an expert business process analyst. Analyze the following meeting transcript and identify automation opportunities. Look for:
- Repetitive manual processes that could be automated
- Pain points and bottlenecks mentioned by participants
- Data entry or transfer tasks between systems
- Approval workflows that could be streamlined
- Reporting or monitoring tasks that could be automated${industryContext}

For each opportunity found, provide:
- name: A concise name for the automation opportunity
- description: A detailed description of what could be automated and how
- businessValue: Rate as "high", "medium", or "low" based on potential impact
- keyRequirements: An array of strings listing what would be needed to implement this automation
- suggestedSystems: An array of strings listing systems or tools that could be integrated
- draftKpis: An array of 2-3 objects {name, target (number), unit} representing measurable success metrics
- riskTier: "LOW", "MEDIUM", or "HIGH" based on regulatory exposure and process criticality
- estimatedRoiNarrative: A 1-2 sentence estimate of potential time/cost savings

Return ONLY a valid JSON array of opportunity objects. Do not include any text before or after the JSON array.`,
    user: `Meeting Transcript:\n\n${transcript}`,
    maxTokens: 4000,
    jsonMode: true,
  });

  let opportunities: any[];
  try {
    opportunities = JSON.parse(rawContent);
  } catch {
    const jsonMatch = rawContent.match(/\[[\s\S]*\]/);
    opportunities = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
  }

  let topProposal: any = null;
  if (generateTopProposal && opportunities.length > 0) {
    const topOpp = opportunities[0];
    const topOppContext = `Opportunity: ${topOpp.name}\nDescription: ${topOpp.description}\nKey requirements: ${(topOpp.keyRequirements || []).join(", ")}\nSuggested systems: ${(topOpp.suggestedSystems || []).join(", ")}\nDraft KPIs: ${JSON.stringify(topOpp.draftKpis || [])}\nRisk tier: ${topOpp.riskTier || "MEDIUM"}\nROI narrative: ${topOpp.estimatedRoiNarrative || ""}`;
    const industryProposalContext = industry
      ? `This is for the "${industry.label}" industry. Include industry-specific agent designs, KPIs referencing industry benchmarks, and note applicable regulations (${industryRegsMap[industry.id] || "general compliance"}).`
      : "";

    const proposalRaw = await callClaude({
      system: `You are a Business Outcome Proposal Generator for the ATLAS AI platform. ${industryProposalContext}

Generate a complete, structured outcome proposal for the automation opportunity extracted from a meeting recording. Do NOT ask clarifying questions. Generate the full proposal immediately using all available context.

Return ONLY this exact JSON structure (no other text, no markdown fences):
{
  "type": "outcome_proposal",
  "outcomeContract": {
    "name": "string",
    "description": "string",
    "riskTier": "LOW | MEDIUM | HIGH",
    "pricingModel": "PER_OUTCOME_EVENT | MONTHLY_FIXED | TIERED",
    "pricePerUnit": number,
    "riskThreshold": number,
    "maxDriftPercent": number,
    "slaDescription": "string"
  },
  "kpis": [{"name": "string", "target": number, "unit": "string", "measurement": "string", "currentBaseline": number or null}],
  "proposedAgents": [{"name": "string", "role": "string", "description": "string", "workflowSteps": ["string"], "tools": ["string"], "riskTier": "LOW | MEDIUM | HIGH", "autonomyMode": "supervised | assisted | fully_autonomous", "estimatedImpact": "string"}],
  "validationChecklist": ["string"],
  "roiEstimate": {"annualizedSavingsMin": number, "annualizedSavingsMax": number, "paybackPeriodMonths": number or null, "assumptionsSummary": "string"}
}`,
      user: `Meeting transcript:\n${transcript.slice(0, 60000)}\n\nAutomation opportunity to build a proposal for:\n${topOppContext}`,
      maxTokens: 3000,
      jsonMode: true,
    });

    try {
      topProposal = JSON.parse(proposalRaw);
    } catch {
      const jsonMatch = proposalRaw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try { topProposal = JSON.parse(jsonMatch[0]); } catch { /* ignore */ }
      }
    }
  }

  return { transcript, opportunities, ...(topProposal ? { topProposal } : {}) };
}
