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

import { ApiKeyRecord, normalizeApiKeyPermissions } from "./apiKeyHelpers";

interface ApiChatConsoleProps {
  selectedApiKey?: ApiKeyRecord | null;
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

function createMessage(role: ChatMessage["role"], content: string, state: ChatMessage["state"] = "normal"): ChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    createdAt: Date.now(),
    state,
  };
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
      className={[
        "rounded-2xl border px-5 py-4 shadow-[0_14px_38px_rgba(0,0,0,0.22)]",
        isSuccess
          ? "border-emerald-300/70 bg-emerald-700/80 text-emerald-50"
          : "border-rose-300/70 bg-rose-700/80 text-rose-50",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3">
          <div
            className={[
              "mt-0.5 rounded-full p-1.5",
              isSuccess ? "bg-emerald-950/35" : "bg-rose-950/35",
            ].join(" ")}
          >
            {isSuccess ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
          </div>

          <div className="min-w-0">
            <p className="text-base font-black">{result.title}</p>
            <p className="mt-1 text-sm font-semibold opacity-95">{result.message}</p>
            <div className="mt-3 space-y-1 text-sm leading-6 opacity-95">
              <p>端點：{result.endpoint}</p>
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
          className="h-8 w-8 shrink-0 rounded-xl border border-white/10 bg-black/15 text-current hover:bg-black/25"
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

export function ApiChatConsole({ selectedApiKey }: ApiChatConsoleProps) {
  const [apiKey, setApiKey] = useState("");
  const [provider, setProvider] = useState("gemini");
  const [model, setModel] = useState("gemini-2.5-flash");
  const [baseUrl, setBaseUrl] = useState("https://generativelanguage.googleapis.com/v1beta");
  const [systemPrompt, setSystemPrompt] = useState("你是站點管理系統的 AI 助理，請用繁體中文直接回答，優先給可執行結論。");
  const [draftMessage, setDraftMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [connectionState, setConnectionState] = useState<ChatConnectionState | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

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
      apiKey.trim(),
    )}`;
  }, [apiKey, model, baseUrl]);

  const canSend = Boolean(
    apiKey.trim() &&
      provider.trim() &&
      model.trim() &&
      baseUrl.trim() &&
      draftMessage.trim() &&
      !loading,
  );

  const buildGeminiContents = (history: ChatMessage[]) =>
    history.map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }));

  const runGeminiRequest = async (history: ChatMessage[], bannerTitle: string) => {
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

    setConnectionState({
      status: "success",
      title: `${bannerTitle}成功`,
      message: "AI API 已回傳內容，可以直接繼續追問。",
      endpoint: requestUrl,
      provider: provider || "gemini",
      model: model || "-",
      durationMs,
    });

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
      const replyText = await runGeminiRequest(nextHistory, "AI 對話");
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
      );

      setMessages([
        createMessage("assistant", replyText || "API 連線正常"),
      ]);
      toast.success("API 測試成功");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "API 測試失敗";
      setMessages([
        createMessage("assistant", `API 測試失敗：${errorMessage}`, "error"),
      ]);
      toast.error("API 測試失敗");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <Card className="border-blue-400/15 bg-[#10192e]">
        <CardHeader className="border-b border-blue-400/10 pb-5">
          <CardTitle className="flex items-center gap-2 text-2xl font-black text-slate-50">
            <MessageSquareText className="h-6 w-6 text-cyan-300" />
            AI 對話控制台
          </CardTitle>
          <p className="text-sm leading-6 text-slate-400">
            這裡不是單次測試，而是直接用你儲存的 API 金鑰跟模型持續對話。你可以測試連線、連續追問、調整 system prompt，
            也能手動修改 provider / model / base URL。
          </p>
        </CardHeader>

        <CardContent className="space-y-5 pt-5">
          <div className="grid gap-4 xl:grid-cols-4">
            <div className="rounded-2xl border border-blue-400/15 bg-[#0b1423] p-4">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">金鑰名稱</p>
              <p className="mt-2 text-sm font-bold text-slate-100">
                {selectedApiKey?.key_name || "手動模式"}
              </p>
            </div>
            <div className="rounded-2xl border border-blue-400/15 bg-[#0b1423] p-4">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Provider</p>
              <p className="mt-2 text-sm font-bold text-slate-100">{provider || "-"}</p>
            </div>
            <div className="rounded-2xl border border-blue-400/15 bg-[#0b1423] p-4">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Model</p>
              <p className="mt-2 text-sm font-bold text-slate-100">{model || "-"}</p>
            </div>
            <div className="rounded-2xl border border-blue-400/15 bg-[#0b1423] p-4">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">模式</p>
              <div className="mt-2 flex items-center gap-2">
                <Badge className="bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/15">
                  {isGeminiProvider ? "可對話" : "待擴充"}
                </Badge>
              </div>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-bold text-slate-300">API 金鑰</Label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <Input
                    type="password"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder="貼上要對話的 API Key"
                    className="h-11 border-blue-400/20 bg-[#0b1423] pl-10 text-slate-100 placeholder:text-slate-500"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-sm font-bold text-slate-300">Provider</Label>
                  <Input
                    value={provider}
                    onChange={(event) => setProvider(event.target.value)}
                    placeholder="gemini"
                    className="h-11 border-blue-400/20 bg-[#0b1423] text-slate-100 placeholder:text-slate-500"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-bold text-slate-300">Model</Label>
                  <Input
                    value={model}
                    onChange={(event) => setModel(event.target.value)}
                    placeholder="gemini-2.5-flash"
                    className="h-11 border-blue-400/20 bg-[#0b1423] text-slate-100 placeholder:text-slate-500"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-bold text-slate-300">API Base URL</Label>
                <Input
                  value={baseUrl}
                  onChange={(event) => setBaseUrl(event.target.value)}
                  placeholder="https://generativelanguage.googleapis.com/v1beta"
                  className="h-11 border-blue-400/20 bg-[#0b1423] text-slate-100 placeholder:text-slate-500"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-bold text-slate-300">System Prompt</Label>
                <Textarea
                  value={systemPrompt}
                  onChange={(event) => setSystemPrompt(event.target.value)}
                  placeholder="定義這個 AI 助理的角色、語氣、限制與回答格式"
                  className="min-h-[140px] border-blue-400/20 bg-[#0b1423] text-slate-100 placeholder:text-slate-500"
                />
              </div>

              <div className="rounded-2xl border border-blue-400/15 bg-[#0b1423] p-4">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Request URL</p>
                <p className="mt-2 break-all text-sm leading-6 text-cyan-100">
                  {requestUrl || "請先補齊 API key / provider / model / base URL"}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => void handleConnectionTest()}
                  disabled={loading || !requestUrl}
                  className="bg-emerald-500 text-slate-950 hover:bg-emerald-400"
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
                  className="border-blue-400/20 bg-transparent text-slate-300 hover:bg-blue-400/10 hover:text-white"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  清空對話
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-3xl border border-blue-400/15 bg-[#0b1423] p-4">
                <div className="flex items-center gap-2">
                  <Bot className="h-5 w-5 text-cyan-300" />
                  <p className="text-base font-black text-slate-50">對話視窗</p>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  這裡會保留本次對話上下文。現在先支援 Gemini 對話；如果你之後新增其他 provider，我再幫你接同樣模式。
                </p>
              </div>

              {connectionState ? (
                <ConnectionBanner
                  result={connectionState}
                  onDismiss={() => setConnectionState(null)}
                />
              ) : null}

              <div className="rounded-3xl border border-blue-400/15 bg-[#08101d] p-3">
                <div className="max-h-[420px] min-h-[420px] space-y-3 overflow-y-auto pr-1">
                  {messages.length === 0 ? (
                    <div className="flex min-h-[396px] items-center justify-center rounded-2xl border border-dashed border-blue-400/15 bg-[#0b1423] px-6 text-center">
                      <div className="space-y-3">
                        <MessageSquareText className="mx-auto h-9 w-9 text-slate-500" />
                        <p className="text-base font-bold text-slate-200">還沒有對話內容</p>
                        <p className="text-sm leading-6 text-slate-400">
                          先按「測試連線」確認可用，或直接在下面輸入問題開始對話。
                        </p>
                      </div>
                    </div>
                  ) : (
                    messages.map((message) => {
                      const isUser = message.role === "user";

                      return (
                        <div
                          key={message.id}
                          className={[
                            "flex gap-3",
                            isUser ? "justify-end" : "justify-start",
                          ].join(" ")}
                        >
                          {!isUser ? (
                            <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-cyan-400/20 bg-cyan-400/10 text-cyan-200">
                              <Bot className="h-4 w-4" />
                            </div>
                          ) : null}

                          <div
                            className={[
                              "max-w-[85%] rounded-2xl border px-4 py-3 text-sm leading-7 shadow-[0_10px_28px_rgba(0,0,0,0.18)]",
                              isUser
                                ? "border-blue-300/20 bg-blue-500/15 text-slate-50"
                                : message.state === "error"
                                  ? "border-rose-300/25 bg-rose-500/12 text-rose-50"
                                  : "border-blue-400/15 bg-[#10192e] text-slate-100",
                            ].join(" ")}
                          >
                            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
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
                            <div className="whitespace-pre-wrap break-words">{message.content}</div>
                          </div>

                          {isUser ? (
                            <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-blue-300/20 bg-blue-500/12 text-blue-100">
                              <User className="h-4 w-4" />
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                  )}

                  {loading ? (
                    <div className="flex gap-3">
                      <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-cyan-400/20 bg-cyan-400/10 text-cyan-200">
                        <Bot className="h-4 w-4" />
                      </div>
                      <div className="max-w-[85%] rounded-2xl border border-blue-400/15 bg-[#10192e] px-4 py-3 text-sm text-slate-300">
                        AI 回覆中...
                      </div>
                    </div>
                  ) : null}
                  <div ref={messagesEndRef} />
                </div>
              </div>

              <div className="space-y-3 rounded-3xl border border-blue-400/15 bg-[#0b1423] p-4">
                <Label className="text-sm font-bold text-slate-300">輸入訊息</Label>
                <Textarea
                  value={draftMessage}
                  onChange={(event) => setDraftMessage(event.target.value)}
                  placeholder="例如：請幫我整理這把 API 現在可做哪些事，或直接詢問技術問題"
                  className="min-h-[140px] border-blue-400/20 bg-[#08101d] text-slate-100 placeholder:text-slate-500"
                />
                <div className="flex justify-end">
                  <Button
                    type="button"
                    onClick={() => void handleSend()}
                    disabled={!canSend}
                    className="bg-cyan-500 text-slate-950 hover:bg-cyan-400"
                  >
                    <Send className="mr-2 h-4 w-4" />
                    {loading ? "送出中..." : "送出對話"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
