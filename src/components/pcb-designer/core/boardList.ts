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

export interface BoardFamily {
  /** boardFamilyId, or the board id when the board has no family. */
  id: string;
  /** Newest matching version: the row the list shows. */
  lead: PcbProject;
  /** Every version of the family, newest first. */
  versions: PcbProject[];
  /** Versions that match the filters, newest first. */
  matching: PcbProject[];
  containsActive: boolean;
}

export interface BoardGroup {
  name: string;
  families: BoardFamily[];
}

export function boardOwnerName(project: Pick<PcbProject, "owner">): string {
  return project.owner?.displayName?.trim() || UNASSIGNED_OWNER;
}

export function boardFamilyId(project: Pick<PcbProject, "id" | "boardFamilyId">): string {
  return project.boardFamilyId || project.id;
}

const byUpdated = (first: PcbProject, second: PcbProject) => second.updatedAt.localeCompare(first.updatedAt);

function matches(project: PcbProject, filters: BoardListFilters, needle: string): boolean {
  if (filters.status !== "all" && project.status !== filters.status) return false;
  if (filters.owner !== "all" && boardOwnerName(project) !== filters.owner) return false;
  if (!needle) return true;
  return [
    project.name, project.description, project.projectGroup, project.revision ?? "1",
    project.owner?.displayName, project.lastEditedBy,
  ].some((value) => value?.toLocaleLowerCase().includes(needle));
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
    const versions = [...members].sort(byUpdated);
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
    ? (first: BoardFamily, second: BoardFamily) => first.lead.name.localeCompare(second.lead.name, "zh-Hant") || byUpdated(first.lead, second.lead)
    : (first: BoardFamily, second: BoardFamily) => byUpdated(first.lead, second.lead);
  return [...groups.entries()]
    .sort(([first], [second]) => first === UNGROUPED_BOARD_GROUP ? 1 : second === UNGROUPED_BOARD_GROUP ? -1 : first.localeCompare(second, "zh-Hant"))
    .map(([name, list]) => ({ name, families: list.sort(compareFamilies) }));
}

/** Owner names for the filter: names used on boards, then 未指派 when any board has no owner. */
export function boardOwnerOptions(projects: readonly PcbProject[]): string[] {
  const names = new Set<string>();
  let unassigned = false;
  for (const project of projects) {
    const name = project.owner?.displayName?.trim();
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
