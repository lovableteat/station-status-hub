import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  CIRCUIT_PDF_LABEL_LIMIT, CIRCUIT_PDF_MAX_BYTES, CIRCUIT_PDF_MAX_PAGES, CIRCUIT_PDF_NAME_LIMIT, circuitPdfDateFromFile, circuitPdfResumePage,
  emptyCircuitPdfRegistry, mergeCircuitPdfRegistry, visibleCircuitPdfDocuments, type CircuitPdfDocument, type CircuitPdfRegistry,
} from "./circuitPdf";
import { isPdfFile, openCircuitPdf } from "./pdfRender";
import { downloadCircuitPdf, loadCircuitPdfRegistry, saveCircuitPdfRegistry, uploadCircuitPdf } from "./pdfStorage";
import { loadCircuitPdfOfficial, saveCircuitPdfOfficial, type CircuitPdfOfficial } from "./officialPdfStorage";

export interface CircuitPdfModel {
  registry: CircuitPdfRegistry; documents: CircuitPdfDocument[];
  loading: boolean; saving: boolean; error: string; uploading: string;
  active: CircuitPdfDocument | null; compare: CircuitPdfDocument | null;
  official: CircuitPdfDocument | null; officialPdf: PDFDocumentProxy | null; officialPage: number;
  activePdf: PDFDocumentProxy | null; comparePdf: PDFDocumentProxy | null;
  opening: boolean; openError: string; needsLocalFile: boolean;
  page: number; comparePage: number; compareOffset: number;
  upload: (file: File) => Promise<void>; openLocal: (file: File) => Promise<void>;
  /** Opens a version at a page, e.g. the page a picture was framed on. Returns false when that version is no longer offered. */
  show: (documentId: string, page: number) => boolean;
  select: (id: string) => void; setCompare: (id: string) => void; setCompareOffset: (offset: number) => void;
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

export function useCircuitPdfs({ open, seriesId, canEdit, userId, userName }: { open: boolean; seriesId: string; canEdit: boolean; userId: string; userName: string }): CircuitPdfModel {
  const [registry, setRegistry] = useState<CircuitPdfRegistry>(empty);
  const [officialSelection, setOfficialSelection] = useState<CircuitPdfOfficial | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState("");
  const [activeId, setActiveId] = useState("");
  const [compareId, setCompareId] = useState("");
  const [compareOffset, setCompareOffset] = useState(0);
  const [page, setPage] = useState(1);
  const [pdfs, setPdfs] = useState<Record<string, PDFDocumentProxy>>({});
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState("");
  const [needsLocalFile, setNeedsLocalFile] = useState(false);
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
  const compare = documents.find(row => row.id === compareId && row.id !== activeId) || null;
  const compareTarget = page + compareOffset;
  const comparePage = compare ? compare.id === official?.id && (compareTarget < 1 || compareTarget > compare.pages) ? 0 : Math.min(compare.pages, Math.max(1, compareTarget)) : 0;
  const officialTarget = page + (compareId === official?.id ? compareOffset : 0);
  const officialPage = official && officialTarget >= 1 && officialTarget <= official.pages ? officialTarget : 0;
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
    placed.current = ""; setActiveId(""); setCompareId(""); setCompareOffset(0); setOpenError(""); setNeedsLocalFile(false);
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
    if (!official || !active || official.id === active.id) return;
    setCompareId(official.id); setCompareOffset(0);
  }, [official?.id, active?.id]);

  useEffect(() => {
    if (!open) return;
    const wanted = [active, compare, official].filter((row, index, all): row is CircuitPdfDocument => Boolean(row) && all.findIndex(item => item?.id === row?.id) === index);
    if (!wanted.length) return;
    let current = true;
    setOpening(true); setOpenError(""); setNeedsLocalFile(false);
    Promise.all(wanted.map(row => load(row).then(pdf => [row.id, pdf] as const))).then(entries => {
      if (!current) return;
      setPdfs(previous => ({ ...previous, ...Object.fromEntries(entries) }));
    }).catch(failure => {
      if (!current) return;
      setOpenError(failure instanceof Error ? failure.message : "PDF 無法開啟，請重試。");
      setNeedsLocalFile(Boolean((failure as { localFile?: boolean })?.localFile));
    }).finally(() => { if (current) setOpening(false); });
    return () => { current = false; };
  }, [open, active, compare, official, load]);

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
    setPage(Math.min(active.pages, Math.max(1, Math.round(next) || 1)));
  }, [active]);

  const select = useCallback((id: string) => {
    const row = documents.find(item => item.id === id);
    if (!row) return;
    placed.current = row.id;
    // Switching versions keeps the page on screen, so the same sheet of another date can be compared directly.
    setPage(current => Math.min(row.pages, current));
    setActiveId(row.id);
    if (compareId === row.id) setCompareId("");
  }, [documents, compareId]);

  const show = useCallback((documentId: string, target: number) => {
    const row = documents.find(item => item.id === documentId);
    if (!row) return false;
    placed.current = row.id; setActiveId(row.id);
    setPage(Math.min(row.pages, Math.max(1, Math.round(target) || 1)));
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
      placed.current = row.id; setActiveId(row.id); setOpenError(""); setNeedsLocalFile(false);
      setPage(Math.min(row.pages, Math.max(1, reading)));
      if (localOnly) setError(`「${file.name}」超過雲端 50 MB 上限：已在這台電腦開啟，截圖與進度照常保存；其他同仁需要自己的檔案，之後重新開啟時請再選一次這個檔案。`);
    } catch (failure) {
      if (scopeRef.current === captured) setError(failure instanceof Error ? failure.message : "PDF 上傳失敗，請重試。");
      throw failure;
    } finally { if (scopeRef.current === captured) setUploading(""); }
  }, [register, userId, seriesId]);

  const openLocal = useCallback(async (file: File) => {
    if (!active?.localOnly) return;
    if (!(await isPdfFile(file))) throw new Error(`${file.name} 不是有效的 PDF。`);
    if (file.size !== active.size) throw new Error(`選擇的檔案大小與「${active.name}」不同，請選擇同一個檔案。`);
    localFiles.set(active.id, file); opened.current.delete(active.id);
    setOpenError(""); setNeedsLocalFile(false);
    const pdf = await load(active);
    setPdfs(previous => ({ ...previous, [active.id]: pdf }));
  }, [active, load]);

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
    if (!canEdit) throw new Error("目前為檢視權限，無法設定官方基準。");
    const row = registryRef.current.documents.find(item => item.id === id && !item.removedAt);
    if (!row) throw new Error("這個 PDF 版本已不在清單中，請重新載入。");
    if (row.localOnly || !row.path) throw new Error("官方基準須使用已存到雲端的 PDF；本機 PDF 仍可作為工作版本。");
    const captured = scopeRef.current;
    const selection = await saveCircuitPdfOfficial(seriesId, id);
    if (scopeRef.current === captured) { setOfficialSelection(selection); setError(""); }
  }, [canEdit, seriesId]);

  const removeDocument = useCallback(async (id: string) => {
    const row = registryRef.current.documents.find(item => item.id === id);
    if (!row || !canEdit) return;
    if (officialRef.current?.id === id) throw new Error("官方基準不能刪除。請先把另一份 PDF 設為官方基準。");
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
    opening, openError, needsLocalFile, page, comparePage, compareOffset,
    upload, openLocal, show, select, setCompare: id => { setCompareId(id); setCompareOffset(0); }, setCompareOffset,
    setOfficial, compareOfficial: () => { setCompareId(official?.id || ""); setCompareOffset(0); },
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
