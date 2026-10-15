import type { DiagramPoint, DiagramPort, DiagramRotation, DiagramShape } from "./diagramModel.ts";

export type ElectricalSymbolShape = "resistor" | "capacitor" | "ground";
export type DiagramSymbolShape = ElectricalSymbolShape | "netlabel";
export interface DiagramSymbolLabelBox { x: number; y: number; width: number; height: number }
export interface DiagramSymbolGraphics {
  paths: readonly string[];
  ports: readonly DiagramPort[];
  labelBox: DiagramSymbolLabelBox;
}

const graphics: Record<DiagramSymbolShape, DiagramSymbolGraphics> = {
  resistor: { paths: ["M0 50 H20 L26 34 L38 66 L50 34 L62 66 L74 34 L80 50 H100"], ports: ["left", "right"], labelBox: { x: 4, y: 78, width: 92, height: 22 } },
  capacitor: { paths: ["M0 50 H42 M42 26 V74 M58 26 V74 M58 50 H100"], ports: ["left", "right"], labelBox: { x: 4, y: 78, width: 92, height: 22 } },
  ground: { paths: ["M50 0 V36 M20 36 H80 M30 52 H70 M40 68 H60"], ports: ["top"], labelBox: { x: 4, y: 78, width: 92, height: 22 } },
  netlabel: { paths: ["M0 50 L14 22 H100 V78 H14 Z"], ports: ["left"], labelBox: { x: 20, y: 26, width: 74, height: 48 } },
};
const anchors: Record<DiagramPort, DiagramPoint> = { left: { x: 0, y: 50 }, right: { x: 100, y: 50 }, top: { x: 50, y: 0 }, bottom: { x: 50, y: 100 } };
const clockwise: DiagramPort[] = ["top", "right", "bottom", "left"];

export function isElectricalSymbol(shape: DiagramShape): shape is ElectricalSymbolShape {
  return shape === "resistor" || shape === "capacitor" || shape === "ground";
}

/** Native SVG paths in a 100×100 viewBox; shared by palette, canvas and exports. */
export function diagramSymbolGraphics(shape: DiagramShape): DiagramSymbolGraphics | undefined {
  return Object.prototype.hasOwnProperty.call(graphics, shape) ? graphics[shape as DiagramSymbolShape] : undefined;
}

/** Persisted port IDs always identify the visible screen side, after rotation. */
export function diagramSymbolPorts(shape: DiagramShape, rotation: DiagramRotation = 0): readonly DiagramPort[] {
  const symbol = diagramSymbolGraphics(shape);
  if (!symbol) return clockwise;
  return symbol.ports.map(port => clockwise[(clockwise.indexOf(port) + rotation / 90) % 4]);
}

export function diagramSymbolPortPosition(shape: DiagramShape, port: DiagramPort, rotation: DiagramRotation = 0): DiagramPoint | undefined {
  if (!diagramSymbolGraphics(shape) || !diagramSymbolPorts(shape, rotation).includes(port)) return undefined;
  return { ...anchors[port] };
}

/** Captions stay upright and outside the circuit strokes as the symbol rotates. */
export function diagramSymbolLabelBox(shape: DiagramShape, rotation: DiagramRotation = 0): DiagramSymbolLabelBox | undefined {
  const symbol = diagramSymbolGraphics(shape);
  if (!symbol) return undefined;
  if (shape === "ground" && rotation === 90) return { x: 0, y: 4, width: 24, height: 92 };
  if (shape === "ground" && rotation === 180) return { x: 4, y: 0, width: 92, height: 22 };
  if (shape !== "netlabel" && (rotation === 90 || rotation === 270)) return { x: 76, y: 4, width: 24, height: 92 };
  return { ...symbol.labelBox };
}
