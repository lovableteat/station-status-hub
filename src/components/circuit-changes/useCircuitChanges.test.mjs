import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { React, create, act, loader, deferred, browser } = require("../../../tests/support/renderHarness.cjs");
const clone = value => structuredClone(value);
const makeItem = (series = "A", revision = 1, title = "Saved") => ({
  id: `item-${series}`, setId: `set-${series}`, number: 1,
  content: { title, reason: "", description: "Saved description", refs: "R1", net: "", page: "", owner: "QA", images: [] },
  status: "draft", revision, createdAt: "2026-11-09T00:00:00Z", updatedAt: `rev-${revision}`, createdBy: "qa-A", updatedBy: "qa-A",
});

async function mount(overrides = {}) {
  const window = browser();
  const records = new Map([["item-A", makeItem()], ["item-B", makeItem("B", 1, "B saved")]]);
  const saves = [], uploads = [], actions = [];
  let saveResult, uploadResult, actionResult, latest, root;
  class Conflict extends Error { constructor() { super("remote revision changed"); } }
  const storage = {
    CircuitChangeConflictError: Conflict,
    listCircuitChangeSets: async series => [{ id: `set-${series}`, seriesId: series, workspaceId: `bom-${series}`, title: "QA changes", fromLabel: "V1", toLabel: "V2", createdAt: "2026-11-09", updatedAt: String(records.get(`item-${series}`).revision), createdBy: "qa-A" }],
    listCircuitChangeItems: async setId => [...records.values()].filter(row => row.setId === setId).map(row => ({ ...clone(row), imageCount: row.content.images.length, content: { ...clone(row.content), images: [] } })),
    getCircuitChangeItem: async id => clone(records.get(id)),
    listCircuitChangeEvents: async () => [],
    getCircuitChangeEvent: async () => { throw new Error("No history fixture"); },
    subscribeCircuitChanges: () => () => {},
    createCircuitChangeSet: async () => { throw new Error("Not used"); },
    actOnCircuitChangeItem: async (id, revision, action, note) => {
      actions.push({ id, revision, action, note });
      if (!actionResult) throw new Error("Not used");
      const result = await actionResult({ id, revision, action, note }); records.set(id, clone(result)); return clone(result);
    },
    saveCircuitChangeItem: async (setId, id, revision, content) => {
      const args = { setId, id, revision, content: clone(content) }; saves.push(args);
      const result = saveResult ? await saveResult(args) : { ...clone(records.get(id)), revision: revision + 1, content: clone(content) };
      records.set(id, clone(result)); return clone(result);
    },
  };
  const load = loader({ window, mocks: { "./storage": storage, "./files": { uploadCircuitImages: async args => { uploads.push(args); return uploadResult ? uploadResult(args) : { images: [], failures: [] }; } } }, globals: { Error, localStorage: window.localStorage } });
  const { useCircuitChanges } = load("src/components/circuit-changes/useCircuitChanges.ts");
  let props = { open: true, context: { seriesId: "A", workspaceId: "bom-A", workspaceName: "QA board", versionLabel: "V1" }, canEdit: true, userId: "qa-A", userName: "QA", ...overrides };
  function Probe(value) { latest = useCircuitChanges(value); return null; }
  const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  await act(async () => { root = create(React.createElement(Probe, props)); });
  await settle();
  assert.ok(latest.selectedItem, latest.error || "initial item was not loaded");
  return {
    get model() { return latest; }, window, records, saves, uploads, actions, Conflict,
    setSave: fn => { saveResult = fn; }, setUpload: fn => { uploadResult = fn; }, setAction: fn => { actionResult = fn; },
    update: async patch => { props = { ...props, ...patch }; await act(async () => root.update(React.createElement(Probe, props))); await settle(); },
    unmount: () => act(() => root.unmount()),
  };
}

test("remote updates preserve a dirty circuit draft until adopt-latest is chosen", async () => {
  const view = await mount();
  try {
    act(() => view.model.updateDraft({ title: "My unsaved circuit" }));
    view.records.set("item-A", makeItem("A", 2, "Another engineer's version"));
    await act(async () => view.model.reload());
    assert.equal(view.model.draft.title, "My unsaved circuit");
    assert.equal(view.model.conflict, true);
    assert.equal(view.model.selectedItem.revision, 1);
    act(() => view.model.adoptRemote());
    assert.equal(view.model.draft.title, "Another engineer's version");
    assert.equal(view.model.selectedItem.revision, 2);
    assert.equal(view.model.dirty, false);
    assert.equal(view.saves.length, 0);
  } finally { view.unmount(); }
});

