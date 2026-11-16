import type { PcbProject } from "../types.ts";

/** Group name used for boards without a 大專案. Always listed last. */
export const UNGROUPED_BOARD_GROUP = "未分類";
export const UNASSIGNED_OWNER = "未指派";

export type BoardSort = "updated" | "name";

export interface BoardListFilters {
  query: string;
  status: "all" | PcbProject["status"];
  /** "all", UNASSIGNED_OWNER, or an owner display name. */
  owner: string;
  sort: BoardSort;
}

export const DEFAULT_BOARD_LIST_FILTERS: BoardListFilters = { query: "", status: "all", owner: "all", sort: "updated" };

/** The board list filters live in the URL so a refresh, back or shared link shows the same list. */
export const PCB_BOARD_QUERY_KEYS = ["pcbQ", "pcbStatus", "pcbOwner", "pcbSort"] as const;

export function readBoardListLocation(search: string): BoardListFilters {
  const params = new URLSearchParams(search);
  const status = params.get("pcbStatus");
  const owner = params.get("pcbOwner")?.trim().slice(0, 60);
  return {
    query: (params.get("pcbQ") ?? "").slice(0, 120),
    status: status === "draft" || status === "review" || status === "approved" ? status : "all",
    owner: owner || "all",
    sort: params.get("pcbSort") === "name" ? "name" : "updated",
  };
}

/** Writes the filters into `url`, leaving defaults out so a plain list keeps a clean link. */
export function writeBoardListLocation(url: URL, filters: BoardListFilters): void {
  const values: Record<(typeof PCB_BOARD_QUERY_KEYS)[number], string> = {
    pcbQ: filters.query.trim() ? filters.query : "",
    pcbStatus: filters.status === "all" ? "" : filters.status,
    pcbOwner: filters.owner === "all" ? "" : filters.owner,
    pcbSort: filters.sort === "updated" ? "" : filters.sort,
  };
  for (const key of PCB_BOARD_QUERY_KEYS) {
    if (values[key]) url.searchParams.set(key, values[key]);
    else url.searchParams.delete(key);
  }
}

export interface BoardFamily {
  /** boardFamilyId, or the board id when the board has no family. */
  id: string;
  /** Newest matching version (latest created): the row the list shows. */
  lead: PcbProject;
  /** Every version of the family, newest (latest created) first. */
  versions: PcbProject[];
  /** Versions that match the filters, newest first. */
  matching: PcbProject[];
  containsActive: boolean;
}

export interface BoardGroup {
  name: string;
  families: BoardFamily[];
}

const ownerText = (project: Pick<PcbProject, "owner">) => {
  const name = project.owner?.displayName;
  return typeof name === "string" ? name.trim() : "";
};

export function boardOwnerName(project: Pick<PcbProject, "owner">): string {
  return ownerText(project) || UNASSIGNED_OWNER;
}

export function boardFamilyId(project: Pick<PcbProject, "id" | "boardFamilyId">): string {
  return project.boardFamilyId || project.id;
}

const byUpdated = (first: PcbProject, second: PcbProject) => second.updatedAt.localeCompare(first.updatedAt);
/** Newest version first: the version created last (建立新版 stamps createdAt), then the latest edit. */
const byVersion = (first: PcbProject, second: PcbProject) => second.createdAt.localeCompare(first.createdAt) || byUpdated(first, second);
const latestEdit = (family: BoardFamily) => family.matching.reduce((latest, project) => project.updatedAt > latest ? project.updatedAt : latest, "");

function matches(project: PcbProject, filters: BoardListFilters, needle: string): boolean {
  if (filters.status !== "all" && project.status !== filters.status) return false;
  if (filters.owner !== "all" && boardOwnerName(project) !== filters.owner) return false;
  if (!needle) return true;
  return [
    project.name, project.description, project.projectGroup, project.revision ?? "1",
    ownerText(project), project.lastEditedBy,
  ].some((value) => typeof value === "string" && value.toLocaleLowerCase().includes(needle));
}

/**
 * The board list: grouped by 大專案 (未分類 last), one family per board with its versions.
 * Filters apply to versions; a family shows when any version matches, led by its newest match.
 */
