import { useCallback, useEffect, useRef, useState } from "react";

/** Import before changing routes/state, retaining the currently mounted editor on failure. */
export function useModuleNavigation() {
  const sequence = useRef(0);
  const [pending, setPending] = useState(false);
  const [retry, setRetry] = useState<(() => void) | null>(null);
  const cancel = useCallback(() => {
    sequence.current += 1;
    setPending(false);
    setRetry(null);
  }, []);
  useEffect(() => () => { sequence.current += 1; }, []);
  const navigate = useCallback(async (load: () => Promise<unknown>, commit: () => void) => {
    const request = ++sequence.current;
    setPending(true);
    setRetry(null);
    try {
      await load();
      if (request !== sequence.current) return false;
      commit();
      return true;
    } catch {
      if (request === sequence.current) setRetry(() => () => { void navigate(load, commit); });
      return false;
    } finally {
      if (request === sequence.current) setPending(false);
    }
  }, []);
  return { navigate, pending, retry, cancel };
}