test("switching account and BOM preserves the draft only under its original owner", async () => {
  const view = await mount();
  try {
    act(() => view.model.updateDraft({ title: "Original account draft" }));
    await view.update({ userId: "qa-B", context: { seriesId: "B", workspaceId: "bom-B", workspaceName: "B board", versionLabel: "V1" } });
    const cached = JSON.parse(view.window.localStorage.getItem("circuit-change-draft:v1:qa-A:A:item-A"));
    assert.equal(cached.content.title, "Original account draft");
    assert.equal(view.window.localStorage.getItem("circuit-change-draft:v1:qa-B:B:item-A"), null);
    assert.equal(view.model.draft.title, "B saved");
  } finally { view.unmount(); }
});

test("a stale 409 retains local fields and forwards the expected revision", async () => {
  const view = await mount();
  try {
    view.setSave(async () => { throw new view.Conflict(); });
    act(() => view.model.updateDraft({ reason: "Keep this reason" }));
    await act(async () => assert.rejects(view.model.saveDraft(), view.Conflict));
    assert.equal(view.saves[0].revision, 1);
    assert.equal(view.saves[0].id, "item-A");
    assert.equal(view.model.draft.reason, "Keep this reason");
    assert.equal(view.model.dirty, true);
    assert.equal(view.model.conflict, true);
    assert.match(view.model.saveError, /remote revision changed/);
  } finally { view.unmount(); }
});

test("typing during a pending save remains editable and cannot be cleared by its response", async () => {
  const view = await mount(), pending = deferred();
  try {
    view.setSave(() => pending.promise);
    act(() => view.model.updateDraft({ title: "First revision" }));
    let save;
    act(() => { save = view.model.saveDraft(); });
    assert.equal(view.model.saving, true);
    act(() => view.model.updateDraft({ title: "Newer typing" }));
    await act(async () => { pending.resolve(makeItem("A", 2, "First revision")); await save; });
    assert.equal(view.model.selectedItem.revision, 2);
    assert.equal(view.model.draft.title, "Newer typing");
    assert.equal(view.model.dirty, true);
    assert.equal(view.model.saving, false);
    view.setSave(null);
    await act(async () => view.model.saveDraft());
    assert.equal(view.saves.at(-1).revision, 2);
    assert.equal(view.model.selectedItem.content.title, "Newer typing");
    assert.equal(view.model.dirty, false);
  } finally { view.unmount(); }
});

test("a save response from a closed and reopened dialog cannot install into the new lifetime", async () => {
  const view = await mount(), pending = deferred();
  try {
    view.setSave(() => pending.promise);
    act(() => view.model.updateDraft({ title: "Old window draft" }));
    let save;
    act(() => { save = view.model.saveDraft(); });
    const result = save.then(() => null, error => error);
    await view.update({ open: false });
    await view.update({ open: true });
    act(() => view.model.updateDraft({ title: "New window draft" }));
    await act(async () => { pending.resolve(makeItem("A", 2, "Old window draft")); await result; });
    assert.match((await result).message, /帳號、BOM|上下文/);
    assert.equal(view.model.draft.title, "New window draft");
    assert.equal(view.model.selectedItem.revision, 1);
  } finally { view.unmount(); }
});

test("late uploads cannot append images to a different BOM or account", async () => {
  const view = await mount(), pending = deferred();
  try {
    view.setUpload(() => pending.promise);
    let upload;
    await act(async () => { upload = view.model.addImages([{ name: "same.png", size: 10, type: "image/png" }], "after"); await Promise.resolve(); });
    assert.equal(view.uploads.length, 1);
    const result = upload.then(() => null, error => error);
    await view.update({ userId: "qa-B", context: { seriesId: "B", workspaceId: "bom-B", workspaceName: "B board", versionLabel: "V2" } });
    await act(async () => { pending.resolve({ images: [{ id: "old-image" }], failures: [] }); await result; });
    assert.match((await result).message, /帳號、BOM|上下文/);
    assert.equal(view.model.selectedItem.id, "item-B");
    assert.equal(view.model.draft.title, "B saved");
    assert.deepEqual(view.model.draft.images, []);
    assert.equal(view.saves.length, 0);
    assert.equal(view.model.uploading, false);
  } finally { view.unmount(); }
});