export function buildBoardList(projects: readonly PcbProject[], filters: BoardListFilters, activeProjectId: string | null): BoardGroup[] {
  const needle = filters.query.trim().toLocaleLowerCase();
  const families = new Map<string, PcbProject[]>();
  for (const project of projects) {
    const id = boardFamilyId(project);
    const list = families.get(id);
    if (list) list.push(project); else families.set(id, [project]);
  }
  const groups = new Map<string, BoardFamily[]>();
  for (const [id, members] of families) {
    const versions = [...members].sort(byVersion);
    const matching = versions.filter((project) => matches(project, filters, needle));
    if (!matching.length) continue;
    const family: BoardFamily = {
      id, lead: matching[0], versions, matching,
      containsActive: versions.some((project) => project.id === activeProjectId),
    };
    // A family follows its newest version's 大專案, so renaming the group on the latest board moves the family.
    const group = versions[0].projectGroup?.trim() || UNGROUPED_BOARD_GROUP;
    const list = groups.get(group);
    if (list) list.push(family); else groups.set(group, [family]);
  }
  const compareFamilies = filters.sort === "name"
    ? (first: BoardFamily, second: BoardFamily) => first.lead.name.localeCompare(second.lead.name, "zh-Hant") || latestEdit(second).localeCompare(latestEdit(first))
    : (first: BoardFamily, second: BoardFamily) => latestEdit(second).localeCompare(latestEdit(first));
  return [...groups.entries()]
    .sort(([first], [second]) => first === UNGROUPED_BOARD_GROUP ? 1 : second === UNGROUPED_BOARD_GROUP ? -1 : first.localeCompare(second, "zh-Hant"))
    .map(([name, list]) => ({ name, families: list.sort(compareFamilies) }));
}

/** Owner names for the filter: names used on boards, then 未指派 when any board has no owner. */
/** Whether a family's version list is open: the user's explicit choice, else open when it holds the open board. */
export function isBoardFamilyOpen(family: Pick<BoardFamily, "id" | "containsActive" | "lead">, activeProjectId: string | null, choices: ReadonlyMap<string, boolean>): boolean {
  return choices.get(family.id) ?? (family.containsActive && family.lead.id !== activeProjectId);
}

export function boardOwnerOptions(projects: readonly PcbProject[]): string[] {
  const names = new Set<string>();
  let unassigned = false;
  for (const project of projects) {
    const name = ownerText(project);
    if (name) names.add(name); else unassigned = true;
  }
  return [...[...names].sort((first, second) => first.localeCompare(second, "zh-Hant")), ...(unassigned ? [UNASSIGNED_OWNER] : [])];
}

/** 「剛剛 / n 分鐘前 / n 小時前 / 昨天 / n 天前 / yyyy/m/d」 in local time. */
export function relativeTimeLabel(iso: string, now = Date.now()): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "";
  const minutes = Math.floor(Math.max(0, now - time) / 60_000);
  if (minutes < 1) return "剛剛";
  if (minutes < 60) return `${minutes} 分鐘前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小時前`;
  const day = (value: number) => { const date = new Date(value); date.setHours(0, 0, 0, 0); return date.getTime(); };
  const days = Math.round((day(now) - day(time)) / 86_400_000);
  if (days <= 1) return "昨天";
  if (days < 7) return `${days} 天前`;
  const date = new Date(time);
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

export function fullTimeLabel(iso: string): string {
  const time = Date.parse(iso);
  return Number.isFinite(time) ? new Date(time).toLocaleString("zh-TW", { hour12: false }) : "";
}

/** 2026/11/17 14:20 — who-did-what records read to the minute; seconds are noise there. */
export function minuteTimeLabel(iso: string): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "";
  const date = new Date(time);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const STATUS_WORDS: Record<PcbProject["status"], string> = { draft: "草稿", review: "審核中", approved: "已核准" };

/**
 * 「王小明 2026/11/17 14:20 改為已核准」 for the current 狀態, or "" when this status has no record
 * (set before 2026-11-17, or the record is for a different status than the board shows).
 */
export function statusChangeLabel(project: Pick<PcbProject, "status" | "statusChange">): string {
  const record = statusChangeRecord(project);
  return record ? `${record.by ? `${record.by} ` : ""}${record.when} 改為${STATUS_WORDS[project.status]}` : "";
}

export function statusChangeRecord(project: Pick<PcbProject, "status" | "statusChange">): { by: string; when: string } | null {
  const change = project.statusChange;
  if (!change || change.status !== project.status) return null;
  const when = minuteTimeLabel(change.at);
  return when ? { by: change.byName ?? "", when } : null;
}
