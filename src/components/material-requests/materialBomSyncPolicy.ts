export interface BomWorkspaceRemoteVersion {
  id: string;
  recordCount: number;
  updatedAt: string;
}

export interface BomWorkspaceCachedVersion {
  id: string;
  isLoaded: boolean;
  loadedRecordCount: number;
  updatedAt: string;
}

function toTimestamp(value: string) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function canReuseBomWorkspaceCache({
  cached,
  remote,
}: {
  cached: BomWorkspaceCachedVersion | null | undefined;
  remote: BomWorkspaceRemoteVersion;
}) {
  if (!cached || cached.id !== remote.id || !cached.isLoaded) return false;
  if (cached.loadedRecordCount !== remote.recordCount) return false;

  const cachedTimestamp = toTimestamp(cached.updatedAt);
  const remoteTimestamp = toTimestamp(remote.updatedAt);
  return cachedTimestamp !== null
    && remoteTimestamp !== null
    && cachedTimestamp === remoteTimestamp;
}
