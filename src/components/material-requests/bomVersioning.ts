/**
 * BOM series and versions. A version is an ordinary BomWorkspace; the series
 * metadata lives beside it (ui_table_preferences `material-bom-version:<id>`).
 * Pure helpers only, shared by storage, the page and tests.
 */
import type { BomWorkspace, BomWorkspaceArchive, BomWorkspaceProject } from "./materialBomStorage";

export interface BomVersionSource {
  name: string;
  path: string;
  size: number;
  mimeType: string;
}

export interface BomVersionCarry {
  matched: number;
  orphaned: number;
  manual: number;
}

export interface BomWorkspaceVersion {
  seriesId: string;
  seriesName: string;
  versionNumber: number;
  label: string;
  note: string;
  uploadedAt: string;
  uploadedBy: string;
  previousWorkspaceId?: string;
  isCurrent: boolean;
  currentChangedAt: string;
  carry?: BomVersionCarry;
  source?: BomVersionSource;
}

export interface BomSeriesVersion {
  workspace: BomWorkspace;
  version: BomWorkspaceVersion;
  /** True when this version is stored beside the workspace (not derived for a legacy BOM). */
  stored: boolean;
  isCurrent: boolean;
  /** "V3", or "V3 (2)" when two uploads received the same number. */
  displayNumber: string;
}

export interface BomSeries {
  id: string;
  name: string;
  /** Oldest first. */
  versions: BomSeriesVersion[];
  current: BomSeriesVersion;
  project?: BomWorkspaceProject;
  archive?: BomWorkspaceArchive;
  recordCount: number;
  updatedAt: string;
}

export const BOM_VERSION_LABEL_LIMIT = 60;
export const BOM_VERSION_NOTE_LIMIT = 500;
export const BOM_SERIES_NAME_LIMIT = 120;

const text = (value: unknown) => (typeof value === "string" ? value.normalize("NFKC").replace(/\s+/g, " ").trim() : "");

export function normalizeBomVersion(raw: unknown, fallbackUpdatedAt: string): BomWorkspaceVersion | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const candidate = raw as Partial<BomWorkspaceVersion> & { source?: Partial<BomVersionSource>; carry?: Partial<BomVersionCarry> };
  const seriesId = text(candidate.seriesId);
  const versionNumber = Number(candidate.versionNumber);
  if (!seriesId || !Number.isInteger(versionNumber) || versionNumber < 1) return undefined;
  const source = candidate.source && typeof candidate.source === "object" && text(candidate.source.path)
    ? { name: text(candidate.source.name) || "BOM.xlsx", path: text(candidate.source.path), size: Number(candidate.source.size) || 0, mimeType: text(candidate.source.mimeType) || "application/octet-stream" }
    : undefined;
  const carry = candidate.carry && typeof candidate.carry === "object"
    ? { matched: Math.max(0, Number(candidate.carry.matched) || 0), orphaned: Math.max(0, Number(candidate.carry.orphaned) || 0), manual: Math.max(0, Number(candidate.carry.manual) || 0) }
    : undefined;
  return {
    seriesId,
    seriesName: text(candidate.seriesName).slice(0, BOM_SERIES_NAME_LIMIT),
    versionNumber,
    label: text(candidate.label).slice(0, BOM_VERSION_LABEL_LIMIT),
    note: typeof candidate.note === "string" ? candidate.note.trim().slice(0, BOM_VERSION_NOTE_LIMIT) : "",
    uploadedAt: text(candidate.uploadedAt) || fallbackUpdatedAt,
    uploadedBy: text(candidate.uploadedBy),
    previousWorkspaceId: text(candidate.previousWorkspaceId) || undefined,
    isCurrent: candidate.isCurrent === true,
    currentChangedAt: text(candidate.currentChangedAt) || text(candidate.uploadedAt) || fallbackUpdatedAt,
    carry,
    source,
  };
}

/** A BOM without stored version metadata is a one-version series named after itself. */
export function deriveLegacyBomVersion(workspace: Pick<BomWorkspace, "id" | "name" | "payload" | "updatedAt">): BomWorkspaceVersion {
  return {
    seriesId: workspace.id,
    seriesName: workspace.name,
    versionNumber: 1,
    label: "",
    note: "",
    uploadedAt: workspace.payload.generatedAt || workspace.updatedAt,
    uploadedBy: "",
    isCurrent: true,
    currentChangedAt: workspace.payload.generatedAt || workspace.updatedAt,
  };
}

