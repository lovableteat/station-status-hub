import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Bookmark,
  Bot,
  CheckCircle2,
  FileText,
  ImageIcon,
  KeyRound,
  MessageSquareText,
  Plus,
  Save,
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

interface GeneratedImage {
  id: string;
  src: string;
  mimeType: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  state?: "normal" | "error";
  images?: GeneratedImage[];
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

interface SavedWorkspaceItem {
  id: string;
  title: string;
  content: string;
  savedAt: number;
}

interface SavedConversation {
  id: string;
  title: string;
  savedAt: number;
  draftMessage: string;
  messages: ChatMessage[];
  provider: string;
  model: string;
  keyLabel: string;
}

const SAVED_PROMPTS_STORAGE_KEY = "api-chat:saved-prompts";
const SAVED_DRAFTS_STORAGE_KEY = "api-chat:saved-drafts";
const SAVED_CONVERSATIONS_STORAGE_KEY = "api-chat:saved-conversations";

interface GeminiResponsePart {
  text?: string;
  inlineData?: {
    mimeType?: string;
    data?: string;
  };
  fileData?: {
    mimeType?: string;
    fileUri?: string;
  };
}

function looksLikeImageModel(model: string) {
  return /image|nano banana/i.test(model);
}

function createMessage(
  role: ChatMessage["role"],
  content: string,
  state: ChatMessage["state"] = "normal",
  images: GeneratedImage[] = []
): ChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    createdAt: Date.now(),
    state,
    images,
  };
}

