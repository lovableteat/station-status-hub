interface OrderedStationLike {
  id: string;
  station_order: number;
}

interface OrderedItemLike {
  id: string;
  item_order: number;
  station_id: string;
}

function moveAtDropPosition<T extends { id: string }>(
  entries: T[],
  draggedId: string,
  targetId?: string,
) {
  const fromIndex = entries.findIndex((entry) => entry.id === draggedId);
  const targetIndex = targetId
    ? entries.findIndex((entry) => entry.id === targetId)
    : entries.length - 1;
  if (fromIndex < 0 || targetIndex < 0 || fromIndex === targetIndex) return [...entries];

  const ordered = [...entries];
  const [moved] = ordered.splice(fromIndex, 1);
  ordered.splice(targetId ? targetIndex : ordered.length, 0, moved);
  return ordered;
}

export function reorderStationsByDrop<T extends OrderedStationLike>(
  stations: T[],
  draggedStationId: string,
  targetStationId: string,
) {
  return moveAtDropPosition(stations, draggedStationId, targetStationId).map((station, station_order) => ({
    ...station,
    station_order,
  }));
}

export function reorderItemsByDrop<T extends OrderedItemLike>(
  items: T[],
  draggedItemId: string,
  targetItemId?: string,
) {
  const draggedItem = items.find((item) => item.id === draggedItemId);
  const targetItem = targetItemId
    ? items.find((item) => item.id === targetItemId)
    : null;
  if (
    !draggedItem
    || (targetItem && targetItem.station_id !== draggedItem.station_id)
  ) {
    return [...items];
  }

  return moveAtDropPosition(
    [...items].sort((left, right) => left.item_order - right.item_order),
    draggedItemId,
    targetItemId,
  ).map((item, item_order) => ({ ...item, item_order }));
}
