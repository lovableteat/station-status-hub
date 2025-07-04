import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Edit, Save, X, Trash } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface UserEditDialogProps {
  userId: string;
  username: string;
  role: string;
  status: string;
  onUpdate: () => void;
  onDelete: (userId: string) => void;
}

export function UserEditDialog({ userId, username, role, status, onUpdate, onDelete }: UserEditDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [editValues, setEditValues] = useState({
    username,
    role,
    status,
    password: ""
  });
  const { toast } = useToast();

  const handleSave = async () => {
    try {
      const updateData: any = {
        username: editValues.username,
        role: editValues.role,
        status: editValues.status
      };

      // Only update password if provided
      if (editValues.password) {
        updateData.password_hash = editValues.password;
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
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>編輯用戶</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>用戶名</Label>
            <Input
              value={editValues.username}
              onChange={(e) => setEditValues({...editValues, username: e.target.value})}
              placeholder="請輸入用戶名..."
            />
          </div>
          <div>
            <Label>新密碼 (留空則不更改)</Label>
            <Input
              type="password"
              value={editValues.password}
              onChange={(e) => setEditValues({...editValues, password: e.target.value})}
              placeholder="請輸入新密碼..."
            />
          </div>
          <div>
            <Label>角色</Label>
            <Select value={editValues.role} onValueChange={(value) => setEditValues({...editValues, role: value})}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">管理員</SelectItem>
                <SelectItem value="engineer">工程師</SelectItem>
                <SelectItem value="viewer">檢視者</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
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