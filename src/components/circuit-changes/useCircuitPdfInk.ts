import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CIRCUIT_PDF_MAX_PAGES } from "./circuitPdf";
import {
  CIRCUIT_PDF_INK_COLOR, CIRCUIT_PDF_INK_WIDTH, CIRCUIT_PDF_INK_MAX_POINTS, CIRCUIT_PDF_INK_MAX_STROKES,
  mergeCircuitPdfInk, normalizeCircuitPdfInk, type CircuitPdfInkStroke,
} from "./circuitPdfInk";
import { loadCircuitPdfInk, saveCircuitPdfInk } from "./pdfInkStorage";

export interface CircuitPdfInkModel {
  pages: Record<string, CircuitPdfInkStroke[]>;
  loading: boolean; saving: boolean; error: string;
  load: (documentId: string, page: number) => Promise<void>;
  add: (documentId: string, page: number, points: CircuitPdfInkStroke["points"]) => void;
  remove: (documentId: string, page: number, id: string) => void;
  undo: (documentId: string, page: number) => void;
  retry: () => Promise<void>;
}

const keyFor = (documentId: string, page: number) => `${documentId}:${page}`;
const validTarget = (documentId: string, page: number) => Boolean(documentId.trim()) && documentId.length <= 100 && Number.isInteger(page) && page >= 1 && page <= CIRCUIT_PDF_MAX_PAGES;
const outboxPrefix = (userId: string, seriesId: string) => `circuit-pdf-ink-outbox:v1:${encodeURIComponent(userId)}:${encodeURIComponent(seriesId)}:`;
const messageOf = (failure: unknown, fallback: string) => failure && typeof failure === "object" && "message" in failure && typeof failure.message === "string" ? failure.message : fallback;
type Session = {
  seriesId: string; userId: string; userName: string; open: boolean; canEdit: boolean; prefix: string;
  fullPages: Record<string, CircuitPdfInkStroke[]>; pages: Record<string, CircuitPdfInkStroke[]>;
  events: Map<string, CircuitPdfInkStroke>; requested: Map<string, { documentId: string; page: number }>;
  loaded: Set<string>; loads: Map<string, Promise<void>>; writes: Map<string, Promise<void>>;
  readErrors: Map<string, string>; writeErrors: Map<string, string>;
  at: number; epoch: number; error: string;
};

function refreshRequestError(session: Session) {
  const errors = [...session.readErrors.values(), ...session.writeErrors.values()];
  session.error = errors[errors.length - 1] || "";
}

function putPage(session: Session, documentId: string, page: number, rows: CircuitPdfInkStroke[]) {
  const key = keyFor(documentId, page);
  session.fullPages[key] = rows;
  session.pages = { ...session.pages, [key]: rows.filter(row => !row.removedAt) };
  for (const row of rows) session.at = Math.max(session.at, Date.parse(row.removedAt || row.at));
}

// Each mutation has its own key: two open tabs must not replace each other's unsent outbox.
function readOutbox(session: Session) {
  let malformed = false;
  try {
    const storage = window.localStorage;
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (!key?.startsWith(session.prefix) || session.events.has(key)) continue;
      try {
        const raw = JSON.parse(storage.getItem(key) || "null");
        const row = raw && typeof raw.documentId === "string" && validTarget(raw.documentId, raw.page)
          ? normalizeCircuitPdfInk([raw], raw.documentId, raw.page)[0] : null;
        if (!row) { malformed = true; continue; }
        session.events.set(key, row);
        const pageKey = keyFor(row.documentId, row.page);
        putPage(session, row.documentId, row.page, mergeCircuitPdfInk(session.fullPages[pageKey] || [], [row]));
      } catch { malformed = true; }
    }
    if (malformed) session.error = "部分本機畫筆暫存無法讀取，原內容仍保留。";
  } catch { session.error = "無法讀取本機畫筆暫存；請允許網站使用本機儲存。"; }
}

function createSession(seriesId: string, userId: string): Session {
  const session: Session = { seriesId, userId, userName: "", open: false, canEdit: false, prefix: outboxPrefix(userId, seriesId),
    fullPages: {}, pages: {}, events: new Map(), requested: new Map(), loaded: new Set(), loads: new Map(), writes: new Map(), readErrors: new Map(), writeErrors: new Map(), at: 0, epoch: 0, error: "" };
  if (seriesId && userId) readOutbox(session);
  return session;
}

