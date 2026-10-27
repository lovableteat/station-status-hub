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
  { key: "actions", label: "狀態追蹤 / 更新", locked: true, ceHeader: "" },
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

export interface BomProjectGroup<T> {
  key: string;
  projectId: string | null;
  label: string;
  isActive: boolean;
  workspaces: T[];
}

export const UNASSIGNED_BOM_PROJECT_LABEL = "未指定專案";

const BOM_PROJECT_COLLATOR = new Intl.Collator("zh-Hant", { numeric: true, sensitivity: "base" });

/**
 * Groups BOMs under their project: the active project first (kept even while
 * it has no BOM so the empty state stays visible), other projects by name,
 * BOMs without a project last. Workspace order inside a group is preserved.
 */
export function groupBomWorkspacesByProject<T extends { id: string; project?: { projectId: string; projectName: string } | null }>(
  workspaces: readonly T[],
  options: { activeProjectId?: string | null; activeProjectName?: string | null; projectNames?: ReadonlyMap<string, string> } = {},
): BomProjectGroup<T>[] {
  const activeProjectId = options.activeProjectId ?? null;
  const groups = new Map<string, BomProjectGroup<T>>();
  const ensureGroup = (projectId: string | null, fallbackName: string) => {
    const key = projectId ?? "unassigned";
    let group = groups.get(key);
    if (!group) {
      const liveName = projectId ? options.projectNames?.get(projectId) : undefined;
      group = {
        key,
        projectId,
        label: projectId ? liveName || fallbackName || projectId : UNASSIGNED_BOM_PROJECT_LABEL,
        isActive: projectId !== null && projectId === activeProjectId,
        workspaces: [],
      };
      groups.set(key, group);
    }
    return group;
  };

  if (activeProjectId) ensureGroup(activeProjectId, options.activeProjectName ?? "");
  for (const workspace of workspaces) {
    ensureGroup(workspace.project?.projectId ?? null, workspace.project?.projectName ?? "").workspaces.push(workspace);
  }

  return [...groups.values()].sort((left, right) => {
    if (left.isActive !== right.isActive) return left.isActive ? -1 : 1;
    if ((left.projectId === null) !== (right.projectId === null)) return left.projectId === null ? 1 : -1;
    return BOM_PROJECT_COLLATOR.compare(left.label, right.label);
  });
}

/**
 * Maps a ui_table_preferences key back to its BOM id. BOM ids contain ':'
 * themselves (`bom:<file>`), so only the known prefix is stripped.
 */
export function getBomPreferenceWorkspaceId(tableKey: string, prefixes: readonly string[]) {
  const prefix = prefixes.find((candidate) => tableKey.startsWith(candidate));
  const workspaceId = prefix ? tableKey.slice(prefix.length) : "";
  return workspaceId || undefined;
}

export type PendingMaterialCategory = "connector" | "ic" | "rlc" | "other";

/** Categories for the 待處理料 dialog, in handling priority: connectors and ICs first, passives next. */
export const PENDING_MATERIAL_CATEGORIES: ReadonlyArray<{ key: PendingMaterialCategory; label: string; hint: string; priority: boolean }> = [
  { key: "connector", label: "CONNECTOR", hint: "J 開頭", priority: true },
  { key: "ic", label: "IC", hint: "U 開頭", priority: true },
  { key: "rlc", label: "RLC 被動元件", hint: "R／L／C 開頭：電阻、電感、電容", priority: false },
  { key: "other", label: "其他", hint: "其餘位號", priority: false },
];

/** Classifies a part by the letter prefix of its first reference designator. */
export function getPendingMaterialCategory(refDes: string): PendingMaterialCategory {
  const prefix = (refDes.trim().match(/^[A-Za-z]+/)?.[0] ?? "").toUpperCase();
  if (prefix.startsWith("J")) return "connector";
  if (prefix.startsWith("U")) return "ic";
  if (/^[RLC]/.test(prefix)) return "rlc";
  return "other";
}

export function isPendingMaterialCategory(value: unknown): value is PendingMaterialCategory {
  return PENDING_MATERIAL_CATEGORIES.some((category) => category.key === value);
}

type PendingCategorySource = {
  displayRef: string;
  primaryRecord?: { pendingCategory?: string | null } | null;
  records?: ReadonlyArray<{ pendingCategory?: string | null }>;
};

/** A category chosen by hand on any row of the part wins (the main row first); otherwise the Ref Des prefix decides. */
export function resolvePendingMaterialCategory(group: PendingCategorySource): { category: PendingMaterialCategory; manual: boolean } {
  const manual = [group.primaryRecord, ...(group.records ?? [])].map((record) => record?.pendingCategory).find(isPendingMaterialCategory);
  return manual ? { category: manual, manual: true } : { category: getPendingMaterialCategory(group.displayRef), manual: false };
}

export function groupPendingMaterials<T extends PendingCategorySource>(groups: readonly T[]) {
  const buckets = new Map<PendingMaterialCategory, T[]>(PENDING_MATERIAL_CATEGORIES.map((category) => [category.key, []]));
  for (const group of groups) buckets.get(resolvePendingMaterialCategory(group).category)!.push(group);
  return PENDING_MATERIAL_CATEGORIES
    .map((category) => ({ ...category, groups: buckets.get(category.key) ?? [] }))
    .filter((category) => category.groups.length > 0);
}

type ApplicationRecord = { id: string; needsApplication?: boolean; applicationExempt?: boolean; manufacturer?: string | null; manufacturerPartNumber?: string | null; name?: string | null };

export interface PendingApplication<G, R extends ApplicationRecord> {
  key: string;
  group: G;
  record: R;
  displayRef: string;
  name: string;
  primaryRecord: G extends { primaryRecord: infer P } ? P : never;
  records: G extends { records: infer L } ? L : never;
  searchText: string;
}

/**
 * Lines for the 待處理料 dialog. By default a location is listed once, and only
 * when none of its vendor rows has a 實體料號 or 虛擬料號. With
 * includeAlternates every vendor row without either number gets its own line,
 * even when another vendor of the same location already has one (each
 * manufacturer's part is applied for separately). Locations are never merged.
 */
export function buildPendingApplications<
  G extends { key: string; displayRef: string; name: string; searchText: string; primaryRecord: ApplicationRecord; records: readonly ApplicationRecord[] },
>(groups: readonly G[], { includeAlternates = false }: { includeAlternates?: boolean } = {}): Array<PendingApplication<G, G["records"][number]>> {
  type R = G["records"][number];
  const result: Array<PendingApplication<G, R>> = [];
  for (const group of groups) {
    const seen = new Set<string>();
    const rows = [group.primaryRecord as R, ...group.records].filter((record) => !record.applicationExempt && !seen.has(record.id) && seen.add(record.id));
    const lines = includeAlternates
      ? rows.filter((record) => record.needsApplication)
      : rows.length > 0 && rows.every((record) => record.needsApplication) ? [rows.find(record => record.id === group.primaryRecord.id) ?? rows[0]] : [];
    for (const record of lines) {
      result.push({
        key: `${group.key}::${record.id}`,
        group,
        record,
        displayRef: group.displayRef,
        name: record.name?.trim() || group.name,
        primaryRecord: group.primaryRecord as PendingApplication<G, R>["primaryRecord"],
        records: group.records as PendingApplication<G, R>["records"],
        searchText: `${group.searchText} ${(record.manufacturer ?? "").toLowerCase()} ${(record.manufacturerPartNumber ?? "").toLowerCase()}`,
      });
    }
  }
  return result;
}
