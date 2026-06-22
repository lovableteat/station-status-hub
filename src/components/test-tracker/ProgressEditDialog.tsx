
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Edit, Trash2, Save, X } from "lucide-react";
import ManualTimeTracker from "./ManualTimeTracker";

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

interface TestItem {
  id: string;
  station_id: string;
  item_name: string;
  item_order: number;
  description: string;
  estimated_minutes?: number;
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
  onTimeUpdate: () => void;
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
  onTimeUpdate,
}: ProgressEditDialogProps) {
  const [open, setOpen] = useState(false);

  const getItemProgress = (itemId: string) => {
    return getProgressForSystemItem(systemId, stationId, itemId);
  };

  const isEditing = (itemId: string) => {
    return editingProgress === `${systemId}-${stationId}-${itemId}`;
  };

  const handleEdit = (itemId: string) => {
    handleEditProgress(systemId, stationId, itemId);
  };

  const handleSave = (itemId: string) => {
    handleSaveProgress(systemId, stationId, itemId);
  };

  const handleDelete = (itemId: string) => {
    handleDeleteProgress(systemId, stationId, itemId);
  };

  // 格式化時間供 datetime-local 使用（datetime-local 會自動處理本地時區）
  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      // datetime-local 需要 YYYY-MM-DDTHH:mm 格式，且會自動以本地時區顯示
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    } catch (error) {
      console.error('Error formatting date:', error);
      return '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Edit className="h-3 w-3 mr-1" />
          編輯
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            編輯測試進度 - {systemName} / {stationName}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {stationItems.map((item, index) => {
            const itemProgress = getItemProgress(item.id);
            const editing = isEditing(item.id);
            
            return (
              <div key={item.id} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h4 className="font-medium">{item.item_name}</h4>
                    {itemProgress && (
                      <Badge className={getStatusColor(itemProgress.status)}>
                        {itemProgress.status}
                      </Badge>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {/* 手動計時器組件 */}
                    <ManualTimeTracker
                      systemId={systemId}
                      stationId={stationId}
                      itemId={item.id}
                      currentStartedAt={itemProgress?.started_at}
                      currentCompletedAt={itemProgress?.completed_at}
                      onTimeUpdate={onTimeUpdate}
                    />
                    
                    <div className="flex gap-1">
                      {!editing ? (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(item.id)}
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                          {itemProgress && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDelete(item.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </>
                      ) : (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSave(item.id)}
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
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {item.description && (
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                )}

                {editing ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor={`status-${item.id}`}>狀態</Label>
                        <Select
                          value={editValues.status}
                          onValueChange={(value) => setEditValues({...editValues, status: value})}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Not Start">未開始</SelectItem>
                            <SelectItem value="On-going">進行中</SelectItem>
                            <SelectItem value="Done">已完成</SelectItem>
                            <SelectItem value="Issue">有問題</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor={`progress-${item.id}`}>進度 (%)</Label>
                        <Input
                          id={`progress-${item.id}`}
                          type="number"
                          min="0"
                          max="100"
                          value={editValues.progress_percent}
                          onChange={(e) => setEditValues({...editValues, progress_percent: parseInt(e.target.value) || 0})}
                        />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor={`started-${item.id}`}>開始時間 (台灣時間)</Label>
                        <Input
                          id={`started-${item.id}`}
                          type="datetime-local"
                          value={editValues.started_at ? formatDateTime(editValues.started_at) : ''}
                          onChange={(e) => setEditValues({...editValues, started_at: e.target.value ? new Date(e.target.value).toISOString() : ''})}
                        />
                      </div>
                      <div>
                        <Label htmlFor={`completed-${item.id}`}>完成時間 (台灣時間)</Label>
                        <Input
                          id={`completed-${item.id}`}
                          type="datetime-local"
                          value={editValues.completed_at ? formatDateTime(editValues.completed_at) : ''}
                          onChange={(e) => setEditValues({...editValues, completed_at: e.target.value ? new Date(e.target.value).toISOString() : ''})}
                        />
                      </div>
                    </div>
                    
                    <div>
                      <Label htmlFor={`notes-${item.id}`}>備註</Label>
                      <Textarea
                        id={`notes-${item.id}`}
                        value={editValues.notes}
                        onChange={(e) => setEditValues({...editValues, notes: e.target.value})}
                        placeholder="輸入備註..."
                      />
                    </div>
                  </div>
                ) : itemProgress ? (
                  <div className="space-y-2 text-sm">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="font-medium">進度:</span> {itemProgress.progress_percent}%
                      </div>
                      <div>
                        <span className="font-medium">狀態:</span> {itemProgress.status}
                      </div>
                    </div>
                    
                    {(itemProgress.started_at || itemProgress.completed_at) && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <span className="font-medium">開始時間:</span>
                          <br />
                          <span className="text-muted-foreground">
                            {itemProgress.started_at ? new Date(itemProgress.started_at).toLocaleString('zh-TW') : '-'}
                          </span>
                        </div>
                        <div>
                          <span className="font-medium">完成時間:</span>
                          <br />
                          <span className="text-muted-foreground">
                            {itemProgress.completed_at ? new Date(itemProgress.completed_at).toLocaleString('zh-TW') : '-'}
                          </span>
                        </div>
                      </div>
                    )}
                    
                    {itemProgress.notes && (
                      <div>
                        <span className="font-medium">備註:</span>
                        <p className="text-muted-foreground mt-1">{itemProgress.notes}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    尚未開始此測項
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
