import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Plus, Eye, EyeOff, Copy, Trash2, Key, Clock } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CreateApiKeyDialog } from "./CreateApiKeyDialog";
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
import { format } from "date-fns";

interface ApiKey {
  id: string;
  key_name: string;
  api_key: string;
  description: string;
  permissions: any;
  is_active: boolean;
  expires_at: string | null;
  last_used_at: string | null;
  usage_count: number;
  created_at: string;
}

export function ApiKeyManagement() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadApiKeys();
  }, []);

  const loadApiKeys = async () => {
    try {
      const { data, error } = await supabase
        .from('api_keys')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setApiKeys(data || []);
    } catch (error) {
      console.error('Error loading API keys:', error);
      toast.error('載入 API 金鑰失敗');
    } finally {
      setLoading(false);
    }
  };

  const toggleKeyVisibility = (keyId: string) => {
    const newVisibleKeys = new Set(visibleKeys);
    if (newVisibleKeys.has(keyId)) {
      newVisibleKeys.delete(keyId);
    } else {
      newVisibleKeys.add(keyId);
    }
    setVisibleKeys(newVisibleKeys);
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('已複製到剪貼簿');
    } catch (error) {
      toast.error('複製失敗');
    }
  };

  const toggleKeyStatus = async (keyId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('api_keys')
        .update({ is_active: !currentStatus, updated_at: new Date().toISOString() })
        .eq('id', keyId);

      if (error) throw error;
      toast.success(`API 金鑰已${!currentStatus ? '啟用' : '停用'}`);
      loadApiKeys();
    } catch (error) {
      console.error('Error toggling key status:', error);
      toast.error('更新金鑰狀態失敗');
    }
  };

  const deleteKey = async (keyId: string) => {
    try {
      const { error } = await supabase
        .from('api_keys')
        .delete()
        .eq('id', keyId);

      if (error) throw error;
      toast.success('API 金鑰已刪除');
      loadApiKeys();
    } catch (error) {
      console.error('Error deleting key:', error);
      toast.error('刪除金鑰失敗');
    }
  };

  const formatKey = (key: string, isVisible: boolean) => {
    if (isVisible) return key;
    return `ak_${'*'.repeat(40)}`;
  };

  const getStatusBadge = (isActive: boolean, expiresAt: string | null) => {
    if (!isActive) {
      return <Badge variant="secondary">已停用</Badge>;
    }
    if (expiresAt && new Date(expiresAt) < new Date()) {
      return <Badge variant="destructive">已過期</Badge>;
    }
    return <Badge variant="default">活躍</Badge>;
  };

  if (loading) {
    return <div>載入中...</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              API 金鑰管理
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-2">
              管理外部訪問您系統的 API 金鑰
            </p>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            建立新金鑰
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名稱</TableHead>
                <TableHead>金鑰</TableHead>
                <TableHead>狀態</TableHead>
                <TableHead>權限</TableHead>
                <TableHead>使用次數</TableHead>
                <TableHead>最後使用</TableHead>
                <TableHead>建立時間</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {apiKeys.map((apiKey) => (
                <TableRow key={apiKey.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{apiKey.key_name}</div>
                      {apiKey.description && (
                        <div className="text-sm text-muted-foreground">
                          {apiKey.description}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <code className="text-sm bg-muted px-2 py-1 rounded">
                        {formatKey(apiKey.api_key, visibleKeys.has(apiKey.id))}
                      </code>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleKeyVisibility(apiKey.id)}
                      >
                        {visibleKeys.has(apiKey.id) ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(apiKey.api_key)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(apiKey.is_active, apiKey.expires_at)}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {apiKey.permissions?.read && (
                        <Badge variant="outline">讀取</Badge>
                      )}
                      {apiKey.permissions?.write && (
                        <Badge variant="outline">寫入</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{apiKey.usage_count}</TableCell>
                  <TableCell>
                    {apiKey.last_used_at ? (
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {format(new Date(apiKey.last_used_at), 'yyyy/MM/dd HH:mm')}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">從未使用</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {format(new Date(apiKey.created_at), 'yyyy/MM/dd')}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleKeyStatus(apiKey.id, apiKey.is_active)}
                      >
                        {apiKey.is_active ? '停用' : '啟用'}
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>確定要刪除此 API 金鑰？</AlertDialogTitle>
                            <AlertDialogDescription>
                              此操作無法撤銷。金鑰將立即失效，使用此金鑰的應用程式將無法存取您的系統。
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>取消</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteKey(apiKey.id)}>
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

          {apiKeys.length === 0 && (
            <div className="text-center py-8">
              <Key className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">還沒有任何 API 金鑰</p>
              <Button onClick={() => setCreateDialogOpen(true)}>
                建立第一個 API 金鑰
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <CreateApiKeyDialog 
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onKeyCreated={loadApiKeys}
      />
    </div>
  );
}