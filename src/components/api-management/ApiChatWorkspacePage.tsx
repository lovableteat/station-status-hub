import { useEffect, useMemo, useState } from "react";
import {
  BrainCircuit,
  ImageIcon,
  MessageSquareText,
  Sparkles,
  Wand2,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

import { ApiChatConsole } from "./ApiChatConsole";
import { ApiKeyRecord, normalizeApiKeyPermissions } from "./apiKeyHelpers";

function looksLikeImageModel(model?: string | null) {
  return /image|nano banana/i.test(model ?? "");
}

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

  const imageReady = looksLikeImageModel(selectedMetadata?.model);

  return (
    <div className="min-h-[calc(100vh-132px)] p-4 md:p-6">
      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <Card className="overflow-hidden rounded-[30px] border border-cyan-400/12 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.14),transparent_38%),linear-gradient(180deg,#132238_0%,#0a1322_100%)] shadow-[0_24px_64px_rgba(2,8,23,0.28)]">
            <CardContent className="space-y-5 p-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/18 bg-cyan-400/10 px-3 py-1 text-[11px] font-black tracking-[0.22em] text-cyan-100">
                <Sparkles className="h-3.5 w-3.5" />
                AI WORKSPACE
              </div>

              <div className="space-y-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/18 bg-cyan-400/8 text-cyan-100">
                  <MessageSquareText className="h-6 w-6" />
                </div>
                <div>
                  <h1 className="text-3xl font-black tracking-tight text-slate-50">
                    AI 對話空間
                  </h1>
                  <p className="mt-2 text-sm leading-7 text-slate-300">
                    這頁只保留聊天、追問與生成結果。金鑰、模型、base URL、system prompt
                    都留在後台 API 控制台，不再佔掉你的對話畫面。
                  </p>
                </div>
              </div>

              <div className="grid gap-3">
                <div className="rounded-2xl border border-white/8 bg-[#0b1423] px-4 py-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">
                    Current source
                  </p>
                  <p className="mt-2 truncate text-base font-black text-slate-50">
                    {selectedApiKey?.key_name || "尚未啟用 Gemini Key"}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-slate-400">
                    這個工作區會直接套用後台目前啟用中的 Gemini 設定。
                  </p>
                </div>

                <div className="rounded-2xl border border-white/8 bg-[#0b1423] px-4 py-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">
                    Provider / Model
                  </p>
                  <p className="mt-2 break-words text-sm font-bold text-slate-50">
                    {(selectedMetadata?.provider || "gemini").trim()} /{" "}
                    {(selectedMetadata?.model || "未設定").trim()}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-slate-400">
                    如果要切模型或改參數，請到後台 API 控制台操作。
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border border-white/8 bg-[#0f1729] shadow-[0_20px_48px_rgba(2,8,23,0.18)]">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-400/18 bg-cyan-400/8 text-cyan-100">
                  <BrainCircuit className="h-4.5 w-4.5" />
                </div>
                <div>
                  <p className="text-sm font-black text-slate-50">工作模式</p>
                  <p className="text-xs leading-5 text-slate-400">對話主畫面，其他資訊全部收側邊。</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="rounded-2xl border border-white/8 bg-[#0b1423] px-4 py-3">
                  <p className="text-sm font-bold text-slate-100">連續對話</p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">
                    保留本次上下文，你可以一路追問，不用一直重講背景。
                  </p>
                </div>
                <div className="rounded-2xl border border-white/8 bg-[#0b1423] px-4 py-3">
                  <p className="text-sm font-bold text-slate-100">畫面重心在聊天</p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">
                    主區只保留訊息流、圖片結果與輸入框，不再塞一堆設定卡。
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border border-violet-400/14 bg-[linear-gradient(180deg,rgba(76,29,149,0.18),rgba(15,23,41,0.96))] shadow-[0_20px_48px_rgba(2,8,23,0.18)]">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-violet-300/18 bg-violet-400/10 text-violet-100">
                  <ImageIcon className="h-4.5 w-4.5" />
                </div>
                <div>
                  <p className="text-sm font-black text-slate-50">圖片生成</p>
                  <p className="text-xs leading-5 text-slate-300">
                    對話區現在會直接顯示 AI 回傳的圖片，不再只剩文字。
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-white/8 bg-black/18 px-4 py-3 text-xs leading-6 text-slate-300">
                {imageReady
                  ? "目前模型名稱看起來支援圖片輸出。你可以直接要求它生成示意圖、流程圖風格圖像或視覺草圖。"
                  : "如果你要生成圖片，請在後台 API 控制台把模型切成支援 image 輸出的 Gemini Image 模型，這頁就會直接顯示圖片結果。"}
              </div>

              <div className="rounded-2xl border border-white/8 bg-[#0b1423] px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-100">
                  <Wand2 className="h-4 w-4 text-violet-200" />
                  提問範例
                </div>
                <ul className="mt-3 space-y-2 text-xs leading-6 text-slate-300">
                  <li>幫我整理今天的站點異常重點並給處理順序。</li>
                  <li>生成一張 16:9 機櫃部署概念圖，風格乾淨、工程導向。</li>
                  <li>把我剛剛的需求整理成可執行待辦表。</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </aside>

        <div className="min-w-0">
          <ApiChatConsole selectedApiKey={selectedApiKey} mode="chat-only" />
        </div>
      </div>
    </div>
  );
}
