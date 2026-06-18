
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface BulkResetDialogProps {
  onReset: () => void;
}

export function BulkResetDialog({ onReset }: BulkResetDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleResetAllProgress = async () => {
    try {
      setIsLoading(true);
      
      // 重置所有測試進度到初始狀態
      const { error: progressError } = await supabase
        .from('test_progress')
        .update({
          status: 'Not Start',
          progress_percent: 0,
          notes: null,
          started_at: null,
          completed_at: null,
          actual_hours: 0
        })
        .neq('id', '00000000-0000-0000-0000-000000000000'); // 更新所有記錄

      if (progressError) {
        console.error('Error resetting progress:', progressError);
        throw progressError;
      }

      // 重置所有系統狀態
      const { error: systemError } = await supabase
        .from('test_systems')
        .update({
          status: 'Not Start',
          current_station: '未開始',
          overall_progress: 0,
          actual_started_at: null,
          actual_completed_at: null
        })
        .neq('id', '00000000-0000-0000-0000-000000000000'); // 更新所有記錄

      if (systemError) {
        console.error('Error resetting systems:', systemError);
        throw systemError;
      }

      toast({
        title: "重置成功",
        description: "所有測試進度已重置為初始狀態",
      });

      onReset();
    } catch (error) {
      console.error('Error during bulk reset:', error);
      toast({
        title: "重置失敗",
        description: "無法重置測試進度，請稍後再試",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" className="h-11 rounded-xl border-red-600 bg-red-600 px-5 text-sm font-semibold text-white shadow-sm hover:bg-red-700">
          <RotateCcw className="mr-2 h-4 w-4 shrink-0" />
          重置所有進度
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-red-600">確認重置所有測試進度</AlertDialogTitle>
          <AlertDialogDescription>
            <div className="space-y-2">
              <p>此操作將會：</p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>將所有測試項目狀態設為「Not Start」</li>
                <li>將所有進度百分比設為 0%</li>
                <li>清空所有備註</li>
                <li>清空所有時間記錄</li>
                <li>重置所有系統狀態為「Not Start」</li>
                <li>將所有系統當前站點設為「未開始」</li>
              </ul>
              <p className="text-red-600 font-medium mt-3">
                ⚠️ 此操作無法復原！請確認您真的要執行此操作。
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction 
            onClick={handleResetAllProgress}
            disabled={isLoading}
            className="bg-red-600 hover:bg-red-700"
          >
            {isLoading ? "重置中..." : "確認重置"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
