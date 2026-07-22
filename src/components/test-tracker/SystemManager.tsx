
import { useState, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTestProject } from "@/components/test-projects/TestProjectProvider";

interface SystemManagerProps {
  onSystemUpdate: (newSystemId?: string) => void;
  showDeleteAll?: boolean;
  trigger?: ReactNode;
}

export function SystemManager({ onSystemUpdate, showDeleteAll = true, trigger }: SystemManagerProps) {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newSystemName, setNewSystemName] = useState("");
  const [newSystemEngineer, setNewSystemEngineer] = useState("");
  const [newSystemSerial, setNewSystemSerial] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [creationProgress, setCreationProgress] = useState(0);
  const retryCountRef = useRef(0);
  const { toast } = useToast();
  const { activeProject, activeProjectId } = useTestProject();

  const handleAddSystem = async () => {
    if (!activeProjectId) {
      toast({
        title: "Project required",
        description: "Select a project before creating systems.",
        variant: "destructive"
      });
      return;
    }

    if (!newSystemName.trim()) {
      toast({
        title: "錯誤",
        description: "請輸入機台名稱",
        variant: "destructive"
      });
      return;
    }

    const maxRetries = 3;
    
    const attemptCreateSystem = async (): Promise<string | null> => {
      try {
        setIsAdding(true);
        setCreationProgress(25);

        // 樂觀更新 - 先顯示進度指示器
        const tempSystemData = {
          project_id: activeProjectId,
          ...(activeProject?.active_flow_version_id
            ? { flow_version_id: activeProject.active_flow_version_id }
            : {}),
          system_name: newSystemName.trim(),
          assigned_engineer: newSystemEngineer.trim() || null,
          serial_number: newSystemSerial.trim() || null,
          status: 'Not Start',
          overall_progress: 0,
          current_station: '未開始'
        };

        setCreationProgress(50);

        const { data, error } = await supabase
          .from('test_systems')
          .insert(tempSystemData)
          .select('id')
          .single();

        if (error) {
          throw error;
        }

        setCreationProgress(75);

        // 返回新建系統的ID用於增量更新
        const newSystemId = data.id;

        setCreationProgress(100);

        toast({
          title: "新增成功",
          description: `機台 ${newSystemName} 已成功新增`,
        });

        // 重置表單
        setNewSystemName("");
        setNewSystemEngineer("");
        setNewSystemSerial("");
        setIsAddDialogOpen(false);
        setCreationProgress(0);
        
        // 觸發增量更新，傳入新系統ID
        onSystemUpdate(newSystemId);
        
        return newSystemId;
      } catch (error) {
        console.error('系統創建失敗:', error);
        throw error;
      }
    };

    // 實施重試機制
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await attemptCreateSystem();
        if (result) {
          retryCountRef.current = 0;
          return;
        }
      } catch (error) {
        retryCountRef.current = attempt + 1;
        
        if (attempt === maxRetries) {
          toast({
            title: "新增失敗",
            description: `無法新增機台，已嘗試 ${maxRetries + 1} 次。請檢查網路連接後重試`,
            variant: "destructive"
          });
          break;
        } else {
          // 短暫延遲後重試
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    }
    
    setIsAdding(false);
    setCreationProgress(0);
  };

  const handleDeleteSystem = async (systemId: string, systemName: string) => {
    try {
      const { error } = await supabase.rpc('delete_test_system', { p_system_id: systemId });
      if (error) {
        console.error('RPC delete_test_system error:', error);
        throw error;
      }

      toast({
        title: "刪除成功",
        description: `機台 ${systemName} 已成功刪除`,
      });

      // 更新資料
      onSystemUpdate();
    } catch (error) {
      console.error('Error deleting system:', error);
      toast({
        title: "刪除失敗",
        description: "無法刪除機台，請稍後重試或聯絡管理員",
        variant: "destructive"
      });
    }
  };

  const handleDeleteAllSystems = async () => {
    try {
      setIsDeletingAll(true);

      if (!activeProjectId) {
        throw new Error("No active project");
      }

      const { data: systemsToDelete, error: fetchError } = await supabase
        .from('test_systems')
        .select('id, system_name')
        .eq('project_id', activeProjectId)
        .order('system_name');

      if (fetchError) {
        throw fetchError;
      }

      if (!systemsToDelete || systemsToDelete.length === 0) {
        toast({
          title: "目前沒有機台",
          description: "資料庫內沒有可刪除的機台資料"
        });
        return;
      }

      let deletedCount = 0;
      const failedSystems: string[] = [];
      const batchSize = 8;

      for (let i = 0; i < systemsToDelete.length; i += batchSize) {
        const batch = systemsToDelete.slice(i, i + batchSize);
        const batchResults = await Promise.allSettled(
          batch.map((system) =>
            supabase.rpc('delete_test_system', { p_system_id: system.id })
          )
        );

        batchResults.forEach((result, index) => {
          const system = batch[index];

          if (result.status === "fulfilled" && !result.value.error) {
            deletedCount += 1;
            return;
          }

          failedSystems.push(system.system_name);
          console.error(
            `Bulk delete failed for ${system.system_name}:`,
            result.status === "fulfilled" ? result.value.error : result.reason
          );
        });
      }

      onSystemUpdate();

      if (failedSystems.length === 0) {
        toast({
          title: "已清空所有機台",
          description: `共刪除 ${deletedCount} 台機台與其相關問題、進度、附件資料`
        });
        return;
      }

      toast({
        title: "部分機台刪除失敗",
        description: `已刪除 ${deletedCount} 台，失敗 ${failedSystems.length} 台：${failedSystems.slice(0, 3).join("、")}${failedSystems.length > 3 ? "..." : ""}`,
        variant: "destructive"
      });
    } catch (error) {
      console.error('Error deleting all systems:', error);
      toast({
        title: "刪除全部機台失敗",
        description: "無法完成批次刪除，請稍後重試或聯絡管理員",
        variant: "destructive"
      });
    } finally {
      setIsDeletingAll(false);
    }
  };

  return (
    <div className="flex gap-2">
      {/* 新增機台對話框 */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogTrigger asChild>
          {trigger ?? (
            <Button variant="outline" size="sm" className="h-9 rounded-lg px-3 text-sm font-semibold">
              <Plus className="mr-2 h-4 w-4 shrink-0" />
              新增機台
            </Button>
          )}
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新增測試機台</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="system-name">機台名稱 *</Label>
              <Input
                id="system-name"
                placeholder="例如: System41"
                value={newSystemName}
                onChange={(e) => setNewSystemName(e.target.value)}
                disabled={isAdding}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="system-engineer">負責工程師</Label>
              <Input
                id="system-engineer"
                placeholder="例如: 張工程師"
                value={newSystemEngineer}
                onChange={(e) => setNewSystemEngineer(e.target.value)}
                disabled={isAdding}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="system-serial">序號</Label>
              <Input
                id="system-serial"
                placeholder="例如: GB300-001"
                value={newSystemSerial}
                onChange={(e) => setNewSystemSerial(e.target.value)}
                disabled={isAdding}
              />
            </div>
            
            <div className="flex justify-end gap-2 pt-4">
              <Button 
                variant="outline" 
                onClick={() => setIsAddDialogOpen(false)}
                disabled={isAdding}
              >
                取消
              </Button>
              <Button 
                onClick={handleAddSystem}
                disabled={isAdding}
                className="min-w-[120px]"
              >
                {isAdding ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{creationProgress < 100 ? `${creationProgress}%` : "完成中"}</span>
                  </div>
                ) : (
                  "新增機台"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {showDeleteAll && <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="outline"
            disabled={isDeletingAll}
            className="h-11 rounded-xl border-red-400/35 bg-red-500/[0.08] px-5 text-sm font-semibold text-red-100 shadow-sm hover:bg-red-500/[0.16] hover:text-white"
          >
            <Trash2 className="mr-2 h-4 w-4 shrink-0" />
            {isDeletingAll ? "刪除全部機台中..." : "刪除全部機台"}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-600">確認刪除所有機台</AlertDialogTitle>
            <AlertDialogDescription>
              <div className="space-y-2">
                <p>這會清空目前 L10 測試追蹤中的全部機台資料，適合換專案前重新開始。</p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>刪除所有機台基本資料</li>
                  <li>刪除所有測試進度、站點時間與稽核記錄</li>
                  <li>刪除該機台相關問題追蹤、附件與排除設定</li>
                </ul>
                <p className="font-medium text-red-600">
                  此操作無法復原，請確認現在真的要清空全部機台。
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingAll}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAllSystems}
              disabled={isDeletingAll}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingAll ? "刪除中..." : "確認刪除全部機台"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>}
    </div>
  );
}

