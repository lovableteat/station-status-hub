export function mergeDirectMessages(current, incoming) {
  const byId = new Map(current.map((message) => [message.id, message]));
  const optimisticByClientId = new Map(
    current
      .filter((message) => message.delivery !== "sent")
      .map((message) => [message.clientId, message.id]),
  );

  incoming.forEach((message) => {
    const optimisticId = optimisticByClientId.get(message.clientId);
    if (optimisticId) byId.delete(optimisticId);
    byId.set(message.id, message);
  });

  return [...byId.values()].sort((left, right) => {
    const timeDifference = Date.parse(left.createdAt) - Date.parse(right.createdAt);
    return timeDifference || left.id.localeCompare(right.id);
  });
}

export function replaceVisibleDirectMessages(current, incoming, clearedAt = null) {
  if (!clearedAt && incoming.length > 0) {
    return mergeDirectMessages(current, incoming);
  }

  const cutoff = clearedAt ? Date.parse(clearedAt) : Number.POSITIVE_INFINITY;
  return mergeDirectMessages(
    current.filter((message) => (
      message.delivery !== "sent" || Date.parse(message.createdAt) > cutoff
    )),
    incoming,
  );
}

export function setPendingDirectThread(current, threadId, pending) {
  const next = new Set(current);
  if (pending) next.add(threadId);
  else next.delete(threadId);
  return next;
}
