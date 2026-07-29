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

  return entries.sort((first, second) => {
    if (first.kind !== second.kind) return first.kind === "folder" ? -1 : 1;
    let comparison = 0;
    if (filters.sort === "newest") {
      comparison = toTimestamp(second.createdAt) - toTimestamp(first.createdAt);
    } else if (filters.sort === "oldest") {
      comparison = toTimestamp(first.createdAt) - toTimestamp(second.createdAt);
    } else if (filters.sort === "largest") {
      comparison = (second.kind === "file" ? second.fileSize : 0)
        - (first.kind === "file" ? first.fileSize : 0);
    } else if (filters.sort === "type") {
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
  });
}
