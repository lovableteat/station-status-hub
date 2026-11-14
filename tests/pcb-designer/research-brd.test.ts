import test from "node:test";
import assert from "node:assert/strict";
import { readResearchBrd } from "../../src/components/pcb-designer/core/researchBrd.ts";

const endpoint = "http://127.0.0.1:8766/v1/board";
const file = new File([new Uint8Array(512)], "test.brd");
const result = {
  warnings: ["匯入資料僅供研發試排。"],
  board: {
    width: 30, height: 25, layers: ["F.Cu", "B.Cu"],
    outline: [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 25 }, { x: 0, y: 25 }],
    components: [{ id: "U1", reference: "U1", x: 5, y: 5, width: 2, height: 2, rotation: 90, side: "top", locked: true }],
    pads: [{ id: "U1.1", componentId: "U1", net: "SDA", x: 4, y: 5, width: 0.7, height: 0.7, layers: ["F.Cu"] }],
    tracks: [{ id: "t1", net: "SDA", layer: "F.Cu", width: 0.25, points: [{ x: 4, y: 5 }, { x: 4, y: 8 }], locked: true }],
    vias: [{ id: "v1", net: "SDA", x: 4, y: 8, diameter: 0.7, layers: ["F.Cu", "B.Cu"], locked: true }],
    keepouts: [],
  },
};

test("reads a board through the fixed loopback endpoint without cookies or redirects", async (context) => {
  context.mock.method(globalThis, "fetch", async (url, init) => {
    assert.equal(url, endpoint);
    assert.equal(init.method, "POST");
    assert.equal(init.body, file);
    assert.equal(init.redirect, "error");
    assert.equal(init.credentials, "omit");
    assert.equal(init.headers["Content-Type"], "application/octet-stream");
    assert.equal(init.headers["X-PCB-Research-Token"], "test-pairing-token");
    assert.equal(init.targetAddressSpace, "loopback");
    assert.ok(init.signal instanceof AbortSignal);
    return Response.json(result);
  });
  assert.deepEqual(await readResearchBrd(file, { token: "test-pairing-token" }), result);
});

test("rejects unsupported input before contacting the bridge", async (context) => {
  const fetch = context.mock.method(globalThis, "fetch", async () => Response.json(result));
  await assert.rejects(readResearchBrd(file, { token: "" }), /配對碼/);
  await assert.rejects(readResearchBrd(new File(["dummy"], "test.json"), { token: "test-pairing-token" }), /BRD/i);
  await assert.rejects(readResearchBrd(new File(["<eagle><drawing/>"], "test.brd"), { token: "test-pairing-token" }), /BRD/i);
  assert.equal(fetch.mock.callCount(), 0);
});

test("rejects malformed bridge output instead of presenting unsafe board data", async (context) => {
  const malformed = structuredClone(result);
  malformed.board.tracks[0].layer = "NOT_IN_STACKUP";
  context.mock.method(globalThis, "fetch", async () => Response.json(malformed));
  await assert.rejects(readResearchBrd(file, { token: "test-pairing-token" }), /資料/);
});

test("preserves explicit bridge rejection and can cancel before a request", async (context) => {
  const fetch = context.mock.method(globalThis, "fetch", async () => Response.json({ error: "不支援這個 Allegro 版本。" }, { status: 422 }));
  await assert.rejects(readResearchBrd(file, { token: "test-pairing-token" }), /不支援這個 Allegro 版本/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(readResearchBrd(file, { signal: controller.signal, token: "test-pairing-token" }), { name: "AbortError" });
  assert.equal(fetch.mock.callCount(), 1);
});
