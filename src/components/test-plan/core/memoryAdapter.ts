import type { TestPlanDataAdapter } from "./repository.ts";
import { classifyTestPlanFile, getTestPlanFileExtension } from "./files.ts";
import type {
  TestPlanFileRecord,
  TestPlanFolder,
  TestPlanSpace,
} from "../types.ts";

/**
 * In-memory file library used by the development demo session. It lets the
 * 檔案上傳 workspace render without a Supabase sign-in, simulates upload
 * progress so the transfer panel can be exercised, and keeps everything in
 * the browser tab: nothing here reaches the network.
 */
export interface MemoryAdapterIdentity {
  ownerId: string;
  displayName: string;
  username: string;
}

interface SeedFile {
  name: string;
  size: number;
  folder?: string;
  daysAgo: number;
  description?: string;
}

interface SeedPerson {
  id: string;
  name: string;
  username: string;
  role: string;
  color: string;
  folders: string[];
  files: SeedFile[];
}

const MiB = 1024 ** 2;
const DEMO_PEOPLE: SeedPerson[] = [
  {
    id: "demo-andy", name: "Andy Tseng", username: "andy_tseng", role: "engineer", color: "#5b8def",
    folders: ["PCB"],
    files: [
      { name: "VR200_schematic_rev3.pdf", size: 12.4 * MiB, folder: "PCB", daysAgo: 2 },
      { name: "BOM_EVT.xlsx", size: 2.1 * MiB, folder: "PCB", daysAgo: 3, description: "EVT 用料表，含替代料" },
      { name: "netlist_export.zip", size: 8.3 * MiB, daysAgo: 6 },
    ],
  },
  {
    id: "demo-ben", name: "Ben Chung", username: "ben_chung", role: "admin", color: "#c0872b",
    folders: ["SOP"],
    files: [
      { name: "SOP_Non_PVL_申請.docx", size: 1.1 * MiB, folder: "SOP", daysAgo: 1 },
      { name: "簽核紀錄_2026Q3.pdf", size: 4.2 * MiB, daysAgo: 9 },
    ],
  },
  {
    id: "demo-leon", name: "Leon", username: "leon", role: "engineer", color: "#8b5cf6",
    folders: [],
    files: [
      { name: "test_plan_CRB.xlsx", size: 0.9 * MiB, daysAgo: 4 },
      { name: "rack_photo_0921.jpg", size: 2.2 * MiB, daysAgo: 12 },
    ],
  },
];
const OWN_FOLDERS = ["DVT 測試報告", "QA_上傳驗證_20261014", "規格書"];
const OWN_FILES: SeedFile[] = [
  { name: "工作進度報告.md", size: 41.2 * 1024, daysAgo: 0, description: "每日工作回報匯出" },
  { name: "工作進度報告.txt", size: 40.6 * 1024, daysAgo: 0 },
  { name: "OneDrive_1_2026-10-14.zip", size: 13.5 * MiB, daysAgo: 1 },
  { name: "DA-12949-001_v05.pdf", size: 643.7 * MiB, folder: "規格書", daysAgo: 1, description: "GB300 L11 機構規格書" },
  { name: "GB300_L11_機櫃.step", size: 182 * MiB, folder: "DVT 測試報告", daysAgo: 3 },
  { name: "機櫃配置_DVT.xlsx", size: 1.2 * MiB, folder: "DVT 測試報告", daysAgo: 2, description: "含 U 位與電源對照" },
  { name: "量測結果_week42.pptx", size: 28 * MiB, folder: "DVT 測試報告", daysAgo: 5 },
  { name: "board_rev7.brd", size: 54 * MiB, folder: "QA_上傳驗證_20261014", daysAgo: 7 },
  { name: "現場照片_01.png", size: 3.4 * MiB, folder: "QA_上傳驗證_20261014", daysAgo: 7 },
];

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const stamp = (daysAgo: number, hour = 9) => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
};
const newId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const now = () => new Date().toISOString();

