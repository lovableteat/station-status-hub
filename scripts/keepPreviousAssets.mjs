#!/usr/bin/env node
/**
 * Keeps the files of recent deployments next to the new build (2026-11-25, user: 「為什麼一天到晚要我刷新…一旦開了就不准關
 * 沒有必要就不准一直刷新」).
 *
 * GitHub Pages replaces the whole site on every deploy, and Vite names each file after its content. A page opened before
 * a deploy still asks for the files of its own version when it opens a workspace or a dialog for the first time; those
 * were gone, so it showed 「這個功能暫時無法載入」 and asked for a reload. Now every file the site served in the last
 * KEEP_DAYS days (at most KEEP_BYTES of them, newest first) stays available beside the new ones: an open page keeps working on its own version, and only a fresh
 * visit gets the new one.
 *
 * `assets-history.json` (published with the site) records when each file was last part of a build. The first run, before
 * that file exists, reads the live site itself: index.html and every file it reaches.
 *
 * Usage (after `npm run build`): node scripts/keepPreviousAssets.mjs [dist] [site URL]
 * Never fails the deploy: without the live site it only writes the history of the new build.
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const KEEP_DAYS = 7;
/** At most this much of earlier files beside a build, newest first: the whole Pages site must stay well under 1 GB. */
export const KEEP_BYTES = 300 * 1024 * 1024;
const DAY = 24 * 60 * 60 * 1000;
/** A file name the site serves under assets/: nothing that could leave the folder. */
export const ASSET_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** The asset names a page or a script refers to (assets/name.ext, with or without a leading path). */
export function assetReferences(text) {
  const names = new Set();
  for (const match of text.matchAll(/assets\/([A-Za-z0-9][A-Za-z0-9._-]*\.[A-Za-z0-9]+)/g)) if (ASSET_NAME.test(match[1])) names.add(match[1]);
  return [...names];
}

/** Which earlier files to keep: those part of a build within `days` days that the new build does not have. */
export function filesToKeep(history, built, now, days = KEEP_DAYS) {
  const keep = [];
  for (const [name, lastSeen] of Object.entries(history ?? {})) {
    if (!ASSET_NAME.test(name) || built.has(name)) continue;
    if (typeof lastSeen === "number" && now - lastSeen <= days * DAY) keep.push(name);
  }
  // Newest first, so a size limit drops the oldest versions.
  return keep.sort((left, right) => history[right] - history[left] || left.localeCompare(right));
}

/** The history to publish: every new file seen now, every kept file with when it was last built. */
export function nextHistory(history, built, kept, now) {
  const next = {};
  for (const name of kept) next[name] = history[name];
  for (const name of built) next[name] = now;
  return next;
}

async function fetchText(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.text();
}

/** Every asset the live site reaches from its index.html, as of now (the first run, before a history exists). */
async function crawlLive(site, limit = 3000) {
  const seen = new Set(), queue = assetReferences(await fetchText(new URL("index.html", site)));
  while (queue.length && seen.size < limit) {
    const name = queue.shift();
    if (seen.has(name)) continue;
    seen.add(name);
    if (!/\.(m?js|css|json|html)$/.test(name)) continue;
    try { for (const next of assetReferences(await fetchText(new URL(`assets/${name}`, site)))) if (!seen.has(next)) queue.push(next); } catch { /* a file already gone is simply not kept */ }
  }
  return seen;
}

async function main() {
  const dist = path.resolve(process.argv[2] ?? "dist");
  const site = new URL(process.argv[3] ?? process.env.SITE_URL ?? "https://lovableteat.github.io/station-status-hub/");
  const assets = path.join(dist, "assets");
  const now = Date.now();
  const built = new Set((await readdir(assets)).filter(name => ASSET_NAME.test(name)));
  let history = {};
  try {
    const published = JSON.parse(await fetchText(new URL("assets-history.json", site)));
    if (published && typeof published.files === "object") history = published.files;
  } catch {
    try { for (const name of await crawlLive(site)) history[name] = now; console.log(`no history yet: read ${Object.keys(history).length} files from the live site`); }
    catch (error) { console.warn(`live site not readable (${error.message}); keeping nothing this time`); }
  }
  const wanted = filesToKeep(history, built, now);
  const kept = [];
  let bytes = 0;
  await mkdir(assets, { recursive: true });
  // A few at a time: the site is small, and GitHub Pages answers quickly.
  for (let index = 0; index < wanted.length && bytes < KEEP_BYTES; index += 8) {
    await Promise.all(wanted.slice(index, index + 8).map(async name => {
      try {
        const response = await fetch(new URL(`assets/${name}`, site), { cache: "no-store" });
        if (!response.ok) return;
        const body = Buffer.from(await response.arrayBuffer());
        await writeFile(path.join(assets, name), body);
        kept.push(name); bytes += body.length;
      } catch { /* not kept; an open page of that version may ask for a reload */ }
    }));
  }
  const files = nextHistory(history, built, kept, now);
  await writeFile(path.join(dist, "assets-history.json"), `${JSON.stringify({ version: 1, updatedAt: new Date(now).toISOString(), keepDays: KEEP_DAYS, files }, null, 0)}\n`);
  console.log(`kept ${kept.length} earlier files (${(bytes / 1048576).toFixed(1)} MB) beside ${built.size} new ones; history lists ${Object.keys(files).length}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.warn(`keeping earlier files skipped: ${error.message}`); });
}
