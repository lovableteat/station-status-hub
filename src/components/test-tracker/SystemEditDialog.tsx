import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Edit, Save, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface SystemEditDialogProps {
  systemId: string;
  systemName: string;
  assignedEngineer: string;
  onUpdate: () => void;
  variant?: 'button' | 'icon';
}

export function SystemEditDialog({ systemId, systemName, assignedEngineer, onUpdate, variant = 'icon' }: SystemEditDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [editValues, setEditValues] = useState({
    system_name: systemName,
    assigned_engineer: assignedEngineer
  });
  const [engineers, setEngineers] = useState<Array<{id: string, name: string}>>([]);
  const { toast } = useToast();

  useEffect(() => {
    const loadEngineers = async () => {
      const { data } = await supabase
        .from('engineers')
        .select('id, name')
        .eq('status', 'active')
        .order('name');
      if (data) setEngineers(data);
    };
    loadEngineers();
  }, []);

  const handleSave = async () => {
    try {
      const { error } = await supabase
        .from('test_systems')
        .update({
          system_name: editValues.system_name,
          assigned_engineer: editValues.assigned_engineer
        })
        .eq('id', systemId);

      if (error) throw error;

      toast({
        title: "更新成功",
        description: "系統資料已成功更新"
      });

      setIsOpen(false);
      onUpdate();
    } catch (error) {
      toast({
        title: "更新失敗",
        description: "無法更新系統資料",
        variant: "destructive"
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {variant === 'button' ? (
          <Button variant="outline" size="sm" className="text-sm px-2 py-1 bg-muted hover:bg-accent rounded border cursor-pointer">
            {assignedEngineer}
          </Button>
        ) : (
          <Button variant="ghost" size="sm">
            <Edit className="h-3 w-3" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>編輯系統資料</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>機台編號</Label>
            <Input
              value={editValues.system_name}
              onChange={(e) => setEditValues({...editValues, system_name: e.target.value})}
              placeholder="請輸入機台編號..."
            />
          </div>
          <div>
            <Label>負責工程師</Label>
            <Select 
              value={editValues.assigned_engineer} 
              onValueChange={(value) => setEditValues({...editValues, assigned_engineer: value})}
            >
              <SelectTrigger>
                <SelectValue placeholder="請選擇負責工程師..." />
              </SelectTrigger>
              <SelectContent>
                {engineers.map(engineer => (
                  <SelectItem key={engineer.id} value={engineer.name}>
                    {engineer.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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