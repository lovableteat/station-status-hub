import type { Json } from "@/integrations/supabase/types";

export interface ApiKeyMetadata {
  provider: string;
  model: string;
  baseUrl: string;
  editable: boolean;
}

export interface ApiKeyPermissionState {
  read: boolean;
  write: boolean;
  metadata: ApiKeyMetadata;
}

export interface ApiKeyRecord {
  id: string;
  key_name: string;
  api_key: string;
  description: string | null;
  permissions: Json | null;
  is_active: boolean;
  expires_at: string | null;
  last_used_at: string | null;
  usage_count: number | null;
  created_at: string;
}

export const defaultApiKeyMetadata: ApiKeyMetadata = {
  provider: "",
  model: "",
  baseUrl: "",
  editable: true,
};

export function normalizeApiKeyPermissions(value: Json | null | undefined): ApiKeyPermissionState {
  const raw =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, Json | undefined>)
      : {};

  const rawMetadata =
    raw.metadata && typeof raw.metadata === "object" && !Array.isArray(raw.metadata)
      ? (raw.metadata as Record<string, Json | undefined>)
      : {};

  return {
    read: raw.read === undefined ? true : Boolean(raw.read),
    write: Boolean(raw.write),
    metadata: {
      provider: typeof rawMetadata.provider === "string" ? rawMetadata.provider : "",
      model: typeof rawMetadata.model === "string" ? rawMetadata.model : "",
      baseUrl: typeof rawMetadata.baseUrl === "string" ? rawMetadata.baseUrl : "",
      editable: rawMetadata.editable === undefined ? true : Boolean(rawMetadata.editable),
    },
  };
}

export function buildApiKeyPermissions(
  input: Partial<ApiKeyPermissionState>,
): Record<string, Json> {
  const normalizedMetadata = {
    ...defaultApiKeyMetadata,
    ...(input.metadata ?? {}),
  };

  return {
    read: input.read ?? true,
    write: input.write ?? false,
    metadata: {
      provider: normalizedMetadata.provider,
      model: normalizedMetadata.model,
      baseUrl: normalizedMetadata.baseUrl,
      editable: normalizedMetadata.editable,
    },
  };
}
