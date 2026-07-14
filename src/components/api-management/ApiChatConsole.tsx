import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent as ReactDragEvent } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Bookmark,
  Bot,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  History,
  ImageIcon,
  KeyRound,
  LibraryBig,
  MessageSquareText,
  Paperclip,
  Plus,
  Search,
  Send,
  Sparkles,
  Trash2,
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

import {
  buildProviderChatRequest,
  getProviderErrorMessage,
  parseProviderChatResponse,
  redactSensitiveText,
  resolveAiProviderPreset,
} from "./aiProviderCatalog";
import type { ProviderChatMessage } from "./aiProviderCatalog";
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
const MAX_UPLOAD_FILE_BYTES = 100 * 1024 * 1024;
const RETRYABLE_GEMINI_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const GEMINI_DEMAND_ERROR_PATTERN =
  /high demand|resource exhausted|quota|rate limit|too many requests|temporarily unavailable|overloaded|service unavailable/i;
const GEMINI_RETRY_DELAYS_MS = [900, 1800];
const GEMINI_KEY_COOLDOWN_MS = 90 * 1000;
const SHARED_PROMPT_TEMPLATES = [
  {
    title: "每日異常摘要",
    description: "整理異常與處理順序",
    content:
      "請整理我提供的機台資料，依嚴重程度列出異常站點、影響範圍、可能原因與建議處理順序，最後用表格摘要。",
  },
  {
    title: "附件差異比對",
    description: "比對 Excel、PDF 或清單",
    content:
      "請比對我上傳的附件，整理欄位差異、缺漏資料、重複項目與需要人工確認的內容，並清楚標示資料來源。",
  },
  {
    title: "文件重點擷取",
    description: "擷取圖片與文件內容",
    content:
      "請擷取我上傳圖片或文件中的文字、表格、料號與關鍵代碼，保留原本欄位關係，最後用繁體中文整理重點。",
  },
] as const;
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

interface ProviderRequestTarget {
  id: string;
  apiKey: string;
  baseUrl: string;
  cooldownUntil: number;
  isSelected: boolean;
  keyLabel: string;
  lastUsedAt: null | string;
  model: string;
  provider: string;
  usageCount: number;
}

interface ProviderAttemptFailure {
  demandRelated: boolean;
  endpoint: string;
  keyLabel: string;
  message: string;
  model: string;
  retryable: boolean;
  status?: number;
  targetId: string;
}

function looksLikeImageModel(model: string) {
  return /image|nano banana/i.test(model);
}

function getTimeValue(value: null | string | undefined) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isDemandRelatedProviderFailure(status: number | undefined, message: string) {
  return status === 429 || status === 503 || GEMINI_DEMAND_ERROR_PATTERN.test(message);
}

