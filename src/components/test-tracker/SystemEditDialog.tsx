
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Save, X } from "lucide-react";

interface SystemEditDialogProps {
  isOpen: boolean;
  onClose: () => void;
  system: any;
  onUpdate: () => void;
}

export function SystemEditDialog({ isOpen, onClose, system, onUpdate }: SystemEditDialogProps) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    system_name: '',
    serial_number: '',
    model: '',
    assigned_engineer: '',
    current_station: '',
    status: '',
    os_mac_address: '',
    bmc_address: '',
    bom_90: '',
    exclude_from_dashboard: false // 新增欄位
  });

  useEffect(() => {
    if (system) {
      setFormData({
        system_name: system.system_name || '',
        serial_number: system.serial_number || '',
        model: system.model || 'GB300',
        assigned_engineer: system.assigned_engineer || '',
        current_station: system.current_station || 'Station 0',
        status: system.status || 'Not Start',
        os_mac_address: system.os_mac_address || '',
        bmc_address: system.bmc_address || '',
        bom_90: system.bom_90 || '',
        exclude_from_dashboard: system.exclude_from_dashboard || false
      });
    }
  }, [system]);

  const handleSave = async () => {
    try {
      const { error } = await supabase
        .from('test_systems')
        .update(formData)
        .eq('id', system.id);

      if (error) throw error;

      toast({
        title: "更新成功",
        description: "系統資訊已更新"
      });

      onUpdate();
      onClose();
    } catch (error) {
      console.error('Error updating system:', error);
      toast({
        title: "更新失敗",
        description: "無法更新系統資訊",
        variant: "destructive"
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>編輯系統資訊</DialogTitle>
        </DialogHeader>
        
        <div className="grid grid-cols-2 gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="system_name">系統名稱 *</Label>
            <Input
              id="system_name"
              value={formData.system_name}
              onChange={(e) => setFormData({...formData, system_name: e.target.value})}
              placeholder="請輸入系統名稱"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="serial_number">序號</Label>
            <Input
              id="serial_number"
              value={formData.serial_number}
              onChange={(e) => setFormData({...formData, serial_number: e.target.value})}
              placeholder="請輸入序號"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="model">型號</Label>
            <Input
              id="model"
              value={formData.model}
              onChange={(e) => setFormData({...formData, model: e.target.value})}
              placeholder="GB300"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="assigned_engineer">負責工程師</Label>
            <Input
              id="assigned_engineer"
              value={formData.assigned_engineer}
              onChange={(e) => setFormData({...formData, assigned_engineer: e.target.value})}
              placeholder="請輸入負責工程師"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="current_station">當前站點</Label>
            <Select
              value={formData.current_station}
              onValueChange={(value) => setFormData({...formData, current_station: value})}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Station 0">Station 0</SelectItem>
                <SelectItem value="Station 1">Station 1</SelectItem>
                <SelectItem value="Station 2">Station 2</SelectItem>
                <SelectItem value="Station 3">Station 3</SelectItem>
                <SelectItem value="已完成">已完成</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">狀態</Label>
            <Select
              value={formData.status}
              onValueChange={(value) => setFormData({...formData, status: value})}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Not Start">未開始</SelectItem>
                <SelectItem value="On-going">進行中</SelectItem>
                <SelectItem value="Done">已完成</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="os_mac_address">OS MAC Address</Label>
            <Input
              id="os_mac_address"
              value={formData.os_mac_address}
              onChange={(e) => setFormData({...formData, os_mac_address: e.target.value})}
              placeholder="請輸入OS MAC Address"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bmc_address">BMC Address</Label>
            <Input
              id="bmc_address"
              value={formData.bmc_address}
              onChange={(e) => setFormData({...formData, bmc_address: e.target.value})}
              placeholder="請輸入BMC Address"
            />
          </div>

          <div className="space-y-2 col-span-2">
            <Label htmlFor="bom_90">BOM 90%</Label>
            <Textarea
              id="bom_90"
              value={formData.bom_90}
              onChange={(e) => setFormData({...formData, bom_90: e.target.value})}
              placeholder="請輸入BOM 90%資訊"
              rows={3}
            />
          </div>

          {/* 新增不列入計算選項 */}
          <div className="col-span-2 flex items-center space-x-2">
            <Checkbox
              id="exclude_from_dashboard"
              checked={formData.exclude_from_dashboard}
              onCheckedChange={(checked) => setFormData({...formData, exclude_from_dashboard: !!checked})}
            />
            <Label htmlFor="exclude_from_dashboard" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              不列入系統儀表板統計計算
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            <X className="h-4 w-4 mr-2" />
            取消
          </Button>
          <Button onClick={handleSave}>
            <Save className="h-4 w-4 mr-2" />
            儲存變更
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
