
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { RotateCcw } from "lucide-react";
import { useTestProject } from "@/components/test-projects/TestProjectProvider";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface SystemResetDialogProps {
  systemId: string;
  systemName: string;
  onReset: () => void;
}

export function SystemResetDialog({ systemId, systemName, onReset }: SystemResetDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const { toast } = useToast();
  const { activeProjectId } = useTestProject();

  const handleReset = async () => {
    try {
      setIsResetting(true);

      if (!activeProjectId) {
        throw new Error("No active project");
      }
      
      // 重置測試進度紀錄
      const { error: progressError } = await supabase
        .from('test_progress')
        .delete()
        .eq('project_id', activeProjectId)
        .eq('system_id', systemId);

      if (progressError) throw progressError;

      // 重置系統狀態
      const { error: systemError } = await supabase
        .from('test_systems')
        .update({
          status: 'Not Start',
          current_station: 'Station 0',
          overall_progress: 0,
          actual_started_at: null,
          actual_completed_at: null
        })
        .eq('project_id', activeProjectId)
        .eq('id', systemId);

      if (systemError) throw systemError;

      toast({
        title: "重置成功",
        description: `${systemName} 的進度已完全重置`,
      });

      setIsOpen(false);
      onReset();
      
    } catch (error) {
      console.error('Reset error:', error);
      toast({
        title: "重置失敗",
        description: "無法重置系統進度",
        variant: "destructive"
      });
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="destructive" 
          size="sm"
          className="w-8 h-8 p-0"
          title={`重置 ${systemName} 進度`}
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>重置系統進度</DialogTitle>
          <DialogDescription>
            確定要重置 <strong>{systemName}</strong> 的所有測試進度嗎？
            <br />
            <br />
            此操作將會：
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>清除所有測試項目的進度紀錄</li>
              <li>重置系統狀態為「未開始」</li>
              <li>重置當前站點為「Station 0」</li>
              <li>清除開始和完成時間</li>
            </ul>
            <br />
            <span className="text-red-600 font-medium">此操作無法復原！</span>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => setIsOpen(false)}
            disabled={isResetting}
          >
            取消
          </Button>
          <Button 
            variant="destructive" 
            onClick={handleReset}
            disabled={isResetting}
          >
            {isResetting ? "重置中..." : "確認重置"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
