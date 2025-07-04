import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Edit, Save, X } from "lucide-react";

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
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Edit className="h-3 w-3" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {systemName} - {stationName} 詳細進度
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {stationItems.map(item => {
            const itemProgress = getProgressForSystemItem(systemId, stationId, item.id);
            const editKey = `${systemId}-${stationId}-${item.id}`;
            const isEditing = editingProgress === editKey;

            return (
              <div key={item.id} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium">{item.item_name}</h4>
                  <div className="flex gap-2">
                    {isEditing ? (
                      <>
                        <Button 
                          size="sm" 
                          onClick={() => handleSaveProgress(systemId, stationId, item.id)}
                        >
                          <Save className="h-3 w-3" />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => setEditingProgress(null)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </>
                    ) : (
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => handleEditProgress(systemId, stationId, item.id)}
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
                
                {isEditing ? (
                  <div className="space-y-3">
                    <div>
                      <Label>狀態</Label>
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
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>完成度 (%)</Label>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={editValues.progress_percent}
                        onChange={(e) => setEditValues({
                          ...editValues, 
                          progress_percent: parseInt(e.target.value) || 0
                        })}
                      />
                    </div>
                    <div>
                      <Label>備註</Label>
                      <Textarea
                        value={editValues.notes}
                        onChange={(e) => setEditValues({...editValues, notes: e.target.value})}
                        placeholder="測試備註..."
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge className={getStatusColor(itemProgress?.status || 'Not Start')}>
                        {itemProgress?.status || 'Not Start'}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {itemProgress?.progress_percent || 0}%
                      </span>
                    </div>
                    <Progress value={itemProgress?.progress_percent || 0} className="h-2" />
                    {itemProgress?.notes && (
                      <p className="text-sm text-muted-foreground">
                        備註: {itemProgress.notes}
                      </p>
                    )}
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