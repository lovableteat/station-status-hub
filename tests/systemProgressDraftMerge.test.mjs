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

test("station completion skips every item that is already completed", () => {
  assert.equal(
    typeof draftModule?.filterItemsNeedingStationCompletion,
    "function",
    "station completion requires a non-destructive item filter"
  );

  const items = [
    { id: "timed", station_id: "station-a" },
    { id: "direct", station_id: "station-a" },
    { id: "pending", station_id: "station-a" },
  ];
  const progressByItemId = new Map([
    [
      "timed",
      {
        status: "Done",
        started_at: "2026-07-21T01:00:00.000Z",
        completed_at: "2026-07-21T01:42:00.000Z",
        actual_hours: 0.7,
      },
    ],
    ["direct", { status: "Done", completed_at: null, actual_hours: 0 }],
    ["pending", { status: "On-going", completed_at: null, actual_hours: 0 }],
  ]);

  assert.deepEqual(
    draftModule.filterItemsNeedingStationCompletion(items, progressByItemId),
    [items[2]]
  );
});
