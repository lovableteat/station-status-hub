/*
 * File library download proxy.
 *
 * Dragging a row to the desktop makes the browser download whatever URL the
 * page put in "DownloadURL". A cross-origin storage link can be refused by
 * corporate download policies even though the same bytes fetched by the page
 * are fine. This worker answers same-origin addresses under
 * <base>__file-library__/download/ by streaming the storage object itself, so
 * the download the browser sees comes from this site. It never caches app
 * assets and only proxies the storage origin it was registered with.
 */
const PREFIX = "__file-library__/download/";
const ALLOWED_ORIGIN = new URLSearchParams(self.location.search).get("origin") || "";
const ALLOWED_PATH = /^\/storage\/v1\/object\//;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function asciiFileName(name) {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_").trim();
  return ascii || "download";
}

function allowedSource(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ALLOWED_ORIGIN && url.origin === ALLOWED_ORIGIN && ALLOWED_PATH.test(url.pathname) ? url : null;
  } catch {
    return null;
  }
}

async function proxyDownload(request) {
  const url = new URL(request.url);
  const source = allowedSource(url.searchParams.get("u") || "");
  if (!source) return new Response("不允許的來源", { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const name = (url.searchParams.get("n") || "download").slice(0, 255);
  const type = url.searchParams.get("t") || "application/octet-stream";
  let upstream;
  try {
    upstream = await fetch(source.href, { credentials: "omit", cache: "no-store" });
  } catch {
    return new Response("下載中斷，請重試", { status: 502, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  if (!upstream.ok || !upstream.body) {
    return new Response(`無法取得檔案（${upstream.status}）`, { status: 502, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  const headers = new Headers({
    "Content-Type": type,
    "Content-Disposition": `attachment; filename="${asciiFileName(name)}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  const length = upstream.headers.get("content-length") || url.searchParams.get("s");
  if (length && /^\d+$/.test(length)) headers.set("Content-Length", length);
  return new Response(upstream.body, { status: 200, headers });
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  let url;
  try {
    url = new URL(event.request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin || !url.pathname.includes(PREFIX)) return;
  event.respondWith(proxyDownload(event.request));
});
