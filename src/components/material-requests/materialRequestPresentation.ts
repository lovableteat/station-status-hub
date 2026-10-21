export interface CompactValueSummary {
  fullText: string;
  isTruncated: boolean;
  preview: string;
  remainingCount: number;
  values: string[];
}

export function createCompactValueSummary(
  source: string | string[],
  options: { emptyLabel?: string; maxItems?: number } = {},
): CompactValueSummary {
  const maxItems = Math.max(1, Math.trunc(options.maxItems ?? 3));
  const rawValues = Array.isArray(source)
    ? source
    : source.split(/[\n,;，、]+/g);
  const values = Array.from(new Set(rawValues.map((value) => value.trim()).filter(Boolean)));
  const displayValues = values.length > 0 ? values : [options.emptyLabel ?? "-"];
  const previewValues = displayValues.slice(0, maxItems);
  const remainingCount = Math.max(0, displayValues.length - previewValues.length);

  return {
    fullText: displayValues.join("、"),
    isTruncated: remainingCount > 0,
    preview: previewValues.join("、"),
    remainingCount,
    values: displayValues,
  };
}

export function getMaterialExportScopeLabel(activeFilters: string[]) {
  return activeFilters.length > 0
    ? `目前篩選結果（${activeFilters.length} 個條件）`
    : "全部資料";
}

export function resizeMaterialColumnWidths({
  adjacentIndex: adjacentIndexOverride,
  index,
  maxWidths,
  minWidths,
  requestedWidth,
  widths,
}: {
  /** Column that gives up width; defaults to the next column. Pass the next *visible* column when some are hidden; -1 means none. */
  adjacentIndex?: number;
  index: number;
  maxWidths: number[];
  minWidths: number[];
  requestedWidth: number;
  widths: number[];
}) {
  if (index < 0 || index >= widths.length) return widths;

  const next = [...widths];
  const targetWidth = Math.min(
    maxWidths[index] ?? Number.POSITIVE_INFINITY,
    Math.max(minWidths[index] ?? 0, requestedWidth),
  );
  const adjacentIndex = adjacentIndexOverride ?? index + 1;

  if (adjacentIndex <= index || adjacentIndex >= widths.length) {
    next[index] = targetWidth;
    return next;
  }

  const requestedDelta = targetWidth - widths[index];
  const adjacentWidth = Math.min(
    maxWidths[adjacentIndex] ?? Number.POSITIVE_INFINITY,
    Math.max(minWidths[adjacentIndex] ?? 0, widths[adjacentIndex] - requestedDelta),
  );
  const appliedDelta = widths[adjacentIndex] - adjacentWidth;
  next[index] = widths[index] + appliedDelta;
  next[adjacentIndex] = adjacentWidth;
  return next;
}

export function getMaterialStickyColumnClasses() {
  return {
    header: "sticky right-0 z-40 border-r border-blue-300/20 bg-[#0d2137] text-center",
    filter: "sticky right-0 z-40 border-r border-blue-300/20 bg-[#10263a] p-2 text-center",
    row: "sticky right-0 z-10 border-r border-blue-400/10 bg-[var(--material-row-solid)] transition-colors group-hover/material-row:bg-[var(--material-row-hover-solid)]",
  };
}

export function createClipboardImageName(mimeType: string, value = new Date()) {
  const pad = (part: number) => String(part).padStart(2, "0");
  const extension = mimeType.toLowerCase().includes("png") ? "png" : "jpg";

  return [
    "clipboard-",
    value.getUTCFullYear(),
    pad(value.getUTCMonth() + 1),
    pad(value.getUTCDate()),
    "-",
    pad(value.getUTCHours()),
    pad(value.getUTCMinutes()),
    pad(value.getUTCSeconds()),
    ".",
    extension,
  ].join("");
}

export function getBomPageProgress(currentPageValue: number, totalPagesValue: number) {
  const totalPages = Number.isFinite(totalPagesValue)
    ? Math.max(0, Math.trunc(totalPagesValue))
    : 0;
  const currentPage = totalPages > 0 && Number.isFinite(currentPageValue)
    ? Math.min(totalPages, Math.max(0, Math.trunc(currentPageValue)))
    : 0;

  return {
    currentPage,
    percentage: totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0,
    totalPages,
  };
}

