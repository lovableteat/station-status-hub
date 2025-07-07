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
import { TimeRecordManager } from "./TimeRecordManager";

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
  const [originalStatus, setOriginalStatus] = useState<string>('');

  // 檢查是否為Station 0-4
  const isStation0To4 = () => {
    return stationName.includes('Station 0') || 
           stationName.includes('Station 1') || 
           stationName.includes('Station 2') || 
           stationName.includes('Station 3') || 
           stationName.includes('Station 4');
  };

  // 改善的時間記錄邏輯 - 只在狀態實際變化時記錄時間
  const updateTimeIfStatusChanged = (newStatus: string, currentItem?: TestProgress) => {
    const currentTime = new Date().toISOString();
    let timeUpdates = {};

    // 如果是Station 0-4，根據狀態變化更新時間
    if (isStation0To4()) {
      // 從 Not Start 變成其他狀態時，只在沒有開始時間時記錄開始時間
      if (originalStatus === 'Not Start' && newStatus !== 'Not Start' && !currentItem?.started_at) {
        timeUpdates = { ...timeUpdates, started_at: currentTime };
      }
      
      // 變成 Done 狀態時，只在沒有完成時間時記錄完成時間
      if (newStatus === 'Done' && originalStatus !== 'Done' && !currentItem?.completed_at) {
        timeUpdates = { ...timeUpdates, completed_at: currentTime };
      }
      
      // 從 Done 變成其他狀態時，清除完成時間但保留開始時間
      if (originalStatus === 'Done' && newStatus !== 'Done') {
        timeUpdates = { ...timeUpdates, completed_at: null };
      }
    }

    return timeUpdates;
  };

  // 處理狀態變更 - 自動設定進度百分比和時間
  const handleStatusChange = (newStatus: string) => {
    const currentEditKey = editingProgress;
    if (!currentEditKey) return;

    const [systemId, stationId, itemId] = currentEditKey.split('-');
    const currentItem = getProgressForSystemItem(systemId, stationId, itemId);
    
    let newProgressPercent = 0;
    
    // 根據狀態自動設定進度百分比：只有0%和100%
    if (newStatus === 'Done') {
      newProgressPercent = 100;
    } else {
      newProgressPercent = 0;
    }
    
    // 獲取時間更新
    const timeUpdates = updateTimeIfStatusChanged(newStatus, currentItem);
    
    setEditValues(prev => ({ 
      ...prev, 
      status: newStatus,
      progress_percent: newProgressPercent,
      ...timeUpdates
    }));
  };

  // 處理進度變更 - 限制只能是0或100
  const handleProgressChange = (newProgress: number) => {
    // 限制進度只能是0或100
    const validProgress = newProgress >= 50 ? 100 : 0;
    
    // 根據進度自動調整狀態
    let newStatus = editValues.status;
    if (validProgress === 100) {
      newStatus = 'Done';
    } else if (validProgress === 0) {
      newStatus = editValues.status === 'Done' ? 'On-going' : editValues.status;
    }
    
    setEditValues(prev => ({ 
      ...prev, 
      progress_percent: validProgress,
      status: newStatus
    }));
  };

  // 處理備註變更
  const handleNotesChange = (newNotes: string) => {
    setEditValues(prev => ({ ...prev, notes: newNotes }));
  };

  // 當開始編輯時，記錄原始狀態
  useEffect(() => {
    if (editingProgress) {
      const [systemId, stationId, itemId] = editingProgress.split('-');
      const currentItem = getProgressForSystemItem(systemId, stationId, itemId);
      setOriginalStatus(currentItem?.status || 'Not Start');
    }
  }, [editingProgress, getProgressForSystemItem]);

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
                        
                        {/* 新增時間記錄管理按鈕 */}
                        {isStation0To4() && itemProgress && (
                          <TimeRecordManager
                            systemId={systemId}
                            stationId={stationId}
                            itemId={item.id}
                            currentStartedAt={itemProgress.started_at}
                            currentCompletedAt={itemProgress.completed_at}
                            onTimeUpdate={() => window.location.reload()}
                          />
                        )}
                        
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
                          <label className="text-sm font-medium">進度 (只能選0%或100%)</label>
                          <Select 
                            value={editValues.progress_percent.toString()} 
                            onValueChange={(value) => handleProgressChange(Number(value))}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="0">0%</SelectItem>
                              <SelectItem value="100">100%</SelectItem>
                            </SelectContent>
                          </Select>
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

                        {/* 時間顯示 - 只在Station 0-4顯示 */}
                        {isStation0To4() && (editValues.started_at || editValues.completed_at) && (
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
                            <div className="text-xs text-muted-foreground">
                              * 時間記錄已改善，避免重複更新。如需調整時間請使用「時間管理」功能
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 進度條 - 顯示0%或100% */}
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

                    {/* 時間資訊顯示 - 只在Station 0-4且有時間記錄時顯示 */}
                    {isStation0To4() && !isEditing && (itemProgress?.started_at || itemProgress?.completed_at) && (
                      <div className="text-xs text-muted-foreground bg-muted/30 rounded p-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="font-medium">開始: </span>
                            <span>{itemProgress.started_at ? new Date(itemProgress.started_at).toLocaleString('zh-TW') : '-'}</span>
                          </div>
                          <div>
                            <span className="font-medium">完成: </span>
                            <span>{itemProgress.completed_at ? new Date(itemProgress.completed_at).toLocaleString('zh-TW') : '-'}</span>
                          </div>
                        </div>
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
