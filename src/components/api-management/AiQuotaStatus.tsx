import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { getGeminiFreeModelProfile, resolveAiProviderPreset } from "./aiProviderCatalog";
import { AI_USAGE_RECORDED_EVENT } from "./aiUsageTelemetry";
import { buildObservedQuotaRange, parseAiModelUsageSummary, type AiModelUsageSummary } from "./aiUsageSummary";

/** Shared counts are fetched through the AI-view RPC, never API-management access. */
export function AiQuotaStatus({ apiKeyId, provider, model }: { apiKeyId: string | null; provider: string; model: string }) {
  const [snapshot, setSnapshot] = useState<{ scope: string; value: AiModelUsageSummary } | null>(null);
  const scope = `${apiKeyId}::${provider}::${model}`;
  const summary = snapshot?.scope === scope ? snapshot.value : null;
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(false);
  const profile = resolveAiProviderPreset(provider).id === "gemini" ? getGeminiFreeModelProfile(model) : undefined;

  useEffect(() => {
    let alive = true;
    let pending = false;
    let activeController: AbortController | null = null;
    setSnapshot(null);
    setError("");
    const load = async () => {
      if (!apiKeyId || pending || document.visibilityState === "hidden") return;
      pending = true;
      setLoading(true);
      const controller = new AbortController();
      activeController = controller;
      const timeout = window.setTimeout(() => controller.abort(), 12_000);
      try {
        const result = await supabase.rpc("get_ai_model_usage_summary", { p_api_key_ids: [apiKeyId] }).abortSignal(controller.signal);
        if (result.error) throw result.error;
        const next = parseAiModelUsageSummary(result.data);
        if (!next.generatedAt) throw new Error("Missing usage snapshot");
        if (alive) { setSnapshot({ scope, value: next }); setError(""); }
      } catch {
        if (alive) setError("用量暫時無法更新，請重試。");
      } finally {
        window.clearTimeout(timeout);
        activeController = null;
        pending = false;
        if (alive) setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    const update = () => void load();
    window.addEventListener(AI_USAGE_RECORDED_EVENT, update);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      alive = false;
      activeController?.abort();
      window.clearInterval(timer);
      window.removeEventListener(AI_USAGE_RECORDED_EVENT, update);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [apiKeyId, provider, model, refresh, scope]);

  const target = summary?.targets.find(item => item.apiKeyId === apiKeyId && item.model === model);
  const minute = summary ? target?.minuteAttempts ?? 0 : null;
  const day = summary ? target?.pacificDayAttempts ?? 0 : null;
  const unavailable = !apiKeyId || !summary || !!error;
  const count = (value: number | null) => unavailable ? "—" : value?.toLocaleString("zh-TW");
  return (
    <section aria-label="全員共用 API 額度與用量" className="shrink-0 border-b border-border bg-muted/30 px-3 text-foreground sm:px-6">
      <div className="flex flex-wrap items-center gap-x-3 text-xs">
        <h3 className="sr-only font-semibold xl:not-sr-only">全員共用 API 額度</h3>
        <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1">
          <p><span className="text-muted-foreground">分鐘 </span><strong>{count(minute)}</strong>{profile ? ` / ${profile.rpm} 次` : " 次"}</p>
          <p><span className="text-muted-foreground">今日 </span><strong>{count(day)}</strong>{profile ? ` / ${profile.rpd} 次` : " 次"}</p>
        </div>
        <Button variant="ghost" size="icon" disabled={loading || !apiKeyId} onClick={() => setRefresh(value => value + 1)} aria-label="更新全員 API 用量" title={loading ? "更新中" : "更新全員 API 用量"} className="ml-auto h-11 w-11 shrink-0"><RefreshCw className={loading ? 'h-4 w-4 animate-spin motion-reduce:animate-none' : 'h-4 w-4'} /></Button>
        <details className="text-xs leading-5 text-muted-foreground [&[open]]:basis-full">
        <summary className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">詳情</summary>
        <div className="space-y-1 pb-3">
        {!apiKeyId && <p>選擇系統 API 後可查看全員用量。</p>}
        <p>今日統計依太平洋時間計算；摘要數字為本系統全員已用請求。</p>
        {profile && !unavailable && <p>估算可用範圍：本分鐘 0–{buildObservedQuotaRange(minute!, profile.rpm).max} 次 · 今日 0–{buildObservedQuotaRange(day!, profile.rpd).max} 次</p>}
        <p>統計這組 API、這個模型在本系統所有使用者的請求；包含重試。同一 Google 專案共用額度，其他網站或金鑰的使用量未計入，因此不是官方剩餘額。</p>
        {profile ? <p>每分鐘輸入上限 {profile.inputTpm.toLocaleString("zh-TW")} tokens；token 用量尚未追蹤。上限依既有設定（{profile.sourceDate}），實際額度以供應商帳戶為準。</p> : <p>此模型尚未設定額度上限，仍可查看系統請求用量。</p>}
        <p>{summary?.trackingStartedAt ? `追蹤起點：${new Date(summary.trackingStartedAt).toLocaleString("zh-TW")}，開始追蹤前的請求不在統計內。` : "用量追蹤尚未開始。"}</p>
        {summary?.generatedAt && <p>更新時間：{new Date(summary.generatedAt).toLocaleTimeString("zh-TW") } · 畫面開啟時每 30 秒更新。</p>}
        </div>
      </details>
      </div>
      {error && <p role="alert" className="pb-2 text-xs text-amber-300">{error}</p>}
    </section>
  );
}
