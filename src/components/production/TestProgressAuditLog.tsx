import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { History, User, Clock, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/components/auth/UserContext";
import { AuditRecordEditDialog } from "./AuditRecordEditDialog";

interface AuditEntry {
  id: string;
  system_id: string;
  station_id: string;
  item_id: string;
  change_type: string;
  old_status?: string;
  new_status?: string;
  old_progress_percent?: number;
  new_progress_percent?: number;
  old_notes?: string;
  new_notes?: string;
  changed_by?: string;
  changed_at: string;
}

interface TestProgressAuditLogProps {
  systemId: string;
  systemName: string;
}

export function TestProgressAuditLog({ systemId, systemName }: TestProgressAuditLogProps) {
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [userNames, setUserNames] = useState<{[key: string]: string}>({});
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const { user } = useUser();

  useEffect(() => {
    loadAuditLogs();
    loadUserNames();
  }, [systemId]);

  const loadAuditLogs = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('test_progress_audit')
        .select('*')
        .eq('system_id', systemId)
        .order('changed_at', { ascending: false })
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

  const loadUserNames = async () => {
    try {
      const { data, error } = await supabase
        .from('system_users')
        .select('username, display_name');

      if (error) throw error;
      
      const nameMap: {[key: string]: string} = {};
      data?.forEach(user => {
        nameMap[user.username] = user.display_name || user.username;
      });
      setUserNames(nameMap);
    } catch (error) {
      console.error('Error loading user names:', error);
    }
  };

  const getChangeTypeColor = (changeType: string) => {
    switch (changeType) {
      case 'insert': return 'bg-success text-success-foreground';
      case 'update': return 'bg-warning text-warning-foreground';
      case 'delete': return 'bg-danger text-danger-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const formatChangeDescription = (entry: AuditEntry) => {
    switch (entry.change_type) {
      case 'insert':
        return `新增測試項目，狀態: ${entry.new_status}，進度: ${entry.new_progress_percent}%`;
      case 'update':
        const changes = [];
        if (entry.old_status !== entry.new_status) {
          changes.push(`狀態: ${entry.old_status} → ${entry.new_status}`);
        }
        if (entry.old_progress_percent !== entry.new_progress_percent) {
          changes.push(`進度: ${entry.old_progress_percent}% → ${entry.new_progress_percent}%`);
        }
        if (entry.old_notes !== entry.new_notes) {
          changes.push(`備註已更新`);
        }
        return changes.join(', ') || '資料已更新';
      case 'delete':
        return `刪除測試項目，原狀態: ${entry.old_status}`;
      default:
        return '未知變更';
    }
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
                        {new Date(entry.changed_at).toLocaleString('zh-TW')}
                      </div>
                    </div>
                    <AuditRecordEditDialog record={entry} onUpdate={loadAuditLogs} />
                  </div>
                  
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>操作者: {entry.changed_by ? (userNames[entry.changed_by] || entry.changed_by) : '系統'}</span>
                  </div>
                  
                  <div className="flex items-center gap-2 text-sm">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span>{formatChangeDescription(entry)}</span>
                  </div>
                  
                  {entry.new_notes && entry.change_type !== 'delete' && (
                    <div className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">
                      <strong>備註:</strong> {entry.new_notes}
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