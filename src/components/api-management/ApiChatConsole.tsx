import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  KeyRound,
  MessageSquareText,
  Send,
  Sparkles,
  Trash2,
  User,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { ApiKeyRecord, normalizeApiKeyPermissions } from "./apiKeyHelpers";

interface ApiChatConsoleProps {
  selectedApiKey?: ApiKeyRecord | null;
  mode?: "full" | "chat-only";
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  state?: "normal" | "error";
}

interface ChatConnectionState {
  status: "success" | "error";
  title: string;
  message: string;
  endpoint: string;
  provider: string;
  model: string;
  durationMs: number;
}

function createMessage(
  role: ChatMessage["role"],
  content: string,
  state: ChatMessage["state"] = "normal"
): ChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    createdAt: Date.now(),
    state,
  };
}

function formatMessageTime(value: number) {
  return new Intl.DateTimeFormat("zh-TW", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function ConnectionBanner({
  result,
  onDismiss,
}: {
  result: ChatConnectionState;
  onDismiss: () => void;
}) {
  const isSuccess = result.status === "success";

  return (
    <div
      className={cn(
        "rounded-[24px] border px-5 py-4 shadow-[0_24px_50px_rgba(2,8,23,0.22)] transition-all duration-200",
        isSuccess
          ? "border-emerald-300/45 bg-[linear-gradient(135deg,rgba(21,128,61,0.9),rgba(5,46,22,0.9))] text-emerald-50"
          : "border-rose-300/45 bg-[linear-gradient(135deg,rgba(190,24,93,0.88),rgba(76,5,25,0.92))] text-rose-50"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3">
          <div
            className={cn(
              "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border",
              isSuccess
                ? "border-white/12 bg-emerald-950/25"
                : "border-white/12 bg-rose-950/25"
            )}
          >
            {isSuccess ? (
              <CheckCircle2 className="h-4.5 w-4.5" />
            ) : (
              <AlertTriangle className="h-4.5 w-4.5" />
            )}
          </div>

          <div className="min-w-0">
            <p className="text-base font-black md:text-lg">{result.title}</p>
            <p className="mt-1 text-sm font-medium leading-6 opacity-95">{result.message}</p>
            <div className="mt-3 grid gap-2 text-xs leading-6 opacity-95 md:grid-cols-2">
              <p className="break-all">端點：{result.endpoint}</p>
              <p>Provider：{result.provider}</p>
              <p>Model：{result.model}</p>
              <p>耗時：{result.durationMs} ms</p>
            </div>
          </div>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onDismiss}
          className="h-9 w-9 shrink-0 rounded-2xl border border-white/12 bg-black/15 text-current transition-all duration-200 hover:bg-black/25 active:scale-[0.98]"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function extractGeminiText(result: unknown) {
  if (!result || typeof result !== "object") return "";

  const payload = result as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  const parts = payload.candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("\n")
    .trim();
}

function MetricTile({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-[#0b1423] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
      <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-black text-slate-50">{value}</p>
      <p className="mt-2 text-xs leading-5 text-slate-400">{caption}</p>
    </div>
  );
}

function SectionTitle({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-sm font-black text-slate-100">{title}</p>
      <p className="text-xs leading-5 text-slate-400">{description}</p>
    </div>
  );
}

export function ApiChatConsole({
  selectedApiKey,
  mode = "full",
}: ApiChatConsoleProps) {
  const [apiKey, setApiKey] = useState("");
  const [provider, setProvider] = useState("gemini");
  const [model, setModel] = useState("gemini-2.5-flash");
  const [baseUrl, setBaseUrl] = useState("https://generativelanguage.googleapis.com/v1beta");
  const [systemPrompt, setSystemPrompt] = useState(
    "你是站點管理系統的 AI 助理，請用繁體中文直接回答，優先給可執行結論。"
  );
  const [draftMessage, setDraftMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [connectionState, setConnectionState] = useState<ChatConnectionState | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const isChatOnly = mode === "chat-only";

  const selectedMetadata = useMemo(() => {
    return selectedApiKey
      ? normalizeApiKeyPermissions(selectedApiKey.permissions).metadata
      : null;
  }, [selectedApiKey]);

  useEffect(() => {
    if (!selectedApiKey) return;

    setApiKey(selectedApiKey.api_key);
    setProvider(selectedMetadata?.provider || "gemini");
    setModel(selectedMetadata?.model || "gemini-2.5-flash");
    setBaseUrl(selectedMetadata?.baseUrl || "https://generativelanguage.googleapis.com/v1beta");
    setMessages([]);
    setDraftMessage("");
    setConnectionState(null);
  }, [selectedApiKey, selectedMetadata]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  const normalizedProvider = provider.trim().toLowerCase();
  const isGeminiProvider = normalizedProvider === "gemini";

  const requestUrl = useMemo(() => {
    if (!apiKey.trim() || !model.trim() || !baseUrl.trim()) return "";
    return `${baseUrl.replace(/\/$/, "")}/models/${model.trim()}:generateContent?key=${encodeURIComponent(
      apiKey.trim()
    )}`;
  }, [apiKey, model, baseUrl]);

  const canSend = Boolean(
    apiKey.trim() &&
      provider.trim() &&
      model.trim() &&
      baseUrl.trim() &&
      draftMessage.trim() &&
      !loading
  );

  const buildGeminiContents = (history: ChatMessage[]) =>
    history.map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }));

  const runGeminiRequest = async (
    history: ChatMessage[],
    bannerTitle: string,
    showSuccessBanner = true
  ) => {
    const startedAt = Date.now();

    const response = await fetch(requestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: systemPrompt.trim()
          ? {
              parts: [{ text: systemPrompt.trim() }],
            }
          : undefined,
        contents: buildGeminiContents(history),
      }),
    });

    const result = await response.json();
    const durationMs = Date.now() - startedAt;

    if (!response.ok) {
      const errorMessage =
        (result &&
          typeof result === "object" &&
          "error" in result &&
          result.error &&
          typeof result.error === "object" &&
          "message" in result.error &&
          typeof result.error.message === "string" &&
          result.error.message) ||
        `Gemini API 失敗，HTTP ${response.status}`;

      setConnectionState({
        status: "error",
        title: `${bannerTitle}失敗`,
        message: errorMessage,
        endpoint: requestUrl,
        provider: provider || "gemini",
        model: model || "-",
        durationMs,
      });

      throw new Error(errorMessage);
    }

    const replyText = extractGeminiText(result) || JSON.stringify(result, null, 2);

    if (showSuccessBanner) {
      setConnectionState({
        status: "success",
        title: `${bannerTitle}成功`,
        message: "AI API 已正常回應，你可以直接繼續追問。",
        endpoint: requestUrl,
        provider: provider || "gemini",
        model: model || "-",
        durationMs,
      });
    }

    return replyText;
  };

  const handleSend = async () => {
    const content = draftMessage.trim();

    if (!content) {
      toast.error("請先輸入對話內容");
      return;
    }

    if (!isGeminiProvider) {
      toast.error("目前對話模式先支援 Gemini provider");
      return;
    }

    const userMessage = createMessage("user", content);
    const nextHistory = [...messages, userMessage];

    setMessages(nextHistory);
    setDraftMessage("");
    setLoading(true);

    try {
      const replyText = await runGeminiRequest(nextHistory, "AI 對話", false);
      setMessages((current) => [...current, createMessage("assistant", replyText)]);
      toast.success("AI 回覆完成");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "AI 對話失敗";
      setMessages((current) => [
        ...current,
        createMessage("assistant", `API 呼叫失敗：${errorMessage}`, "error"),
      ]);
      toast.error("AI 對話失敗");
    } finally {
      setLoading(false);
    }
  };

  const handleConnectionTest = async () => {
    if (!isGeminiProvider) {
      toast.error("目前測試模式先支援 Gemini provider");
      return;
    }

    setLoading(true);

    try {
      const replyText = await runGeminiRequest(
        [createMessage("user", "請只回覆：API 連線正常")],
        "AI API 連線測試",
        true
      );

      setMessages([createMessage("assistant", replyText || "API 連線正常")]);
      toast.success("API 測試成功");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "API 測試失敗";
      setMessages([createMessage("assistant", `API 測試失敗：${errorMessage}`, "error")]);
      toast.error("API 測試失敗");
    } finally {
      setLoading(false);
    }
  };

  const activeKeyLabel = selectedApiKey?.key_name || "尚未啟用 Gemini Key";
  const totalMessages = messages.length.toString();
  const modeLabel = isGeminiProvider ? "可對話" : "待擴充";

  return (
    <Card className="overflow-hidden rounded-[32px] border border-cyan-400/12 bg-[linear-gradient(180deg,#10192e_0%,#0a1322_100%)] shadow-[0_24px_80px_rgba(2,8,23,0.3)]">
      <CardHeader className="border-b border-white/8 pb-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/16 bg-cyan-400/8 px-3 py-1 text-xs font-bold tracking-[0.2em] text-cyan-100">
              <MessageSquareText className="h-3.5 w-3.5" />
              LIVE CONVERSATION
            </div>
            <div>
              <CardTitle className="text-3xl font-black tracking-tight text-slate-50">
                AI 對話控制台
              </CardTitle>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-400">
                {isChatOnly
                  ? "這裡只保留對話本身，所有 API 與模型設定都已移回後台 API 控制台。"
                  : "這裡不是單次測試，而是直接使用你目前選定的 API 金鑰與模型持續對話。你可以一邊微調 provider、model、base URL、system prompt，一邊即時驗證輸出結果。"}
              </p>
            </div>
          </div>

          <div
            className={cn(
              "grid gap-3",
              isChatOnly ? "sm:grid-cols-2 xl:min-w-[320px]" : "sm:grid-cols-3 xl:min-w-[420px]"
            )}
          >
            <MetricTile
              label="Current key"
              value={activeKeyLabel}
              caption="目前套用中的對話來源。"
            />
            <MetricTile
              label="Mode"
              value={modeLabel}
              caption={isGeminiProvider ? "目前已接通 Gemini 對話。" : "此 provider 尚未接對話流程。"}
            />
            {!isChatOnly ? (
              <MetricTile
                label="Messages"
                value={totalMessages}
                caption="本次工作區內保留的對話訊息數。"
              />
            ) : null}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 pt-6">
        <div
          className={cn(
            "grid gap-6",
            isChatOnly ? "grid-cols-1" : "xl:grid-cols-[420px_minmax(0,1fr)]"
          )}
        >
          {!isChatOnly ? (
            <div className="space-y-4">
              <div className="rounded-[28px] border border-white/8 bg-[#0b1423] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                <div className="flex items-start justify-between gap-4">
                  <SectionTitle
                    title="模型與憑證設定"
                    description="左側只負責 API 與模型控制；右側保留實際對話。"
                  />
                  <Badge className="rounded-full border border-cyan-300/18 bg-cyan-400/10 px-3 py-1 text-cyan-100 hover:bg-cyan-400/10">
                    {activeKeyLabel}
                  </Badge>
                </div>

                <div className="mt-5 space-y-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-bold text-slate-300">API 金鑰</Label>
                    <div className="relative">
                      <KeyRound className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                      <Input
                        type="password"
                        value={apiKey}
                        onChange={(event) => setApiKey(event.target.value)}
                        placeholder="貼上要對話的 API Key"
                        className="h-12 rounded-2xl border-cyan-400/14 bg-[#09111f] pl-11 text-slate-100 transition-all duration-200 placeholder:text-slate-500 hover:border-cyan-300/22 focus:ring-2 focus:ring-cyan-400/18"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                    <div className="space-y-2">
                      <Label className="text-sm font-bold text-slate-300">Provider</Label>
                      <Input
                        value={provider}
                        onChange={(event) => setProvider(event.target.value)}
                        placeholder="gemini"
                        className="h-12 rounded-2xl border-cyan-400/14 bg-[#09111f] text-slate-100 transition-all duration-200 placeholder:text-slate-500 hover:border-cyan-300/22 focus:ring-2 focus:ring-cyan-400/18"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-bold text-slate-300">Model</Label>
                      <Input
                        value={model}
                        onChange={(event) => setModel(event.target.value)}
                        placeholder="gemini-2.5-flash"
                        className="h-12 rounded-2xl border-cyan-400/14 bg-[#09111f] text-slate-100 transition-all duration-200 placeholder:text-slate-500 hover:border-cyan-300/22 focus:ring-2 focus:ring-cyan-400/18"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-bold text-slate-300">API Base URL</Label>
                    <Input
                      value={baseUrl}
                      onChange={(event) => setBaseUrl(event.target.value)}
                      placeholder="https://generativelanguage.googleapis.com/v1beta"
                      className="h-12 rounded-2xl border-cyan-400/14 bg-[#09111f] text-slate-100 transition-all duration-200 placeholder:text-slate-500 hover:border-cyan-300/22 focus:ring-2 focus:ring-cyan-400/18"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] border border-white/8 bg-[#0b1423] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                <SectionTitle
                  title="System Prompt"
                  description="先定義角色與回覆方式，AI 對話會依這裡的規則執行。"
                />
                <Textarea
                  value={systemPrompt}
                  onChange={(event) => setSystemPrompt(event.target.value)}
                  placeholder="定義這個 AI 助理的角色、語氣、限制與回答格式"
                  className="mt-4 min-h-[164px] rounded-[24px] border-cyan-400/14 bg-[#09111f] text-[15px] leading-7 text-slate-100 transition-all duration-200 placeholder:text-slate-500 hover:border-cyan-300/22 focus:ring-2 focus:ring-cyan-400/18"
                />
              </div>

              <div className="rounded-[28px] border border-white/8 bg-[#0b1423] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                <SectionTitle
                  title="請求預覽"
                  description="用來確認目前實際打到哪個模型端點。"
                />
                <div className="mt-4 rounded-2xl border border-cyan-400/12 bg-[#09111f] px-4 py-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">
                    Request URL
                  </p>
                  <p className="mt-3 break-all text-sm leading-7 text-cyan-100">
                    {requestUrl || "請先補齊 API key / provider / model / base URL"}
                  </p>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Button
                    type="button"
                    onClick={() => void handleConnectionTest()}
                    disabled={loading || !requestUrl}
                    className="h-12 rounded-2xl bg-emerald-500 font-bold text-slate-950 transition-all duration-200 hover:bg-emerald-400 active:scale-[0.99]"
                  >
                    <Sparkles className="mr-2 h-4 w-4" />
                    {loading ? "測試中..." : "測試連線"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setMessages([]);
                      setConnectionState(null);
                    }}
                    className="h-12 rounded-2xl border-cyan-400/16 bg-transparent font-bold text-slate-300 transition-all duration-200 hover:bg-cyan-400/8 hover:text-white active:scale-[0.99]"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    清空對話
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          <div className="space-y-4">
            {isChatOnly ? (
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="rounded-[24px] border border-white/8 bg-[#0b1423] px-4 py-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">
                    Current key
                  </p>
                  <p className="mt-2 text-base font-black text-slate-50">{activeKeyLabel}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    對話工作區會直接使用後台目前啟用的 Gemini 設定。
                  </p>
                </div>
                <div className="rounded-[24px] border border-white/8 bg-[#0b1423] px-4 py-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">
                    Provider / Model
                  </p>
                  <p className="mt-2 text-base font-black text-slate-50">
                    {provider || "-"} / {model || "-"}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    若需更換模型或 base URL，請到後台 API 控制台處理。
                  </p>
                </div>
                <div className="rounded-[24px] border border-emerald-400/14 bg-emerald-500/8 px-4 py-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-100/80">
                    Workspace mode
                  </p>
                  <p className="mt-2 text-base font-black text-emerald-50">純對話入口</p>
                  <p className="mt-2 text-sm leading-6 text-emerald-100/85">
                    這頁不再提供金鑰與模型編輯，只保留聊天與回覆。
                  </p>
                </div>
              </div>
            ) : null}

            <div className="rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,#0f1729_0%,#0a111d_100%)] p-4 shadow-[0_20px_60px_rgba(2,8,23,0.22)]">
              <div className="flex flex-col gap-3 border-b border-white/8 px-2 pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-400/18 bg-cyan-400/10 text-cyan-100">
                    <Bot className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-lg font-black text-slate-50">對話視窗</p>
                    <p className="text-sm leading-6 text-slate-400">
                      保留本次上下文，適合連續追問與即時驗證 API 回應。
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="rounded-full border border-blue-300/15 bg-blue-500/10 px-3 py-1 text-blue-100 hover:bg-blue-500/10">
                    Provider：{provider || "-"}
                  </Badge>
                  <Badge className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-200 hover:bg-white/5">
                    Model：{model || "-"}
                  </Badge>
                </div>
              </div>

              <div className="mt-4 space-y-4">
                {connectionState ? (
                  <ConnectionBanner
                    result={connectionState}
                    onDismiss={() => setConnectionState(null)}
                  />
                ) : null}

                <div className="rounded-[26px] border border-cyan-400/10 bg-[#08101d] p-3">
                  <div className="max-h-[560px] min-h-[560px] space-y-4 overflow-y-auto pr-1">
                    {messages.length === 0 ? (
                      <div className="flex min-h-[534px] items-center justify-center rounded-[22px] border border-dashed border-cyan-400/12 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.08),transparent_35%),#0b1423] px-8 text-center">
                        <div className="max-w-md space-y-4">
                          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl border border-cyan-400/16 bg-cyan-400/8 text-cyan-100">
                            <MessageSquareText className="h-7 w-7" />
                          </div>
                          <div>
                            <p className="text-xl font-black text-slate-50">還沒有對話內容</p>
                            <p className="mt-2 text-sm leading-7 text-slate-400">
                              {isChatOnly
                                ? "直接從下方開始提問即可，這裡會保留你這次對話的上下文。"
                                : "可以先按「測試連線」確認成功，再從下方開始提問。這個區塊會保留你本次工作區的上下文。"}
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      messages.map((message) => {
                        const isUser = message.role === "user";

                        return (
                          <div
                            key={message.id}
                            className={cn("flex gap-3", isUser ? "justify-end" : "justify-start")}
                          >
                            {!isUser ? (
                              <div className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-400/16 bg-cyan-400/10 text-cyan-100">
                                <Bot className="h-4.5 w-4.5" />
                              </div>
                            ) : null}

                            <div
                              className={cn(
                                "max-w-[88%] rounded-[24px] border px-5 py-4 text-[15px] leading-7 shadow-[0_16px_36px_rgba(2,8,23,0.18)]",
                                isUser
                                  ? "border-blue-300/18 bg-[linear-gradient(135deg,rgba(59,130,246,0.2),rgba(37,99,235,0.12))] text-slate-50"
                                  : message.state === "error"
                                    ? "border-rose-300/22 bg-[linear-gradient(135deg,rgba(225,29,72,0.16),rgba(76,5,25,0.18))] text-rose-50"
                                    : "border-cyan-400/10 bg-[linear-gradient(180deg,#10192e_0%,#0b1423_100%)] text-slate-100"
                              )}
                            >
                              <div className="mb-3 flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                                  {isUser ? (
                                    <>
                                      <User className="h-3.5 w-3.5" />
                                      你
                                    </>
                                  ) : (
                                    <>
                                      <Bot className="h-3.5 w-3.5" />
                                      AI
                                    </>
                                  )}
                                </div>
                                <span className="text-xs font-semibold text-slate-500">
                                  {formatMessageTime(message.createdAt)}
                                </span>
                              </div>
                              <div className="whitespace-pre-wrap break-words">{message.content}</div>
                            </div>

                            {isUser ? (
                              <div className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-blue-300/16 bg-blue-500/12 text-blue-100">
                                <User className="h-4.5 w-4.5" />
                              </div>
                            ) : null}
                          </div>
                        );
                      })
                    )}

                    {loading ? (
                      <div className="flex gap-3">
                        <div className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-400/16 bg-cyan-400/10 text-cyan-100">
                          <Bot className="h-4.5 w-4.5" />
                        </div>
                        <div className="max-w-[88%] rounded-[24px] border border-cyan-400/10 bg-[linear-gradient(180deg,#10192e_0%,#0b1423_100%)] px-5 py-4 text-[15px] leading-7 text-slate-300">
                          AI 回覆中...
                        </div>
                      </div>
                    ) : null}
                    <div ref={messagesEndRef} />
                  </div>
                </div>

                <div className="rounded-[26px] border border-white/8 bg-[#0b1423] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                  <div className="flex flex-col gap-3 border-b border-white/8 pb-4 sm:flex-row sm:items-center sm:justify-between">
                    <SectionTitle
                      title="輸入訊息"
                      description="可直接開始發問，也能把 API 用途、文件整理、技術問題丟進來。"
                    />
                    <div className="flex gap-2">
                      {isChatOnly ? null : (
                        <Button
                          type="button"
                          onClick={() => void handleConnectionTest()}
                          disabled={loading || !requestUrl}
                          className="h-10 rounded-2xl bg-emerald-500 px-4 font-bold text-slate-950 transition-all duration-200 hover:bg-emerald-400 active:scale-[0.99]"
                        >
                          <Sparkles className="mr-2 h-4 w-4" />
                          {loading ? "測試中..." : "測試連線"}
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setMessages([]);
                          setConnectionState(null);
                        }}
                        className="h-10 rounded-2xl border-cyan-400/16 bg-transparent px-4 font-bold text-slate-300 transition-all duration-200 hover:bg-cyan-400/8 hover:text-white active:scale-[0.99]"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        清空對話
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_150px]">
                    <Textarea
                      value={draftMessage}
                      onChange={(event) => setDraftMessage(event.target.value)}
                      placeholder="例如：請幫我整理這把 API 現在可做哪些事，或直接詢問技術問題"
                      className="min-h-[156px] rounded-[24px] border-cyan-400/14 bg-[#08101d] text-[15px] leading-7 text-slate-100 transition-all duration-200 placeholder:text-slate-500 hover:border-cyan-300/22 focus:ring-2 focus:ring-cyan-400/18"
                    />
                    <div className="flex flex-col justify-between gap-3">
                      <div className="rounded-2xl border border-white/8 bg-[#09111f] px-4 py-3">
                        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">
                          Status
                        </p>
                        <p className="mt-2 text-sm font-bold text-slate-100">
                          {canSend ? "可送出" : "等待輸入"}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-slate-400">
                          {isChatOnly
                            ? "若後台已啟用金鑰並輸入訊息，就能直接發送。"
                            : "若金鑰、模型與訊息完整，就能直接發送。"}
                        </p>
                      </div>
                      <Button
                        type="button"
                        onClick={() => void handleSend()}
                        disabled={!canSend}
                        className="h-14 rounded-2xl bg-cyan-500 font-bold text-slate-950 transition-all duration-200 hover:bg-cyan-400 active:scale-[0.99]"
                      >
                        <Send className="mr-2 h-4 w-4" />
                        {loading ? "送出中..." : "送出對話"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
