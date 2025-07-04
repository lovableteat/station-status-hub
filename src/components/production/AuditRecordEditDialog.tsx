import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Edit, Save, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface AuditEntry {
  id: string;
  system_id: string;
  station_id: string;
  item_id: string;
  change_type: string;
  old_status?: string;
  new_status?: string;
  old_progress_percent?: number;
  new_progress_percent?: number;
  old_notes?: string;
  new_notes?: string;
  changed_by?: string;
  changed_at: string;
}

interface AuditRecordEditDialogProps {
  record: AuditEntry;
  onUpdate: () => void;
}

export function AuditRecordEditDialog({ record, onUpdate }: AuditRecordEditDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [editValues, setEditValues] = useState({
    change_type: record.change_type,
    old_status: record.old_status || '',
    new_status: record.new_status || '',
    old_progress_percent: record.old_progress_percent || 0,
    new_progress_percent: record.new_progress_percent || 0,
    old_notes: record.old_notes || '',
    new_notes: record.new_notes || '',
    changed_by: record.changed_by || ''
  });
  const { toast } = useToast();

  const handleSave = async () => {
    try {
      const { error } = await supabase
        .from('test_progress_audit')
        .update({
          change_type: editValues.change_type,
          old_status: editValues.old_status || null,
          new_status: editValues.new_status || null,
          old_progress_percent: editValues.old_progress_percent || null,
          new_progress_percent: editValues.new_progress_percent || null,
          old_notes: editValues.old_notes || null,
          new_notes: editValues.new_notes || null,
          changed_by: editValues.changed_by || null
        })
        .eq('id', record.id);

      if (error) throw error;

      toast({
        title: "更新成功",
        description: "修改記錄已成功更新"
      });

      setIsOpen(false);
      onUpdate();
    } catch (error) {
      console.error('Error updating audit record:', error);
      toast({
        title: "更新失敗",
        description: "無法更新修改記錄",
        variant: "destructive"
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Edit className="h-3 w-3" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>編輯修改記錄</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>變更類型</Label>
            <Select value={editValues.change_type} onValueChange={(value) => setEditValues({...editValues, change_type: value})}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="insert">新增</SelectItem>
                <SelectItem value="update">更新</SelectItem>
                <SelectItem value="delete">刪除</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>舊狀態</Label>
              <Select value={editValues.old_status} onValueChange={(value) => setEditValues({...editValues, old_status: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="選擇狀態" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Not Start">未開始</SelectItem>
                  <SelectItem value="On-going">進行中</SelectItem>
                  <SelectItem value="Done">已完成</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>新狀態</Label>
              <Select value={editValues.new_status} onValueChange={(value) => setEditValues({...editValues, new_status: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="選擇狀態" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Not Start">未開始</SelectItem>
                  <SelectItem value="On-going">進行中</SelectItem>
                  <SelectItem value="Done">已完成</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>舊進度 (%)</Label>
              <Input
                type="number"
                min="0"
                max="100"
                value={editValues.old_progress_percent}
                onChange={(e) => setEditValues({...editValues, old_progress_percent: parseInt(e.target.value) || 0})}
              />
            </div>
            <div>
              <Label>新進度 (%)</Label>
              <Input
                type="number"
                min="0"
                max="100"
                value={editValues.new_progress_percent}
                onChange={(e) => setEditValues({...editValues, new_progress_percent: parseInt(e.target.value) || 0})}
              />
            </div>
          </div>

          <div>
            <Label>舊備註</Label>
            <Textarea
              value={editValues.old_notes}
              onChange={(e) => setEditValues({...editValues, old_notes: e.target.value})}
              placeholder="舊備註內容..."
              rows={2}
            />
          </div>

          <div>
            <Label>新備註</Label>
            <Textarea
              value={editValues.new_notes}
              onChange={(e) => setEditValues({...editValues, new_notes: e.target.value})}
              placeholder="新備註內容..."
              rows={2}
            />
          </div>

          <div>
            <Label>操作者</Label>
            <Input
              value={editValues.changed_by}
              onChange={(e) => setEditValues({...editValues, changed_by: e.target.value})}
              placeholder="操作者名稱..."
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              <X className="h-3 w-3 mr-2" />
              取消
            </Button>
            <Button onClick={handleSave}>
              <Save className="h-3 w-3 mr-2" />
              儲存
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}