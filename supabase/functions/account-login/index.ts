import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const accountEmail = (systemUserId: string) =>
  `account-${systemUserId}@auth.station-status.example.com`;

serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return jsonResponse({ success: false, error: "Authentication service is unavailable" }, 503);
    }

    const payload = await request.json().catch(() => ({}));
    const username = typeof payload?.username === "string" ? payload.username.trim() : "";
    const password = typeof payload?.password === "string" ? payload.password : "";
    if (!username || username.length > 50 || !password || password.length > 200) {
      return jsonResponse({ success: false, error: "Invalid credentials" }, 401);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: legacyResult, error: legacyError } = await admin.rpc("authenticate_user", {
      username_input: username,
      password_input: password,
    });
    const verified = Array.isArray(legacyResult) ? legacyResult[0] : null;
    if (legacyError || !verified?.success || !verified.user_id) {
      return jsonResponse({ success: false, error: "Invalid credentials" }, 401);
    }

    const { data: systemUser, error: profileError } = await admin
      .from("system_users")
      .select("id,username,role,display_name,status,auth_user_id")
      .eq("id", verified.user_id)
      .eq("status", "active")
      .single();
    if (profileError || !systemUser) {
      return jsonResponse({ success: false, error: "Account is unavailable" }, 403);
    }

    const email = accountEmail(systemUser.id);
    const appMetadata = {
      system_user_id: systemUser.id,
      username: systemUser.username,
      role: systemUser.role,
      display_name: systemUser.display_name ?? systemUser.username,
    };

    let authUserId = systemUser.auth_user_id as string | null;
    if (!authUserId) {
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: appMetadata,
      });
      if (createError || !created.user) {
        console.error("Unable to migrate account", createError);
        return jsonResponse(
          { success: false, code: "ACCOUNT_CREATE_FAILED", error: "Account migration failed" },
          503,
        );
      }
      authUserId = created.user.id;
      const { data: linkedAccount, error: linkError } = await admin
        .from("system_users")
        .update({ auth_user_id: authUserId, auth_migrated_at: new Date().toISOString() })
        .eq("id", systemUser.id)
        .is("auth_user_id", null)
        .select("auth_user_id")
        .maybeSingle();
      if (linkError || linkedAccount?.auth_user_id !== authUserId) {
        await admin.auth.admin.deleteUser(authUserId).catch(() => undefined);
        console.error("Unable to link migrated account", linkError);
        return jsonResponse(
          { success: false, code: "ACCOUNT_LINK_FAILED", error: "Account migration failed" },
          503,
        );
      }
    } else {
      const { error: updateError } = await admin.auth.admin.updateUserById(authUserId, {
        password,
        email,
        app_metadata: appMetadata,
      });
      if (updateError) {
        console.error("Unable to synchronize account", updateError);
        return jsonResponse(
          { success: false, code: "ACCOUNT_SYNC_FAILED", error: "Account synchronization failed" },
          503,
        );
      }
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: sessionData, error: signInError } = await authClient.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError || !sessionData.session) {
      console.error("Unable to establish account session", signInError);
      return jsonResponse(
        { success: false, code: "SESSION_FAILED", error: "Unable to establish session" },
        503,
      );
    }

    await admin
      .from("system_users")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", systemUser.id);

    return jsonResponse({
      success: true,
      session: sessionData.session,
      system_user: {
        user_id: systemUser.id,
        username: systemUser.username,
        role: systemUser.role,
        display_name: systemUser.display_name ?? systemUser.username,
      },
    });
  } catch (error) {
    console.error("Unexpected account-login error", error);
    return jsonResponse({ success: false, error: "Authentication service is unavailable" }, 503);
  }
});
