import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  CIRCUIT_PDF_LABEL_LIMIT, CIRCUIT_PDF_MAX_BYTES, CIRCUIT_PDF_MAX_PAGES, CIRCUIT_PDF_NAME_LIMIT, circuitPdfDateFromFile, circuitPdfResumePage,
  emptyCircuitPdfRegistry, mergeCircuitPdfRegistry, visibleCircuitPdfDocuments, type CircuitPdfDocument, type CircuitPdfRegistry,
} from "./circuitPdf";
import { isPdfFile, openCircuitPdf } from "./pdfRender";
import { downloadCircuitPdf, loadCircuitPdfRegistry, saveCircuitPdfRegistry, uploadCircuitPdf } from "./pdfStorage";
import { loadCircuitPdfOfficial, saveCircuitPdfOfficial, type CircuitPdfOfficial } from "./officialPdfStorage";
import {
  CIRCUIT_ALIGN_MAX_PAGES, alignCircuitPdfPages, circuitAlignOffsets, clearCircuitAlignPin, invertCircuitAlignPins, normalizeCircuitAlignPins,
  readCircuitPdfPageTokens, resolveCircuitComparePage, setCircuitAlignPin, type CircuitAlignPin, type CircuitAlignSource,
} from "./circuitPdfAlign";

export interface CircuitPdfModel {
  registry: CircuitPdfRegistry; documents: CircuitPdfDocument[];
  loading: boolean; saving: boolean; error: string; uploading: string;
  active: CircuitPdfDocument | null; compare: CircuitPdfDocument | null;
  official: CircuitPdfDocument | null; officialPdf: PDFDocumentProxy | null; officialPage: number;
  activePdf: PDFDocumentProxy | null; comparePdf: PDFDocumentProxy | null;
  opening: boolean; openError: string; needsLocalFile: boolean;
  page: number; comparePage: number; compareOffset: number;
  /** The baseline page shown beside a working page (0: none). Pages are matched by content, then by the user's pins. */
  comparePageFor: (page: number) => number;
  /** How the baseline page on screen was found, and whether the two PDFs are still being read to match their pages. */
  alignment: { source: CircuitAlignSource; offset: number | null; aligning: boolean };
  /** Changes whenever any page's match changes; for work that keeps results per matched page pair. */
  alignmentKey: string;
  /** "This working page is that baseline page": holds for the following pages too, until the next pin or content step. */
  setComparePage: (page: number) => void;
  /** Drops the user's pin deciding the page on screen, so the automatic match applies again. */
  clearComparePin: () => void;
  upload: (file: File) => Promise<void>; openLocal: (file: File) => Promise<void>;
  /** Opens a version at a page, e.g. the page a picture was framed on. Returns false when that version is no longer offered. */
  show: (documentId: string, page: number) => boolean;
  select: (id: string) => void; setCompare: (id: string) => void; setCompareOffset: (offset: number) => void; swapComparison: () => void;
  setOfficial: (id: string) => Promise<void>; compareOfficial: () => void;
  goTo: (page: number) => void; setChecked: (page: number, checked: boolean) => void;
  updateDocument: (id: string, patch: { date?: string; label?: string }) => void;
  removeDocument: (id: string) => Promise<void>; restoreDocument: (id: string) => Promise<void>; reload: () => Promise<void>; clearError: () => void;
}

