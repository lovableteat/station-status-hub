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
