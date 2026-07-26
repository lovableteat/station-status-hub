export function createPresenceSessionId() {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  return `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createPresenceKey(userId, sessionId) {
  return `${userId}:${sessionId}`;
}

export function isCurrentPresenceSession(
  currentGeneration,
  candidateGeneration,
  currentUserId,
  candidateUserId,
) {
  return (
    currentGeneration === candidateGeneration &&
    currentUserId === candidateUserId
  );
}

function getPresenceRecency(user) {
  if (Number.isFinite(user?.timestamp)) return user.timestamp;
  const parsedLastSeen = Date.parse(user?.lastSeen ?? "");
  return Number.isNaN(parsedLastSeen) ? 0 : parsedLastSeen;
}

export function selectLatestOnlineUsers(state) {
  const usersById = new Map();

  Object.values(state ?? {}).forEach((presences) => {
    if (!Array.isArray(presences)) return;

    presences.forEach((candidate) => {
      if (!candidate?.userId) return;
      const existing = usersById.get(candidate.userId);
      if (!existing || getPresenceRecency(candidate) > getPresenceRecency(existing)) {
        usersById.set(candidate.userId, candidate);
      }
    });
  });

  return [...usersById.values()].sort((a, b) =>
    (a.displayName || a.username || "").localeCompare(
      b.displayName || b.username || "",
      "zh-TW",
    ),
  );
}
