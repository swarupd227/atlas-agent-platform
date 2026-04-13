export interface DetectedEntity {
  type: string;
  start: number;
  end: number;
  score: number;
}

export interface MaskingReport {
  artifactId: string;
  entitiesFound: Record<string, number>;
  totalReplacements: number;
  engine: string;
  maskedAt: string;
  durationMs: number;
  tokenMap: Record<string, string>;
}

export interface CustomPattern {
  entityType: string;
  pattern: string;
}

export interface PIIMaskingConfig {
  engine: "regex";
  entityTypes: string[];
  customPatterns: CustomPattern[];
  failOnError: boolean;
}

export const DEFAULT_ENTITY_TYPES = [
  "EMAIL_ADDRESS",
  "PHONE_NUMBER",
  "US_SSN",
  "CREDIT_CARD",
  "IP_ADDRESS",
  "URL",
];

const REGEX_PATTERNS: Record<string, RegExp[]> = {
  EMAIL_ADDRESS:  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g],
  PHONE_NUMBER:   [/\b(?:\+?1[-.\s]?)?(?:\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4}\b/g],
  US_SSN:         [/\b\d{3}-\d{2}-\d{4}\b/g],
  CREDIT_CARD:    [/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g],
  IP_ADDRESS:     [/\b(?:\d{1,3}\.){3}\d{1,3}\b/g],
  URL:            [/https?:\/\/[^\s<>"{}|\\^`[\]]+/g],
};

export class PIIMaskingEngine {
  private config: PIIMaskingConfig;

  constructor(config: PIIMaskingConfig) {
    this.config = config;
  }

  async maskBatch(
    items: Array<{ text: string; artifactId: string }>,
  ): Promise<Array<{ maskedText: string; report: MaskingReport }>> {
    if (!items.length) return [];

    const globalEntityCounts: Record<string, number> = {};
    const results: Array<{ maskedText: string; report: MaskingReport }> = [];

    for (const item of items) {
      if (!item.text || !item.text.trim()) {
        results.push({ maskedText: item.text, report: this.emptyReport(item.artifactId) });
        continue;
      }

      const start = performance.now();
      const entities = this.detectEntities(item.text);
      const deduped = this.removeOverlapping(entities);

      const tokenMap: Record<string, string> = {};
      const spanTokens: Array<{ start: number; end: number; token: string }> = [];
      const localCounts: Record<string, number> = {};

      for (const entity of deduped) {
        globalEntityCounts[entity.type] = (globalEntityCounts[entity.type] || 0) + 1;
        localCounts[entity.type] = (localCounts[entity.type] || 0) + 1;
        const n = globalEntityCounts[entity.type];
        const token = n > 1 ? `[${entity.type}_${n}]` : `[${entity.type}]`;
        spanTokens.push({ start: entity.start, end: entity.end, token });
        tokenMap[token] = item.text.slice(entity.start, entity.end);
      }

      let masked = item.text;
      for (const span of spanTokens.sort((a, b) => b.start - a.start)) {
        masked = masked.slice(0, span.start) + span.token + masked.slice(span.end);
      }

      const durationMs = performance.now() - start;
      results.push({
        maskedText: masked,
        report: {
          artifactId: item.artifactId,
          entitiesFound: localCounts,
          totalReplacements: spanTokens.length,
          engine: "regex",
          maskedAt: new Date().toISOString(),
          durationMs: Math.round(durationMs * 1000) / 1000,
          tokenMap,
        },
      });
    }

    return results;
  }

  maskSingle(text: string, artifactId = "preview"): { maskedText: string; report: MaskingReport } {
    if (!text || !text.trim()) return { maskedText: text, report: this.emptyReport(artifactId) };

    const start = performance.now();
    const entities = this.detectEntities(text);
    const deduped = this.removeOverlapping(entities);

    const tokenMap: Record<string, string> = {};
    const spanTokens: Array<{ start: number; end: number; token: string }> = [];
    const localCounts: Record<string, number> = {};
    const globalCounts: Record<string, number> = {};

    for (const entity of deduped) {
      globalCounts[entity.type] = (globalCounts[entity.type] || 0) + 1;
      localCounts[entity.type] = (localCounts[entity.type] || 0) + 1;
      const n = globalCounts[entity.type];
      const token = n > 1 ? `[${entity.type}_${n}]` : `[${entity.type}]`;
      spanTokens.push({ start: entity.start, end: entity.end, token });
      tokenMap[token] = text.slice(entity.start, entity.end);
    }

    let masked = text;
    for (const span of spanTokens.sort((a, b) => b.start - a.start)) {
      masked = masked.slice(0, span.start) + span.token + masked.slice(span.end);
    }

    return {
      maskedText: masked,
      report: {
        artifactId,
        entitiesFound: localCounts,
        totalReplacements: spanTokens.length,
        engine: "regex",
        maskedAt: new Date().toISOString(),
        durationMs: Math.round((performance.now() - start) * 1000) / 1000,
        tokenMap,
      },
    };
  }

  private detectEntities(text: string): DetectedEntity[] {
    const patterns: Record<string, RegExp[]> = {};
    for (const type of this.config.entityTypes) {
      patterns[type] = (REGEX_PATTERNS[type] || []).map(r => new RegExp(r.source, r.flags));
    }
    for (const custom of this.config.customPatterns) {
      if (!patterns[custom.entityType]) patterns[custom.entityType] = [];
      try { patterns[custom.entityType].push(new RegExp(custom.pattern, "g")); } catch { /* skip bad regex */ }
    }

    const entities: DetectedEntity[] = [];
    for (const [type, regexes] of Object.entries(patterns)) {
      for (const regex of regexes) {
        regex.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(text)) !== null) {
          entities.push({ type, start: match.index, end: match.index + match[0].length, score: 0.85 });
        }
      }
    }
    return entities;
  }

  private removeOverlapping(entities: DetectedEntity[]): DetectedEntity[] {
    const sorted = [...entities].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (b.end - b.start) - (a.end - a.start);
    });
    const kept: DetectedEntity[] = [];
    for (const entity of sorted) {
      if (!kept.some(k => entity.start < k.end && entity.end > k.start)) kept.push(entity);
    }
    return kept.sort((a, b) => a.start - b.start);
  }

  private emptyReport(artifactId: string): MaskingReport {
    return { artifactId, entitiesFound: {}, totalReplacements: 0, engine: "regex", maskedAt: new Date().toISOString(), durationMs: 0, tokenMap: {} };
  }
}
