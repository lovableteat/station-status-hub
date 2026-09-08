import type { PcbProject } from "../types";

/** Which edge or corner stays put while the board grows or shrinks. */
export type PcbResizeAnchor =
  | "top-left" | "top" | "top-right"
  | "left" | "center" | "right"
  | "bottom-left" | "bottom" | "bottom-right";

export const PCB_RESIZE_ANCHORS: PcbResizeAnchor[] = [
  "top-left", "top", "top-right",
  "left", "center", "right",
  "bottom-left", "bottom", "bottom-right",
];

export const PCB_RESIZE_ANCHOR_LABELS: Record<PcbResizeAnchor, string> = {
  "top-left": "左上固定",
  top: "上緣固定",
  "top-right": "右上固定",
  left: "左緣固定",
  center: "置中",
  right: "右緣固定",
  "bottom-left": "左下固定",
  bottom: "下緣固定",
  "bottom-right": "右下固定",
};

/** Direction in which the board edge moves when this anchor is selected. */
export const PCB_RESIZE_DIRECTION_LABELS: Record<PcbResizeAnchor, string> = {
  "top-left": "往右下增減",
  top: "往下增減",
  "top-right": "往左下增減",
  left: "往右增減",
  center: "由中心向外增減",
  right: "往左增減",
  "bottom-left": "往右上增減",
  bottom: "往上增減",
  "bottom-right": "往左上增減",
};

export const PCB_RESIZE_DIRECTION_SYMBOLS: Record<PcbResizeAnchor, string> = {
  "top-left": "↘",
  top: "↓",
  "top-right": "↙",
  left: "→",
  center: "↔",
  right: "←",
  "bottom-left": "↗",
  bottom: "↑",
  "bottom-right": "↖",
};

/**
 * Fraction of the size change that existing content must move by so the
 * anchored edge stays where it was: anchoring the left edge means content
 * does not move, anchoring the right edge means it moves by the whole delta,
 * centring splits it.
 */
const FACTORS: Record<PcbResizeAnchor, { fx: number; fy: number }> = {
  "top-left": { fx: 0, fy: 0 },
  top: { fx: 0.5, fy: 0 },
  "top-right": { fx: 1, fy: 0 },
  left: { fx: 0, fy: 0.5 },
  center: { fx: 0.5, fy: 0.5 },
  right: { fx: 1, fy: 0.5 },
  "bottom-left": { fx: 0, fy: 1 },
  bottom: { fx: 0.5, fy: 1 },
  "bottom-right": { fx: 1, fy: 1 },
};

/** Board size change with every placed item shifted to honour the anchor. */
export function resizeBoard(
  project: PcbProject,
  size: { width?: number; height?: number },
  anchor: PcbResizeAnchor,
): PcbProject {
  const width = size.width ?? project.board.width;
  const height = size.height ?? project.board.height;
  const dw = width - project.board.width;
  const dh = height - project.board.height;
  const { fx, fy } = FACTORS[anchor];
  const dx = dw * fx;
  const dy = dh * fy;

  const scale = (p: { x: number; y: number }) => ({ x: p.x * width / project.board.width, y: p.y * height / project.board.height });
  const board = { ...project.board, width, height,
    ...(project.board.holes && { holes: project.board.holes.map(hole => hole.map(n => ({ ...scale(n), ...(n.in && { in: scale(n.in) }), ...(n.out && { out: scale(n.out) }) }))) }),
    ...(project.board.outline && { outline: project.board.outline.map(path => path.map(scale)) }),
    ...(project.board.outlineNodes && { outlineNodes: project.board.outlineNodes.map(n => ({ ...scale(n), ...(n.in && { in: scale(n.in) }), ...(n.out && { out: scale(n.out) }) })) }),
  };
  if (!dx && !dy) return { ...project, board };

  const round = (value: number) => Math.round(value * 1000) / 1000;

  return {
    ...project,
    board: {
      ...board,
      cuts: board.cuts?.map((cut) => ({
        ...cut,
        position: round(
          cut.position + (cut.orientation === "vertical" ? dx : dy),
        ),
      })),
    },
    components: project.components.map((item) => ({
      ...item,
      x: round(item.x + dx),
      y: round(item.y + dy),
    })),
    keepouts: project.keepouts.map((item) => ({
      ...item,
      x: round(item.x + dx),
      y: round(item.y + dy),
    })),
    measurements: project.measurements.map((item) => ({
      ...item,
      x1: round(item.x1 + dx),
      y1: round(item.y1 + dy),
      x2: round(item.x2 + dx),
      y2: round(item.y2 + dy),
    })),
  };
}
