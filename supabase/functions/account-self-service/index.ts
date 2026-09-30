import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const schema = Deno.env.get("APP_DB_SCHEMA") ?? "workspace";
const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return respond({ success: false, error: "Method not allowed" }, 405);

  const authorization = request.headers.get("Authorization") ?? "";
  const accessToken = /^Bearer\s+(.+)$/i.exec(authorization)?.[1] ?? "";
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!accessToken || !url || !anonKey || !serviceKey) {
    return respond({ success: false, error: "Unauthorized" }, 401);
  }

  try {
    const caller = createClient(url, anonKey, {
      db: { schema },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    // Never accept a user id from the request body. Resolve the account from a
    // verified Auth user and its server-side system_users link instead.
    const { data: verified, error: verificationError } = await caller.auth.getUser(accessToken);
    if (verificationError || !verified.user) {
      return respond({ success: false, error: "Unauthorized" }, 401);
    }

    const body = await request.json().catch(() => ({}));
    const username = typeof body?.username === "string" ? body.username.trim() : "";
    const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";
    if (!username || username.length > 50) {
      return respond({ success: false, error: "Invalid username" }, 400);
    }
    if (!currentPassword || currentPassword.length > 200) {
      return respond({ success: false, error: "Current password required" }, 400);
    }
    if (newPassword && (newPassword.length < 6 || newPassword.length > 200)) {
      return respond({ success: false, error: "Invalid new password" }, 400);
    }
    if (newPassword && newPassword === currentPassword) {
      return respond({ success: false, error: "New password unchanged" }, 400);
    }

    const admin = createClient(url, serviceKey, {
      db: { schema },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: account, error: accountError } = await admin
      .from("system_users")
      .select("id,username,display_name,password_hash,auth_user_id,status")
      .eq("auth_user_id", verified.user.id)
      .eq("status", "active")
      .maybeSingle();
    if (accountError || !account) {
      return respond({ success: false, error: "Account unavailable" }, 403);
    }

    // Older clients omit displayName; preserve their existing profile name.
    const displayName = body?.displayName === undefined
      ? account.display_name ?? account.username
      : typeof body.displayName === "string" ? body.displayName.trim() : "";
    if (!displayName || displayName.length > 100) {
      return respond({ success: false, error: "Invalid display name" }, 400);
    }

    const { data: passwordMatches, error: passwordError } = await admin
      .schema("public")
      .rpc("verify_password", { password: currentPassword, hash: account.password_hash });
    if (passwordError) {
      console.error("Unable to verify current password", passwordError);
      return respond({ success: false, error: "Account service unavailable" }, 503);
    }
    if (passwordMatches !== true) {
      return respond({ success: false, error: "Current password incorrect" }, 401);
    }
    if (username === account.username && displayName === (account.display_name ?? account.username) && !newPassword) {
      return respond({ success: false, error: "No changes" }, 400);
    }

    let nextHash = account.password_hash as string;
    if (newPassword) {
      const { data: hashed, error: hashError } = await admin
        .schema("public")
        .rpc("hash_password", { password: newPassword });
      if (hashError || typeof hashed !== "string") {
        console.error("Unable to hash new password", hashError);
        return respond({ success: false, error: "Account service unavailable" }, 503);
      }
      nextHash = hashed;
    }

    // Compare both original values so an administrator's concurrent edit is
    // never silently overwritten by this request.
    let updateQuery = admin
      .from("system_users")
      .update({ username, display_name: displayName, password_hash: nextHash })
      .eq("id", account.id)
      .eq("username", account.username)
      .eq("password_hash", account.password_hash);
    updateQuery = account.display_name === null
      ? updateQuery.is("display_name", null)
      : updateQuery.eq("display_name", account.display_name);
    const { data: updated, error: updateError } = await updateQuery
      .select("id,username,display_name")
      .maybeSingle();
    if (updateError) {
      if (updateError.code === "23505") {
        return respond({ success: false, error: "Username taken" }, 409);
      }
      console.error("Unable to update own system account", updateError);
      return respond({ success: false, error: "Account service unavailable" }, 503);
    }
    if (!updated) {
      return respond({ success: false, error: "Account changed elsewhere" }, 409);
    }

    const attributes: { password?: string; app_metadata: Record<string, unknown> } = {
      app_metadata: { ...verified.user.app_metadata, username, display_name: displayName },
    };
    if (newPassword) attributes.password = newPassword;
    const { error: authError } = await admin.auth.admin.updateUserById(
      verified.user.id,
      attributes,
    );
    if (authError) {
      // The legacy account table is the source of truth at login. Restore it
      // when the Auth identity update fails, so the old credentials still work.
      const { data: rolledBack, error: rollbackError } = await admin
        .from("system_users")
        .update({ username: account.username, display_name: account.display_name, password_hash: account.password_hash })
        .eq("id", account.id)
        .eq("username", username)
        .eq("password_hash", nextHash)
        .eq("display_name", displayName)
        .select("id")
        .maybeSingle();
      console.error("Unable to synchronize own Auth identity", authError);
      if (rollbackError || !rolledBack) {
        console.error("Own account rollback needs attention", rollbackError);
      }
      return respond({ success: false, error: "Account sync failed" }, 503);
    }

    return respond({ success: true, username: updated.username, displayName: updated.display_name });
  } catch (error) {
    console.error("Unexpected account-self-service error", error);
    return respond({ success: false, error: "Account service unavailable" }, 503);
  }
});
