import assert from "node:assert/strict";
import test from "node:test";
import { watchPermissionRefresh } from "../src/lib/permissionRefresh.mjs";

function setup() {
  const windowTarget = new EventTarget();
  const documentTarget = new EventTarget();
  documentTarget.visibilityState = "visible";
  let tick;
  let count = 0;
  let cleared = false;
  windowTarget.setInterval = (callback, interval) => {
    assert.equal(interval, 30_000);
    tick = callback;
    return 17;
  };
  windowTarget.clearInterval = (id) => {
    assert.equal(id, 17);
    cleared = true;
  };
  const stop = watchPermissionRefresh({
    windowTarget, documentTarget, refresh: () => count++,
  });
  return { windowTarget, documentTarget, tick, stop,
    count: () => count, cleared: () => cleared };
}

test("missed grants and revocations are recovered without a realtime notification", () => {
  const state = setup();
  state.tick();
  state.windowTarget.dispatchEvent(new Event("focus"));
  state.windowTarget.dispatchEvent(new Event("online"));
  assert.equal(state.count(), 3);
  state.stop();
});

test("hidden tabs pause polling and fetch fresh permissions when visible again", () => {
  const state = setup();
  state.documentTarget.visibilityState = "hidden";
  state.tick();
  state.windowTarget.dispatchEvent(new Event("online"));
  state.documentTarget.dispatchEvent(new Event("visibilitychange"));
  assert.equal(state.count(), 0);
  state.documentTarget.visibilityState = "visible";
  state.documentTarget.dispatchEvent(new Event("visibilitychange"));
  assert.equal(state.count(), 1);
  state.stop();
});

test("sign-out or account changes remove the previous account's refresh listeners", () => {
  const state = setup();
  state.stop();
  assert.equal(state.cleared(), true);
  state.windowTarget.dispatchEvent(new Event("focus"));
  state.windowTarget.dispatchEvent(new Event("online"));
  state.documentTarget.dispatchEvent(new Event("visibilitychange"));
  assert.equal(state.count(), 0);
});
