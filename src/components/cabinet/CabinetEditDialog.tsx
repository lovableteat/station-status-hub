import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { CabinetInstance } from './CabinetInstanceManager';
import { supabase } from '@/integrations/supabase/client';

interface CabinetEditDialogProps {
  cabinet: CabinetInstance | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (cabinet: CabinetInstance) => void;
}

export function CabinetEditDialog({ cabinet, open, onOpenChange, onSave }: CabinetEditDialogProps) {
  const [formData, setFormData] = useState<CabinetInstance | null>(cabinet);
  const [engineers, setEngineers] = useState<{id: string, name: string}[]>([]);

  useEffect(() => {
    setFormData(cabinet);
  }, [cabinet]);

  useEffect(() => {
    if (open) {
      loadEngineers();
    }
  }, [open]);

  const loadEngineers = async () => {
    try {
      const { data, error } = await supabase
        .from('engineers')
        .select('id, name')
        .eq('status', 'active')
        .order('name');
      
      if (error) throw error;
      if (data) setEngineers(data);
    } catch (error) {
      console.error('Failed to load engineers:', error);
      setEngineers([]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData) {
      onSave({
        ...formData,
        lastUpdated: new Date().toISOString()
      });
      onOpenChange(false);
    }
  };

  if (!formData) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>編輯機櫃 - {formData.name}</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            {/* 基本資訊 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">機櫃名稱</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  placeholder="輸入機櫃名稱"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="model">機櫃型號</Label>
                <Select 
                  value={formData.model} 
                  onValueChange={(value) => setFormData({...formData, model: value})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="選擇型號" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="L11">L11 計算機櫃</SelectItem>
                    <SelectItem value="L12">L12 存儲機櫃</SelectItem>
                    <SelectItem value="L13">L13 網路機櫃</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 位置和狀態 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="location">廠房位置</Label>
                <Input
                  id="location"
                  value={formData.location}
                  onChange={(e) => setFormData({...formData, location: e.target.value})}
                  placeholder="例如：廠房A-1樓-東側"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="status">機櫃狀態</Label>
                <Select 
                  value={formData.status} 
                  onValueChange={(value: CabinetInstance['status']) => setFormData({...formData, status: value})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="選擇狀態" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">運行中</SelectItem>
                    <SelectItem value="maintenance">維護中</SelectItem>
                    <SelectItem value="offline">離線</SelectItem>
                    <SelectItem value="planning">規劃中</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 系統配置 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="totalSystems">總系統數量</Label>
                <Input
                  id="totalSystems"
                  type="number"
                  value={formData.totalSystems}
                  onChange={(e) => setFormData({...formData, totalSystems: parseInt(e.target.value) || 0})}
                  min="0"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="completedSystems">已完成系統</Label>
                <Input
                  id="completedSystems"
                  type="number"
                  value={formData.completedSystems}
                  onChange={(e) => setFormData({...formData, completedSystems: parseInt(e.target.value) || 0})}
                  min="0"
                  max={formData.totalSystems}
                />
              </div>
            </div>

            {/* 組件配置 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="totalComponents">總組件數量</Label>
                <Input
                  id="totalComponents"
                  type="number"
                  value={formData.totalComponents}
                  onChange={(e) => setFormData({...formData, totalComponents: parseInt(e.target.value) || 0})}
                  min="0"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="configuredComponents">已配置組件</Label>
                <Input
                  id="configuredComponents"
                  type="number"
                  value={formData.configuredComponents}
                  onChange={(e) => setFormData({...formData, configuredComponents: parseInt(e.target.value) || 0})}
                  min="0"
                  max={formData.totalComponents}
                />
              </div>
            </div>

            {/* 工程師分配 */}
            <div className="space-y-2">
              <Label htmlFor="engineers">指派工程師</Label>
              <Select 
                value={formData.assignedEngineers[0] || "none"} 
                onValueChange={(value) => setFormData({
                  ...formData, 
                  assignedEngineers: value === "none" ? [] : [value]
                })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="選擇工程師（預設無）" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">無指派</SelectItem>
                  {engineers.map((engineer) => (
                    <SelectItem key={engineer.id} value={engineer.name}>
                      {engineer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 備註 */}
            <div className="space-y-2">
              <Label htmlFor="notes">備註</Label>
              <Textarea
                id="notes"
                value={formData.notes || ''}
                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                placeholder="輸入備註資訊..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit">
              保存變更
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}