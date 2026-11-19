import { normalizeMaterialSearchText } from "./materialRequestUtils";

// Values behind the Excel-style column filter (ExcelFilterPopover): option shape, normalising and matching.

export interface ExcelFilterOption {
  label: string;
  value: string;
  count: number;
  keywords?: string;
  tone?: ExcelFilterTone;
}

export type ExcelFilterTone = "emerald" | "amber" | "sky" | "rose" | "slate";
export type ColumnFilterSelection = string[] | null;

export const FILTER_OPTION_ROW_HEIGHT = 38;
export const FILTER_OPTION_LIST_HEIGHT = 224;
export const FILTER_OPTION_OVERSCAN = 8;

export function parseSearchTokens(query: string) {
  return (query.match(/"[^"]+"|\S+/g) ?? [])
    .map((token) => normalizeMaterialSearchText(token.replace(/^"|"$/g, "")))
    .filter(Boolean);
}

export function normalizeFilterValue(value: string) {
  const normalized = String(value ?? "").normalize("NFKC").replace(/\u3000/g, " ").trim();
  return normalized || "(空白)";
}

export function uniqueNormalizedValues(values: string[]) {
  return Array.from(new Set(values.map(normalizeFilterValue)));
}

export function matchesExcelFilter(selectedValues: ColumnFilterSelection, candidateValues: string[]) {
  if (selectedValues === null) return true;
  if (selectedValues.length === 0) return false;
  const normalizedCandidates = uniqueNormalizedValues(candidateValues);
  return normalizedCandidates.some((value) => selectedValues.includes(value));
}

export function normalizeColumnFilterSelection(selectedValues: ColumnFilterSelection | undefined) {
  // Filters restored from an older saved layout may lack newer columns.
  if (selectedValues == null) return null;

  return Array.from(new Set(selectedValues.map((value) => normalizeFilterValue(String(value ?? "")))));
}
