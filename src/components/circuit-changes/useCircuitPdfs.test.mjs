import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
const require = createRequire(import.meta.url);
const { React, create, act, loader, browser } = require("../../../tests/support/renderHarness.cjs");
const { mergeCircuitPdfRegistry, normalizeCircuitPdfRegistry } = loader()("src/components/circuit-changes/circuitPdf.ts");

const pdfFile = (name, pages, size) => {
  const file = new File([`%PDF-1.4 pages=${pages}`], name, { type: "application/pdf", lastModified: Date.parse("2026-11-01T01:00:00Z") });
  return size ? Object.defineProperty(file, "size", { value: size }) : file;
};
const doc = (id, date, extra = {}) => ({ id, name: `${id}.pdf`, date, label: "", path: `circuit-pdf/qa/${id}.pdf`, localOnly: false, size: 20, pages: 12,
  uploadedAt: `${date}T01:00:00.000Z`, uploadedBy: "qa-A", uploadedByName: "QA", updatedAt: `${date}T01:00:00.000Z`, ...extra });
const json = value => JSON.parse(JSON.stringify(value));
const wait = ms => act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); });

/** The hook with an in-memory store standing in for the shared row and the PDF bucket. */
async function mount({ stored = null, props: overrides = {}, store: shared, localPosition } = {}) {
  const window = browser();
  if (localPosition) window.localStorage.setItem(`circuit-pdf-position:v1:${overrides.userId || "qa-A"}:board`, JSON.stringify(localPosition));
  const store = shared || { row: stored, saves: [], uploads: [], removed: [], failNext: null, files: new Map() };
  const storage = {
    loadCircuitPdfRegistry: async () => normalizeCircuitPdfRegistry(json(store.row)),
    saveCircuitPdfRegistry: async (_series, change) => {
      if (store.failNext) { const error = store.failNext; store.failNext = null; throw error; }
      const next = change(normalizeCircuitPdfRegistry(json(store.row)));
      store.row = json(next); store.saves.push(json(next)); return next;
    },
    uploadCircuitPdf: async (_series, id, file) => { const path = `circuit-pdf/qa/${id}.pdf`; store.uploads.push(path); store.files.set(path, file); return path; },
    downloadCircuitPdf: async path => { const file = store.files.get(path); if (!file) throw new Error("missing"); return file.arrayBuffer(); },
    removeCircuitPdfFile: async path => { store.removed.push(path); },
  };
  const render = {
    isPdfFile: async file => /\.pdf$/.test(file.name),
    openCircuitPdf: async bytes => { const pages = Number(/pages=(\d+)/.exec(new TextDecoder().decode(bytes))?.[1] || 1); return { numPages: pages, destroy: async () => {} }; },
  };
  const officialStorage = {
    loadCircuitPdfOfficial: async () => store.official || null,
    saveCircuitPdfOfficial: async (_series, documentId) => {
      if (store.failOfficial) throw store.failOfficial;
      const document = store.row.documents.find(row => row.id === documentId);
      store.official = { documentId, document: json(document), revision: (store.official?.revision || 0) + 1, at: new Date().toISOString(), by: "qa-A", byName: "QA" }; return store.official;
    },
  };
  const load = loader({ window, mocks: { "./pdfStorage": storage, "./pdfRender": render, "./officialPdfStorage": officialStorage }, globals: { File, Blob, TextDecoder, Error, localStorage: window.localStorage } });
  const { useCircuitPdfs } = load("src/components/circuit-changes/useCircuitPdfs.ts");
  let latest, root, props = { open: true, seriesId: "board", canEdit: true, userId: "qa-A", userName: "QA", ...overrides };
  function Probe(value) { latest = useCircuitPdfs(value); return null; }
  await act(async () => { root = create(React.createElement(Probe, props)); });
  await wait(5);
  return { get model() { return latest; }, store, window,
    update: async patch => { props = { ...props, ...patch }; await act(async () => root.update(React.createElement(Probe, props))); await wait(5); },
    unmount: () => act(() => root.unmount()) };
}

test("uploading a PDF records a dated version at once and opens it on the page this person reached on the board", async () => {
  const view = await mount({ stored: { version: 1, documents: [doc("old", "2026-11-08")], pages: {}, positions: { "qa-A": { documentId: "old", page: 9, at: "2026-11-08T09:00:00.000Z" } } } });
  try {
    assert.equal(view.model.active.id, "old", "it opens the version this person was reading");
    await act(async () => { await view.model.upload(pdfFile("Vera_SCH_20261109.pdf", 12)); });
    assert.equal(view.store.saves.length, 1, "the new version is saved straight away, not after a delay");
    const added = view.store.row.documents.find(row => row.id !== "old");
    assert.equal(added.date, "2026-11-09"); assert.equal(added.pages, 12); assert.equal(added.uploadedByName, "QA");
    assert.equal(view.store.uploads.length, 1);
    assert.equal(view.model.active.id, added.id);
    assert.equal(view.model.page, 9, "today's PDF continues at yesterday's page");
  } finally { await view.unmount(); }
});

