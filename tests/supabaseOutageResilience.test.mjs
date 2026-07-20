import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  SUPABASE_EGRESS_RESTRICTION_MESSAGE,
  isSupabaseServiceRestrictedError,
} from "../src/integrations/supabase/serviceErrors.js";

const appUrl = new URL("../src/App.tsx", import.meta.url);
const loginUrl = new URL("../src/components/auth/LoginPage.tsx", import.meta.url);
const projectProviderUrl = new URL(
  "../src/components/test-projects/TestProjectProvider.tsx",
  import.meta.url,
);
const unifiedDataUrl = new URL("../src/hooks/useUnifiedData.ts", import.meta.url);
const indexUrl = new URL("../src/pages/Index.tsx", import.meta.url);
const presenceUrl = new URL("../src/hooks/useUserPresence.ts", import.meta.url);
const notificationsUrl = new URL(
  "../src/components/common/RealtimeNotifications.tsx",
  import.meta.url,
);
const loginRetryPolicyUrl = new URL(
  "../src/components/auth/loginRetryPolicy.mjs",
  import.meta.url,
);

test("recognizes Supabase quota restriction responses", () => {
  assert.equal(isSupabaseServiceRestrictedError({ status: 402 }), true);
  assert.equal(isSupabaseServiceRestrictedError({ code: "402" }), true);
  assert.equal(
    isSupabaseServiceRestrictedError({
      message:
        "Service for this project is restricted due to the following violations: exceed_egress_quota.",
    }),
    true,
  );
  assert.equal(isSupabaseServiceRestrictedError({ status: 401 }), false);
  assert.match(SUPABASE_EGRESS_RESTRICTION_MESSAGE, /流量|服務/);
});

test("login explains quota restrictions instead of reporting a generic credential error", async () => {
  const login = await readFile(loginUrl, "utf8");

  assert.match(login, /isSupabaseServiceRestrictedError\(error\)/);
  assert.match(login, /SUPABASE_EGRESS_RESTRICTION_MESSAGE/);
  assert.match(login, /系統服務暫時中斷/);
});

test("station data uses one shared provider and skips backend traffic while signed out", async () => {
  const [app, projectProvider, unifiedData] = await Promise.all([
    readFile(appUrl, "utf8"),
    readFile(projectProviderUrl, "utf8"),
    readFile(unifiedDataUrl, "utf8"),
  ]);

  assert.match(unifiedData, /export function UnifiedDataProvider/);
  assert.match(unifiedData, /createContext/);
  assert.match(unifiedData, /if \(!user \|\| !activeProjectId\)/);
  assert.match(projectProvider, /if \(!user\)/);
  assert.match(projectProvider, /isSupabaseServiceRestrictedError\(error\)/);
  assert.match(unifiedData, /isSupabaseServiceRestrictedError\(error\)/);
  assert.match(app, /<UnifiedDataProvider>/);
});

test("50-user mode avoids duplicate presence and notification subscriptions", async () => {
  const [app, index, presence, notifications] = await Promise.all([
    readFile(appUrl, "utf8"),
    readFile(indexUrl, "utf8"),
    readFile(presenceUrl, "utf8"),
    readFile(notificationsUrl, "utf8"),
  ]);

  assert.match(presence, /createContext/);
  assert.match(presence, /export function UserPresenceProvider/);
  assert.match(app, /<UserPresenceProvider>/);
  assert.doesNotMatch(index, /<FacebookStyleNotifications/);
  assert.match(notifications, /filter: `project_id=eq\.\$\{activeProjectId\}`/);
});

test("login retries short network interruptions but never retries rejected credentials", async () => {
  const { runLoginWithTransientRetry } = await import(loginRetryPolicyUrl.href);
  let transientAttempts = 0;
  const recovered = await runLoginWithTransientRetry(
    async () => {
      transientAttempts += 1;
      return transientAttempts < 3
        ? { data: null, error: { message: "Failed to fetch" } }
        : { data: [{ success: true }], error: null };
    },
    { delayMs: 0 },
  );

  assert.equal(transientAttempts, 3);
  assert.equal(recovered.error, null);

  let credentialAttempts = 0;
  const rejected = await runLoginWithTransientRetry(
    async () => {
      credentialAttempts += 1;
      return { data: [{ success: false }], error: null };
    },
    { delayMs: 0 },
  );

  assert.equal(credentialAttempts, 1);
  assert.equal(rejected.data[0].success, false);
});
