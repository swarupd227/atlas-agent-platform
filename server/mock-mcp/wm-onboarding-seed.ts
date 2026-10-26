/**
 * Onboarding cases for the Harborview Wealth Partners fixture (fictional):
 * the parties, the documents page by page as received, the transfer
 * instructions and the contra firm's own record of the account title. Raw
 * records only -- the missing page, the PEP and the title mismatch are facts
 * in the documents for agents and checks to find, not flags.
 */

export interface Party {
  partyId: string; name: string; role: "grantor" | "co_trustee" | "trustee" | "beneficiary" | "beneficial_owner";
  dateOfBirth: string; nationality: string; country: string; address: string; idDocument: string;
  /** What screening services know about this person, for the onboarding system's own checks. Not returned by any tool. */
  truth: { pep: boolean; sanctionsTrueMatch: boolean };
}
export interface CaseDocument { documentId: string; type: string; title: string; pages: Array<{ page: number; text: string }>; totalPagesStated: number; addedOnRequest?: boolean }
export interface OnboardingCase {
  caseId: string; householdName: string; advisorId: string; registration: string; legalTitle: string; proposedModelId: string;
  parties: Party[]; documents: CaseDocument[]; transfer: { contraFirm: string; contraAccountMasked: string; contraTitle: string; method: "ACAT"; approxValue: number };
  questionnaire: { riskToleranceScore: number; stated: string; timeHorizonYears: number; liquidityNeed: string; incomeStability: string; otherAssets: number };
  documentsOnRequest: CaseDocument[];
}

/** Documents each registration needs before an account can open. */
export const REQUIRED_DOCUMENTS: Record<string, Array<{ type: string; rule: string }>> = {
  trust: [{ type: "trust_certification", rule: "Certification of trust, all pages, signed by every trustee" }, { type: "government_id", rule: "Government ID for every trustee" }, { type: "account_application", rule: "Account application titled exactly as the trust" }, { type: "beneficial_ownership", rule: "Beneficial ownership certification" }],
  individual: [{ type: "government_id", rule: "Government ID" }, { type: "account_application", rule: "Account application" }],
  ira: [{ type: "government_id", rule: "Government ID" }, { type: "account_application", rule: "Account application" }, { type: "beneficiary_designation", rule: "Beneficiary designation" }],
};

