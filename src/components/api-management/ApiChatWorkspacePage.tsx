import { useEffect, useMemo, useState } from "react";
import {
  ImageIcon,
  KeyRound,
  MessageSquareText,
  PanelRight,
  Sparkles,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

import { ApiChatConsole } from "./ApiChatConsole";
import { ApiKeyRecord, normalizeApiKeyPermissions } from "./apiKeyHelpers";

export function ApiChatWorkspacePage() {
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>([]);

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
      } catch (error) {
        console.error("Failed to load API chat keys:", error);
        setApiKeys([]);
      }
    };

    void loadApiKeys();
  }, []);

  const selectedApiKey = useMemo(() => apiKeys[0] ?? null, [apiKeys]);
  const selectedMetadata = useMemo(
    () =>
      selectedApiKey
        ? normalizeApiKeyPermissions(selectedApiKey.permissions).metadata
        : null,
    [selectedApiKey]
  );

  return (
    <div className="p-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Card className="overflow-hidden rounded-[28px] border border-cyan-400/12 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.12),transparent_28%),linear-gradient(180deg,#121c31_0%,#0a1220_100%)] shadow-[0_24px_70px_rgba(2,8,23,0.28)]">
            <CardContent className="px-6 py-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-3">
                  <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/18 bg-cyan-400/10 px-3 py-1 text-xs font-bold tracking-[0.2em] text-cyan-100">
                    <Sparkles className="h-3.5 w-3.5" />
                    AI SPACE
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="mt-1 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/18 bg-cyan-400/8 text-cyan-100">
                      <MessageSquareText className="h-6 w-6" />
                    </div>
                    <div>
                      <h1 className="text-3xl font-black tracking-tight text-slate-50">
                        AI 對話空間
                      </h1>
                      <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-300">
                        這一頁只保留對話本身，讓畫面重心放在聊天與生成結果。API key、provider、
                        model、base URL、system prompt 等設定統一留在後台 `API 控制台`。
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/8 bg-[#0b1423] px-4 py-4">
                    <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">
                      Current key
                    </p>
                    <p className="mt-2 text-base font-black text-slate-50">
                      {selectedApiKey?.key_name || "尚未啟用 Gemini Key"}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-slate-400">
                      工作區直接使用後台目前啟用的 Gemini 設定。
                    </p>
                  </div>
                  <div className="rounded-2xl border border-emerald-400/14 bg-emerald-500/8 px-4 py-4">
                    <p className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-100/80">
                      Workspace mode
                    </p>
                    <p className="mt-2 text-base font-black text-emerald-50">純對話入口</p>
                    <p className="mt-2 text-xs leading-5 text-emerald-100/85">
                      其他資訊全部移到右側，不佔對話區。
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <ApiChatConsole selectedApiKey={selectedApiKey} mode="chat-only" />
        </div>

        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <Card className="rounded-[28px] border border-cyan-400/12 bg-[linear-gradient(180deg,#132238_0%,#0b1423_100%)] shadow-[0_18px_48px_rgba(2,8,23,0.22)]">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-black text-slate-50">目前對話來源</p>
                  <p className="mt-1 text-xs leading-6 text-slate-400">
                    這裡只顯示來源，修改設定請回後台。
                  </p>
                </div>
                <div className="rounded-full border border-cyan-400/18 bg-cyan-400/10 px-3 py-1 text-xs font-bold text-cyan-100">
                  {apiKeys.length} 個可用
                </div>
              </div>

              <div className="space-y-3">
                <div className="rounded-2xl border border-white/8 bg-[#0a1220] px-4 py-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">
                    Provider
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-100">
                    {selectedMetadata?.provider || "gemini"}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/8 bg-[#0a1220] px-4 py-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">
                    Model
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-100">
                    {selectedMetadata?.model || "未設定"}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/8 bg-[#0a1220] px-4 py-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">
                    狀態
                  </p>
                  <p className="mt-2 text-sm font-semibold text-emerald-200">
                    {selectedApiKey ? "已可直接對話" : "尚未啟用 Gemini Key"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border border-white/8 bg-[#0f1729] shadow-[0_18px_48px_rgba(2,8,23,0.18)]">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-400/18 bg-cyan-400/8 text-cyan-100">
                  <PanelRight className="h-4.5 w-4.5" />
                </div>
                <div>
                  <p className="text-sm font-black text-slate-50">側欄資訊</p>
                  <p className="text-xs leading-5 text-slate-400">把雜項收進這裡，不壓縮聊天區。</p>
                </div>
              </div>

              <div className="grid gap-3">
                <div className="rounded-2xl border border-white/8 bg-[#0a1220] px-4 py-3">
                  <p className="text-sm font-bold text-slate-100">連續對話</p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">
                    對話視窗保留本次上下文，方便你一路追問。
                  </p>
                </div>
                <div className="rounded-2xl border border-white/8 bg-[#0a1220] px-4 py-3">
                  <p className="text-sm font-bold text-slate-100">設定集中後台</p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">
                    金鑰、模型、base URL、system prompt 全都在 API 控制台調整。
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border border-violet-400/14 bg-[linear-gradient(180deg,rgba(76,29,149,0.18),rgba(15,23,41,0.96))] shadow-[0_18px_48px_rgba(2,8,23,0.18)]">
            <CardContent className="space-y-3 p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-violet-300/18 bg-violet-400/10 text-violet-100">
                  <ImageIcon className="h-4.5 w-4.5" />
                </div>
                <div>
                  <p className="text-sm font-black text-slate-50">圖片生成提示</p>
                  <p className="text-xs leading-5 text-slate-300">
                    若模型支援 IMAGE 輸出，生成結果會直接顯示在對話區。
                  </p>
                </div>
              </div>
              <div className="rounded-2xl border border-white/8 bg-black/18 px-4 py-3 text-xs leading-6 text-slate-300">
                如果你在後台把模型切到支援圖片輸出的 Gemini Image 模型，這頁就能直接看到生成圖片，不會只剩文字。
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
