
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Edit2, Save, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";

interface TestItem {
  id: string;
  station_id: string;
  item_name: string;
  item_order: number;
  description: string;
}

interface TestProgress {
  id: string;
  system_id: string;
  station_id: string;
  item_id: string;
  status: string;
  progress_percent: number;
  notes: string;
  started_at?: string;
  completed_at?: string;
}

interface ProgressEditDialogProps {
  systemName: string;
  stationName: string;
  stationItems: TestItem[];
  progress: TestProgress[];
  editingProgress: string | null;
  setEditingProgress: (key: string | null) => void;
  editValues: {
    status: string;
    progress_percent: number;
    notes: string;
    started_at?: string;
    completed_at?: string;
  };
  setEditValues: (values: any) => void;
  getProgressForSystemItem: (systemId: string, stationId: string, itemId: string) => TestProgress | undefined;
  handleEditProgress: (systemId: string, stationId: string, itemId: string) => void;
  handleSaveProgress: (systemId: string, stationId: string, itemId: string) => void;
  handleDeleteProgress: (systemId: string, stationId: string, itemId: string) => void;
  getStatusColor: (status: string) => string;
  systemId: string;
  stationId: string;
}

export function ProgressEditDialog({
  systemName,
  stationName,
  stationItems,
  progress,
  editingProgress,
  setEditingProgress,
  editValues,
  setEditValues,
  getProgressForSystemItem,
  handleEditProgress,
  handleSaveProgress,
  handleDeleteProgress,
  getStatusColor,
  systemId,
  stationId,
}: ProgressEditDialogProps) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);

  // 自動時間記錄函數
  const recordEditTime = () => {
    const currentTime = new Date().toISOString();
    console.log('Recording edit time:', currentTime);
    
    // 立即更新編輯時間，不等待存檔
    setEditValues(prev => ({
      ...prev,
      // 如果是Station 0-4，自動記錄時間
      ...(isStation0To4() && {
        started_at: prev.started_at || (prev.status !== 'Not Start' ? currentTime : prev.started_at),
        completed_at: prev.status === 'Done' ? currentTime : prev.completed_at
      })
    }));
  };

  // 檢查是否為Station 0-4
  const isStation0To4 = () => {
    return stationName.includes('Station 0') || 
           stationName.includes('Station 1') || 
           stationName.includes('Station 2') || 
           stationName.includes('Station 3') || 
           stationName.includes('Station 4');
  };

  // 處理狀態變更
  const handleStatusChange = (newStatus: string) => {
    setEditValues(prev => ({ ...prev, status: newStatus }));
    recordEditTime();
  };

  // 處理進度變更
  const handleProgressChange = (newProgress: number) => {
    setEditValues(prev => ({ ...prev, progress_percent: newProgress }));
    recordEditTime();
  };

  // 處理備註變更
  const handleNotesChange = (newNotes: string) => {
    setEditValues(prev => ({ ...prev, notes: newNotes }));
    recordEditTime();
  };

  const completedItems = stationItems.filter(item => {
    const prog = getProgressForSystemItem(systemId, stationId, item.id);
    return prog?.status === 'Done';
  });
  
  const overallPercent = stationItems.length > 0 
    ? Math.round((completedItems.length / stationItems.length) * 100) 
    : 0;

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 px-2">
          <Edit2 className="h-3 w-3" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-lg">
            {systemName} - {stationName} 測試項目編輯
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* 總體進度顯示 */}
          <div className="bg-muted/50 p-4 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold">總體進度</h4>
              <span className="text-sm text-muted-foreground">
                {completedItems.length}/{stationItems.length} 項目完成
              </span>
            </div>
            <Progress value={overallPercent} className="h-3" />
            <div className="text-center mt-2 font-medium">{overallPercent}%</div>
          </div>

          {/* 測試項目列表 - 使用ScrollArea改善顯示 */}
          <ScrollArea className="h-[400px] w-full rounded-md border">
            <div className="p-4 space-y-4">
              {stationItems.map((item) => {
                const itemProgress = getProgressForSystemItem(systemId, stationId, item.id);
                const editKey = `${systemId}-${stationId}-${item.id}`;
                const isEditing = editingProgress === editKey;

                return (
                  <div key={item.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h5 className="font-medium">{item.item_name}</h5>
                        {item.description && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {item.description}
                          </p>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Badge className={getStatusColor(itemProgress?.status || 'Not Start')}>
                          {itemProgress?.status || 'Not Start'}
                        </Badge>
                        
                        {!isEditing ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditProgress(systemId, stationId, item.id)}
                          >
                            <Edit2 className="h-3 w-3" />
                          </Button>
                        ) : (
                          <div className="flex gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleSaveProgress(systemId, stationId, item.id)}
                            >
                              <Save className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setEditingProgress(null)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                            {itemProgress && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDeleteProgress(systemId, stationId, item.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {isEditing && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 p-4 bg-muted/50 rounded-lg">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">狀態</label>
                          <Select 
                            value={editValues.status} 
                            onValueChange={handleStatusChange}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Not Start">Not Start</SelectItem>
                              <SelectItem value="On-going">On-going</SelectItem>
                              <SelectItem value="Done">Done</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <label className="text-sm font-medium">進度 (%)</label>
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            value={editValues.progress_percent}
                            onChange={(e) => handleProgressChange(Number(e.target.value))}
                          />
                        </div>

                        <div className="md:col-span-2 space-y-2">
                          <label className="text-sm font-medium">備註</label>
                          <Textarea
                            value={editValues.notes}
                            onChange={(e) => handleNotesChange(e.target.value)}
                            placeholder="輸入測試備註..."
                            rows={3}
                          />
                        </div>

                        {/* 時間顯示 */}
                        {(editValues.started_at || editValues.completed_at) && (
                          <div className="md:col-span-2 space-y-2">
                            <label className="text-sm font-medium">時間記錄</label>
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div>
                                <span className="text-muted-foreground">開始時間: </span>
                                <span>{editValues.started_at ? new Date(editValues.started_at).toLocaleString('zh-TW') : '-'}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">完成時間: </span>
                                <span>{editValues.completed_at ? new Date(editValues.completed_at).toLocaleString('zh-TW') : '-'}</span>
                              </div>
                            </div>
                            {isStation0To4() && (
                              <div className="text-xs text-muted-foreground">
                                * Station 0-4 的時間將自動記錄
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* 進度條 */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>進度</span>
                        <span>{itemProgress?.progress_percent || 0}%</span>
                      </div>
                      <Progress value={itemProgress?.progress_percent || 0} className="h-2" />
                    </div>

                    {/* 備註顯示 */}
                    {itemProgress?.notes && !isEditing && (
                      <div className="text-sm text-muted-foreground">
                        <span className="font-medium">備註: </span>
                        {itemProgress.notes}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
