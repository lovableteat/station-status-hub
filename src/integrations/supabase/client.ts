import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { createBoundedAuthFetch, createBoundedAuthLock } from './authLockPolicy.mjs';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_PUBLISHABLE_KEY = (
  import.meta.env.VITE_SUPABASE_ANON_KEY
  ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
) as string | undefined;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error(
    "Missing Supabase configuration. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
  );
}

const AUTH_STORAGE_POINTER = "bringup-auth-active-storage-key";

function createTabAuthStorageKey() {
  if (typeof window === "undefined") return undefined;

  const storage = window.sessionStorage;
  const previousKey = storage.getItem(AUTH_STORAGE_POINTER);
  const runtimeId = globalThis.crypto?.randomUUID?.()
    ?? `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const nextKey = `bringup-auth:${runtimeId}`;

  // Isolate Auth broadcasts between tabs while retaining this tab's session
  // across a normal refresh.
  if (previousKey && previousKey !== nextKey) {
    const previousSession = storage.getItem(previousKey);
    if (previousSession) storage.setItem(nextKey, previousSession);
    storage.removeItem(previousKey);
  }
  storage.setItem(AUTH_STORAGE_POINTER, nextKey);
  return nextKey;
}

const authStorage = typeof window === "undefined" ? undefined : window.sessionStorage;
const authStorageKey = createTabAuthStorageKey();

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  db: {
    schema: "workspace",
  },
  global: {
    // Only Auth endpoints receive a network deadline. Storage uploads and
    // project data requests keep their normal long-running behavior.
    fetch: createBoundedAuthFetch(),
  },
  auth: {
    storage: authStorage,
    storageKey: authStorageKey,
    persistSession: true,
    autoRefreshToken: true,
    // Supabase 2.111 forwards this option as `undefined` when a custom lock
    // is supplied, which makes the lock deadline NaN and blocks login.
    lockAcquireTimeout: 5_000,
    // Supabase otherwise waits forever for the browser Auth Web Lock. A stale
    // lock in another tab must reject so the application can recover safely.
    lock: createBoundedAuthLock(),
  }
});
