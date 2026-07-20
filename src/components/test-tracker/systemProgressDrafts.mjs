export function mergeServerProgressDrafts(currentDrafts, serverDrafts, dirtyItemIds) {
  const merged = { ...currentDrafts };

  for (const [itemId, serverDraft] of Object.entries(serverDrafts)) {
    if (!dirtyItemIds.has(itemId)) {
      merged[itemId] = serverDraft;
    }
  }

  for (const itemId of Object.keys(merged)) {
    if (!(itemId in serverDrafts) && !dirtyItemIds.has(itemId)) {
      delete merged[itemId];
    }
  }

  return merged;
}
