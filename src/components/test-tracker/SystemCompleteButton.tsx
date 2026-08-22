import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { CheckSquare, Loader2 } from "lucide-react";
import { useTestProject } from "@/components/test-projects/TestProjectProvider";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { saveGuardedTestProgress, unresolvedIssueToast } from "./guardedTestProgress";

interface SystemCompleteButtonProps {
  systemId: string;
  systemName: string;
  stations: Array<{
    id: string;
    station_name: string;
    station_order: number;
  }>;
  items: Array<{
    id: string;
    station_id: string;
    item_name: string;
  }>;
  onSystemUpdate: (newSystemId?: string) => void;
  triggerVariant?: "default" | "menu";
}

export function SystemCompleteButton({
  systemId,
  systemName,
  stations,
  items,
  onSystemUpdate,
  triggerVariant = "default",
}: SystemCompleteButtonProps) {
  const [isCompleting, setIsCompleting] = useState(false);
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { activeProjectId } = useTestProject();

  const handleCompleteSystem = async () => {
    try {
      setIsCompleting(true);

      if (!activeProjectId) {
        throw new Error("No active project");
      }

      // 獲取Station 0-4的站點 (根據系統邏輯)
      const targetStations = stations.filter(station => 
        station.station_order >= 0 && station.station_order <= 4
      );

      const currentTime = new Date().toISOString();

      const { data: unresolvedIssues, error: issueError } = await supabase
        .from("issues")
        .select("id")
        .eq('project_id', activeProjectId)
        .eq('system_id', systemId)
        .in("status", ["open", "in_progress"])
        .limit(1);
      if (issueError) throw issueError;
      if (unresolvedIssues?.length) throw new Error("尚有問題未被解決");

      const targetItems = targetStations.flatMap((station) =>
        items
          .filter((item) => item.station_id === station.id)
          .map((item) => ({ item, station })),
      );

      if (targetItems.length === 0) {
        toast({
          title: "無法完成",
          description: "此系統沒有找到可完成的測試項目",
          variant: "destructive"
        });
        return;
      }

      for (const { item, station } of targetItems) {
        await saveGuardedTestProgress({
          itemId: item.id,
          projectId: activeProjectId,
          stationId: station.id,
          status: "Done",
          systemId,
          updates: {
            completed_at: currentTime,
            notes: "一鍵完成功能自動設定",
            progress_percent: 100,
            started_at: currentTime,
          },
        });
      }

      toast({
        title: "一鍵完成成功",
        description: `機台 ${systemName} 的所有測試項目已標記為完成 (共 ${targetItems.length} 項)`
      });

      // 觸發資料重新載入
      onSystemUpdate();

    } catch (error) {
      console.error('一鍵完成失敗:', error);
      toast(unresolvedIssueToast(error) ?? {
        title: "一鍵完成失敗",
        description: `無法完成機台 ${systemName} 的進度，請稍後重試`,
        variant: "destructive",
      });
    } finally {
      setIsCompleting(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          disabled={isCompleting}
          className={
            triggerVariant === "menu"
              ? "h-10 w-full justify-start gap-3 rounded-lg border border-transparent bg-transparent px-3 text-sm font-medium text-[#dceaf4] shadow-none hover:border-emerald-300/25 hover:bg-emerald-300/10 hover:text-emerald-50"
              : "border-success/30 text-success hover:bg-success/10 hover:text-success"
          }
        >
          <CheckSquare
            className={
              triggerVariant === "menu"
                ? "h-4 w-4 shrink-0 text-emerald-300"
                : isMobile
                  ? "mr-2 h-4 w-4"
                  : "mr-1 h-3 w-3"
            }
          />
          {triggerVariant === "menu" ? "標記整台完成" : isMobile ? "一鍵完成" : "完成"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="border-slate-700/80 bg-slate-950/95 text-slate-50 shadow-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-slate-50">確認一鍵完成機台測試</AlertDialogTitle>
          <AlertDialogDescription className="space-y-3 text-slate-300">
            <p>您確定要將機台 <strong>"{systemName}"</strong> 的所有測試進度設為完成嗎？</p>
            <div className="rounded-xl border border-amber-300/20 bg-amber-300/[0.10] p-3 text-sm text-amber-50">
              <p className="font-semibold text-amber-100">⚠️ 注意事項</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-50/90 marker:text-amber-200">
                <li>此操作將所有Station 0-4的測試項目標記為100%完成</li>
                <li>會自動設定開始和完成時間為當前時間</li>
                <li>此操作無法復原，請謹慎使用</li>
              </ul>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isCompleting} className="border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800 hover:text-white">
            取消
          </AlertDialogCancel>
          <AlertDialogAction 
            onClick={handleCompleteSystem}
            disabled={isCompleting}
            className="bg-success text-success-foreground hover:bg-success/90"
          >
            {isCompleting ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>處理中...</span>
              </div>
            ) : (
              "確認一鍵完成"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
