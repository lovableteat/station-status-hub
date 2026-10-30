export type MaterialColumnSort<K extends string = string> = { key: K; direction: "asc" | "desc" };

const COLUMN_COLLATOR = new Intl.Collator("zh-Hant", { numeric: true, sensitivity: "base" });
const normalizeSortValue = (value: unknown) => String(value ?? "").normalize("NFKC").trim();

/** Sort the complete matching vendor list before pagination. Empty cells stay last in both directions. */
export function sortMaterialTableRows<T>(rows: readonly T[], direction: "asc" | "desc", valueOf: (row: T) => unknown) {
  return rows.map((row, index) => ({ row, index, value: normalizeSortValue(valueOf(row)) }))
    .sort((left, right) => {
      if (!left.value || !right.value) return Number(!left.value) - Number(!right.value) || left.index - right.index;
      const compared = COLUMN_COLLATOR.compare(left.value, right.value);
      return (direction === "asc" ? compared : -compared) || left.index - right.index;
    }).map(({ row }) => row);
}

export function restoreMaterialColumnSort<K extends string>(value: unknown, keys: readonly K[]): MaterialColumnSort<K> | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  return keys.includes(candidate.key as K) && (candidate.direction === "asc" || candidate.direction === "desc")
    ? { key: candidate.key as K, direction: candidate.direction }
    : null;
}
