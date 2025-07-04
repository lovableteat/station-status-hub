import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Edit, Save, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface SystemGanttEditorProps {
  systemId: string;
  systemName: string;
  currentStartDate?: string;
  currentEndDate?: string;
  onUpdate: () => void;
}

export function SystemGanttEditor({ 
  systemId, 
  systemName, 
  currentStartDate, 
  currentEndDate, 
  onUpdate 
}: SystemGanttEditorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    startDate: currentStartDate || new Date().toISOString().split('T')[0],
    endDate: currentEndDate || new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  });
  const { toast } = useToast();

  const handleSave = async () => {
    try {
      // Update or insert system timeline data
      const { data: existingTask, error: fetchError } = await supabase
        .from('project_tasks')
        .select('id')
        .eq('task_name', systemName)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 = no rows returned
        throw fetchError;
      }

      const taskData = {
        task_name: systemName,
        start_date: formData.startDate,
        end_date: formData.endDate,
        assigned_to: 'System Timeline',
        priority: 'medium',
        progress: 0
      };

      if (existingTask) {
        await supabase
          .from('project_tasks')
          .update(taskData)
          .eq('id', existingTask.id);
      } else {
        await supabase
          .from('project_tasks')
          .insert(taskData);
      }

      toast({
        title: "更新成功",
        description: `${systemName} 的時程已更新`
      });

      setIsOpen(false);
      onUpdate();
    } catch (error) {
      console.error('Error saving timeline:', error);
      toast({
        title: "更新失敗",
        description: "無法更新系統時程",
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>編輯 {systemName} 時程</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>開始日期</Label>
            <Input
              type="date"
              value={formData.startDate}
              onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
            />
          </div>
          <div>
            <Label>結束日期</Label>
            <Input
              type="date"
              value={formData.endDate}
              onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
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