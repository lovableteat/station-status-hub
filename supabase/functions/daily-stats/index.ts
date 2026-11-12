import { createClient } from "npm:@supabase/supabase-js@2.100.0";
import { isServiceRequest } from "./authorization.ts";

const supabaseSchema = Deno.env.get("APP_DB_SCHEMA") ?? "workspace";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status: number) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  if (!serviceKey || !url) return json({ error: "Service unavailable" }, 503);
  if (!await isServiceRequest(request, serviceKey)) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const client = createClient(url, serviceKey, {
      db: { schema: supabaseSchema },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await client.rpc("calculate_daily_production_stats");
    if (error) {
      console.error("daily-stats calculation failed", error.code);
      return json({ error: "Calculation failed" }, 500);
    }
    return json({
      success: true,
      message: "Daily production stats calculated successfully",
      timestamp: new Date().toISOString(),
    }, 200);
  } catch {
    return json({ error: "Internal server error" }, 500);
  }
});