test("page marks wait a moment and are then saved together, merged with what a colleague saved meanwhile", async () => {
  const view = await mount({ stored: { version: 1, documents: [doc("d1", "2026-11-09")], pages: {}, positions: {} } });
  try {
    act(() => { view.model.setChecked(3, true); view.model.setChecked(4, true); });
    assert.equal(view.store.saves.length, 0, "nothing is written on every click");
    view.store.row.pages = { 10: { checked: true, at: "2026-11-09T05:00:00.000Z", by: "qa-B", byName: "B", documentId: "d1" } };
    await wait(1100);
    assert.equal(view.store.saves.length, 1);
    assert.deepEqual(Object.keys(view.store.row.pages).sort((a, b) => a - b), ["3", "4", "10"]);
    assert.equal(view.store.row.pages[3].by, "qa-A"); assert.equal(view.store.row.pages[3].documentId, "d1");
    assert.equal(view.model.registry.pages[10].by, "qa-B", "the colleague's mark appears here after the save");
  } finally { await view.unmount(); }
});

test("a failed save keeps the marks on screen and sends them with the next save", async () => {
  const view = await mount({ stored: { version: 1, documents: [doc("d1", "2026-11-09")], pages: {}, positions: {} } });
  try {
    view.store.failNext = new Error("offline");
    act(() => view.model.setChecked(2, true));
    await wait(1100);
    assert.match(view.model.error, /尚未儲存：offline/);
    assert.equal(view.model.registry.pages[2].checked, true, "the mark stays on screen");
    act(() => view.model.setChecked(5, true));
    // The reading-position save may push the next save back by its own short delay.
    await wait(2600);
    assert.deepEqual(Object.keys(view.store.row.pages).sort(), ["2", "5"], "the earlier mark goes out with the next save");
    assert.equal(view.model.error, "");
  } finally { await view.unmount(); }
});

test("a view-only account reads the PDFs and progress but never writes", async () => {
  const view = await mount({ stored: { version: 1, documents: [doc("d1", "2026-11-09")], pages: { 1: { checked: true, at: "2026-11-09T01:00:00.000Z", by: "qa-B", byName: "B", documentId: "d1" } }, positions: {} }, props: { canEdit: false, userId: "viewer" } });
  try {
    assert.equal(view.model.documents.length, 1);
    act(() => { view.model.setChecked(2, true); view.model.goTo(4); view.model.updateDocument("d1", { label: "x" }); });
    await assert.rejects(async () => { await act(async () => { await view.model.upload(pdfFile("x.pdf", 2)); }); }, /檢視權限/);
    await wait(1700);
    assert.equal(view.store.saves.length, 0);
    assert.equal(view.model.registry.pages[2], undefined);
    assert.ok(JSON.parse(view.window.localStorage.getItem("circuit-pdf-position:v1:viewer:board")).page === 4, "the reading position is kept in this browser only");
  } finally { await view.unmount(); }
});

test("a PDF over 50 MB opens here without being uploaded, and another visit asks for the same file", async () => {
  const store = { row: null, saves: [], uploads: [], removed: [], failNext: null, files: new Map() };
  const big = pdfFile("Vera_SCH_20261110.pdf", 30, 51 * 1024 * 1024);
  const first = await mount({ store });
  try {
    await act(async () => { await first.model.upload(big); });
    const row = store.row.documents[0];
    assert.equal(row.localOnly, true); assert.equal(row.path, ""); assert.equal(store.uploads.length, 0);
    assert.match(first.model.error, /50 MB/);
    assert.equal(first.model.activePdf.numPages, 30, "it is open on this computer");
  } finally { await first.unmount(); }
  const other = await mount({ store });
  try {
    assert.equal(other.model.needsLocalFile, true, "another browser has no copy of the file");
    await assert.rejects(async () => { await act(async () => { await other.model.openLocal(pdfFile("other.pdf", 30, 1000)); }); }, /大小與/);
    await act(async () => { await other.model.openLocal(big); });
    assert.equal(other.model.activePdf.numPages, 30);
  } finally { await other.unmount(); }
});

test("archiving a version hides it but preserves its original, and it can be restored", async () => {
  const view = await mount({ stored: { version: 1, documents: [doc("new", "2026-11-09"), doc("old", "2026-11-08", { pages: 6 })], pages: {}, positions: {} } });
  try {
    assert.equal(view.model.active.id, "new", "with nothing read yet the newest drawing date opens");
    act(() => view.model.goTo(8));
    act(() => view.model.select("old"));
    assert.equal(view.model.active.id, "old"); assert.equal(view.model.page, 6, "a shorter version opens at its last page");
    act(() => { assert.equal(view.model.show("new", 3), true); });
    assert.equal(view.model.active.id, "new"); assert.equal(view.model.page, 3);
    act(() => { assert.equal(view.model.show("missing", 2), false); });
    await act(async () => { await view.model.removeDocument("new"); });
    assert.deepEqual(view.store.removed, [], "archiving never deletes the PDF original");
    assert.ok(view.store.row.documents.find(row => row.id === "new").removedAt);
    await wait(10);
    assert.equal(JSON.stringify(view.model.documents.map(row => row.id)), JSON.stringify(["old"]));
    assert.equal(view.model.active.id, "old");
    const stale = mergeCircuitPdfRegistry(normalizeCircuitPdfRegistry(view.store.row), normalizeCircuitPdfRegistry({ version: 1, documents: [doc("new", "2026-11-09")], pages: {}, positions: {} }));
    assert.ok(stale.documents.find(row => row.id === "new").removedAt, "an old copy of the list cannot bring it back");
    await act(async () => { await view.model.restoreDocument("new"); });
    assert.ok(!view.store.row.documents.find(row => row.id === "new").removedAt);
    assert.equal(view.model.documents.length, 2);
  } finally { await view.unmount(); }
});

