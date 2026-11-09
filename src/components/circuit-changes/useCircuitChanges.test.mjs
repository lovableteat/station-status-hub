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
