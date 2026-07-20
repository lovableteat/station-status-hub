export function isTransientLoginError(error) {
  const status = Number(error?.status ?? 0);
  const message = String(error?.message ?? error ?? "");

  return (
    status === 408 ||
    status === 429 ||
    status >= 500 ||
    /failed to fetch|network|timeout|temporar|connection|load failed/i.test(message)
  );
}

function wait(delayMs) {
  if (delayMs <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export async function runLoginWithTransientRetry(
  operation,
  { attempts = 3, delayMs = 250 } = {},
) {
  let lastResult;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      lastResult = await operation();
      if (!lastResult?.error || !isTransientLoginError(lastResult.error)) {
        return lastResult;
      }
    } catch (error) {
      if (!isTransientLoginError(error) || attempt === attempts - 1) {
        throw error;
      }
    }

    if (attempt < attempts - 1) {
      await wait(delayMs * (attempt + 1));
    }
  }

  return lastResult;
}