const CAST = "ACCT-ONB-CAST-001";
export const ONBOARDING_CASES: OnboardingCase[] = [
  {
    caseId: CAST, householdName: "Castellano family", advisorId: "ADV-ELLIS", registration: "trust", legalTitle: "Castellano Family Trust dtd 03/14/2011", proposedModelId: "MDL-GROWTH-7030",
    parties: [
      { partyId: "PTY-CAST-01", name: "Elena Castellano Ruiz", role: "co_trustee", dateOfBirth: "1961-07-22", nationality: "CL", country: "US", address: "18 Seawall Lane, Marblehead MA", idDocument: "US passport ending 4471", truth: { pep: true, sanctionsTrueMatch: false } },
      { partyId: "PTY-CAST-02", name: "Hasan Mansur", role: "co_trustee", dateOfBirth: "1984-02-11", nationality: "US", country: "US", address: "220 Boylston Street, Boston MA", idDocument: "Massachusetts driver licence ending 9022", truth: { pep: false, sanctionsTrueMatch: false } },
      { partyId: "PTY-CAST-03", name: "Mateo Castellano", role: "beneficiary", dateOfBirth: "1992-11-03", nationality: "US", country: "US", address: "18 Seawall Lane, Marblehead MA", idDocument: "n/a", truth: { pep: false, sanctionsTrueMatch: false } },
    ],
    documents: [
      { documentId: "DOC-CAST-TRUSTCERT", type: "trust_certification", title: "Certification of Trust", totalPagesStated: 2, pages: [
        { page: 1, text: "CERTIFICATION OF TRUST (page 1 of 2)\nName of trust: Castellano Family Trust dtd 03/14/2011\nGrantor: Elena Castellano Ruiz\nTrustees: Elena Castellano Ruiz; Hasan Mansur (successor co-trustee appointed 2024-06-01)\nGoverning law: Massachusetts\nTax id: on file (masked)\nPowers of the trustees: see page 2." },
      ] },
      { documentId: "DOC-CAST-ID-01", type: "government_id", title: "Government ID -- Elena Castellano Ruiz", totalPagesStated: 1, pages: [{ page: 1, text: "United States passport. Name: Elena Castellano Ruiz. Date of birth: 1961-07-22. Place of birth: Santiago, Chile. Nationality at birth: Chilean (naturalised US citizen 2003). Number ending 4471." }] },
      { documentId: "DOC-CAST-ID-02", type: "government_id", title: "Government ID -- Hasan Mansur", totalPagesStated: 1, pages: [{ page: 1, text: "Massachusetts driver licence. Name: Hasan Mansur. Date of birth: 1984-02-11. Address: 220 Boylston Street, Boston MA. Number ending 9022. US citizen (attorney, Mansur & Pell LLP)." }] },
      { documentId: "DOC-CAST-APP", type: "account_application", title: "Account application -- trust account", totalPagesStated: 2, pages: [
        { page: 1, text: "ACCOUNT APPLICATION. Registration: Trust. Account title: Castellano Family Trust dtd 03/14/2011. Trustees: Elena Castellano Ruiz, Hasan Mansur. Program: advisory, discretionary." },
        { page: 2, text: "Employment and affiliations. Elena Castellano Ruiz: retired. Prior public office: Deputy Minister of Finance of Chile, 2006-2010 (disclosed by the client). Hasan Mansur: attorney. Source of funds: sale of a family business in 2019." },
      ] },
      { documentId: "DOC-CAST-BO", type: "beneficial_ownership", title: "Beneficial ownership certification", totalPagesStated: 1, pages: [{ page: 1, text: "Beneficial owners and control persons of Castellano Family Trust dtd 03/14/2011: Elena Castellano Ruiz (grantor, co-trustee, 100% beneficial interest during life); Hasan Mansur (co-trustee, control person, no beneficial interest)." }] },
      { documentId: "DOC-CAST-ACAT", type: "transfer_form", title: "ACAT transfer initiation form", totalPagesStated: 1, pages: [{ page: 1, text: "ACCOUNT TRANSFER FORM. Deliver from: Bayline Securities, account ending 7731. Receiving account title: Castellano Family Trust dtd 03/14/2011. Transfer: full, in kind. Signed by both trustees 2026-10-20." }] },
      { documentId: "DOC-CAST-CONTRA", type: "contra_statement", title: "Most recent statement from the delivering firm", totalPagesStated: 1, pages: [{ page: 1, text: "BAYLINE SECURITIES quarterly statement, period ending 2026-09-30. Account title: Castellano Fam Trust. Account ending 7731. Total value 2,410,000.00." }] },
    ],
    transfer: { contraFirm: "Bayline Securities", contraAccountMasked: "****7731", contraTitle: "Castellano Fam Trust", method: "ACAT", approxValue: 2410000 },
    questionnaire: { riskToleranceScore: 72, stated: "Comfortable with large swings for higher growth", timeHorizonYears: 6, liquidityNeed: "moderate: 150,000 a year for grantor's living expenses", incomeStability: "retired, pension plus distributions", otherAssets: 900000 },
    documentsOnRequest: [
      { documentId: "DOC-CAST-TRUSTCERT-P2", type: "trust_certification", title: "Certification of Trust -- page 2 (supplied on request)", totalPagesStated: 2, addedOnRequest: true, pages: [{ page: 2, text: "CERTIFICATION OF TRUST (page 2 of 2)\nThe trustees may open and maintain brokerage and advisory accounts, buy and sell securities, and transfer assets. Either trustee may act alone.\nSigned: Elena Castellano Ruiz, Hasan Mansur, 2026-10-23. Notarised." }] },
    ],
  },
];
export const onboardingCaseById = (id: unknown) => ONBOARDING_CASES.find((c) => c.caseId === String(id ?? "").trim().toUpperCase());