export function hasRenderableBomWorkspaceCache(
  result: {
    workspaces?: Array<{
      id?: string;
      isLoaded?: boolean;
      payload?: { records?: unknown[] };
    }>;
  } | null | undefined,
  preferredWorkspaceId: string,
) {
  const workspace = result?.workspaces?.find((candidate) => candidate.id === preferredWorkspaceId);
  return Boolean(
    workspace
    && workspace.isLoaded !== false
    && Array.isArray(workspace.payload?.records),
  );
}

export function shouldApplyBomWorkspaceCache({
  active,
  currentRequest,
  preferredWorkspaceId,
  remoteSettled,
  result,
}: {
  active: boolean;
  currentRequest: boolean;
  preferredWorkspaceId: string;
  remoteSettled: boolean;
  result: Parameters<typeof hasRenderableBomWorkspaceCache>[0];
}) {
  return active
    && currentRequest
    && !remoteSettled
    && hasRenderableBomWorkspaceCache(result, preferredWorkspaceId);
}

export const MATERIAL_TABLE_COLUMNS = [
  // Website columns first, then the CE workbook columns in workbook order, then the website columns that follow the data.
  { key: "item", label: "Item", locked: false, ceHeader: "" },
  { key: "marked", label: "標記", locked: false, ceHeader: "" },
  { key: "name", label: "Name", locked: true, ceHeader: "Name" },
  { key: "qty", label: "Qty", locked: false, ceHeader: "Qty" },
  { key: "refDes", label: "Ref Des", locked: false, ceHeader: "Ref Des" },
  { key: "mpn", label: "Manufacturer Part Number", locked: false, ceHeader: "Manufacturer Part Number" },
  { key: "manufacturer", label: "Manufacturer", locked: false, ceHeader: "Manufacturer" },
  { key: "sourcingStatus", label: "Sourcing Status", locked: false, ceHeader: "Sourcing Status" },
  { key: "virtual", label: "虛擬料號", locked: false, ceHeader: "虛擬料號" },
  { key: "physical", label: "實體料號", locked: false, ceHeader: "實體料號" },
  { key: "partName", label: "Part Name", locked: false, ceHeader: "Part Name" },
  { key: "partSpec", label: "Part Spec", locked: false, ceHeader: "Part Spec" },
  { key: "schematicPart", label: "Schematic_Part", locked: false, ceHeader: "Schematic_Part" },
  { key: "footprint", label: "PCB_Footprint", locked: false, ceHeader: "PCB_Footprint" },
  { key: "phaseOut", label: "phase out", locked: false, ceHeader: "phase out" },
  { key: "partUsage", label: "零件狀態", locked: false, ceHeader: "零件狀態" },
  { key: "status", label: "建料狀態", locked: false, ceHeader: "" },
  { key: "tracking", label: "狀態追蹤", locked: false, ceHeader: "" },
  { key: "actions", label: "資料更新", locked: true, ceHeader: "" },
] as const;

export type MaterialTableColumnKey = (typeof MATERIAL_TABLE_COLUMNS)[number]["key"];

/**
 * Keeps only known, hideable column keys so a stale or edited preference can
 * never hide the material or action columns.
 */
export function normalizeHiddenMaterialColumns(value: unknown): MaterialTableColumnKey[] {
  if (!Array.isArray(value)) return [];
  const hideable = new Set<string>(
    MATERIAL_TABLE_COLUMNS.filter((column) => !column.locked).map((column) => column.key),
  );
  return Array.from(new Set(
    value.filter((key): key is MaterialTableColumnKey => typeof key === "string" && hideable.has(key)),
  ));
}

export function getMaterialTableWidth(widths: readonly number[], hiddenColumns: readonly string[]) {
  const hidden = new Set(hiddenColumns);
  return MATERIAL_TABLE_COLUMNS.reduce(
    (total, column, index) => (hidden.has(column.key) ? total : total + (widths[index] ?? 0)),
    0,
  );
}

export function getMaterialSourceValue(value?: string) {
  return value?.trim() ? value : "未提供";
}
