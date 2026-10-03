import type { Json } from "@/integrations/supabase/types";

/** Notification metadata is JSON at the API boundary, not always an object. */
export function normalizeNotificationMetadata<T extends { metadata?: Json }>(notification: T): Omit<T, "metadata"> & {
  metadata: { [key: string]: Json | undefined; issue_title?: string };
} {
  const { metadata: value, ...fields } = notification;
  const metadata = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    ...fields,
    metadata: {
      ...metadata,
      issue_title: typeof metadata.issue_title === "string" ? metadata.issue_title : undefined,
    },
  };
}
