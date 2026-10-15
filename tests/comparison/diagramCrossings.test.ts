import assert from "node:assert/strict";
import test from "node:test";
import { addDiagramCrossings } from "../../src/components/comparison/diagramCrossings.ts";
import { buildDiagramEdgeRoutes, diagramEdgeRoute, type DiagramEdgeRoute } from "../../src/components/comparison/diagramGeometry.ts";
import type { DiagramEdge, DiagramPoint } from "../../src/components/comparison/diagramModel.ts";

const wire = (id: string, sourcePoint: DiagramPoint, targetPoint: DiagramPoint, patch: Partial<DiagramEdge> = {}): DiagramEdge => ({ id, source: "", target: "", sourcePoint, targetPoint, label: "", color: "#2563eb", lineType: "straight", ...patch });
const horizontal = wire("horizontal", { x: 0, y: 100 }, { x: 200, y: 100 }, { jump: "arc" });
const vertical = wire("vertical", { x: 100, y: 0 }, { x: 100, y: 200 });
const jumps = (route: DiagramEdgeRoute) => (route.path.match(/Q/g) ?? []).length;

test("bridges modify only the enabled wire, preserve endpoints and include their protrusion in bounds", () => {
  const result = buildDiagramEdgeRoutes([horizontal, vertical], []), bridge = result.get(horizontal.id)!;
  assert.equal(result.notice, undefined);
  assert.equal(bridge.path, "M0 100 L93 100 Q100 86 107 100 L200 100");
  assert.equal(bridge.bridgePath, "M93 100 Q100 86 107 100", "only the arch gets a background halo; endpoints and ordinary wire segments remain intact");
  assert.deepEqual(bridge.points[0], horizontal.sourcePoint);
  assert.deepEqual(bridge.points.at(-1), horizontal.targetPoint);
  assert.ok(bridge.points.some(point => point.y < 100));
  assert.deepEqual(bridge.label, { x: 100, y: 100 });
  assert.equal(result.get(vertical.id)!.path, diagramEdgeRoute(vertical, []).path);
  assert.equal(result.get(vertical.id)!.bridgePath, undefined);
  assert.equal(jumps(buildDiagramEdgeRoutes([{ ...horizontal, jump: "none" }, vertical], []).get(horizontal.id)!), 0);
});

test("two enabled wires draw one deterministic overpass, including reverse edge and direction orders", () => {
  const both = { ...vertical, jump: "arc" as const };
  assert.equal(jumps(buildDiagramEdgeRoutes([horizontal, both], []).get(horizontal.id)!), 0);
  assert.equal(jumps(buildDiagramEdgeRoutes([horizontal, both], []).get(both.id)!), 1);
  assert.equal(jumps(buildDiagramEdgeRoutes([both, horizontal], []).get(horizontal.id)!), 1);
  const reversed = { ...horizontal, sourcePoint: horizontal.targetPoint, targetPoint: horizontal.sourcePoint };
  assert.equal(buildDiagramEdgeRoutes([reversed, vertical], []).get(horizontal.id)!.path, "M200 100 L107 100 Q100 86 93 100 L0 100");
});

test("slanted, elbow and curved wires bridge crossings without flattening the remaining cubic", () => {
  const slanted = wire("slanted", { x: 0, y: 0 }, { x: 200, y: 200 }, { jump: "arc" });
  const across = wire("across", { x: 0, y: 200 }, { x: 200, y: 0 });
  const slantedRoute = buildDiagramEdgeRoutes([slanted, across], []).get(slanted.id)!;
  assert.equal(jumps(slantedRoute), 1);
  assert.doesNotMatch(slantedRoute.path, /NaN|Infinity/);
  const elbow = wire("elbow", { x: 0, y: 0 }, { x: 200, y: 200 }, { lineType: "elbow", jump: "arc" });
  const elbowCrossing = wire("across", { x: 0, y: 80 }, { x: 200, y: 80 });
  assert.equal(jumps(buildDiagramEdgeRoutes([elbow, elbowCrossing], []).get(elbow.id)!), 1);
  const curve = { ...slanted, lineType: "curve" as const };
  const curveRoute = buildDiagramEdgeRoutes([curve, across], []).get(curve.id)!;
  assert.equal(jumps(curveRoute), 1);
  assert.equal((curveRoute.path.match(/C/g) ?? []).length, 2, "cubic sections before and after the bridge remain exact cubic commands");
  assert.match(curveRoute.path, /^M0 0 C/);
  assert.match(curveRoute.path, /200 200$/);
});

