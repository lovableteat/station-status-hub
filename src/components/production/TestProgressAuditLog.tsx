import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { History, User, Clock, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface AuditEntry {
  id: string;
  system_id: string;
  station_id: string;
  item_id: string;
  change_type: string;
  old_values?: any;
  new_values?: any;
  user_id?: string;
  created_at: string;
}

interface TestProgressAuditLogProps {
  systemId: string;
  systemName: string;
}

export function TestProgressAuditLog({ systemId, systemName }: TestProgressAuditLogProps) {
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadAuditLogs();
  }, [systemId]);

  const loadAuditLogs = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('test_progress_audit')
        .select('*')
        .eq('system_id', systemId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setAuditLogs(data || []);
    } catch (error) {
      console.error('Error loading audit logs:', error);
      toast({
        title: "載入失敗",
        description: "無法載入修改記錄",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getChangeTypeColor = (changeType: string) => {
    switch (changeType) {
      case 'insert': return 'bg-green-100 text-green-800 border-green-200';
      case 'update': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'delete': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const formatChangeDescription = (entry: AuditEntry) => {
    const oldValues = entry.old_values || {};
    const newValues = entry.new_values || {};
    
    switch (entry.change_type) {
      case 'insert':
        return `新增測試項目${newValues.status ? `，狀態: ${newValues.status}` : ''}${newValues.started_at ? '，開始計時' : ''}`;
      case 'update':
        const changes = [];
        if (oldValues.status !== newValues.status) {
          changes.push(`狀態: ${oldValues.status || '未設定'} → ${newValues.status || '未設定'}`);
        }
        if (oldValues.started_at !== newValues.started_at) {
          if (!oldValues.started_at && newValues.started_at) {
            changes.push('開始計時');
          } else if (oldValues.started_at && !newValues.started_at) {
            changes.push('清除開始時間');
          }
        }
        if (oldValues.completed_at !== newValues.completed_at) {
          if (!oldValues.completed_at && newValues.completed_at) {
            changes.push('完成計時');
          } else if (oldValues.completed_at && !newValues.completed_at) {
            changes.push('清除完成時間');
          }
        }
        if (newValues.actual_hours && newValues.actual_hours !== oldValues.actual_hours) {
          changes.push(`處理時間: ${newValues.actual_hours} 小時`);
        }
        return changes.join(', ') || '資料已更新';
      case 'delete':
        return `刪除測試項目${oldValues.status ? `，原狀態: ${oldValues.status}` : ''}`;
      default:
        return '未知變更';
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            測試進度修改記錄
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-muted rounded"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5" />
          {systemName} - 測試進度修改記錄
          <Badge variant="outline" className="ml-auto">
            {auditLogs.length} 筆記錄
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-96">
          {auditLogs.length > 0 ? (
            <div className="space-y-3">
              {auditLogs.map((entry) => (
                <div key={entry.id} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge className={getChangeTypeColor(entry.change_type)}>
                        {entry.change_type === 'insert' && '新增'}
                        {entry.change_type === 'update' && '更新'}
                        {entry.change_type === 'delete' && '刪除'}
                      </Badge>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        {formatTimestamp(entry.created_at)}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>操作者: {entry.user_id || '系統'}</span>
                  </div>
                  
                  <div className="flex items-center gap-2 text-sm">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span>{formatChangeDescription(entry)}</span>
                  </div>
                  
                  {entry.new_values?.notes && entry.change_type !== 'delete' && (
                    <div className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">
                      <strong>備註:</strong> {entry.new_values.notes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <History className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">尚無修改記錄</h3>
              <p className="text-muted-foreground">此系統的測試進度尚未有任何變更</p>
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}