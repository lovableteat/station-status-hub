import type { BomChangeImpact, BomChangeKind, BomDiffEntry } from "./bomDiff.ts";

export const BOM_DIFF_EMPTY_TEXT = "目前篩選條件沒有符合的差異";

export interface BomDiffFilters {
  query: string;
  kinds: BomChangeKind[];
  impact: BomChangeImpact | "all";
  trackingLostOnly: boolean;
  includeUnchanged: boolean;
}

export const EMPTY_BOM_DIFF_FILTERS: BomDiffFilters = { query: "", kinds: [], impact: "all", trackingLostOnly: false, includeUnchanged: false };

/** 隱藏未變更 hides positions with no change at all; one whose old website data is missing in the new version is not unchanged. */
export function isHiddenAsUnchanged(entry: Pick<BomDiffEntry, "kinds" | "trackingLost">) {
  return entry.kinds.length === 0 && entry.trackingLost === 0;
}

/** Pure so the persistent-filter contract can be tested without React. */
export function filterBomDiffEntries(entries: readonly BomDiffEntry[], filters: BomDiffFilters) {
  const tokens = filters.query.toLowerCase().split(/\s+/).map((token) => token.trim()).filter(Boolean);
  return entries.filter((entry) => {
    if (!filters.includeUnchanged && isHiddenAsUnchanged(entry)) return false;
    if (filters.kinds.length > 0 && !filters.kinds.some((kind) => entry.kinds.includes(kind))) return false;
    if (filters.impact !== "all" && entry.impact !== filters.impact) return false;
    if (filters.trackingLostOnly && entry.trackingLost === 0) return false;
    return tokens.every((token) => entry.searchText.includes(token));
  });
}
