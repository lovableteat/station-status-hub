import type {
  TestPlanEntry,
  TestPlanFileCategory,
  TestPlanFileRecord,
  TestPlanFolder,
  TestPlanSort,
} from "../types.ts";

type FolderTreeRecord = Pick<
  TestPlanFolder,
  "id" | "name" | "parentId" | "spaceId"
>;

export function buildFolderBreadcrumbs<T extends FolderTreeRecord>(
  folders: readonly T[],
  activeFolderId: string | null,
): T[] {
  if (!activeFolderId) return [];
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const visited = new Set<string>();
  const breadcrumbs: T[] = [];
  let current = byId.get(activeFolderId);

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    breadcrumbs.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return breadcrumbs;
}

export function isFolderDescendant<T extends Pick<TestPlanFolder, "id" | "parentId">>(
  folders: readonly T[],
  candidateParentId: string | null,
  sourceFolderId: string,
): boolean {
  if (!candidateParentId) return false;
  if (candidateParentId === sourceFolderId) return true;
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const visited = new Set<string>();
  let current = byId.get(candidateParentId);

  while (current && !visited.has(current.id)) {
    if (current.parentId === sourceFolderId) return true;
    visited.add(current.id);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return false;
}

interface EntryFilters {
  query: string;
  category: TestPlanFileCategory | "all";
  sort: TestPlanSort;
  /** Flips the sort's natural direction; folders still come first. */
  reverse?: boolean;
}

/** The direction each sort runs in before `reverse` flips it (used for header arrows). */
export const TEST_PLAN_SORT_DIRECTION: Record<TestPlanSort, "asc" | "desc"> = {
  name: "asc",
  newest: "desc",
  oldest: "asc",
  largest: "desc",
  type: "asc",
};

/** The folder itself plus every folder below it (null = the space root, i.e. everything). */
export function collectFolderSubtree<T extends Pick<TestPlanFolder, "id" | "parentId">>(
  folders: readonly T[],
  rootId: string | null,
): Set<string | null> {
  const subtree = new Set<string | null>([rootId]);
  if (rootId === null) {
    for (const folder of folders) subtree.add(folder.id);
    return subtree;
  }
  let grew = true;
  while (grew) {
    grew = false;
    for (const folder of folders) {
      if (!subtree.has(folder.id) && subtree.has(folder.parentId)) {
        subtree.add(folder.id);
        grew = true;
      }
    }
  }
  return subtree;
}

function toTimestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function filterAndSortEntries(
  folders: readonly TestPlanFolder[],
  files: readonly TestPlanFileRecord[],
  filters: EntryFilters,
): TestPlanEntry[] {
  const normalizedQuery = filters.query.normalize("NFKC").trim().toLocaleLowerCase();
  const matchesQuery = (name: string) =>
    !normalizedQuery
    || name.normalize("NFKC").toLocaleLowerCase().includes(normalizedQuery);

  const entries: TestPlanEntry[] = [
    ...folders
      .filter((folder) => matchesQuery(folder.name))
      .map((folder) => ({ ...folder, kind: "folder" as const })),
    ...files
      .filter((file) =>
        matchesQuery(file.originalName)
        && (filters.category === "all" || file.category === filters.category))
      .map((file) => ({ ...file, kind: "file" as const })),
  ];

  const direction = filters.reverse ? -1 : 1;
  return entries.sort((first, second) => {
    if (first.kind !== second.kind) return first.kind === "folder" ? -1 : 1;
    return direction * compareEntries(first, second, filters.sort);
  });
}

function compareEntries(first: TestPlanEntry, second: TestPlanEntry, sort: TestPlanSort): number {
    let comparison = 0;
    if (sort === "newest") {
      comparison = toTimestamp(second.updatedAt ?? second.createdAt) - toTimestamp(first.updatedAt ?? first.createdAt);
    } else if (sort === "oldest") {
      comparison = toTimestamp(first.createdAt) - toTimestamp(second.createdAt);
    } else if (sort === "largest") {
      comparison = (second.kind === "file" ? second.fileSize : 0)
        - (first.kind === "file" ? first.fileSize : 0);
    } else if (sort === "type") {
      const firstType = first.kind === "file" ? first.extension : "";
      const secondType = second.kind === "file" ? second.extension : "";
      comparison = firstType.localeCompare(secondType, "zh-Hant");
    }
    if (comparison !== 0) return comparison;
    const firstName = first.kind === "folder" ? first.name : first.originalName;
    const secondName = second.kind === "folder" ? second.name : second.originalName;
    return firstName.localeCompare(secondName, "zh-Hant", {
      numeric: true,
      sensitivity: "base",
    });
}
