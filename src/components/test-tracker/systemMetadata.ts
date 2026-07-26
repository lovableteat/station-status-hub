export type SystemFieldType = "text" | "number" | "boolean" | "select";

export interface SystemFieldDefinition {
  field_key: string;
  field_type: SystemFieldType;
  options?: unknown;
}

function getSelectOptions(options: unknown) {
  return Array.isArray(options) && options.every((option) => typeof option === "string")
    ? options
    : [];
}

export function parseSystemFieldValue(field: SystemFieldDefinition, value: unknown) {
  switch (field.field_type) {
    case "text":
      return typeof value === "string" ? value : "";
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? value : "";
    case "boolean":
      return value === true;
    case "select":
      return typeof value === "string" && getSelectOptions(field.options).includes(value)
        ? value
        : "";
  }
}

export function serializeSystemFieldValue(field: SystemFieldDefinition, value: unknown) {
  switch (field.field_type) {
    case "text": {
      const text = typeof value === "string" ? value.trim() : "";
      return text || null;
    }
    case "number": {
      if (typeof value === "string" && !value.trim()) return null;
      const number = typeof value === "number" ? value : Number(value);
      return Number.isFinite(number) ? number : null;
    }
    case "boolean":
      return value === true;
    case "select":
      return typeof value === "string" && getSelectOptions(field.options).includes(value)
        ? value
        : null;
  }
}

export function validateSystemFieldDefinition(field: SystemFieldDefinition) {
  if (field.field_type !== "select") return {};

  const options = field.options;
  if (!Array.isArray(options) || options.length === 0) {
    return { options: "Select fields require at least one option." };
  }

  const normalized = options.map((option) => typeof option === "string" ? option.trim() : null);
  if (
    normalized.some((option) => !option)
    || new Set(normalized).size !== normalized.length
  ) {
    return { options: "Select options must be unique non-blank strings." };
  }

  return {};
}

export function toLegacySystemPatch(fieldKey: string, value: unknown) {
  switch (fieldKey) {
    case "bom_90":
      return { bom_90: value as string | null };
    case "ubuntu_version":
      return { ubuntu_version: value as string | null };
    case "cuda_version":
      return { cuda_version: value as string | null };
    case "include_in_dashboard":
      return { exclude_from_dashboard: value !== true };
    default:
      return {};
  }
}
