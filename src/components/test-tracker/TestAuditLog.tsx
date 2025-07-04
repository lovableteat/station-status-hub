import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Clock, User, Edit } from "lucide-react";

interface AuditRecord {
  id: string;
  system_id: string;
  station_id: string;
  item_id: string;
  old_status: string | null;
  new_status: string | null;
  old_progress_percent: number | null;
  new_progress_percent: number | null;
  old_notes: string | null;
  new_notes: string | null;
  changed_by: string;
  changed_at: string;
  change_type: string;
}

interface TestAuditLogProps {
  systemId: string;
  systemName: string;
}

export function TestAuditLog({ systemId, systemName }: TestAuditLogProps) {
  const [auditRecords, setAuditRecords] = useState<AuditRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadAuditRecords();
  }, [systemId]);

  const loadAuditRecords = async () => {
    try {
      const { data, error } = await supabase
        .from('test_progress_audit')
        .select(`
          *,
          test_flow_stations!inner(station_name),
          test_flow_items!inner(item_name)
        `)
        .eq('system_id', systemId)
        .order('changed_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setAuditRecords(data || []);
    } catch (error) {
      console.error('Error loading audit records:', error);
    } finally {
      setIsLoading(false);
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

  const getChangeTypeLabel = (changeType: string) => {
    switch (changeType) {
      case 'insert': return '新增';
      case 'update': return '更新';
      case 'delete': return '刪除';
      default: return changeType;
    }
  };

  const formatChange = (record: AuditRecord) => {
    const changes = [];
    
    if (record.old_status !== record.new_status) {
      changes.push(`狀態: ${record.old_status || '無'} → ${record.new_status || '無'}`);
    }
    
    if (record.old_progress_percent !== record.new_progress_percent) {
      changes.push(`進度: ${record.old_progress_percent || 0}% → ${record.new_progress_percent || 0}%`);
    }
    
    if (record.old_notes !== record.new_notes) {
      changes.push(`備註: ${record.old_notes || '無'} → ${record.new_notes || '無'}`);
    }
    
    return changes.join('; ');
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Edit className="h-5 w-5" />
            {systemName} - 修改記錄
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
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
          <Edit className="h-5 w-5" />
          {systemName} - 修改記錄
        </CardTitle>
      </CardHeader>
      <CardContent>
        {auditRecords.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Edit className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>暫無修改記錄</p>
          </div>
        ) : (
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {auditRecords.map((record) => (
              <div
                key={record.id}
                className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
              >
                <div className="flex-shrink-0 mt-1">
                  <Badge className={getChangeTypeColor(record.change_type)}>
                    {getChangeTypeLabel(record.change_type)}
                  </Badge>
                </div>
                
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-3 w-3" />
                    <span className="font-medium">{record.changed_by}</span>
                    <Clock className="h-3 w-3 ml-2" />
                    <span className="text-muted-foreground">
                      {new Date(record.changed_at).toLocaleString('zh-TW')}
                    </span>
                  </div>
                  
                  <div className="text-sm">
                    <span className="font-medium">
                      {(record as any).test_flow_stations?.station_name} - {(record as any).test_flow_items?.item_name}
                    </span>
                  </div>
                  
                  {record.change_type === 'update' && (
                    <div className="text-sm text-muted-foreground">
                      {formatChange(record)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}