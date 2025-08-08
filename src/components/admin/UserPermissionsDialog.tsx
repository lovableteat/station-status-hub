import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Shield, Save, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface UserPermissionsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  username: string;
}

const PERMISSION_GROUPS = {
  'dashboard': {
    name: '儀表板',
    permissions: [
      { key: 'dashboard_view', label: '檢視儀表板' },
      { key: 'dashboard_edit', label: '編輯儀表板' }
    ]
  },
  'test_tracker': {
    name: 'GB300 L10 測試追蹤',
    permissions: [
      { key: 'test_tracker_view', label: '檢視測試追蹤' },
      { key: 'test_tracker_edit', label: '編輯測試追蹤' }
    ]
  },
  'issues': {
    name: '問題追蹤',
    permissions: [
      { key: 'issues_view', label: '檢視問題追蹤' },
      { key: 'issues_edit', label: '編輯問題追蹤' }
    ]
  },
  'production': {
    name: '產線監控',
    permissions: [
      { key: 'production_view', label: '檢視產線監控' },
      { key: 'production_edit', label: '編輯產線監控' }
    ]
  },
  'data_center': {
    name: '資料中心',
    permissions: [
      { key: 'data_center_view', label: '檢視資料中心' },
      { key: 'data_center_edit', label: '編輯資料中心' }
    ]
  },
  'bom_center': {
    name: 'BOM比對中心',
    permissions: [
      { key: 'bom_view', label: '檢視BOM比對中心' },
      { key: 'bom_edit', label: '編輯BOM比對中心' }
    ]
  },
  'project_center': {
    name: '專案管理中心',
    permissions: [
      { key: 'project_view', label: '檢視專案管理中心' },
      { key: 'project_edit', label: '編輯專案管理中心' }
    ]
  },
  'tools': {
    name: '工具管理',
    permissions: [
      { key: 'tools_view', label: '檢視工具管理' },
      { key: 'tools_edit', label: '編輯工具管理' }
    ]
  },
  'admin': {
    name: '後台管理',
    permissions: [
      { key: 'admin_view', label: '檢視後台管理' },
      { key: 'admin_edit', label: '編輯後台管理' }
    ]
  }
};

export function UserPermissionsDialog({ isOpen, onClose, userId, username }: UserPermissionsDialogProps) {
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen && userId) {
      loadUserPermissions();
    }
  }, [isOpen, userId]);

  const loadUserPermissions = async () => {
    try {
      const { data, error } = await supabase
        .from('user_page_permissions')
        .select('permission')
        .eq('user_id', userId);

      if (error) throw error;
      
      setPermissions(data?.map(p => p.permission) || []);
    } catch (error) {
      toast({
        title: "載入失敗",
        description: "無法載入用戶權限",
        variant: "destructive"
      });
    }
  };

  const handlePermissionChange = (permission: string, checked: boolean) => {
    if (checked) {
      setPermissions(prev => [...prev, permission]);
    } else {
      setPermissions(prev => prev.filter(p => p !== permission));
    }
  };

  const handleSave = async () => {
    try {
      setIsLoading(true);

      // 刪除現有權限
      const { error: deleteError } = await supabase
        .from('user_page_permissions')
        .delete()
        .eq('user_id', userId);

      if (deleteError) throw deleteError;

      // 添加新權限
      if (permissions.length > 0) {
        const { error: insertError } = await supabase
          .from('user_page_permissions')
          .insert(
            permissions.map(permission => ({
              user_id: userId,
              permission: permission as any,
              granted_by: 'admin'
            }))
          );

        if (insertError) throw insertError;
      }

      toast({
        title: "設定成功",
        description: `已更新 ${username} 的頁面權限`
      });

      onClose();
    } catch (error) {
      toast({
        title: "設定失敗",
        description: "無法更新用戶權限",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            設定 {username} 的頁面權限
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 max-h-[60vh] overflow-y-auto">
          {Object.entries(PERMISSION_GROUPS).map(([groupKey, group]) => (
            <div key={groupKey} className="space-y-3">
              <h3 className="font-semibold text-lg">{group.name}</h3>
              <div className="grid grid-cols-2 gap-3 pl-4">
                {group.permissions.map(permission => (
                  <div key={permission.key} className="flex items-center space-x-2">
                    <Checkbox
                      id={permission.key}
                      checked={permissions.includes(permission.key)}
                      onCheckedChange={(checked) => 
                        handlePermissionChange(permission.key, checked as boolean)
                      }
                    />
                    <Label htmlFor={permission.key} className="text-sm">
                      {permission.label}
                    </Label>
                  </div>
                ))}
              </div>
              {groupKey !== 'admin' && <Separator />}
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            <X className="h-4 w-4 mr-2" />
            取消
          </Button>
          <Button onClick={handleSave} disabled={isLoading}>
            <Save className="h-4 w-4 mr-2" />
            {isLoading ? "儲存中..." : "儲存權限"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}