import test from "node:test";
import assert from "node:assert/strict";
import {
  addResearchTrack, addResearchVia, moveResearchComponent,
  routeResearchNet, suggestResearchPlacement,
} from "../../src/components/pcb-designer/core/researchLayout.ts";
import type { ResearchBoard } from "../../src/components/pcb-designer/core/researchLayout.ts";

function board(): ResearchBoard {
  return {
    width: 18, height: 12, layers: ["TOP", "BOTTOM"],
    components: [
      { id: "U1", reference: "U1", x: 3, y: 6, width: 2, height: 2, rotation: 0, side: "top", locked: true },
      { id: "R1", reference: "R1", x: 15, y: 6, width: 2, height: 2, rotation: 0, side: "top", locked: false },
    ],
    pads: [
      { id: "U1.1", componentId: "U1", x: 3, y: 6, width: .6, height: .6, layers: ["TOP"], net: "SIG" },
      { id: "R1.1", componentId: "R1", x: 15.5, y: 6, width: .6, height: .4, layers: ["TOP"], net: "SIG" },
    ],
    keepouts: [], tracks: [], vias: [],
  };
}

test("placement preserves fixed parts and existing copper, and rotates linked pads", () => {
  const source = board();
  source.tracks = [{ id: "original", net: "SIG", layer: "TOP", width: .2, points: [{ x: 3, y: 6 }, { x: 15.5, y: 6 }], locked: true }];
  source.tracks.push({ id: "other", net: "OTHER", layer: "TOP", width: .2, points: [{ x: 12, y: 2 }, { x: 12, y: 6 }], locked: true });
  source.keepouts = [{ id: "no-placement", x: 8, y: 3, width: 3, height: 3, kind: "placement" }];
  assert.equal(moveResearchComponent(source, "U1", { x: 4, y: 4 }).reason, "locked");
  assert.equal(moveResearchComponent(source, "R1", { x: 10, y: 4 }).reason, "blocked");
  assert.equal(moveResearchComponent(source, "R1", { x: 11.5, y: 5 }).reason, "blocked");
  const moved = moveResearchComponent(source, "R1", { x: 12, y: 8 }, 90);
  assert.deepEqual(moved.affectedNets, ["SIG"]);
  assert.equal(moved.board.tracks, source.tracks);
  assert.equal(moved.board.pads[1].x, 12);
  assert.equal(moved.board.pads[1].y, 8.5);
  assert.equal(moved.board.pads[1].width, .4);
  assert.equal(source.pads[1].x, 15.5);
  const suggested = suggestResearchPlacement(source, ["U1", "R1"]);
  assert.deepEqual(suggested.moved, ["R1"]);
  assert.deepEqual(suggested.skipped, ["U1"]);
  assert.equal(suggested.board.components[0], source.components[0]);
  assert.ok(suggested.board.components[1].x < 15);
});

test("research router works around a routing keepout on the selected layer", () => {
  const source = board();
  source.keepouts = [{ id: "barrier", x: 8, y: 4, width: 2, height: 4, kind: "routing", layers: ["TOP"] }];
  const result = routeResearchNet(source, "SIG", { width: .25, clearance: .2, layers: ["TOP"] });
  assert.deepEqual(result.pending, []);
  assert.equal(result.tracks.length, 1);
  assert.equal(result.tracks[0].layer, "TOP");
  assert.ok(result.tracks[0].points.some(point => point.y < 3.7 || point.y > 8.3));
  assert.deepEqual(source.tracks, []);
});

test("unroutable nets stay pending and explicit vias unlock an allowed second layer", () => {
  const source = board();
  source.tracks = [{ id: "separator", net: "OTHER", layer: "TOP", width: .2, points: [{ x: 9, y: 0 }, { x: 9, y: 12 }], locked: true }];
  const blocked = routeResearchNet(source, "SIG", { width: .2, clearance: .15, layers: ["TOP"] });
  assert.equal(blocked.reason, "unroutable");
  assert.ok(blocked.pending.length > 0);
  assert.equal(blocked.board, source);
  source.layers.push(...Array.from({ length: 16 }, (_, index) => `INNER-${index + 1}`));
  const result = routeResearchNet(source, "SIG", { width: .2, clearance: .15, viaDiameter: .5, layers: ["TOP", "BOTTOM"] });
  assert.deepEqual(result.pending, []);
  assert.ok(result.tracks.some(track => track.layer === "BOTTOM"));
  assert.equal(result.vias.length, 2);
  assert.equal(result.board.tracks[0], source.tracks[0]);
});

test("manual changes reject shorts, hole crossings, and unknown layers", () => {
  const source = board();
  source.holes = [[{ x: 7, y: 4 }, { x: 8, y: 4 }, { x: 8, y: 8 }, { x: 7, y: 8 }]];
  source.pads.push({ id: "P.1", net: "OTHER", x: 5, y: 3, width: 1, height: 1, layers: ["TOP"] });
  const draft = { id: "draft", net: "SIG", layer: "TOP", width: .2, points: [{ x: 7, y: 3 }, { x: 8, y: 9 }] };
  assert.equal(addResearchTrack(source, draft, .1).board, source);
  assert.equal(addResearchTrack(source, { ...draft, layer: "NOPE" }, .1).board, source);
  const via = { id: "via", net: "SIG", x: 5, y: 3, diameter: .5, layers: ["TOP", "BOTTOM"] };
  assert.equal(addResearchVia(source, via, .1).board, source);
  assert.equal(addResearchVia(source, { ...via, y: 2 }, .1).board.vias.length, 1);
});

test("existing copper paths already connecting all pads do not get duplicated", () => {
  const source = board();
  source.tracks = [{ id: "existing", net: "SIG", layer: "TOP", width: .2, points: [{ x: 3, y: 6 }, { x: 15.5, y: 6 }], locked: true }];
  const result = routeResearchNet(source, "SIG", { width: .2, clearance: .15 });
  assert.deepEqual(result.pending, []);
  assert.deepEqual(result.tracks, []);
  assert.equal(result.board, source);
});

test("polygon keepouts block their occupied region without ruling out the whole bounding box", () => {
  const source = board();
  source.keepouts = [{ id: "triangle", x: 5, y: 2, width: 8, height: 8, kind: "both", points: [
    { x: 5, y: 2 }, { x: 13, y: 2 }, { x: 13, y: 10 },
  ] }];
  assert.equal(moveResearchComponent(source, "R1", { x: 10, y: 4 }).reason, "blocked");
  assert.equal(moveResearchComponent(source, "R1", { x: 8, y: 8 }).reason, undefined);
  const track = { id: "below", net: "SIG", layer: "TOP", width: .2, points: [{ x: 5, y: 6 }, { x: 9, y: 8 }] };
  assert.equal(addResearchTrack(source, track, .2).reason, undefined);
});

test("unsupported electrical pads stay pending and block automatic routing for that net", () => {
  const source = board();
  source.pads.push({ id: "custom", net: "SIG", x: 5, y: 3, width: 1, height: 1, layers: ["TOP"], obstacleOnly: true });
  const result = routeResearchNet(source, "SIG", { width: .2, clearance: .15 });
  assert.equal(result.reason, "unsupported");
  assert.deepEqual(result.pending, ["R1.1", "custom"]);
  assert.equal(result.board, source);
});
