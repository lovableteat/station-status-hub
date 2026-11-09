import { useEffect, useRef, useState } from "react";
import { uploadCircuitImages } from "./files";
import { actOnCircuitChangeItem, CircuitChangeConflictError, createCircuitChangeSet, getCircuitChangeEvent, getCircuitChangeItem, listCircuitChangeEvents, listCircuitChangeItems, listCircuitChangeSets, saveCircuitChangeItem, subscribeCircuitChanges } from "./storage";
import { emptyCircuitChangeContent, type CircuitChangeContent, type CircuitChangeContext, type CircuitChangeEvent, type CircuitChangeItem, type CircuitChangeSet, type CircuitChangesModel, type CircuitImageSide, type CircuitUploadFailure } from "./types";

const message = (error: unknown) => error instanceof Error ? error.message : "線路修改操作失敗，請重試。";
const summary = (item: CircuitChangeItem): CircuitChangeItem => ({ ...item, imageCount: item.content.images.length, content: { ...item.content, images: [] } });

export function useCircuitChanges({ open, context, canEdit, userId, userName }: {
  open: boolean; context: CircuitChangeContext; canEdit: boolean; userId: string; userName: string;
}): CircuitChangesModel {
  const [sets, setSets] = useState<CircuitChangeSet[]>([]);
  const [items, setItems] = useState<CircuitChangeItem[]>([]);
  const [selectedSetId, setSelectedSetId] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [selectedItem, setSelectedItem] = useState<CircuitChangeItem | null>(null);
  const [draft, setDraft] = useState<CircuitChangeContent | null>(null);
  const [events, setEvents] = useState<CircuitChangeEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [editVersion, setEditVersion] = useState(0);
  const [uploadProgress, setUploadProgress] = useState({ completed: 0, total: 0 });
  const [uploadFailures, setUploadFailures] = useState<CircuitUploadFailure[]>([]);
  const [uploadWarnings, setUploadWarnings] = useState<string[]>([]);
  const scopeKey = `${userId}:${context.seriesId}:${open}:${canEdit}`;
  const scopeIdentity = useRef({ key: "", generation: 0 });
  if (scopeIdentity.current.key !== scopeKey) scopeIdentity.current = { key: scopeKey, generation: scopeIdentity.current.generation + 1 };
  const scope = `${scopeKey}:${scopeIdentity.current.generation}`;
  const scopeRef = useRef(scope); scopeRef.current = scope;
  const editAccess = useRef(canEdit); editAccess.current = canEdit;
  const selection = useRef({ setId: "", itemId: "" });
  const current = useRef<CircuitChangeItem | null>(null);
  const draftRef = useRef<CircuitChangeContent | null>(null);
  const draftCacheKey = useRef("");
  const remote = useRef<CircuitChangeItem | null>(null);
  const localVersion = useRef(0);
  const saveInFlight = useRef<Promise<void> | null>(null);
  const syncing = useRef("");
  const fingerprint = useRef("");
  const uploadSide = useRef<CircuitImageSide>("after");
  const uploadFailuresRef = useRef<CircuitUploadFailure[]>([]);
  const uploadQueue = useRef<Promise<void>>(Promise.resolve());
  const pendingUploads = useRef(0);
  const reservedUploads = useRef(0);
  const isDirty = () => Boolean(current.current && draftRef.current && JSON.stringify(current.current.content) !== JSON.stringify(draftRef.current));
  const dirty = isDirty();
  const cacheKey = (id: string) => `circuit-change-draft:v1:${userId}:${context.seriesId}:${id}`;
  const assertScope = (captured: string, writing = false) => {
    if (scopeRef.current !== captured || !open || !userId || (writing && !editAccess.current)) throw new Error("帳號、BOM 或編輯權限已變更，已停止舊的操作。");
  };
  const clearCache = (id: string) => { try { localStorage.removeItem(cacheKey(id)); } catch { /* In-memory draft remains usable. */ } };
  const cacheDraft = () => {
    if (!current.current || !draftRef.current || !draftCacheKey.current || !isDirty()) return;
    try { localStorage.setItem(draftCacheKey.current, JSON.stringify({ revision: current.current.revision, content: draftRef.current })); }
    catch { setSaveError("瀏覽器無法保留離線草稿，請保持此視窗開啟並重試儲存。"); }
  };
  function install(next: CircuitChangeItem, restore = false) {
    let nextDraft = next.content;
    let restoredConflict = false;
    if (restore && canEdit) {
      try {
        const cached = JSON.parse(localStorage.getItem(cacheKey(next.id)) || "null");
        if (cached?.content && typeof cached.content.title === "string" && Array.isArray(cached.content.images)) {
          nextDraft = cached.content; restoredConflict = cached.revision !== next.revision;
        }
      } catch { /* Ignore unreadable local cache; server data stays authoritative. */ }
    }
    current.current = next; remote.current = next; draftRef.current = nextDraft;
    draftCacheKey.current = cacheKey(next.id);
    selection.current.itemId = next.id;
    setSelectedItemId(next.id); setSelectedItem(next); setDraft(nextDraft); setConflict(restoredConflict); setSaveError("");
    localVersion.current += 1; setEditVersion(localVersion.current);
  }
  async function loadSelected(id: string, captured: string, restore = false) {
    const next = await getCircuitChangeItem(id);
    assertScope(captured);
    if (selection.current.itemId && selection.current.itemId !== id) return;
    if (isDirty() && current.current?.id === id && next.revision !== current.current.revision) {
      remote.current = next; setConflict(true);
    } else if (!isDirty() || current.current?.id !== id) install(next, restore);
    const history = await listCircuitChangeEvents(id);
    assertScope(captured);
    if (selection.current.itemId === id) setEvents(history);
  }
  async function refresh(force = false) {
    if (!open || !userId || syncing.current === scope) return;
    syncing.current = scope;
    const captured = scope;
    try {
      const nextSets = await listCircuitChangeSets(context.seriesId);
      assertScope(captured);
      setSets(nextSets); setError("");
      const setId = nextSets.some(row => row.id === selection.current.setId) ? selection.current.setId : nextSets[0]?.id || "";
      selection.current.setId = setId; setSelectedSetId(setId);
      if (!setId) { setItems([]); return; }
      const nextFingerprint = `${setId}:${nextSets.find(row => row.id === setId)?.updatedAt}`;
      if (!force && fingerprint.current === nextFingerprint) return;
      const nextItems = await listCircuitChangeItems(setId);
      assertScope(captured);
      if (selection.current.setId !== setId) return;
      fingerprint.current = nextFingerprint; setItems(nextItems);
      const id = nextItems.some(row => row.id === selection.current.itemId) ? selection.current.itemId : nextItems[0]?.id || "";
      if (!id) {
        if (!isDirty()) { current.current = null; draftRef.current = null; selection.current.itemId = ""; setSelectedItemId(""); setSelectedItem(null); setDraft(null); setEvents([]); }
        return;
      }
      const meta = nextItems.find(row => row.id === id)!;
      if (force || current.current?.id !== id || current.current.revision !== meta.revision) {
        selection.current.itemId = id; await loadSelected(id, captured, current.current?.id !== id);
      }
    } catch (failure) { if (scopeRef.current === captured) setError(message(failure)); }
    finally { if (syncing.current === captured) syncing.current = ""; if (scopeRef.current === captured) setLoading(false); }
  }
  function updateDraft(patch: Partial<CircuitChangeContent>) {
    if (!canEdit || !draftRef.current) return;
    draftRef.current = { ...draftRef.current, ...patch };
    localVersion.current += 1; setEditVersion(localVersion.current); setDraft(draftRef.current); setSaveError("");
  }
  async function saveDraft() {
    const captured = scope;
    assertScope(captured, true);
    if (saveInFlight.current) await saveInFlight.current;
    assertScope(captured, true);
    if (!isDirty()) return;
    if (conflict) throw new CircuitChangeConflictError();
    const target = current.current, value = draftRef.current, version = localVersion.current;
    if (!target || !value) return;
    const promise = (async () => {
      setSaving(true); setSaveError(""); cacheDraft();
      try {
        const next = await saveCircuitChangeItem(target.setId, target.id, target.revision, value);
        assertScope(captured, true);
        current.current = next; setSelectedItem(next); setItems(rows => rows.map(row => row.id === next.id ? summary(next) : row));
        if (version === localVersion.current) { draftRef.current = next.content; setDraft(next.content); clearCache(next.id); }
        const history = await listCircuitChangeEvents(next.id);
        assertScope(captured);
        if (selection.current.itemId === next.id) setEvents(history);
      } catch (failure) {
        if (scopeRef.current === captured) {
          setSaveError(message(failure)); cacheDraft();
          if (failure instanceof CircuitChangeConflictError) {
            setConflict(true);
            const latest = await getCircuitChangeItem(target.id).catch(() => null);
            if (scopeRef.current === captured && selection.current.itemId === target.id) remote.current = latest;
          }
        }
        throw failure;
      } finally { if (scopeRef.current === captured) setSaving(false); }
    })();
    saveInFlight.current = promise;
    try { await promise; } finally { if (saveInFlight.current === promise) saveInFlight.current = null; }
  }
  async function finishDraft(ignoreUploads = false) {
    const captured = scope;
    if (!ignoreUploads && pendingUploads.current > 0) throw new Error("圖片仍在上傳，請等候完成或重試失敗項目。");
    if (isDirty()) await saveDraft();
    assertScope(captured);
    if (isDirty()) throw new Error("仍有新輸入的草稿，請稍候儲存完成。");
  }
  async function selectItem(id: string) {
    if (id === selection.current.itemId) return;
    await finishDraft();
    selection.current.itemId = id; setSelectedItemId(id); setLoading(true); setUploadFailures([]); uploadFailuresRef.current = [];
    try { await loadSelected(id, scope, true); } finally { setLoading(false); }
  }
  async function selectSet(id: string) {
    if (id === selection.current.setId) return;
    await finishDraft();
    selection.current = { setId: id, itemId: "" }; current.current = null; draftRef.current = null;
    setSelectedSetId(id); setSelectedItemId(""); setSelectedItem(null); setDraft(null); setEvents([]); fingerprint.current = "";
    await refresh(true);
  }
  async function createSet(title: string, fromLabel: string, toLabel: string) {
    await finishDraft(); assertScope(scope, true);
    const captured = scope, next = await createCircuitChangeSet(context, title, fromLabel, toLabel);
    assertScope(captured, true);
    selection.current = { setId: next.id, itemId: "" }; current.current = null; draftRef.current = null;
    setSelectedSetId(next.id); setSelectedItemId(""); setSelectedItem(null); setDraft(null); setEvents([]); fingerprint.current = "";
    await refresh(true);
  }
  async function newItem(ignoreUploads = false) {
    await finishDraft(ignoreUploads); assertScope(scope, true);
    if (!selection.current.setId) throw new Error("請先建立或選取修改批次。");
    const captured = scope;
    const next = await saveCircuitChangeItem(selection.current.setId, crypto.randomUUID(), 0, emptyCircuitChangeContent(userName));
    assertScope(captured, true);
    install(next); setItems(rows => [...rows, summary(next)]);
    const history = await listCircuitChangeEvents(next.id); assertScope(captured); setEvents(history);
    return next;
  }
  async function review(action: Parameters<CircuitChangesModel["review"]>[0], note = "") {
    await finishDraft(); assertScope(scope, true);
    if (!current.current) throw new Error("請先選取修改項目。");
    const captured = scope, target = current.current, version = localVersion.current;
    setSaving(true);
    try {
      const next = await actOnCircuitChangeItem(target.id, target.revision, action, note);
      assertScope(captured, true);
      if (version === localVersion.current) install(next);
      else { current.current = next; remote.current = next; setSelectedItem(next); }
      setItems(rows => rows.map(row => row.id === next.id ? summary(next) : row));
      const history = await listCircuitChangeEvents(next.id); assertScope(captured); setEvents(history);
    } catch (failure) {
      if (scopeRef.current === captured) { setSaveError(message(failure)); if (failure instanceof CircuitChangeConflictError) setConflict(true); }
      throw failure;
    } finally { if (scopeRef.current === captured) setSaving(false); }
  }
  async function performUpload(files: File[], side: CircuitImageSide, releaseReservation: () => void) {
    assertScope(scope, true);
    if (!current.current) await newItem(true);
    const target = current.current!;
    const captured = scope;
    uploadSide.current = side; setUploadProgress({ completed: 0, total: files.length });
    try {
      const result = await uploadCircuitImages({ setId: target.setId, itemId: target.id, actorId: userId, files, side,
        assertScope: () => { assertScope(captured, true); if (selection.current.itemId !== target.id) throw new Error("已切換修改項目，停止追加舊的圖片。"); },
        onProgress: (completed, total) => { if (scopeRef.current === captured) setUploadProgress({ completed, total }); },
      });
      assertScope(captured, true);
      releaseReservation();
      uploadFailuresRef.current = [...uploadFailuresRef.current, ...result.failures.map(failure => ({ ...failure, side }))];
      setUploadFailures(uploadFailuresRef.current); setUploadWarnings(previous => [...previous, ...(result.warnings || [])]);
      if (result.images.length && draftRef.current) { updateDraft({ images: [...draftRef.current.images, ...result.images] }); await saveDraft(); }
    } catch (failure) { if (scopeRef.current === captured) setSaveError(message(failure)); throw failure; }
  }
  async function addImages(files: File[], side: CircuitImageSide) {
    assertScope(scope, true);
    if (!files.length) return;
    if ((draftRef.current?.images.length || 0) + reservedUploads.current + files.length > 200) throw new Error("每個修改項目最多200張圖；請分成另一個修改項目，現有圖片已保留。");
    const captured = scope, setId = selection.current.setId, itemId = selection.current.itemId;
    pendingUploads.current += files.length; reservedUploads.current += files.length; setUploading(true);
    let released = false;
    const releaseReservation = () => { if (!released && scopeRef.current === captured) { reservedUploads.current -= files.length; released = true; } };
    const queued = uploadQueue.current.catch(() => {}).then(async () => {
      assertScope(captured, true);
      if (selection.current.setId !== setId || (itemId && selection.current.itemId !== itemId)) throw new Error("已切換修改項目，已停止舊的圖片批次。");
      await performUpload(files, side, releaseReservation);
    });
    uploadQueue.current = queued;
    try { await queued; }
    finally { if (scopeRef.current === captured) { releaseReservation(); pendingUploads.current -= files.length; if (pendingUploads.current === 0) setUploading(false); } }
  }
  async function retryUploads() {
    const failed = uploadFailuresRef.current;
    assertScope(scope, true);
    if ((draftRef.current?.images.length || 0) + reservedUploads.current + failed.length > 200) throw new Error("圖片總數超過200張，失敗項目仍保留；請先調整目前圖片。");
    uploadFailuresRef.current = []; setUploadFailures([]);
    const queued = (["before", "after", "reference"] as const).map(side => {
      const files = failed.filter(failure => (failure.side || uploadSide.current) === side).map(failure => failure.file);
      return files.length ? addImages(files, side) : Promise.resolve();
    });
    await Promise.all(queued);
  }
  async function saveMyRevision() {
    assertScope(scope, true);
    if (!current.current) return;
    const captured = scope;
    setSaving(true);
    try {
      const next = await getCircuitChangeItem(current.current.id);
      assertScope(captured, true);
      const value = draftRef.current, version = localVersion.current;
      if (!value) return;
      // This explicit choice keeps the user's content while adopting the latest CAS token.
      const saved = await saveCircuitChangeItem(next.setId, next.id, next.revision, value);
      assertScope(captured, true);
      current.current = saved; remote.current = saved; setSelectedItem(saved); setConflict(false); setSaveError("");
      if (version === localVersion.current) { draftRef.current = saved.content; setDraft(saved.content); clearCache(saved.id); }
      setItems(rows => rows.map(row => row.id === saved.id ? summary(saved) : row));
      const history = await listCircuitChangeEvents(saved.id); assertScope(captured); setEvents(history);
    } catch (failure) {
      if (scopeRef.current === captured) { setSaveError(message(failure)); if (failure instanceof CircuitChangeConflictError) setConflict(true); }
      throw failure;
    } finally { if (scopeRef.current === captured) setSaving(false); }
  }
  function adoptRemote() {
    if (!remote.current) return;
    clearCache(remote.current.id); install(remote.current);
  }
  const actions = useRef({ refresh, saveDraft, cacheDraft }); actions.current = { refresh, saveDraft, cacheDraft };
  useEffect(() => {
    actions.current.cacheDraft();
    selection.current = { setId: "", itemId: "" }; current.current = null; draftRef.current = null;
    draftCacheKey.current = "";
    remote.current = null; fingerprint.current = ""; syncing.current = ""; saveInFlight.current = null;
    setSets([]); setItems([]); setSelectedSetId(""); setSelectedItemId(""); setSelectedItem(null); setDraft(null); setEvents([]);
    setError(""); setSaveError(""); setConflict(false); setSaving(false); setUploading(false); setUploadFailures([]); uploadFailuresRef.current = [];
    uploadQueue.current = Promise.resolve(); pendingUploads.current = 0; reservedUploads.current = 0;
    if (!open || !userId) return;
    setLoading(true); void actions.current.refresh(true);
  }, [open, userId, context.seriesId]);
  useEffect(() => {
    if (!open || !userId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const changed = () => { clearTimeout(timer); timer = setTimeout(() => void actions.current.refresh(), 200); };
    const unsubscribe = subscribeCircuitChanges(context.seriesId, selectedSetId, changed);
    const poll = setInterval(() => { if (!document.hidden) void actions.current.refresh(); }, 5000);
    const visible = () => { if (!document.hidden) changed(); };
    window.addEventListener("focus", changed); window.addEventListener("online", changed); document.addEventListener("visibilitychange", visible);
    return () => { clearTimeout(timer); clearInterval(poll); unsubscribe(); window.removeEventListener("focus", changed); window.removeEventListener("online", changed); document.removeEventListener("visibilitychange", visible); };
  }, [open, userId, context.seriesId, selectedSetId]);
  useEffect(() => {
    if (!open || !canEdit || !dirty) return;
    const cache = setTimeout(() => actions.current.cacheDraft(), 150);
    const save = !saving && !uploading && !conflict && !saveError ? setTimeout(() => { void actions.current.saveDraft().catch(() => {}); }, 800) : undefined;
    return () => { clearTimeout(cache); clearTimeout(save); };
  }, [open, canEdit, dirty, editVersion, saving, uploading, conflict, saveError]);
  useEffect(() => {
    const beforeLeave = (event: BeforeUnloadEvent) => { if (isDirty() || pendingUploads.current > 0) { actions.current.cacheDraft(); event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", beforeLeave);
    return () => { actions.current.cacheDraft(); scopeRef.current += ":unmounted"; window.removeEventListener("beforeunload", beforeLeave); };
  }, []);
  return { sets, selectedSetId, items, selectedItemId, selectedItem, draft, events, loading, saving, uploading, dirty, conflict,
    error, saveError, uploadProgress, uploadFailures, uploadWarnings, selectSet, selectItem, createSet, createItem: async () => { await newItem(); }, updateDraft, saveDraft, review, addImages,
    retryUploads, reload: () => refresh(true), adoptRemote, saveMyRevision,
    loadEvent: getCircuitChangeEvent };
}