function formatMessageTime(value: number) {
  return new Intl.DateTimeFormat("zh-TW", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function truncateMiddle(value: string, maxLength = 36) {
  if (value.length <= maxLength) return value;
  const head = Math.ceil(maxLength / 2) - 2;
  const tail = Math.floor(maxLength / 2) - 1;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

function formatSavedItemTime(value: number) {
  return new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function createSavedWorkspaceItem(content: string): SavedWorkspaceItem {
  const trimmed = content.trim();
  const firstLine = trimmed.split(/\r?\n/)[0] || "未命名內容";

  return {
    id: `saved-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: firstLine.slice(0, 28),
    content: trimmed,
    savedAt: Date.now(),
  };
}

function createSavedConversation(params: {
  messages: ChatMessage[];
  draftMessage: string;
  provider: string;
  model: string;
  keyLabel: string;
}): SavedConversation {
  const latestUserMessage =
    [...params.messages].reverse().find((message) => message.role === "user")?.content.trim() || "";
  const fallbackTitleSource = params.draftMessage.trim() || latestUserMessage || "新對話";

  return {
    id: `conversation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: fallbackTitleSource.split(/\r?\n/)[0].slice(0, 28) || "新對話",
    savedAt: Date.now(),
    draftMessage: params.draftMessage,
    messages: params.messages,
    provider: params.provider,
    model: params.model,
    keyLabel: params.keyLabel,
  };
}

function extractGeminiResponse(result: unknown) {
  if (!result || typeof result !== "object") {
    return { text: "", images: [] as GeneratedImage[] };
  }

  const payload = result as {
    candidates?: Array<{
      content?: {
        parts?: GeminiResponsePart[];
      };
    }>;
  };

  const parts = payload.candidates?.[0]?.content?.parts ?? [];
  const textParts: string[] = [];
  const images: GeneratedImage[] = [];

  parts.forEach((part, index) => {
    if (typeof part.text === "string" && part.text.trim()) {
      textParts.push(part.text.trim());
    }

    const inlineMimeType = part.inlineData?.mimeType ?? "";
    const inlineData = part.inlineData?.data ?? "";

    if (inlineMimeType.startsWith("image/") && inlineData) {
      images.push({
        id: `inline-${index}`,
        src: `data:${inlineMimeType};base64,${inlineData}`,
        mimeType: inlineMimeType,
      });
    }

    const fileMimeType = part.fileData?.mimeType ?? "";
    const fileUri = part.fileData?.fileUri ?? "";

    if (fileMimeType.startsWith("image/") && fileUri) {
      images.push({
        id: `file-${index}`,
        src: fileUri,
        mimeType: fileMimeType,
      });
    }
  });

  const text = textParts.join("\n\n").trim() || (images.length ? `已生成 ${images.length} 張圖片。` : "");

  return { text, images };
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

function MessageCard({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-3", isUser ? "justify-end" : "justify-start")}>
      {!isUser ? (
        <div className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-400/16 bg-cyan-400/10 text-cyan-100">
          <Bot className="h-4.5 w-4.5" />
        </div>
      ) : null}

      <div
        className={cn(
          "max-w-[92%] rounded-[24px] border px-5 py-4 text-[15px] leading-7 shadow-[0_16px_36px_rgba(2,8,23,0.18)] md:max-w-[86%]",
          isUser
            ? "border-blue-300/18 bg-[linear-gradient(135deg,rgba(59,130,246,0.22),rgba(37,99,235,0.14))] text-slate-50"
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

        {message.content ? (
          <div className="whitespace-pre-wrap break-words">{message.content}</div>
        ) : null}

        {message.images?.length ? (
          <div className={cn("grid gap-3", message.content ? "mt-4" : "", message.images.length > 1 ? "md:grid-cols-2" : "")}>
            {message.images.map((image, index) => (
              <div
                key={image.id}
                className="overflow-hidden rounded-[20px] border border-white/10 bg-[#060c16]"
              >
                <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                    <ImageIcon className="h-3.5 w-3.5 text-cyan-200" />
                    生成圖片 {index + 1}
                  </div>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    {image.mimeType.replace("image/", "")}
                  </span>
                </div>
                <div className="bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.08),transparent_45%),#08101d] p-3">
                  <img
                    src={image.src}
                    alt={`AI 生成圖片 ${index + 1}`}
                    className="w-full rounded-2xl border border-white/8 bg-slate-950/40 object-contain"
                  />
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {isUser ? (
        <div className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-blue-300/16 bg-blue-500/12 text-blue-100">
          <User className="h-4.5 w-4.5" />
        </div>
      ) : null}
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
  const [savedPrompts, setSavedPrompts] = useState<SavedWorkspaceItem[]>([]);
  const [savedDrafts, setSavedDrafts] = useState<SavedWorkspaceItem[]>([]);
  const [savedConversations, setSavedConversations] = useState<SavedConversation[]>([]);
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

  useEffect(() => {
    if (!isChatOnly || typeof window === "undefined") return;

    try {
      const promptPayload = window.localStorage.getItem(SAVED_PROMPTS_STORAGE_KEY);
      const draftPayload = window.localStorage.getItem(SAVED_DRAFTS_STORAGE_KEY);
      const conversationPayload = window.localStorage.getItem(SAVED_CONVERSATIONS_STORAGE_KEY);

      setSavedPrompts(promptPayload ? (JSON.parse(promptPayload) as SavedWorkspaceItem[]) : []);
      setSavedDrafts(draftPayload ? (JSON.parse(draftPayload) as SavedWorkspaceItem[]) : []);
      setSavedConversations(
        conversationPayload ? (JSON.parse(conversationPayload) as SavedConversation[]) : []
      );
    } catch (error) {
      console.error("Failed to load saved AI workspace items:", error);
      setSavedPrompts([]);
      setSavedDrafts([]);
      setSavedConversations([]);
    }
  }, [isChatOnly]);

  useEffect(() => {
    if (!isChatOnly || typeof window === "undefined") return;
    window.localStorage.setItem(SAVED_PROMPTS_STORAGE_KEY, JSON.stringify(savedPrompts));
  }, [isChatOnly, savedPrompts]);

  useEffect(() => {
    if (!isChatOnly || typeof window === "undefined") return;
    window.localStorage.setItem(SAVED_DRAFTS_STORAGE_KEY, JSON.stringify(savedDrafts));
  }, [isChatOnly, savedDrafts]);

  useEffect(() => {
    if (!isChatOnly || typeof window === "undefined") return;
    window.localStorage.setItem(
      SAVED_CONVERSATIONS_STORAGE_KEY,
      JSON.stringify(savedConversations)
    );
  }, [isChatOnly, savedConversations]);

  const normalizedProvider = provider.trim().toLowerCase();
  const isGeminiProvider = normalizedProvider === "gemini";
  const imageCapable = looksLikeImageModel(model.trim());

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

    const result = await response.json().catch(() => null);
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

    const parsed = extractGeminiResponse(result);
    const fallbackText =
      parsed.text || (parsed.images.length === 0 ? JSON.stringify(result, null, 2) : "");

    if (showSuccessBanner) {
      setConnectionState({
        status: "success",
        title: `${bannerTitle}成功`,
        message:
          parsed.images.length > 0
            ? "API 已正常回應，並回傳可直接顯示的圖片結果。"
            : "AI API 已正常回應，你可以直接繼續追問。",
        endpoint: requestUrl,
        provider: provider || "gemini",
        model: model || "-",
        durationMs,
      });
    }

    return {
      text: fallbackText,
      images: parsed.images,
    };
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
      const reply = await runGeminiRequest(nextHistory, "AI 對話", false);
      setMessages((current) => [
        ...current,
        createMessage("assistant", reply.text, "normal", reply.images),
      ]);
      toast.success(reply.images.length > 0 ? "圖片已生成並顯示" : "AI 回覆完成");
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
      const reply = await runGeminiRequest(
        [createMessage("user", "請只回覆：API 連線正常")],
        "AI API 連線測試",
        true
      );

      setMessages([
        createMessage(
          "assistant",
          reply.text || "API 連線正常",
          "normal",
          reply.images
        ),
      ]);
      toast.success("API 測試成功");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "API 測試失敗";
      setMessages([createMessage("assistant", `API 測試失敗：${errorMessage}`, "error")]);
      toast.error("API 測試失敗");
    } finally {
      setLoading(false);
    }
  };

  const hasConversationContent = messages.length > 0 || draftMessage.trim().length > 0;

  const persistCurrentConversation = () => {
    if (!hasConversationContent) return false;

    setSavedConversations((current) => [
      createSavedConversation({
        messages,
        draftMessage,
        provider,
        model,
        keyLabel: activeKeyLabel,
      }),
      ...current,
    ].slice(0, 24));

    return true;
  };

  const resetConversation = () => {
    const archived = persistCurrentConversation();
    setMessages([]);
    setDraftMessage("");
    setConnectionState(null);
    toast.success(archived ? "已建立新對話，上一段內容已保留" : "已建立新對話");
  };

  const saveCurrentPrompt = () => {
    const latestUserPrompt =
      [...messages].reverse().find((message) => message.role === "user")?.content.trim() || "";
    const content = draftMessage.trim() || latestUserPrompt;
    if (!content) {
      toast.error("目前沒有可儲存的提示詞");
      return;
    }

    setSavedPrompts((current) => [createSavedWorkspaceItem(content), ...current].slice(0, 20));
    toast.success("提示詞已儲存");
  };

  const saveCurrentDraft = () => {
    const latestUserDraft =
      [...messages].reverse().find((message) => message.role === "user")?.content.trim() || "";
    const content = draftMessage.trim() || latestUserDraft;
    if (!content) {
      toast.error("目前沒有可儲存的草稿");
      return;
    }

    setSavedDrafts((current) => [createSavedWorkspaceItem(content), ...current].slice(0, 20));
    toast.success("草稿已儲存");
  };

  const loadSavedItem = (content: string) => {
    setDraftMessage(content);
    toast.success("已帶入輸入框");
  };

  const restoreConversation = (conversation: SavedConversation) => {
    setMessages(conversation.messages);
    setDraftMessage(conversation.draftMessage);
    setProvider(conversation.provider || "gemini");
    setModel(conversation.model || "gemini-2.5-flash");
    setConnectionState(null);
    toast.success(`已載入對話：${conversation.title}`);
  };

  const removeSavedPrompt = (id: string) => {
    setSavedPrompts((current) => current.filter((item) => item.id !== id));
  };

  const removeSavedDraft = (id: string) => {
    setSavedDrafts((current) => current.filter((item) => item.id !== id));
  };

  const removeSavedConversation = (id: string) => {
    setSavedConversations((current) => current.filter((item) => item.id !== id));
  };

  const activeKeyLabel = selectedApiKey?.key_name || "尚未啟用 Gemini Key";
  const totalMessages = messages.length.toString();
  const modeLabel = isGeminiProvider ? "可對話" : "待擴充";
  const chatHeightClass = isChatOnly
    ? "min-h-[520px] max-h-[calc(100vh-310px)]"
    : "min-h-[560px] max-h-[560px]";

  const conversationPanel = (
    <div className="rounded-[36px] border border-cyan-400/10 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.05),transparent_28%),linear-gradient(180deg,#0f1729_0%,#0a111d_100%)] p-4 shadow-[0_28px_80px_rgba(2,8,23,0.28)]">
      <div className="flex flex-col gap-3 border-b border-white/8 px-2 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-400/18 bg-cyan-400/10 text-cyan-100">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <p className="text-lg font-black text-slate-50">對話視窗</p>
            <p className="text-sm leading-6 text-slate-400">
              保留本次上下文，適合連續追問、整理需求與顯示生成圖片。
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge className="rounded-full border border-cyan-300/18 bg-cyan-400/10 px-3 py-1 text-cyan-100 hover:bg-cyan-400/10">
            {truncateMiddle(activeKeyLabel)}
          </Badge>
          <Badge className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-200 hover:bg-white/5">
            {provider || "-"} / {model || "-"}
          </Badge>
          <Badge
            className={cn(
              "rounded-full px-3 py-1 hover:bg-transparent",
              imageCapable
                ? "border border-violet-300/18 bg-violet-400/10 text-violet-100"
                : "border border-white/10 bg-white/5 text-slate-300"
            )}
          >
            {imageCapable ? "支援圖片輸出" : "目前為文字模型"}
          </Badge>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {connectionState ? (
          <ConnectionBanner result={connectionState} onDismiss={() => setConnectionState(null)} />
        ) : null}

        <div className="rounded-[30px] border border-cyan-400/10 bg-[linear-gradient(180deg,#08101d_0%,#091322_100%)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
          <div className={cn("space-y-4 overflow-y-auto pr-1", chatHeightClass)}>
            {messages.length === 0 ? (
              <div className="flex min-h-[500px] items-center justify-center rounded-[26px] border border-dashed border-cyan-400/12 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.08),transparent_35%),#0b1423] px-8 text-center">
                <div className="max-w-xl space-y-4">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl border border-cyan-400/16 bg-cyan-400/8 text-cyan-100">
                    <MessageSquareText className="h-7 w-7" />
                  </div>
                  <div>
                    <p className="text-xl font-black text-slate-50">開始一段新的對話</p>
                    <p className="mt-2 text-sm leading-7 text-slate-400">
                      {isChatOnly
                        ? "直接在下方輸入需求。你可以請 AI 整理工作、分析問題，或在模型支援時直接生成圖片。"
                        : "可以先按「測試連線」確認成功，再從下方開始提問。這個區塊會保留你本次工作區的上下文。"}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              messages.map((message) => <MessageCard key={message.id} message={message} />)
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

        <div className="rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,#0d1627_0%,#0a1220_100%)] p-4 shadow-[0_20px_44px_rgba(2,8,23,0.18),inset_0_1px_0_rgba(255,255,255,0.02)]">
          <div className="flex flex-col gap-3 border-b border-white/8 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <SectionTitle
              title={isChatOnly ? "輸入訊息" : "對話輸入"}
              description={
                isChatOnly
                  ? "你可以直接要求分析、整理，或在支援的模型上請 AI 生成圖片。"
                  : "支援連續追問，也能拿 API 設定一起驗證模型回覆。"
              }
            />
            <div className="flex gap-2">
              {!isChatOnly ? (
                <Button
                  type="button"
                  onClick={() => void handleConnectionTest()}
                  disabled={loading || !requestUrl}
                  className="h-10 rounded-2xl bg-emerald-500 px-4 font-bold text-slate-950 transition-all duration-200 hover:bg-emerald-400 active:scale-[0.99]"
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  {loading ? "測試中..." : "測試連線"}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                onClick={resetConversation}
                className="h-10 rounded-2xl border-cyan-400/16 bg-transparent px-4 font-bold text-slate-300 transition-all duration-200 hover:bg-cyan-400/8 hover:text-white active:scale-[0.99]"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                清空對話
              </Button>
            </div>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_196px]">
            <div className="space-y-3">
              <Textarea
                value={draftMessage}
                onChange={(event) => setDraftMessage(event.target.value)}
                placeholder="例如：幫我整理今天的站點異常重點，或生成一張 16:9 的機櫃配置概念圖。"
                className="min-h-[160px] rounded-[26px] border-cyan-400/14 bg-[linear-gradient(180deg,#08101d_0%,#09111c_100%)] text-[15px] leading-7 text-slate-100 transition-all duration-200 placeholder:text-slate-500 hover:border-cyan-300/22 focus:ring-2 focus:ring-cyan-400/18"
              />
              <div className="flex flex-wrap gap-2 text-xs text-slate-400">
                <span className="rounded-full border border-white/8 bg-white/5 px-3 py-1">
                  可連續追問
                </span>
                <span className="rounded-full border border-white/8 bg-white/5 px-3 py-1">
                  可整理需求
                </span>
                <span
                  className={cn(
                    "rounded-full px-3 py-1",
                    imageCapable
                      ? "border border-violet-300/18 bg-violet-400/10 text-violet-100"
                      : "border border-white/8 bg-white/5"
                  )}
                >
                  {imageCapable ? "本模型可嘗試生成圖片" : "若要出圖，請切換 image 模型"}
                </span>
              </div>
            </div>

            <div className="flex flex-col justify-between gap-3">
              <div className="rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,#0a1220_0%,#09101b_100%)] px-4 py-4">
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">
                  Status
                </p>
                <p className="mt-2 text-sm font-bold text-slate-100">
                  {canSend ? "可以送出" : "等待輸入"}
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-400">
                  {isChatOnly
                    ? "輸入訊息後按下送出，結果會直接留在這個對話空間。"
                    : "你也可以先做 API 測試，再開始正式對話。"}
                </p>
              </div>

              <Button
                type="button"
                onClick={() => void handleSend()}
                disabled={!canSend}
                className="h-14 rounded-[24px] bg-[linear-gradient(135deg,#22d3ee_0%,#7c3aed_100%)] font-bold text-white shadow-[0_18px_40px_-24px_rgba(34,211,238,0.55)] transition-all duration-200 hover:brightness-110 active:scale-[0.99]"
              >
                <Send className="mr-2 h-4 w-4" />
                {loading ? "送出中..." : "送出對話"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (isChatOnly) {
    return (
      <div className="grid min-h-[calc(100vh-132px)] w-full gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="rounded-[32px] border border-white/8 bg-[linear-gradient(180deg,#0f1729_0%,#09111d_100%)] p-4 shadow-[0_26px_72px_rgba(2,8,23,0.28)] xl:sticky xl:top-4 xl:h-[calc(100vh-164px)] xl:overflow-hidden">
          <div className="flex h-full flex-col gap-4">
            <div className="space-y-4 border-b border-white/8 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-400/18 bg-cyan-400/10 text-cyan-100">
                  <MessageSquareText className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-lg font-black text-slate-50">AI 對話空間</p>
                  <p className="text-xs text-slate-400">全寬聊天工作台</p>
                </div>
              </div>

              <Button
                type="button"
                onClick={resetConversation}
                className="h-11 w-full justify-start rounded-2xl bg-cyan-500 font-bold text-slate-950 hover:bg-cyan-400"
              >
                <Plus className="mr-2 h-4 w-4" />
                新對話
              </Button>

              <div className="grid gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={saveCurrentPrompt}
                  className="h-10 justify-start rounded-2xl border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 hover:text-white"
                >
                  <Bookmark className="mr-2 h-4 w-4" />
                  儲存提示詞
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={saveCurrentDraft}
                  className="h-10 justify-start rounded-2xl border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 hover:text-white"
                >
                  <Save className="mr-2 h-4 w-4" />
                  儲存草稿
                </Button>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
              <div className="rounded-[24px] border border-white/8 bg-[#0b1423] p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-slate-100">對話紀錄</p>
                    <p className="text-xs text-slate-400">保留最近建立的新對話</p>
                  </div>
                  <Badge className="border-white/10 bg-white/5 text-slate-300 hover:bg-white/5">
                    {savedConversations.length}
                  </Badge>
                </div>
                <div className="space-y-2">
                  {savedConversations.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/10 px-3 py-4 text-xs text-slate-500">
                      目前還沒有對話紀錄
                    </div>
                  ) : (
                    savedConversations.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-2xl border border-white/8 bg-white/5 p-3 transition-colors hover:border-cyan-300/16 hover:bg-white/8"
                      >
                        <button
                          type="button"
                          onClick={() => restoreConversation(item)}
                          className="w-full text-left"
                        >
                          <div className="flex items-start gap-2">
                            <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-cyan-200" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-slate-100">
                                {item.title}
                              </p>
                              <p className="mt-1 text-[11px] text-slate-500">
                                {formatSavedItemTime(item.savedAt)} · {item.provider} / {item.model}
                              </p>
                            </div>
                          </div>
                        </button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeSavedConversation(item.id)}
                          className="mt-2 h-8 w-8 rounded-xl text-slate-500 hover:bg-rose-500/10 hover:text-rose-200"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-[24px] border border-white/8 bg-[#0b1423] p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-slate-100">提示詞庫</p>
                    <p className="text-xs text-slate-400">點一下直接帶入輸入框</p>
                  </div>
                  <Badge className="border-white/10 bg-white/5 text-slate-300 hover:bg-white/5">
                    {savedPrompts.length}
                  </Badge>
                </div>
                <div className="space-y-2">
                  {savedPrompts.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/10 px-3 py-4 text-xs text-slate-500">
                      目前還沒有儲存提示詞
                    </div>
                  ) : (
                    savedPrompts.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-2xl border border-white/8 bg-white/5 p-3 transition-colors hover:border-cyan-300/16 hover:bg-white/8"
                      >
                        <button
                          type="button"
                          onClick={() => loadSavedItem(item.content)}
                          className="w-full text-left"
                        >
                          <div className="flex items-start gap-2">
                            <Bookmark className="mt-0.5 h-4 w-4 shrink-0 text-cyan-200" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-slate-100">
                                {item.title}
                              </p>
                              <p className="mt-1 text-[11px] text-slate-500">
                                {formatSavedItemTime(item.savedAt)}
                              </p>
                            </div>
                          </div>
                        </button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeSavedPrompt(item.id)}
                          className="mt-2 h-8 w-8 rounded-xl text-slate-500 hover:bg-rose-500/10 hover:text-rose-200"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-[24px] border border-white/8 bg-[#0b1423] p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-slate-100">草稿庫</p>
                    <p className="text-xs text-slate-400">保留尚未送出的內容</p>
                  </div>
                  <Badge className="border-white/10 bg-white/5 text-slate-300 hover:bg-white/5">
                    {savedDrafts.length}
                  </Badge>
                </div>
                <div className="space-y-2">
                  {savedDrafts.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/10 px-3 py-4 text-xs text-slate-500">
                      目前還沒有儲存草稿
                    </div>
                  ) : (
                    savedDrafts.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-2xl border border-white/8 bg-white/5 p-3 transition-colors hover:border-violet-300/16 hover:bg-white/8"
                      >
                        <button
                          type="button"
                          onClick={() => loadSavedItem(item.content)}
                          className="w-full text-left"
                        >
                          <div className="flex items-start gap-2">
                            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-violet-200" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-slate-100">
                                {item.title}
                              </p>
                              <p className="mt-1 text-[11px] text-slate-500">
                                {formatSavedItemTime(item.savedAt)}
                              </p>
                            </div>
                          </div>
                        </button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeSavedDraft(item.id)}
                          className="mt-2 h-8 w-8 rounded-xl text-slate-500 hover:bg-rose-500/10 hover:text-rose-200"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-[24px] border border-white/8 bg-[#0b1423] p-3">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
                Current API
              </p>
              <p className="mt-2 truncate text-sm font-bold text-slate-100">{activeKeyLabel}</p>
              <p className="mt-1 text-xs text-slate-400">
                {provider || "-"} / {model || "-"}
              </p>
            </div>
          </div>
        </aside>

        <div className="min-w-0">{conversationPanel}</div>
      </div>
    );
  }

  return (
    <Card className="overflow-hidden rounded-[36px] border border-cyan-400/12 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.06),transparent_32%),linear-gradient(180deg,#10192e_0%,#0a1322_100%)] shadow-[0_28px_90px_rgba(2,8,23,0.34)]">
      <CardHeader className="border-b border-white/8 pb-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/16 bg-cyan-400/8 px-3 py-1 text-xs font-bold tracking-[0.2em] text-cyan-100">
              <MessageSquareText className="h-3.5 w-3.5" />
              API CHAT CONSOLE
            </div>
            <div>
              <CardTitle className="text-3xl font-black tracking-tight text-slate-50">
                AI 對話控制台
              </CardTitle>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-400">
                這裡用來調整 API、模型與系統提示詞，並同步測試對話結果。
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[420px]">
            <MetricTile label="Current key" value={activeKeyLabel} caption="目前套用中的對話來源。" />
            <MetricTile
              label="Mode"
              value={modeLabel}
              caption={isGeminiProvider ? "目前已接通 Gemini 對話。" : "此 provider 尚未接對話流程。"}
            />
            <MetricTile
              label="Messages"
              value={totalMessages}
              caption="本次工作區內保留的對話訊息數。"
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 pt-6">
        <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="rounded-[28px] border border-white/8 bg-[#0b1423] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
              <div className="flex items-start justify-between gap-4">
                <SectionTitle
                  title="模型與憑證設定"
                  description="左側只負責 API 與模型控制；右側保留實際對話。"
                />
                <Badge className="rounded-full border border-cyan-300/18 bg-cyan-400/10 px-3 py-1 text-cyan-100 hover:bg-cyan-400/10">
                  {truncateMiddle(activeKeyLabel, 24)}
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
              <SectionTitle title="請求預覽" description="用來確認目前實際打到哪個模型端點。" />
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
                  onClick={resetConversation}
                  className="h-12 rounded-2xl border-cyan-400/16 bg-transparent font-bold text-slate-300 transition-all duration-200 hover:bg-cyan-400/8 hover:text-white active:scale-[0.99]"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  清空對話
                </Button>
              </div>
            </div>
          </div>

          {conversationPanel}
        </div>
      </CardContent>
    </Card>
  );
}