export function createMemoryTestPlanAdapter(identity: MemoryAdapterIdentity): TestPlanDataAdapter & { reset(): void } {
  let spaces: TestPlanSpace[] = [];
  let folders: TestPlanFolder[] = [];
  let files: TestPlanFileRecord[] = [];
  const objects = new Map<string, Blob>();
  const objectUrls = new Map<string, string>();
  const cleanup = new Map<string, Set<string>>();

  const seedSpace = (person: { id: string; name: string; username: string; role: string; color: string }, isPersonal: boolean, folderNames: string[], seedFiles: SeedFile[], daysAgo: number) => {
    const space: TestPlanSpace = {
      id: `demo-space-${person.id}`, projectId: null, ownerId: person.id, ownerRole: person.role, isPersonal,
      name: person.name, description: `@${person.username}`, color: person.color, createdAt: stamp(daysAgo + 30), updatedAt: stamp(daysAgo),
    };
    spaces.push(space);
    const folderByName = new Map<string, TestPlanFolder>();
    for (const name of folderNames) {
      const folder: TestPlanFolder = { id: `demo-folder-${person.id}-${folderByName.size + 1}`, spaceId: space.id, parentId: null, name, createdBy: person.id, createdAt: stamp(daysAgo + 10), updatedAt: stamp(daysAgo + 1) };
      folders.push(folder);
      folderByName.set(name, folder);
    }
    seedFiles.forEach((seed, index) => {
      const id = `demo-file-${person.id}-${index + 1}`;
      files.push({
        id, spaceId: space.id, folderId: seed.folder ? folderByName.get(seed.folder)?.id ?? null : null,
        originalName: seed.name, storagePath: `${space.id}/${id}/${seed.name}`, mimeType: null,
        extension: getTestPlanFileExtension(seed.name), category: classifyTestPlanFile(seed.name),
        fileSize: Math.round(seed.size), description: seed.description ?? null, uploadedBy: person.id,
        createdAt: stamp(seed.daysAgo, 10 + index), updatedAt: stamp(seed.daysAgo, 10 + index),
      });
    });
  };

  const reset = () => {
    spaces = []; folders = []; files = []; objects.clear(); cleanup.clear();
    for (const url of objectUrls.values()) URL.revokeObjectURL(url);
    objectUrls.clear();
    seedSpace({ id: identity.ownerId, name: identity.displayName, username: identity.username, role: "admin", color: "#2fb8a4" }, true, OWN_FOLDERS, OWN_FILES, 0);
    DEMO_PEOPLE.forEach((person, index) => seedSpace(person, true, person.folders, person.files, index + 1));
  };
  reset();

  const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
  const descendants = (folderId: string): string[] => {
    const ids = [folderId];
    for (let index = 0; index < ids.length; index += 1) {
      for (const folder of folders) if (folder.parentId === ids[index]) ids.push(folder.id);
    }
    return ids;
  };
  const queue = (ownerId: string, paths: string[]) => {
    const set = cleanup.get(ownerId) ?? new Set<string>();
    for (const path of paths) set.add(path);
    cleanup.set(ownerId, set);
  };
  const blobFor = (path: string) => {
    const existing = objects.get(path);
    if (existing) return existing;
    // Seeded files have no uploaded bytes; hand back a bounded placeholder so previews and downloads still work.
    const record = files.find((file) => file.storagePath === path);
    const size = Math.min(record?.fileSize ?? 0, 4 * MiB);
    const blob = new Blob([new Uint8Array(size)], { type: record?.mimeType ?? "application/octet-stream" });
    objects.set(path, blob);
    return blob;
  };
  const urlFor = (path: string) => {
    const cached = objectUrls.get(path);
    if (cached) return cached;
    const url = URL.createObjectURL(blobFor(path));
    objectUrls.set(path, url);
    return url;
  };

  return {
    reset,
    async listSpaces() {
      return clone(spaces);
    },
    async listFolders(spaceId) {
      return clone(spaceId ? folders.filter((folder) => folder.spaceId === spaceId) : folders);
    },
    async listFiles(spaceId) {
      return clone(spaceId ? files.filter((file) => file.spaceId === spaceId) : files);
    },
    async createSpace(input) {
      const space: TestPlanSpace = { id: newId(), projectId: input.projectId, ownerId: input.ownerId, ownerRole: "engineer", isPersonal: false, name: input.name, description: input.description, color: input.color, createdAt: now(), updatedAt: now() };
      spaces.push(space);
      return clone(space);
    },
    async updateSpace(spaceId, _ownerId, _projectId, patch) {
      const space = spaces.find((item) => item.id === spaceId);
      if (!space) throw new Error("空間不存在。");
      Object.assign(space, patch, { updatedAt: now() });
      return clone(space);
    },
    async deleteSpace(spaceId, ownerId) {
      queue(ownerId, files.filter((file) => file.spaceId === spaceId).map((file) => file.storagePath));
      spaces = spaces.filter((space) => space.id !== spaceId);
      folders = folders.filter((folder) => folder.spaceId !== spaceId);
      files = files.filter((file) => file.spaceId !== spaceId);
    },
    async createFolder(input) {
      const folder: TestPlanFolder = { id: newId(), spaceId: input.spaceId, parentId: input.parentId, name: input.name, createdBy: input.createdBy, createdAt: now(), updatedAt: now() };
      folders.push(folder);
      return clone(folder);
    },
    async updateFolder(folderId, patch) {
      const folder = folders.find((item) => item.id === folderId);
      if (!folder) return undefined;
      Object.assign(folder, patch, { updatedAt: now() });
      return clone(folder);
    },
    async deleteFolder(folderId) {
      const removed = new Set(descendants(folderId));
      const owner = folders.find((folder) => folder.id === folderId)?.createdBy ?? identity.ownerId;
      queue(owner, files.filter((file) => file.folderId && removed.has(file.folderId)).map((file) => file.storagePath));
      folders = folders.filter((folder) => !removed.has(folder.id));
      files = files.filter((file) => !(file.folderId && removed.has(file.folderId)));
    },
    async uploadObject(path, file, onProgress) {
      const steps = 24;
      for (let step = 1; step <= steps; step += 1) {
        await delay(40);
        onProgress?.(Math.round((file.size * step) / steps), file.size);
      }
      objects.set(path, file);
    },
    completeObjectUpload() {},
    async findFileByStoragePath(path) {
      const record = files.find((file) => file.storagePath === path);
      return record ? clone(record) : undefined;
    },
    async replaceObject(path, file) {
      objects.set(path, file);
      const stale = objectUrls.get(path);
      if (stale) { URL.revokeObjectURL(stale); objectUrls.delete(path); }
    },
    async createFile(input) {
      const record: TestPlanFileRecord = { id: newId(), ...input, description: null, createdAt: now(), updatedAt: now() };
      files.push(record);
      return clone(record);
    },
    async updateFile(fileId, patch) {
      const record = files.find((file) => file.id === fileId);
      if (!record) throw new Error("檔案不存在，請重新整理後再試。");
      Object.assign(record, patch, { updatedAt: now() });
      return clone(record);
    },
    async deleteFile(fileId) {
      const record = files.find((file) => file.id === fileId);
      if (!record) throw new Error("檔案不存在，或你沒有刪除權限。");
      queue(record.uploadedBy, [record.storagePath]);
      files = files.filter((file) => file.id !== fileId);
    },
    async downloadObject(path) {
      await delay(120);
      return blobFor(path);
    },
    async createDownloadUrl(path) {
      return urlFor(path);
    },
    async createDownloadUrls(items) {
      return new Map(items.map((item) => [item.path, urlFor(item.path)] as const));
    },
    async removeObjects(paths) {
      for (const path of paths) {
        objects.delete(path);
        const url = objectUrls.get(path);
        if (url) { URL.revokeObjectURL(url); objectUrls.delete(path); }
      }
    },
    async listCleanupPaths(ownerId) {
      return [...(cleanup.get(ownerId) ?? [])];
    },
    async queueCleanupPath(ownerId, path) {
      queue(ownerId, [path]);
    },
    async completeCleanupPaths(ownerId, paths) {
      const set = cleanup.get(ownerId);
      if (!set) return;
      for (const path of paths) set.delete(path);
    },
  };
}
