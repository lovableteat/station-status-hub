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
  Paperclip,
  Plus,
  Send,
  Sparkles,
  Trash2,
  Upload,
  X,
  User,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useUser } from "@/components/auth/UserContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

import { ApiKeyRecord, normalizeApiKeyPermissions } from "./apiKeyHelpers";

interface ApiChatConsoleProps {
  selectedApiKey?: ApiKeyRecord | null;
  availableApiKeys?: ApiKeyRecord[];
  selectedApiKeyId?: null | string;
  onSelectApiKey?: (id: string) => void;
  mode?: "full" | "chat-only";
}

interface GeneratedImage {
  id: string;
  src: string;
  mimeType: string;
}

interface UploadedAttachment {
  id: string;
  inlineData: string;
  kind: "file" | "image";
  mimeType: string;
  name: string;
  size: number;
  src?: string;
}

interface ChatMessage {
  id: string;
  attachments?: UploadedAttachment[];
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
interface SharedPromptRow {
  command: string;
  created_at: string;
  created_by: null | string;
  description: string;
  id: string;
  name: string;
  updated_at: string;
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

const SAVED_CONVERSATIONS_STORAGE_KEY = "api-chat:saved-conversations";
const AUTO_SAVED_CONVERSATION_ID = "conversation-active-workspace";
const SHARED_PROMPT_CATEGORY = "ai_prompt";
const SHARED_PROMPT_PLATFORM = "api-chat";
const LEGACY_ASSISTANT_SYSTEM_PROMPT =
  "你是站點管理系統的 AI 助理，請用繁體中文直接回答，優先給可執行結論。";
const DEFAULT_QUERY_SYSTEM_PROMPT = [
  "你是使用者專屬的 AI 助理，請用繁體中文回覆。",
  "你可以支援資料查詢、工作討論、學習說明、內容整理與一般對話，但都要以使用者當前需求為主。",
  "當使用者在查資料或要你比對欄位時，請優先整理結果、重點與依據；若資訊不足，直接說缺少哪些資料，不要自行亂猜。",
  "不要主動岔題，也不要塞入無關建議；除非使用者要求，否則保持回答簡潔實用。",
].join(" ");
const DEFAULT_IMAGE_OCR_PROMPT =
  "請擷取我上傳圖片中的所有文字，保留欄位、換行、表格關係與關鍵代碼，不要加入無關建議，最後用繁體中文整理重點。";
const MAX_UPLOAD_ATTACHMENT_COUNT = 8;
const MAX_UPLOAD_FILE_BYTES = 15 * 1024 * 1024;
const SUPPORTED_ATTACHMENT_EXTENSIONS = new Set([
  "csv",
  "doc",
  "docx",
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "bmp",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "txt",
]);

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
  images: GeneratedImage[] = [],
  attachments: UploadedAttachment[] = []
): ChatMessage {
  return {
    attachments,
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

function formatFileSize(value: number) {
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (value >= 1024) {
    return `${Math.round(value / 1024)} KB`;
  }
  return `${value} B`;
}

function getFileExtension(name: string) {
  return name.split(".").pop()?.trim().toLowerCase() ?? "";
}

function isSupportedAttachment(file: File) {
  if (file.type.startsWith("image/")) return true;
  return SUPPORTED_ATTACHMENT_EXTENSIONS.has(getFileExtension(file.name));
}

function buildAttachmentFingerprint(attachment: UploadedAttachment) {
  return [
    attachment.kind,
    attachment.mimeType,
    attachment.name,
    attachment.size,
    attachment.inlineData.slice(0, 48),
  ].join(":");
}

function mapSharedPromptRowToItem(row: SharedPromptRow): SavedWorkspaceItem {
  return {
    id: row.id,
    title: row.name,
    content: row.command,
    savedAt: new Date(row.updated_at || row.created_at).getTime(),
  };
}

type GeminiRequestPart =
  | {
      text: string;
    }
  | {
      inlineData: {
        mimeType: string;
        data: string;
      };
    };

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
    messages: params.messages.map((message) => ({
      ...message,
      attachments: [],
      images: [],
    })),
    provider: params.provider,
    model: params.model,
    keyLabel: params.keyLabel,
  };
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("圖片讀取失敗"));
    reader.onerror = () => reject(new Error("圖片讀取失敗"));
    reader.readAsDataURL(file);
  });
}

