import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Edit, Save, X, Server, Cpu, Network, Settings, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface SystemDetails {
  system_name?: string;
  model?: string;
  current_station?: string;
  status?: string;
  assigned_engineer?: string;
  overall_progress?: number;
  team?: string;
  bmc_address?: string;
  os_mac_address?: string;
  ubuntu_version?: string;
  cuda_version?: string;
  serial_number?: string;
  cabinet?: string;
  old_bmc_address?: string;
  bom_90?: string;
}

interface SelectedComponent {
  type: string;
  sn: string;
  details?: SystemDetails;
  systemId?: string;
}

interface ComponentDetailDialogProps {
  component: SelectedComponent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate?: () => void;
}

export function ComponentDetailDialog({ component, open, onOpenChange, onUpdate }: ComponentDetailDialogProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValues, setEditValues] = useState<SystemDetails>({});
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (component?.details) {
      setEditValues({
        system_name: component.details.system_name || '',
        model: component.details.model || '',
        current_station: component.details.current_station || '',
        status: component.details.status || '',
        assigned_engineer: component.details.assigned_engineer || '',
        overall_progress: component.details.overall_progress || 0,
        team: component.details.team || '',
        bmc_address: component.details.bmc_address || '',
        os_mac_address: component.details.os_mac_address || '',
        ubuntu_version: component.details.ubuntu_version || '',
        cuda_version: component.details.cuda_version || '',
        serial_number: component.details.serial_number || '',
        cabinet: component.details.cabinet || '',
        old_bmc_address: component.details.old_bmc_address || '',
        bom_90: component.details.bom_90 || ''
      });
    }
  }, [component]);

  const handleSave = async () => {
    if (!component?.systemId) {
      toast({
        title: "儲存失敗",
        description: "找不到系統ID",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('test_systems')
        .update({
          system_name: editValues.system_name,
          model: editValues.model,
          assigned_engineer: editValues.assigned_engineer,
          os_mac_address: editValues.os_mac_address,
          bmc_address: editValues.bmc_address,
          old_bmc_address: editValues.old_bmc_address,
          ubuntu_version: editValues.ubuntu_version,
          cuda_version: editValues.cuda_version,
          serial_number: editValues.serial_number,
          cabinet: editValues.cabinet,
          bom_90: editValues.bom_90,
          team: editValues.team
        })
        .eq('id', component.systemId);

      if (error) throw error;

      toast({
        title: "更新成功",
        description: "系統資料已成功更新"
      });

      setIsEditing(false);
      onUpdate?.();
    } catch (error) {
      console.error('Error updating system:', error);
      toast({
        title: "更新失敗",
        description: "無法更新系統資料",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  if (!component) return null;

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'Done': return 'default';
      case 'On-going': return 'secondary';
      case 'Not Start': return 'outline';
      default: return 'secondary';
    }
  };

  const getProgressColor = (progress: number) => {
    if (progress >= 100) return '#22c55e'; // green
    if (progress >= 75) return '#3b82f6'; // blue  
    if (progress >= 50) return '#f59e0b'; // yellow
    if (progress >= 25) return '#f97316'; // orange
    return '#ef4444'; // red
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            組件詳細資訊 - {component.type}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* 基本組件資訊 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Info className="h-4 w-4" />
                基本組件資訊
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">組件類型</Label>
                  <p className="text-foreground font-mono">{component.type}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">序列號</Label>
                  <p className="text-yellow-600 dark:text-yellow-400 font-mono font-bold">{component.sn}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 系統詳細資訊 */}
          {component.details && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Cpu className="h-4 w-4" />
                    系統詳細資訊
                  </CardTitle>
                  {component.systemId && (
                    <Button
                      variant={isEditing ? "outline" : "default"}
                      size="sm"
                      onClick={() => setIsEditing(!isEditing)}
                      disabled={loading}
                    >
                      {isEditing ? (
                        <>
                          <X className="h-4 w-4 mr-2" />
                          取消編輯
                        </>
                      ) : (
                        <>
                          <Edit className="h-4 w-4 mr-2" />
                          編輯資訊
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="general" className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="general">一般資訊</TabsTrigger>
                    <TabsTrigger value="network">網路配置</TabsTrigger>
                    <TabsTrigger value="advanced">進階設定</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="general" className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-sm font-medium">系統名稱</Label>
                        {isEditing ? (
                          <Input
                            value={editValues.system_name}
                            onChange={(e) => setEditValues({...editValues, system_name: e.target.value})}
                            placeholder="請輸入系統名稱"
                          />
                        ) : (
                          <p className="text-foreground">{component.details.system_name || 'N/A'}</p>
                        )}
                      </div>
                      
                      <div>
                        <Label className="text-sm font-medium">型號</Label>
                        {isEditing ? (
                          <Input
                            value={editValues.model}
                            onChange={(e) => setEditValues({...editValues, model: e.target.value})}
                            placeholder="請輸入型號"
                          />
                        ) : (
                          <p className="text-foreground">{component.details.model || 'N/A'}</p>
                        )}
                      </div>
                      
                      <div>
                        <Label className="text-sm font-medium">序列號</Label>
                        {isEditing ? (
                          <Input
                            value={editValues.serial_number}
                            onChange={(e) => setEditValues({...editValues, serial_number: e.target.value})}
                            placeholder="請輸入序列號"
                          />
                        ) : (
                          <p className="text-foreground font-mono">{component.details.serial_number || 'N/A'}</p>
                        )}
                      </div>
                      
                      <div>
                        <Label className="text-sm font-medium">當前工站</Label>
                        <p className="text-foreground">{component.details.current_station || 'N/A'}</p>
                      </div>
                      
                      <div>
                        <Label className="text-sm font-medium">狀態</Label>
                        <div>
                          <Badge variant={getStatusColor(component.details.status)}>
                            {component.details.status || 'N/A'}
                          </Badge>
                        </div>
                      </div>
                      
                      <div>
                        <Label className="text-sm font-medium">指派工程師</Label>
                        {isEditing ? (
                          <Input
                            value={editValues.assigned_engineer}
                            onChange={(e) => setEditValues({...editValues, assigned_engineer: e.target.value})}
                            placeholder="請輸入工程師名稱"
                          />
                        ) : (
                          <p className="text-foreground">{component.details.assigned_engineer || '未指派'}</p>
                        )}
                      </div>
                      
                      <div>
                        <Label className="text-sm font-medium">機櫃位置</Label>
                        {isEditing ? (
                          <Input
                            value={editValues.cabinet}
                            onChange={(e) => setEditValues({...editValues, cabinet: e.target.value})}
                            placeholder="請輸入機櫃位置"
                          />
                        ) : (
                          <p className="text-foreground">{component.details.cabinet || 'N/A'}</p>
                        )}
                      </div>
                      
                      <div>
                        <Label className="text-sm font-medium">團隊/位置</Label>
                        {isEditing ? (
                          <Input
                            value={editValues.team}
                            onChange={(e) => setEditValues({...editValues, team: e.target.value})}
                            placeholder="請輸入團隊或位置"
                          />
                        ) : (
                          <p className="text-foreground">{component.details.team || 'N/A'}</p>
                        )}
                      </div>
                    </div>
                    
                    <Separator />
                    
                    <div>
                      <Label className="text-sm font-medium">整體進度</Label>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">完成度</span>
                          <span className="text-sm font-medium">{component.details.overall_progress || 0}%</span>
                        </div>
                        <Progress 
                          value={component.details.overall_progress || 0} 
                          className="h-2"
                          style={{
                            '--progress-background': getProgressColor(component.details.overall_progress || 0)
                          } as React.CSSProperties}
                        />
                      </div>
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="network" className="space-y-4">
                    <div className="flex items-center gap-2 mb-4">
                      <Network className="h-4 w-4" />
                      <h4 className="font-medium">網路配置資訊</h4>
                    </div>
                    
                    <div className="grid grid-cols-1 gap-4">
                      <div>
                        <Label className="text-sm font-medium">NIC MAC Address</Label>
                        {isEditing ? (
                          <Input
                            value={editValues.os_mac_address}
                            onChange={(e) => setEditValues({...editValues, os_mac_address: e.target.value})}
                            placeholder="請輸入 NIC MAC Address (例：AA:BB:CC:DD:EE:FF)"
                            className="font-mono"
                          />
                        ) : (
                          <p className="text-foreground font-mono bg-muted p-2 rounded">
                            {component.details.os_mac_address || '未設定'}
                          </p>
                        )}
                      </div>
                      
                      <div>
                        <Label className="text-sm font-medium">BMC Address</Label>
                        {isEditing ? (
                          <Input
                            value={editValues.bmc_address}
                            onChange={(e) => setEditValues({...editValues, bmc_address: e.target.value})}
                            placeholder="請輸入 BMC Address (例：192.168.1.100)"
                            className="font-mono"
                          />
                        ) : (
                          <p className="text-foreground font-mono bg-muted p-2 rounded">
                            {component.details.bmc_address || '未設定'}
                          </p>
                        )}
                      </div>
                      
                      <div>
                        <Label className="text-sm font-medium">舊 BMC Address</Label>
                        {isEditing ? (
                          <Input
                            value={editValues.old_bmc_address}
                            onChange={(e) => setEditValues({...editValues, old_bmc_address: e.target.value})}
                            placeholder="請輸入舊 BMC Address"
                            className="font-mono"
                          />
                        ) : (
                          <p className="text-foreground font-mono bg-muted p-2 rounded">
                            {component.details.old_bmc_address || '未設定'}
                          </p>
                        )}
                      </div>
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="advanced" className="space-y-4">
                    <div className="flex items-center gap-2 mb-4">
                      <Settings className="h-4 w-4" />
                      <h4 className="font-medium">進階設定</h4>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-sm font-medium">Ubuntu 版本</Label>
                        {isEditing ? (
                          <Input
                            value={editValues.ubuntu_version}
                            onChange={(e) => setEditValues({...editValues, ubuntu_version: e.target.value})}
                            placeholder="例如：22.04、20.04"
                          />
                        ) : (
                          <p className="text-foreground">{component.details.ubuntu_version || '未設定'}</p>
                        )}
                      </div>
                      
                      <div>
                        <Label className="text-sm font-medium">CUDA 版本</Label>
                        {isEditing ? (
                          <Input
                            value={editValues.cuda_version}
                            onChange={(e) => setEditValues({...editValues, cuda_version: e.target.value})}
                            placeholder="例如：12.2、11.8"
                          />
                        ) : (
                          <p className="text-foreground">{component.details.cuda_version || '未設定'}</p>
                        )}
                      </div>
                      
                      <div>
                        <Label className="text-sm font-medium">90BOM</Label>
                        {isEditing ? (
                          <Input
                            value={editValues.bom_90}
                            onChange={(e) => setEditValues({...editValues, bom_90: e.target.value})}
                            placeholder="請輸入 90BOM"
                          />
                        ) : (
                          <p className="text-foreground">{component.details.bom_90 || '未設定'}</p>
                        )}
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            關閉
          </Button>
          {isEditing && component.systemId && (
            <Button onClick={handleSave} disabled={loading}>
              <Save className="h-4 w-4 mr-2" />
              {loading ? '儲存中...' : '儲存變更'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}