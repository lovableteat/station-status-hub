export function createPresenceSessionId() {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  return `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const PRESENCE_DEVICE_ID_KEY = "station-status-hub:presence-device-id";

export function getOrCreatePresenceDeviceId(storage) {
  try {
    const resolvedStorage = storage ?? globalThis.localStorage;
    const existingDeviceId = resolvedStorage?.getItem(PRESENCE_DEVICE_ID_KEY);
    if (typeof existingDeviceId === "string" && existingDeviceId.trim()) {
      return existingDeviceId;
    }

    const deviceId = createPresenceSessionId();
    resolvedStorage?.setItem(PRESENCE_DEVICE_ID_KEY, deviceId);
    return deviceId;
  } catch {
    return createPresenceSessionId();
  }
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

export function createPresenceTransitionQueue() {
  let pendingTransition = Promise.resolve();

  return {
    enqueue(transition) {
      const nextTransition = pendingTransition
        .catch(() => undefined)
        .then(transition);

      pendingTransition = nextTransition.then(
        () => undefined,
        () => undefined,
      );

      return nextTransition;
    },
  };
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

export function selectOnlinePresenceSessions(state) {
  const sessionsById = new Map();

  Object.entries(state ?? {}).forEach(([presenceKey, presences]) => {
    if (!Array.isArray(presences)) return;

    presences.forEach((candidate) => {
      if (!candidate?.userId) return;
      const presencePrefix = `${candidate.userId}:`;
      const fallbackSessionId = presenceKey.startsWith(presencePrefix)
        ? presenceKey.slice(presencePrefix.length)
        : presenceKey;
      const sessionId =
        candidate.sessionId || fallbackSessionId || candidate.userId;
      const identity = createPresenceKey(candidate.userId, sessionId);
      const normalizedCandidate = candidate.sessionId
        ? candidate
        : { ...candidate, sessionId };
      const existing = sessionsById.get(identity);
      if (
        !existing ||
        getPresenceRecency(normalizedCandidate) > getPresenceRecency(existing)
      ) {
        sessionsById.set(identity, normalizedCandidate);
      }
    });
  });

  return [...sessionsById.values()].sort((a, b) => {
    const nameComparison = (a.displayName || a.username || "").localeCompare(
      b.displayName || b.username || "",
      "zh-TW",
    );
    if (nameComparison !== 0) return nameComparison;
    return (a.sessionId || "").localeCompare(b.sessionId || "");
  });
}
