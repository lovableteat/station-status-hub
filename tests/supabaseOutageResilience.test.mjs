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
