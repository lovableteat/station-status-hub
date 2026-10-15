import type { DiagramNode, DiagramPoint, DiagramPort } from "./diagramModel";
import { diagramSymbolGraphics, diagramSymbolPorts } from "./diagramSymbols.ts";
import { diagramNodeAnchor } from "./diagramGeometry.ts";

export type ArrowEndpoint = { nodeId: string; port?: DiagramPort; point: DiagramPoint };

/** A shape body is a usable drawing target; users need not hit a tiny handle. */
export function snapArrowEndpoint(point: DiagramPoint, toward: DiagramPoint, nodes: readonly DiagramNode[], radius: number): ArrowEndpoint {
  let nearest: DiagramNode | undefined;
  let distance = Infinity;
  for (const node of [...nodes].reverse()) {
    const x = Math.max(node.x, Math.min(point.x, node.x + node.width));
    const y = Math.max(node.y, Math.min(point.y, node.y + node.height));
    const candidate = Math.hypot(point.x - x, point.y - y);
    if (candidate <= radius && candidate < distance) { nearest = node; distance = candidate; }
  }
  if (!nearest) return { nodeId: "", point };
  const center = { x: nearest.x + nearest.width / 2, y: nearest.y + nearest.height / 2 };
  const direction = distance === 0 ? toward : point;
  if (diagramSymbolGraphics(nearest.shape)) {
    const supported = diagramSymbolPorts(nearest.shape, nearest.rotation);
    const port = supported.reduce((best, next) => {
      const first = diagramNodeAnchor(nearest!, best), second = diagramNodeAnchor(nearest!, next);
      return Math.hypot(second.x - direction.x, second.y - direction.y) < Math.hypot(first.x - direction.x, first.y - direction.y) ? next : best;
    });
    return { nodeId: nearest.id, port, point: diagramNodeAnchor(nearest, port) };
  }
  const dx = direction.x - center.x, dy = direction.y - center.y;
  const port: DiagramPort = Math.abs(dx) / nearest.width >= Math.abs(dy) / nearest.height ? (dx >= 0 ? "right" : "left") : (dy >= 0 ? "bottom" : "top");
  return { nodeId: nearest.id, port, point: { x: port === "left" ? nearest.x : port === "right" ? nearest.x + nearest.width : center.x, y: port === "top" ? nearest.y : port === "bottom" ? nearest.y + nearest.height : center.y } };
}

export function constrainArrowPoint(start: DiagramPoint, end: DiagramPoint, straight: boolean): DiagramPoint {
  const point = { x: Math.max(-1_000_000, Math.min(1_000_000, end.x)), y: Math.max(-1_000_000, Math.min(1_000_000, end.y)) };
  if (!straight) return point;
  return Math.abs(point.x - start.x) >= Math.abs(point.y - start.y) ? { x: point.x, y: start.y } : { x: start.x, y: point.y };
}
