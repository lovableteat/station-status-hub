import { useEffect, useMemo, useState } from "react";
import { KeyRound, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

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

export function CreateApiKeyDialog({
  open,
  onOpenChange,
  onKeyCreated,
  record,
}: CreateApiKeyDialogProps) {
  const isEditMode = Boolean(record);
  const [formData, setFormData] = useState<ApiKeyFormState>(emptyFormState);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setFormData(createFormStateFromRecord(record));
    } else {
      setFormData(emptyFormState);
      setLoading(false);
    }
  }, [open, record]);

  const dialogTitle = useMemo(
    () => (isEditMode ? "編輯 API 金鑰" : "新增 API 金鑰"),
    [isEditMode],
  );

  const setField = <K extends keyof ApiKeyFormState>(key: K, value: ApiKeyFormState[K]) => {
    setFormData((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const generateRandomKey = async () => {
    try {
      const { data, error } = await supabase.rpc("generate_api_key");
      if (error) throw error;
      setField("apiKey", data);
      toast.success("已產生新的 API key");
    } catch (error) {
      console.error("Error generating API key:", error);
      toast.error("產生 API key 失敗");
    }
  };

  const saveApiKey = async () => {
    if (!formData.keyName.trim()) {
      toast.error("請輸入標籤名稱");
      return;
    }

    if (!formData.apiKey.trim()) {
      toast.error("請輸入 API key，或按自動產生");
      return;
    }

    setLoading(true);

    const payload = {
      key_name: formData.keyName.trim(),
      api_key: formData.apiKey.trim(),
      description: formData.description.trim() || null,
      permissions: buildApiKeyPermissions({
        read: formData.read,
        write: formData.write,
        metadata: {
          provider: formData.provider.trim(),
          model: formData.model.trim(),
          baseUrl: formData.baseUrl.trim(),
          editable: true,
        },
      }),
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
        toast.success("API 金鑰已新增");
      }

      onKeyCreated();
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving API key:", error);
      toast.error(isEditMode ? "更新 API 金鑰失敗" : "新增 API 金鑰失敗");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl border-blue-400/20 bg-[#0f182b] text-slate-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl font-black text-slate-50">
            <KeyRound className="h-6 w-6 text-cyan-300" />
            {dialogTitle}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="api-key-name" className="text-sm font-bold text-slate-300">
                  標籤
                </Label>
                <Input
                  id="api-key-name"
                  value={formData.keyName}
                  onChange={(event) => setField("keyName", event.target.value)}
                  placeholder="例如 Gemini API Key"
                  className="h-11 border-blue-400/20 bg-[#10192e] text-slate-100 placeholder:text-slate-500"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="api-key-value" className="text-sm font-bold text-slate-300">
                    API Key
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void generateRandomKey()}
                    className="border-blue-400/20 bg-transparent text-cyan-100 hover:bg-blue-400/10 hover:text-white"
                  >
                    <Sparkles className="mr-1.5 h-4 w-4" />
                    自動產生
                  </Button>
                </div>
                <Textarea
                  id="api-key-value"
                  value={formData.apiKey}
                  onChange={(event) => setField("apiKey", event.target.value)}
                  placeholder="可直接貼上實際 API key"
                  className="min-h-[96px] border-blue-400/20 bg-[#10192e] font-mono text-sm text-slate-100 placeholder:text-slate-500"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="provider" className="text-sm font-bold text-slate-300">
                    AI 服務商
                  </Label>
                  <Input
                    id="provider"
                    value={formData.provider}
                    onChange={(event) => setField("provider", event.target.value)}
                    placeholder="例如 gemini"
                    className="h-11 border-blue-400/20 bg-[#10192e] text-slate-100 placeholder:text-slate-500"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="model" className="text-sm font-bold text-slate-300">
                    模型
                  </Label>
                  <Input
                    id="model"
                    value={formData.model}
                    onChange={(event) => setField("model", event.target.value)}
                    placeholder="例如 gemini-2.5-flash"
                    className="h-11 border-blue-400/20 bg-[#10192e] text-slate-100 placeholder:text-slate-500"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="base-url" className="text-sm font-bold text-slate-300">
                  API Base URL
                </Label>
                <Input
                  id="base-url"
                  value={formData.baseUrl}
                  onChange={(event) => setField("baseUrl", event.target.value)}
                  placeholder="https://generativelanguage.googleapis.com/v1beta"
                  className="h-11 border-blue-400/20 bg-[#10192e] text-slate-100 placeholder:text-slate-500"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description" className="text-sm font-bold text-slate-300">
                  說明
                </Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(event) => setField("description", event.target.value)}
                  placeholder="補充這把金鑰用途，例如 Gemini 串接、測試或正式環境。"
                  className="min-h-[96px] border-blue-400/20 bg-[#10192e] text-slate-100 placeholder:text-slate-500"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="expires-at" className="text-sm font-bold text-slate-300">
                  到期時間
                </Label>
                <Input
                  id="expires-at"
                  type="datetime-local"
                  value={formData.expiresAt}
                  onChange={(event) => setField("expiresAt", event.target.value)}
                  className="h-11 border-blue-400/20 bg-[#10192e] text-slate-100"
                />
              </div>
            </div>

            <div className="space-y-4 rounded-3xl border border-blue-400/15 bg-[#10192e] p-5">
              <div className="space-y-3">
                <h3 className="text-base font-black text-slate-50">權限與狀態</h3>
                <p className="text-sm leading-6 text-slate-400">
                  這裡控制這把 key 是否可用，以及它能不能做讀取或寫入操作。
                </p>
              </div>

              <label className="flex cursor-pointer items-center justify-between rounded-2xl border border-blue-400/15 bg-[#0b1423] px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-slate-100">啟用狀態</p>
                  <p className="mt-1 text-sm text-slate-400">啟用後 API 才能正常使用這把 key。</p>
                </div>
                <Switch
                  checked={formData.isActive}
                  onCheckedChange={(checked) => setField("isActive", checked)}
                />
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-blue-400/15 bg-[#0b1423] p-4">
                <Checkbox
                  checked={formData.read}
                  onCheckedChange={(checked) => setField("read", Boolean(checked))}
                  className="mt-0.5 border-cyan-400/35 data-[state=checked]:bg-cyan-500"
                />
                <div>
                  <p className="text-sm font-bold text-slate-100">讀取</p>
                  <p className="mt-1 text-sm leading-6 text-slate-400">
                    允許查詢 API 回傳資料。
                  </p>
                </div>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-blue-400/15 bg-[#0b1423] p-4">
                <Checkbox
                  checked={formData.write}
                  onCheckedChange={(checked) => setField("write", Boolean(checked))}
                  className="mt-0.5 border-cyan-400/35 data-[state=checked]:bg-cyan-500"
                />
                <div>
                  <p className="text-sm font-bold text-slate-100">寫入</p>
                  <p className="mt-1 text-sm leading-6 text-slate-400">
                    允許外部系統執行寫入型 API。
                  </p>
                </div>
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-blue-400/20 bg-transparent text-slate-300 hover:bg-blue-400/10 hover:text-white"
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={() => void saveApiKey()}
              disabled={loading}
              className="bg-cyan-500 text-slate-950 hover:bg-cyan-400"
            >
              {loading ? "儲存中..." : isEditMode ? "儲存修改" : "新增金鑰"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
