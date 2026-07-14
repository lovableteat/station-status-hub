import { useEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Bot,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  ClipboardPaste,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Waypoints,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

import {
  AI_PROVIDER_PRESETS,
  buildProviderModelRequest,
  getAiProviderPreset,
  getProviderErrorMessage,
  parseProviderModels,
  resolveAiProviderPreset,
} from "./aiProviderCatalog";
import type { AiProviderPresetId } from "./aiProviderCatalog";
import {
  ApiKeyRecord,
  buildApiKeyPermissions,
  normalizeApiKeyPermissions,
} from "./apiKeyHelpers";

interface CreateApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onKeyCreated: () => void;
  record?: ApiKeyRecord | null;
}

interface ApiKeyFormState {
  keyName: string;
  apiKey: string;
  provider: string;
  model: string;
  baseUrl: string;
  description: string;
  read: boolean;
  write: boolean;
  isActive: boolean;
  expiresAt: string;
}

type VerificationState =
  | { status: "idle"; message: string }
  | { status: "checking"; message: string }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

const emptyFormState: ApiKeyFormState = {
  keyName: "",
  apiKey: "",
  provider: "",
  model: "",
  baseUrl: "",
  description: "",
  read: true,
  write: false,
  isActive: true,
  expiresAt: "",
};

const providerIcons: Record<AiProviderPresetId, LucideIcon> = {
  gemini: Sparkles,
  openai: Bot,
  anthropic: BrainCircuit,
  "openai-compatible": Waypoints,
};

const automaticKeyNames = new Set(
  AI_PROVIDER_PRESETS.map((preset) => `${preset.shortLabel} API Key`),
);

function toDatetimeLocal(value: string | null) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

function createFormStateFromRecord(record?: ApiKeyRecord | null): ApiKeyFormState {
  if (!record) return emptyFormState;

  const permissions = normalizeApiKeyPermissions(record.permissions);

  return {
    keyName: record.key_name,
    apiKey: record.api_key,
    provider: permissions.metadata.provider,
    model: permissions.metadata.model,
    baseUrl: permissions.metadata.baseUrl,
    description: record.description ?? "",
    read: permissions.read,
    write: permissions.write,
    isActive: record.is_active,
    expiresAt: toDatetimeLocal(record.expires_at),
  };
}

async function readJsonResponse(response: Response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text.slice(0, 300) };
  }
}

