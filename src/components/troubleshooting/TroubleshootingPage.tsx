import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { TroubleshootingCreateDialog } from "./TroubleshootingCreateDialog";
import { TroubleshootingCharts } from "./TroubleshootingCharts";
import {
  AlertTriangle,
  Plus,
  Search,
  BarChart3,
  List,
  CheckCircle2,
  Clock,
  XCircle,
  Filter
} from "lucide-react";
import { format } from "date-fns";

interface TroubleshootingRecord {
  id: string;
  system_id: string | null;
  station_id: string | null;
  test_item_id: string | null;
  issue_type: string;
  issue_category: string;
  title: string;
  description: string | null;
  root_cause: string | null;
  solution: string | null;
  severity: string;
  status: string;
  reported_by: string | null;
  resolved_by: string | null;
  occurred_at: string;
  resolved_at: string | null;
  time_to_resolve_hours: number | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

const ISSUE_TYPES = [
  'Diag Fail', 'BIOS Boot Fail', 'Power Cycle Timeout', 'USB Loopback',
  'Thermal Sensor', 'Network Error', 'Memory Error', 'Storage Error',
  'GPU Error', 'BMC Error', 'Cable Issue', 'Component Defect', 'Software Issue', 'Other'
];

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-destructive text-destructive-foreground',
  high: 'bg-danger/80 text-danger-foreground',
  medium: 'bg-warning text-warning-foreground',
  low: 'bg-muted text-muted-foreground',
};

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-danger/20 text-danger border-danger/30',
  investigating: 'bg-warning/20 text-warning border-warning/30',
  resolved: 'bg-success/20 text-success border-success/30',
  closed: 'bg-muted text-muted-foreground border-border',
};

export function TroubleshootingPage() {
  const [records, setRecords] = useState<TroubleshootingRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'stats' | 'list'>('stats');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const { toast } = useToast();

  const loadRecords = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('troubleshooting_records')
        .select('*')
        .order('occurred_at', { ascending: false });

      if (error) throw error;
      setRecords((data as TroubleshootingRecord[]) || []);
    } catch (error) {
      console.error('載入故障排除記錄失敗:', error);
      toast({ title: "載入失敗", description: "無法載入故障排除記錄", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRecords();

    const channel = supabase
      .channel('troubleshooting_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'troubleshooting_records' }, () => {
        loadRecords();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      if (searchTerm && !r.title.toLowerCase().includes(searchTerm.toLowerCase()) &&
          !r.issue_type.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      if (filterStatus !== 'all' && r.status !== filterStatus) return false;
      if (filterType !== 'all' && r.issue_type !== filterType) return false;
      return true;
    });
  }, [records, searchTerm, filterStatus, filterType]);

  // Stats
  const stats = useMemo(() => {
    const total = records.length;
    const open = records.filter(r => r.status === 'open').length;
    const investigating = records.filter(r => r.status === 'investigating').length;
    const resolved = records.filter(r => r.status === 'resolved' || r.status === 'closed').length;
    const avgResolveTime = records
      .filter(r => r.time_to_resolve_hours != null)
      .reduce((sum, r) => sum + (r.time_to_resolve_hours || 0), 0) /
      (records.filter(r => r.time_to_resolve_hours != null).length || 1);

    return { total, open, investigating, resolved, avgResolveTime };
  }, [records]);

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-warning" />
            Troubleshooting 問題統計
          </h1>
          <p className="text-sm text-muted-foreground mt-1">工廠問題追蹤與統計分析</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-muted rounded-lg p-1">
            <Button
              variant={viewMode === 'stats' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('stats')}
            >
              <BarChart3 className="h-4 w-4 mr-1" /> 統計
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4 mr-1" /> 列表
            </Button>
          </div>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-1" /> 新增記錄
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">總問題數</p>
                <p className="text-2xl font-bold text-foreground">{stats.total}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-muted-foreground/50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">待處理</p>
                <p className="text-2xl font-bold text-danger">{stats.open}</p>
              </div>
              <XCircle className="h-8 w-8 text-danger/50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">處理中</p>
                <p className="text-2xl font-bold text-warning">{stats.investigating}</p>
              </div>
              <Clock className="h-8 w-8 text-warning/50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">已解決</p>
                <p className="text-2xl font-bold text-success">{stats.resolved}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-success/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {viewMode === 'stats' ? (
        <TroubleshootingCharts records={records} />
      ) : (
        <>
          {/* Filters */}
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜尋問題標題或類型..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[140px]">
                <Filter className="h-4 w-4 mr-1" />
                <SelectValue placeholder="狀態" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部狀態</SelectItem>
                <SelectItem value="open">待處理</SelectItem>
                <SelectItem value="investigating">處理中</SelectItem>
                <SelectItem value="resolved">已解決</SelectItem>
                <SelectItem value="closed">已關閉</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="問題類型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部類型</SelectItem>
                {ISSUE_TYPES.map(type => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>問題標題</TableHead>
                    <TableHead>類型</TableHead>
                    <TableHead>嚴重度</TableHead>
                    <TableHead>狀態</TableHead>
                    <TableHead>回報人</TableHead>
                    <TableHead>發生時間</TableHead>
                    <TableHead>解決時間(hr)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRecords.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        {isLoading ? '載入中...' : '暫無記錄'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRecords.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell className="font-medium max-w-[200px] truncate">{record.title}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{record.issue_type}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={SEVERITY_COLORS[record.severity] || 'bg-muted'}>
                            {record.severity === 'critical' ? '嚴重' :
                             record.severity === 'high' ? '高' :
                             record.severity === 'medium' ? '中' : '低'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={STATUS_COLORS[record.status] || ''}>
                            {record.status === 'open' ? '待處理' :
                             record.status === 'investigating' ? '處理中' :
                             record.status === 'resolved' ? '已解決' : '已關閉'}
                          </Badge>
                        </TableCell>
                        <TableCell>{record.reported_by || '-'}</TableCell>
                        <TableCell className="text-sm">
                          {format(new Date(record.occurred_at), 'yyyy/MM/dd HH:mm')}
                        </TableCell>
                        <TableCell>
                          {record.time_to_resolve_hours != null
                            ? `${record.time_to_resolve_hours.toFixed(1)}h`
                            : '-'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      <TroubleshootingCreateDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreated={loadRecords}
        issueTypes={ISSUE_TYPES}
      />
    </div>
  );
}
