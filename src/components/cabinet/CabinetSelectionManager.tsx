import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building, Plus, Settings, Eye } from 'lucide-react';
import { CabinetInfo } from './CabinetCard';

interface CabinetSelectionManagerProps {
  currentCabinetId?: string;
  onCabinetChange: (cabinetId: string) => void;
}

// 可擴展的機櫃配置
const getAvailableCabinets = (): CabinetInfo[] => {
  const baseCabinets = [
    { 
      id: 'cabinet-001', 
      name: 'L11-機櫃-A1', 
      location: '廠房A-1樓-東側', 
      model: 'L11', 
      status: 'active' as const, 
      totalSystems: 29, 
      completedSystems: 18, 
      totalComponents: 29, 
      configuredComponents: 25, 
      assignedEngineers: ['張工程師', '李工程師'], 
      createdAt: '2024-01-15T08:00:00Z', 
      lastUpdated: new Date().toISOString() 
    },
    { 
      id: 'cabinet-002', 
      name: 'L11-機櫃-A2', 
      location: '廠房A-1樓-西側', 
      model: 'L11', 
      status: 'maintenance' as const, 
      totalSystems: 29, 
      completedSystems: 12, 
      totalComponents: 29, 
      configuredComponents: 20, 
      assignedEngineers: ['陳工程師', '林工程師'], 
      createdAt: '2024-01-20T09:30:00Z', 
      lastUpdated: new Date().toISOString() 
    },
    { 
      id: 'cabinet-003', 
      name: 'L11-機櫃-B1', 
      location: '廠房B-2樓-北側', 
      model: 'L11', 
      status: 'planning' as const, 
      totalSystems: 29, 
      completedSystems: 0, 
      totalComponents: 29, 
      configuredComponents: 8, 
      assignedEngineers: ['黃工程師'], 
      createdAt: '2024-02-01T10:15:00Z', 
      lastUpdated: new Date().toISOString() 
    },
    { 
      id: 'cabinet-004', 
      name: 'L11-機櫃-B2', 
      location: '廠房B-2樓-南側', 
      model: 'L11', 
      status: 'offline' as const, 
      totalSystems: 29, 
      completedSystems: 8, 
      totalComponents: 29, 
      configuredComponents: 15, 
      assignedEngineers: [], 
      createdAt: '2024-02-05T14:20:00Z', 
      lastUpdated: new Date().toISOString() 
    },
    { 
      id: 'cabinet-005', 
      name: 'L11-機櫃-C1', 
      location: '廠房C-3樓-中央', 
      model: 'L11', 
      status: 'active' as const, 
      totalSystems: 29, 
      completedSystems: 29, 
      totalComponents: 29, 
      configuredComponents: 29, 
      assignedEngineers: ['劉工程師', '吳工程師'], 
      createdAt: '2024-01-10T07:45:00Z', 
      lastUpdated: new Date().toISOString() 
    }
  ];

  // 從localStorage讀取額外的機櫃配置
  try {
    const customCabinets = localStorage.getItem('custom-cabinets');
    if (customCabinets) {
      const parsed = JSON.parse(customCabinets);
      return [...baseCabinets, ...parsed];
    }
  } catch (error) {
    console.warn('Failed to load custom cabinets:', error);
  }

  return baseCabinets;
};

export function CabinetSelectionManager({ currentCabinetId, onCabinetChange }: CabinetSelectionManagerProps) {
  const [cabinets, setCabinets] = useState<CabinetInfo[]>(getAvailableCabinets);
  const [showAddForm, setShowAddForm] = useState(false);
  
  const currentCabinet = cabinets.find(c => c.id === currentCabinetId);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-success text-success-foreground';
      case 'maintenance': return 'bg-warning text-warning-foreground';
      case 'planning': return 'bg-info text-info-foreground';
      case 'offline': return 'bg-muted text-muted-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active': return '運行中';
      case 'maintenance': return '維護中';
      case 'planning': return '規劃中';
      case 'offline': return '離線';
      default: return '未知';
    }
  };

  // 未來可擴展的添加機櫃功能
  const handleAddCabinet = () => {
    // 這裡可以實現添加新機櫃的邏輯
    setShowAddForm(true);
  };

  return (
    <div className="space-y-6">
      {/* 機櫃選擇器 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building className="h-5 w-5" />
            機櫃選擇管理
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">當前機櫃：</span>
              <Select value={currentCabinetId} onValueChange={onCabinetChange}>
                <SelectTrigger className="w-[240px]">
                  <SelectValue placeholder="選擇機櫃" />
                </SelectTrigger>
                <SelectContent>
                  {cabinets.map((cabinet) => (
                    <SelectItem key={cabinet.id} value={cabinet.id}>
                      <div className="flex items-center gap-2">
                        <span>{cabinet.name}</span>
                        <Badge variant="outline" className={getStatusColor(cabinet.status)}>
                          {getStatusText(cabinet.status)}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {currentCabinet && (
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>{currentCabinet.location}</span>
                <span>型號: {currentCabinet.model}</span>
                <span>配置進度: {currentCabinet.configuredComponents}/{currentCabinet.totalComponents}</span>
              </div>
            )}
            
            <div className="flex gap-2 ml-auto">
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleAddCabinet}
                className="flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                新增機櫃
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 機櫃概覽統計 */}
      {currentCabinet && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 bg-primary rounded-full" />
                <span className="text-sm font-medium">總系統數</span>
              </div>
              <div className="text-2xl font-bold mt-1">{currentCabinet.totalSystems}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 bg-success rounded-full" />
                <span className="text-sm font-medium">已完成</span>
              </div>
              <div className="text-2xl font-bold mt-1">{currentCabinet.completedSystems}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 bg-warning rounded-full" />
                <span className="text-sm font-medium">配置組件</span>
              </div>
              <div className="text-2xl font-bold mt-1">{currentCabinet.configuredComponents}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 bg-info rounded-full" />
                <span className="text-sm font-medium">負責工程師</span>
              </div>
              <div className="text-2xl font-bold mt-1">{currentCabinet.assignedEngineers.length}</div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}