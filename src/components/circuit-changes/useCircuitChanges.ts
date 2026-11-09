import { useEffect, useRef, useState } from "react";
import { uploadCircuitImages } from "./files";
import { actOnCircuitChangeItem, CircuitChangeConflictError, createCircuitChangeSet, getCircuitChangeEvent, getCircuitChangeItem, listCircuitChangeEvents, listCircuitChangeItems, listCircuitChangeSets, saveCircuitChangeItem, subscribeCircuitChanges } from "./storage";
import { defaultCircuitChangeSet, emptyCircuitChangeContent, isUnsavedCircuitChange, type CircuitChangeContent, type CircuitChangeContext, type CircuitChangeEvent, type CircuitChangeItem, type CircuitChangeSet, type CircuitChangesModel, type CircuitImageSide, type CircuitUploadFailure } from "./types";

const message = (error: unknown) => error instanceof Error ? error.message : "線路修改操作失敗，請重試。";
const summary = (item: CircuitChangeItem): CircuitChangeItem => ({ ...item, imageCount: item.content.images.length, content: { ...item.content, images: [] } });
// Key order differs between what this page builds and what the database returns, so content is compared with its keys sorted.
const stable = (value: unknown): string => JSON.stringify(value, (_key, entry) => entry && typeof entry === "object" && !Array.isArray(entry)
  ? Object.fromEntries(Object.entries(entry as Record<string, unknown>).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)) : entry);

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
  const [switching, setSwitching] = useState(false);
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
  // Bumped whenever the user picks or creates a batch and whenever a write of our own lands, so a list that was read
  // before that moment cannot put the old batch back or drop the change that was just saved.
  const selectionEpoch = useRef(0);
  const current = useRef<CircuitChangeItem | null>(null);
  const draftRef = useRef<CircuitChangeContent | null>(null);
  const itemsRef = useRef<CircuitChangeItem[]>([]);
  const draftCacheKey = useRef("");
  const remote = useRef<CircuitChangeItem | null>(null);
  const localVersion = useRef(0);
  const saveInFlight = useRef<Promise<void> | null>(null);
  const refreshRun = useRef<{ scope: string; promise: Promise<void> } | null>(null);
  const creatingSet = useRef<Promise<string> | null>(null);
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
  const putItems = (next: CircuitChangeItem[]) => { itemsRef.current = next; setItems(next); };
  const upsertItem = (next: CircuitChangeItem) => putItems(itemsRef.current.some(row => row.id === next.id)
    ? itemsRef.current.map(row => row.id === next.id ? summary(next) : row) : [...itemsRef.current, summary(next)]);
  const clearUploadNotes = () => { uploadFailuresRef.current = []; setUploadFailures([]); setUploadWarnings([]); };
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
    // A change that was never saved has no row to restore a cached draft onto.
    draftCacheKey.current = isUnsavedCircuitChange(next) ? "" : cacheKey(next.id);
    selection.current.itemId = next.id;
    setSelectedItemId(next.id); setSelectedItem(next); setDraft(nextDraft); setConflict(restoredConflict); setSaveError("");
    localVersion.current += 1; setEditVersion(localVersion.current);
  }
  function clearSelection() {
    current.current = null; remote.current = null; draftRef.current = null; draftCacheKey.current = ""; selection.current.itemId = "";
    setSelectedItemId(""); setSelectedItem(null); setDraft(null); setEvents([]); setConflict(false);
  }
  // A new change lives only on screen until the user types or adds an image; the first save creates its row and its number.
  function blankItem(): CircuitChangeItem {
    const now = new Date().toISOString();
    return { id: crypto.randomUUID(), setId: selection.current.setId, number: Math.max(0, ...itemsRef.current.map(row => row.number)) + 1,
      content: emptyCircuitChangeContent(userName), status: "draft", revision: 0, createdAt: now, updatedAt: now, createdBy: userId, updatedBy: userId };
  }
  // With nothing recorded yet an editor lands on a form that is ready to fill in; a viewer sees an honest empty state instead.
  function offerBlank() {
    if (isUnsavedCircuitChange(current.current)) return;
    if (editAccess.current) { install(blankItem()); setEvents([]); } else clearSelection();
  }
  async function loadSelected(id: string, captured: string, restore = false) {
    const next = await getCircuitChangeItem(id);
    assertScope(captured);
    // A save that is still on its way would make this read look like somebody else's edit.
    if (saveInFlight.current) { await saveInFlight.current.catch(() => {}); assertScope(captured); }
    if (selection.current.itemId && selection.current.itemId !== id) return;
    if (current.current?.id === id && next.revision < current.current.revision) return;
    if (isDirty() && current.current?.id === id && next.revision !== current.current.revision) {
      remote.current = next; setConflict(true);
    } else if (!isDirty() || current.current?.id !== id) install(next, restore);
    const history = await listCircuitChangeEvents(id);
    assertScope(captured);
    if (selection.current.itemId === id) setEvents(history);
  }
  async function runRefresh(force: boolean, captured: string) {
    const epoch = selectionEpoch.current;
    try {
      const nextSets = await listCircuitChangeSets(context.seriesId);
      assertScope(captured);
      // A batch was picked or created while this pass was reading; the pass queued behind it has the current answer.
      if (selectionEpoch.current !== epoch) return;
      setSets(nextSets); setError("");
      const setId = nextSets.some(row => row.id === selection.current.setId) ? selection.current.setId : nextSets[0]?.id || "";
      selection.current.setId = setId; setSelectedSetId(setId);
      if (!setId) { putItems([]); fingerprint.current = ""; if (!isDirty()) offerBlank(); return; }
      const nextFingerprint = `${setId}:${nextSets.find(row => row.id === setId)?.updatedAt}`;
      if (!force && fingerprint.current === nextFingerprint) return;
      const nextItems = await listCircuitChangeItems(setId);
      assertScope(captured);
      if (selectionEpoch.current !== epoch || selection.current.setId !== setId) return;
      // Changes are never deleted, so a list without the saved change on screen is older than that change: wait for a newer one.
      const shown = current.current;
      if (shown && !isUnsavedCircuitChange(shown) && shown.setId === setId && !nextItems.some(row => row.id === shown.id)) return;
      fingerprint.current = nextFingerprint; putItems(nextItems);
      // The unsaved change stays on screen; it is not in the list yet, so nothing here may select another row over it.
      if (isUnsavedCircuitChange(current.current)) return;
      const id = nextItems.some(row => row.id === selection.current.itemId) ? selection.current.itemId : nextItems[0]?.id || "";
      if (!id) { if (!isDirty()) offerBlank(); return; }
      const meta = nextItems.find(row => row.id === id)!;
      if (force || current.current?.id !== id || current.current.revision !== meta.revision) {
        selection.current.itemId = id; await loadSelected(id, captured, current.current?.id !== id);
      }
    } catch (failure) { if (scopeRef.current === captured) setError(message(failure)); }
    finally { if (scopeRef.current === captured) setLoading(false); }
  }
  // One pass at a time. A background poll is simply skipped while another pass runs, but a pass the user asked for
  // (pick a batch, create one, reload) waits for the running one and then reads again, so its result is never dropped.
  async function refresh(force = false): Promise<void> {
    if (!open || !userId) return;
    const captured = scope;
    for (let running = refreshRun.current; running && running.scope === captured; running = refreshRun.current) {
      if (!force) return;
      await running.promise;
      if (scopeRef.current !== captured) return;
      if (refreshRun.current === running) refreshRun.current = null;
    }
    const promise = runRefresh(force, captured);
    const run = { scope: captured, promise };
    refreshRun.current = run;
    try { await promise; } finally { if (refreshRun.current === run) refreshRun.current = null; }
  }
  function updateDraft(patch: Partial<CircuitChangeContent>) {
    // While another change is loading the form still shows the previous one; typing must not land on it.
    if (!canEdit || !draftRef.current || !current.current || selection.current.itemId !== current.current.id) return;
    draftRef.current = { ...draftRef.current, ...patch };
    localVersion.current += 1; setEditVersion(localVersion.current); setDraft(draftRef.current); setSaveError("");
  }
  // The first save of a board without any batch creates one named after the version on screen.
  function ensureSet(captured: string): Promise<string> {
    if (selection.current.setId) return Promise.resolve(selection.current.setId);
    if (!creatingSet.current) {
      const naming = defaultCircuitChangeSet(context.versionLabel);
      const promise = createCircuitChangeSet(context, naming.title, naming.fromLabel, naming.toLabel).then(next => {
        assertScope(captured, true);
        if (!selection.current.setId) {
          selectionEpoch.current += 1; selection.current.setId = next.id; fingerprint.current = "";
          setSelectedSetId(next.id); setSets(rows => [next, ...rows.filter(row => row.id !== next.id)]);
        }
        return selection.current.setId;
      });
      creatingSet.current = promise;
      promise.catch(() => {}).then(() => { if (creatingSet.current === promise) creatingSet.current = null; });
    }
    return creatingSet.current;
  }
  // `create` writes an unsaved change even when it is still empty: its row has to exist before images can be stored under it.
  async function saveDraft(create = false) {
    const captured = scope;
    assertScope(captured, true);
    if (saveInFlight.current) await saveInFlight.current;
    assertScope(captured, true);
    const unsaved = isUnsavedCircuitChange(current.current);
    if (!isDirty() && !(create && unsaved)) return;
    if (conflict) throw new CircuitChangeConflictError();
    const target = current.current, value = draftRef.current, version = localVersion.current;
    if (!target || !value) return;
    const promise = (async () => {
      setSaving(true); setSaveError(""); cacheDraft();
      const adopt = (next: CircuitChangeItem) => {
        selectionEpoch.current += 1;
        current.current = next; setSelectedItem(next); upsertItem(next);
        if (unsaved) { remote.current = next; draftCacheKey.current = cacheKey(next.id); }
        if (version === localVersion.current) { draftRef.current = next.content; setDraft(next.content); clearCache(next.id); }
      };
      try {
        const setId = unsaved ? await ensureSet(captured) : target.setId;
        assertScope(captured, true);
        const next = await saveCircuitChangeItem(setId, target.id, target.revision, value);
        assertScope(captured, true);
        adopt(next);
        const history = await listCircuitChangeEvents(next.id);
        assertScope(captured);
        if (selection.current.itemId === next.id) setEvents(history);
      } catch (failure) {
        if (scopeRef.current === captured) {
          if (failure instanceof CircuitChangeConflictError) {
            const latest = await getCircuitChangeItem(target.id).catch(() => null);
            if (scopeRef.current === captured && selection.current.itemId === target.id) {
              // The earlier request did reach the server and only its answer was lost: nothing differs, so nothing is in conflict.
              if (latest && stable(latest.content) === stable(value)) { adopt(latest); remote.current = latest; return; }
              remote.current = latest; setConflict(true);
            }
          }
          setSaveError(message(failure)); cacheDraft();
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
    const captured = scope;
    selection.current.itemId = id; setSelectedItemId(id); setSwitching(true); clearUploadNotes();
    try { await loadSelected(id, captured, true); }
    catch (failure) {
      // The change could not be read: stay on the one that is still on screen instead of pointing at a row that never opened.
      if (scopeRef.current === captured && selection.current.itemId === id) { selection.current.itemId = current.current?.id || ""; setSelectedItemId(selection.current.itemId); }
      throw failure;
    } finally { if (scopeRef.current === captured) setSwitching(false); }
  }
  async function selectSet(id: string) {
    if (id === selection.current.setId) return;
    await finishDraft();
    selectionEpoch.current += 1;
    selection.current = { setId: id, itemId: "" }; clearSelection(); putItems([]); clearUploadNotes();
    setSelectedSetId(id); fingerprint.current = ""; setLoading(true);
    await refresh(true);
  }
  async function createSet(title: string, fromLabel: string, toLabel: string) {
    assertScope(scope, true);
    // A first save that is already on its way has picked its batch; let it land before deciding what moves.
    if (saveInFlight.current) await saveInFlight.current.catch(() => {});
    // A change that was never saved belongs to no batch yet, so it moves into the one being created instead of forcing a default batch first.
    const carried = isUnsavedCircuitChange(current.current) ? current.current : null;
    if (!carried) await finishDraft();
    const captured = scope, next = await createCircuitChangeSet(context, title, fromLabel, toLabel);
    assertScope(captured, true);
    selectionEpoch.current += 1;
    selection.current = { setId: next.id, itemId: carried && current.current?.id === carried.id ? carried.id : "" };
    if (!selection.current.itemId) clearSelection();
    putItems([]); fingerprint.current = "";
    setSelectedSetId(next.id); setSets(rows => [next, ...rows.filter(row => row.id !== next.id)]);
    await refresh(true);
  }
  async function startItem() {
    await finishDraft(); assertScope(scope, true);
    if (isUnsavedCircuitChange(current.current)) return;
    install(blankItem()); setEvents([]); clearUploadNotes();
  }
  async function review(action: Parameters<CircuitChangesModel["review"]>[0], note = "") {
    await finishDraft(); assertScope(scope, true);
    if (!current.current) throw new Error("請先選取修改項目。");
    if (isUnsavedCircuitChange(current.current)) throw new Error("請先填寫修改內容。");
    const captured = scope, target = current.current, version = localVersion.current;
    setSaving(true);
    try {
      const next = await actOnCircuitChangeItem(target.id, target.revision, action, note);
      assertScope(captured, true);
      selectionEpoch.current += 1;
      if (version === localVersion.current) install(next);
      else { current.current = next; remote.current = next; setSelectedItem(next); }
      upsertItem(next);
      const history = await listCircuitChangeEvents(next.id); assertScope(captured); setEvents(history);
    } catch (failure) {
      if (scopeRef.current === captured) { setSaveError(message(failure)); if (failure instanceof CircuitChangeConflictError) setConflict(true); }
      throw failure;
    } finally { if (scopeRef.current === captured) setSaving(false); }
  }
  async function performUpload(files: File[], side: CircuitImageSide, releaseReservation: () => void) {
    const captured = scope;
    assertScope(captured, true);
    if (!current.current) { install(blankItem()); setEvents([]); }
    if (isUnsavedCircuitChange(current.current)) {
      try { await saveDraft(true); }
      catch (failure) {
        // Nothing was uploaded yet; keep the files so "retry" can pick them up once the change itself can be saved.
        if (scopeRef.current === captured) {
          releaseReservation();
          uploadFailuresRef.current = [...uploadFailuresRef.current, ...files.map(file => ({ file, error: message(failure), side }))];
          setUploadFailures(uploadFailuresRef.current);
        }
        throw failure;
      }
    }
    const target = current.current!;
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
      // A board without a batch gets one from the first batch of images, so only an existing batch can have "changed".
      if ((setId && selection.current.setId !== setId) || (itemId && selection.current.itemId !== itemId)) throw new Error("已切換修改項目，已停止舊的圖片批次。");
      await performUpload(files, side, releaseReservation);
    });
    uploadQueue.current = queued;
    try { await queued; }
    finally { if (scopeRef.current === captured) { releaseReservation(); pendingUploads.current -= files.length; if (pendingUploads.current === 0) setUploading(false); } }
  }
  async function retryUploads() {
    // A file that was refused for what it is (not an image, too large) would only fail again.
    const failed = uploadFailuresRef.current.filter(failure => !failure.permanent);
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
      selectionEpoch.current += 1;
      current.current = saved; remote.current = saved; setSelectedItem(saved); setConflict(false); setSaveError("");
      if (version === localVersion.current) { draftRef.current = saved.content; setDraft(saved.content); clearCache(saved.id); }
      upsertItem(saved);
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
    selection.current = { setId: "", itemId: "" }; current.current = null; draftRef.current = null; itemsRef.current = [];
    draftCacheKey.current = "";
    remote.current = null; fingerprint.current = ""; refreshRun.current = null; saveInFlight.current = null; creatingSet.current = null;
    setSets([]); setItems([]); setSelectedSetId(""); setSelectedItemId(""); setSelectedItem(null); setDraft(null); setEvents([]);
    setError(""); setSaveError(""); setConflict(false); setSaving(false); setUploading(false); setSwitching(false);
    setUploadFailures([]); uploadFailuresRef.current = []; setUploadWarnings([]);
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
  return { sets, selectedSetId, items, selectedItemId, selectedItem, draft, events, loading, saving, uploading, switching, dirty, conflict,
    error, saveError, uploadProgress, uploadFailures, uploadWarnings, selectSet, selectItem, createSet, createItem: startItem, updateDraft,
    saveDraft: () => saveDraft(), review, addImages, retryUploads, dismissUploadFailures: clearUploadNotes,
    reload: () => refresh(true), adoptRemote, saveMyRevision, loadEvent: getCircuitChangeEvent };
}
