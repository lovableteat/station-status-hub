/**
 * Drag-to-desktop delivery. Chrome and Edge start an OS-level download from
 * the "DownloadURL" drag item, so the address it carries decides whether a
 * corporate download policy lets it through. In order of preference:
 *   1. a blob: URL of bytes already fetched by the page (same origin, nothing
 *      for a URL filter to object to) for files up to DRAG_BLOB_LIMIT;
 *   2. a same-origin address served by public/file-library-sw.js, which
 *      streams the storage object;
 *   3. the raw storage link.
 */
export const DRAG_BLOB_LIMIT = 24 * 1024 * 1024;
export const DRAG_BLOB_CACHE_LIMIT = 256 * 1024 * 1024;
export const DOWNLOAD_PROXY_PREFIX = "__file-library__/download/";

/** "<mime>:<file name>:<url>"; colons would split the fields, so the name never contains one. */
export function describeDownloadUrl(mimeType: string | null | undefined, fileName: string, url: string): string {
  const name = fileName.replace(/[:\\/]/g, "_").trim() || "download";
  return `${mimeType || "application/octet-stream"}:${name}:${url}`;
}

export interface DownloadProxy {
  pageOrigin: string;
  base: string;
}

export interface ProxyDownloadInput extends DownloadProxy {
  fileId: string;
  sourceUrl: string;
  fileName: string;
  mimeType?: string | null;
  size?: number;
}

export function buildProxyDownloadUrl(input: ProxyDownloadInput): string {
  const params = new URLSearchParams({ u: input.sourceUrl, n: input.fileName });
  if (input.mimeType) params.set("t", input.mimeType);
  if (input.size && input.size > 0) params.set("s", String(Math.floor(input.size)));
  const base = input.base.endsWith("/") ? input.base : `${input.base}/`;
  return `${input.pageOrigin}${base}${DOWNLOAD_PROXY_PREFIX}${encodeURIComponent(input.fileId)}/${encodeURIComponent(input.fileName)}?${params.toString()}`;
}

export interface DragDownloadChoice {
  blobUrl?: string | null;
  sourceUrl?: string | null;
  proxy?: DownloadProxy | null;
  fileId: string;
  fileName: string;
  mimeType?: string | null;
  size?: number;
}

export function chooseDragDownloadUrl(input: DragDownloadChoice): string | null {
  if (input.blobUrl) return input.blobUrl;
  if (!input.sourceUrl) return null;
  if (/^(blob|data):/i.test(input.sourceUrl) || !input.proxy) return input.sourceUrl;
  return buildProxyDownloadUrl({ ...input.proxy, fileId: input.fileId, sourceUrl: input.sourceUrl, fileName: input.fileName, mimeType: input.mimeType, size: input.size });
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
