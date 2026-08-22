import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseSchema = Deno.env.get("SUPABASE_DB_SCHEMA") ?? "public";

const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const accountEmail = (systemUserId: string) =>
  `account-${systemUserId}@auth.station-status.example.com`;

const allowedRoles = new Set(["viewer", "engineer", "admin", "super_admin"]);
const allowedStatuses = new Set(["active", "inactive"]);

type AdminClient = ReturnType<typeof createClient>;
type AccountAction = "create" | "update" | "sync" | "delete";
const TEST_PLAN_STORAGE_BUCKET = "test-plan-files";
const STORAGE_REMOVE_BATCH_SIZE = 100;

interface SystemUserRecord {
  id: string;
  username: string;
  role: string;
  display_name: string | null;
  status: string;
  auth_user_id: string | null;
  password_hash?: string;
  permissions?: unknown;
}

interface ProfileInput {
  username?: string;
  role?: string;
  status?: string;
  displayName?: string;
  permissions?: unknown;
}

interface AccountCleanupRecord {
  owner_id: string;
  auth_user_id: string | null;
  storage_paths: string[] | null;
}

function isMissingAuthUserError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { message?: unknown; status?: unknown };
  return candidate.status === 404
    || (
      typeof candidate.message === "string"
      && /not found|does not exist/i.test(candidate.message)
    );
}

async function recordCleanupError(
  admin: AdminClient,
  ownerId: string,
  error: unknown,
) {
  const message = error instanceof Error ? error.message : String(error);
  await admin
    .from("test_plan_account_cleanup_queue")
    .update({ last_error: message.slice(0, 1000) })
    .eq("owner_id", ownerId);
}

async function cleanupQueuedAccount(
  admin: AdminClient,
  ownerId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("test_plan_account_cleanup_queue")
    .select("owner_id,auth_user_id,storage_paths")
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw new Error("Unable to load queued account cleanup");
  if (!data) return false;

  const cleanup = data as AccountCleanupRecord;
  try {
    const paths = Array.isArray(cleanup.storage_paths)
      ? cleanup.storage_paths.filter((path): path is string => typeof path === "string")
      : [];
    for (let index = 0; index < paths.length; index += STORAGE_REMOVE_BATCH_SIZE) {
      const { error: storageError } = await admin.storage
        .from(TEST_PLAN_STORAGE_BUCKET)
        .remove(paths.slice(index, index + STORAGE_REMOVE_BATCH_SIZE));
      if (storageError) throw new Error(`Storage cleanup failed: ${storageError.message}`);
    }

    if (cleanup.auth_user_id) {
      const { error: authError } = await admin.auth.admin.deleteUser(cleanup.auth_user_id);
      if (authError && !isMissingAuthUserError(authError)) {
        throw new Error(`Auth cleanup failed: ${authError.message}`);
      }
    }

    const { error: storageQueueDeleteError } = await admin
      .from("test_plan_storage_cleanup_queue")
      .delete()
      .eq("owner_id", ownerId);
    if (storageQueueDeleteError) {
      throw new Error("Unable to clear Test_Plan storage cleanup queue");
    }

    const { error: queueDeleteError } = await admin
      .from("test_plan_account_cleanup_queue")
      .delete()
      .eq("owner_id", ownerId);
    if (queueDeleteError) throw new Error("Unable to complete queued account cleanup");
    return true;
  } catch (error) {
    await recordCleanupError(admin, ownerId, error);
    throw error;
  }
}

async function drainQueuedAccountCleanups(
  admin: AdminClient,
  excludedOwnerId = "",
) {
  const { data, error } = await admin
    .from("test_plan_account_cleanup_queue")
    .select("owner_id")
    .order("queued_at", { ascending: true })
    .limit(10);
  if (error) {
    console.warn("Unable to inspect pending Test_Plan cleanup", error);
    return;
  }

  for (const row of data ?? []) {
    if (row.owner_id === excludedOwnerId) continue;
    try {
      await cleanupQueuedAccount(admin, row.owner_id);
    } catch (cleanupError) {
      console.error("Deferred Test_Plan cleanup remains queued", cleanupError);
    }
  }
}

function readProfile(value: unknown): ProfileInput {
  if (!value || typeof value !== "object") return {};
  const input = value as Record<string, unknown>;
  return {
    username: typeof input.username === "string" ? input.username.trim() : undefined,
    role: typeof input.role === "string" ? input.role : undefined,
    status: typeof input.status === "string" ? input.status : undefined,
    displayName: typeof input.displayName === "string" ? input.displayName.trim() : undefined,
    permissions:
      input.permissions && typeof input.permissions === "object" ? input.permissions : undefined,
  };
}

