import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Edit, Save, X, Trash } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/components/auth/UserContext";

interface UserEditDialogProps {
  userId: string;
  username: string;
  role: string;
  status: string;
  displayName?: string;
  onUpdate: () => void;
  onDelete: (userId: string) => void;
}

export function UserEditDialog({ userId, username, role, status, displayName, onUpdate, onDelete }: UserEditDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [editValues, setEditValues] = useState({
    username,
    role,
    status,
    displayName: displayName || "",
    password: ""
  });
  const { toast } = useToast();
  const { user } = useUser();

  const handleSave = async () => {
    try {
      const updateData: Record<string, string> = {
        username: editValues.username,
        role: editValues.role,
        status: editValues.status,
        display_name: editValues.displayName
      };

      // Only update password if provided - use secure hashing
      if (editValues.password) {
        const { data: hashedPassword, error: hashError } = await supabase.rpc('hash_password', {
          password: editValues.password
        });
        if (hashError) {
          throw new Error('Failed to hash password');
        }
        updateData.password_hash = hashedPassword;
      }

      const { error } = await supabase
        .from('system_users')
        .update(updateData)
        .eq('id', userId);

      if (error) throw error;

      toast({
        title: "更新成功",
        description: "用戶資料已成功更新"
      });

      setIsOpen(false);
      onUpdate();
    } catch (error) {
      toast({
        title: "更新失敗",
        description: "無法更新用戶資料",
        variant: "destructive"
      });
    }
  };

  const handleDelete = () => {
    if (window.confirm(`確定要刪除用戶 ${username} 嗎？此操作無法復原。`)) {
      onDelete(userId);
      setIsOpen(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Edit className="h-4 w-4" />
          編輯與重設
        </Button>
      </DialogTrigger>
      <DialogContent
        data-admin-dialog="user-editor"
        className="max-w-xl border border-cyan-200/35 bg-[#0d263a] text-slate-100 shadow-[0_28px_90px_-45px_rgba(34,211,238,0.8)]"
      >
        <DialogHeader>
          <DialogTitle>編輯用戶</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          <div className="rounded-2xl border border-primary/15 bg-primary/10 p-4 text-sm text-muted-foreground">
            這裡可修改帳號基本資料，若要重設密碼，直接輸入新的密碼後儲存即可。系統不會顯示舊密碼，也不保留任何明文密碼。
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>用戶名</Label>
              <Input
                value={editValues.username}
                onChange={(e) => setEditValues({...editValues, username: e.target.value})}
                placeholder="請輸入用戶名..."
              />
            </div>

            <div className="space-y-2">
              <Label>顯示名稱</Label>
              <Input
                value={editValues.displayName}
                onChange={(e) => setEditValues({...editValues, displayName: e.target.value})}
                placeholder="請輸入顯示名稱..."
              />
            </div>

            <div className="space-y-2">
              <Label>角色</Label>
              <Select value={editValues.role} onValueChange={(value) => setEditValues({...editValues, role: value})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {user?.role === "super_admin" ? (
                    <SelectItem value="super_admin">超級管理員</SelectItem>
                  ) : null}
                  <SelectItem value="admin">管理員</SelectItem>
                  <SelectItem value="engineer">工程師</SelectItem>
                  <SelectItem value="viewer">檢視者</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>狀態</Label>
              <Select value={editValues.status} onValueChange={(value) => setEditValues({...editValues, status: value})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">啟用</SelectItem>
                  <SelectItem value="inactive">停用</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>新密碼（留空則不更改）</Label>
            <Input
              type="password"
              value={editValues.password}
              onChange={(e) => setEditValues({...editValues, password: e.target.value})}
              placeholder="請輸入新的登入密碼"
            />
          </div>

          <div className="flex justify-between">
            <Button variant="destructive" onClick={handleDelete}>
              <Trash className="h-3 w-3 mr-2" />
              刪除用戶
            </Button>
            <div className="flex gap-2">
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