const time = (value: string) => {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

function compareVersions(left: BomSeriesVersion, right: BomSeriesVersion) {
  return left.version.versionNumber - right.version.versionNumber
    || time(left.version.uploadedAt) - time(right.version.uploadedAt)
    || left.workspace.id.localeCompare(right.workspace.id);
}

/** Resolves the current version: the newest `isCurrent` flag wins, otherwise the highest number. */
export function resolveCurrentBomVersion(versions: readonly BomSeriesVersion[]): BomSeriesVersion {
  const flagged = versions.filter((item) => item.version.isCurrent);
  if (flagged.length > 0) {
    return flagged.reduce((best, item) => (time(item.version.currentChangedAt) > time(best.version.currentChangedAt) ? item : best));
  }
  return versions.reduce((best, item) => (compareVersions(item, best) > 0 ? item : best));
}

/** Groups workspaces into series; legacy BOMs become their own series. Series are ordered newest activity first. */
export function buildBomSeriesList(workspaces: readonly BomWorkspace[]): BomSeries[] {
  const buckets = new Map<string, BomSeriesVersion[]>();
  for (const workspace of workspaces) {
    const stored = Boolean(workspace.version);
    const version = workspace.version ?? deriveLegacyBomVersion(workspace);
    const list = buckets.get(version.seriesId) ?? [];
    list.push({ workspace, version, stored, isCurrent: false, displayNumber: "" });
    buckets.set(version.seriesId, list);
  }
  const series: BomSeries[] = [];
  for (const [id, versions] of buckets) {
    versions.sort(compareVersions);
    const current = resolveCurrentBomVersion(versions);
    const seen = new Map<number, number>();
    for (const item of versions) {
      const count = (seen.get(item.version.versionNumber) ?? 0) + 1;
      seen.set(item.version.versionNumber, count);
      item.displayNumber = count > 1 ? `V${item.version.versionNumber} (${count})` : `V${item.version.versionNumber}`;
      item.isCurrent = item === current;
    }
    const named = [...versions].sort((left, right) => time(right.version.currentChangedAt) - time(left.version.currentChangedAt));
    const name = current.version.seriesName || named.map((item) => item.version.seriesName).find(Boolean) || current.workspace.name;
    series.push({
      id,
      name,
      versions,
      current,
      project: current.workspace.project,
      archive: current.workspace.archive,
      recordCount: current.workspace.payload.recordCount,
      updatedAt: versions.reduce((latest, item) => (time(item.workspace.updatedAt) > time(latest) ? item.workspace.updatedAt : latest), current.workspace.updatedAt),
    });
  }
  return series.sort((left, right) => time(right.updatedAt) - time(left.updatedAt) || left.name.localeCompare(right.name));
}

export function findBomSeriesByWorkspace(seriesList: readonly BomSeries[], workspaceId: string) {
  for (const series of seriesList) {
    const version = series.versions.find((item) => item.workspace.id === workspaceId);
    if (version) return { series, version };
  }
  return null;
}

export function nextBomVersionNumber(series: Pick<BomSeries, "versions"> | null | undefined) {
  return (series?.versions ?? []).reduce((max, item) => Math.max(max, item.version.versionNumber), 0) + 1;
}

export function bomFileBaseName(fileName: string) {
  const trimmed = text(fileName);
  const dot = trimmed.lastIndexOf(".");
  return dot > 0 ? trimmed.slice(0, dot) : trimmed;
}

/** Unicode-aware slug: letters and digits of any script are kept, everything else becomes "-". */
export function bomSeriesSlug(value: string) {
  return text(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
}

const VERSION_SUFFIXES = [
  /-(?:v|ver|version|rev|r)-?\d+[a-z]?$/u,
  /-rev-?[a-z]$/u,
  /-\d{8}$/u,
  /-\d{4}-\d{2}-\d{2}$/u,
  /-\d{6}$/u,
  /-(?:copy|final|new|latest|old|backup|draft|update|updated)$/u,
  /-\d+$/u,
];

/** Drops trailing version, date and copy markers so `board_v2` and `board_20260706` share a stem. */
export function bomSeriesStem(value: string) {
  let slug = bomSeriesSlug(bomFileBaseName(value));
  for (let guard = 0; guard < 6; guard += 1) {
    const next = VERSION_SUFFIXES.reduce((current, pattern) => current.replace(pattern, ""), slug);
    if (next === slug || !next) break;
    slug = next;
  }
  return slug;
}

/**
 * Suggests the series a file belongs to: an exact source-file match first, then a
 * shared stem. Returns null when nothing matches so the caller offers a new series.
 */
export function inferBomSeriesForFile(fileName: string, seriesList: readonly BomSeries[]): BomSeries | null {
  const candidates = seriesList.filter((series) => !series.archive);
  const wanted = text(fileName).toLowerCase();
  const exact = candidates.find((series) => series.versions.some((item) => text(item.workspace.payload.sourceFile).toLowerCase() === wanted || text(item.workspace.name).toLowerCase() === wanted));
  if (exact) return exact;
  const stem = bomSeriesStem(fileName);
  if (!stem) return null;
  return candidates.find((series) => bomSeriesStem(series.name) === stem
    || series.versions.some((item) => bomSeriesStem(item.workspace.payload.sourceFile) === stem)) ?? null;
}

const randomToken = (length: number) => {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const source = typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function"
    ? crypto.getRandomValues(new Uint8Array(length))
    : Uint8Array.from({ length }, () => Math.floor(Math.random() * 256));
  return Array.from(source, (byte) => alphabet[byte % alphabet.length]).join("");
};

export function createBomSeriesId() {
  const uuid = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now().toString(36)}-${randomToken(12)}`;
  return `series:${uuid}`;
}

/** New version ids are never derived from the file name alone, so uploads cannot overwrite each other. */
export function createBomVersionWorkspaceId(seriesName: string, versionNumber: number, token = randomToken(6)) {
  const slug = (bomSeriesSlug(seriesName) || "bom").slice(0, 48);
  return `bom:${slug}:v${versionNumber}:${token}`;
}

export function formatBomVersionTitle(version: Pick<BomSeriesVersion, "displayNumber" | "version">) {
  return version.version.label ? `${version.displayNumber} · ${version.version.label}` : version.displayNumber;
}
