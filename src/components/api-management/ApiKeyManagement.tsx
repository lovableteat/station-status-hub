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
import { ApiKeyRecord, normalizeApiKeyPermissions } from "./apiKeyHelpers";

interface ApiKeyManagementProps {
  onTestKey?: (record: ApiKeyRecord) => void;
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
            <p className="mt-2 text-sm text-slate-300">所有 API 金鑰累積呼叫次數。</p>
          </CardContent>
        </Card>
      </div>

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

                        <TableCell className="align-top">
                          <div className="admin-api-model text-sm">
                            {permissions.metadata.model || "-"}
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
                              onClick={() => onTestKey?.(apiKey)}
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
