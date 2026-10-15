import type { TestPlanEntry, TestPlanFileRecord, TestPlanFolder } from "../types.ts";

export const testPlanEntryKey = (entry: Pick<TestPlanEntry, "kind" | "id">) => `${entry.kind}:${entry.id}`;

export interface TestPlanDeleteGroup {
  entry: TestPlanEntry;
  selected: TestPlanEntry[];
}

// A selected folder already deletes its descendants. Keep their selected keys
// with that folder so callers can report the exact batch result without retries.
export function groupTestPlanDeleteSelection(
  incoming: readonly TestPlanEntry[],
  folders: readonly TestPlanFolder[],
  files: readonly TestPlanFileRecord[],
): TestPlanDeleteGroup[] {
  const loaded = new Map<string, TestPlanEntry>([
    ...folders.map(folder => [`folder:${folder.id}`, { ...folder, kind: "folder" as const }] as const),
    ...files.map(file => [`file:${file.id}`, { ...file, kind: "file" as const }] as const),
  ]);
  const selected = new Map<string, TestPlanEntry>();
  for (const requested of incoming) {
    const key = testPlanEntryKey(requested);
    const entry = loaded.get(key);
    if (!entry) throw new Error("項目不存在，請重新整理後再試。");
    selected.set(key, entry);
  }
  const byFolderId = new Map(folders.map(folder => [folder.id, folder]));
  const selectedFolderIds = new Set([...selected.values()].filter(entry => entry.kind === "folder").map(entry => entry.id));
  const groups = new Map<string, TestPlanDeleteGroup>();
  for (const entry of selected.values()) {
    let root = entry;
    let parentId = entry.kind === "folder" ? entry.parentId : entry.folderId;
    const visited = new Set(entry.kind === "folder" ? [entry.id] : []);
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      const parent = byFolderId.get(parentId);
      if (!parent || parent.spaceId !== entry.spaceId) break;
      if (selectedFolderIds.has(parent.id)) root = selected.get(`folder:${parent.id}`)!;
      parentId = parent.parentId;
    }
    const key = testPlanEntryKey(root);
    const group = groups.get(key) ?? { entry: root, selected: [] };
    group.selected.push(entry);
    groups.set(key, group);
  }
  return [...groups.values()];
}
