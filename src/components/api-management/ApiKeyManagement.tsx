import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  Clock3,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Pencil,
  Play,
  Plus,
  Power,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { CreateApiKeyDialog } from "./CreateApiKeyDialog";
import {
  GEMINI_DEFAULT_MODEL,
  GEMINI_FREE_MODEL_PROFILES,
  formatGeminiQuotaSummary,
  getGeminiFreeModelProfile,
} from "./aiProviderCatalog";
import {
  ApiKeyRecord,
  buildApiKeyModelTargets,
  normalizeApiKeyPermissions,
} from "./apiKeyHelpers";

interface ApiKeyManagementProps {
  onTestKey?: (record: ApiKeyRecord, model: string) => void;
}

function maskApiKey(value: string, visible: boolean) {
  if (visible) return value;
  if (value.length <= 16) return `${value.slice(0, 4)}••••${value.slice(-4)}`;
  return `${value.slice(0, 8)}••••••••••••${value.slice(-8)}`;
}

function formatDateTime(value: string | null, fallback: string) {
  if (!value) return fallback;

  try {
    return format(new Date(value), "yyyy/MM/dd HH:mm");
  } catch {
    return fallback;
  }
}

export function ApiKeyManagement({ onTestKey }: ApiKeyManagementProps) {
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<ApiKeyRecord | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const { canEditModule } = usePermissions();
  const canEditApiManagement = canEditModule("api-management");

  const loadApiKeys = async () => {
    try {
      const { data, error } = await supabase
        .from("api_keys")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setApiKeys((data ?? []) as ApiKeyRecord[]);
    } catch (error) {
      console.error("Error loading API keys:", error);
      toast.error("讀取 API 金鑰失敗");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadApiKeys();
  }, []);

  const stats = useMemo(() => {
    const now = Date.now();

    return {
      total: apiKeys.length,
      active: apiKeys.filter((item) => item.is_active).length,
      expiringSoon: apiKeys.filter((item) => {
        if (!item.expires_at || !item.is_active) return false;
        const expiresAt = new Date(item.expires_at).getTime();
        return expiresAt > now && expiresAt - now <= 1000 * 60 * 60 * 24 * 14;
      }).length,
      usageCount: apiKeys.reduce((sum, item) => sum + (item.usage_count ?? 0), 0),
    };
  }, [apiKeys]);

  const geminiTargets = useMemo(() => {
    const geminiRecords = apiKeys.filter((record) => {
      const metadata = normalizeApiKeyPermissions(record.permissions).metadata;
      return metadata.provider.trim().toLowerCase() === "gemini";
    });

    return buildApiKeyModelTargets(
      geminiRecords,
      GEMINI_FREE_MODEL_PROFILES.map((profile) => profile.id),
    );
  }, [apiKeys]);

  const toggleKeyVisibility = (keyId: string) => {
    setVisibleKeys((current) => {
      const next = new Set(current);
      if (next.has(keyId)) {
        next.delete(keyId);
      } else {
        next.add(keyId);
      }
      return next;
    });
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("API key 已複製");
    } catch (error) {
      toast.error("複製失敗");
    }
  };

  const openCreateDialog = () => {
    if (!canEditApiManagement) return;
    setEditingRecord(null);
    setDialogOpen(true);
  };

  const openEditDialog = (record: ApiKeyRecord) => {
    if (!canEditApiManagement) return;
    setEditingRecord(record);
    setDialogOpen(true);
  };

  const toggleKeyStatus = async (keyId: string, currentStatus: boolean) => {
    if (!canEditApiManagement) return;

    try {
      const { error } = await supabase
        .from("api_keys")
        .update({
          is_active: !currentStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", keyId);

      if (error) throw error;

      toast.success(!currentStatus ? "API 金鑰已啟用" : "API 金鑰已停用");
      await loadApiKeys();
    } catch (error) {
      console.error("Error toggling key status:", error);
      toast.error("更新 API 金鑰狀態失敗");
    }
  };

  const deleteKey = async (keyId: string) => {
    if (!canEditApiManagement) return;

    try {
      const { error } = await supabase.from("api_keys").delete().eq("id", keyId);
      if (error) throw error;

      toast.success("API 金鑰已刪除");
      await loadApiKeys();
    } catch (error) {
      console.error("Error deleting API key:", error);
      toast.error("刪除 API 金鑰失敗");
    }
  };

  const getStatusBadge = (record: ApiKeyRecord) => {
    if (!record.is_active) {
      return (
        <Badge variant="outline" className="admin-api-status is-disabled">
          停用
        </Badge>
      );
    }

    if (record.expires_at && new Date(record.expires_at) < new Date()) {
      return (
        <Badge variant="outline" className="admin-api-status is-expired">
          已過期
        </Badge>
      );
    }

    return (
      <Badge variant="outline" className="admin-api-status is-active">
        啟用
      </Badge>
    );
  };

  return (
    <div className="space-y-5">
      <div data-admin-zone="api-key-status" className="grid gap-4 lg:grid-cols-4">
        <Card className="admin-api-stat">
          <CardContent className="pt-5">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#8fb1c9]">
              Total Keys
            </p>
            <p className="mt-3 text-3xl font-black text-slate-50">{stats.total}</p>
            <p className="mt-2 text-sm text-slate-300">目前系統內已建立的 API 金鑰數量。</p>
          </CardContent>
        </Card>

        <Card className="admin-api-stat">
          <CardContent className="pt-5">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#8fb1c9]">
              Active
            </p>
            <p className="mt-3 text-3xl font-black text-slate-50">{stats.active}</p>
            <p className="mt-2 text-sm text-slate-300">目前可直接使用的 API 金鑰數量。</p>
          </CardContent>
        </Card>

        <Card className="admin-api-stat">
          <CardContent className="pt-5">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#8fb1c9]">
              Expiring Soon
            </p>
            <p className="mt-3 text-3xl font-black text-slate-50">{stats.expiringSoon}</p>
            <p className="mt-2 text-sm text-slate-300">14 天內到期的金鑰數量。</p>
          </CardContent>
        </Card>

        <Card className="admin-api-stat">
          <CardContent className="pt-5">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#8fb1c9]">
              Usage Count
            </p>
            <p className="mt-3 text-3xl font-black text-slate-50">{stats.usageCount}</p>
            <p className="mt-2 text-sm text-slate-300">
              累積呼叫次數，不代表每日已用或剩餘配額。
            </p>
          </CardContent>
        </Card>
      </div>

      <Card
        data-admin-zone="gemini-model-operations"
        className="admin-api-panel admin-api-gemini-policy"
      >
        <CardHeader className="admin-api-gemini-header">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-xl font-black text-slate-50">
                Gemini 三模型操作
              </CardTitle>
              <Badge variant="outline" className="admin-api-gemini-selectable">
                {geminiTargets.length} 個操作項
              </Badge>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              每個操作項都直接使用所顯示的既有 Gemini API Key；選用測試不會改寫金鑰的儲存模型。
            </p>
          </div>
          <div className="admin-api-gemini-remaining">
            Google 專案共享配額快照
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {geminiTargets.length ? (
            <div className="admin-api-gemini-grid">
              {geminiTargets.map((target) => {
                const profile = getGeminiFreeModelProfile(target.model);
                if (!profile) return null;

                const storedModel = normalizeApiKeyPermissions(
                  target.record.permissions,
                ).metadata.model.trim();
                const isCurrent = storedModel === target.model;
                const isDefault = target.model === GEMINI_DEFAULT_MODEL;

                return (
                  <section
                    key={target.id}
                    className={`admin-api-gemini-model-card${isCurrent ? " is-current" : ""}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Badge
                        variant="outline"
                        className={
                          isDefault
                            ? "admin-api-gemini-default"
                            : "admin-api-gemini-manual"
                        }
                      >
                        {isDefault ? "日常預設" : "手動選用"}
                      </Badge>
                      {isCurrent ? (
                        <Badge variant="outline" className="admin-api-gemini-current">
                          目前儲存模型
                        </Badge>
                      ) : null}
                    </div>

                    <h3 className="mt-4 text-base font-black text-slate-50">
                      {profile.label}
                    </h3>
                    <code className="mt-1 block text-xs text-cyan-100">
                      {target.model}
                    </code>
                    <p className="mt-4 text-sm font-bold text-slate-100">
                      {formatGeminiQuotaSummary(profile)}
                    </p>
                    <p className="mt-2 text-xs font-semibold text-amber-200">
                      本系統用量：尚未開始按模型統計
                    </p>

                    <div className="admin-api-gemini-key mt-4">
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                        關聯 Gemini API Key
                      </p>
                      <p className="mt-2 text-sm font-bold text-slate-100">
                        {target.record.key_name}
                      </p>
                      <div className="mt-2 flex items-start gap-2">
                        <code className="admin-api-code admin-api-key-value min-w-0 flex-1">
                          {maskApiKey(target.record.api_key, visibleKeys.has(target.id))}
                        </code>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => toggleKeyVisibility(target.id)}
                          className="admin-api-key-tool h-8 w-8 shrink-0"
                          aria-label={visibleKeys.has(target.id) ? "隱藏金鑰" : "顯示金鑰"}
                        >
                          {visibleKeys.has(target.id) ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => void copyToClipboard(target.record.api_key)}
                          className="admin-api-key-tool h-8 w-8 shrink-0"
                          aria-label={`複製 ${target.record.key_name}`}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <Button
                      type="button"
                      onClick={() => onTestKey?.(target.record, target.model)}
                      disabled={!target.record.is_active}
                      className="mt-4 w-full bg-cyan-300 font-black text-slate-950 hover:bg-cyan-200"
                    >
                      <Play className="mr-2 h-4 w-4" />
                      選用並前往測試
                    </Button>
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="admin-api-card-muted px-5 py-6 text-sm leading-6 text-slate-300">
              尚無可用的 Gemini API Key。新增或啟用既有 key 後，三個模型操作項會顯示在這裡。
            </div>
          )}

          <p className="admin-api-gemini-note text-xs leading-5">
            三個模型是不同的 API model，但共用同一筆既有 key record；Google 配額屬專案共享範圍，不會因同專案增加 key 而增加額度。
          </p>
        </CardContent>
      </Card>

      <Card data-admin-zone="api-key-list" className="admin-api-panel admin-api-key-panel">
        <CardHeader className="admin-api-key-header flex flex-col gap-4 pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="admin-api-key-title flex items-center gap-2 text-2xl font-black">
              <span className="admin-api-key-icon" aria-hidden="true">
                <ShieldCheck className="h-5 w-5" />
              </span>
              API 金鑰管理
            </CardTitle>
            <p className="admin-api-key-description mt-2 text-sm leading-6">
              在這裡可新增、編輯、停用與刪除 API 金鑰。需要測試時可直接從列表把金鑰帶去測試頁。
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            disabled={!canEditApiManagement}
            onClick={openCreateDialog}
            className="admin-api-primary-action"
          >
            <Plus className="mr-2 h-4 w-4" />
            建立新金鑰
          </Button>
        </CardHeader>

        <CardContent className="pt-5">
          {loading ? (
            <div className="py-12 text-center text-sm text-slate-300">讀取中...</div>
          ) : apiKeys.length === 0 ? (
            <div className="admin-api-key-empty rounded-xl border border-dashed px-6 py-12 text-center">
              <KeyRound className="mx-auto h-12 w-12" />
              <p className="mt-4 text-lg font-bold text-slate-100">目前沒有 API 金鑰</p>
              <p className="mt-2 text-sm text-slate-300">
                你可以先新增 API key，再補上 provider、model 和 base URL。
              </p>
              <Button
                type="button"
                variant="outline"
                disabled={!canEditApiManagement}
                onClick={openCreateDialog}
                className="admin-api-primary-action mt-6"
              >
                <Plus className="mr-2 h-4 w-4" />
                立即新增
              </Button>
            </div>
          ) : (
            <div className="admin-api-table-frame">
              <p className="admin-api-mobile-table-hint">左右滑動檢視完整欄位；金鑰內容仍維持遮罩，可個別查看或複製。</p>
              <div className="admin-api-table-scroll" tabIndex={0} aria-label="API 金鑰清單，可左右滑動">
                <Table className="min-w-[1040px]">
                  <TableHeader>
                    <TableRow className="admin-api-table-header-row hover:bg-transparent">
                      <TableHead>名稱 / 服務商</TableHead>
                      <TableHead>金鑰</TableHead>
                      <TableHead>狀態</TableHead>
                      <TableHead>模型</TableHead>
                      <TableHead>權限</TableHead>
                      <TableHead>使用次數</TableHead>
                      <TableHead>最後使用</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                  {apiKeys.map((apiKey) => {
                    const permissions = normalizeApiKeyPermissions(apiKey.permissions);
                    const provider = permissions.metadata.provider.trim().toLowerCase();
                    const storedModel = permissions.metadata.model.trim();
                    const geminiProfile =
                      provider === "gemini"
                        ? getGeminiFreeModelProfile(storedModel)
                        : undefined;
                    return (
                      <TableRow
                        key={apiKey.id}
                        className="admin-api-key-row"
                      >
                        <TableCell className="align-top">
                          <div>
                            <p className="admin-api-key-name font-bold">{apiKey.key_name}</p>
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              {permissions.metadata.provider ? (
                                <Badge
                                  variant="outline"
                                  className="admin-api-badge admin-api-badge-provider"
                                >
                                  {permissions.metadata.provider}
                                </Badge>
                              ) : null}
                              {permissions.metadata.editable ? (
                                <Badge
                                  variant="outline"
                                  className="admin-api-badge admin-api-badge-editable"
                                >
                                  可編輯
                                </Badge>
                              ) : null}
                            </div>
                            <p className="admin-api-key-summary mt-2 text-sm">
                              {apiKey.description || "未填寫說明"}
                            </p>
                          </div>
                        </TableCell>

                        <TableCell className="align-top">
                          <div className="flex items-start gap-2">
                            <code className="admin-api-code admin-api-key-value max-w-[26rem]">
                              {maskApiKey(apiKey.api_key, visibleKeys.has(apiKey.id))}
                            </code>
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => toggleKeyVisibility(apiKey.id)}
                                className="admin-api-key-tool h-8 w-8"
                                aria-label={visibleKeys.has(apiKey.id) ? "隱藏金鑰" : "顯示金鑰"}
                              >
                                {visibleKeys.has(apiKey.id) ? (
                                  <EyeOff className="h-4 w-4" />
                                ) : (
                                  <Eye className="h-4 w-4" />
                                )}
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => void copyToClipboard(apiKey.api_key)}
                                className="admin-api-key-tool h-8 w-8"
                                aria-label="複製金鑰"
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </TableCell>

                        <TableCell className="align-top">{getStatusBadge(apiKey)}</TableCell>

                        <TableCell className="min-w-[220px] align-top">
                          <div
                            className="admin-api-model text-sm"
                            data-current-gemini-model={provider === "gemini" ? "true" : undefined}
                          >
                            {provider === "gemini" ? (
                              <span className="admin-api-model-label">目前儲存模型</span>
                            ) : null}
                            <code className="block">{storedModel || "-"}</code>
                            {geminiProfile ? (
                              <>
                                <p className="mt-2 text-xs leading-5 text-slate-300">
                                  {formatGeminiQuotaSummary(geminiProfile)}
                                </p>
                                <p className="mt-1 text-xs font-semibold text-amber-200">
                                  Google 專案共享配額快照；本系統模型別用量尚未開始統計
                                </p>
                              </>
                            ) : null}
                          </div>
                        </TableCell>

                        <TableCell className="align-top">
                          <div className="flex flex-wrap gap-1.5">
                            {permissions.read ? (
                              <Badge
                                variant="outline"
                                className="admin-api-badge admin-api-badge-read"
                              >
                                讀取
                              </Badge>
                            ) : null}
                            {permissions.write ? (
                              <Badge
                                variant="outline"
                                className="admin-api-badge admin-api-badge-write"
                              >
                                寫入
                              </Badge>
                            ) : null}
                          </div>
                        </TableCell>

                        <TableCell className="admin-api-usage align-top">
                          {apiKey.usage_count ?? 0}
                        </TableCell>

                        <TableCell className="align-top">
                            <div className="admin-api-last-used inline-flex items-center gap-2 text-sm">
                              <Clock3 className="h-3.5 w-3.5" />
                            {formatDateTime(apiKey.last_used_at, "從未使用")}
                          </div>
                        </TableCell>

                        <TableCell className="align-top">
                          <div className="admin-api-actions flex justify-end gap-1.5">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => onTestKey?.(apiKey, storedModel)}
                              disabled={!storedModel}
                              className="admin-api-action admin-api-action-test"
                            >
                              <Play className="mr-1.5 h-4 w-4" />
                              測試
                            </Button>

                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={!canEditApiManagement}
                              onClick={() => openEditDialog(apiKey)}
                              className="admin-api-action admin-api-action-edit"
                            >
                              <Pencil className="mr-1.5 h-4 w-4" />
                              編輯
                            </Button>

                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={!canEditApiManagement}
                              onClick={() => void toggleKeyStatus(apiKey.id, apiKey.is_active)}
                              className="admin-api-action admin-api-action-toggle"
                            >
                              <Power className="mr-1.5 h-4 w-4" />
                              {apiKey.is_active ? "停用" : "啟用"}
                            </Button>

                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  disabled={!canEditApiManagement}
                                  className="admin-api-action admin-api-action-delete"
                                  aria-label={`刪除 ${apiKey.key_name}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="admin-api-delete-dialog text-slate-100">
                                <AlertDialogHeader>
                                  <AlertDialogTitle>確認刪除 API 金鑰？</AlertDialogTitle>
                                  <AlertDialogDescription className="text-slate-300">
                                    刪除後這把 key 就不能再使用，而且不會自動恢復。
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel className="admin-api-delete-cancel">
                                    取消
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => void deleteKey(apiKey.id)}
                                    className="admin-api-delete-confirm"
                                  >
                                    刪除
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <CreateApiKeyDialog
        open={canEditApiManagement && dialogOpen}
        onOpenChange={(open) => canEditApiManagement && setDialogOpen(open)}
        onKeyCreated={() => void loadApiKeys()}
        record={editingRecord}
      />
    </div>
  );
}
