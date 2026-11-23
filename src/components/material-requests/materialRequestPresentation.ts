import { isTrackedMaterialApplication } from "./materialTrackingStatus.ts";

export type RetainedReason = "gone" | "uncarried" | "manual";

/** Why a line from another version is listed, in the words used on its row, in exports and in the weekly report. */
export function describeRetainedReason(reason: RetainedReason, newer = false) {
  // A later version's application never flows back into an earlier one, so it is not "not carried": this version lacks it.
  return reason === "manual" ? "這一版沒有" : reason === "gone" ? "這一版沒有這顆料" : newer ? "這一版沒有這筆申請" : "沒帶入這一版";
}

/** "V2 手動新增 · 這一版沒有", "V1 申請 · 這一版沒有這顆料": where a line from another version comes from. */
export function describeRetainedSource(from: { label: string; reason: RetainedReason; newer?: boolean }, separator = " · ") {
  return `${from.label} ${from.reason === "manual" ? "手動新增" : "申請"}${separator}${describeRetainedReason(from.reason, from.newer)}`;
}

/** The longer explanation behind describeRetainedSource, for the row's hover text. */
export function explainRetainedSource(from: { label: string; reason: RetainedReason; newer?: boolean }) {
  if (from.reason === "manual") return `${from.label} 手動新增的料，這一版的 BOM 沒有；要在這一版申請，請到料號表新增`;
  if (from.reason === "gone") return `${from.label} 的申請；這一版的 BOM 沒有這顆料（位號、廠商或 MPN 換了），紀錄留在 ${from.label}，這裡唯讀`;
  if (from.newer) return `${from.label} 的申請；這一版也有這顆料，但這筆申請是在 ${from.label} 做的，紀錄留在 ${from.label}，這裡唯讀`;
  return `${from.label} 的申請；這一版有這顆料，但無法自動帶入（這一版那列已有自己的資料，或申請來自更早的版本），請在料號表更新這一版那列`;
}

const PENDING_HISTORY_FIRST = ["實體料號", "虛擬料號", "Manufacturer Part Number", "Manufacturer", "Ref Des", "Qty"];

/** A line of the version on screen: added there, or since which version, and what changed since the previous one. */
export interface PendingLineHistory {
  added: boolean;
  since?: string;
  previousLabel?: string;
  changes: ReadonlyArray<{ label: string; before: string; after: string }>;
}

/**
 * The version note under a 待處理料 line (E1.s V16, 2026-11-23: 「沒有標註每顆料是哪個版本，差異等訊息」):
 * "V16 新增", "自 V3 · 沒變", "自 V3 · V15→V16 改 實體料號、Ref Des". `detail` lists every change for the hover text and exports.
 */
export function describePendingLineHistory(history: PendingLineHistory, versionLabel = "這一版"): { kind: "added" | "changed" | "same"; text: string; detail: string } {
  if (history.added) {
    return { kind: "added", text: `${versionLabel} 新增`, detail: `${history.previousLabel ?? "上一版"} 沒有這顆料（位號、廠商或 MPN 不同），是 ${versionLabel} 才加入的` };
  }
  const since = history.since ? `自 ${history.since}` : "";
  const step = `${history.previousLabel ?? "上一版"}→${versionLabel}`;
  if (history.changes.length === 0) {
    return { kind: "same", text: [since, `${step} 沒變`].filter(Boolean).join(" · "), detail: `${since ? `${since} 起就在這塊板子上；` : ""}${step} 這顆料沒有變更` };
  }
  // 料號 first: it decides whether a part still needs an application, so it must never hide behind "等 N 項".
  const rank = (label: string) => { const index = PENDING_HISTORY_FIRST.indexOf(label); return index < 0 ? PENDING_HISTORY_FIRST.length : index; };
  const ordered = [...history.changes].sort((left, right) => rank(left.label) - rank(right.label));
  const labels = [...new Set(ordered.map((change) => change.label))];
  const shown = labels.slice(0, 2).join("、") + (labels.length > 2 ? ` 等 ${labels.length} 項` : "");
  const lines = ordered.map((change) => `${change.label}：${change.before || "（空白）"} → ${change.after || "（空白）"}`);
  return { kind: "changed", text: [since, `${step} 改 ${shown}`].filter(Boolean).join(" · "), detail: `${since ? `${since} 起就在這塊板子上。` : ""}${step} 的變更：\n${lines.join("\n")}` };
}

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
  { key: "actions", label: "狀態追蹤 / 編輯", locked: true, ceHeader: "" },
  { key: "note", label: "Note", locked: true, ceHeader: "" },
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
  { key: "connector", label: "CONNECTOR", hint: "J、CN 開頭", priority: true },
  { key: "ic", label: "IC", hint: "U、PU、CPU 開頭", priority: true },
  { key: "rlc", label: "RLC 被動元件", hint: "R／L／C、PR／PL／PC 開頭：電阻、電感、電容", priority: false },
  { key: "other", label: "其他", hint: "其餘位號", priority: false },
];