test("continuous image batches stay ordered and retry only failed files with their original sides", async () => {
  const view = await mount(), pending = deferred();
  const good = { name: "same.png" }, badBefore = { name: "bad-before.png" }, badAfter = { name: "bad-after.png" };
  try {
    view.setUpload(args => args.side === "before" ? pending.promise : { images: [], failures: [{ file: badAfter, error: "network" }] });
    let first, second;
    await act(async () => {
      first = view.model.addImages([good, badBefore], "before");
      second = view.model.addImages([badAfter], "after");
      await Promise.resolve();
    });
    assert.equal(view.uploads.length, 1, "the second paste waits for the current batch");
    await act(async () => {
      pending.resolve({ images: [{ id: "before-original", side: "before", name: "same.png" }], failures: [{ file: badBefore, error: "network" }] });
      await Promise.all([first, second]);
    });
    assert.deepEqual(view.uploads.map(value => value.side), ["before", "after"]);
    assert.equal(view.model.draft.images.length, 1);
    assert.equal(view.model.uploadFailures.length, 2);
    view.setUpload(args => ({ images: args.files.map(file => ({ id: file.name, name: file.name, side: args.side })), failures: [] }));
    await act(async () => view.model.retryUploads());
    assert.deepEqual(view.uploads.slice(2).map(value => ({ side: value.side, names: Array.from(value.files, file => file.name) })), [
      { side: "before", names: ["bad-before.png"] }, { side: "after", names: ["bad-after.png"] },
    ]);
    assert.deepEqual(Array.from(view.model.draft.images, value => value.id), ["before-original", "bad-before.png", "bad-after.png"]);
    assert.equal(view.model.uploadFailures.length, 0);
    assert.equal(view.model.uploading, false);
    assert.equal(view.model.dirty, false);
  } finally { view.unmount(); }
});

test("review completion cannot replace text typed while its request is pending", async () => {
  const view = await mount(), pending = deferred();
  try {
    view.setAction(() => pending.promise);
    let review;
    await act(async () => { review = view.model.review("submit"); await Promise.resolve(); });
    assert.equal(view.model.saving, true);
    act(() => view.model.updateDraft({ description: "New detail written during review" }));
    await act(async () => { pending.resolve({ ...makeItem("A", 2), status: "in_review" }); await review; });
    assert.equal(view.actions[0].revision, 1);
    assert.equal(view.model.selectedItem.status, "in_review");
    assert.equal(view.model.draft.description, "New detail written during review");
    assert.equal(view.model.dirty, true);
    assert.equal(view.model.saving, false);
  } finally { view.unmount(); }
});

