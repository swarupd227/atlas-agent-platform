import { FACILITIES, REVIEW_FACILITIES, now } from "./mbcre-seed";

/**
 * The mutable side of the Mutual Bancorp CRE fixture world, shared by the
 * commercial loan system, the financials repository and the policy library.
 * One reset clears all three systems, because they describe one world.
 */

export interface ReviewState {
  facilityId: string;
  status: "due" | "documents_requested" | "documents_received" | "spread" | "rating_proposed" | "memo_drafted" | "rated";
  requestDrafts: Array<{ draftId: string; at: string; items: string[]; message: string; draftedBy: string }>;
  requestSent: null | { requestId: string; at: string; sentBy: string; approvalId: string; draftId: string | null };
  documentsReceived: string[];
  spreads: Array<{ spreadId: string; at: string; period: string; lines: Array<{ line: string; value: number; sourceRef: string }>; ratios: Record<string, number>; spreadBy: string }>;
  covenantTests: Array<{ testId: string; at: string; results: Array<{ covenantId: string; value: number; threshold: number; result: "pass" | "breach"; evidenceRefs: string[] }>; breachesRoutedToHuman: string[] }>;
  stressResults: Array<{ resultId: string; at: string; results: unknown[] }>;
  proposedRatings: Array<{ proposalId: string; at: string; grade: string; groupGrade: string; rationale: string; evidenceRefs: string[] }>;
  memos: Array<{ version: number; at: string; sections: Record<string, string>; figures: Array<{ label: string; value: number; sourceRef: string; traced: boolean }>; tracedPct: number; missingSections: string[] }>;
  finalRating: null | { grade: string; groupGrade: string; at: string; setBy: string; actorBankId: string; approvalId: string; rationale: string };
  rmActions: Array<{ actionId: string; at: string; actorId: string; approvalId: string; action: string; note: string }>;
}

export interface BookState {
  reviews: Map<string, ReviewState>;
  rollups: Array<{ rollupId: string; at: string; byBank: unknown; byPropertyType: unknown; bySubMarket: unknown; group: unknown; guidanceFlags: unknown; recordedBy: string }>;
  earlyWarnings: Array<{ warningId: string; at: string; facilityId: string; bankId: string; type: string; severity: string; detail: string; evidenceRefs: string[]; dueBy: string | null }>;
  activity: Array<{ at: string; actor: string; action: string; detail: string }>;
}

let book: BookState;
let seq = 1;

export function resetCreState(): void {
  book = {
    reviews: new Map(REVIEW_FACILITIES.map((f) => [f.facilityId, {
      facilityId: f.facilityId, status: "due", requestDrafts: [], requestSent: null, documentsReceived: [], spreads: [], covenantTests: [],
      stressResults: [], proposedRatings: [], memos: [], finalRating: null, rmActions: [],
    } as ReviewState])),
    rollups: [], earlyWarnings: [],
    activity: [{ at: now(), actor: "system", action: "book_loaded", detail: `${FACILITIES.length} CRE facilities across three banks; ${REVIEW_FACILITIES.length} due for annual review` }],
  };
  seq = 1;
}
resetCreState();

export const creBook = () => book;
export const reviewOf = (facilityId: unknown) => book.reviews.get(String(facilityId ?? "").trim().toUpperCase());
export const nextCreId = (prefix: string) => `${prefix}-${String(seq++).padStart(4, "0")}`;
export const logCre = (actor: string, action: string, detail: string) => { book.activity.push({ at: now(), actor, action, detail }); };

export const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean)
    : typeof v === "string" ? v.split(",").map((x) => x.trim()).filter(Boolean) : [];
