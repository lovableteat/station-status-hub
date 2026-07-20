import assert from "node:assert/strict";
import test from "node:test";

let draftModule = null;

try {
  draftModule = await import(
    "../src/components/test-tracker/systemProgressDrafts.mjs"
  );
} catch {
  // The first red run proves the draft merge helper does not exist yet.
}

test("server refresh preserves dirty item drafts while updating clean items", () => {
  assert.equal(
    typeof draftModule?.mergeServerProgressDrafts,
    "function",
    "a per-item draft merge helper is required"
  );

  const currentDrafts = {
    itemA: { notes: "尚未存檔", progress_percent: 100, status: "Done" },
    itemB: { notes: "", progress_percent: 10, status: "On-going" },
  };
  const serverDrafts = {
    itemA: { notes: "", progress_percent: 20, status: "On-going" },
    itemB: { notes: "已由伺服器更新", progress_percent: 100, status: "Done" },
  };

  const merged = draftModule.mergeServerProgressDrafts(
    currentDrafts,
    serverDrafts,
    new Set(["itemA"])
  );

  assert.deepEqual(merged.itemA, currentDrafts.itemA);
  assert.deepEqual(merged.itemB, serverDrafts.itemB);
});

test("saved item can accept the next server value after its dirty flag is cleared", () => {
  assert.equal(
    typeof draftModule?.mergeServerProgressDrafts,
    "function",
    "a per-item draft merge helper is required"
  );

  const merged = draftModule.mergeServerProgressDrafts(
    {
      itemA: { notes: "舊草稿", progress_percent: 100, status: "Done" },
    },
    {
      itemA: { notes: "已儲存", progress_percent: 100, status: "Done" },
    },
    new Set()
  );

  assert.equal(merged.itemA.notes, "已儲存");
});