// A second fixture whose batches and changes start empty and are created through the hook, the way a first-time user does it.
async function openBoard({ sets = [], records = [], canEdit = true } = {}) {
  const window = browser();
  const calls = { sets: 0, createSet: [], saves: [], uploads: [], reads: [] };
  const gates = { sets: null, items: null, item: null };
  class Conflict extends Error { constructor() { super("remote revision changed"); } }
  let saveResult, uploadResult, latest, root;
  const stamp = () => String(calls.saves.length + calls.createSet.length);
  const storage = {
    CircuitChangeConflictError: Conflict,
    listCircuitChangeSets: async () => { calls.sets++; const gate = gates.sets; gates.sets = null; return gate ? gate.promise : clone(sets); },
    createCircuitChangeSet: async (context, title, fromLabel, toLabel) => {
      const next = { id: `00000000-0000-4000-8000-00000000000${sets.length + 1}`, seriesId: context.seriesId, workspaceId: context.workspaceId, projectId: null, title, fromLabel, toLabel, createdAt: `2026-11-0${9 - sets.length}`, updatedAt: stamp(), createdBy: "qa-A" };
      calls.createSet.push({ title, fromLabel, toLabel }); sets.unshift(next); return clone(next);
    },
    listCircuitChangeItems: async setId => {
      const gate = gates.items; gates.items = null; if (gate) return gate.promise;
      return records.filter(row => row.setId === setId).map(row => ({ ...clone(row), imageCount: row.content.images.length, content: { ...clone(row.content), images: [] } }));
    },
    getCircuitChangeItem: async id => { calls.reads.push(id); const gate = gates.item; gates.item = null; if (gate) await gate.promise; return clone(records.find(row => row.id === id)); },
    listCircuitChangeEvents: async () => [], getCircuitChangeEvent: async () => { throw new Error("No history fixture"); },
    subscribeCircuitChanges: () => () => {},
    actOnCircuitChangeItem: async () => { throw new Error("Not used"); },
    saveCircuitChangeItem: async (setId, id, revision, content) => {
      const args = { setId, id, revision, content: clone(content) }; calls.saves.push(args);
      if (saveResult) return saveResult(args);
      const old = records.find(row => row.id === id);
      const next = { id, setId, number: old?.number || records.filter(row => row.setId === setId).length + 1, content: clone(content), status: "draft", revision: revision + 1, createdAt: "2026-11-09T00:00:00Z", updatedAt: `rev-${revision + 1}`, createdBy: "qa-A", updatedBy: "qa-A" };
      if (old) records[records.indexOf(old)] = next; else records.push(next);
      const set = sets.find(row => row.id === setId); if (set) set.updatedAt = stamp();
      return clone(next);
    },
  };
  const load = loader({ window, mocks: { "./storage": storage, "./files": { uploadCircuitImages: async args => { calls.uploads.push(args); return uploadResult ? uploadResult(args) : { images: [], failures: [] }; } } }, globals: { Error, localStorage: window.localStorage } });
  const { useCircuitChanges } = load("src/components/circuit-changes/useCircuitChanges.ts");
  const props = { open: true, context: { seriesId: "A", workspaceId: "bom-A", workspaceName: "QA board", versionLabel: "V1" }, canEdit, userId: "qa-A", userName: "QA" };
  function Probe(value) { latest = useCircuitChanges(value); return null; }
  const settle = (delay = 0) => act(async () => { await new Promise(resolve => setTimeout(resolve, delay)); });
  await act(async () => { root = create(React.createElement(Probe, props)); });
  await settle();
  return { get model() { return latest; }, window, sets, records, calls, gates, Conflict, settle, setSave: fn => { saveResult = fn; }, setUpload: fn => { uploadResult = fn; }, unmount: () => act(() => root.unmount()) };
}
const change = (id, setId, number, title) => ({ id, setId, number, content: { title, reason: "", description: "", refs: "", net: "", page: "", owner: "QA", images: [] }, status: "draft", revision: 1, createdAt: "2026-11-09T00:00:00Z", updatedAt: "rev-1", createdBy: "qa-A", updatedBy: "qa-A" });
const batch = (id, title) => ({ id, seriesId: "A", workspaceId: "bom-A", projectId: null, title, fromLabel: "V1", toLabel: "V2", createdAt: "2026-11-01", updatedAt: "0", createdBy: "qa-A" });
const OLD_SET = "00000000-0000-4000-8000-0000000000aa";

test("a board with nothing recorded opens on a ready form and writes nothing until the first input", async () => {
  const view = await openBoard();
  try {
    assert.equal(view.model.selectedItem.revision, 0, "the form is there without pressing anything");
    assert.equal(view.model.selectedItem.content.owner, "QA");
    assert.equal(view.model.dirty, false); assert.equal(view.model.sets.length, 0);
    await act(async () => view.model.createItem());
    await act(async () => view.model.createItem());
    assert.equal(view.calls.createSet.length + view.calls.saves.length, 0, "opening or pressing 新增修改 on an empty form leaves no record behind");
    const blank = view.model.selectedItem.id;
    act(() => view.model.updateDraft({ title: "R2301 改 4.7K" }));
    await act(async () => view.model.saveDraft());
    assert.equal(view.calls.createSet.length, 1);
    assert.equal(view.calls.createSet[0].title, "V1 → V2 線路修改"); assert.equal(view.calls.createSet[0].fromLabel, "V1"); assert.equal(view.calls.createSet[0].toLabel, "V2");
    assert.equal(view.calls.saves.length, 1); assert.equal(view.calls.saves[0].revision, 0); assert.equal(view.calls.saves[0].id, blank);
    assert.equal(view.calls.saves[0].setId, view.sets[0].id, "the change is written into the batch that was just created");
    assert.equal(view.model.selectedItem.revision, 1); assert.equal(view.model.selectedItem.number, 1);
    assert.equal(view.model.selectedSetId, view.sets[0].id); assert.equal(view.model.sets.length, 1);
    assert.equal(view.model.items.length, 1); assert.equal(view.model.dirty, false);
    // The next blank form is discarded when the user walks away from it untouched.
    await act(async () => view.model.createItem());
    assert.equal(view.model.selectedItem.revision, 0); assert.equal(view.model.selectedItem.number, 2);
    await act(async () => view.model.selectItem(blank));
    assert.equal(view.model.selectedItem.id, blank); assert.equal(view.calls.saves.length, 1); assert.equal(view.records.length, 1);
  } finally { view.unmount(); }
});

