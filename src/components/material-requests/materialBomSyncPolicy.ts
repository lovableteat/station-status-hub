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

export interface BomReadRetryOptions {
  retries?: number;
  delaysMs?: readonly number[];
  sleep?: (delayMs: number) => Promise<void>;
}

function getErrorField(error: unknown, field: string) {
  if (!error || typeof error !== "object" || !(field in error)) return undefined;
  return (error as Record<string, unknown>)[field];
}

export function isRetryableBomReadError(error: unknown) {
  const code = String(getErrorField(error, "code") ?? "").toUpperCase();
  if (["42P01", "42501", "PGRST301"].includes(code)) return false;

  const rawStatus = getErrorField(error, "status") ?? getErrorField(error, "statusCode");
  const status = Number(rawStatus);
  if ([408, 425, 429].includes(status) || status >= 500) return true;
  if (status >= 400 && status < 500) return false;

  const message = String(
    getErrorField(error, "message")
      ?? getErrorField(error, "details")
      ?? error
      ?? "",
  );
  return /fetch|network|timeout|timed out|connection|socket|gateway|temporar|aborted/i.test(message);
}

export async function runBomReadWithRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: BomReadRetryOptions = {},
) {
  const retries = Math.max(0, options.retries ?? 2);
  const delaysMs = options.delaysMs ?? [250, 800];
  const sleep = options.sleep ?? ((delayMs: number) => new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, delayMs);
  }));
  let attempt = 0;

  while (true) {
    try {
      return await operation(attempt);
    } catch (error) {
      if (attempt >= retries || !isRetryableBomReadError(error)) throw error;

      const delayIndex = Math.min(attempt, Math.max(0, delaysMs.length - 1));
      const delayMs = delaysMs.length > 0 ? delaysMs[delayIndex] ?? 0 : 0;
      if (delayMs > 0) await sleep(delayMs);
      attempt += 1;
    }
  }
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

export function isLatestBomWorkspaceLoad(completedRequestId: number, latestRequestId: number) {
  return completedRequestId === latestRequestId;
}