function isRetryableProviderFailure(status: number | undefined, message: string) {
  return (
    (typeof status === "number" && RETRYABLE_GEMINI_STATUS_CODES.has(status)) ||
    isDemandRelatedProviderFailure(status, message) ||
    /failed to fetch|networkerror|network request failed|timeout/i.test(message)
  );
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

function QueryLoadingCard() {
  return (
    <div className="flex gap-3">
      <div className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-400/18 bg-emerald-400/10 text-emerald-100">
        <Bot className="h-4.5 w-4.5" />
      </div>
      <div className="max-w-[88%] overflow-hidden rounded-[24px] border border-emerald-400/12 bg-[linear-gradient(180deg,#09110f_0%,#05080a_100%)] px-5 py-4 text-slate-200 shadow-[0_16px_36px_rgba(0,0,0,0.28)]">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-emerald-100">查詢中</span>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-300/90 animate-pulse [animation-delay:180ms]" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-200/80 animate-pulse [animation-delay:360ms]" />
          </div>
        </div>
        <div className="mt-3 space-y-2">
          <div className="h-2 rounded-full bg-white/6">
            <div className="h-2 w-2/3 rounded-full bg-[linear-gradient(90deg,rgba(16,185,129,0.15),rgba(52,211,153,0.7),rgba(16,185,129,0.15))] animate-pulse" />
          </div>
          <div className="h-2 rounded-full bg-white/6">
            <div className="h-2 w-1/2 rounded-full bg-[linear-gradient(90deg,rgba(16,185,129,0.12),rgba(110,231,183,0.58),rgba(16,185,129,0.12))] animate-pulse [animation-delay:240ms]" />
          </div>
        </div>
      </div>
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
  const [keyCooldowns, setKeyCooldowns] = useState<Record<string, number>>({});
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isDragOverComposer, setIsDragOverComposer] = useState(false);
  const [conversationsLoaded, setConversationsLoaded] = useState(false);
  const chatConsoleRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const composerDragDepthRef = useRef(0);
  const hasHydratedConversationRef = useRef(false);
  const previousSelectedApiKeyIdRef = useRef<null | string>(null);
  const { user } = useUser();

  const isChatOnly = mode === "chat-only";

  const selectedMetadata = useMemo(() => {
    return selectedApiKey
      ? normalizeApiKeyPermissions(selectedApiKey.permissions).metadata
      : null;
  }, [selectedApiKey]);

  useEffect(() => {
    if (!selectedApiKey) return;

    const nextApiKeyId = selectedApiKey.id;
    const previousApiKeyId = previousSelectedApiKeyIdRef.current;
    const switchedApiKey = Boolean(previousApiKeyId && previousApiKeyId !== nextApiKeyId);

    setApiKey(selectedApiKey.api_key);
    setProvider(selectedMetadata?.provider || "gemini");
    setModel(selectedMetadata?.model || "gemini-2.5-flash");
    setBaseUrl(selectedMetadata?.baseUrl || "https://generativelanguage.googleapis.com/v1beta");

    previousSelectedApiKeyIdRef.current = nextApiKeyId;

    if (!switchedApiKey) return;

    setMessages([]);
    setDraftMessage("");
    setUploadedAttachments([]);
    setConnectionState(null);
    toast.success("已切換 API Key，已開始新對話");
  }, [
    selectedApiKey,
    selectedMetadata?.baseUrl,
    selectedMetadata?.model,
    selectedMetadata?.provider,
  ]);

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
    if (!messages.length && !loading) return;
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
      setConnectionState(null);
    }

    hasHydratedConversationRef.current = true;
  }, [conversationsLoaded, isChatOnly, savedConversations]);

  const normalizedProvider = provider.trim().toLowerCase();
  const activeProviderPreset = resolveAiProviderPreset(normalizedProvider);
  const activeKeyLabel = selectedApiKey?.key_name || "尚未啟用 AI Key";

  const requestUrl = useMemo(() => {
    if (!apiKey.trim() || !model.trim() || !baseUrl.trim()) return "";
    return buildProviderChatRequest({
      provider: provider.trim(),
      apiKey: apiKey.trim(),
      baseUrl: baseUrl.trim(),
      model: model.trim(),
      messages: [{ role: "user", text: "連線測試" }],
    }).url;
  }, [apiKey, baseUrl, model, provider]);

  const providerTargets = useMemo(() => {
    const manualTarget: ProviderRequestTarget | null =
      apiKey.trim() && provider.trim() && model.trim() && baseUrl.trim()
        ? {
            id: selectedApiKey?.id ?? "manual-current",
            apiKey: apiKey.trim(),
            baseUrl: baseUrl.trim(),
            cooldownUntil: keyCooldowns[selectedApiKey?.id ?? "manual-current"] ?? 0,
            isSelected: true,
            keyLabel: activeKeyLabel,
            lastUsedAt: selectedApiKey?.last_used_at ?? null,
            model: model.trim(),
            provider: provider.trim(),
            usageCount: selectedApiKey?.usage_count ?? 0,
          }
        : null;

    const knownTargets = availableApiKeys
      .map((record) => {
        const metadata = normalizeApiKeyPermissions(record.permissions).metadata;
        const candidatePreset = resolveAiProviderPreset(metadata.provider);
        const sameProvider = candidatePreset.id === activeProviderPreset.id;
        const sameCustomRoute =
          candidatePreset.id !== "openai-compatible" ||
          (metadata.provider.trim().toLowerCase() === normalizedProvider &&
            metadata.baseUrl.trim().replace(/\/+$/, "").toLowerCase() ===
              baseUrl.trim().replace(/\/+$/, "").toLowerCase());
        if (
          !record.api_key.trim() ||
          !sameProvider ||
          !sameCustomRoute ||
          !metadata.model.trim() ||
          !metadata.baseUrl.trim()
        ) {
          return null;
        }

        return {
          id: record.id,
          apiKey: record.api_key.trim(),
          baseUrl: metadata.baseUrl.trim(),
          cooldownUntil: keyCooldowns[record.id] ?? 0,
          isSelected: record.id === (selectedApiKeyId ?? selectedApiKey?.id ?? null),
          keyLabel: record.key_name,
          lastUsedAt: record.last_used_at,
          model: metadata.model.trim(),
          provider: metadata.provider.trim(),
          usageCount: record.usage_count ?? 0,
        } satisfies ProviderRequestTarget;
      })
      .filter((target): target is ProviderRequestTarget => Boolean(target));

    const seen = new Set<string>();
    const mergedTargets = [manualTarget, ...knownTargets].filter((target): target is ProviderRequestTarget => {
      if (!target) return false;
      const fingerprint = [target.apiKey, target.baseUrl, target.model].join("::");
      if (seen.has(fingerprint)) return false;
      seen.add(fingerprint);
      return true;
    });

    return mergedTargets.sort((left, right) => {
      const leftCooling = left.cooldownUntil > Date.now() ? 1 : 0;
      const rightCooling = right.cooldownUntil > Date.now() ? 1 : 0;
      if (leftCooling !== rightCooling) return leftCooling - rightCooling;

      const leftPreferredModel = left.model === model.trim() ? 0 : 1;
      const rightPreferredModel = right.model === model.trim() ? 0 : 1;
      if (leftPreferredModel !== rightPreferredModel) return leftPreferredModel - rightPreferredModel;

      if (left.isSelected !== right.isSelected) return left.isSelected ? -1 : 1;

      const leftImageModel = looksLikeImageModel(left.model) ? 1 : 0;
      const rightImageModel = looksLikeImageModel(right.model) ? 1 : 0;
      if (leftImageModel !== rightImageModel) return leftImageModel - rightImageModel;

      const lastUsedDifference = getTimeValue(left.lastUsedAt) - getTimeValue(right.lastUsedAt);
      if (lastUsedDifference !== 0) return lastUsedDifference;

      return left.usageCount - right.usageCount;
    });
  }, [
    activeProviderPreset.id,
    activeKeyLabel,
    apiKey,
    availableApiKeys,
    baseUrl,
    keyCooldowns,
    model,
    provider,
    normalizedProvider,
    selectedApiKey?.id,
    selectedApiKey?.last_used_at,
    selectedApiKey?.usage_count,
    selectedApiKeyId,
  ]);

  const canSend = Boolean(
    apiKey.trim() &&
      provider.trim() &&
      model.trim() &&
      baseUrl.trim() &&
      (draftMessage.trim() || uploadedAttachments.length > 0) &&
      !loading
  );

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

  const buildProviderMessages = (history: ChatMessage[], targetProvider: string) => {
    const targetPreset = resolveAiProviderPreset(targetProvider);
    const providerMessages: ProviderChatMessage[] = [];
    const unsupportedDocuments = history.flatMap((message) =>
      (message.attachments ?? [])
        .filter((attachment) => attachment.kind === "file")
        .map((attachment) => attachment.name),
    );

    if (targetPreset.protocol !== "gemini" && unsupportedDocuments.length > 0) {
      throw new Error(
        `此服務商目前不支援直接讀取下列文件：${unsupportedDocuments.join("、")}。請改用 Gemini，或移除文件後再送出。`,
      );
    }

    if (systemPrompt.trim()) {
      providerMessages.push({ role: "system", text: systemPrompt.trim() });
    }

    history.forEach((message) => {
      const attachments = message.role === "user" ? message.attachments ?? [] : [];
      const supportedAttachments =
        targetPreset.protocol === "gemini"
          ? attachments
          : attachments.filter((attachment) => attachment.kind === "image");

      providerMessages.push({
        role: message.role,
        text: message.content,
        images: supportedAttachments.map((attachment) => ({
          data: attachment.inlineData,
          mimeType: attachment.mimeType,
        })),
      });
    });

    return providerMessages;
  };

  const markApiKeyUsage = async (target: ProviderRequestTarget) => {
    if (target.id === "manual-current" || !target.apiKey.trim()) return;

    const { error } = await supabase.rpc("validate_and_update_api_key", {
      key_to_check: target.apiKey.trim(),
    });

    if (error) {
      console.error("Failed to update API key usage:", error);
    }
  };

  const runProviderRequest = async (
    history: ChatMessage[],
    bannerTitle: string,
    showSuccessBanner = true
  ) => {
    const availableTargets = providerTargets.filter(
      (target) =>
        target.apiKey.trim() &&
        target.model.trim() &&
        target.baseUrl.trim()
    );
    const targetsToTry = (availableTargets.length ? availableTargets : []).slice(0, 5);
    const attemptedLabels: string[] = [];
    let lastFailure: ProviderAttemptFailure | null = null;

    if (!targetsToTry.length) {
      throw new Error("目前沒有可用的 AI API Key 或模型設定");
    }

    for (const [targetIndex, target] of targetsToTry.entries()) {
      const startedAt = Date.now();
      const providerRequest = buildProviderChatRequest({
        provider: target.provider,
        apiKey: target.apiKey,
        baseUrl: target.baseUrl,
        model: target.model,
        messages: buildProviderMessages(history, target.provider),
      });
      const requestUrlForTarget = providerRequest.url;
      const allowRetryOnSameTarget = target.cooldownUntil <= Date.now();
      const maxAttemptsForTarget = allowRetryOnSameTarget ? GEMINI_RETRY_DELAYS_MS.length + 1 : 1;

      for (let attemptIndex = 0; attemptIndex < maxAttemptsForTarget; attemptIndex += 1) {
        try {
          await markApiKeyUsage(target);

          const response = await fetch(requestUrlForTarget, {
            method: providerRequest.method,
            headers: providerRequest.headers,
            body: providerRequest.body ? JSON.stringify(providerRequest.body) : undefined,
          });

          const result = await response.json().catch(() => null);
          const durationMs = Date.now() - startedAt;

          if (!response.ok) {
            const errorMessage = getProviderErrorMessage(
              result,
              response.status,
              [target.apiKey],
            );
            throw {
              demandRelated: isDemandRelatedProviderFailure(response.status, errorMessage),
              endpoint: requestUrlForTarget,
              keyLabel: target.keyLabel,
              message: errorMessage,
              model: target.model,
              retryable: isRetryableProviderFailure(response.status, errorMessage),
              status: response.status,
              targetId: target.id,
            } satisfies ProviderAttemptFailure;
          }

          const parsed = parseProviderChatResponse(target.provider, result);
          const parsedImages = parsed.images.map((image, index) => ({
            id: `inline-${index}`,
            src: `data:${image.mimeType};base64,${image.data}`,
            mimeType: image.mimeType,
          }));
          const fallbackText = redactSensitiveText(
            parsed.text || (parsedImages.length === 0 ? JSON.stringify(result, null, 2) : ""),
            [target.apiKey],
          );
          const usedFallbackTarget = targetIndex > 0 || attemptIndex > 0;

          setKeyCooldowns((current) => {
            if (!current[target.id]) return current;
            const next = { ...current };
            delete next[target.id];
            return next;
          });

          if (showSuccessBanner) {
            setConnectionState({
              status: "success",
              title: `${bannerTitle}成功`,
              message: usedFallbackTarget
                ? `主要模型繁忙，系統已自動切換到 ${target.keyLabel} / ${target.model} 並完成查詢。`
                : parsedImages.length > 0
                  ? "API 已正常回應，並回傳可直接顯示的圖片結果。"
                  : "API 已正常回應，你可以直接繼續查詢。",
              endpoint: requestUrlForTarget,
              provider: target.provider || "AI",
              model: target.model || "-",
              durationMs,
            });
          }

          return {
            text: fallbackText,
            images: parsedImages,
          };
        } catch (error) {
          const failure =
            error &&
            typeof error === "object" &&
            "message" in error &&
            "targetId" in error
              ? (error as ProviderAttemptFailure)
              : ({
                  demandRelated: false,
                  endpoint: requestUrlForTarget,
                  keyLabel: target.keyLabel,
                  message:
                    error instanceof Error ? error.message : "AI API 呼叫失敗，請稍後再試",
                  model: target.model,
                  retryable: isRetryableProviderFailure(
                    undefined,
                    error instanceof Error ? error.message : ""
                  ),
                  targetId: target.id,
                } satisfies ProviderAttemptFailure);

          attemptedLabels.push(`${failure.keyLabel} / ${failure.model}`);
          lastFailure = failure;

          if (failure.demandRelated) {
            setKeyCooldowns((current) => ({
              ...current,
              [failure.targetId]: Date.now() + GEMINI_KEY_COOLDOWN_MS,
            }));
          }

          const isLastTryForTarget = attemptIndex >= maxAttemptsForTarget - 1;
          const hasNextTarget = targetIndex < targetsToTry.length - 1;

          if (!failure.retryable) {
            break;
          }

          if (!isLastTryForTarget) {
            await sleep(GEMINI_RETRY_DELAYS_MS[attemptIndex] ?? GEMINI_RETRY_DELAYS_MS.at(-1) ?? 1800);
            continue;
          }

          if (failure.demandRelated && hasNextTarget) {
            break;
          }
        }
      }
    }

    const attemptedSummary = attemptedLabels.length
      ? `已嘗試 ${Array.from(new Set(attemptedLabels)).join("、")}`
      : "尚未找到可用的查詢路由";
    const userFacingMessage = lastFailure?.demandRelated
      ? `目前 ${activeProviderPreset.shortLabel} 查詢量過高，${attemptedSummary}，請稍後再試或新增更多可輪替的 API Key。`
      : lastFailure?.message || "資料查詢失敗";

    setConnectionState({
      status: "error",
      title: `${bannerTitle}失敗`,
      message: userFacingMessage,
      endpoint: lastFailure?.endpoint || requestUrl,
      provider: provider || "AI",
      model: model || "-",
      durationMs: 0,
    });

    throw new Error(userFacingMessage);
  };

  const handleSend = async () => {
    const typedContent = draftMessage.trim();
    const content = typedContent || (uploadedAttachments.length ? DEFAULT_IMAGE_OCR_PROMPT : "");

    if (!content) {
      toast.error("請先輸入對話內容或上傳附件");
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
      const reply = await runProviderRequest(nextHistory, "資料查詢", false);
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
    setLoading(true);

    try {
      const reply = await runProviderRequest(
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
      toast.success("已儲存到左側共享提示詞庫，點選名稱即可調整並套用");
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
    setConnectionState(null);
    toast.success(`已載入對話：${conversation.title}，並沿用目前 AI 金鑰`);
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
        toast.error(`${file.name} 超過 100MB`);
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

  const handleFileUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    await appendUploadedFiles(Array.from(files));
  };

  const isFileDragPayload = (event: ReactDragEvent<HTMLElement>) =>
    Array.from(event.dataTransfer?.types ?? []).includes("Files");

  const handleComposerDragEnter = (event: ReactDragEvent<HTMLDivElement>) => {
    if (loading || !isFileDragPayload(event)) return;
    event.preventDefault();
    event.stopPropagation();
    composerDragDepthRef.current += 1;
    setIsDragOverComposer(true);
  };

  const handleComposerDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    if (loading || !isFileDragPayload(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    if (!isDragOverComposer) {
      setIsDragOverComposer(true);
    }
  };

  const handleComposerDragLeave = (event: ReactDragEvent<HTMLDivElement>) => {
    if (loading || !isFileDragPayload(event)) return;
    event.preventDefault();
    event.stopPropagation();
    composerDragDepthRef.current = Math.max(0, composerDragDepthRef.current - 1);
    if (composerDragDepthRef.current === 0) {
      setIsDragOverComposer(false);
    }
  };

  const handleComposerDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    if (loading || !isFileDragPayload(event)) return;
    event.preventDefault();
    event.stopPropagation();
    composerDragDepthRef.current = 0;
    setIsDragOverComposer(false);
    void handleFileUpload(event.dataTransfer.files);
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

  useEffect(() => {
    const handleGlobalPaste = (event: ClipboardEvent) => {
      if (!event.clipboardData?.items?.length) return;

      const consoleElement = chatConsoleRef.current;
      if (!consoleElement) return;

      const activeElement = document.activeElement;
      const isConsoleFocused = activeElement instanceof Node
        ? consoleElement.contains(activeElement)
        : false;
      const isPageFocused = activeElement === document.body || activeElement === null;

      if (!isConsoleFocused && !isPageFocused) return;

      void (async () => {
        const handled = await handleClipboardPaste(event.clipboardData!.items);
        if (handled) {
          event.preventDefault();
        }
      })();
    };

    document.addEventListener("paste", handleGlobalPaste);
    return () => {
      document.removeEventListener("paste", handleGlobalPaste);
    };
  }, [uploadedAttachments.length]);

  useEffect(() => {
    if (!isDragOverComposer) return;

    const resetComposerDragState = () => {
      composerDragDepthRef.current = 0;
      setIsDragOverComposer(false);
    };

    window.addEventListener("dragend", resetComposerDragState);
    window.addEventListener("drop", resetComposerDragState);

    return () => {
      window.removeEventListener("dragend", resetComposerDragState);
      window.removeEventListener("drop", resetComposerDragState);
    };
  }, [isDragOverComposer]);

  const removeUploadedAttachment = (id: string) => {
    setUploadedAttachments((current) => current.filter((attachment) => attachment.id !== id));
  };

  const totalMessages = messages.length.toString();
  const modeLabel = `${activeProviderPreset.shortLabel} 可對話`;
  const chatHeightClass = isChatOnly
    ? "min-h-0 flex-1"
    : "min-h-[560px] max-h-[560px]";

  const workspaceDialogs = (
    <>
      <Dialog open={newConversationDialogOpen} onOpenChange={setNewConversationDialogOpen}>
        <DialogContent className="max-h-[calc(100dvh-32px)] max-w-2xl overflow-y-auto border-blue-400/35 bg-[linear-gradient(180deg,#17243a_0%,#0f1b2e_100%)] text-slate-100 shadow-[0_32px_90px_rgba(2,8,23,0.58)]">
          <DialogHeader className="space-y-3">
            <DialogTitle className="text-3xl font-black tracking-tight text-white">建立新對話</DialogTitle>
            <DialogDescription className="text-base leading-7 text-slate-300">
              這個動作會把目前視窗清空。若你已經有聊天內容或輸入中的文字，系統會先自動存到左側的對話紀錄。
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[20px] border border-cyan-300/30 bg-cyan-400/12 px-5 py-5">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-100">
                Messages
              </p>
              <p className="mt-2 text-3xl font-black text-white">{messages.length}</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">目前已經建立的對話訊息。</p>
            </div>
            <div className="rounded-[20px] border border-violet-300/30 bg-violet-400/12 px-5 py-5">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-violet-100">
                Draft
              </p>
              <p className="mt-2 text-3xl font-black text-white">
                {draftMessage.trim().length ? "已填寫" : "空白"}
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-300">輸入框尚未送出的內容狀態。</p>
            </div>
            <div className="rounded-[20px] border border-amber-300/30 bg-amber-400/12 px-5 py-5">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-100">
                Attachments
              </p>
              <p className="mt-2 text-3xl font-black text-white">{uploadedAttachments.length}</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">尚未送出的附件會直接清空。</p>
            </div>
          </div>

          <div className="rounded-[20px] border border-blue-300/25 bg-blue-500/10 px-5 py-4 text-base leading-7 text-blue-50">
            {hasConversationContent
              ? "按下確認後會切到全新對話；文字與聊天紀錄會保留到左側清單，未送出的附件會直接移除。"
              : "目前沒有未儲存內容，按下確認後會直接建立乾淨的新對話。"}
          </div>

          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setNewConversationDialogOpen(false)}
              className="h-12 rounded-xl border-slate-500/50 bg-slate-800/70 px-6 text-base font-bold text-slate-100 hover:bg-slate-700 hover:text-white"
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={resetConversation}
              className="h-12 rounded-xl bg-[linear-gradient(135deg,#38bdf8_0%,#6366f1_100%)] px-6 text-base font-bold text-white shadow-[0_18px_44px_-22px_rgba(56,189,248,0.65)] hover:brightness-110"
            >
              確認建立
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={savePromptDialogOpen} onOpenChange={setSavePromptDialogOpen}>
        <DialogContent className="max-h-[calc(100dvh-32px)] max-w-3xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden border-blue-400/35 bg-[linear-gradient(180deg,#17243a_0%,#0f1b2e_100%)] text-slate-100 shadow-[0_32px_90px_rgba(2,8,23,0.58)]">
          <DialogHeader className="shrink-0 space-y-3">
            <DialogTitle className="flex items-center gap-3 text-3xl font-black tracking-tight text-white">
              <LibraryBig className="h-7 w-7 text-blue-300" />
              建立共享提示詞
            </DialogTitle>
            <DialogDescription className="text-base leading-7 text-slate-300">
              把常用查詢方式存進團隊提示詞庫。儲存後，所有使用者都能從左側「共享提示詞庫」點選並套用。
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 space-y-5 overflow-y-auto pr-2">
            <div className="grid gap-3 rounded-[20px] border border-blue-300/25 bg-blue-500/10 p-4 sm:grid-cols-3">
            {[
              ["1", "填寫", "輸入名稱與完整指令"],
              ["2", "儲存", "加入左側共享提示詞庫"],
              ["3", "套用", "點選名稱後放入輸入框"],
            ].map(([step, title, description]) => (
              <div key={step} className="flex items-start gap-3 rounded-2xl bg-slate-950/25 px-4 py-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-400 text-sm font-black text-slate-950">
                  {step}
                </span>
                <div>
                  <p className="text-base font-bold text-white">{title}</p>
                  <p className="mt-1 text-sm leading-5 text-slate-300">{description}</p>
                </div>
              </div>
            ))}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-amber-300" />
                <p className="text-base font-black text-white">不知道怎麼寫？從範本開始</p>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {SHARED_PROMPT_TEMPLATES.map((template) => (
                  <button
                    key={template.title}
                    type="button"
                    onClick={() => {
                      setPromptDialogTitle(template.title);
                      setPromptDialogContent(template.content);
                    }}
                    className="rounded-2xl border border-slate-500/50 bg-slate-950/25 px-4 py-3 text-left transition-colors hover:border-blue-300/60 hover:bg-blue-400/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/70"
                  >
                    <span className="text-base font-black text-white">{template.title}</span>
                    <span className="mt-1 block text-sm leading-5 text-slate-300">
                      {template.description}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-base font-bold text-white">提示詞名稱</Label>
                <Input
                  data-ai-surface="true"
                  value={promptDialogTitle}
                  onChange={(event) => setPromptDialogTitle(event.target.value)}
                  placeholder="例如：每日異常摘要"
                  className="h-[52px] rounded-xl border-slate-500/60 bg-[#0b1628] px-4 text-base text-white placeholder:text-slate-400 hover:border-blue-300/60 focus:ring-2 focus:ring-blue-400/30"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-base font-bold text-white">提示詞內容</Label>
                <Textarea
                  data-ai-surface="true"
                  value={promptDialogContent}
                  onChange={(event) => setPromptDialogContent(event.target.value)}
                  placeholder="請直接輸入要保存的提示詞內容"
                  className="min-h-[220px] rounded-[18px] border-slate-500/60 bg-[#0b1628] px-4 py-3 text-base leading-7 text-white placeholder:text-slate-400 hover:border-blue-300/60 focus:ring-2 focus:ring-blue-400/30"
                />
                <p className="text-sm leading-6 text-slate-300">
                  建議寫清楚資料範圍、輸出格式與判斷規則，例如：「整理異常站點，依嚴重度排序並列出建議處置」。
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t border-blue-300/20 pt-4 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setSavePromptDialogOpen(false)}
              className="h-12 rounded-xl border-slate-500/50 bg-slate-800/70 px-6 text-base font-bold text-slate-100 hover:bg-slate-700 hover:text-white"
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={saveCurrentPrompt}
              disabled={!promptDialogContent.trim()}
              className="h-12 rounded-xl bg-blue-400 px-6 text-base font-black text-slate-950 shadow-[0_16px_36px_-18px_rgba(96,165,250,0.85)] hover:bg-blue-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Bookmark className="mr-2 h-4 w-4" />
              儲存到提示詞庫
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={libraryApplyDialogOpen} onOpenChange={setLibraryApplyDialogOpen}>
        <DialogContent className="max-h-[calc(100dvh-32px)] max-w-3xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden border-blue-400/35 bg-[linear-gradient(180deg,#17243a_0%,#0f1b2e_100%)] text-slate-100 shadow-[0_32px_90px_rgba(2,8,23,0.58)]">
          <DialogHeader className="space-y-3">
            <DialogTitle className="flex items-center gap-3 text-3xl font-black tracking-tight text-white">
              <LibraryBig className="h-7 w-7 text-blue-300" />
              套用共享提示詞
            </DialogTitle>
            <DialogDescription className="text-base leading-7 text-slate-300">
              確認內容後放入 AI 輸入框。系統不會自動送出，你仍可補上站點、日期或附件說明。
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 space-y-4 overflow-y-auto pr-2">
            <div className="rounded-[18px] border border-blue-300/25 bg-blue-500/10 px-5 py-4">
              <p className="text-sm font-bold text-blue-200">已選擇提示詞</p>
              <p className="mt-1 text-xl font-black text-white">{libraryApplyTitle || "未命名提示詞"}</p>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <Label className="text-base font-bold text-white">本次要套用的內容</Label>
                <span className="text-sm text-slate-300">可先修改，不會覆蓋共享版本</span>
              </div>
              <Textarea
                data-ai-surface="true"
                value={libraryApplyContent}
                onChange={(event) => setLibraryApplyContent(event.target.value)}
                placeholder="先在這裡調整內容，再套用到輸入框"
                className="min-h-[260px] rounded-[18px] border-slate-500/60 bg-[#0b1628] px-4 py-3 text-base leading-7 text-white placeholder:text-slate-400 hover:border-blue-300/60 focus:ring-2 focus:ring-blue-400/30"
              />
            </div>

            <div className="flex items-start gap-3 rounded-[18px] border border-emerald-300/25 bg-emerald-400/10 px-4 py-3 text-sm leading-6 text-emerald-50">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
              套用後會回到主畫面並把內容放進輸入框；確認資料範圍後，再按送出即可。
            </div>
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t border-blue-300/20 pt-4 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setLibraryApplyDialogOpen(false)}
              className="h-12 rounded-xl border-slate-500/50 bg-slate-800/70 px-6 text-base font-bold text-slate-100 hover:bg-slate-700 hover:text-white"
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={applyLibraryItemToDraft}
              disabled={!libraryApplyContent.trim()}
              className="h-12 rounded-xl bg-blue-400 px-6 text-base font-black text-slate-950 shadow-[0_16px_36px_-18px_rgba(96,165,250,0.85)] hover:bg-blue-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              放入 AI 輸入框（不送出）
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  const conversationPanel = (
    <div
      ref={chatConsoleRef}
      className={cn(
        "flex flex-col overflow-hidden border border-blue-300/25 bg-[linear-gradient(180deg,#17243a_0%,#0e192a_100%)] shadow-[0_28px_80px_rgba(2,8,23,0.38)]",
        isChatOnly
          ? "h-[calc(100dvh-285px)] min-h-[520px] rounded-[28px] md:h-[calc(100dvh-210px)] lg:h-full"
          : "min-h-[720px] rounded-[34px] p-5"
      )}
    >
      <div
        className={cn(
          "flex shrink-0 flex-col gap-4 border-b border-blue-300/20 lg:flex-row lg:items-center lg:justify-between",
          isChatOnly ? "bg-[#18263d] px-5 py-4 md:px-6" : "pb-5"
        )}
      >
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[15px] border border-blue-300/35 bg-blue-400/15 text-blue-100 shadow-[0_12px_28px_-18px_rgba(96,165,250,0.8)]">
            <MessageSquareText className="h-5.5 w-5.5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xl font-black tracking-[-0.02em] text-white">AI 資料助理</p>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/35 bg-emerald-400/15 px-2.5 py-1 text-xs font-bold text-emerald-100">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                已就緒
              </span>
            </div>
            <p className="mt-1 text-base leading-7 text-slate-300">
              查詢、比對、摘要與圖片文字擷取，都會保留本次對話脈絡。
            </p>
          </div>
        </div>

        <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-[minmax(280px,1fr)_280px] lg:justify-end">
          {isChatOnly ? (
            <div className="flex items-center gap-2">
              <Select
                value={selectedApiKeyId ?? selectedApiKey?.id ?? ""}
                onValueChange={(value) => onSelectApiKey?.(value)}
              >
                <SelectTrigger
                  aria-label="選擇 AI 模型"
                  className="h-12 w-full rounded-xl border-blue-300/30 bg-slate-950/45 px-4 text-left text-base font-semibold text-white shadow-none focus:ring-2 focus:ring-blue-400/40"
                >
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
              <Button
                type="button"
                variant="ghost"
                onClick={requestResetConversation}
                aria-label="清空對話"
                className="h-11 w-11 shrink-0 rounded-xl border border-slate-700/70 bg-slate-900/50 p-0 text-slate-400 hover:bg-rose-500/10 hover:text-rose-100 sm:hidden"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
          <div className="hidden h-12 items-center justify-between rounded-xl border border-blue-300/25 bg-slate-950/40 px-4 text-left shadow-none 2xl:flex">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-200">目前模型</p>
              <p className="truncate text-sm font-bold text-white">{provider || "gemini"} / {model || "-"}</p>
            </div>
            {availableApiKeys.length > 1 ? (
              <span className="ml-3 shrink-0 rounded-full border border-emerald-300/25 bg-emerald-400/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-100">
                自動輪替
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className={cn("flex min-h-0 flex-1 flex-col", isChatOnly ? "gap-0" : "mt-4 gap-4")}>
        {connectionState ? (
          <ConnectionBanner result={connectionState} onDismiss={() => setConnectionState(null)} />
        ) : null}

        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col bg-[radial-gradient(circle_at_50%_0%,rgba(16,185,129,0.08),transparent_28%),#030508]",
            isChatOnly ? "px-4 py-5 md:px-6" : "rounded-[30px] border border-white/8 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]"
          )}
        >
          <div className={cn("space-y-4 overflow-y-auto", isChatOnly ? "pr-2" : "pr-1", chatHeightClass)}>
            {messages.length === 0 ? (
              isChatOnly ? (
                <div className="flex min-h-[300px] flex-1 items-center justify-center px-1 py-5 md:px-6 2xl:py-0">
                  <div className="w-full max-w-3xl text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[18px] border border-emerald-400/20 bg-[linear-gradient(145deg,rgba(16,185,129,0.16),rgba(5,8,10,0.12))] text-emerald-100 shadow-[0_18px_45px_-22px_rgba(16,185,129,0.45)] 2xl:h-10 2xl:w-10 2xl:rounded-xl">
                      <Search className="h-6 w-6 2xl:h-4.5 2xl:w-4.5" />
                    </div>
                    <p className="mt-5 text-3xl font-black tracking-[-0.035em] text-white md:text-4xl 2xl:mt-1">
                      今天想查什麼？
                    </p>
                    <p className="mx-auto mt-3 max-w-2xl text-base leading-7 text-slate-300 2xl:mt-1">
                      直接描述你的問題，也可以貼上截圖與文件一起分析。
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex min-h-[340px] flex-1 items-center justify-center rounded-[26px] border border-dashed border-white/8 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.08),transparent_22%),#040608] px-8 text-center">
                  <div className="max-w-xl space-y-5">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl border border-white/10 bg-white/5 text-cyan-100">
                      <MessageSquareText className="h-7 w-7" />
                    </div>
                    <div>
                      <p className="text-xl font-black text-slate-50">開始新的資料查詢</p>
                      <p className="mt-2 text-sm leading-7 text-slate-400">
                        可以先按「測試連線」確認成功，再從下方開始查詢。這個區塊會保留你本次工作區的上下文。
                      </p>
                    </div>
                  </div>
                </div>
              )
            ) : (
              messages.map((message) => <MessageCard key={message.id} message={message} />)
            )}

            {loading ? <QueryLoadingCard /> : null}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div
          className={cn(
            "border-cyan-300/12",
            isChatOnly
              ? "shrink-0 border-t border-slate-700/60 bg-[#0d1625] px-4 py-4 md:px-6"
              : "rounded-[28px] border bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.08),transparent_26%),linear-gradient(180deg,#101827_0%,#0b1220_100%)] p-3.5 shadow-[0_24px_52px_rgba(2,8,23,0.26),inset_0_1px_0_rgba(255,255,255,0.03)]"
          )}
        >
          <input
            ref={imageInputRef}
            type="file"
            accept=".csv,.doc,.docx,.pdf,.png,.jpg,.jpeg,.webp,.gif,.bmp,.xls,.xlsx,.ppt,.pptx,.txt,image/*,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
            multiple
            className="hidden"
            onChange={(event) => {
              void handleFileUpload(event.currentTarget.files);
              event.currentTarget.value = "";
            }}
          />

          <div className="mb-2.5 hidden flex-wrap items-center justify-between gap-2 sm:flex">
            <div className="flex flex-wrap items-center gap-3 text-sm font-medium text-slate-300">
              <span>Ctrl+V 貼上圖片</span>
              <span className="h-3 w-px bg-slate-700" />
              <span>附件 {uploadedAttachments.length} / {MAX_UPLOAD_ATTACHMENT_COUNT}</span>
              <span className="h-3 w-px bg-slate-700" />
              <span>PDF / PPT / Excel / Word / 圖片</span>
            </div>
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
              className="h-10 rounded-xl border-slate-500/60 bg-slate-900/30 px-4 text-sm font-bold text-slate-200 transition-all duration-200 hover:border-rose-400/40 hover:bg-rose-500/10 hover:text-rose-100 active:scale-[0.99]"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              清空對話
            </Button>
          </div>

          {uploadedAttachments.length ? (
            <div className="mb-3 grid max-h-[232px] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
              {uploadedAttachments.map((attachment, index) => (
                <div
                  key={attachment.id}
                  className="flex min-w-0 items-center gap-3 rounded-2xl border border-cyan-300/12 bg-[#0b1421] px-3 py-3"
                >
                  {attachment.kind === "image" && attachment.src ? (
                    <img
                      src={attachment.src}
                      alt={`待上傳圖片 ${index + 1}`}
                      className="h-14 w-14 rounded-xl border border-white/10 bg-slate-950/40 object-cover"
                    />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-white/10 bg-slate-950/40 text-cyan-100">
                      <FileText className="h-5 w-5" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-100">{attachment.name}</p>
                    <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-400">
                      <span>{attachment.kind === "image" ? "圖片" : getFileExtension(attachment.name).toUpperCase() || "檔案"}</span>
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
          ) : null}

          <div
            onDragEnter={handleComposerDragEnter}
            onDragOver={handleComposerDragOver}
            onDragLeave={handleComposerDragLeave}
            onDrop={handleComposerDrop}
            className={cn(
              "rounded-[20px] border px-3 py-3 shadow-[0_18px_45px_-24px_rgba(59,130,246,0.7),inset_0_1px_0_rgba(255,255,255,0.06)] transition-all duration-200 focus-within:ring-2",
              isDragOverComposer
                ? "border-cyan-300/70 bg-[linear-gradient(180deg,#21466a_0%,#183450_100%)] ring-2 ring-cyan-300/25"
                : "border-blue-300/35 bg-[linear-gradient(180deg,#1b2d49_0%,#14233a_100%)] focus-within:border-blue-300/70 focus-within:ring-blue-400/20"
            )}
          >
            <div className="flex items-center gap-2 md:gap-3">
              <div className="flex shrink-0 items-center self-stretch">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={loading || uploadedAttachments.length >= MAX_UPLOAD_ATTACHMENT_COUNT}
                  aria-label="上傳 PDF、PPT、Excel、Word 或圖片"
                  className="h-12 min-w-12 rounded-xl border border-blue-300/35 bg-blue-400/15 px-3 text-blue-100 shadow-none hover:border-blue-300/70 hover:bg-blue-400/25 disabled:opacity-50 sm:px-4"
                >
                  <Paperclip className="h-5 w-5 shrink-0" />
                  <span className="ml-2 hidden text-sm font-bold sm:inline">上傳檔案</span>
                </Button>
              </div>

              <div className="min-w-0 flex-1 rounded-[16px] border border-white/8 bg-[linear-gradient(180deg,rgba(15,23,42,0.82),rgba(30,41,59,0.72))] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <Textarea
                  data-ai-surface="true"
                  value={draftMessage}
                  onChange={(event) => setDraftMessage(event.target.value)}
                  aria-label="輸入查詢內容"
                  placeholder=""
                  className="min-h-[74px] border-0 bg-transparent px-0 py-0 text-[17px] leading-7 text-white shadow-none placeholder:text-slate-200 focus-visible:ring-0"
                />
              </div>

              <div className="flex shrink-0 items-center gap-2 self-stretch">
                <div className="hidden h-12 max-w-[220px] items-center truncate rounded-xl border border-blue-300/25 bg-slate-950/45 px-3 text-sm font-bold text-slate-100 shadow-none sm:flex">
                  {model || "Gemini"}
                </div>
                <Button
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={!canSend}
                  aria-label="送出查詢"
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-blue-300/30 bg-blue-500 p-0 font-bold text-white shadow-[0_12px_28px_-14px_rgba(59,130,246,0.9)] transition-all duration-200 hover:bg-blue-400 active:scale-[0.98] disabled:border-slate-700 disabled:bg-slate-700 disabled:text-slate-400 disabled:shadow-none"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {isDragOverComposer ? (
              <div className="mt-3 rounded-2xl border border-dashed border-cyan-300/40 bg-cyan-300/8 px-4 py-3 text-sm font-bold text-cyan-100">
                放開以上傳 PDF / PPT / Excel / Word / 圖片
              </div>
            ) : null}

          </div>
        </div>
      </div>
    </div>
  );

  if (isChatOnly) {
    return (
      <>
        {workspaceDialogs}
        <div
          className={cn(
            "grid min-h-[calc(100dvh-164px)] w-full items-stretch gap-4 lg:h-[calc(100dvh-164px)]",
            sidebarCollapsed
              ? "lg:grid-cols-[88px_minmax(0,1fr)]"
              : "lg:grid-cols-[320px_minmax(0,1fr)]"
          )}
        >
          <aside
            className={cn(
              "order-2 h-full min-h-0 overflow-hidden rounded-[24px] border border-[#163653] bg-[#081C2D] shadow-[0_24px_70px_rgba(2,8,23,0.42)] transition-all duration-300 lg:order-1",
              sidebarCollapsed ? "lg:w-[88px]" : "lg:w-[320px]"
            )}
          >
            <div className="flex h-full min-h-0 flex-col">
              <div className="border-b border-[#163653] bg-[#081C2D] p-5">
                <div className={cn("flex", sidebarCollapsed ? "flex-col-reverse items-center gap-3" : "items-start justify-between gap-3")}>
                  <div className={cn("flex items-center gap-3", sidebarCollapsed && "flex-col gap-2 text-center")}>
                    <div className="flex h-12 w-12 items-center justify-center rounded-[15px] border border-blue-300/35 bg-blue-400/15 text-blue-100">
                      <Search className="h-5 w-5" />
                    </div>
                    {!sidebarCollapsed ? (
                      <div className="min-w-0">
                        <p className="text-xl font-black text-white">資料查詢空間</p>
                        <p className="mt-1 text-xs font-bold tracking-wide text-blue-200">AI KNOWLEDGE WORKSPACE</p>
                      </div>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setSidebarCollapsed((value) => !value)}
                    aria-label={sidebarCollapsed ? "展開資料查詢空間" : "收合資料查詢空間"}
                    className={cn(
                      "shrink-0 rounded-xl text-white hover:text-white",
                      sidebarCollapsed
                        ? "h-12 w-12 border border-emerald-300/30 bg-emerald-500 shadow-[0_12px_28px_-14px_rgba(16,185,129,0.9)] hover:bg-emerald-400"
                        : "h-10 w-10 border border-[#214669] bg-[#10283d] text-blue-100 hover:bg-[#16324b]"
                    )}
                  >
                    {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                  </Button>
                </div>

                <Button
                  type="button"
                  onClick={requestResetConversation}
                  className={cn(
                    "mt-5 h-12 rounded-xl bg-blue-500 font-black text-white shadow-[0_12px_28px_-14px_rgba(59,130,246,0.9)] hover:bg-blue-400",
                    sidebarCollapsed ? "w-full justify-center px-0" : "w-full justify-start px-4 text-base"
                  )}
                  aria-label="建立新對話"
                >
                  <Plus className={cn("h-4 w-4", !sidebarCollapsed && "mr-2")} />
                  {!sidebarCollapsed ? "建立新對話" : null}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  onClick={openSavePromptDialog}
                  className={cn(
                    "mt-2 h-12 rounded-xl border border-[#214669] bg-[#10283d] font-bold text-blue-100 hover:border-blue-300/50 hover:bg-[#16324b] hover:text-white",
                    sidebarCollapsed ? "w-full justify-center px-0" : "w-full justify-start px-4 text-base"
                  )}
                  aria-label="新增共享提示詞"
                >
                  <Bookmark className={cn("h-5 w-5", !sidebarCollapsed && "mr-2")} />
                  {!sidebarCollapsed ? "新增共享提示詞" : null}
                </Button>
              </div>

              {!sidebarCollapsed ? (
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto bg-[#081C2D] px-4 py-4">
                <section aria-labelledby="conversation-history-title">
                  <div className="mb-2 flex items-center justify-between gap-3 px-1">
                    <div className="flex items-center gap-2">
                      <History className="h-4 w-4 text-blue-200" />
                      <p id="conversation-history-title" className="text-sm font-black text-slate-100">
                        最近對話
                      </p>
                    </div>
                    <span className="text-xs font-bold tabular-nums text-slate-300">{savedConversations.length}</span>
                  </div>
                  <div className="space-y-1.5">
                    {savedConversations.length === 0 ? (
                      <p className="rounded-xl border border-[#173654] bg-[#0C2235] px-3 py-4 text-sm leading-6 text-slate-400">
                        對話會自動保留在這裡
                      </p>
                    ) : (
                      savedConversations.map((item) => (
                        <div key={item.id} className="group flex items-center gap-1 rounded-xl border border-transparent hover:border-slate-700/70 hover:bg-slate-800/55">
                          <button
                            type="button"
                            onClick={() => restoreConversation(item)}
                            className="min-w-0 flex-1 rounded-xl px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
                          >
                            <p className="truncate text-base font-bold text-slate-100">{item.title}</p>
                            <p className="mt-1 truncate text-xs text-slate-300">
                              {formatSavedItemTime(item.savedAt)} · {item.model}
                            </p>
                          </button>
                          <button
                            type="button"
                            onClick={() => removeSavedConversation(item.id)}
                            aria-label={`刪除對話：${item.title}`}
                            className="mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-600 opacity-100 hover:bg-rose-500/10 hover:text-rose-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </section>

                {savedPrompts.length > 0 ? (
                  <section
                    aria-labelledby="shared-prompts-title"
                    className="rounded-[20px] border border-[#1d4262] bg-[#0C2235] p-3.5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <LibraryBig className="h-5 w-5 shrink-0 text-blue-200" />
                        <p id="shared-prompts-title" className="text-base font-black text-white">
                          共享提示詞庫
                        </p>
                      </div>
                      <span className="rounded-full border border-[#2b5377] bg-[#14324c] px-2.5 py-1 text-xs font-black tabular-nums text-blue-100">
                        {savedPrompts.length}
                      </span>
                    </div>

                    <div className="mt-3 space-y-2">
                      {savedPrompts.map((item) => (
                        <div key={item.id} className="group flex items-center gap-1 rounded-xl border border-[#1e425f] bg-[#10263a] hover:border-blue-300/50 hover:bg-[#16324a]">
                          <button
                            type="button"
                            onClick={() => openLibraryApplyDialog(item)}
                            className="min-w-0 flex-1 rounded-xl px-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/70"
                          >
                            <p className="truncate text-base font-black text-white">{item.title}</p>
                            <span className="mt-1.5 flex items-center gap-1 text-sm font-bold text-blue-200">
                              調整並套用
                              <ArrowRight className="h-3.5 w-3.5" />
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => removeSavedPrompt(item.id)}
                            aria-label={`刪除共享提示詞：${item.title}`}
                            className="mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-400 opacity-100 hover:bg-rose-500/15 hover:text-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/70 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col items-center gap-3 bg-[#081C2D] px-3 py-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#214669] bg-[#10283d] text-blue-100">
                    <History className="h-4 w-4" />
                  </div>
                  {savedPrompts.length > 0 ? (
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#214669] bg-[#10283d] text-blue-100">
                      <LibraryBig className="h-4 w-4" />
                    </div>
                  ) : null}
                </div>
              )}

              <div className="border-t border-[#163653] bg-[#081C2D] p-4">
                <div
                  className={cn(
                    "rounded-xl border border-[#214669] bg-[#0C2235]",
                    sidebarCollapsed ? "mx-auto flex h-12 w-12 items-center justify-center px-0 py-0" : "px-4 py-3"
                  )}
                >
                  {sidebarCollapsed ? (
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]" />
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-bold text-slate-300">目前使用模型</p>
                        <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]" />
                      </div>
                      <p className="mt-1.5 truncate text-base font-black text-white">{activeKeyLabel}</p>
                      <p className="mt-1 truncate text-sm text-slate-300">
                        {provider || "-"} / {model || "-"}
                      </p>
                      {availableApiKeys.length > 1 ? (
                        <p className="mt-2 text-xs leading-5 text-emerald-200">
                          多人共用時會自動輪替可用 Key，並暫時避開高流量路由。
                        </p>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            </div>
          </aside>

          <div className="order-1 min-h-0 min-w-0 lg:order-2">{conversationPanel}</div>
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
                caption={`目前已接通 ${activeProviderPreset.label} 查詢。`}
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
