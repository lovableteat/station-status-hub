import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Edit, Save, X, Trash } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface EngineerEditDialogProps {
  engineerId: string;
  name: string;
  email: string;
  team: string;
  status: string;
  employeeId?: string;
  onUpdate: () => void;
  onDelete: (engineerId: string) => void;
}

export function EngineerEditDialog({ engineerId, name, email, team, status, employeeId, onUpdate, onDelete }: EngineerEditDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [editValues, setEditValues] = useState({
    name,
    email,
    team,
    status,
    employee_id: employeeId || ''
  });
  const { toast } = useToast();

  const handleSave = async () => {
    try {
      const { error } = await supabase
        .from('engineers')
        .update(editValues)
        .eq('id', engineerId);

      if (error) throw error;

      toast({
        title: "更新成功",
        description: "工程師資料已成功更新"
      });

      setIsOpen(false);
      onUpdate();
    } catch (error) {
      toast({
        title: "更新失敗",
        description: "無法更新工程師資料",
        variant: "destructive"
      });
    }
  };

  const handleDelete = () => {
    if (window.confirm(`確定要刪除工程師 ${name} 嗎？此操作無法復原。`)) {
      onDelete(engineerId);
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
          <DialogTitle>編輯工程師</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>姓名</Label>
            <Input
              value={editValues.name}
              onChange={(e) => setEditValues({...editValues, name: e.target.value})}
              placeholder="請輸入姓名..."
            />
          </div>
          <div>
            <Label>電子郵件</Label>
            <Input
              value={editValues.email}
              onChange={(e) => setEditValues({...editValues, email: e.target.value})}
              placeholder="請輸入電子郵件..."
            />
          </div>
          <div>
            <Label>工號</Label>
            <Input
              value={editValues.employee_id}
              onChange={(e) => setEditValues({...editValues, employee_id: e.target.value})}
              placeholder="請輸入工號..."
            />
          </div>
          <div>
            <Label>團隊</Label>
            <Select value={editValues.team} onValueChange={(value) => setEditValues({...editValues, team: value})}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ME">ME TEAM (第0站)</SelectItem>
                <SelectItem value="BIOS/BMC">BIOS/BMC TEAM (第1站)</SelectItem>
                <SelectItem value="EE">EE TEAM (第2站)</SelectItem>
                <SelectItem value="SIT/RAD">SIT/RAD TEAM (第3站)</SelectItem>
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
              刪除工程師
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