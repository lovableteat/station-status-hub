import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  Clock3,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { CreateApiKeyDialog } from "./CreateApiKeyDialog";

interface ApiKeyRecord {
  id: string;
  key_name: string;
  api_key: string;
  description: string | null;
  permissions: {
    read?: boolean;
    write?: boolean;
  } | null;
  is_active: boolean;
  expires_at: string | null;
  last_used_at: string | null;
  usage_count: number | null;
  created_at: string;
}

function maskApiKey(value: string, visible: boolean) {
  if (visible) return value;
  return `${value.slice(0, 8)}${"•".repeat(Math.max(12, value.length - 16))}${value.slice(-8)}`;
}

function formatDateTime(value: string | null, fallback: string) {
  if (!value) return fallback;
  try {
    return format(new Date(value), "yyyy/MM/dd HH:mm");
  } catch {
    return fallback;
  }
}

export function ApiKeyManagement() {
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());

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
      toast.error("讀取 API 金鑰失敗。");
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
      if (next.has(keyId)) next.delete(keyId);
      else next.add(keyId);
      return next;
    });
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("金鑰已複製到剪貼簿。");
    } catch (error) {
      toast.error("複製失敗。");
    }
  };

  const toggleKeyStatus = async (keyId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from("api_keys")
        .update({
          is_active: !currentStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", keyId);

      if (error) throw error;

      toast.success(!currentStatus ? "API 金鑰已重新啟用。" : "API 金鑰已停用。");
      await loadApiKeys();
    } catch (error) {
      console.error("Error toggling key status:", error);
      toast.error("更新金鑰狀態失敗。");
    }
  };

  const deleteKey = async (keyId: string) => {
    try {
      const { error } = await supabase.from("api_keys").delete().eq("id", keyId);
      if (error) throw error;

      toast.success("API 金鑰已刪除。");
      await loadApiKeys();
    } catch (error) {
      console.error("Error deleting key:", error);
      toast.error("刪除 API 金鑰失敗。");
    }
  };

  const getStatusBadge = (record: ApiKeyRecord) => {
    if (!record.is_active) {
      return <Badge variant="secondary">停用</Badge>;
    }

    if (record.expires_at && new Date(record.expires_at) < new Date()) {
      return <Badge variant="destructive">已過期</Badge>;
    }

    return <Badge className="bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/15">啟用</Badge>;
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-4">
        <Card className="border-blue-400/15 bg-[#10192e]">
          <CardContent className="pt-5">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-200/80">Total Keys</p>
            <p className="mt-3 text-3xl font-black text-slate-50">{stats.total}</p>
            <p className="mt-2 text-sm text-slate-400">目前所有已建立的 API 金鑰數量。</p>
          </CardContent>
        </Card>
        <Card className="border-blue-400/15 bg-[#10192e]">
          <CardContent className="pt-5">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-200/80">Active</p>
            <p className="mt-3 text-3xl font-black text-slate-50">{stats.active}</p>
            <p className="mt-2 text-sm text-slate-400">目前可正常使用、尚未停用的金鑰。</p>
          </CardContent>
        </Card>
        <Card className="border-blue-400/15 bg-[#10192e]">
          <CardContent className="pt-5">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-200/80">Expiring Soon</p>
            <p className="mt-3 text-3xl font-black text-slate-50">{stats.expiringSoon}</p>
            <p className="mt-2 text-sm text-slate-400">14 天內會到期的金鑰，建議先換發。</p>
          </CardContent>
        </Card>
        <Card className="border-blue-400/15 bg-[#10192e]">
          <CardContent className="pt-5">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-violet-200/80">Usage Count</p>
            <p className="mt-3 text-3xl font-black text-slate-50">{stats.usageCount}</p>
            <p className="mt-2 text-sm text-slate-400">所有 API 金鑰的累積呼叫次數。</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-blue-400/15 bg-[#10192e]">
        <CardHeader className="flex flex-col gap-4 border-b border-blue-400/10 pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-2xl font-black text-slate-50">
              <ShieldCheck className="h-6 w-6 text-cyan-300" />
              API 金鑰管理
            </CardTitle>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              控管外部系統的存取憑證。可查看啟用狀態、使用次數、到期時間與權限範圍。
            </p>
          </div>

          <Button
            type="button"
            onClick={() => setCreateDialogOpen(true)}
            className="bg-cyan-500 text-slate-950 hover:bg-cyan-400"
          >
            <Plus className="mr-2 h-4 w-4" />
            建立新金鑰
          </Button>
        </CardHeader>

        <CardContent className="pt-5">
          {loading ? (
            <div className="py-12 text-center text-sm text-slate-400">讀取中...</div>
          ) : apiKeys.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-blue-400/20 bg-[#0b1423] px-6 py-12 text-center">
              <KeyRound className="mx-auto h-12 w-12 text-slate-500" />
              <p className="mt-4 text-lg font-bold text-slate-100">目前還沒有 API 金鑰</p>
              <p className="mt-2 text-sm text-slate-400">
                先建立第一組金鑰，給外部系統、報表工具或自動化流程使用。
              </p>
              <Button
                type="button"
                onClick={() => setCreateDialogOpen(true)}
                className="mt-6 bg-cyan-500 text-slate-950 hover:bg-cyan-400"
              >
                <Plus className="mr-2 h-4 w-4" />
                建立第一組金鑰
              </Button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-3xl border border-blue-400/10 bg-[#0b1423]">
              <Table>
                <TableHeader>
                  <TableRow className="border-blue-400/10 hover:bg-transparent">
                    <TableHead className="text-slate-400">名稱</TableHead>
                    <TableHead className="text-slate-400">金鑰</TableHead>
                    <TableHead className="text-slate-400">狀態</TableHead>
                    <TableHead className="text-slate-400">權限</TableHead>
                    <TableHead className="text-slate-400">使用次數</TableHead>
                    <TableHead className="text-slate-400">最後使用</TableHead>
                    <TableHead className="text-slate-400">建立時間</TableHead>
                    <TableHead className="text-right text-slate-400">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {apiKeys.map((apiKey) => (
                    <TableRow
                      key={apiKey.id}
                      className="border-blue-400/10 text-slate-200 hover:bg-blue-400/[0.04]"
                    >
                      <TableCell className="align-top">
                        <div>
                          <p className="font-bold text-slate-100">{apiKey.key_name}</p>
                          <p className="mt-1 text-sm text-slate-400">
                            {apiKey.description || "未填寫備註"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="flex items-start gap-2">
                          <code className="max-w-[30rem] rounded-lg border border-blue-400/10 bg-[#10192e] px-3 py-2 font-mono text-xs leading-6 text-cyan-100">
                            {maskApiKey(apiKey.api_key, visibleKeys.has(apiKey.id))}
                          </code>
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => toggleKeyVisibility(apiKey.id)}
                              className="h-8 w-8 text-slate-400 hover:bg-blue-400/10 hover:text-white"
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
                              className="h-8 w-8 text-slate-400 hover:bg-blue-400/10 hover:text-white"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="align-top">{getStatusBadge(apiKey)}</TableCell>
                      <TableCell className="align-top">
                        <div className="flex flex-wrap gap-1.5">
                          {apiKey.permissions?.read && (
                            <Badge variant="outline" className="border-cyan-400/20 text-cyan-100">
                              讀取
                            </Badge>
                          )}
                          {apiKey.permissions?.write && (
                            <Badge variant="outline" className="border-emerald-400/20 text-emerald-100">
                              寫入
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="align-top">{apiKey.usage_count ?? 0}</TableCell>
                      <TableCell className="align-top">
                        <div className="inline-flex items-center gap-2 text-sm text-slate-300">
                          <Clock3 className="h-3.5 w-3.5 text-slate-500" />
                          {formatDateTime(apiKey.last_used_at, "尚未使用")}
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        {formatDateTime(apiKey.created_at, "-")}
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="flex justify-end gap-1.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => void toggleKeyStatus(apiKey.id, apiKey.is_active)}
                            className="text-slate-300 hover:bg-blue-400/10 hover:text-white"
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
                                className="text-rose-200 hover:bg-rose-400/10 hover:text-rose-100"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="border-blue-400/20 bg-[#0f182b] text-slate-100">
                              <AlertDialogHeader>
                                <AlertDialogTitle>確認刪除 API 金鑰？</AlertDialogTitle>
                                <AlertDialogDescription className="text-slate-400">
                                  刪除後無法復原，原本持有這組金鑰的外部系統也會立即失效。
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel className="border-blue-400/20 bg-transparent text-slate-300 hover:bg-blue-400/10 hover:text-white">
                                  取消
                                </AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => void deleteKey(apiKey.id)}
                                  className="bg-rose-500 text-white hover:bg-rose-400"
                                >
                                  刪除
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <CreateApiKeyDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onKeyCreated={() => void loadApiKeys()}
      />
    </div>
  );
}
