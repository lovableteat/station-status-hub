import { useEffect, useMemo, useState } from "react";
import { KeyRound, MessageSquareText, ShieldCheck, Sparkles } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

import { ApiChatConsole } from "./ApiChatConsole";
import { ApiKeyRecord, normalizeApiKeyPermissions } from "./apiKeyHelpers";

const featureCards = [
  {
    icon: MessageSquareText,
    title: "連續對話",
    description: "保留本次上下文，測試 API 後可直接延伸追問。",
  },
  {
    icon: KeyRound,
    title: "快速切換金鑰",
    description: "直接套用後台已儲存的 Gemini API key，不必重貼。",
  },
  {
    icon: ShieldCheck,
    title: "權限仍由後台控管",
    description: "對話入口獨立，但金鑰建立、啟用與停用仍由後台管理。",
  },
];

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

  return (
    <div className="space-y-8 p-6">
      <Card className="overflow-hidden rounded-[32px] border border-cyan-400/12 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.18),transparent_26%),radial-gradient(circle_at_bottom_left,rgba(59,130,246,0.14),transparent_28%),linear-gradient(180deg,#121c31_0%,#0a1220_100%)] shadow-[0_24px_90px_rgba(2,8,23,0.34)]">
        <CardHeader className="border-b border-white/8 pb-6">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_400px]">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/18 bg-cyan-400/10 px-3 py-1 text-xs font-bold tracking-[0.24em] text-cyan-100">
                <Sparkles className="h-3.5 w-3.5" />
                AI WORKSPACE
              </div>

              <div className="space-y-3">
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/18 bg-slate-950/30 text-cyan-100 shadow-[0_16px_36px_rgba(34,211,238,0.14)]">
                  <MessageSquareText className="h-7 w-7" />
                </div>
                <div>
                  <CardTitle className="text-3xl font-black tracking-tight text-slate-50 md:text-4xl">
                    AI 對話控制台
                  </CardTitle>
                  <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300 md:text-[15px]">
                    這裡是獨立的 AI 工作區，只保留對話本身。API key、provider、model、
                    base URL、system prompt 等設定統一留在後台 API 控制台，不在這頁調整。
                  </p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                {featureCards.map((item) => {
                  const Icon = item.icon;

                  return (
                    <div
                      key={item.title}
                      className="rounded-2xl border border-white/8 bg-slate-950/24 p-4 backdrop-blur-sm transition-all duration-200 hover:border-cyan-300/18 hover:bg-slate-950/34"
                    >
                      <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/16 bg-cyan-400/8 text-cyan-100">
                        <Icon className="h-4.5 w-4.5" />
                      </div>
                      <p className="mt-4 text-base font-bold text-slate-50">{item.title}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-400">{item.description}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-[28px] border border-white/8 bg-slate-950/28 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-slate-100">目前對話來源</p>
                  <p className="mt-1 text-xs leading-6 text-slate-400">
                    這裡只顯示目前可用的 Gemini 設定，若要修改請回後台操作。
                  </p>
                </div>
                <div className="rounded-full border border-cyan-400/18 bg-cyan-400/10 px-3 py-1 text-xs font-bold text-cyan-100">
                  {apiKeys.length} 個可用
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-2xl border border-white/8 bg-[#0b1423] px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">
                    Current source
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-100">
                    {selectedApiKey?.key_name || "尚未啟用 Gemini Key"}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/8 bg-[#0b1423] px-4 py-3">
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">
                    後台設定狀態
                  </p>
                  <p className="mt-2 text-sm font-semibold text-emerald-200">
                    {selectedApiKey ? "已可直接對話" : "尚未啟用 Gemini Key"}
                  </p>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-emerald-400/14 bg-emerald-500/8 px-4 py-3 text-sm leading-6 text-emerald-100">
                這個工作區只保留對話。金鑰切換、provider、model、base URL、system prompt 都請到後台
                API 控制台調整。
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-blue-400/14 bg-[#0b1423] px-4 py-4">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">可用金鑰</p>
              <p className="mt-2 text-3xl font-black text-slate-50">{apiKeys.length}</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">僅顯示已啟用且可直接對話的 Gemini 設定。</p>
            </div>
            <div className="rounded-2xl border border-blue-400/14 bg-[#0b1423] px-4 py-4">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">對話模式</p>
              <p className="mt-2 text-3xl font-black text-slate-50">Gemini</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">目前已接入 Gemini 2.5 Flash，後續可擴充其他 provider。</p>
            </div>
            <div className="rounded-2xl border border-blue-400/14 bg-[#0b1423] px-4 py-4">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">工作分工</p>
              <p className="mt-2 text-lg font-black text-slate-50">工作區負責對話，後台負責權限</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">入口分離後，使用者操作更直接，也不會誤進設定頁。</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <ApiChatConsole selectedApiKey={selectedApiKey} mode="chat-only" />
    </div>
  );
}
