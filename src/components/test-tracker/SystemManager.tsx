
import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Trash2, Settings, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface SystemManagerProps {
  onSystemUpdate: (newSystemId?: string) => void;
}

export function SystemManager({ onSystemUpdate }: SystemManagerProps) {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newSystemName, setNewSystemName] = useState("");
  const [newSystemEngineer, setNewSystemEngineer] = useState("");
  const [newSystemSerial, setNewSystemSerial] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [creationProgress, setCreationProgress] = useState(0);
  const retryCountRef = useRef(0);
  const { toast } = useToast();

  const handleAddSystem = async () => {
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

  return (
    <div className="flex gap-2">
      {/* 新增機台對話框 */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-2" />
            新增機台
          </Button>
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

      {/* 刪除機台功能 - 這個會在每個機台行中顯示 */}
    </div>
  );
}

// 導出刪除按鈕組件供其他地方使用
export function SystemDeleteButton({ 
  systemId, 
  systemName, 
  onSystemUpdate 
}: { 
  systemId: string; 
  systemName: string; 
  onSystemUpdate: () => void; 
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
        <Button variant="outline" size="sm" disabled={isDeleting}>
          <Trash2 className="h-3 w-3 mr-1" />
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