test("a background read keeps the unsaved form on screen, and a viewer is not given one", async () => {
  const view = await openBoard({ sets: [batch(OLD_SET, "Rev B")], records: [change("item-1", OLD_SET, 1, "First")] });
  try {
    assert.equal(view.model.selectedItem.id, "item-1");
    await act(async () => view.model.createItem());
    const blank = view.model.selectedItem.id;
    view.sets[0].updatedAt = "someone else saved";
    await act(async () => view.model.reload());
    assert.equal(view.model.selectedItem.id, blank, "the list refresh must not pull the user back to the first row");
    assert.equal(view.model.selectedItem.revision, 0);
  } finally { view.unmount(); }
  const viewer = await openBoard({ canEdit: false });
  try { assert.equal(viewer.model.selectedItem, null); assert.equal(viewer.model.draft, null); } finally { viewer.unmount(); }
});

test("typing while another change is loading cannot land on the one still on screen", async () => {
  const view = await openBoard({ sets: [batch(OLD_SET, "Rev B")], records: [change("item-1", OLD_SET, 1, "First"), change("item-2", OLD_SET, 2, "Second")] });
  try {
    const gate = deferred();
    view.gates.item = gate;
    let switching;
    await act(async () => { switching = view.model.selectItem("item-2"); await Promise.resolve(); });
    assert.equal(view.model.switching, true); assert.equal(view.model.selectedItem.id, "item-1");
    act(() => view.model.updateDraft({ title: "typed too early" }));
    assert.equal(view.model.draft.title, "First"); assert.equal(view.model.dirty, false);
    await act(async () => { gate.resolve(); await switching; });
    assert.equal(view.model.switching, false); assert.equal(view.model.selectedItem.id, "item-2"); assert.equal(view.model.draft.title, "Second");
    assert.equal(view.calls.saves.length, 0, "nothing was written to the previous change");
  } finally { view.unmount(); }
});

test("a batch created while a background read is in flight stays selected", async () => {
  const view = await openBoard({ sets: [batch(OLD_SET, "Rev B")], records: [change("item-1", OLD_SET, 1, "First")] });
  try {
    const stale = deferred(), before = clone(view.sets);
    view.gates.sets = stale;
    view.window.dispatchEvent(new Event("focus"));
    await view.settle(260);
    assert.equal(view.gates.sets, null, "the background read is on its way");
    let creating;
    await act(async () => { creating = view.model.createSet("第二次調整", "V2", "V3"); await Promise.resolve(); });
    await act(async () => { stale.resolve(before); await creating; });
    assert.equal(view.sets[0].title, "第二次調整");
    assert.equal(view.model.selectedSetId, view.sets[0].id, "the answer that predates the new batch must not put the old batch back");
    assert.equal(view.model.sets.length, 2); assert.equal(view.model.items.length, 0);
    assert.equal(view.model.selectedItem.revision, 0, "the new batch opens on a form ready to fill in");
  } finally { view.unmount(); }
});

test("pictures added to an unsaved change create it first, in the batch it ends up in", async () => {
  const view = await openBoard();
  try {
    const blank = view.model.selectedItem.id;
    view.setUpload(args => ({ images: args.files.map(file => ({ id: file.name, name: file.name, side: args.side })), failures: [] }));
    await act(async () => view.model.addImages([{ name: "before.png" }], "before"));
    assert.equal(view.calls.createSet.length, 1);
    assert.equal(view.calls.saves[0].revision, 0); assert.equal(view.calls.saves[0].content.images.length, 0, "the row exists before anything is stored under it");
    assert.equal(view.calls.uploads[0].itemId, blank); assert.equal(view.calls.uploads[0].setId, view.sets[0].id);
    assert.equal(view.calls.saves[1].revision, 1); assert.equal(view.calls.saves[1].content.images[0].id, "before.png");
    assert.equal(view.model.draft.images.length, 1); assert.equal(view.model.uploading, false); assert.equal(view.model.dirty, false);
    await act(async () => view.model.addImages([{ name: "after.png" }], "after"));
    assert.equal(view.model.draft.images.length, 2); assert.equal(view.calls.createSet.length, 1);
  } finally { view.unmount(); }
});

