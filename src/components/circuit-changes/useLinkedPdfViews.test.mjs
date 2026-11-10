import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { React, create, act, loader } = require("../../../tests/support/renderHarness.cjs");

function viewport(width, height, pageWidth, pageHeight, caption = 24) {
  let left = 0, top = 0;
  const host = {
    clientWidth: width, clientHeight: height, clientLeft: 0, clientTop: 0,
    pageWidth, pageHeight, caption,
    get scrollWidth() { return this.pageWidth; },
    get scrollHeight() { return this.pageHeight + this.caption; },
    get scrollLeft() { return left; },
    set scrollLeft(value) { left = Math.max(0, Math.min(this.scrollWidth - width, value)); },
    get scrollTop() { return top; },
    set scrollTop(value) { top = Math.max(0, Math.min(this.scrollHeight - height, value)); },
    getBoundingClientRect() { return { left: 20, top: 50 }; },
    querySelector() {
      return { getBoundingClientRect: () => ({ left: 20 - left, top: 50 + this.caption - top, width: this.pageWidth, height: this.pageHeight }) };
    },
  };
  return host;
}

async function fixture() {
  const frames = new Map(); let frameId = 0;
  const { useLinkedPdfViews } = loader({ globals: {
    requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame(id) { frames.delete(id); },
  } })("src/components/circuit-changes/useLinkedPdfViews.ts");
  const active = viewport(400, 300, 2000, 1200, 24), compare = viewport(500, 320, 3000, 1800, 40);
  const props = { activeViewport: { current: active }, compareViewport: { current: compare }, resetKey: "pair-1" };
  let model, root;
  function Probe(value) { model = useLinkedPdfViews(value); return null; }
  await act(async () => { root = create(React.createElement(Probe, props)); });
  return {
    active, compare, frames, get model() { return model; },
    async run(callback) { await act(async () => { callback(model); }); },
    async flush() { await act(async () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback()); }); },
    async reset() { props.resetKey = "pair-2"; await act(async () => { root.update(React.createElement(Probe, props)); }); },
    async unmount() { await act(async () => root.unmount()); },
  };
}

test("linked drawings follow page coordinates in both directions without clamped feedback drift", async () => {
  const f = await fixture();
  try {
    f.active.scrollLeft = 800; f.active.scrollTop = 474;
    await f.run(model => { model.onActiveScroll(); model.onActiveScroll(); });
    assert.equal(f.frames.size, 1, "coalesce movement into one animation frame");
    await f.flush();
    assert.equal(f.compare.scrollLeft, 1250, "50% page X maps across different sheet dimensions");
    assert.equal(f.compare.scrollTop, 780, "captions are excluded from 50% page Y");
    await f.run(model => model.onCompareScroll());
    assert.equal(f.frames.size, 0, "a mirrored browser scroll does not feed back");

    f.compare.scrollLeft = 1850; f.compare.scrollTop = 1140;
    await f.run(model => model.onCompareScroll()); await f.flush();
    assert.equal(f.active.scrollLeft, 1200); assert.equal(f.active.scrollTop, 714);

    f.compare.pageWidth = 300; f.compare.pageHeight = 200;
    f.active.scrollLeft = 1500; f.active.scrollTop = 850;
    await f.run(model => model.onActiveScroll()); await f.flush();
    assert.equal(f.compare.scrollLeft, 0); assert.equal(f.compare.scrollTop, 0);
    await f.run(model => model.onCompareScroll()); await f.flush();
    assert.equal(f.active.scrollLeft, 1500, "smaller target cannot drag the source back");
    assert.equal(f.active.scrollTop, 850);
  } finally { await f.unmount(); }
});

test("independent manual alignment is retained on relinking and cleared for a different page pair", async () => {
  const f = await fixture();
  try {
    await f.run(model => model.toggleLinked()); assert.equal(f.model.linked, false);
    f.active.scrollLeft = 300; f.compare.scrollLeft = 1550;
    await f.run(model => { model.onActiveScroll(); model.onCompareScroll(); });
    assert.equal(f.frames.size, 0);
    await f.run(model => model.toggleLinked()); assert.equal(f.model.linked, true);
    assert.equal(f.compare.scrollLeft, 1550, "relinking does not jump an aligned drawing");
    f.active.scrollLeft = 500;
    await f.run(model => model.onActiveScroll()); await f.flush();
    assert.ok(Math.abs(f.compare.scrollLeft - 1850) < 0.001, "moves by matching page-coordinate delta from the manual alignment");
    await f.reset();
    await f.run(model => model.onActiveScroll()); await f.flush();
    assert.equal(f.compare.scrollLeft, 800, "a different page pair does not inherit the previous alignment");
  } finally { await f.unmount(); }
});

test("zoom preserves visible page centres and unmount cancels scheduled work", async () => {
  const f = await fixture();
  f.active.scrollLeft = 800; f.active.scrollTop = 474;
  f.compare.scrollLeft = 1250; f.compare.scrollTop = 780;
  await f.run(model => model.beforeResize());
  f.active.pageWidth *= 2; f.active.pageHeight *= 2;
  f.compare.pageWidth *= 2; f.compare.pageHeight *= 2;
  await f.run(model => model.beforeResize());
  f.compare.scrollTop += 10;
  await f.run(model => model.onCompareScroll());
  assert.equal(f.frames.size, 0, "intermediate resize anchoring is not treated as user movement");
  await f.run(model => model.afterResize("active"));
  await f.flush();
  assert.equal(f.active.scrollLeft, 1800); assert.equal(f.active.scrollTop, 1074);
  assert.equal(f.frames.size, 0, "wait for both rendered geometries before linking again");
  await f.run(model => model.afterResize("compare")); await f.flush();
  await f.flush();
  assert.equal(f.compare.scrollLeft, 2750); assert.equal(f.compare.scrollTop, 1680);
  f.active.scrollLeft += 100;
  await f.run(model => model.onActiveScroll()); assert.equal(f.frames.size, 1);
  await f.unmount(); assert.equal(f.frames.size, 0);
});
