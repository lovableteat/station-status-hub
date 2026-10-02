/** Bound read-only requests so a stalled network cannot hold initial loading forever. */
export async function withReadDeadline<T>(
  read: (signal: AbortSignal) => PromiseLike<T>, timeoutMs = 20_000,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("資料讀取逾時，請稍後重試。"));
    }, timeoutMs);
  });
  try { return await Promise.race([Promise.resolve().then(() => read(controller.signal)), timeout]); }
  finally { clearTimeout(timer); }
}
