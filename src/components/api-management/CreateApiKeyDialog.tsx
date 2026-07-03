import { useState } from "react";
import { Check, Copy, KeyRound, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

interface CreateApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onKeyCreated: () => void;
}

const initialFormState = {
  keyName: "",
  description: "",
  permissions: {
    read: true,
    write: false,
  },
  expiresAt: "",
};

export function CreateApiKeyDialog({
  open,
  onOpenChange,
  onKeyCreated,
}: CreateApiKeyDialogProps) {
  const [formData, setFormData] = useState(initialFormState);
  const [loading, setLoading] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const resetForm = () => {
    setFormData(initialFormState);
    setGeneratedKey(null);
    setCopied(false);
    setLoading(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetForm();
    }
    onOpenChange(nextOpen);
  };

  const createApiKey = async () => {
    if (!formData.keyName.trim()) {
      toast.error("請先填寫金鑰名稱。");
      return;
    }

    setLoading(true);

    try {
      const { data: keyData, error: keyError } = await supabase.rpc("generate_api_key");
      if (keyError) throw keyError;

      const { error: insertError } = await supabase.from("api_keys").insert({
        key_name: formData.keyName.trim(),
        api_key: keyData,
        description: formData.description.trim() || null,
        permissions: formData.permissions,
        expires_at: formData.expiresAt
          ? new Date(formData.expiresAt).toISOString()
          : null,
        is_active: true,
      });

      if (insertError) throw insertError;

      setGeneratedKey(keyData);
      onKeyCreated();
      toast.success("API 金鑰已建立。");
    } catch (error) {
      console.error("Error creating API key:", error);
      toast.error("建立 API 金鑰失敗。");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (!generatedKey) return;

    try {
      await navigator.clipboard.writeText(generatedKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      toast.success("金鑰已複製到剪貼簿。");
    } catch (error) {
      toast.error("複製失敗。");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl border-blue-400/20 bg-[#0f182b] text-slate-100">
        {generatedKey ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-2xl font-black text-slate-50">
                <Check className="h-6 w-6 text-emerald-300" />
                金鑰建立完成
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4">
                <p className="text-sm font-bold text-amber-100">這組金鑰只會完整顯示這一次。</p>
                <p className="mt-2 text-sm leading-6 text-amber-50/85">
                  請立刻複製並存到你的密碼保險箱、部署環境變數或公司憑證管理系統。
                  視窗關掉後，就不會再完整顯示。
                </p>
              </div>

              <Card className="border-blue-400/15 bg-[#10192e]">
                <CardContent className="space-y-3 pt-6">
                  <Label className="text-sm font-bold text-slate-300">API 金鑰</Label>
                  <div className="flex items-start gap-2">
                    <code className="flex-1 rounded-xl border border-blue-400/15 bg-[#0b1423] px-4 py-3 font-mono text-sm leading-6 text-cyan-100">
                      {generatedKey}
                    </code>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={copyToClipboard}
                      className="h-11 w-11 shrink-0 border-blue-400/20 bg-cyan-400/10 text-cyan-100 hover:bg-cyan-400/20"
                    >
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-blue-400/15 bg-[#10192e] p-4">
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">
                    名稱
                  </p>
                  <p className="mt-2 text-sm font-bold text-slate-100">{formData.keyName}</p>
                </div>
                <div className="rounded-2xl border border-blue-400/15 bg-[#10192e] p-4">
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">
                    權限
                  </p>
                  <p className="mt-2 text-sm font-bold text-slate-100">
                    {formData.permissions.read ? "讀取" : ""}
                    {formData.permissions.read && formData.permissions.write ? " / " : ""}
                    {formData.permissions.write ? "寫入" : ""}
                  </p>
                </div>
                <div className="rounded-2xl border border-blue-400/15 bg-[#10192e] p-4">
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">
                    到期時間
                  </p>
                  <p className="mt-2 text-sm font-bold text-slate-100">
                    {formData.expiresAt || "未設定"}
                  </p>
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={() => handleOpenChange(false)}
                  className="bg-cyan-500 text-slate-950 hover:bg-cyan-400"
                >
                  完成
                </Button>
              </div>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-2xl font-black text-slate-50">
                <KeyRound className="h-6 w-6 text-cyan-300" />
                建立新 API 金鑰
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-5">
              <div className="grid gap-5 md:grid-cols-[1.2fr_0.8fr]">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="key-name" className="text-sm font-bold text-slate-300">
                      金鑰名稱
                    </Label>
                    <Input
                      id="key-name"
                      value={formData.keyName}
                      onChange={(event) =>
                        setFormData((current) => ({
                          ...current,
                          keyName: event.target.value,
                        }))
                      }
                      placeholder="例如：MES 正式環境 / BI 報表服務"
                      className="h-11 border-blue-400/20 bg-[#10192e] text-slate-100 placeholder:text-slate-500"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="key-description" className="text-sm font-bold text-slate-300">
                      備註說明
                    </Label>
                    <Textarea
                      id="key-description"
                      value={formData.description}
                      onChange={(event) =>
                        setFormData((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                      placeholder="可填這組金鑰是給哪個系統、哪個人、哪個環境使用。"
                      className="min-h-[120px] border-blue-400/20 bg-[#10192e] text-slate-100 placeholder:text-slate-500"
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
                      onChange={(event) =>
                        setFormData((current) => ({
                          ...current,
                          expiresAt: event.target.value,
                        }))
                      }
                      className="h-11 border-blue-400/20 bg-[#10192e] text-slate-100"
                    />
                  </div>
                </div>

                <div className="rounded-3xl border border-blue-400/15 bg-[#10192e] p-5">
                  <div className="flex items-center gap-2 text-slate-50">
                    <ShieldCheck className="h-5 w-5 text-cyan-300" />
                    <h3 className="text-base font-black">權限設定</h3>
                  </div>

                  <div className="mt-4 space-y-4">
                    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-blue-400/15 bg-[#0b1423] p-4">
                      <Checkbox
                        checked={formData.permissions.read}
                        onCheckedChange={(checked) =>
                          setFormData((current) => ({
                            ...current,
                            permissions: {
                              ...current.permissions,
                              read: Boolean(checked),
                            },
                          }))
                        }
                        className="mt-0.5 border-cyan-400/35 data-[state=checked]:bg-cyan-500"
                      />
                      <div>
                        <p className="text-sm font-bold text-slate-100">讀取</p>
                        <p className="mt-1 text-sm leading-6 text-slate-400">
                          可查詢 API 資料、文件與統計結果。
                        </p>
                      </div>
                    </label>

                    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-blue-400/15 bg-[#0b1423] p-4">
                      <Checkbox
                        checked={formData.permissions.write}
                        onCheckedChange={(checked) =>
                          setFormData((current) => ({
                            ...current,
                            permissions: {
                              ...current.permissions,
                              write: Boolean(checked),
                            },
                          }))
                        }
                        className="mt-0.5 border-cyan-400/35 data-[state=checked]:bg-cyan-500"
                      />
                      <div>
                        <p className="text-sm font-bold text-slate-100">寫入</p>
                        <p className="mt-1 text-sm leading-6 text-slate-400">
                          預留給後續可寫入 API；目前主要還是讀取型用途。
                        </p>
                      </div>
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                  className="border-blue-400/20 bg-transparent text-slate-300 hover:bg-blue-400/10 hover:text-white"
                >
                  取消
                </Button>
                <Button
                  type="button"
                  onClick={createApiKey}
                  disabled={loading}
                  className="bg-cyan-500 text-slate-950 hover:bg-cyan-400"
                >
                  {loading ? "建立中..." : "建立金鑰"}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
