import type { PcbKeepout, PcbPoint } from "../types.ts";
import { getRotatedRectangleCorners } from "./geometry.ts";

type KeepoutBounds = Pick<PcbKeepout, "x" | "y" | "width" | "height" | "rotation">;
export type KeepoutResizeHandle = "nw" | "ne" | "sw" | "se";

export function getKeepoutCorners(bounds: KeepoutBounds): Record<KeepoutResizeHandle, PcbPoint> {
  const [nw, ne, se, sw] = getRotatedRectangleCorners({
    ...bounds, x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2,
    rotation: bounds.rotation ?? 0,
  });
  return { nw, ne, se, sw };
}

export function keepoutResizeAnchor(bounds: KeepoutBounds, handle: KeepoutResizeHandle): PcbPoint {
  const opposite = { nw: "se", ne: "sw", sw: "ne", se: "nw" } as const;
  return getKeepoutCorners(bounds)[opposite[handle]];
}

export function resizeKeepout(
  anchor: PcbPoint,
  handle: KeepoutResizeHandle,
  target: PcbPoint,
  minimumSize: number,
  board: { width: number; height: number },
  rotation: number,
): Omit<KeepoutBounds, "rotation"> {
  const angle = rotation * Math.PI / 180;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const dx = Math.min(board.width, Math.max(0, target.x)) - anchor.x;
  const dy = Math.min(board.height, Math.max(0, target.y)) - anchor.y;
  const signX = handle.endsWith("w") ? -1 : 1;
  const signY = handle.startsWith("n") ? -1 : 1;
  // Resize along the local axes while keeping the opposite world corner fixed.
  const width = Math.max(minimumSize, signX * (dx * cosine + dy * sine));
  const height = Math.max(minimumSize, signY * (-dx * sine + dy * cosine));
  return {
    x: anchor.x + (signX * width * cosine - signY * height * sine) / 2 - width / 2,
    y: anchor.y + (signX * width * sine + signY * height * cosine) / 2 - height / 2,
    width,
    height,
  };
}