test("shared endpoints, collinear overlaps and tangent contacts do not bridge", () => {
  const shared = wire("shared", { x: 200, y: 100 }, { x: 200, y: 250 });
  const overlap = wire("overlap", { x: 80, y: 100 }, { x: 250, y: 100 });
  for (const other of [shared, overlap]) assert.equal(jumps(buildDiagramEdgeRoutes([horizontal, other], []).get(horizontal.id)!), 0);
  const curve = wire("curve", { x: 0, y: 100 }, { x: 200, y: 100 }, { lineType: "curve", jump: "arc" });
  const tangent = wire("tangent", { x: -20, y: 0 }, { x: 220, y: 0 });
  const points = [{ x: 0, y: 100 }, { x: 0, y: -100 / 3 }, { x: 200, y: -100 / 3 }, { x: 200, y: 100 }];
  const raw = new Map([[curve.id, { path: "M0 100 C0 -33.333 200 -33.333 200 100", points, label: { x: 100, y: 0 } }], [tangent.id, diagramEdgeRoute(tangent, [])]]);
  assert.equal(jumps(addDiagramCrossings([curve, tangent], raw).get(curve.id)!), 0);
});

test("shallow crossing angles remain crossings and curved hits are refined on the exact cubic", () => {
  const shallow = wire("shallow", { x: 0, y: 99 }, { x: 200, y: 101 });
  assert.equal(jumps(buildDiagramEdgeRoutes([horizontal, shallow], []).get(horizontal.id)!), 1);
  const curve = wire("curve", { x: 0, y: 0 }, { x: 200, y: 200 }, { lineType: "curve", jump: "arc" });
  const shallowCurveCrossing = wire("shallow", { x: 0, y: -1 }, { x: 200, y: 201 });
  assert.equal(jumps(buildDiagramEdgeRoutes([curve, shallowCurveCrossing], []).get(curve.id)!), 1);
});

test("nearby crossings share a bridge while separated crossings retain independent bridges", () => {
  const nearby = { ...vertical, id: "nearby", sourcePoint: { x: 108, y: 0 }, targetPoint: { x: 108, y: 200 } };
  assert.equal(jumps(buildDiagramEdgeRoutes([horizontal, vertical, nearby], []).get(horizontal.id)!), 1);
  const far = { ...nearby, sourcePoint: { x: 150, y: 0 }, targetPoint: { x: 150, y: 200 } };
  assert.equal(jumps(buildDiagramEdgeRoutes([horizontal, vertical, far], []).get(horizontal.id)!), 2);
});

test("grid boundaries and short coordinate ranges still detect exact crossings", () => {
  const first = wire("first", { x: -24, y: 0 }, { x: 24, y: 0 }, { jump: "arc" });
  const second = wire("second", { x: 0, y: -24 }, { x: 0, y: 24 });
  assert.equal(jumps(buildDiagramEdgeRoutes([first, second], []).get(first.id)!), 1);
});

test("6,000 sparse wires remain supported and pathological dense drawings fall back explicitly", () => {
  const sparse = Array.from({ length: 6000 }, (_, index) => wire(`sparse-${index}`, { x: 0, y: index * 20 }, { x: 1000, y: index * 20 }, { jump: "arc" }));
  const start = performance.now(), sparseRoutes = buildDiagramEdgeRoutes(sparse, []);
  assert.equal(sparseRoutes.size, sparse.length);
  assert.equal(sparseRoutes.notice, undefined);
  const dense = Array.from({ length: 6000 }, (_, index) => {
    const angle = index / 6000 * Math.PI;
    return wire(`dense-${index}`, { x: -1000 * Math.cos(angle), y: -1000 * Math.sin(angle) }, { x: 1000 * Math.cos(angle), y: 1000 * Math.sin(angle) }, { jump: "arc" });
  });
  const denseRoutes = buildDiagramEdgeRoutes(dense, []);
  assert.equal(denseRoutes.size, dense.length);
  assert.match(denseRoutes.notice!, /連線過於密集/);
  assert.equal(denseRoutes.get(dense[0].id)!.path, diagramEdgeRoute(dense[0], []).path);
  assert.ok(performance.now() - start < 8000, "bounded broad-phase work finishes without a large-graph freeze");
});
