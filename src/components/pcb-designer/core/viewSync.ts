import type {
  PcbBoard,
  PcbPlacedComponent,
  PcbPoint,
  PcbSelection,
  PcbVisibleLayer,
} from "../types.ts";

export function getPcbSelectionIds(
  primarySelection: PcbSelection | null,
  selectedObjects: readonly PcbSelection[],
): string[] {
  const ids = new Set<string>();

  if (primarySelection) {
    ids.add(primarySelection.id);
  }

  for (const object of selectedObjects) {
    ids.add(object.id);
  }

  return [...ids];
}

export function isPcbLayerVisible(
  visibleLayer: PcbVisibleLayer,
  componentLayer: PcbPlacedComponent["layer"],
): boolean {
  return visibleLayer === "all" || visibleLayer === componentLayer;
}

export function getPcbComponentCenter(
  component: Pick<PcbPlacedComponent, "x" | "y">,
): PcbPoint {
  // Placement coordinates are centers in the editor, collision engine, and saved project data.
  return {
    x: component.x,
    y: component.y,
  };
}

export interface PcbComponentViewState {
  coordinate: PcbPoint;
  rotation: number;
  layer: PcbPlacedComponent["layer"];
  visible: boolean;
  selected: boolean;
}

export function getPcbComponentViewState(
  component: Pick<PcbPlacedComponent, "instanceId" | "x" | "y" | "width" | "height" | "rotation" | "layer">,
  visibleLayer: PcbVisibleLayer,
  selectionIds: readonly string[],
): PcbComponentViewState {
  return {
    coordinate: getPcbComponentCenter(component),
    rotation: component.rotation,
    layer: component.layer,
    visible: isPcbLayerVisible(visibleLayer, component.layer),
    selected: selectionIds.includes(component.instanceId),
  };
}

export function getPcb3DComponentTransform(
  component: Pick<PcbPlacedComponent, "x" | "y" | "rotation" | "layer">,
  board: Pick<PcbBoard, "width" | "height">,
): { position: [number, number, number]; rotation: [number, number, number] } {
  const center = getPcbComponentCenter(component);

  return {
    position: [
      center.x - board.width / 2,
      0,
      board.height / 2 - center.y,
    ],
    rotation: [
      0,
      -(component.rotation * Math.PI) / 180,
      0,
    ],
  };
}