test("two pastes into an empty board both arrive, although the batch only exists after the first", async () => {
  const view = await openBoard();
  try {
    view.setUpload(args => ({ images: args.files.map(file => ({ id: file.name, name: file.name, side: args.side })), failures: [] }));
    await act(async () => { await Promise.all([view.model.addImages([{ name: "one.png" }], "before"), view.model.addImages([{ name: "two.png" }], "after")]); });
    assert.equal(view.calls.createSet.length, 1);
    assert.equal(view.model.draft.images.map(image => image.id).join(), "one.png,two.png");
    assert.equal(view.model.uploading, false); assert.equal(view.model.saveError, "");
  } finally { view.unmount(); }
});

test("a refused file is not retried, and a save whose answer was lost is not reported as a conflict", async () => {
  const view = await openBoard({ sets: [batch(OLD_SET, "Rev B")], records: [change("item-1", OLD_SET, 1, "First")] });
  try {
    view.setUpload(args => ({ images: [], failures: args.files.map(file => ({ file, error: file.name.endsWith(".pdf") ? "不是可用的圖片" : "network", ...(file.name.endsWith(".pdf") ? { permanent: true } : {}) })) }));
    await act(async () => view.model.addImages([{ name: "a.pdf" }, { name: "b.png" }], "after"));
    assert.equal(view.model.uploadFailures.length, 2);
    view.setUpload(args => ({ images: args.files.map(file => ({ id: file.name, name: file.name, side: args.side })), failures: [] }));
    await act(async () => view.model.retryUploads());
    assert.equal(view.calls.uploads.at(-1).files.map(file => file.name).join(), "b.png");
    assert.equal(view.model.uploadFailures.length, 0);
    // The write reached the server but its answer did not: the retry is refused as stale although nobody else edited.
    act(() => view.model.updateDraft({ reason: "Keep this reason" }));
    view.setSave(async args => { view.records[0] = { ...view.records[0], revision: args.revision + 1, content: Object.fromEntries(Object.entries(args.content).reverse()) }; throw new view.Conflict(); });
    await act(async () => view.model.saveDraft());
    assert.equal(view.model.conflict, false); assert.equal(view.model.saveError, "");
    assert.equal(view.model.selectedItem.revision, view.records[0].revision); assert.equal(view.model.dirty, false);
    assert.equal(view.model.draft.reason, "Keep this reason");
  } finally { view.unmount(); }
});

test("a list that was read before the first save landed cannot blank the form or drop the new change", async () => {
  const view = await openBoard();
  try {
    const held = deferred(), stale = deferred();
    view.setSave(args => held.promise.then(() => { view.setSave(null); const next = { id: args.id, setId: args.setId, number: 1, content: clone(args.content), status: "draft", revision: 1, createdAt: "2026-11-09T00:00:00Z", updatedAt: "rev-1", createdBy: "qa-A", updatedBy: "qa-A" }; view.records.push(next); return clone(next); }));
    act(() => view.model.updateDraft({ title: "第一項" }));
    let saving;
    await act(async () => { saving = view.model.saveDraft(); await new Promise(resolve => setTimeout(resolve, 0)); });
    assert.equal(view.calls.createSet.length, 1); assert.equal(view.calls.saves.length, 1, "the batch exists and the change is on its way");
    // A background read starts now: it sees the new batch, and its list of changes is read before the change is stored.
    view.gates.items = stale;
    view.window.dispatchEvent(new Event("focus"));
    await view.settle(260);
    assert.equal(view.gates.items, null, "the list read is waiting");
    await act(async () => { held.resolve(); await saving; });
    assert.equal(view.model.selectedItem.revision, 1); assert.equal(view.model.items.length, 1);
    await act(async () => { stale.resolve([]); await new Promise(resolve => setTimeout(resolve, 0)); });
    assert.equal(view.model.selectedItem.revision, 1, "the saved change stays on screen");
    assert.equal(view.model.draft.title, "第一項");
    assert.equal(view.model.items.length, 1, "and stays in the list");
    await act(async () => view.model.reload());
    assert.equal(view.model.items.length, 1); assert.equal(view.model.selectedItem.id, view.records[0].id);
  } finally { view.unmount(); }
});
