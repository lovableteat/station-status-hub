
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useTestTrackerData } from "@/hooks/useTestTrackerData";

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
  systemId: string;
  stationId: string;
  itemId: string;
  currentProgress?: TestProgress;
  onClose: () => void;
}

export function ProgressEditDialog({
  systemId,
  stationId,
  itemId,
  currentProgress,
  onClose
}: ProgressEditDialogProps) {
  const { updateProgress } = useTestTrackerData();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    status: currentProgress?.status || 'Not Start',
    progress_percent: currentProgress?.progress_percent || 0,
    notes: currentProgress?.notes || '',
    started_at: currentProgress?.started_at || '',
    completed_at: currentProgress?.completed_at || ''
  });

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updates = {
        status: formData.status,
        progress_percent: formData.progress_percent,
        notes: formData.notes,
        started_at: formData.started_at || (formData.status === 'On-going' ? new Date().toISOString() : undefined),
        completed_at: formData.completed_at || (formData.status === 'Done' ? new Date().toISOString() : null)
      };

      const success = await updateProgress(systemId, stationId, itemId, updates);
      
      if (success) {
        toast({
          title: "儲存成功",
          description: "測試進度已更新"
        });
        onClose();
      } else {
        throw new Error('Update failed');
      }
    } catch (error) {
      toast({
        title: "儲存失敗",
        description: "無法更新測試進度",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>編輯測試進度</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>狀態</Label>
            <Select 
              value={formData.status} 
              onValueChange={(value) => setFormData({...formData, status: value})}
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
              value={formData.progress_percent}
              onChange={(e) => setFormData({...formData, progress_percent: parseInt(e.target.value) || 0})}
            />
          </div>
          
          <div>
            <Label>備註</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({...formData, notes: e.target.value})}
              placeholder="測試備註..."
            />
          </div>
          
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "儲存中..." : "儲存"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
