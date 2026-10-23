/**
 * Drag-to-desktop delivery. Chrome and Edge start an OS-level download from
 * the "DownloadURL" drag item, so the address it carries decides whether a
 * corporate download policy lets it through. A blob: URL of bytes the page
 * already holds is same-origin and passes URL-keyed download rules. The file
 * library passes only that blob: address: on the company's managed Chrome the
 * raw storage link is shown as 遭到貴機構封鎖, so a file that is not in memory
 * yet (or is too large to hold) is not offered to the desktop at all. The
 * drag download runs in the browser process and never reaches a service
 * worker, so no proxied same-origin address can stand in for the bytes.
 */
/** Largest file that can be dragged to the desktop (the upload limit is also 1 GB). */
export const DRAG_BLOB_LIMIT = 1024 * 1024 * 1024;
/** Files up to this size are prepared automatically on hover or press; larger ones on the first drag. */
export const DRAG_HOVER_PREFETCH_LIMIT = 64 * 1024 * 1024;
/** Room for one prepared 1 GB file plus the small ones on screen; Chrome keeps large blobs on disk. */
export const DRAG_BLOB_CACHE_LIMIT = 1536 * 1024 * 1024;
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

/**
 * Fetches a file into a Blob while reporting progress. The bytes go straight
 * into the browser's blob storage (which spills large blobs to disk); a cloned
 * stream only counts them, so a 1 GB file is never held in JavaScript memory.
 */
export async function fetchBlobWithProgress(
  url: string,
  { signal, expectedSize = 0, onProgress, fetchImpl = fetch }: {
    signal?: AbortSignal;
    expectedSize?: number;
    onProgress?: (loaded: number, total: number) => void;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<Blob> {
  const response = await fetchImpl(url, { signal });
  if (!response.ok) throw new Error(`下載連結回應 ${response.status}`);
  const headerSize = Number(response.headers.get("content-length"));
  const total = Number.isFinite(headerSize) && headerSize > 0 ? headerSize : expectedSize;
  if (!onProgress || !response.body) return response.blob();
  const counter = response.clone().body?.getReader();
  const counting = (async () => {
    if (!counter) return;
    let loaded = 0;
    onProgress(0, total);
    for (;;) {
      const { done, value } = await counter.read();
      if (done) break;
      loaded += value.byteLength;
      onProgress(loaded, Math.max(total, loaded));
    }
  })();
  const [blob] = await Promise.all([response.blob(), counting]);
  return blob;
}