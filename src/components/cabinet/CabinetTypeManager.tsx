import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Monitor, Wrench, Activity } from 'lucide-react';

// 機櫃型號配置介面
export interface CabinetTypeConfig {
  id: string;
  name: string;
  model: string;
  description: string;
  maxUnits: number;
  powerRequirements: string;
  dimensions: {
    width: number;
    height: number;
    depth: number;
  };
  defaultComponents: {
    [key: string]: {
      count: number;
      color: string;
      height: number;
      position: 'top' | 'middle' | 'bottom';
    };
  };
  status: 'active' | 'development' | 'deprecated';
}

// 預定義的機櫃型號配置
const CABINET_TYPE_CONFIGS: CabinetTypeConfig[] = [
  {
    id: 'l11',
    name: 'L11 GPU 機櫃',
    model: 'L11',
    description: '高性能 GPU 計算機櫃，適用於 AI 訓練工作負載',
    maxUnits: 42,
    powerRequirements: '20kW',
    dimensions: { width: 600, height: 2000, depth: 1200 },
    defaultComponents: {
      topOfRackSwitch: { count: 2, color: '#d97706', height: 0.25, position: 'top' },
      topPowerSupplies: { count: 2, color: '#d97706', height: 0.3, position: 'top' },
      computeTrays1: { count: 10, color: '#059669', height: 0.2, position: 'middle' },
      switchTrays: { count: 3, color: '#2563eb', height: 0.25, position: 'middle' },
      computeTrays2: { count: 8, color: '#059669', height: 0.2, position: 'middle' },
      bottomPowerSupplies: { count: 2, color: '#d97706', height: 0.3, position: 'bottom' },
      srcUnits: { count: 2, color: '#7c3aed', height: 0.25, position: 'bottom' }
    },
    status: 'active'
  },
  {
    id: 'l12',
    name: 'L12 存儲機櫃',
    model: 'L12',
    description: '大容量存儲機櫃，專為資料中心設計',
    maxUnits: 42,
    powerRequirements: '8kW',
    dimensions: { width: 600, height: 2000, depth: 1000 },
    defaultComponents: {
      topOfRackSwitch: { count: 1, color: '#d97706', height: 0.25, position: 'top' },
      storageTrays: { count: 24, color: '#dc2626', height: 0.15, position: 'middle' },
      powerSupplies: { count: 4, color: '#d97706', height: 0.3, position: 'bottom' },
      managementUnit: { count: 1, color: '#7c3aed', height: 0.25, position: 'bottom' }
    },
    status: 'development'
  },
  {
    id: 'l13',
    name: 'L13 網路機櫃',
    model: 'L13',
    description: '網路交換機櫃，用於資料中心互聯',
    maxUnits: 42,
    powerRequirements: '5kW',
    dimensions: { width: 600, height: 2000, depth: 800 },
    defaultComponents: {
      coreSwitch: { count: 2, color: '#2563eb', height: 0.3, position: 'top' },
      accessSwitches: { count: 12, color: '#2563eb', height: 0.2, position: 'middle' },
      patchPanels: { count: 8, color: '#64748b', height: 0.1, position: 'middle' },
      powerSupplies: { count: 2, color: '#d97706', height: 0.3, position: 'bottom' }
    },
    status: 'development'
  }
];

interface CabinetTypeManagerProps {
  onSelectCabinetType: (config: CabinetTypeConfig) => void;
  currentTypeId?: string;
}

export function CabinetTypeManager({ onSelectCabinetType, currentTypeId }: CabinetTypeManagerProps) {
  const [selectedType, setSelectedType] = useState<string>(currentTypeId || 'l11');

  const handleTypeChange = (typeId: string) => {
    setSelectedType(typeId);
    const config = CABINET_TYPE_CONFIGS.find(c => c.id === typeId);
    if (config) {
      onSelectCabinetType(config);
    }
  };

  const getStatusColor = (status: CabinetTypeConfig['status']) => {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'development': return 'bg-yellow-500';
      case 'deprecated': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusText = (status: CabinetTypeConfig['status']) => {
    switch (status) {
      case 'active': return '生產中';
      case 'development': return '開發中';
      case 'deprecated': return '已棄用';
      default: return '未知';
    }
  };

  const currentConfig = CABINET_TYPE_CONFIGS.find(c => c.id === selectedType);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Monitor className="h-5 w-5" />
          機櫃型號管理
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 型號選擇器 */}
        <div className="space-y-2">
          <label className="text-sm font-medium">選擇機櫃型號</label>
          <Select value={selectedType} onValueChange={handleTypeChange}>
            <SelectTrigger>
              <SelectValue placeholder="選擇機櫃型號" />
            </SelectTrigger>
            <SelectContent>
              {CABINET_TYPE_CONFIGS.map((config) => (
                <SelectItem key={config.id} value={config.id}>
                  <div className="flex items-center gap-2">
                    <span>{config.name} ({config.model})</span>
                    <Badge 
                      variant="secondary" 
                      className={`text-xs ${getStatusColor(config.status)} text-white`}
                    >
                      {getStatusText(config.status)}
                    </Badge>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 當前型號詳情 */}
        {currentConfig && (
          <div className="bg-muted/50 p-4 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold">{currentConfig.name}</h4>
              <Badge className={getStatusColor(currentConfig.status)}>
                {getStatusText(currentConfig.status)}
              </Badge>
            </div>
            
            <p className="text-sm text-muted-foreground">{currentConfig.description}</p>
            
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium">最大單位數:</span> {currentConfig.maxUnits}U
              </div>
              <div>
                <span className="font-medium">功率需求:</span> {currentConfig.powerRequirements}
              </div>
              <div>
                <span className="font-medium">尺寸:</span> {currentConfig.dimensions.width}×{currentConfig.dimensions.height}×{currentConfig.dimensions.depth}mm
              </div>
              <div>
                <span className="font-medium">組件類型:</span> {Object.keys(currentConfig.defaultComponents).length} 種
              </div>
            </div>

            {/* 組件概覽 */}
            <div className="space-y-2">
              <h5 className="text-sm font-medium">預設組件配置</h5>
              <div className="grid grid-cols-1 gap-1 text-xs">
                {Object.entries(currentConfig.defaultComponents).map(([key, component]) => (
                  <div key={key} className="flex items-center justify-between p-2 bg-background rounded">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded" 
                        style={{ backgroundColor: component.color }}
                      />
                      <span className="capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                    </div>
                    <span className="text-muted-foreground">{component.count} 個</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 操作按鈕 */}
        <div className="flex gap-2 pt-2">
          <Button variant="outline" size="sm" className="flex-1">
            <Wrench className="h-4 w-4 mr-2" />
            自定義配置
          </Button>
          <Button variant="outline" size="sm" className="flex-1">
            <Plus className="h-4 w-4 mr-2" />
            新增型號
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// 導出配置供其他組件使用
export { CABINET_TYPE_CONFIGS };