export function CreateApiKeyDialog({
  open,
  onOpenChange,
  onKeyCreated,
  record,
}: CreateApiKeyDialogProps) {
  const isEditMode = Boolean(record);
  const isLegacyRecord = Boolean(
    record && !normalizeApiKeyPermissions(record.permissions).metadata.provider,
  );
  const [formData, setFormData] = useState<ApiKeyFormState>(emptyFormState);
  const [selectedProviderId, setSelectedProviderId] =
    useState<AiProviderPresetId | null>(null);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [verification, setVerification] = useState<VerificationState>({
    status: "idle",
    message: "選擇服務商並貼上 Key 後，系統會自動檢查。",
  });
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const requestControllerRef = useRef<AbortController | null>(null);
  const lastVerificationFingerprintRef = useRef("");

  const activePreset = useMemo(
    () => (selectedProviderId ? getAiProviderPreset(selectedProviderId) : null),
    [selectedProviderId],
  );

  useEffect(() => {
    if (open) {
      const nextForm = createFormStateFromRecord(record);
      const nextProviderId = nextForm.provider
        ? resolveAiProviderPreset(nextForm.provider).id
        : null;
      setFormData(nextForm);
      setSelectedProviderId(nextProviderId);
      setAdvancedOpen(Boolean(record) || nextProviderId === "openai-compatible");
      setModelOptions(nextForm.model ? [nextForm.model] : []);
      setVerification({
        status: "idle",
        message: record
          ? "金鑰資料已載入，可重新驗證目前可用模型。"
          : "選擇服務商並貼上 Key 後，系統會自動檢查。",
      });
      lastVerificationFingerprintRef.current = "";
      return;
    }

    requestControllerRef.current?.abort();
    setFormData(emptyFormState);
    setSelectedProviderId(null);
    setModelOptions([]);
    setAdvancedOpen(false);
    setShowKey(false);
    setLoading(false);
  }, [open, record]);

  useEffect(
    () => () => {
      requestControllerRef.current?.abort();
    },
    [],
  );

  const setField = <K extends keyof ApiKeyFormState>(key: K, value: ApiKeyFormState[K]) => {
    setFormData((current) => ({ ...current, [key]: value }));
  };

  const resetVerification = (message = "Key 尚未驗證。") => {
    requestControllerRef.current?.abort();
    lastVerificationFingerprintRef.current = "";
    setModelOptions([]);
    setVerification({ status: "idle", message });
  };

  const selectProvider = (providerId: AiProviderPresetId) => {
    const preset = getAiProviderPreset(providerId);
    setSelectedProviderId(providerId);
    setFormData((current) => ({
      ...current,
      provider: preset.providerValue,
      baseUrl: preset.baseUrl,
      model: preset.defaultModel,
      keyName:
        !current.keyName || automaticKeyNames.has(current.keyName)
          ? `${preset.shortLabel} API Key`
          : current.keyName,
    }));
    setAdvancedOpen(providerId === "openai-compatible");
    resetVerification(
      providerId === "openai-compatible"
        ? "請在進階設定填入服務商的 Base URL 後驗證。"
        : `已選擇 ${preset.label}，請貼上 API Key。`,
    );
  };

  const validateAndLoadModels = async (keyOverride?: string) => {
    if (!activePreset) {
      setVerification({ status: "error", message: "請先選擇 AI 服務商。" });
      return;
    }

    const apiKey = (keyOverride ?? formData.apiKey).trim();
    const baseUrl = formData.baseUrl.trim() || activePreset.baseUrl;
    if (!apiKey) {
      setVerification({ status: "error", message: "請先貼上 API Key。" });
      return;
    }
    if (!baseUrl) {
      setAdvancedOpen(true);
      setVerification({
        status: "error",
        message: "自訂服務商需要 API Base URL，請在進階設定補上。",
      });
      return;
    }

    const fingerprint = [formData.provider, baseUrl, apiKey].join("::");
    if (verification.status === "success" && fingerprint === lastVerificationFingerprintRef.current) {
      return;
    }

    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    setVerification({ status: "checking", message: "正在驗證 Key 並取得可用模型..." });

    try {
      const request = buildProviderModelRequest({
        provider: formData.provider || activePreset.providerValue,
        baseUrl,
        apiKey,
      });
      const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        signal: controller.signal,
      });
      const result = await readJsonResponse(response);
      if (!response.ok) {
        throw new Error(getProviderErrorMessage(result, response.status, [apiKey]));
      }

      const models = parseProviderModels(formData.provider || activePreset.providerValue, result);
      if (models.length === 0) {
        throw new Error("服務商已回應，但沒有找到可用的對話模型。可在進階設定手動輸入模型。");
      }

      const preferredModel = models.includes(formData.model)
        ? formData.model
        : models.includes(activePreset.defaultModel)
          ? activePreset.defaultModel
          : models[0];
      setModelOptions(models);
      setField("model", preferredModel);
      lastVerificationFingerprintRef.current = fingerprint;
      setVerification({
        status: "success",
        message: `連線成功，找到 ${models.length} 個可用模型。`,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setVerification({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "無法驗證這把 Key，可展開進階設定後手動儲存。",
      });
    }
  };

  const pasteApiKey = async () => {
    try {
      const value = (await navigator.clipboard.readText()).trim();
      if (!value) {
        toast.error("剪貼簿沒有可貼上的 API Key");
        return;
      }
      setField("apiKey", value);
      resetVerification("已貼上 Key，準備驗證。 ");
      window.setTimeout(() => void validateAndLoadModels(value), 0);
    } catch {
      toast.error("瀏覽器不允許讀取剪貼簿，請直接按 Ctrl+V 貼上");
    }
  };

  const saveApiKey = async () => {
    if (!activePreset && !isLegacyRecord) {
      toast.error("請選擇 AI 服務商");
      return;
    }
    if (!formData.apiKey.trim()) {
      toast.error("請貼上 API Key");
      return;
    }
    if (!isLegacyRecord && !formData.baseUrl.trim()) {
      setAdvancedOpen(true);
      toast.error("請輸入 API Base URL");
      return;
    }
    if (!isLegacyRecord && !formData.model.trim()) {
      setAdvancedOpen(true);
      toast.error("請選擇或輸入模型");
      return;
    }

    setLoading(true);
    const keyName =
      formData.keyName.trim() ||
      (activePreset ? `${activePreset.shortLabel} API Key` : "API Key");
    const payload = {
      key_name: keyName,
      api_key: formData.apiKey.trim(),
      description: formData.description.trim() || null,
      permissions: buildApiKeyPermissions(
        {
          read: formData.read,
          write: formData.write,
          metadata: activePreset
            ? {
                provider: formData.provider.trim() || activePreset.providerValue,
                model: formData.model.trim(),
                baseUrl: formData.baseUrl.trim(),
                editable: true,
              }
            : normalizeApiKeyPermissions(record?.permissions).metadata,
        },
        record?.permissions,
      ),
      is_active: formData.isActive,
      expires_at: formData.expiresAt ? new Date(formData.expiresAt).toISOString() : null,
      updated_at: new Date().toISOString(),
    };

    try {
      if (record) {
        const { error } = await supabase.from("api_keys").update(payload).eq("id", record.id);
        if (error) throw error;
        toast.success("API 金鑰已更新");
      } else {
        const { error } = await supabase.from("api_keys").insert(payload);
        if (error) throw error;
        toast.success(`${activePreset?.label ?? "API"} 金鑰已新增並啟用`);
      }

      onKeyCreated();
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving API key metadata:", error);
      toast.error(isEditMode ? "更新 API 金鑰失敗" : "新增 API 金鑰失敗");
    } finally {
      setLoading(false);
    }
  };

  const verificationStyles = {
    idle: "border-slate-500/25 bg-slate-500/8 text-slate-300",
    checking: "border-cyan-400/30 bg-cyan-400/10 text-cyan-100",
    success: "border-emerald-400/30 bg-emerald-400/10 text-emerald-100",
    error: "border-amber-400/30 bg-amber-400/10 text-amber-100",
  }[verification.status];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] max-w-2xl overflow-y-auto border-cyan-300/20 bg-[#0b1728] p-0 text-slate-100 shadow-[0_30px_100px_rgba(0,0,0,0.58)]">
        <DialogHeader className="border-b border-cyan-300/12 bg-[linear-gradient(135deg,rgba(34,211,238,0.10),transparent_55%)] px-6 py-5 text-left">
          <DialogTitle className="flex items-center gap-3 text-2xl font-black text-slate-50">
            <span className="grid h-10 w-10 place-items-center rounded-2xl border border-cyan-300/25 bg-cyan-400/10 text-cyan-200">
              <KeyRound className="h-5 w-5" />
            </span>
            {isEditMode ? "編輯 AI 金鑰" : "新增 AI 金鑰"}
          </DialogTitle>
          <DialogDescription className="pl-[52px] text-sm leading-6 text-slate-300">
            選服務商、貼上 Key 就能使用；端點與建議模型由系統處理。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 px-6 py-5">
          <section className="space-y-3" aria-labelledby="provider-heading">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 id="provider-heading" className="text-base font-black text-slate-50">
                  1. 選擇 AI 服務商
                </h3>
                <p className="mt-1 text-sm text-slate-400">不用輸入 provider 代碼或查 API 網址。</p>
              </div>
              {activePreset ? (
                <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-xs font-bold text-cyan-100">
                  {activePreset.shortLabel}
                </span>
              ) : null}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {AI_PROVIDER_PRESETS.map((preset) => {
                const Icon = providerIcons[preset.id];
                const selected = selectedProviderId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => selectProvider(preset.id)}
                    className={cn(
                      "group flex min-h-[86px] items-start gap-3 rounded-2xl border p-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300",
                      selected
                        ? "border-cyan-300/60 bg-cyan-400/12 shadow-[inset_0_0_0_1px_rgba(103,232,249,0.10)]"
                        : "border-slate-600/35 bg-[#101e32] hover:border-cyan-300/35 hover:bg-[#13243a]",
                    )}
                  >
                    <span
                      className={cn(
                        "grid h-10 w-10 shrink-0 place-items-center rounded-xl border",
                        selected
                          ? "border-cyan-300/35 bg-cyan-400/15 text-cyan-100"
                          : "border-slate-600/35 bg-[#0a1727] text-slate-300 group-hover:text-cyan-200",
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-black text-slate-100">{preset.label}</span>
                      <span className="mt-1 block text-xs leading-5 text-slate-400">
                        {preset.description}
                      </span>
                    </span>
                    {selected ? <CheckCircle2 className="ml-auto h-4 w-4 text-cyan-200" /> : null}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="space-y-3" aria-labelledby="key-heading">
            <div>
              <h3 id="key-heading" className="text-base font-black text-slate-50">
                2. 貼上 API Key
              </h3>
              <p className="mt-1 text-sm text-slate-400">Key 只會儲存在既有金鑰資料，不會顯示在驗證網址。</p>
            </div>

            <div className="relative">
              <Input
                id="api-key-value"
                type={showKey ? "text" : "password"}
                value={formData.apiKey}
                autoComplete="off"
                onChange={(event) => {
                  setField("apiKey", event.target.value);
                  resetVerification("Key 已變更，離開欄位後會重新驗證。");
                }}
                onBlur={() => {
                  if (formData.apiKey.trim()) void validateAndLoadModels();
                }}
                placeholder={
                  activePreset?.keyPlaceholder ??
                  (isLegacyRecord ? "編輯既有 API Key" : "請先選擇服務商")
                }
                disabled={!activePreset && !isLegacyRecord}
                className="h-12 border-cyan-300/22 bg-[#101e32] pr-24 font-mono text-sm text-slate-50 placeholder:text-slate-400"
              />
              <div className="absolute inset-y-0 right-2 flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={!activePreset && !isLegacyRecord}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => void pasteApiKey()}
                  className="h-9 w-9 text-cyan-100 hover:bg-cyan-400/12 hover:text-white"
                  aria-label="貼上 API Key"
                  title="貼上 API Key"
                >
                  <ClipboardPaste className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={!formData.apiKey}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => setShowKey((current) => !current)}
                  className="h-9 w-9 text-cyan-50/80 hover:bg-cyan-400/12 hover:text-white"
                  aria-label={showKey ? "隱藏 API Key" : "顯示 API Key"}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className={cn("flex items-start gap-3 rounded-2xl border px-4 py-3", verificationStyles)}>
              {verification.status === "checking" ? (
                <LoaderCircle className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
              ) : verification.status === "success" ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              ) : verification.status === "error" ? (
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <KeyRound className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <p className="min-w-0 flex-1 text-sm leading-5">{verification.message}</p>
              {formData.apiKey && verification.status !== "checking" ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void validateAndLoadModels()}
                  className="h-7 shrink-0 px-2 text-current hover:bg-white/10 hover:text-white"
                >
                  <RefreshCw className="mr-1 h-3.5 w-3.5" />
                  {verification.status === "success" ? "重新驗證" : "驗證並取得模型"}
                </Button>
              ) : null}
            </div>
          </section>

          {activePreset ? (
            <section className="space-y-2">
              <Label htmlFor="model" className="text-sm font-black text-slate-100">
                3. 使用模型
              </Label>
              {modelOptions.length > 0 ? (
                <Select value={formData.model} onValueChange={(value) => setField("model", value)}>
                  <SelectTrigger id="model" className="h-11 border-cyan-300/22 bg-[#101e32] text-slate-100">
                    <SelectValue placeholder="選擇模型" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72 border-cyan-300/20 bg-[#101e32] text-slate-100">
                    {modelOptions.map((model) => (
                      <SelectItem key={model} value={model}>{model}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="model"
                  value={formData.model}
                  onChange={(event) => setField("model", event.target.value)}
                  placeholder="驗證後會自動選擇，也可手動輸入"
                  className="h-11 border-cyan-300/22 bg-[#101e32] text-slate-100 placeholder:text-slate-400"
                />
              )}
            </section>
          ) : null}

          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full justify-between border-slate-500/30 bg-[#0d1a2d] text-slate-200 hover:bg-[#13243a] hover:text-white"
              >
                <span className="flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4 text-cyan-200" />
                  進階設定
                  <span className="text-xs font-normal text-slate-400">一般情況不需要修改</span>
                </span>
                <ChevronDown className={cn("h-4 w-4 transition-transform", advancedOpen && "rotate-180")} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <div className="space-y-4 rounded-2xl border border-cyan-300/16 bg-[#0d1a2d] p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="api-key-name" className="text-sm font-bold text-slate-300">顯示名稱</Label>
                    <Input
                      id="api-key-name"
                      value={formData.keyName}
                      onChange={(event) => setField("keyName", event.target.value)}
                      placeholder={activePreset ? `${activePreset.shortLabel} API Key` : "AI API Key"}
                      className="h-10 border-cyan-300/18 bg-[#101e32] text-slate-100"
                    />
                  </div>
                  {selectedProviderId === "openai-compatible" ? (
                    <div className="space-y-2">
                      <Label htmlFor="provider" className="text-sm font-bold text-slate-300">Provider 代碼</Label>
                      <Input
                        id="provider"
                        value={formData.provider}
                        onChange={(event) => {
                          setField("provider", event.target.value);
                          resetVerification();
                        }}
                        placeholder="例如 openrouter、groq"
                        className="h-10 border-cyan-300/18 bg-[#101e32] text-slate-100"
                      />
                    </div>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="base-url" className="text-sm font-bold text-slate-300">API Base URL</Label>
                  <Input
                    id="base-url"
                    type="url"
                    value={formData.baseUrl}
                    onChange={(event) => {
                      setField("baseUrl", event.target.value);
                      resetVerification();
                    }}
                    placeholder="https://provider.example.com/v1"
                    className="h-10 border-cyan-300/18 bg-[#101e32] font-mono text-sm text-slate-100"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="description" className="text-sm font-bold text-slate-300">用途說明</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(event) => setField("description", event.target.value)}
                      placeholder="例如：資料查詢正式環境"
                      className="min-h-[84px] border-cyan-300/18 bg-[#101e32] text-slate-100"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="expires-at" className="text-sm font-bold text-slate-300">到期時間（選填）</Label>
                    <Input
                      id="expires-at"
                      type="datetime-local"
                      value={formData.expiresAt}
                      onChange={(event) => setField("expiresAt", event.target.value)}
                      className="h-10 border-cyan-300/18 bg-[#101e32] text-slate-100"
                    />
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-3">
                  <label className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-500/25 bg-[#101e32] px-3 py-2.5">
                    <span className="text-sm font-bold text-slate-200">啟用</span>
                    <Switch checked={formData.isActive} onCheckedChange={(checked) => setField("isActive", checked)} />
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-500/25 bg-[#101e32] px-3 py-2.5">
                    <Checkbox checked={formData.read} onCheckedChange={(checked) => setField("read", Boolean(checked))} />
                    <span className="text-sm font-bold text-slate-200">允許讀取</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-500/25 bg-[#101e32] px-3 py-2.5">
                    <Checkbox checked={formData.write} onCheckedChange={(checked) => setField("write", Boolean(checked))} />
                    <span className="text-sm font-bold text-slate-200">允許寫入</span>
                  </label>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {verification.status === "error" ? (
            <div className="flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-400/8 px-3 py-2 text-xs leading-5 text-amber-100">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              驗證失敗不會阻止儲存；確認 Base URL 與模型正確後仍可建立。
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3 border-t border-cyan-300/12 pt-4">
            <p className="hidden text-xs text-slate-400 sm:block">
              {activePreset
                ? `${activePreset.label} · ${formData.model || "尚未選模型"}`
                : isLegacyRecord
                  ? "舊式內部金鑰 · 保留原設定"
                  : "尚未選擇服務商"}
            </p>
            <div className="ml-auto flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="border-slate-500/30 bg-transparent text-slate-300 hover:bg-slate-700/30 hover:text-white"
              >
                取消
              </Button>
              <Button
                type="button"
                onClick={() => void saveApiKey()}
                disabled={
                  loading || (!activePreset && !isLegacyRecord) || !formData.apiKey.trim()
                }
                className="min-w-32 bg-cyan-400 font-black text-[#04111f] shadow-[0_6px_8px_rgba(34,211,238,0.22)] hover:bg-cyan-300"
              >
                {loading ? (
                  <><LoaderCircle className="mr-2 h-4 w-4 animate-spin" />儲存中...</>
                ) : isEditMode ? (
                  "儲存修改"
                ) : (
                  "新增並啟用"
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