const empty = emptyCircuitPdfRegistry;
const now = () => new Date().toISOString();
const DATE = /^\d{4}-\d{2}-\d{2}$/;
// Downloaded PDFs stay in memory for this browser session, so reopening the dialog or switching versions does not fetch them again.
const downloaded = new Map<string, ArrayBuffer>();
const DOWNLOAD_CACHE_BYTES = 300 * 1024 * 1024;
function remember(path: string, bytes: ArrayBuffer) {
  downloaded.delete(path); downloaded.set(path, bytes);
  let total = [...downloaded.values()].reduce((sum, value) => sum + value.byteLength, 0);
  for (const [key, value] of downloaded) { if (total <= DOWNLOAD_CACHE_BYTES || key === path) break; downloaded.delete(key); total -= value.byteLength; }
}
// A PDF over the server's limit is opened from the uploader's own file; it is kept here until the page is reloaded.
const localFiles = new Map<string, File>();
const positionKey = (userId: string, seriesId: string) => `circuit-pdf-position:v1:${userId}:${seriesId}`;
// The words on each page of a version (versions never change), and the page match of a pair, kept for this browser session.
const pageWords = new Map<string, Promise<string[][]>>();
const alignments = new Map<string, Array<number | null> | null>();
const NO_PINS: CircuitAlignPin[] = [];
function wordsOf(id: string, pdf: PDFDocumentProxy) {
  let words = pageWords.get(id);
  if (!words) {
    words = readCircuitPdfPageTokens(pdf, new AbortController().signal);
    pageWords.set(id, words);
    words.catch(() => { if (pageWords.get(id) === words) pageWords.delete(id); });
    while (pageWords.size > 12) pageWords.delete(pageWords.keys().next().value as string);
  }
  return words;
}
const pinsKey = (seriesId: string, pair: string) => `circuit-pdf-align:v1:${seriesId}:${pair}`;
function readPins(seriesId: string, pair: string): CircuitAlignPin[] {
  if (!pair) return NO_PINS;
  try { return normalizeCircuitAlignPins(JSON.parse(window.localStorage.getItem(pinsKey(seriesId, pair)) || "[]")); } catch { return NO_PINS; }
}
function writePins(seriesId: string, pair: string, pins: CircuitAlignPin[]) {
  try { if (pins.length) window.localStorage.setItem(pinsKey(seriesId, pair), JSON.stringify(pins)); else window.localStorage.removeItem(pinsKey(seriesId, pair)); } catch { /* the pins still hold until the window closes */ }
}

/**
 * `autoCompareOfficial` picks a default baseline when entering AI 比對. A selected baseline takes precedence.
 */