async function createUploadedAttachmentFromFile(file: File): Promise<UploadedAttachment> {
  const dataUrl = await readFileAsDataUrl(file);
  const dataUrlMatch = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!dataUrlMatch) {
    throw new Error("附件讀取失敗");
  }

  const mimeType = dataUrlMatch[1] || file.type || "application/octet-stream";
  const kind = mimeType.startsWith("image/") ? "image" : "file";

  return {
    id: `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    inlineData: dataUrlMatch[2],
    kind,
    mimeType,
    name: file.name || `attachment-${Date.now()}`,
    size: file.size,
    src: kind === "image" ? dataUrl : undefined,
  };
}

function imageToGeminiRequestPart(image: GeneratedImage): GeminiRequestPart | null {
  const dataUrlMatch = image.src.match(/^data:([^;]+);base64,(.+)$/);

  if (!dataUrlMatch) return null;

  return {
    inlineData: {
      mimeType: dataUrlMatch[1] || image.mimeType || "image/png",
      data: dataUrlMatch[2],
    },
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

        {message.attachments?.length ? (
          <div className={cn("flex flex-wrap gap-2", message.content ? "mt-4" : "")}>
            {message.attachments.map((attachment, index) => (
              <div
                key={attachment.id}
                className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/35 px-3 py-2 text-xs text-slate-200"
              >
                {attachment.kind === "image" ? (
                  <ImageIcon className="h-3.5 w-3.5 text-cyan-200" />
                ) : (
                  <FileText className="h-3.5 w-3.5 text-cyan-200" />
                )}
                <span className="max-w-[180px] truncate">{attachment.name || `附件 ${index + 1}`}</span>
                <span className="text-slate-500">{formatFileSize(attachment.size)}</span>
              </div>
            ))}
          </div>
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
                    {isUser ? "上傳圖片" : "生成圖片"} {index + 1}
                  </div>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    {image.mimeType.replace("image/", "")}
                  </span>
                </div>
                <div className="bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.08),transparent_45%),#08101d] p-3">
                  <img
                    src={image.src}
                    alt={`${isUser ? "上傳圖片" : "AI 生成圖片"} ${index + 1}`}
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
  availableApiKeys = [],
  selectedApiKeyId,
  onSelectApiKey,
  mode = "full",
}: ApiChatConsoleProps) {
  const [apiKey, setApiKey] = useState("");
  const [provider, setProvider] = useState("gemini");
  const [model, setModel] = useState("gemini-2.5-flash");
  const [baseUrl, setBaseUrl] = useState("https://generativelanguage.googleapis.com/v1beta");
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_QUERY_SYSTEM_PROMPT);
  const [draftMessage, setDraftMessage] = useState("");
  const [savedPrompts, setSavedPrompts] = useState<SavedWorkspaceItem[]>([]);
  const [savedConversations, setSavedConversations] = useState<SavedConversation[]>([]);
  const [newConversationDialogOpen, setNewConversationDialogOpen] = useState(false);
  const [savePromptDialogOpen, setSavePromptDialogOpen] = useState(false);
  const [libraryApplyDialogOpen, setLibraryApplyDialogOpen] = useState(false);
  const [promptDialogTitle, setPromptDialogTitle] = useState("");
  const [promptDialogContent, setPromptDialogContent] = useState("");
  const [libraryApplyTitle, setLibraryApplyTitle] = useState("");
  const [libraryApplyContent, setLibraryApplyContent] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [uploadedAttachments, setUploadedAttachments] = useState<UploadedAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [connectionState, setConnectionState] = useState<ChatConnectionState | null>(null);
  const [conversationsLoaded, setConversationsLoaded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const hasHydratedConversationRef = useRef(false);
  const { user } = useUser();

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
    setUploadedAttachments([]);
    setConnectionState(null);
  }, [selectedApiKey, selectedMetadata]);

  useEffect(() => {
    setSystemPrompt((current) => {
      const normalized = current.trim();
      if (!normalized || normalized === LEGACY_ASSISTANT_SYSTEM_PROMPT) {
        return DEFAULT_QUERY_SYSTEM_PROMPT;
      }

      return current;
    });
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  useEffect(() => {
    if (!isChatOnly || typeof window === "undefined") return;
    let mounted = true;

    const loadSharedPrompts = async () => {
      try {
        const { data, error } = await supabase
          .from("command_library")
          .select("id,name,command,description,created_by,created_at,updated_at")
          .eq("category", SHARED_PROMPT_CATEGORY)
          .eq("platform", SHARED_PROMPT_PLATFORM)
          .eq("is_active", true)
          .order("updated_at", { ascending: false });

        if (error) throw error;
        if (!mounted) return;

        setSavedPrompts(((data ?? []) as SharedPromptRow[]).map(mapSharedPromptRowToItem));
      } catch (error) {
        console.error("Failed to load shared prompts:", error);
        if (mounted) setSavedPrompts([]);
      }
    };

    try {
      const conversationPayload = window.localStorage.getItem(SAVED_CONVERSATIONS_STORAGE_KEY);
      setSavedConversations(
        conversationPayload ? (JSON.parse(conversationPayload) as SavedConversation[]) : []
      );
    } catch (error) {
      console.error("Failed to load saved conversations:", error);
      setSavedConversations([]);
    }
    setConversationsLoaded(true);

    void loadSharedPrompts();

    const channel = supabase
      .channel("api-chat-shared-prompts")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "command_library" },
        () => {
          void loadSharedPrompts();
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      void supabase.removeChannel(channel);
    };
  }, [isChatOnly]);

  useEffect(() => {
    if (!isChatOnly || typeof window === "undefined") return;
    window.localStorage.setItem(
      SAVED_CONVERSATIONS_STORAGE_KEY,
      JSON.stringify(savedConversations)
    );
  }, [isChatOnly, savedConversations]);

  useEffect(() => {
    if (!isChatOnly || !conversationsLoaded || hasHydratedConversationRef.current) return;

    const activeConversation = savedConversations.find(
      (item) => item.id === AUTO_SAVED_CONVERSATION_ID
    );

    if (activeConversation) {
      setMessages(activeConversation.messages);
      setDraftMessage(activeConversation.draftMessage);
      setProvider(activeConversation.provider || "gemini");
      setModel(activeConversation.model || "gemini-2.5-flash");
      setConnectionState(null);
    }

    hasHydratedConversationRef.current = true;
  }, [conversationsLoaded, isChatOnly, savedConversations]);

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
      (draftMessage.trim() || uploadedAttachments.length > 0) &&
      !loading
  );

  const activeKeyLabel = selectedApiKey?.key_name || "尚未啟用 Gemini Key";
  const hasConversationContent =
    messages.length > 0 || draftMessage.trim().length > 0 || uploadedAttachments.length > 0;

  useEffect(() => {
    if (!isChatOnly || !conversationsLoaded || !hasHydratedConversationRef.current) return;

    if (!hasConversationContent) {
      setSavedConversations((current) =>
        current.filter((item) => item.id !== AUTO_SAVED_CONVERSATION_ID)
      );
      return;
    }

    const snapshot = createCurrentConversationSnapshot(AUTO_SAVED_CONVERSATION_ID);
    setSavedConversations((current) => [
      snapshot,
      ...current.filter((item) => item.id !== AUTO_SAVED_CONVERSATION_ID).slice(0, 23),
    ]);
  }, [
    activeKeyLabel,
    conversationsLoaded,
    draftMessage,
    hasConversationContent,
    isChatOnly,
    messages,
    model,
    provider,
    uploadedAttachments,
  ]);

  const buildGeminiContents = (history: ChatMessage[]) =>
    history.map((message) => {
      const parts: GeminiRequestPart[] = message.content ? [{ text: message.content }] : [];

      if (message.role === "user") {
        message.attachments?.forEach((attachment) => {
          parts.push({
            inlineData: {
              mimeType: attachment.mimeType,
              data: attachment.inlineData,
            },
          });
        });
      }

      return {
        role: message.role === "assistant" ? "model" : "user",
        parts: parts.length ? parts : [{ text: "" }],
      };
    });

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
            : "API 已正常回應，你可以直接繼續查詢。",
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
    const typedContent = draftMessage.trim();
    const content = typedContent || (uploadedAttachments.length ? DEFAULT_IMAGE_OCR_PROMPT : "");

    if (!content) {
      toast.error("請先輸入對話內容或上傳附件");
      return;
    }

    if (!isGeminiProvider) {
      toast.error("目前對話模式先支援 Gemini provider");
      return;
    }

    const userAttachments = [...uploadedAttachments];
    const userImages = userAttachments
      .filter((item) => item.kind === "image" && item.src)
      .map((item) => ({ id: item.id, src: item.src as string, mimeType: item.mimeType }));
    const userMessage = createMessage("user", content, "normal", userImages, userAttachments);
    const nextHistory = [...messages, userMessage];

    setMessages(nextHistory);
    setDraftMessage("");
    setUploadedAttachments([]);
    setLoading(true);

    try {
      const reply = await runGeminiRequest(nextHistory, "資料查詢", false);
      setMessages((current) => [
        ...current,
        createMessage("assistant", reply.text, "normal", reply.images),
      ]);
      toast.success(reply.images.length > 0 ? "結果已回傳並顯示" : "查詢完成");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "資料查詢失敗";
      setMessages((current) => [
        ...current,
        createMessage("assistant", `API 呼叫失敗：${errorMessage}`, "error"),
      ]);
      toast.error("資料查詢失敗");
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

  const getLatestUserMessage = () =>
    [...messages].reverse().find((message) => message.role === "user")?.content.trim() || "";

  const buildWorkspaceItemDraft = (fallbackTitle: string) => {
    const content = draftMessage.trim() || getLatestUserMessage();
    const titleSource = content || fallbackTitle;

    return {
      title: titleSource.split(/\r?\n/)[0].slice(0, 32) || fallbackTitle,
      content,
    };
  };

  const createCurrentConversationSnapshot = (id?: string): SavedConversation => {
    const snapshot = createSavedConversation({
      messages,
      draftMessage,
      provider,
      model,
      keyLabel: activeKeyLabel,
    });

    return {
      ...snapshot,
      id: id ?? snapshot.id,
      title:
        id === AUTO_SAVED_CONVERSATION_ID
          ? snapshot.title || "目前進行中的對話"
          : snapshot.title,
    };
  };

  const persistCurrentConversation = () => {
    if (messages.length === 0 && draftMessage.trim().length === 0) return false;

    setSavedConversations((current) => [
      createCurrentConversationSnapshot(),
      ...current.filter((item) => item.id !== AUTO_SAVED_CONVERSATION_ID),
    ].slice(0, 24));

    return true;
  };

  const requestResetConversation = () => {
    setNewConversationDialogOpen(true);
  };

  const resetConversation = () => {
    const archived = persistCurrentConversation();
    setMessages([]);
    setDraftMessage("");
    setUploadedAttachments([]);
    setConnectionState(null);
    setNewConversationDialogOpen(false);
    toast.success(archived ? "已建立新對話，上一段內容已保留" : "已建立新對話");
  };

  const openSavePromptDialog = () => {
    const draft = buildWorkspaceItemDraft("新提示詞");
    setPromptDialogTitle(draft.title);
    setPromptDialogContent(draft.content);
    setSavePromptDialogOpen(true);
  };

  const saveCurrentPrompt = () => {
    void (async () => {
      const content = promptDialogContent.trim();
      if (!content) {
        toast.error("請先填入提示詞內容");
        return;
      }

      const title = promptDialogTitle.trim() || content.split(/\r?\n/)[0] || "未命名提示詞";
      const { error } = await supabase.from("command_library").insert({
        category: SHARED_PROMPT_CATEGORY,
        platform: SHARED_PROMPT_PLATFORM,
        name: title.slice(0, 32),
        command: content,
        description: "AI 查詢共享提示詞",
        created_by: user?.username || user?.displayName || null,
        examples: null,
        notes: null,
        tags: ["shared", "ai-workspace", "prompt"],
        is_active: true,
      });

      if (error) {
        console.error("Failed to save shared prompt:", error);
        toast.error("共享提示詞儲存失敗");
        return;
      }

      setSavePromptDialogOpen(false);
      toast.success("共享提示詞已儲存");
    })();
  };

  const openLibraryApplyDialog = (item: SavedWorkspaceItem) => {
    setLibraryApplyTitle(item.title);
    setLibraryApplyContent(item.content);
    setLibraryApplyDialogOpen(true);
  };

  const applyLibraryItemToDraft = () => {
    const content = libraryApplyContent.trim();
    if (!content) {
      toast.error("請先填入要套用的內容");
      return;
    }

    setDraftMessage(content);
    setLibraryApplyDialogOpen(false);
    toast.success("已套用到 AI 輸入框，尚未自動送出");
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
    void (async () => {
      const { error } = await supabase.from("command_library").delete().eq("id", id);
      if (error) {
        console.error("Failed to delete shared prompt:", error);
        toast.error("刪除共享提示詞失敗");
        return;
      }

      setSavedPrompts((current) => current.filter((item) => item.id !== id));
      toast.success("共享提示詞已刪除");
    })();
  };

  const removeSavedConversation = (id: string) => {
    setSavedConversations((current) => current.filter((item) => item.id !== id));
  };

  const appendUploadedFiles = async (files: File[]) => {
    if (!files.length) return;
    const availableSlots = MAX_UPLOAD_ATTACHMENT_COUNT - uploadedAttachments.length;

    if (availableSlots <= 0) {
      toast.error(`一次最多加入 ${MAX_UPLOAD_ATTACHMENT_COUNT} 個附件`);
      return;
    }

    const selectedFiles = files.slice(0, availableSlots);
    const validFiles = selectedFiles.filter((file) => {
      if (!isSupportedAttachment(file)) {
        toast.error(`${file.name} 不是支援的格式`);
        return false;
      }

      if (file.size > MAX_UPLOAD_FILE_BYTES) {
        toast.error(`${file.name} 超過 15MB`);
        return false;
      }

      return true;
    });

    if (!validFiles.length) return;

    try {
      const attachments = await Promise.all(validFiles.map(createUploadedAttachmentFromFile));
      setUploadedAttachments((current) => {
        const seen = new Set(current.map(buildAttachmentFingerprint));
        const deduped = attachments.filter((attachment) => {
          const fingerprint = buildAttachmentFingerprint(attachment);
          if (seen.has(fingerprint)) return false;
          seen.add(fingerprint);
          return true;
        });
        return [...current, ...deduped].slice(0, MAX_UPLOAD_ATTACHMENT_COUNT);
      });
      toast.success(`已加入 ${attachments.length} 個附件`);
    } catch (error) {
      console.error(error);
      toast.error("附件讀取失敗");
    }
  };

  const handleImageUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    await appendUploadedFiles(Array.from(files));
  };

  const handleClipboardPaste = async (items: ClipboardItem[] | DataTransferItemList) => {
    const imageFiles: File[] = [];

    Array.from(items).forEach((item) => {
      const file = "getAsFile" in item ? item.getAsFile() : null;
      if (file && file.type.startsWith("image/")) {
        imageFiles.push(file);
      }
    });

    if (!imageFiles.length) return false;
    await appendUploadedFiles(imageFiles);
    return true;
  };

  const removeUploadedAttachment = (id: string) => {
    setUploadedAttachments((current) => current.filter((attachment) => attachment.id !== id));
  };

  const totalMessages = messages.length.toString();
  const modeLabel = isGeminiProvider ? "可對話" : "待擴充";
  const chatHeightClass = isChatOnly
    ? "min-h-[520px] max-h-[calc(100vh-310px)]"
    : "min-h-[560px] max-h-[560px]";

  const workspaceDialogs = (
    <>
      <Dialog open={newConversationDialogOpen} onOpenChange={setNewConversationDialogOpen}>
        <DialogContent className="max-w-xl border-cyan-400/20 bg-[linear-gradient(180deg,#0f1729_0%,#09111d_100%)] text-slate-100 shadow-[0_32px_90px_rgba(2,8,23,0.46)]">
          <DialogHeader className="space-y-3">
            <DialogTitle className="text-2xl font-black text-slate-50">建立新對話</DialogTitle>
            <DialogDescription className="text-sm leading-6 text-slate-400">
              這個動作會把目前視窗清空。若你已經有聊天內容或輸入中的文字，系統會先自動存到左側的對話紀錄。
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[22px] border border-cyan-400/14 bg-cyan-400/8 px-4 py-4">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-100/80">
                Messages
              </p>
              <p className="mt-2 text-2xl font-black text-slate-50">{messages.length}</p>
              <p className="mt-1 text-xs text-slate-400">目前已經建立的對話訊息。</p>
            </div>
            <div className="rounded-[22px] border border-violet-300/14 bg-violet-400/8 px-4 py-4">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-violet-100/80">
                Draft
              </p>
              <p className="mt-2 text-2xl font-black text-slate-50">
                {draftMessage.trim().length ? "已填寫" : "空白"}
              </p>
              <p className="mt-1 text-xs text-slate-400">輸入框尚未送出的內容狀態。</p>
            </div>
            <div className="rounded-[22px] border border-amber-300/14 bg-amber-400/8 px-4 py-4">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-100/80">
                Attachments
              </p>
              <p className="mt-2 text-2xl font-black text-slate-50">{uploadedAttachments.length}</p>
              <p className="mt-1 text-xs text-slate-400">尚未送出的附件會直接清空。</p>
            </div>
          </div>

          <div className="rounded-[24px] border border-white/8 bg-white/5 px-4 py-4 text-sm leading-6 text-slate-300">
            {hasConversationContent
              ? "按下確認後會切到全新對話；文字與聊天紀錄會保留到左側清單，未送出的附件會直接移除。"
              : "目前沒有未儲存內容，按下確認後會直接建立乾淨的新對話。"}
          </div>

          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setNewConversationDialogOpen(false)}
              className="h-11 rounded-2xl border-white/10 bg-white/5 px-5 text-slate-200 hover:bg-white/10 hover:text-white"
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={resetConversation}
              className="h-11 rounded-2xl bg-[linear-gradient(135deg,#22d3ee_0%,#7c3aed_100%)] px-5 font-bold text-white shadow-[0_18px_44px_-28px_rgba(34,211,238,0.55)] hover:brightness-110"
            >
              確認建立
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={savePromptDialogOpen} onOpenChange={setSavePromptDialogOpen}>
        <DialogContent className="max-w-2xl border-cyan-400/20 bg-[linear-gradient(180deg,#0f1729_0%,#09111d_100%)] text-slate-100 shadow-[0_32px_90px_rgba(2,8,23,0.46)]">
          <DialogHeader className="space-y-3">
            <DialogTitle className="text-2xl font-black text-slate-50">儲存共享提示詞</DialogTitle>
            <DialogDescription className="text-sm leading-6 text-slate-400">
              在視窗裡先確認標題與內容，再存進共享提示詞庫。其他使用者重新開頁後也能直接使用。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-bold text-slate-200">提示詞名稱</Label>
              <Input
                data-ai-surface="true"
                value={promptDialogTitle}
                onChange={(event) => setPromptDialogTitle(event.target.value)}
                placeholder="例如：每日異常摘要"
                className="h-12 rounded-2xl border-cyan-400/14 bg-[#09111f] text-slate-100 placeholder:text-slate-500 hover:border-cyan-300/22 focus:ring-2 focus:ring-cyan-400/18"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-bold text-slate-200">提示詞內容</Label>
              <Textarea
                data-ai-surface="true"
                value={promptDialogContent}
                onChange={(event) => setPromptDialogContent(event.target.value)}
                placeholder="請直接輸入要保存的提示詞內容"
                className="min-h-[220px] rounded-[24px] border-cyan-400/14 bg-[#09111f] text-[15px] leading-7 text-slate-100 placeholder:text-slate-500 hover:border-cyan-300/22 focus:ring-2 focus:ring-cyan-400/18"
              />
              <p className="text-xs text-slate-500">
                建議把常用格式、回覆要求或固定流程寫完整，之後所有人都能直接套用。
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setSavePromptDialogOpen(false)}
              className="h-11 rounded-2xl border-white/10 bg-white/5 px-5 text-slate-200 hover:bg-white/10 hover:text-white"
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={saveCurrentPrompt}
              disabled={!promptDialogContent.trim()}
              className="h-11 rounded-2xl bg-cyan-500 px-5 font-bold text-slate-950 shadow-[0_18px_44px_-28px_rgba(34,211,238,0.55)] hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Bookmark className="mr-2 h-4 w-4" />
              儲存共享提示詞
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={libraryApplyDialogOpen} onOpenChange={setLibraryApplyDialogOpen}>
        <DialogContent className="max-w-2xl border-cyan-400/20 bg-[linear-gradient(180deg,#0f1729_0%,#09111d_100%)] text-slate-100 shadow-[0_32px_90px_rgba(2,8,23,0.46)]">
          <DialogHeader className="space-y-3">
            <DialogTitle className="text-2xl font-black text-slate-50">調整提示詞後套用</DialogTitle>
            <DialogDescription className="text-sm leading-6 text-slate-400">
              先在這裡修改內容，再套用到 AI 輸入框。套用後不會自動送出，你可以繼續補字再問。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-bold text-slate-200">名稱</Label>
              <Input
                value={libraryApplyTitle}
                onChange={(event) => setLibraryApplyTitle(event.target.value)}
                placeholder="提示詞名稱"
                className="h-12 rounded-2xl border-cyan-400/14 bg-[#09111f] text-slate-100 placeholder:text-slate-500 hover:border-cyan-300/22 focus:ring-2 focus:ring-cyan-400/18"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-bold text-slate-200">要套用給 AI 的內容</Label>
              <Textarea
                value={libraryApplyContent}
                onChange={(event) => setLibraryApplyContent(event.target.value)}
                placeholder="先在這裡調整內容，再套用到輸入框"
                className="min-h-[240px] rounded-[24px] border-cyan-400/14 bg-[#09111f] text-[15px] leading-7 text-slate-100 placeholder:text-slate-500 hover:border-cyan-300/22 focus:ring-2 focus:ring-cyan-400/18"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setLibraryApplyDialogOpen(false)}
              className="h-11 rounded-2xl border-white/10 bg-white/5 px-5 text-slate-200 hover:bg-white/10 hover:text-white"
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={applyLibraryItemToDraft}
              disabled={!libraryApplyContent.trim()}
              className="h-11 rounded-2xl bg-cyan-500 px-5 font-bold text-slate-950 shadow-[0_18px_44px_-28px_rgba(34,211,238,0.55)] hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              套用到 AI 輸入框
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  const conversationPanel = (
    <div className="rounded-[36px] border border-cyan-400/10 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.05),transparent_28%),linear-gradient(180deg,#0f1729_0%,#0a111d_100%)] p-4 shadow-[0_28px_80px_rgba(2,8,23,0.28)]">
      <div className="flex flex-col gap-3 border-b border-white/8 px-2 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-400/18 bg-cyan-400/10 text-cyan-100">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <p className="text-lg font-black text-slate-50">查詢視窗</p>
            <p className="text-sm leading-6 text-slate-400">
              保留本次上下文，適合連續查詢、比對欄位與擷取圖片文字。
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isChatOnly ? (
            <div className="min-w-[240px]">
              <Select
                value={selectedApiKeyId ?? selectedApiKey?.id ?? ""}
                onValueChange={(value) => onSelectApiKey?.(value)}
              >
                <SelectTrigger className="h-9 rounded-full border-white/10 bg-white/5 px-3 text-left text-slate-100">
                  <SelectValue placeholder="選擇模型" />
                </SelectTrigger>
                <SelectContent className="border-cyan-400/15 bg-[#0d1727] text-slate-100">
                  {availableApiKeys.map((apiKey) => {
                    const metadata = normalizeApiKeyPermissions(apiKey.permissions).metadata;
                    return (
                      <SelectItem key={apiKey.id} value={apiKey.id}>
                        {apiKey.key_name} · {metadata.provider || "-"} / {metadata.model || "-"}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          ) : null}
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
            {imageCapable ? "可生成圖片" : "可讀圖片"}
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
                    <p className="text-xl font-black text-slate-50">開始新的資料查詢</p>
                    <p className="mt-2 text-sm leading-7 text-slate-400">
                      {isChatOnly
                        ? "直接在下方輸入要查的內容，系統會依本次上下文回傳查詢結果、整理重點或圖片文字。"
                        : "可以先按「測試連線」確認成功，再從下方開始查詢。這個區塊會保留你本次工作區的上下文。"}
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
                  查詢中...
                </div>
              </div>
            ) : null}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="rounded-[30px] border border-white/8 bg-[linear-gradient(180deg,#0d1627_0%,#0a1220_100%)] p-4 shadow-[0_20px_44px_rgba(2,8,23,0.18),inset_0_1px_0_rgba(255,255,255,0.02)]">
          <div className="flex flex-col gap-3 border-b border-white/8 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <SectionTitle
              title="查詢輸入"
              description={
                isChatOnly
                  ? "可直接貼查詢條件、料號、欄位需求，或上傳附件擷取內容。"
                  : "支援連續查詢，也能拿 API 設定一起驗證回覆結果。"
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
                onClick={requestResetConversation}
                className="h-10 rounded-2xl border-cyan-400/16 bg-transparent px-4 font-bold text-slate-300 transition-all duration-200 hover:bg-cyan-400/8 hover:text-white active:scale-[0.99]"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                清空對話
              </Button>
            </div>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_196px]">
            <div className="space-y-3">
              <input
                ref={imageInputRef}
                type="file"
                accept=".csv,.doc,.docx,.pdf,.png,.jpg,.jpeg,.webp,.gif,.bmp,.xls,.xlsx,.ppt,.pptx,.txt,image/*,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                multiple
                className="hidden"
                onChange={(event) => {
                  void handleImageUpload(event.currentTarget.files);
                  event.currentTarget.value = "";
                }}
              />
              <div className="rounded-[24px] border border-cyan-300/14 bg-[linear-gradient(135deg,rgba(34,211,238,0.12),rgba(15,23,42,0.88))] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-2">
                    <p className="text-sm font-black text-slate-50">附件上傳與手動截圖</p>
                    <p className="text-xs leading-5 text-slate-300">
                      可直接上傳圖片、PDF、PPT、Excel、Word、TXT，也支援你手動截圖後直接貼上。
                    </p>
                    <div className="flex flex-wrap gap-2 text-[11px] font-semibold text-slate-200">
                      <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1">
                        支援 Ctrl+V / 貼上截圖
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1">
                        最多 {MAX_UPLOAD_ATTACHMENT_COUNT} 個附件
                      </span>
                      <span className="rounded-full border border-cyan-300/18 bg-cyan-400/10 px-3 py-1 text-cyan-100">
                        單檔上限 15MB
                      </span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => imageInputRef.current?.click()}
                    disabled={loading || uploadedAttachments.length >= MAX_UPLOAD_ATTACHMENT_COUNT}
                    className="h-11 rounded-2xl border-cyan-300/24 bg-[#17314a]/70 px-5 font-bold text-cyan-50 transition-all duration-200 hover:bg-[#204766] hover:text-white active:scale-[0.99]"
                  >
                    <Paperclip className="mr-2 h-4 w-4" />
                    上傳附件 / 截圖
                  </Button>
                </div>
              </div>

              {uploadedAttachments.length ? (
                <div className="space-y-2">
                  <div className="flex max-h-[196px] flex-col gap-2 overflow-y-auto pr-1">
                    {uploadedAttachments.map((attachment, index) => (
                      <div
                        key={attachment.id}
                        className="flex items-center gap-3 rounded-2xl border border-cyan-300/14 bg-[#07101c] px-3 py-3"
                      >
                        {attachment.kind === "image" && attachment.src ? (
                          <img
                            src={attachment.src}
                            alt={`待上傳圖片 ${index + 1}`}
                            className="h-16 w-16 rounded-xl border border-white/10 bg-slate-950/40 object-cover"
                          />
                        ) : (
                          <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-white/10 bg-slate-950/40 text-cyan-100">
                            <FileText className="h-6 w-6" />
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-slate-100">
                            {attachment.name}
                          </p>
                          <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-400">
                            <span>{attachment.kind === "image" ? "圖片" : "檔案"}</span>
                            <span>{attachment.mimeType}</span>
                            <span>{formatFileSize(attachment.size)}</span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeUploadedAttachment(attachment.id)}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/8 text-slate-200 transition-colors hover:bg-rose-500/20 hover:text-rose-100"
                          aria-label={`移除附件 ${index + 1}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <Textarea
                data-ai-surface="true"
                value={draftMessage}
                onChange={(event) => setDraftMessage(event.target.value)}
                onPaste={(event) => {
                  if (!event.clipboardData?.items?.length) return;
                  void (async () => {
                    const handled = await handleClipboardPaste(event.clipboardData.items);
                    if (handled) {
                      event.preventDefault();
                    }
                  })();
                }}
                placeholder="例如：查這批料號的狀態差異，或上傳 PDF / Excel / PPT，或直接 Ctrl+V 貼上手動截圖。"
                className="min-h-[168px] rounded-[26px] border-cyan-400/14 bg-[linear-gradient(180deg,#0b1525_0%,#0d182a_100%)] text-[15px] leading-7 text-slate-100 transition-all duration-200 placeholder:text-slate-500 hover:border-cyan-300/22 focus:ring-2 focus:ring-cyan-400/18"
              />
              <div className="flex flex-wrap gap-2 text-xs text-slate-400">
                <span className="rounded-full border border-white/8 bg-white/5 px-3 py-1">
                  可連續追問
                </span>
                <span className="rounded-full border border-white/8 bg-white/5 px-3 py-1">
                  可貼上手動截圖
                </span>
                <span className="rounded-full border border-white/8 bg-white/5 px-3 py-1">
                  可上傳 PDF / PPT / Excel
                </span>
                <span
                  className={cn(
                    "rounded-full px-3 py-1",
                    imageCapable
                      ? "border border-violet-300/18 bg-violet-400/10 text-violet-100"
                      : "border border-white/8 bg-white/5"
                  )}
                >
                  {imageCapable ? "可生成圖片與讀圖" : "可讀圖片抽文字"}
                </span>
              </div>
            </div>

            <div className="flex flex-col justify-between gap-3">
              <div className="rounded-[28px] border border-cyan-300/12 bg-[linear-gradient(180deg,#132238_0%,#0f1c2f_100%)] px-4 py-4 shadow-[0_18px_40px_rgba(2,8,23,0.18)]">
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border",
                      canSend
                        ? "border-emerald-300/24 bg-emerald-400/14 text-emerald-100"
                        : "border-white/10 bg-white/6 text-slate-300"
                    )}
                  >
                    <Send className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">
                      查詢狀態
                    </p>
                    <p className="mt-2 text-base font-black text-slate-50">
                      {canSend ? "可以送出查詢" : "等待你輸入內容"}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-300">
                      {isChatOnly
                        ? "輸入文字、上傳附件，或直接貼上手動截圖後就能送出。結果會留在這個工作區持續追問。"
                        : "你也可以先測試 API，再正式送出查詢。"}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-2">
                  <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
                    <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-slate-200">
                      {draftMessage.trim() ? "已輸入文字" : "尚未輸入文字"}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-slate-200">
                      已附附件 {uploadedAttachments.length} 個
                    </span>
                    <span className="rounded-full border border-cyan-300/18 bg-cyan-400/10 px-3 py-1 text-cyan-100">
                      {provider || "-"} / {model || "-"}
                    </span>
                  </div>
                </div>
              </div>

              <Button
                type="button"
                onClick={() => void handleSend()}
                disabled={!canSend}
                className="h-14 rounded-[24px] bg-[linear-gradient(135deg,#38bdf8_0%,#22d3ee_48%,#34d399_100%)] font-bold text-slate-950 shadow-[0_18px_40px_-24px_rgba(56,189,248,0.55)] transition-all duration-200 hover:brightness-110 active:scale-[0.99] disabled:bg-[linear-gradient(135deg,#334155_0%,#475569_100%)] disabled:text-slate-300"
              >
                <Send className="mr-2 h-4 w-4" />
                {loading ? "送出中..." : "送出查詢"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (isChatOnly) {
    return (
      <>
        {workspaceDialogs}
        <div className="grid min-h-[calc(100vh-132px)] w-full items-stretch gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="h-full rounded-[32px] border border-white/8 bg-[linear-gradient(180deg,#0f1729_0%,#09111d_100%)] p-4 shadow-[0_26px_72px_rgba(2,8,23,0.28)] xl:self-stretch">
            <div className="flex h-full flex-col gap-4">
            <div className="space-y-4 border-b border-white/8 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-400/18 bg-cyan-400/10 text-cyan-100">
                  <MessageSquareText className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-lg font-black text-slate-50">資料查詢空間</p>
                  <p className="text-xs text-slate-400">查資料 / 對話學習 / 整理結果</p>
                </div>
              </div>

              <Button
                type="button"
                onClick={requestResetConversation}
                className="h-11 w-full justify-start rounded-2xl bg-cyan-500 font-bold text-slate-950 hover:bg-cyan-400"
              >
                <Plus className="mr-2 h-4 w-4" />
                新對話
              </Button>

              <div className="grid gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={openSavePromptDialog}
                  className="h-10 justify-start rounded-2xl border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 hover:text-white"
                >
                  <Bookmark className="mr-2 h-4 w-4" />
                  儲存共享提示詞
                </Button>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
              <div className="rounded-[24px] border border-white/8 bg-[#0b1423] p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-slate-100">對話紀錄</p>
                    <p className="text-xs text-slate-400">保留最近建立的查詢紀錄</p>
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
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => restoreConversation(item)}
                            className="h-8 rounded-xl border-cyan-300/16 bg-cyan-400/8 text-xs font-bold text-cyan-100 hover:bg-cyan-400/14 hover:text-white"
                          >
                            恢復
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => removeSavedConversation(item.id)}
                            className="h-8 rounded-xl border-rose-300/16 bg-rose-500/8 text-xs font-bold text-rose-100 hover:bg-rose-500/14 hover:text-white"
                          >
                            刪除
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-[24px] border border-white/8 bg-[#0b1423] p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-slate-100">共享提示詞</p>
                    <p className="text-xs text-slate-400">所有使用者共用，先開視窗調整再套用給 AI</p>
                  </div>
                  <Badge className="border-white/10 bg-white/5 text-slate-300 hover:bg-white/5">
                    {savedPrompts.length}
                  </Badge>
                </div>
                <div className="space-y-2">
                  {savedPrompts.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/10 px-3 py-4 text-xs text-slate-500">
                      目前還沒有共享提示詞
                    </div>
                  ) : (
                    savedPrompts.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-2xl border border-white/8 bg-white/5 p-3 transition-colors hover:border-cyan-300/16 hover:bg-white/8"
                      >
                        <button
                          type="button"
                          onClick={() => openLibraryApplyDialog(item)}
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
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => openLibraryApplyDialog(item)}
                            className="h-8 rounded-xl border-cyan-300/16 bg-cyan-400/8 text-xs font-bold text-cyan-100 hover:bg-cyan-400/14 hover:text-white"
                          >
                            開啟調整
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => removeSavedPrompt(item.id)}
                            className="h-8 rounded-xl border-rose-300/16 bg-rose-500/8 text-xs font-bold text-rose-100 hover:bg-rose-500/14 hover:text-white"
                          >
                            刪除
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-[24px] border border-white/8 bg-[#0b1423] p-3">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
                目前模型
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
      </>
    );
  }

  return (
    <>
      {workspaceDialogs}
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
                  API 資料查詢控制台
                </CardTitle>
                <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-400">
                  這裡用來調整 API、模型與系統提示詞，並同步測試查詢結果。
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[420px]">
              <MetricTile label="Current key" value={activeKeyLabel} caption="目前套用中的查詢來源。" />
              <MetricTile
                label="Mode"
                value={modeLabel}
                caption={isGeminiProvider ? "目前已接通 Gemini 查詢。" : "此 provider 尚未接查詢流程。"}
              />
              <MetricTile
                label="Messages"
                value={totalMessages}
                caption="本次工作區內保留的查詢訊息數。"
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
                    description="左側只負責 API 與模型控制；右側保留實際查詢結果。"
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
                        data-ai-surface="true"
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
                        data-ai-surface="true"
                        value={provider}
                        onChange={(event) => setProvider(event.target.value)}
                        placeholder="gemini"
                        className="h-12 rounded-2xl border-cyan-400/14 bg-[#09111f] text-slate-100 transition-all duration-200 placeholder:text-slate-500 hover:border-cyan-300/22 focus:ring-2 focus:ring-cyan-400/18"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-bold text-slate-300">Model</Label>
                      <Input
                        data-ai-surface="true"
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
                      data-ai-surface="true"
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
                  description="先定義查詢規則與輸出格式，API 回傳會依這裡的規則執行。"
                />
                <Textarea
                  data-ai-surface="true"
                  value={systemPrompt}
                  onChange={(event) => setSystemPrompt(event.target.value)}
                  placeholder="定義資料查詢規則、輸出格式與限制條件"
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
                    onClick={requestResetConversation}
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
    </>
  );
}
