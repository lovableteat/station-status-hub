import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { CabinetInfo } from './CabinetCard';

interface CabinetEditDialogProps {
  cabinet: CabinetInfo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaveCabinet: (cabinet: CabinetInfo) => void;
}

export function CabinetEditDialog({ cabinet, open, onOpenChange, onSaveCabinet }: CabinetEditDialogProps) {
  const [formData, setFormData] = useState<CabinetInfo | null>(cabinet);

  React.useEffect(() => {
    setFormData(cabinet);
  }, [cabinet]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData) {
      onSaveCabinet({
        ...formData,
        lastUpdated: new Date().toISOString()
      });
      onOpenChange(false);
    }
  };

  if (!formData) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>編輯機櫃</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">機櫃名稱 *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="例：L11-機櫃-A1"
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="location">位置 *</Label>
            <Input
              id="location"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              placeholder="例：廠房A-1樓-東側"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="model">型號</Label>
            <Select value={formData.model} onValueChange={(value) => setFormData({ ...formData, model: value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="L11">L11</SelectItem>
                <SelectItem value="L12">L12</SelectItem>
                <SelectItem value="L20">L20</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">狀態</Label>
            <Select value={formData.status} onValueChange={(value: any) => setFormData({ ...formData, status: value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="planning">規劃中</SelectItem>
                <SelectItem value="active">運行中</SelectItem>
                <SelectItem value="maintenance">維護中</SelectItem>
                <SelectItem value="offline">離線</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="totalSystems">總系統數</Label>
              <Input
                id="totalSystems"
                type="number"
                value={formData.totalSystems}
                onChange={(e) => setFormData({ ...formData, totalSystems: parseInt(e.target.value) || 0 })}
                min="0"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="completedSystems">完成系統數</Label>
              <Input
                id="completedSystems"
                type="number"
                value={formData.completedSystems}
                onChange={(e) => setFormData({ ...formData, completedSystems: parseInt(e.target.value) || 0 })}
                min="0"
                max={formData.totalSystems}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="totalComponents">總組件數</Label>
              <Input
                id="totalComponents"
                type="number"
                value={formData.totalComponents}
                onChange={(e) => setFormData({ ...formData, totalComponents: parseInt(e.target.value) || 0 })}
                min="0"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="configuredComponents">已配置組件數</Label>
              <Input
                id="configuredComponents"
                type="number"
                value={formData.configuredComponents}
                onChange={(e) => setFormData({ ...formData, configuredComponents: parseInt(e.target.value) || 0 })}
                min="0"
                max={formData.totalComponents}
              />
            </div>
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit">
              保存變更
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}