function validateProfile(profile: ProfileInput, requireComplete = false) {
  if (requireComplete && (!profile.username || !profile.role || !profile.displayName)) {
    return "Username, role and display name are required";
  }
  if (profile.username !== undefined && (!profile.username || profile.username.length > 50)) {
    return "Invalid username";
  }
  if (profile.displayName !== undefined && (!profile.displayName || profile.displayName.length > 100)) {
    return "Invalid display name";
  }
  if (profile.role !== undefined && !allowedRoles.has(profile.role)) return "Invalid role";
  if (profile.status !== undefined && !allowedStatuses.has(profile.status)) return "Invalid status";
  return null;
}

function authAttributes(target: SystemUserRecord, password = "") {
  const attributes: Record<string, unknown> = {
    email: accountEmail(target.id),
    ban_duration: target.status === "active" ? "none" : "876000h",
    app_metadata: {
      system_user_id: target.id,
      username: target.username,
      role: target.role,
      display_name: target.display_name ?? target.username,
    },
  };
  if (password) attributes.password = password;
  return attributes;
}

async function synchronizeAuthIdentity(
  admin: AdminClient,
  target: SystemUserRecord,
  password = "",
) {
  if (target.auth_user_id) {
    const { error } = await admin.auth.admin.updateUserById(
      target.auth_user_id,
      authAttributes(target, password),
    );
    if (error) throw new Error("Auth account sync failed");
    return { migrated: true, deferred: false, authUserId: target.auth_user_id };
  }

  if (!password) {
    // The legacy password is intentionally one-way. The identity is created
    // safely on the next successful login when the plaintext password exists.
    return { migrated: false, deferred: true, authUserId: null };
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: accountEmail(target.id),
    password,
    email_confirm: true,
    ban_duration: target.status === "active" ? "none" : "876000h",
    app_metadata: {
      system_user_id: target.id,
      username: target.username,
      role: target.role,
      display_name: target.display_name ?? target.username,
    },
  });
  if (createError || !created.user) throw new Error("Auth account creation failed");

  const authUserId = created.user.id;
  const { data: linked, error: linkError } = await admin
    .from("system_users")
    .update({ auth_user_id: authUserId, auth_migrated_at: new Date().toISOString() })
    .eq("id", target.id)
    .is("auth_user_id", null)
    .select("auth_user_id")
    .maybeSingle();
  if (linkError || linked?.auth_user_id !== authUserId) {
    await admin.auth.admin.deleteUser(authUserId).catch(() => undefined);
    throw new Error("Auth account link failed");
  }

  return { migrated: true, deferred: false, authUserId };
}

serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return respond({ success: false }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const authorization = request.headers.get("Authorization") ?? "";
    if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization) {
      return respond({ success: false, error: "Unauthorized" }, 401);
    }

    const caller = createClient(supabaseUrl, anonKey, {
      db: { schema: supabaseSchema },
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const [callerResult, permissionResult] = await Promise.all([
      caller.rpc("get_current_system_user"),
      caller.rpc("can_manage_system_users"),
    ]);
    const { data: callerRows, error: callerError } = callerResult;
    const { data: canManageUsers, error: permissionError } = permissionResult;
    const callerProfile = Array.isArray(callerRows) ? callerRows[0] : null;
    if (
      callerError ||
      permissionError ||
      !callerProfile ||
      canManageUsers !== true
    ) {
      return respond({ success: false, error: "Administrator permission required" }, 403);
    }

    const body = await request.json().catch(() => ({}));
    const targetUserId = typeof body?.userId === "string" ? body.userId : "";
    const requestedAction = typeof body?.action === "string" ? body.action : "sync";
    const action: AccountAction = ["create", "update", "sync", "delete"].includes(requestedAction)
      ? requestedAction as AccountAction
      : "sync";
    const password = typeof body?.password === "string" ? body.password : "";
    const profile = readProfile(body?.profile);
    const profileError = validateProfile(profile, action === "create");
    if (profileError || password.length > 200 || (password && password.length < 6)) {
      return respond({ success: false, error: profileError ?? "Invalid password" }, 400);
    }
    if (action !== "create" && !targetUserId) {
      return respond({ success: false, error: "Invalid request" }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      db: { schema: supabaseSchema },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await drainQueuedAccountCleanups(
      admin,
      action === "delete" ? targetUserId : "",
    );

    if (action === "create") {
      if (!password) return respond({ success: false, error: "Password is required" }, 400);
      const { data: passwordHash, error: hashError } = await admin.rpc("hash_password", {
        password,
      });
      if (hashError || typeof passwordHash !== "string") {
        return respond({ success: false, error: "Password hashing failed" }, 503);
      }

      const { data: createdUser, error: createError } = await admin
        .from("system_users")
        .insert({
          username: profile.username,
          password_hash: passwordHash,
          role: profile.role,
          permissions: profile.permissions ?? {},
          display_name: profile.displayName,
          status: profile.status ?? "active",
          created_by: callerProfile.username,
        })
        .select("id,username,role,display_name,status,auth_user_id")
        .single();
      if (createError || !createdUser) {
        return respond({ success: false, error: "System account creation failed" }, 409);
      }

      try {
        const authResult = await synchronizeAuthIdentity(admin, createdUser, password);
        return respond({ success: true, userId: createdUser.id, ...authResult });
      } catch (error) {
        await admin.from("system_users").delete().eq("id", createdUser.id);
        console.error("Unable to create synchronized account", error);
        return respond({ success: false, error: "Synchronized account creation failed" }, 503);
      }
    }

    const { data: target, error: targetError } = await admin
      .from("system_users")
      .select("id,username,role,display_name,status,auth_user_id,password_hash,permissions")
      .eq("id", targetUserId)
      .maybeSingle();
    if (targetError) {
      return respond({ success: false, error: "Account lookup failed" }, 503);
    }

    if (action === "delete") {
      if (!target) {
        try {
          const cleaned = await cleanupQueuedAccount(admin, targetUserId);
          return cleaned
            ? respond({ success: true, recoveredCleanup: true })
            : respond({ success: false, error: "Account not found" }, 404);
        } catch (error) {
          console.error("Queued account cleanup retry failed", error);
          return respond({ success: false, error: "Account cleanup is still queued" }, 503);
        }
      }

      const { error: deleteSystemError } = await admin
        .from("system_users")
        .delete()
        .eq("id", targetUserId);
      if (deleteSystemError) {
        return respond({ success: false, error: "System account delete failed" }, 503);
      }
      try {
        await cleanupQueuedAccount(admin, targetUserId);
        return respond({ success: true });
      } catch (error) {
        console.error("Account removed with deferred Test_Plan cleanup", error);
        return respond(
          {
            success: false,
            error: "Account removed; file cleanup is queued for retry",
          },
          503,
        );
      }
    }

    if (!target) return respond({ success: false, error: "Account not found" }, 404);

    if (action === "update") {
      const updateData: Record<string, unknown> = {};
      if (profile.username !== undefined) updateData.username = profile.username;
      if (profile.role !== undefined) updateData.role = profile.role;
      if (profile.status !== undefined) updateData.status = profile.status;
      if (profile.displayName !== undefined) updateData.display_name = profile.displayName;
      if (profile.permissions !== undefined) updateData.permissions = profile.permissions;
      if (password) {
        const { data: passwordHash, error: hashError } = await admin.rpc("hash_password", {
          password,
        });
        if (hashError || typeof passwordHash !== "string") {
          return respond({ success: false, error: "Password hashing failed" }, 503);
        }
        updateData.password_hash = passwordHash;
      }

      const { data: updatedTarget, error: updateError } = await admin
        .from("system_users")
        .update(updateData)
        .eq("id", targetUserId)
        .select("id,username,role,display_name,status,auth_user_id")
        .single();
      if (updateError || !updatedTarget) {
        return respond({ success: false, error: "System account update failed" }, 503);
      }

      try {
        const authResult = await synchronizeAuthIdentity(admin, updatedTarget, password);
        return respond({ success: true, ...authResult });
      } catch (error) {
        await admin
          .from("system_users")
          .update({
            username: target.username,
            role: target.role,
            display_name: target.display_name,
            status: target.status,
            password_hash: target.password_hash,
            permissions: target.permissions,
          })
          .eq("id", target.id);
        console.error("Unable to update synchronized account", error);
        return respond({ success: false, error: "Synchronized account update failed" }, 503);
      }
    }

    try {
      const authResult = await synchronizeAuthIdentity(admin, target, password);
      return respond({ success: true, ...authResult });
    } catch (error) {
      console.error("Unable to synchronize account", error);
      return respond({ success: false, error: "Auth account sync failed" }, 503);
    }
  } catch (error) {
    console.error("Unexpected account-admin-sync error", error);
    return respond({ success: false, error: "Account sync is unavailable" }, 503);
  }
});