function pending(session: Session, documentId: string, page: number) {
  return [...session.events].filter(([, row]) => row.documentId === documentId && row.page === page);
}

export function useCircuitPdfInk({ open, seriesId, canEdit, userId, userName }: {
  open: boolean; seriesId: string; canEdit: boolean; userId: string; userName: string;
}): CircuitPdfInkModel {
  const session = useMemo(() => createSession(seriesId, userId), [seriesId, userId]);
  if (session.open !== open) { session.epoch++; session.loaded.clear(); session.loads.clear(); }
  session.open = open; session.canEdit = canEdit; session.userName = userName;
  const current = useRef(session); current.current = session;
  const mounted = useRef(true);
  const [snapshot, setSnapshot] = useState({ session, pages: session.pages, loading: false, saving: false, error: session.error });
  const isCurrent = useCallback(() => mounted.current && current.current === session, [session]);
  const writable = useCallback(() => isCurrent() && session.open && session.canEdit && Boolean(session.seriesId && session.userId), [isCurrent, session]);
  const publish = useCallback(() => {
    if (isCurrent()) setSnapshot({ session, pages: session.pages, loading: session.loads.size > 0, saving: session.writes.size > 0, error: session.error });
  }, [isCurrent, session]);

  const savePage = useCallback(async (documentId: string, page: number): Promise<void> => {
    const pageKey = keyFor(documentId, page);
    const running = session.writes.get(pageKey);
    if (running) return running;
    if (!writable() || !pending(session, documentId, page).length) return;
    const run = (async () => {
      while (writable()) {
        const entries = pending(session, documentId, page);
        if (!entries.length) break;
        const delta = entries.map(([, row]) => row);
        const saved = await saveCircuitPdfInk(session.seriesId, documentId, page, latest => {
          if (!writable()) throw new Error("畫筆儲存已停止，暫存會保留到下次開啟。");
          const merged = mergeCircuitPdfInk(latest, delta);
          const addsNew = delta.some(row => !row.removedAt && !latest.some(known => known.id === row.id));
          if (addsNew && merged.filter(row => !row.removedAt).length > CIRCUIT_PDF_INK_MAX_STROKES) throw new Error(`每頁最多 ${CIRCUIT_PDF_INK_MAX_STROKES} 筆畫筆，請先移除不需要的筆畫。`);
          return merged;
        });
        if (!isCurrent()) return;
        for (const [key, row] of entries) {
          if (session.events.get(key) !== row) continue;
          window.localStorage.removeItem(key);
          session.events.delete(key);
        }
        putPage(session, documentId, page, mergeCircuitPdfInk(saved, pending(session, documentId, page).map(([, row]) => row)));
        session.writeErrors.delete(pageKey); refreshRequestError(session); publish();
      }
    })();
    session.writes.set(pageKey, run); publish();
    try { await run; }
    catch (failure) {
      if (isCurrent()) { session.writeErrors.set(pageKey, `畫筆尚未儲存，已保留在本機：${messageOf(failure, "請重試。")}`); refreshRequestError(session); publish(); }
      throw failure;
    } finally {
      if (session.writes.get(pageKey) === run) session.writes.delete(pageKey);
      publish();
    }
  }, [isCurrent, publish, session, writable]);

  const load = useCallback(async (documentId: string, page: number): Promise<void> => {
    if (!isCurrent() || !session.open || !session.seriesId || !session.userId) return;
    if (!validTarget(documentId, page)) throw new Error("PDF 版本或頁碼無效。");
    const pageKey = keyFor(documentId, page);
    session.requested.set(pageKey, { documentId, page });
    if (session.loaded.has(pageKey)) return;
    const running = session.loads.get(pageKey);
    if (running) return running;
    const epoch = session.epoch;
    const run = (async () => {
      const rows = await loadCircuitPdfInk(session.seriesId, documentId, page);
      if (!isCurrent() || epoch !== session.epoch) return;
      putPage(session, documentId, page, mergeCircuitPdfInk(rows, session.fullPages[pageKey] || []));
      session.loaded.add(pageKey);
      const previousError = session.readErrors.get(pageKey);
      session.readErrors.delete(pageKey);
      if (previousError && session.error === previousError) refreshRequestError(session);
    })();
    session.loads.set(pageKey, run); publish();
    try { await run; }
    catch (failure) { if (isCurrent() && epoch === session.epoch) { session.readErrors.set(pageKey, messageOf(failure, "畫筆讀取失敗，請重試。")); refreshRequestError(session); publish(); } throw failure; }
    finally { if (session.loads.get(pageKey) === run) session.loads.delete(pageKey); publish(); }
  }, [isCurrent, publish, session]);

  const accept = useCallback((row: CircuitPdfInkStroke) => {
    const key = `${session.prefix}${encodeURIComponent(row.documentId)}:${row.page}:${encodeURIComponent(row.id)}:${encodeURIComponent(row.removedAt || row.at)}`;
    try { window.localStorage.setItem(key, JSON.stringify(row)); }
    catch { session.error = "無法保留未儲存的畫筆；請允許本機儲存或釋放空間後重試。"; publish(); return; }
    session.events.set(key, row);
    const pageKey = keyFor(row.documentId, row.page);
    putPage(session, row.documentId, row.page, mergeCircuitPdfInk(session.fullPages[pageKey] || [], [row]));
    refreshRequestError(session); publish();
    void savePage(row.documentId, row.page).catch(() => {});
  }, [publish, savePage, session]);

  const add = useCallback((documentId: string, page: number, points: CircuitPdfInkStroke["points"]) => {
    if (!writable()) { if (isCurrent()) { session.error = "目前無法編輯畫筆，請確認編輯權限。"; publish(); } return; }
    const fail = (message: string) => { session.error = message; publish(); };
    if (!validTarget(documentId, page)) { fail("PDF 版本或頁碼無效。"); return; }
    if (!Array.isArray(points) || !points.length || points.length > CIRCUIT_PDF_INK_MAX_POINTS) { fail(`每筆畫筆需有 1–${CIRCUIT_PDF_INK_MAX_POINTS} 個座標點。`); return; }
    if ((session.pages[keyFor(documentId, page)] || []).length >= CIRCUIT_PDF_INK_MAX_STROKES) { fail(`每頁最多 ${CIRCUIT_PDF_INK_MAX_STROKES} 筆畫筆，請先移除不需要的筆畫。`); return; }
    session.at = Math.max(Date.now(), session.at + 1);
    const row = normalizeCircuitPdfInk([{ id: crypto.randomUUID(), documentId, page, points, color: CIRCUIT_PDF_INK_COLOR, width: CIRCUIT_PDF_INK_WIDTH,
      at: new Date(session.at).toISOString(), by: session.userId, byName: session.userName }], documentId, page)[0];
    if (!row) { fail("畫筆座標無效，請在 PDF 頁面範圍內繪製。"); return; }
    accept(row);
  }, [accept, isCurrent, publish, session, writable]);

  const remove = useCallback((documentId: string, page: number, id: string) => {
    if (!writable()) { if (isCurrent()) { session.error = "目前無法編輯畫筆，請確認編輯權限。"; publish(); } return; }
    const row = session.fullPages[keyFor(documentId, page)]?.find(value => value.id === id && !value.removedAt);
    if (!row) return;
    session.at = Math.max(Date.now(), session.at + 1, Date.parse(row.at) + 1);
    accept({ ...row, removedAt: new Date(session.at).toISOString(), removedBy: session.userId, removedByName: session.userName });
  }, [accept, isCurrent, publish, session, writable]);

  const undo = useCallback((documentId: string, page: number) => {
    const rows = session.pages[keyFor(documentId, page)] || [];
    const last = rows.reduce<CircuitPdfInkStroke | null>((chosen, row) => !chosen || Date.parse(row.at) >= Date.parse(chosen.at) ? row : chosen, null);
    if (last) remove(documentId, page, last.id);
  }, [remove, session]);

  const retry = useCallback(async () => {
    if (!writable()) { if (isCurrent()) { session.error = "目前無法儲存畫筆，請確認編輯權限。"; publish(); } return; }
    readOutbox(session); publish();
    for (const target of session.requested.values()) if (!session.loaded.has(keyFor(target.documentId, target.page))) await load(target.documentId, target.page);
    const targets = new Map([...session.events.values()].map(row => [keyFor(row.documentId, row.page), row]));
    for (const row of targets.values()) await savePage(row.documentId, row.page);
  }, [isCurrent, load, publish, savePage, session, writable]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => { if (open && canEdit && session.events.size) void retry().catch(() => {}); }, [open, canEdit, retry, session]);

  const visible = snapshot.session === session ? snapshot : { pages: session.pages, loading: false, saving: false, error: session.error };
  return { pages: open ? visible.pages : {}, loading: visible.loading, saving: visible.saving, error: visible.error, load, add, remove, undo, retry };
}
