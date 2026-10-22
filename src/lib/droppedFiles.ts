/**
 * Files from a drag-and-drop, including the contents of dropped folders.
 *
 * Picking a folder through <input webkitdirectory> or showDirectoryPicker
 * always makes Chrome and Edge ask a second "upload N files?" / "view and
 * copy files?" question; a dropped folder is already the user's consent and
 * is read without one. Each file keeps its path below the dropped item in
 * webkitRelativePath (for example "EVT/Netlist/pstxnet.dat"), the same shape
 * a folder picker produces, so downstream code needs no second path.
 */

interface EntryLike {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
}
interface FileEntryLike extends EntryLike {
  file(success: (file: File) => void, failure?: (error: unknown) => void): void;
}
interface DirectoryEntryLike extends EntryLike {
  createReader(): { readEntries(success: (entries: EntryLike[]) => void, failure?: (error: unknown) => void): void };
}

export interface DroppedFiles {
  /** True when at least one dropped item is a folder. */
  hasDirectory: boolean;
  files: Promise<File[]>;
}

export function isFileDrag(dataTransfer: DataTransfer | null) {
  return Boolean(dataTransfer && Array.from(dataTransfer.types).includes("Files"));
}

export function withRelativePath(file: File, path: string): File {
  try {
    Object.defineProperty(file, "webkitRelativePath", { value: path, configurable: true });
    return file;
  } catch {
    return file;
  }
}

async function readEntry(entry: EntryLike, prefix: string, out: File[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileEntryLike).file(resolve, reject));
    out.push(prefix ? withRelativePath(file, `${prefix}${file.name}`) : file);
    return;
  }
  if (!entry.isDirectory) return;
  const reader = (entry as DirectoryEntryLike).createReader();
  const folder = `${prefix}${entry.name}/`;
  // readEntries returns at most ~100 entries per call; keep reading until it returns none.
  for (;;) {
    const batch = await new Promise<EntryLike[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (batch.length === 0) break;
    for (const child of batch) await readEntry(child, folder, out);
  }
}

/**
 * Must be called synchronously inside the drop handler: the entries are only
 * readable while the event is being dispatched. The returned promise then
 * walks folders in the background.
 */
export function readDroppedFiles(dataTransfer: DataTransfer): DroppedFiles {
  const items = Array.from(dataTransfer.items ?? []).filter((item) => item.kind === "file");
  const entries = items.map((item) => (item as DataTransferItem & { webkitGetAsEntry?: () => EntryLike | null }).webkitGetAsEntry?.() ?? null);
  const plainFiles = Array.from(dataTransfer.files ?? []);
  if (entries.length === 0 || entries.some((entry) => entry === null) || !entries.some((entry) => entry?.isDirectory)) {
    return { hasDirectory: false, files: Promise.resolve(plainFiles) };
  }
  return {
    hasDirectory: true,
    files: (async () => {
      const out: File[] = [];
      for (const entry of entries) await readEntry(entry as EntryLike, "", out);
      return out;
    })(),
  };
}
