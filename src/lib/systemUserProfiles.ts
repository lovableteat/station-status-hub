import { supabase } from "@/integrations/supabase/client";
import type { SystemUserProfile } from "@/integrations/supabase/types";

// The RPC returns the established roster shape, not a table composite. The
// database removes the legacy PCB key; client validation is only a drift guard.
export const SYSTEM_USER_PROFILE_COLUMNS = "id,username,display_name,role,status,permissions,created_by,created_at,updated_at,registration_requested_at,approved_at,approved_by,auth_user_id,auth_migrated_at,last_seen_at,avatar_path";
const columns = SYSTEM_USER_PROFILE_COLUMNS.split(",");
const requiredStrings = new Set(["id", "username", "role", "created_at", "updated_at"]);

export function validateSystemUserProfile(value: unknown): SystemUserProfile {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid sanitized account profile response");
  }
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== columns.length || columns.some(column => !Object.prototype.hasOwnProperty.call(row, column))) {
    throw new Error("Invalid sanitized account profile columns");
  }
  for (const column of columns) {
    if (column === "permissions") continue;
    if (typeof row[column] !== "string" && (requiredStrings.has(column) || row[column] !== null)) {
      throw new Error("Invalid sanitized account profile field");
    }
  }
  const permissions = row.permissions;
  if (permissions === undefined || typeof permissions === "function" || typeof permissions === "symbol") {
    throw new Error("Invalid sanitized account permissions response");
  }
  if (permissions && typeof permissions === "object" && !Array.isArray(permissions)
    && Object.prototype.hasOwnProperty.call(permissions, "pcbDesignerWorkspace")) {
    throw new Error("Unsafe account profile response");
  }
  return value as SystemUserProfile;
}

export async function readSystemUserProfile(userId: string) {
  const result = await supabase.schema("workspace")
    .rpc("list_system_user_profiles")
    .eq("id", userId)
    .maybeSingle();
  if (result.error || result.data === null) return result;
  const data = validateSystemUserProfile(result.data);
  if (data.id !== userId) throw new Error("Account profile identity mismatch");
  return { ...result, data };
}

export async function listSystemUserProfiles() {
  const result = await supabase.schema("workspace")
    .rpc("list_system_user_profiles")
    .order("created_at", { ascending: false });
  if (result.error) return result;
  if (!Array.isArray(result.data)) throw new Error("Invalid sanitized account roster response");
  const data = result.data.map(validateSystemUserProfile);
  if (new Set(data.map(row => row.id)).size !== data.length) throw new Error("Duplicate account profile response");
  return { ...result, data };
}
