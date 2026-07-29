import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

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
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: callerRows, error: callerError } = await caller.rpc("get_current_system_user");
    const callerProfile = Array.isArray(callerRows) ? callerRows[0] : null;
    if (
      callerError ||
      !callerProfile ||
      !["admin", "super_admin"].includes(callerProfile.role)
    ) {
      return respond({ success: false, error: "Administrator permission required" }, 403);
    }

    const body = await request.json().catch(() => ({}));
    const targetUserId = typeof body?.userId === "string" ? body.userId : "";
    const action = body?.action === "delete" ? "delete" : "sync";
    const password = typeof body?.password === "string" ? body.password : "";
    const targetAuthUserId = typeof body?.authUserId === "string" ? body.authUserId : "";
    if (!targetUserId || password.length > 200) {
      return respond({ success: false, error: "Invalid request" }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (action === "delete") {
      if (targetAuthUserId) {
        const { error: deleteError } = await admin.auth.admin.deleteUser(targetAuthUserId);
        if (deleteError) return respond({ success: false, error: "Auth account delete failed" }, 503);
      }
      return respond({ success: true });
    }

    const { data: target, error: targetError } = await admin
      .from("system_users")
      .select("id,username,role,display_name,status,auth_user_id")
      .eq("id", targetUserId)
      .single();
    if (targetError || !target) return respond({ success: false, error: "Account not found" }, 404);

    if (!target.auth_user_id) {
      // A legacy-only account will be created by account-login on first use.
      return respond({ success: true, migrated: false });
    }

    const attributes: Record<string, unknown> = {
      email: `account-${target.id}@station-status.local`,
      ban_duration: target.status === "active" ? "none" : "876000h",
      app_metadata: {
        system_user_id: target.id,
        username: target.username,
        role: target.role,
        display_name: target.display_name ?? target.username,
      },
    };
    if (password) attributes.password = password;

    const { error: updateError } = await admin.auth.admin.updateUserById(
      target.auth_user_id,
      attributes,
    );
    if (updateError) return respond({ success: false, error: "Auth account sync failed" }, 503);
    return respond({ success: true, migrated: true });
  } catch (error) {
    console.error("Unexpected account-admin-sync error", error);
    return respond({ success: false, error: "Account sync is unavailable" }, 503);
  }
});