export function useCircuitPdfs({ open, seriesId, canEdit, userId, userName, autoCompareOfficial = true }: { open: boolean; seriesId: string; canEdit: boolean; userId: string; userName: string; autoCompareOfficial?: boolean }): CircuitPdfModel {
  const [registry, setRegistry] = useState<CircuitPdfRegistry>(empty);
  const [officialSelection, setOfficialSelection] = useState<CircuitPdfOfficial | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState("");
  const [activeId, setActiveId] = useState("");
  const [compareId, setCompareId] = useState("");
  // Pins per version pair ("baseline>working"), and the automatic page match per pair.
  const [pinBook, setPinBook] = useState<Record<string, CircuitAlignPin[]>>({});
  const [autoBook, setAutoBook] = useState<Record<string, Array<number | null> | null>>({});
  const [aligning, setAligning] = useState("");
  const [page, setPage] = useState(1);
  const pageRef = useRef(page); pageRef.current = page;
  const [pdfs, setPdfs] = useState<Record<string, PDFDocumentProxy>>({});
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState("");
  const [localFileId, setLocalFileId] = useState("");
  const [openRetry, setOpenRetry] = useState(0);
  const scope = `${userId}:${seriesId}:${open}`;
  const scopeRef = useRef(scope); scopeRef.current = scope;
  const registryRef = useRef(registry); registryRef.current = registry;
  const pending = useRef<CircuitPdfRegistry>(empty());
  const flushing = useRef<Promise<void> | null>(null);
  const flushTimer = useRef<ReturnType<typeof setTimeout>>();
  const opened = useRef(new Map<string, Promise<PDFDocumentProxy>>());
  const placed = useRef("");
  const official = officialSelection?.document || null;
  // The official original comes from its protected snapshot, independent of later edits to the legacy version list.
  const documents = useMemo(() => visibleCircuitPdfDocuments(official ? { ...registry, documents: [...registry.documents.filter(row => row.id !== official.id), official] } : registry), [registry, official]);
  const active = documents.find(row => row.id === activeId) || null;
  const officialRef = useRef(official); officialRef.current = official;
  const defaultCompare = autoCompareOfficial && active
    ? official && official.id !== activeId ? official : documents.find(row => row.id !== activeId)
    : null;
  const compare = documents.find(row => row.id === compareId && row.id !== activeId) || defaultCompare || null;
  const pairKey = active && compare ? `${compare.id}>${active.id}` : "";
  const pins = useMemo(() => pinBook[pairKey] ?? readPins(seriesId, pairKey), [pinBook, pairKey, seriesId]);
  const autoOffsets = pairKey ? autoBook[pairKey] ?? null : null;
  const resolveFor = useCallback((target: number) => compare ? resolveCircuitComparePage(target, compare.pages, autoOffsets, pins) : null, [compare, autoOffsets, pins]);
  const resolved = resolveFor(page);
  const comparePage = resolved?.page || 0;
  const compareOffset = resolved?.offset ?? 0;
  const officialPage = compare && official && compare.id === official.id ? comparePage : official && page <= official.pages ? page : 0;
  const alignmentKey = `${pairKey}|${autoOffsets ? autoOffsets.join(",") : "-"}|${pins.map(pin => `${pin.from}:${pin.offset}`).join(",")}`;
  const savePins = useCallback((pair: string, next: CircuitAlignPin[]) => {
    if (!pair) return;
    setPinBook(book => ({ ...book, [pair]: next }));
    writePins(seriesId, pair, next);
  }, [seriesId]);
  // What is on screen right now, for actions that continue from it (a new upload keeps the page being read).
  const onScreen = useRef<{ documentId: string; page: number }>({ documentId: "", page: 1 });
  onScreen.current = { documentId: active?.id || "", page };

  const flush = useCallback(async () => {
    clearTimeout(flushTimer.current);
    if (flushing.current) { await flushing.current; }
    const delta = pending.current;
    if (!canEdit || (!delta.documents.length && !Object.keys(delta.pages).length && !Object.keys(delta.positions).length)) return;
    const captured = scopeRef.current;
    pending.current = empty();
    const run = (async () => {
      setSaving(true);
      try {
        const saved = await saveCircuitPdfRegistry(seriesId, latest => mergeCircuitPdfRegistry(latest, delta));
        if (scopeRef.current === captured) { setRegistry(mergeCircuitPdfRegistry(saved, pending.current)); setError(""); }
      } catch (failure) {
        // Nothing is dropped: the unsaved entries go back in front of anything newer and are sent with the next save.
        pending.current = mergeCircuitPdfRegistry(delta, pending.current);
        if (scopeRef.current === captured) setError(`PDF 清單或進度尚未儲存：${failure instanceof Error ? failure.message : "請重試"}`);
        throw failure;
      } finally { if (scopeRef.current === captured) setSaving(false); }
    })();
    flushing.current = run;
    try { await run; } finally { if (flushing.current === run) flushing.current = null; }
  }, [canEdit, seriesId]);

  const queue = useCallback((delta: Partial<CircuitPdfRegistry>, immediately = false) => {
    const patch = { ...empty(), ...delta };
    setRegistry(current => mergeCircuitPdfRegistry(current, patch));
    if (!canEdit) return Promise.resolve();
    pending.current = mergeCircuitPdfRegistry(pending.current, patch);
    clearTimeout(flushTimer.current);
    if (immediately) return flush();
    flushTimer.current = setTimeout(() => { void flush().catch(() => {}); }, 900);
    return Promise.resolve();
  }, [canEdit, flush]);

  // Switching to another tab or closing the browser sends progress that is still waiting for its short delay.
  useEffect(() => {
    if (!open) return;
    const leave = () => { if (document.visibilityState === "hidden") void flush().catch(() => {}); };
    document.addEventListener("visibilitychange", leave); window.addEventListener("pagehide", leave);
    return () => { document.removeEventListener("visibilitychange", leave); window.removeEventListener("pagehide", leave); };
  }, [open, flush]);

  const reload = useCallback(async () => {
    const captured = scopeRef.current;
    setLoading(true); setError("");
    try {
      const [latest, selection] = await Promise.all([loadCircuitPdfRegistry(seriesId), loadCircuitPdfOfficial(seriesId)]);
      if (scopeRef.current === captured) { setRegistry(mergeCircuitPdfRegistry(latest, pending.current)); setOfficialSelection(selection); }
    } catch (failure) {
      if (scopeRef.current === captured) setError(failure instanceof Error ? failure.message : "無法讀取 PDF 清單，請重試。");
    } finally { if (scopeRef.current === captured) setLoading(false); }
  }, [seriesId]);

  useEffect(() => {
    if (!open || !seriesId) return;
    placed.current = ""; setActiveId(""); setCompareId(""); setPinBook({}); setAutoBook({}); setOpenError(""); setLocalFileId("");
    setRegistry(empty()); setOfficialSelection(null); pending.current = empty();
    void reload();
    const cache = opened.current;
    return () => {
      // Leaving saves what is still waiting, then frees the PDFs held in memory.
      void flush().catch(() => {});
      for (const promise of cache.values()) void promise.then(pdf => pdf.destroy()).catch(() => {});
      cache.clear(); setPdfs({});
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, seriesId, userId]);

  // Open on the version this person was last reading, otherwise the newest drawing date.
  useEffect(() => {
    if (!open || loading || activeId || !documents.length) return;
    const position = latestPosition(registry, userId, seriesId);
    const start = documents.find(row => row.id === position?.documentId) || documents[0];
    setActiveId(start.id);
  }, [open, loading, activeId, documents, registry, userId, seriesId]);

  const load = useCallback((row: CircuitPdfDocument) => {
    let promise = opened.current.get(row.id);
    if (!promise) {
      promise = (async () => {
        if (row.localOnly) {
          const file = localFiles.get(row.id);
          if (!file) throw Object.assign(new Error("這份 PDF 超過雲端 50 MB 上限，只能從原檔開啟。請選擇同一個檔案。"), { localFile: true });
          return openCircuitPdf(await file.arrayBuffer());
        }
        let bytes = downloaded.get(row.path);
        if (!bytes) { bytes = await downloadCircuitPdf(row.path); remember(row.path, bytes); }
        return openCircuitPdf(bytes);
      })();
      opened.current.set(row.id, promise);
      promise.catch(() => { if (opened.current.get(row.id) === promise) opened.current.delete(row.id); });
    }
    return promise;
  }, []);

  useEffect(() => {
    if (!open) return;
    const wanted = [active, compare].filter((row): row is CircuitPdfDocument => Boolean(row));
    if (!wanted.length) { setOpening(false); setOpenError(""); setLocalFileId(""); return; }
    let current = true;
    setOpening(true); setOpenError(""); setLocalFileId("");
    Promise.allSettled(wanted.map(load)).then(results => {
      if (!current) return;
      const entries = results.flatMap((result, index) => result.status === "fulfilled" ? [[wanted[index].id, result.value] as const] : []);
      setPdfs(previous => ({ ...previous, ...Object.fromEntries(entries) }));
      const failedIndex = results.findIndex(result => result.status === "rejected");
      if (failedIndex === -1) return;
      const failure = (results[failedIndex] as PromiseRejectedResult).reason;
      const row = wanted[failedIndex];
      setOpenError(`「${row.name}」：${failure instanceof Error ? failure.message : "PDF 無法開啟，請重試。"}`);
      if ((failure as { localFile?: boolean })?.localFile) setLocalFileId(row.id);
    }).finally(() => { if (current) setOpening(false); });
    return () => { current = false; };
  }, [open, active, compare, load, openRetry]);

  // Which baseline page shows the same sheet: read both PDFs' words in the background once the pages are on screen, then
  // match them. Until then (and when there is no usable text) the same page numbers are used.
  const activeProxy = active ? pdfs[active.id] || null : null, compareProxy = compare ? pdfs[compare.id] || null : null;
  useEffect(() => {
    if (!open || !pairKey || !active || !compare || !activeProxy || !compareProxy) return;
    const known = alignments.get(pairKey);
    if (known !== undefined || active.pages > CIRCUIT_ALIGN_MAX_PAGES || compare.pages > CIRCUIT_ALIGN_MAX_PAGES) {
      const offsets = known ?? null;
      setAutoBook(book => pairKey in book && book[pairKey] === offsets ? book : { ...book, [pairKey]: offsets });
      return;
    }
    let current = true;
    setAligning(pairKey);
    const timer = setTimeout(() => {
      void Promise.all([wordsOf(compare.id, compareProxy), wordsOf(active.id, activeProxy)])
        .then(([base, work]) => { const map = alignCircuitPdfPages(base, work); return map ? circuitAlignOffsets(map) : null; })
        .catch(() => null)
        .then(offsets => {
          if (!current) return;
          alignments.set(pairKey, offsets);
          setAutoBook(book => ({ ...book, [pairKey]: offsets }));
          setAligning(value => value === pairKey ? "" : value);
        });
    }, 800);
    return () => { current = false; clearTimeout(timer); setAligning(value => value === pairKey ? "" : value); };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the ids and page counts decide the match, not each new copy of the rows
  }, [open, pairKey, active?.id, active?.pages, compare?.id, compare?.pages, activeProxy, compareProxy]);

  // The first time a version is shown, it opens where this person stopped (yesterday's page on today's PDF).
  useEffect(() => {
    if (!active || placed.current) return;
    placed.current = active.id;
    const position = latestPosition(registry, userId, seriesId);
    const source = position ? { ...registry, positions: { ...registry.positions, [userId]: position } } : registry;
    setPage(circuitPdfResumePage(source, userId, active.id, active.pages));
  }, [active, registry, userId, seriesId]);

  // Where this person is reading is remembered shortly after they stop turning pages. Only a page or version change restarts
  // the wait; saves of the list itself do not, or a busy list would keep the position from ever being recorded.
  const activeKey = active?.id || "";
  useEffect(() => {
    if (!open || !activeKey || placed.current !== activeKey) return;
    const timer = setTimeout(() => {
      const position = { documentId: activeKey, page, at: now() };
      writeLocalPosition(userId, seriesId, position);
      if (registryRef.current.positions[userId]?.page === page && registryRef.current.positions[userId]?.documentId === activeKey) return;
      void queue({ positions: { [userId]: position } }).catch(() => {});
    }, 1500);
    return () => clearTimeout(timer);
  }, [open, activeKey, page, userId, seriesId, queue]);

  const goTo = useCallback((next: number) => {
    if (!active) return;
    const target = Math.min(active.pages, Math.max(1, Math.round(next) || 1));
    pageRef.current = target; setPage(target);
  }, [active]);

  const select = useCallback((id: string) => {
    const row = documents.find(item => item.id === id);
    if (!row || row.id === activeId) return;
    placed.current = row.id;
    // Switching versions keeps the page on screen, so the same sheet of another date can be compared directly.
    setPage(current => Math.min(row.pages, current));
    setActiveId(row.id);
    if (compareId === row.id) setCompareId("");
  }, [documents, activeId, compareId]);

  const swapComparison = useCallback(() => {
    if (!active || !compare) return;
    // The pins turn around with the pair, so the same sheets stay side by side.
    savePins(`${active.id}>${compare.id}`, invertCircuitAlignPins(pins));
    placed.current = compare.id;
    setActiveId(compare.id);
    setCompareId(active.id);
    const next = comparePage || Math.min(compare.pages, Math.max(1, page + compareOffset));
    pageRef.current = next; setPage(next);
  }, [active, compare, page, comparePage, compareOffset, pins, savePins]);

  const setCompareOffset = useCallback((offset: number) => {
    if (!pairKey || !Number.isInteger(offset)) return;
    savePins(pairKey, setCircuitAlignPin(pins, pageRef.current, offset));
  }, [pairKey, pins, savePins]);
  const comparePageFor = useCallback((target: number) => resolveFor(target)?.page || 0, [resolveFor]);

  const show = useCallback((documentId: string, target: number) => {
    const row = documents.find(item => item.id === documentId);
    if (!row) return false;
    placed.current = row.id; setActiveId(row.id);
    const next = Math.min(row.pages, Math.max(1, Math.round(target) || 1));
    pageRef.current = next; setPage(next);
    if (compareId === row.id) setCompareId("");
    return true;
  }, [documents, compareId]);

  const register = useCallback(async (file: File) => {
    if (!canEdit) throw new Error("目前為檢視權限，無法上傳 PDF。");
    if (!/\.pdf$/i.test(file.name) && !/pdf/i.test(file.type)) throw new Error(`${file.name} 不是 PDF。`);
    if (!(await isPdfFile(file))) throw new Error(`${file.name} 不是有效的 PDF。`);
    const pdf = await openCircuitPdf(await file.arrayBuffer());
    const pages = pdf.numPages;
    if (pages > CIRCUIT_PDF_MAX_PAGES) { void pdf.destroy(); throw new Error(`PDF 共 ${pages} 頁，超過 ${CIRCUIT_PDF_MAX_PAGES} 頁上限。`); }
    const id = crypto.randomUUID(), at = now();
    const localOnly = file.size > CIRCUIT_PDF_MAX_BYTES;
    const path = localOnly ? "" : await uploadCircuitPdf(seriesId, id, file);
    if (localOnly) localFiles.set(id, file); else remember(path, await file.arrayBuffer());
    opened.current.set(id, Promise.resolve(pdf)); setPdfs(previous => ({ ...previous, [id]: pdf }));
    const row: CircuitPdfDocument = { id, name: file.name.slice(0, CIRCUIT_PDF_NAME_LIMIT) || "schematic.pdf", date: circuitPdfDateFromFile(file), label: "", path, localOnly,
      size: file.size, pages, uploadedAt: at, uploadedBy: userId, uploadedByName: userName, updatedAt: at };
    await queue({ documents: [row] }, true);
    return { row, localOnly };
  }, [canEdit, seriesId, userId, userName, queue]);

  const upload = useCallback(async (file: File) => {
    const captured = scopeRef.current;
    // The new day's PDF continues at the page being read now, or where this person last stopped when nothing is open.
    const reading = onScreen.current.documentId ? onScreen.current.page : latestPosition(registryRef.current, userId, seriesId)?.page || 1;
    setUploading(file.name); setError("");
    try {
      const { row, localOnly } = await register(file);
      if (scopeRef.current !== captured) return;
      placed.current = row.id; setActiveId(row.id); setOpenError(""); setLocalFileId("");
      const next = Math.min(row.pages, Math.max(1, reading));
      pageRef.current = next; setPage(next);
      if (localOnly) setError(`「${file.name}」超過雲端 50 MB 上限：已在這台電腦開啟，截圖與進度照常保存；其他同仁需要自己的檔案，之後重新開啟時請再選一次這個檔案。`);
    } catch (failure) {
      if (scopeRef.current === captured) setError(failure instanceof Error ? failure.message : "PDF 上傳失敗，請重試。");
      throw failure;
    } finally { if (scopeRef.current === captured) setUploading(""); }
  }, [register, userId, seriesId]);

  const openLocal = useCallback(async (file: File) => {
    const target = [active, compare].find(row => row?.id === localFileId && row.localOnly);
    if (!target) return;
    const captured = scopeRef.current;
    if (!(await isPdfFile(file))) throw new Error(`${file.name} 不是有效的 PDF。`);
    if (file.size !== target.size) throw new Error(`選擇的檔案大小與「${target.name}」不同，請選擇同一個檔案。`);
    if (scopeRef.current !== captured) return;
    const pdf = await openCircuitPdf(await file.arrayBuffer());
    if (pdf.numPages !== target.pages || scopeRef.current !== captured) {
      void pdf.destroy();
      if (scopeRef.current === captured) throw new Error(`選擇的檔案頁數與「${target.name}」不同，請選擇同一個檔案。`);
      return;
    }
    localFiles.set(target.id, file); opened.current.set(target.id, Promise.resolve(pdf));
    setPdfs(previous => ({ ...previous, [target.id]: pdf }));
    // Recheck both selected sources so a second local PDF can request its own file.
    setOpenRetry(value => value + 1);
  }, [active, compare, localFileId]);

  const setChecked = useCallback((target: number, checked: boolean) => {
    if (!active || !canEdit) return;
    void queue({ pages: { [String(target)]: { checked, at: now(), by: userId, byName: userName, documentId: active.id } } }).catch(() => {});
  }, [active, canEdit, queue, userId, userName]);

  const updateDocument = useCallback((id: string, patch: { date?: string; label?: string }) => {
    const row = registryRef.current.documents.find(item => item.id === id);
    if (!row || !canEdit) return;
    const date = patch.date !== undefined && DATE.test(patch.date) ? patch.date : row.date;
    const label = patch.label !== undefined ? patch.label.slice(0, CIRCUIT_PDF_LABEL_LIMIT) : row.label;
    if (date === row.date && label === row.label) return;
    void queue({ documents: [{ ...row, date, label, updatedAt: now() }] }).catch(() => {});
  }, [canEdit, queue]);

  const setOfficial = useCallback(async (id: string) => {
    if (!canEdit) throw new Error("目前為檢視權限，無法設定官方版本。");
    const row = registryRef.current.documents.find(item => item.id === id && !item.removedAt);
    if (!row) throw new Error("這份 PDF 已不在清單中，請重新載入。");
    if (row.localOnly || !row.path) throw new Error("官方版本須使用已存到雲端的 PDF；本機 PDF 仍可作為工作版本。");
    const captured = scopeRef.current;
    const selection = await saveCircuitPdfOfficial(seriesId, id);
    if (scopeRef.current === captured) { setOfficialSelection(selection); setError(""); }
  }, [canEdit, seriesId]);

  const removeDocument = useCallback(async (id: string) => {
    const row = registryRef.current.documents.find(item => item.id === id);
    if (!row || !canEdit) return;
    if (officialRef.current?.id === id) throw new Error("官方版本不能刪除。請先把另一份 PDF 設為官方版本。");
    const at = now();
    await queue({ documents: [{ ...row, removedAt: at, updatedAt: at }] }, true);
    if (activeId === id) { placed.current = ""; setActiveId(""); }
    if (compareId === id) setCompareId("");
    void opened.current.get(id)?.then(pdf => pdf.destroy()).catch(() => {});
    opened.current.delete(id); localFiles.delete(id);
  }, [canEdit, queue, activeId, compareId]);

  const restoreDocument = useCallback(async (id: string) => {
    const row = registryRef.current.documents.find(item => item.id === id && item.removedAt);
    if (!row || !canEdit) return;
    const restored = { ...row, updatedAt: now() }; delete restored.removedAt;
    await queue({ documents: [restored] }, true);
  }, [canEdit, queue]);

  return {
    registry, documents, loading, saving, error, uploading, active, compare,
    official, officialPdf: official ? pdfs[official.id] || null : null, officialPage,
    activePdf: active ? pdfs[active.id] || null : null, comparePdf: compare ? pdfs[compare.id] || null : null,
    opening, openError, needsLocalFile: Boolean(localFileId), page, comparePage, compareOffset,
    comparePageFor, alignment: { source: resolved?.source || "same", offset: resolved?.offset ?? 0, aligning: Boolean(pairKey) && aligning === pairKey }, alignmentKey,
    setComparePage: target => { if (Number.isInteger(target)) setCompareOffset(target - pageRef.current); },
    clearComparePin: () => { if (pairKey) savePins(pairKey, clearCircuitAlignPin(pins, pageRef.current)); },
    upload, openLocal, show, select, setCompare: id => { if (id === activeId) return; setCompareId(id); }, setCompareOffset, swapComparison,
    setOfficial, compareOfficial: () => { setCompareId(official?.id || ""); },
    goTo, setChecked, updateDocument, removeDocument, restoreDocument, reload, clearError: () => setError(""),
  };
}

/** This person's reading position: the newer of what is shared and what this browser remembers (a save may not have gone out). */
function latestPosition(registry: CircuitPdfRegistry, userId: string, seriesId: string) {
  const shared = registry.positions[userId], local = readLocalPosition(userId, seriesId);
  if (!shared || !local) return shared || local;
  return Date.parse(local.at) > Date.parse(shared.at) ? local : shared;
}
function readLocalPosition(userId: string, seriesId: string) {
  try {
    const value = JSON.parse(window.localStorage.getItem(positionKey(userId, seriesId)) || "null");
    return value && typeof value.page === "number" && typeof value.documentId === "string" && typeof value.at === "string" ? value as { documentId: string; page: number; at: string } : null;
  } catch { return null; }
}
function writeLocalPosition(userId: string, seriesId: string, position: { documentId: string; page: number; at: string }) {
  try { window.localStorage.setItem(positionKey(userId, seriesId), JSON.stringify(position)); } catch { /* the shared position still records it */ }
}
