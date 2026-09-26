/**
 * Checking a piece of text against the organization's vocabulary.
 *
 * Lifted out of POST /api/ontology/validate-text unchanged, so the route and
 * Astra give the same answer, and so the matching itself can be tested without
 * a database. The logic is string similarity -- exact match on a concept label
 * or synonym, otherwise a Levenshtein score over one-, two- and three-word
 * phrases. It knows nothing about meaning: a "mismatch" is a term that LOOKS
 * like one of your concepts, which is a suggestion for a person to judge and
 * never a finding. Anything presenting these numbers has to say that.
 */

export interface VocabularyConcept {
  id: string;
  label: string;
  category: string | null;
  synonyms?: string[] | null;
  tags?: string[] | null;
}

export interface TermMismatch {
  term: string;
  suggestedTerm: string;
  conceptId: string;
  category: string;
  matchMethod: string;
  /** String similarity, 0-1. Not a confidence about meaning. */
  confidence: number;
}

export interface ValidTerm {
  term: string;
  conceptId: string;
  conceptLabel: string;
  category: string;
}

export interface VocabularyCheck {
  mismatches: TermMismatch[];
  validTerms: ValidTerm[];
  totalTermsChecked: number;
}

const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "to", "of", "in", "for",
  "on", "with", "at", "by", "from", "as", "into", "through", "during",
  "before", "after", "above", "below", "between", "and", "but", "or",
  "not", "no", "nor", "so", "yet", "both", "each", "all", "any", "few",
  "more", "most", "other", "some", "such", "than", "too", "very", "just",
  "about", "up", "out", "if", "then", "that", "this", "these", "those",
  "it", "its", "they", "them", "their", "we", "our", "you", "your",
  "he", "she", "him", "her", "his", "who", "which", "what", "when",
  "where", "how", "why", "also", "only", "here", "there", "must",
]);

function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= a.length; i++) matrix[i] = [i];
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return matrix[a.length][b.length];
}

/** The phrases a text is checked as: single words that aren't stop words, plus every bigram and trigram. */
export function phrasesIn(text: string): string[] {
  const cleaned = text.replace(/[{}[\]"':,]/g, " ");
  const words = cleaned.split(/\s+/).filter((w) => w.length > 2);
  const phrases: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i].toLowerCase();
    if (!STOP_WORDS.has(w)) phrases.push(w);
    if (i + 1 < words.length) phrases.push(`${words[i].toLowerCase()} ${words[i + 1].toLowerCase()}`);
    if (i + 2 < words.length) phrases.push(`${words[i].toLowerCase()} ${words[i + 1].toLowerCase()} ${words[i + 2].toLowerCase()}`);
  }
  const seen = new Set<string>();
  return phrases.filter((p) => {
    if (seen.has(p)) return false;
    seen.add(p);
    return true;
  });
}

/** Terms in the text that match the vocabulary, and terms that only resemble it. */
export function checkVocabulary(concepts: VocabularyConcept[], text: string): VocabularyCheck {
  if (concepts.length === 0) return { mismatches: [], validTerms: [], totalTermsChecked: 0 };

  const index = concepts.map((c) => ({
    id: c.id,
    label: c.label,
    labelNorm: c.label.toLowerCase().replace(/[\s_-]+/g, ""),
    synonyms: (c.synonyms || []).map((s) => s.toLowerCase()),
    synonymsNorm: (c.synonyms || []).map((s) => s.toLowerCase().replace(/[\s_-]+/g, "")),
    category: c.category ?? "",
  }));

  const uniquePhrases = phrasesIn(text);
  const mismatches: TermMismatch[] = [];
  const validTerms: ValidTerm[] = [];
  const processedTerms = new Set<string>();

  for (const phrase of uniquePhrases) {
    const norm = phrase.replace(/[\s_-]+/g, "");

    let exactMatch = false;
    for (const c of index) {
      if (c.labelNorm === norm || c.label.toLowerCase() === phrase) {
        validTerms.push({ term: phrase, conceptId: c.id, conceptLabel: c.label, category: c.category });
        processedTerms.add(phrase);
        exactMatch = true;
        break;
      }
      if (c.synonymsNorm.includes(norm) || c.synonyms.includes(phrase)) {
        validTerms.push({ term: phrase, conceptId: c.id, conceptLabel: c.label, category: c.category });
        processedTerms.add(phrase);
        exactMatch = true;
        break;
      }
    }
    if (exactMatch) continue;

    let bestMismatch: TermMismatch | null = null;
    for (const c of index) {
      const dist = levenshtein(norm, c.labelNorm);
      const maxLen = Math.max(norm.length, c.labelNorm.length);
      const similarity = 1 - dist / maxLen;
      if (similarity >= 0.6 && similarity < 1.0 && norm.length > 3) {
        const conf = Math.round(similarity * 100) / 100;
        if (!bestMismatch || conf > bestMismatch.confidence) {
          bestMismatch = { term: phrase, suggestedTerm: c.label, conceptId: c.id, category: c.category, matchMethod: "fuzzy", confidence: conf };
        }
      }
      for (const syn of c.synonyms) {
        const synDist = levenshtein(phrase, syn);
        const synMaxLen = Math.max(phrase.length, syn.length);
        const synSim = 1 - synDist / synMaxLen;
        if (synSim >= 0.6 && synSim < 1.0 && phrase.length > 3) {
          const conf = Math.round(synSim * 100) / 100;
          if (!bestMismatch || conf > bestMismatch.confidence) {
            bestMismatch = { term: phrase, suggestedTerm: c.label, conceptId: c.id, category: c.category, matchMethod: "fuzzy_synonym", confidence: conf };
          }
        }
      }
    }

    if (bestMismatch && !processedTerms.has(bestMismatch.term)) {
      const alreadyValid = validTerms.some((v) => v.term === bestMismatch!.suggestedTerm.toLowerCase());
      if (!alreadyValid) {
        mismatches.push(bestMismatch);
        processedTerms.add(bestMismatch.term);
      }
    }
  }

  // One suggestion per concept: the closest term wins.
  const deduped = mismatches.reduce<TermMismatch[]>((acc, m) => {
    const existing = acc.find((a) => a.suggestedTerm === m.suggestedTerm);
    if (existing) {
      if (m.confidence > existing.confidence) acc[acc.indexOf(existing)] = m;
    } else {
      acc.push(m);
    }
    return acc;
  }, []);

  return { mismatches: deduped, validTerms, totalTermsChecked: uniquePhrases.length };
}
