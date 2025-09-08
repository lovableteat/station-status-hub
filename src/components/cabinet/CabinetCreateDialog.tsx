import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus } from 'lucide-react';
import { CabinetInfo } from './CabinetCard';

interface CabinetCreateDialogProps {
  onCreateCabinet: (cabinet: Omit<CabinetInfo, 'id' | 'createdAt' | 'lastUpdated'>) => void;
}

export function CabinetCreateDialog({ onCreateCabinet }: CabinetCreateDialogProps) {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    location: '',
    model: 'L11',
    status: 'planning' as const,
    totalSystems: 29,
    completedSystems: 0,
    totalComponents: 29,
    configuredComponents: 0,
    assignedEngineers: [] as string[],
    description: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreateCabinet(formData);
    setOpen(false);
    setFormData({
      name: '',
      location: '',
      model: 'L11',
      status: 'planning',
      totalSystems: 29,
      completedSystems: 0,
      totalComponents: 29,
      configuredComponents: 0,
      assignedEngineers: [],
      description: ''
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg">
          <Plus className="h-5 w-5 mr-2" />
          新增機櫃
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>新增機櫃</DialogTitle>
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
            <Label htmlFor="status">初始狀態</Label>
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

          <div className="space-y-2">
            <Label htmlFor="description">描述</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="機櫃描述..."
              rows={3}
            />
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button type="submit">
              創建機櫃
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}