import type { MaskingReport } from "./pii-masking-engine";

export type SanitizedReport = Omit<MaskingReport, "tokenMap">;

export class PIIRehydrationEngine {
  mergeTokenMaps(reports: MaskingReport[]): Record<string, string> {
    const merged: Record<string, string> = {};
    for (const report of reports) {
      for (const [token, original] of Object.entries(report.tokenMap || {})) {
        if (!(token in merged)) merged[token] = original;
      }
    }
    return merged;
  }

  rehydrate(text: string, tokenMap: Record<string, string>): string {
    if (!text || !Object.keys(tokenMap).length) return text;
    const tokens = Object.keys(tokenMap).sort((a, b) => b.length - a.length);
    let result = text;
    for (const token of tokens) {
      if (result.includes(token)) result = result.split(token).join(tokenMap[token]);
    }
    return result;
  }

  rehydrateStateFields(
    state: Record<string, any>,
    fieldPaths: string[],
    tokenMap: Record<string, string>,
  ): Record<string, any> {
    if (!Object.keys(tokenMap).length) return state;
    const updated = { ...state };
    for (const path of fieldPaths) {
      try { this.rehydrateAtPath(updated, path, tokenMap); }
      catch (err) { console.error(`[pii-rehydrate] path "${path}" failed:`, err); }
    }
    return updated;
  }

  private rehydrateAtPath(obj: any, path: string, tokenMap: Record<string, string>): void {
    const parts = path.split(".");
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (part.endsWith("[]")) {
        const key = part.slice(0, -2);
        const arr = current[key];
        if (!Array.isArray(arr)) return;
        const remainingPath = parts.slice(i + 1).join(".");
        for (const item of arr) this.rehydrateAtPath(item, remainingPath, tokenMap);
        return;
      }
      current = current[part];
      if (current == null) return;
    }
    const targetKey = parts[parts.length - 1];
    if (typeof current[targetKey] === "string") {
      current[targetKey] = this.rehydrate(current[targetKey], tokenMap);
    }
  }

  sanitizeReportsForStorage(reports: MaskingReport[]): SanitizedReport[] {
    return reports.map(({ tokenMap: _dropped, ...safe }) => safe);
  }

  aggregateEntityCounts(reports: MaskingReport[]): Record<string, number> {
    const totals: Record<string, number> = {};
    for (const r of reports) {
      for (const [type, count] of Object.entries(r.entitiesFound)) {
        totals[type] = (totals[type] || 0) + count;
      }
    }
    return totals;
  }
}
