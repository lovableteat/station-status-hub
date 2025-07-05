import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MobileDialog, MobileDialogContent, MobileDialogHeader, MobileDialogTitle, MobileDialogTrigger, MobileDialogFooter } from "@/components/ui/mobile-dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Edit, Save, X } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

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
  };
  setEditValues: (values: any) => void;
  getProgressForSystemItem: (systemId: string, stationId: string, itemId: string) => TestProgress | undefined;
  handleEditProgress: (systemId: string, stationId: string, itemId: string) => void;
  handleSaveProgress: (systemId: string, stationId: string, itemId: string) => void;
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
  getStatusColor,
  systemId,
  stationId,
}: ProgressEditDialogProps) {
  const isMobile = useIsMobile();

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
                          onClick={() => handleSaveProgress(systemId, stationId, item.id)}
                        >
                          <Save className={isMobile ? "h-4 w-4 mr-2" : "h-3 w-3"} />
                          {isMobile && "儲存"}
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
                      </>
                    ) : (
                      <Button 
                        size={isMobile ? "default" : "sm"}
                        variant="outline"
                        className={isMobile ? "h-10 px-4" : ""}
                        onClick={() => handleEditProgress(systemId, stationId, item.id)}
                      >
                        <Edit className={isMobile ? "h-4 w-4 mr-2" : "h-3 w-3"} />
                        {isMobile && "編輯"}
                      </Button>
                    )}
                  </div>
                </div>
                
                {isEditing ? (
                  <div className={cn("space-y-3", isMobile && "space-y-6")}>
                    <div>
                      <Label className={isMobile ? "text-base font-medium mb-2 block" : ""}>狀態</Label>
                      <Select 
                        value={editValues.status} 
                        onValueChange={(value) => setEditValues({...editValues, status: value})}
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