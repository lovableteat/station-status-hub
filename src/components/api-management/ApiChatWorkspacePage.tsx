import { useEffect, useMemo, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

import { ApiChatConsole } from "./ApiChatConsole";
import { ApiKeyRecord, normalizeApiKeyPermissions } from "./apiKeyHelpers";

function looksLikeImageModel(model?: string | null) {
  return /image|nano banana/i.test(model ?? "");
}

export function ApiChatWorkspacePage() {
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>([]);
  const [selectedApiKeyId, setSelectedApiKeyId] = useState<null | string>(null);

  useEffect(() => {
    const loadApiKeys = async () => {
      try {
        const { data, error } = await supabase
          .from("api_keys")
          .select("*")
          .eq("is_active", true)
          .order("created_at", { ascending: false });

        if (error) throw error;

        const availableKeys = ((data ?? []) as ApiKeyRecord[]).filter((record) => {
          const metadata = normalizeApiKeyPermissions(record.permissions).metadata;
          return (
            metadata.provider.trim().toLowerCase() === "gemini" &&
            Boolean(metadata.model.trim()) &&
            Boolean(metadata.baseUrl.trim())
          );
        });

        setApiKeys(
          availableKeys.sort((left, right) => {
            const leftImage = looksLikeImageModel(
              normalizeApiKeyPermissions(left.permissions).metadata.model
            );
            const rightImage = looksLikeImageModel(
              normalizeApiKeyPermissions(right.permissions).metadata.model
            );

            if (leftImage === rightImage) return 0;
            return leftImage ? -1 : 1;
          })
        );
      } catch (error) {
        console.error("Failed to load API chat keys:", error);
        setApiKeys([]);
      }
    };

    void loadApiKeys();
  }, []);

  useEffect(() => {
    if (!apiKeys.length) {
      setSelectedApiKeyId(null);
      return;
    }

    setSelectedApiKeyId((current) =>
      current && apiKeys.some((item) => item.id === current) ? current : apiKeys[0].id
    );
  }, [apiKeys]);

  const selectedApiKey = useMemo(
    () => apiKeys.find((item) => item.id === selectedApiKeyId) ?? apiKeys[0] ?? null,
    [apiKeys, selectedApiKeyId]
  );

  return (
    <div className="min-h-[calc(100dvh-132px)] w-full px-3 py-3 md:px-5 md:py-4">
      <ApiChatConsole
        selectedApiKey={selectedApiKey}
        availableApiKeys={apiKeys}
        selectedApiKeyId={selectedApiKeyId}
        onSelectApiKey={setSelectedApiKeyId}
        mode="chat-only"
      />
    </div>
  );
}
