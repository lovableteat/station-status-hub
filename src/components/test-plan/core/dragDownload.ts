/**
 * Drag-to-desktop delivery. Chrome and Edge start an OS-level download from
 * the "DownloadURL" drag item, so the address it carries decides whether a
 * corporate download policy lets it through. A blob: URL of bytes the page
 * already holds is same-origin and passes URL-keyed download rules; the raw
 * storage link is the fallback for files too large to hold in memory. The
 * drag download runs in the browser process and never reaches a service
 * worker, so no proxied same-origin address can stand in for the bytes.
 */
export const DRAG_BLOB_LIMIT = 64 * 1024 * 1024;
export const DRAG_BLOB_CACHE_LIMIT = 384 * 1024 * 1024;
/** Explorer pulls the dragged file after dragend; keep object URLs alive long enough for that. */
export const DRAG_BLOB_REVOKE_DELAY = 5 * 60_000;

/** "<mime>:<file name>:<url>"; colons would split the fields, so the name never contains one. */
export function describeDownloadUrl(mimeType: string | null | undefined, fileName: string, url: string): string {
  const name = fileName.replace(/[:\\/]/g, "_").trim() || "download";
  return `${mimeType || "application/octet-stream"}:${name}:${url}`;
}

export interface DragDownloadChoice {
  blobUrl?: string | null;
  sourceUrl?: string | null;
}

export function chooseDragDownloadUrl(input: DragDownloadChoice): string | null {
  if (input.blobUrl) return input.blobUrl;
  return input.sourceUrl || null;
}

export interface BlobUrlCache {
  get(id: string): string | null;
  set(id: string, url: string, size: number): void;
  delete(id: string): void;
  clear(): void;
  readonly bytes: number;
  readonly count: number;
}

/** Least-recently-used object URLs with a byte cap; evicted entries are revoked. */
export function createBlobUrlCache(limitBytes: number, revoke: (url: string) => void = (url) => URL.revokeObjectURL(url)): BlobUrlCache {
  const entries = new Map<string, { url: string; size: number }>();
  let total = 0;
  const remove = (id: string) => {
    const entry = entries.get(id);
    if (!entry) return;
    entries.delete(id);
    total -= entry.size;
    revoke(entry.url);
  };
  return {
    get(id) {
      const entry = entries.get(id);
      if (!entry) return null;
      entries.delete(id);
      entries.set(id, entry);
      return entry.url;
    },
    set(id, url, size) {
      remove(id);
      entries.set(id, { url, size });
      total += size;
      for (const oldest of entries.keys()) {
        if (total <= limitBytes || oldest === id) break;
        remove(oldest);
      }
    },
    delete: remove,
    clear() {
      for (const id of [...entries.keys()]) remove(id);
    },
    get bytes() { return total; },
    get count() { return entries.size; },
  };
}
