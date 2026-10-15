import assert from "node:assert/strict";
import test from "node:test";
import { diagramEdgeEndpoint, diagramEdgeRoute, diagramNodeAnchor } from "../../src/components/comparison/diagramGeometry.ts";
import type { DiagramEdge, DiagramNode, DiagramPort } from "../../src/components/comparison/diagramModel.ts";

const node: DiagramNode = { id: "node", x: 10, y: 20, width: 100, height: 60, shape: "rectangle", label: "", detail: "", color: "#2563eb" };
const free = (patch: Partial<DiagramEdge> = {}): DiagramEdge => ({ id: "edge", source: "", target: "", sourcePoint: { x: -20, y: 40 }, targetPoint: { x: 240, y: 160 }, label: "", color: "#2563eb", ...patch });

test("straight, elbow and curve paths share exact endpoints and their labels stay on the drawn line", () => {
  const straight = diagramEdgeRoute(free({ lineType: "straight" }), []);
  assert.equal(straight.path, "M-20 40 L240 160");
  assert.deepEqual(straight.label, { x: 110, y: 100 });
  const elbow = diagramEdgeRoute(free(), []);
  assert.equal(elbow.path, "M-20 40 L110 40 L110 160 L240 160");
  assert.deepEqual(elbow.label, { x: 110, y: 100 });
  const curve = diagramEdgeRoute(free({ lineType: "curve" }), []);
  assert.match(curve.path, /^M-20 40 C/);
  assert.match(curve.path, /240 160$/);
  assert.deepEqual(curve.label, { x: 110, y: 100 });
  for (const result of [straight, elbow, curve]) {
    assert.deepEqual(result.points[0], { x: -20, y: 40 });
    assert.deepEqual(result.points.at(-1), { x: 240, y: 160 });
    assert.ok(result.points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)));
  }
});

test("all source/target port combinations remain orthogonal and leave/approach the actual node border", () => {
  const other = { ...node, id: "other", x: 400, y: 300 };
  const ports: DiagramPort[] = ["left", "right", "top", "bottom"];
  const vector = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] };
  for (const sourcePort of ports) for (const targetPort of ports) {
    const edge = free({ source: node.id, target: other.id, sourcePort, targetPort });
    const result = diagramEdgeRoute(edge, new Map([[node.id, node], [other.id, other]]));
    assert.deepEqual(result.points[0], diagramNodeAnchor(node, sourcePort));
    assert.deepEqual(result.points.at(-1), diagramNodeAnchor(other, targetPort));
    result.points.slice(1).forEach((point, index) => assert.ok(point.x === result.points[index].x || point.y === result.points[index].y, `${sourcePort}→${targetPort} has a diagonal elbow`));
    for (const box of [node, other]) result.points.slice(1).forEach((point, index) => {
      const before = result.points[index];
      const through = point.x === before.x
        ? point.x > box.x && point.x < box.x + box.width && Math.max(Math.min(point.y, before.y), box.y) < Math.min(Math.max(point.y, before.y), box.y + box.height)
        : point.y > box.y && point.y < box.y + box.height && Math.max(Math.min(point.x, before.x), box.x) < Math.min(Math.max(point.x, before.x), box.x + box.width);
      assert.equal(through, false, `${sourcePort}→${targetPort} crosses its endpoint shape`);
    });
    const first = result.points[1], start = result.points[0], penultimate = result.points.at(-2)!, end = result.points.at(-1)!;
    assert.ok((first.x - start.x) * vector[sourcePort][0] + (first.y - start.y) * vector[sourcePort][1] > 0);
    assert.ok((penultimate.x - end.x) * vector[targetPort][0] + (penultimate.y - end.y) * vector[targetPort][1] > 0);
  }
});

test("mixed endpoint arrows follow moved nodes while free endpoints remain fixed", () => {
  const edge = free({ source: node.id, sourcePort: "bottom", lineType: "straight" });
  assert.deepEqual(diagramEdgeEndpoint(edge, "source", [node]).point, { x: 60, y: 80 });
  assert.deepEqual(diagramEdgeEndpoint(edge, "target", [node]).point, edge.targetPoint);
  const moved = { ...node, x: 210, y: -80 };
  const result = diagramEdgeRoute(edge, [moved]);
  assert.deepEqual(result.points, [{ x: 260, y: -20 }, edge.targetPoint]);
  assert.deepEqual(edge.sourcePoint, { x: -20, y: 40 }, "resolution never mutates persisted data");
  assert.throws(() => diagramEdgeRoute(edge, []), /圖形不存在/);
  assert.throws(() => diagramEdgeRoute({ ...edge, source: "", sourcePoint: undefined }, []), /有效端點/);
});

test("self loops and coincident free endpoints remain finite and safe to export", () => {
  for (const port of ["left", "right", "top", "bottom"] as DiagramPort[]) {
    const result = diagramEdgeRoute(free({ source: node.id, target: node.id, sourcePort: port, targetPort: port }), [node]);
    assert.ok(result.points.length >= 6);
    assert.deepEqual(result.points[0], result.points.at(-1));
    assert.ok(result.points.some(point => point.x < node.x || point.x > node.x + node.width || point.y < node.y || point.y > node.y + node.height));
  }
  for (const lineType of ["straight", "elbow", "curve"] as const) {
    const result = diagramEdgeRoute(free({ targetPoint: { x: -20, y: 40 }, lineType }), []);
    assert.doesNotMatch(result.path, /NaN|Infinity|undefined/);
    assert.deepEqual(result.label, { x: -20, y: 40 });
  }
});
