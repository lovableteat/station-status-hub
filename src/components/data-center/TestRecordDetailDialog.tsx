import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Calendar, Clock, User, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface TestRecord {
  id: string;
  system_name: string;
  station_name: string;
  test_item: string;
  status: string;
  progress: number;
  assigned_engineer: string;
  start_date: string;
  completion_date?: string;
  notes?: string;
}

interface TestRecordDetailDialogProps {
  record: TestRecord | null;
  isOpen: boolean;
  onClose: () => void;
  getStatusColor: (status: string) => string;
}

export function TestRecordDetailDialog({ 
  record, 
  isOpen, 
  onClose, 
  getStatusColor 
}: TestRecordDetailDialogProps) {
  const [ganttData, setGanttData] = useState<{
    start_date: string | null;
    end_date: string | null;
  } | null>(null);
  const [workHours, setWorkHours] = useState<{
    planned: number;
    actual: number;
    efficiency: number;
  } | null>(null);

  useEffect(() => {
    if (record && isOpen) {
      fetchGanttData();
    }
  }, [record, isOpen]);

  const fetchGanttData = async () => {
    if (!record) return;

    try {
      // 從甘特圖獲取計劃時間
      const { data: ganttTask } = await supabase
        .from('project_tasks')
        .select('start_date, end_date')
        .eq('task_name', record.system_name)
        .single();

      if (ganttTask) {
        setGanttData(ganttTask);
        calculateWorkHours(ganttTask);
      }
    } catch (error) {
      console.error('Error fetching gantt data:', error);
    }
  };

  const calculateWorkHours = (ganttTask: { start_date: string | null; end_date: string | null }) => {
    if (!ganttTask.start_date || !ganttTask.end_date || !record) return;

    const startDate = new Date(ganttTask.start_date);
    const endDate = new Date(ganttTask.end_date);
    
    // 計算計劃工作時間 (工作日 * 8小時)
    const plannedDays = calculateWorkDays(startDate, endDate);
    const plannedHours = plannedDays * 8;

    // 計算實際工作時間
    let actualHours = 0;
    if (record.start_date && record.completion_date) {
      const actualStart = new Date(record.start_date);
      const actualEnd = new Date(record.completion_date);
      const actualDays = calculateWorkDays(actualStart, actualEnd);
      actualHours = actualDays * 8;
    }

    // 計算效率
    const efficiency = plannedHours > 0 ? Math.round((plannedHours / actualHours) * 100) : 0;

    setWorkHours({
      planned: plannedHours,
      actual: actualHours,
      efficiency: efficiency
    });
  };

  const calculateWorkDays = (start: Date, end: Date): number => {
    let count = 0;
    const current = new Date(start);
    
    while (current <= end) {
      const dayOfWeek = current.getDay();
      // 週一到週五 (1-5)
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        count++;
      }
      current.setDate(current.getDate() + 1);
    }
    
    return count;
  };

  if (!record) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            測試記錄詳細資料
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* 基本資訊 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">基本資訊</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">系統編號</label>
                  <p className="font-medium">{record.system_name}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">測試站點</label>
                  <p className="font-medium">{record.station_name}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">測試項目</label>
                  <p className="font-medium">{record.test_item}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">負責工程師</label>
                  <p className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    {record.assigned_engineer}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">狀態</label>
                  <div className="mt-1">
                    <Badge className={getStatusColor(record.status)}>
                      {record.status === 'Done' && '已完成'}
                      {record.status === 'On-going' && '進行中'}
                      {record.status === 'Not Start' && '未開始'}
                    </Badge>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">進度</label>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${record.progress}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium">{record.progress}%</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 時間資訊 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                時間資訊
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">開始日期</label>
                  <p className="font-medium">{record.start_date}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">完成日期</label>
                  <p className="font-medium">{record.completion_date || '尚未完成'}</p>
                </div>
              </div>

              {ganttData && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">甘特圖計劃開始</label>
                    <p className="font-medium">{ganttData.start_date || '未設定'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">甘特圖計劃結束</label>
                    <p className="font-medium">{ganttData.end_date || '未設定'}</p>
                  </div>
                </div>
              )}

              {workHours && (
                <>
                  <Separator />
                  <div>
                    <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      工作時間統計
                    </label>
                    <div className="grid grid-cols-3 gap-4 mt-2">
                      <div className="text-center p-3 bg-muted/20 rounded-lg">
                        <p className="text-2xl font-bold text-primary">{workHours.planned}</p>
                        <p className="text-xs text-muted-foreground">計劃工時</p>
                      </div>
                      <div className="text-center p-3 bg-muted/20 rounded-lg">
                        <p className="text-2xl font-bold text-warning">{workHours.actual}</p>
                        <p className="text-xs text-muted-foreground">實際工時</p>
                      </div>
                      <div className="text-center p-3 bg-muted/20 rounded-lg">
                        <p className="text-2xl font-bold text-success">{workHours.efficiency}%</p>
                        <p className="text-xs text-muted-foreground">時間效率</p>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* 備註資訊 */}
          {record.notes && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">備註資訊</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-muted/20 p-4 rounded-lg">
                  <p className="whitespace-pre-wrap">{record.notes}</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}