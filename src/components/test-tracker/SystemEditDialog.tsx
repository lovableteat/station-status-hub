
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { MobileDialog, MobileDialogContent, MobileDialogHeader, MobileDialogTitle, MobileDialogTrigger, MobileDialogFooter } from "@/components/ui/mobile-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Edit, Save, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface SystemEditDialogProps {
  systemId: string;
  systemName: string;
  assignedEngineer: string;
  model?: string;
  serialNumber?: string;
  onUpdate: () => void;
  variant?: 'button' | 'icon';
}

export function SystemEditDialog({ 
  systemId, 
  systemName, 
  assignedEngineer, 
  model, 
  serialNumber, 
  onUpdate, 
  variant = 'icon' 
}: SystemEditDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [editValues, setEditValues] = useState({
    system_name: systemName,
    assigned_engineer: assignedEngineer,
    model: model || 'GB300',
    serial_number: serialNumber || '',
    cabinet: '',
    os_mac_address: '',
    bmc_address: '',
    old_bmc_address: '',
    bom_90: '',
    ubuntu_version: '',
    cuda_version: '',
    exclude_from_dashboard: false,
    team: ''
  });
  const [engineers, setEngineers] = useState<Array<{id: string, name: string}>>([]);
  const { toast } = useToast();
  const isMobile = useIsMobile();

  useEffect(() => {
    const loadEngineers = async () => {
      const { data } = await supabase
        .from('engineers')
        .select('id, name')
        .eq('status', 'active')
        .order('name');
      if (data) setEngineers(data);
    };

    const loadSystemDetails = async () => {
      const { data } = await supabase
        .from('test_systems')
        .select('*')
        .eq('id', systemId)
        .maybeSingle();
      
      if (data) {
        setEditValues({
          system_name: data.system_name,
          assigned_engineer: data.assigned_engineer || '',
          model: data.model || 'GB300',
          serial_number: data.serial_number || '',
          cabinet: (data as any).cabinet || '',
          os_mac_address: data.os_mac_address || '',
          bmc_address: data.bmc_address || '',
          old_bmc_address: (data as any).old_bmc_address || '',
          bom_90: data.bom_90 || '',
          ubuntu_version: data.ubuntu_version || '',
          cuda_version: data.cuda_version || '',
          exclude_from_dashboard: data.exclude_from_dashboard || false,
          team: (data as any).team || ''
        });
      }
    };

    loadEngineers();
    loadSystemDetails();
  }, [systemId]);

  const handleSave = async () => {
    try {
      const { error } = await supabase
        .from('test_systems')
        .update({
          system_name: editValues.system_name,
          assigned_engineer: editValues.assigned_engineer,
          model: editValues.model,
          serial_number: editValues.serial_number,
          cabinet: editValues.cabinet,
          os_mac_address: editValues.os_mac_address,
          bmc_address: editValues.bmc_address,
          old_bmc_address: editValues.old_bmc_address,
          bom_90: editValues.bom_90,
          ubuntu_version: editValues.ubuntu_version,
          cuda_version: editValues.cuda_version,
          exclude_from_dashboard: editValues.exclude_from_dashboard,
          team: editValues.team
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
    <MobileDialog open={isOpen} onOpenChange={setIsOpen}>
      <MobileDialogTrigger asChild>
        {variant === 'button' ? (
          <Button 
            variant="outline" 
            size={isMobile ? "default" : "sm"} 
            className={cn(
              "text-sm px-2 py-1 bg-muted hover:bg-accent rounded border cursor-pointer",
              isMobile && "h-10 px-4 text-base"
            )}
          >
            {assignedEngineer}
          </Button>
        ) : (
          <Button 
            variant="ghost" 
            size={isMobile ? "default" : "sm"}
            className={isMobile ? "h-10 px-4" : ""}
          >
            <Edit className={isMobile ? "h-4 w-4 mr-2" : "h-3 w-3"} />
            {isMobile && "編輯"}
          </Button>
        )}
      </MobileDialogTrigger>
      <MobileDialogContent>
        <MobileDialogHeader>
          <MobileDialogTitle>編輯系統資料</MobileDialogTitle>
        </MobileDialogHeader>
        <div className={cn("space-y-4", isMobile && "space-y-6")}>
          <div>
            <Label className={isMobile ? "text-base font-medium mb-2 block" : ""}>機台編號</Label>
            <Input
              value={editValues.system_name}
              onChange={(e) => setEditValues({...editValues, system_name: e.target.value})}
              placeholder="請輸入機台編號..."
              className={isMobile ? "h-12 text-base" : ""}
            />
          </div>

          <div>
            <Label className={isMobile ? "text-base font-medium mb-2 block" : ""}>機櫃</Label>
            <Input
              value={editValues.cabinet}
              onChange={(e) => setEditValues({...editValues, cabinet: e.target.value})}
              placeholder="請輸入機櫃..."
              className={isMobile ? "h-12 text-base" : ""}
            />
          </div>

          <div>
            <Label className={isMobile ? "text-base font-medium mb-2 block" : ""}>型號</Label>
            <Input
              value={editValues.model}
              onChange={(e) => setEditValues({...editValues, model: e.target.value})}
              placeholder="請輸入型號..."
              className={isMobile ? "h-12 text-base" : ""}
            />
          </div>

          <div>
            <Label className={isMobile ? "text-base font-medium mb-2 block" : ""}>序號</Label>
            <Input
              value={editValues.serial_number}
              onChange={(e) => setEditValues({...editValues, serial_number: e.target.value})}
              placeholder="請輸入序號..."
              className={isMobile ? "h-12 text-base" : ""}
            />
          </div>

          <div>
            <Label className={isMobile ? "text-base font-medium mb-2 block" : ""}>NIC MAC Address</Label>
            <Input
              value={editValues.os_mac_address}
              onChange={(e) => setEditValues({...editValues, os_mac_address: e.target.value})}
              placeholder="請輸入 NIC MAC Address..."
              className={isMobile ? "h-12 text-base" : ""}
            />
          </div>

          <div>
            <Label className={isMobile ? "text-base font-medium mb-2 block" : ""}>BMC Address</Label>
            <Input
              value={editValues.bmc_address}
              onChange={(e) => setEditValues({...editValues, bmc_address: e.target.value})}
              placeholder="請輸入 BMC Address..."
              className={isMobile ? "h-12 text-base" : ""}
            />
          </div>

          <div>
            <Label className={isMobile ? "text-base font-medium mb-2 block" : ""}>舊 BMC Address</Label>
            <Input
              value={editValues.old_bmc_address}
              onChange={(e) => setEditValues({...editValues, old_bmc_address: e.target.value})}
              placeholder="請輸入舊 BMC Address..."
              className={isMobile ? "h-12 text-base" : ""}
            />
          </div>

          <div>
            <Label className={isMobile ? "text-base font-medium mb-2 block" : ""}>90BOM</Label>
            <Input
              value={editValues.bom_90}
              onChange={(e) => setEditValues({...editValues, bom_90: e.target.value})}
              placeholder="請輸入 90BOM..."
              className={isMobile ? "h-12 text-base" : ""}
            />
          </div>

          <div>
            <Label className={isMobile ? "text-base font-medium mb-2 block" : ""}>Ubuntu 版本</Label>
            <Input
              value={editValues.ubuntu_version}
              onChange={(e) => setEditValues({...editValues, ubuntu_version: e.target.value})}
              placeholder="例如：22.04、20.04"
              className={isMobile ? "h-12 text-base" : ""}
            />
          </div>

          <div>
            <Label className={isMobile ? "text-base font-medium mb-2 block" : ""}>CUDA 版本</Label>
            <Input
              value={editValues.cuda_version}
              onChange={(e) => setEditValues({...editValues, cuda_version: e.target.value})}
              placeholder="例如：12.2、11.8"
              className={isMobile ? "h-12 text-base" : ""}
            />
          </div>

          <div>
            <Label className={isMobile ? "text-base font-medium mb-2 block" : ""}>是否列入系統儀表板統計資料</Label>
            <Select 
              value={editValues.exclude_from_dashboard ? "false" : "true"} 
              onValueChange={(value) => setEditValues({...editValues, exclude_from_dashboard: value === "false"})}
            >
              <SelectTrigger className={isMobile ? "h-12 text-base" : ""}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true" className={isMobile ? "h-12 text-base" : ""}>
                  ✅ 是（預設）
                </SelectItem>
                <SelectItem value="false" className={isMobile ? "h-12 text-base" : ""}>
                  ❌ 否（排除）
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className={isMobile ? "text-base font-medium mb-2 block" : ""}>位置</Label>
            <Input
              value={editValues.team}
              onChange={(e) => setEditValues({...editValues, team: e.target.value})}
              placeholder="請輸入機台位置..."
              className={isMobile ? "h-12 text-base" : ""}
            />
          </div>

          <div>
            <Label className={isMobile ? "text-base font-medium mb-2 block" : ""}>負責工程師</Label>
            <Select 
              value={editValues.assigned_engineer} 
              onValueChange={(value) => setEditValues({...editValues, assigned_engineer: value})}
            >
              <SelectTrigger className={isMobile ? "h-12 text-base" : ""}>
                <SelectValue placeholder="請選擇負責工程師..." />
              </SelectTrigger>
              <SelectContent>
                {engineers.map(engineer => (
                  <SelectItem 
                    key={engineer.id} 
                    value={engineer.name}
                    className={isMobile ? "h-12 text-base" : ""}
                  >
                    {engineer.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <MobileDialogFooter>
          <Button 
            variant="outline" 
            onClick={() => setIsOpen(false)}
            className={isMobile ? "h-12 text-base font-medium" : ""}
          >
            <X className={isMobile ? "h-4 w-4 mr-2" : "h-3 w-3 mr-2"} />
            取消
          </Button>
          <Button 
            onClick={handleSave}
            className={isMobile ? "h-12 text-base font-medium" : ""}
          >
            <Save className={isMobile ? "h-4 w-4 mr-2" : "h-3 w-3 mr-2"} />
            儲存
          </Button>
        </MobileDialogFooter>
      </MobileDialogContent>
    </MobileDialog>
  );
}