// 導出刪除按鈕組件供其他地方使用
export function SystemDeleteButton({ 
  systemId, 
  systemName, 
  onSystemUpdate,
  variant = "default",
}: { 
  systemId: string; 
  systemName: string; 
  onSystemUpdate: () => void; 
  variant?: "default" | "menu";
}) {
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteSystem = async () => {
    try {
      setIsDeleting(true);

      const { error } = await supabase.rpc('delete_test_system', { p_system_id: systemId });
      if (error) {
        console.error('RPC delete_test_system error:', error);
        throw error;
      }

      toast({
        title: "刪除成功",
        description: `機台 ${systemName} 已成功刪除`,
      });

      // 更新資料
      onSystemUpdate();
    } catch (error) {
      console.error('Error deleting system:', error);
      toast({
        title: "刪除失敗",
        description: "無法刪除機台，請稍後重試或聯絡管理員",
        variant: "destructive"
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={isDeleting}
          className={variant === "menu"
            ? "h-10 w-full justify-start rounded-xl border-rose-300/30 bg-rose-300/[0.07] px-3 font-semibold text-rose-100 hover:border-rose-200/50 hover:bg-rose-300/15 hover:text-rose-50"
            : undefined}
        >
          <Trash2 className={variant === "menu" ? "mr-2 h-4 w-4" : "mr-1 h-3 w-3"} />
          刪除
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>確認刪除機台</AlertDialogTitle>
          <AlertDialogDescription>
            您確定要刪除機台 "{systemName}" 嗎？
            <br />
            <strong className="text-destructive">此操作將同時刪除該機台的所有測試進度記錄，且無法復原。</strong>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction 
            onClick={handleDeleteSystem} 
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? "刪除中..." : "確認刪除"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
