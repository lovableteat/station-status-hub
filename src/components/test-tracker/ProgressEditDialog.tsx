import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MobileDialog, MobileDialogContent, MobileDialogHeader, MobileDialogTitle, MobileDialogTrigger, MobileDialogFooter } from "@/components/ui/mobile-dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Edit, Save, X, Trash2 } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { TimeInputControls } from "./TimeInputControls";

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
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  // Helper function to format time for display
  const formatTime = (timeStr?: string) => {
    if (!timeStr) return '-';
    try {
      const date = new Date(timeStr);
      return date.toLocaleString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '-';
    }
  };

  // Helper function to format datetime for input field
  const formatDateTimeLocal = (timeStr?: string) => {
    if (!timeStr) return '';
    try {
      const date = new Date(timeStr);
      // Format as YYYY-MM-DDTHH:MM for datetime-local input
      return date.toISOString().slice(0, 16);
    } catch {
      return '';
    }
  };

  // All stations can now edit start/end times
  const canEditTimes = true;

  return (
    <MobileDialog>
      <MobileDialogTrigger asChild>
        <Button 
          variant="ghost" 
          size={isMobile ? "default" : "sm"}
          className={isMobile ? "h-10 px-4" : ""}
        >
          <Edit className={isMobile ? "h-4 w-4 mr-2" : "h-3 w-3"} />
          {isMobile && "編輯"}
        </Button>
      </MobileDialogTrigger>
      <MobileDialogContent className={isMobile ? "max-w-none" : "max-w-4xl"}>
        <MobileDialogHeader>
          <MobileDialogTitle>
            {systemName} - {stationName} 詳細進度
          </MobileDialogTitle>
        </MobileDialogHeader>
        <div className={cn("space-y-4", isMobile && "space-y-6")}>
          {stationItems.map(item => {
            const itemProgress = getProgressForSystemItem(systemId, stationId, item.id);
            const editKey = `${systemId}-${stationId}-${item.id}`;
            const isEditing = editingProgress === editKey;

            return (
              <div key={item.id} className={cn(
                "border rounded-lg p-4",
                isMobile && "border-2 p-6 rounded-xl"
              )}>
                <div className="flex items-center justify-between mb-2">
                  <h4 className={cn(
                    "font-medium",
                    isMobile && "text-lg font-semibold"
                  )}>{item.item_name}</h4>
                  <div className="flex gap-2">
                    {isEditing ? (
                      <>
                        <Button 
                          size={isMobile ? "default" : "sm"}
                          className={isMobile ? "h-10 px-4" : ""}
                          disabled={isSaving}
                          onClick={async () => {
                            setIsSaving(true);
                            try {
                              await handleSaveProgress(systemId, stationId, item.id);
                              toast({
                                title: "儲存成功",
                                description: `${item.item_name} 的測試進度已更新`,
                              });
                            } catch (error) {
                              toast({
                                title: "儲存失敗",
                                description: "請稍後再試",
                                variant: "destructive",
                              });
                            } finally {
                              setIsSaving(false);
                            }
                          }}
                        >
                          <Save className={isMobile ? "h-4 w-4 mr-2" : "h-3 w-3"} />
                          {isMobile && (isSaving ? "儲存中..." : "儲存")}
                        </Button>
                        <Button 
                          size={isMobile ? "default" : "sm"}
                          variant="outline"
                          className={isMobile ? "h-10 px-4" : ""}
                          onClick={() => setEditingProgress(null)}
                        >
                          <X className={isMobile ? "h-4 w-4 mr-2" : "h-3 w-3"} />
                          {isMobile && "取消"}
                        </Button>
                        {itemProgress && (
                          <Button 
                            size={isMobile ? "default" : "sm"}
                            variant="destructive"
                            className={isMobile ? "h-10 px-4" : ""}
                            onClick={() => {
                              if (confirm("確定要刪除這筆測試進度記錄嗎？")) {
                                handleDeleteProgress(systemId, stationId, item.id);
                                setEditingProgress(null);
                              }
                            }}
                          >
                            <Trash2 className={isMobile ? "h-4 w-4 mr-2" : "h-3 w-3"} />
                            {isMobile && "刪除"}
                          </Button>
                        )}
                      </>
                    ) : (
                      <>
                        <Button 
                          size={isMobile ? "default" : "sm"}
                          variant="outline"
                          className={isMobile ? "h-10 px-4" : ""}
                          onClick={() => handleEditProgress(systemId, stationId, item.id)}
                        >
                          <Edit className={isMobile ? "h-4 w-4 mr-2" : "h-3 w-3"} />
                          {isMobile && "編輯"}
                        </Button>
                        {itemProgress && (
                          <Button 
                            size={isMobile ? "default" : "sm"}
                            variant="destructive"
                            className={isMobile ? "h-10 px-4" : ""}
                            onClick={() => {
                              if (confirm("確定要刪除這筆測試進度記錄嗎？")) {
                                handleDeleteProgress(systemId, stationId, item.id);
                              }
                            }}
                          >
                            <Trash2 className={isMobile ? "h-4 w-4 mr-2" : "h-3 w-3"} />
                            {isMobile && "刪除"}
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
                
                {isEditing ? (
                  <div className={cn("space-y-3", isMobile && "space-y-6")}>
                    <div>
                      <Label className={isMobile ? "text-base font-medium mb-2 block" : ""}>狀態</Label>
                      <Select 
                        value={editValues.status} 
                        onValueChange={(value) => {
                          const now = new Date().toISOString();
                          const newValues = { ...editValues, status: value };
                          
                          // Auto-set times based on status
                          if (value === "On-going" && !editValues.started_at) {
                            newValues.started_at = now;
                          }
                          if (value === "Done") {
                            if (!editValues.started_at) {
                              newValues.started_at = now;
                            }
                            if (!editValues.completed_at) {
                              newValues.completed_at = now;
                            }
                            newValues.progress_percent = 100;
                          }
                          if (value === "Not Start") {
                            newValues.started_at = undefined;
                            newValues.completed_at = undefined;
                            newValues.progress_percent = 0;
                          }
                          
                          setEditValues(newValues);
                        }}
                      >
                        <SelectTrigger className={isMobile ? "h-12 text-base" : ""}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Not Start" className={isMobile ? "h-12 text-base" : ""}>未開始</SelectItem>
                          <SelectItem value="On-going" className={isMobile ? "h-12 text-base" : ""}>進行中</SelectItem>
                          <SelectItem value="Done" className={isMobile ? "h-12 text-base" : ""}>已完成</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className={isMobile ? "text-base font-medium mb-3 block" : ""}>完成度</Label>
                      <div className={cn("flex gap-2 mt-2", isMobile && "gap-4")}>
                        <Button
                          type="button"
                          variant={editValues.progress_percent === 0 ? "default" : "outline"}
                          className={cn("flex-1", isMobile && "h-12 text-base font-semibold")}
                          onClick={() => setEditValues({
                            ...editValues, 
                            progress_percent: 0,
                            status: "Not Start"
                          })}
                        >
                          0%
                        </Button>
                        <Button
                          type="button"
                          variant={editValues.progress_percent === 100 ? "default" : "outline"}
                          className={cn("flex-1", isMobile && "h-12 text-base font-semibold")}
                          onClick={() => setEditValues({
                            ...editValues, 
                            progress_percent: 100,
                            status: "Done"
                          })}
                        >
                          100%
                        </Button>
                      </div>
                    </div>
                    <div>
                      <Label className={isMobile ? "text-base font-medium mb-2 block" : ""}>備註</Label>
                      <Textarea
                        value={editValues.notes}
                        onChange={(e) => setEditValues({...editValues, notes: e.target.value})}
                        placeholder="測試備註..."
                        className={isMobile ? "min-h-[100px] text-base resize-none" : ""}
                      />
                    </div>
                    
                    {/* Time fields with improved UX */}
                    {canEditTimes && (
                      <>
                        <TimeInputControls
                          label="開始時間"
                          value={editValues.started_at}
                          onChange={(value) => {
                            const newValues = { ...editValues, started_at: value };
                            
                            // Validation: if completed_at exists and is earlier than new start time, clear it
                            if (value && editValues.completed_at && new Date(value) > new Date(editValues.completed_at)) {
                              newValues.completed_at = undefined;
                            }
                            
                            setEditValues(newValues);
                          }}
                          isMobile={isMobile}
                        />
                        <TimeInputControls
                          label="完成時間"
                          value={editValues.completed_at}
                          minValue={editValues.started_at}
                          onChange={(value) => {
                            setEditValues({
                              ...editValues, 
                              completed_at: value
                            });
                          }}
                          disabled={!editValues.started_at}
                          isMobile={isMobile}
                        />
                        {!editValues.started_at && (
                          <p className="text-xs text-muted-foreground">請先設定開始時間</p>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <div className={cn("space-y-2", isMobile && "space-y-3")}>
                    <div className="flex items-center gap-2">
                      <Badge className={cn(
                        getStatusColor(itemProgress?.status || 'Not Start'),
                        isMobile && "text-sm px-3 py-1"
                      )}>
                        {itemProgress?.status || 'Not Start'}
                      </Badge>
                      <span className={cn(
                        "text-sm text-muted-foreground",
                        isMobile && "text-base font-medium"
                      )}>
                        {itemProgress?.progress_percent || 0}%
                      </span>
                    </div>
                    <Progress 
                      value={itemProgress?.progress_percent || 0} 
                      className={cn("h-2", isMobile && "h-3")} 
                    />
                    {itemProgress?.notes && (
                      <p className={cn(
                        "text-sm text-muted-foreground",
                        isMobile && "text-base"
                      )}>
                        備註: {itemProgress.notes}
                      </p>
                    )}
                    
                    {/* Show time info for all stations */}
                    {canEditTimes && (itemProgress?.started_at || itemProgress?.completed_at) && (
                      <div className="mt-2 pt-2 border-t space-y-1">
                        {itemProgress?.started_at && (
                          <p className={cn(
                            "text-xs text-muted-foreground",
                            isMobile && "text-sm"
                          )}>
                            開始: {formatTime(itemProgress.started_at)}
                          </p>
                        )}
                        {itemProgress?.completed_at && (
                          <p className={cn(
                            "text-xs text-muted-foreground",
                            isMobile && "text-sm"
                          )}>
                            完成: {formatTime(itemProgress.completed_at)}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </MobileDialogContent>
    </MobileDialog>
  );
}