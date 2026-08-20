import { createId } from "../defaults.ts";
import type { PcbBoard, PcbBoardCut } from "../types.ts";

export function createBoardGridCuts(
  board: Pick<PcbBoard, "width" | "height">,
  columns: number,
  rows: number,
): PcbBoardCut[] {
  const safeColumns = Math.min(20, Math.max(1, Math.round(columns)));
  const safeRows = Math.min(20, Math.max(1, Math.round(rows)));
  const cuts: PcbBoardCut[] = [];

  for (let column = 1; column < safeColumns; column += 1) {
    cuts.push({
      id: createId("cut"),
      orientation: "vertical",
      position: (board.width * column) / safeColumns,
    });
  }
  for (let row = 1; row < safeRows; row += 1) {
    cuts.push({
      id: createId("cut"),
      orientation: "horizontal",
      position: (board.height * row) / safeRows,
    });
  }
  return cuts;
}
