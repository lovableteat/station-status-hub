import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { useState } from 'react';

interface UnifiedSystem {
  id: string;
  system_name: string;
  assigned_engineer: string;
  current_station: string;
  overall_progress: number;
  status: string;
  model?: string;
  serial_number?: string;
}

interface SystemProgressInfo {
  system: UnifiedSystem;
  progress: number;
  status: string;
  test_items_completed: number;
  test_items_total: number;
}

interface SystemSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  componentType: string;
  componentSn: string;
  systems: UnifiedSystem[];
  systemProgress: SystemProgressInfo[];
  onSystemSelect: (system: UnifiedSystem) => void;
  excludeAllocatedSystems?: boolean;
  currentCabinetId?: string;
  isSystemAllocated?: (systemId: string) => boolean;
}

function getStatusColor(status: string): string {
  switch (status?.toLowerCase()) {
    case 'completed': return 'bg-green-500';
    case 'in_progress': return 'bg-blue-500';
    case 'not_start': return 'bg-gray-500';
    case 'on_hold': return 'bg-yellow-500';
    default: return 'bg-gray-500';
  }
}

export function SystemSelectionDialog({
  open,
  onOpenChange,
  componentType,
  componentSn,
  systems,
  systemProgress,
  onSystemSelect,
  excludeAllocatedSystems = true,
  currentCabinetId,
  isSystemAllocated
}: SystemSelectionDialogProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredSystems = systems.filter(system => {
    // 基本搜尋過濾
    const matchesSearch = system.system_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (system.serial_number && system.serial_number.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (system.assigned_engineer && system.assigned_engineer.toLowerCase().includes(searchTerm.toLowerCase()));
    
    // 如果啟用排除已分配的系統，且有分配檢查函數
    if (excludeAllocatedSystems && isSystemAllocated) {
      const isAllocated = isSystemAllocated(system.id);
      return matchesSearch && !isAllocated;
    }
    
    return matchesSearch;
  });

  const handleSystemSelect = (system: UnifiedSystem) => {
    onSystemSelect(system);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>選擇機台 - {componentType} ({componentSn})</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* 搜尋框 */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜尋系統名稱、序列號或工程師..."
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* 系統清單 */}
          <ScrollArea className="h-[400px]">
            <div className="space-y-2">
              {filteredSystems.map((system) => {
                const progressInfo = systemProgress.find(p => p.system.id === system.id);
                
                return (
                   <div
                     key={system.id}
                     className="p-4 border rounded-lg hover:bg-accent cursor-pointer transition-colors"
                     onClick={() => handleSystemSelect(system)}
                   >
                     <div className="flex items-center justify-between mb-2">
                       <div className="flex items-center gap-3">
                         <div className={`h-3 w-3 rounded-full ${getStatusColor(system.status)}`} />
                         <h4 className="font-semibold">{system.system_name}</h4>
                         <Badge variant="outline" className="text-xs">
                           {system.model || 'GB300'}
                         </Badge>
                         {isSystemAllocated && isSystemAllocated(system.id) && (
                           <Badge variant="destructive" className="text-xs">
                             已分配
                           </Badge>
                         )}
                       </div>
                       <Badge variant={system.status === 'Completed' ? 'default' : 'secondary'}>
                         {system.status}
                       </Badge>
                     </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm text-muted-foreground">
                      <div>
                        <span className="font-medium">序列號:</span>
                        <p className="text-yellow-500 font-mono font-bold">
                          {system.serial_number || 'N/A'}
                        </p>
                      </div>
                      <div>
                        <span className="font-medium">當前工站:</span>
                        <p className="text-foreground">{system.current_station}</p>
                      </div>
                      <div>
                        <span className="font-medium">指派工程師:</span>
                        <p className="text-foreground">{system.assigned_engineer || '未指派'}</p>
                      </div>
                      <div>
                        <span className="font-medium">整體進度:</span>
                        <p className="text-foreground">{system.overall_progress || 0}%</p>
                      </div>
                    </div>

                    {progressInfo && (
                      <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                        <span>測試項目: {progressInfo.test_items_completed}/{progressInfo.test_items_total}</span>
                        <div className="flex-1 bg-secondary rounded-full h-2">
                          <div 
                            className="h-2 bg-primary rounded-full transition-all"
                            style={{ width: `${progressInfo.progress}%` }}
                          />
                        </div>
                        <span>{progressInfo.progress.toFixed(1)}%</span>
                      </div>
                    )}
                  </div>
                );
              })}
              
              {filteredSystems.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <p>找不到符合條件的系統</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}