test("an explicit official PDF stays pinned across uploads, groups and reopening", async () => {
  const view = await mount({ stored: { version: 1, documents: [doc("official", "2026-11-08"), doc("working", "2026-11-09")], pages: {}, positions: {} } });
  try {
    assert.equal(view.model.official, null, "an existing PDF is never guessed to be the official version");
    await act(async () => { await view.model.setOfficial("official"); });
    assert.equal(view.store.official.documentId, "official");
    assert.equal(view.model.compare.id, "official");
    act(() => { view.model.goTo(7); view.model.setCompareOffset(-2); });
    assert.equal(view.model.officialPage, 5);
    await act(async () => { await view.model.upload(pdfFile("working_20261110.pdf", 14)); });
    assert.equal(view.model.official.id, "official");
    assert.equal(view.model.compare.id, "official", "the newly uploaded working version compares against the same baseline");
    act(() => { view.model.goTo(14); });
    assert.equal(view.model.officialPage, 0, "an added working page must not silently compare against the official last page");
    assert.equal(view.model.comparePage, 0, "the reference canvas must require an explicit mapping too");
    act(() => { view.model.setCompareOffset(-2); });
    assert.equal(view.model.officialPage, 12, "the user can explicitly match a differently numbered page");
    assert.equal(view.store.row.documents.length, 3);
    assert.equal(view.store.row.official, undefined, "the unprotected preference row does not choose the official version");
    await assert.rejects(async () => { await act(async () => { await view.model.removeDocument("official"); }); }, /官方版本不能刪除/);
    await view.update({ open: false }); await view.update({ open: true });
    assert.equal(view.model.official.id, "official");
    const baseline = json(view.model.official);
    Object.assign(view.store.row.documents.find(row => row.id === "official"), { path: "circuit-pdf/qa/substituted.pdf", pages: 1, removedAt: "2026-11-10T00:00:00.000Z", updatedAt: "2026-11-10T00:00:00.000Z" });
    await act(async () => { await view.model.reload(); });
    assert.equal(JSON.stringify(view.model.official), JSON.stringify(baseline), "legacy metadata cannot substitute or hide the protected official original");
    assert.equal(view.model.compare.path, baseline.path, "comparison opens the canonical original too");
    assert.equal(view.model.documents.find(row => row.id === "official").pages, 12);
    view.store.failOfficial = new Error("conflict");
    await assert.rejects(async () => { await act(async () => { await view.model.setOfficial("working"); }); }, /conflict/);
    assert.equal(view.model.official.id, "official", "a failed pin leaves the current official version unchanged");
  } finally { await view.unmount(); }
});

test("viewers cannot pin a baseline, and a local-only PDF cannot become a shared baseline", async () => {
  const viewer = await mount({ props: { canEdit: false } });
  try { await assert.rejects(async () => { await act(async () => { await viewer.model.setOfficial("any"); }); }, /檢視權限/); } finally { await viewer.unmount(); }
  const editor = await mount();
  try {
    await act(async () => { await editor.model.upload(pdfFile("large.pdf", 2, 51 * 1024 * 1024)); });
    await assert.rejects(async () => { await act(async () => { await editor.model.setOfficial(editor.model.active.id); }); }, /本機 PDF/);
    assert.equal(editor.model.official, null);
  } finally { await editor.unmount(); }
});
test("the reading position this browser kept wins when it is newer than the shared one", async () => {
  const window = browser();
  const shared = { version: 1, documents: [doc("d1", "2026-11-09")], pages: {}, positions: { "qa-A": { documentId: "d1", page: 3, at: "2026-11-09T01:00:00.000Z" } } };
  const first = await mount({ stored: shared });
  try { assert.equal(first.model.page, 3, "only the shared position is known"); } finally { await first.unmount(); }
  const newer = await mount({ stored: shared, localPosition: { documentId: "d1", page: 8, at: "2026-11-09T02:00:00.000Z" } });
  try { assert.equal(newer.model.page, 8, "a later page kept here, not yet saved, is where reading continues"); } finally { await newer.unmount(); }
  const older = await mount({ stored: shared, localPosition: { documentId: "d1", page: 1, at: "2026-11-08T02:00:00.000Z" } });
  try { assert.equal(older.model.page, 3, "an older local position does not win"); } finally { await older.unmount(); }
  void window;
});