/** Classifies a part by the letter prefix of its first reference designator. */
export function getPendingMaterialCategory(refDes: string): PendingMaterialCategory {
  const prefix = (refDes.trim().match(/^[A-Za-z]+/)?.[0] ?? "").toUpperCase();
  if (prefix.startsWith("J")) return "connector";
  if (prefix.startsWith("U")) return "ic";
  // CPU and CN start with C but are no capacitors: a CPU is an IC, CN / CON / CONN a connector.
  if (prefix === "CPU") return "ic";
  if (prefix === "CN" || prefix.startsWith("CON")) return "connector";
  if (/^[RLC]/.test(prefix)) return "rlc";
  // Power sections put a P in front: PU power IC, PR／PL／PC power resistor, inductor and capacitor (Baseboard).
  // PJ (power jumper), PQ and PD stay with 其他, like J-less jumpers, Q and D.
  if (prefix === "PU") return "ic";
  if (prefix === "PR" || prefix === "PL" || prefix === "PC") return "rlc";
  return "other";
}

export function isPendingMaterialCategory(value: unknown): value is PendingMaterialCategory {
  return PENDING_MATERIAL_CATEGORIES.some((category) => category.key === value);
}

type PendingCategorySource = {
  displayRef: string;
  record?: { pendingCategory?: string | null };
  primaryRecord?: { pendingCategory?: string | null } | null;
  records?: ReadonlyArray<{ pendingCategory?: string | null }>;
};

/** An explicit vendor-row choice wins, then any category saved for the location, then its Ref Des prefix. */
export function resolvePendingMaterialCategory(group: PendingCategorySource): { category: PendingMaterialCategory; manual: boolean } {
  const manual = [group.record, group.primaryRecord, ...(group.records ?? [])].map((record) => record?.pendingCategory).find(isPendingMaterialCategory);
  return manual ? { category: manual, manual: true } : { category: getPendingMaterialCategory(group.displayRef), manual: false };
}

export function groupPendingMaterials<T extends PendingCategorySource>(groups: readonly T[]) {
  const buckets = new Map<PendingMaterialCategory, T[]>(PENDING_MATERIAL_CATEGORIES.map((category) => [category.key, []]));
  for (const group of groups) buckets.get(resolvePendingMaterialCategory(group).category)!.push(group);
  return PENDING_MATERIAL_CATEGORIES
    .map((category) => ({ ...category, groups: buckets.get(category.key) ?? [] }))
    .filter((category) => category.groups.length > 0);
}

type ApplicationRecord = { id: string; needsApplication?: boolean; applicationRequired?: boolean; applicationExempt?: boolean; manufacturer?: string | null; manufacturerPartNumber?: string | null; name?: string | null; trackingStatus?: string; trackingHistory?: readonly { id: string; status: string }[]; requestOwnerName?: string; pendingCategory?: string | null };

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
 * manufacturer's part is applied for separately). Recorded applications, including
 * completed ones, remain in either view. Locations are never merged.
 */
export function buildPendingApplications<
  G extends { key: string; displayRef: string; name: string; searchText: string; primaryRecord: ApplicationRecord; records: readonly ApplicationRecord[] },
>(groups: readonly G[], { includeAlternates = false }: { includeAlternates?: boolean } = {}): Array<PendingApplication<G, G["records"][number]>> {
  type R = G["records"][number];
  const result: Array<PendingApplication<G, R>> = [];
  for (const group of groups) {
    const seen = new Set<string>();
    const rows = [group.primaryRecord as R, ...group.records].filter((record) => !record.applicationExempt && !seen.has(record.id) && seen.add(record.id));
    const explicit = rows.filter(isTrackedMaterialApplication);
    const lines = includeAlternates
      ? rows.filter((record) => record.needsApplication || isTrackedMaterialApplication(record))
      : [...new Map([
        ...(rows.length > 0 && rows.every(record => record.needsApplication) ? [rows.find(record => record.id === group.primaryRecord.id) ?? rows[0]] : []),
        ...explicit,
      ].map(record => [record.id, record])).values()];
    for (const record of lines) {
      result.push({
        key: `${group.key}::${record.id}`,
        group,
        record,
        displayRef: group.displayRef,
        name: record.name?.trim() || group.name,
        primaryRecord: group.primaryRecord as PendingApplication<G, R>["primaryRecord"],
        records: group.records as PendingApplication<G, R>["records"],
        searchText: `${group.searchText} ${(record.manufacturer ?? "").toLowerCase()} ${(record.manufacturerPartNumber ?? "").toLowerCase()} ${(record.requestOwnerName ?? "").toLowerCase()} ${(record.trackingStatus ?? "").toLowerCase()} ${record.applicationRequired === true ? "需申請" : ""}`,
      });
    }
  }
  return result;
}
