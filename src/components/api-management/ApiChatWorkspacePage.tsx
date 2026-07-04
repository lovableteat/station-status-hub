import { useEffect, useMemo, useState } from "react";
import { MessageSquareText, Sparkles } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

import { ApiChatConsole } from "./ApiChatConsole";
import { ApiKeyRecord, normalizeApiKeyPermissions } from "./apiKeyHelpers";

export function ApiChatWorkspacePage() {
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>([]);
  const [selectedKeyId, setSelectedKeyId] = useState<string>("manual");
  const [loading, setLoading] = useState(true);

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

        setApiKeys(availableKeys);
        setSelectedKeyId(availableKeys[0]?.id ?? "manual");
      } catch (error) {
        console.error("Failed to load API chat keys:", error);
        setApiKeys([]);
        setSelectedKeyId("manual");
      } finally {
        setLoading(false);
      }
    };

    void loadApiKeys();
  }, []);

  const selectedApiKey = useMemo(
    () => apiKeys.find((item) => item.id === selectedKeyId) ?? null,
    [apiKeys, selectedKeyId]
  );

  return (
    <div className="space-y-6 p-6">
      <Card className="overflow-hidden rounded-[28px] border border-blue-400/15 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.16),transparent_35%),linear-gradient(180deg,#121b30_0%,#0b1323_100%)]">
        <CardHeader className="border-b border-blue-400/10 pb-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-3">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-400/25 bg-cyan-400/10 text-cyan-200">
                <MessageSquareText className="h-6 w-6" />
              </div>
              <div>
                <CardTitle className="text-3xl font-black tracking-tight text-slate-50">
                  AI 對話
                </CardTitle>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  這裡只做模型對話，不放金鑰管理。你可以直接選擇已儲存的 Gemini API key，
                  或切換成手動模式，自行貼上 API key 與模型設定。
                </p>
              </div>
            </div>

            <div className="w-full max-w-md rounded-2xl border border-blue-400/15 bg-slate-950/25 p-4">
              <div className="space-y-2">
                <Label className="text-sm font-bold text-slate-300">快速選擇 API 金鑰</Label>
                <Select
                  value={selectedKeyId}
                  onValueChange={setSelectedKeyId}
                  disabled={loading}
                >
                  <SelectTrigger className="h-11 border-blue-400/20 bg-[#0b1423] text-slate-100">
                    <SelectValue placeholder={loading ? "載入中..." : "選擇已儲存的 Gemini Key"} />
                  </SelectTrigger>
                  <SelectContent className="border-blue-400/20 bg-[#0f182b] text-slate-100">
                    <SelectItem value="manual">手動模式</SelectItem>
                    {apiKeys.map((record) => {
                      const metadata = normalizeApiKeyPermissions(record.permissions).metadata;
                      return (
                        <SelectItem key={record.id} value={record.id}>
                          {record.key_name} · {metadata.model || "gemini"}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <p className="text-xs leading-6 text-slate-400">
                  {selectedApiKey
                    ? `目前已帶入：${selectedApiKey.key_name}`
                    : "未選擇已儲存金鑰時，可直接在下方手動貼上 API key。"}
                </p>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-5">
          <div className="flex items-center gap-2 rounded-2xl border border-emerald-400/15 bg-emerald-500/8 px-4 py-3 text-sm text-emerald-100">
            <Sparkles className="h-4 w-4" />
            對話模式沿用 API 權限控制；API 管理仍保留在後台。
          </div>
        </CardContent>
      </Card>

      <ApiChatConsole selectedApiKey={selectedApiKey} />
    </div>
  );
}
