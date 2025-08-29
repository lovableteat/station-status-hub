import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Minus, RotateCcw, Settings, Palette } from 'lucide-react';

export interface ComponentConfig {
  count: number;
  color: string;
  serialNumbers: string[];
}

export interface CabinetConfig {
  topOfRackSwitch: ComponentConfig;
  topPowerSupplies: ComponentConfig;
  computeTrays1: ComponentConfig;
  switchTrays: ComponentConfig;
  computeTrays2: ComponentConfig;
  bottomPowerSupplies: ComponentConfig;
}

interface CabinetConfiguratorProps {
  config: CabinetConfig;
  onConfigChange: (config: CabinetConfig) => void;
}

const colorOptions = [
  { value: '#3b82f6', label: '藍色', className: 'bg-blue-500' },
  { value: '#10b981', label: '綠色', className: 'bg-emerald-500' },
  { value: '#f59e0b', label: '橙色', className: 'bg-amber-500' },
  { value: '#ef4444', label: '紅色', className: 'bg-red-500' },
  { value: '#8b5cf6', label: '紫色', className: 'bg-violet-500' },
  { value: '#6b7280', label: '灰色', className: 'bg-gray-500' },
];

export function CabinetConfigurator({ config, onConfigChange }: CabinetConfiguratorProps) {
  const [activeTab, setActiveTab] = useState('count');

  const updateComponentCount = (key: keyof CabinetConfig, count: number) => {
    const newCount = Math.max(0, Math.min(20, count));
    const component = config[key];
    
    // Adjust serial numbers array based on new count
    let newSerialNumbers = [...component.serialNumbers];
    if (newCount > newSerialNumbers.length) {
      // Add new serial numbers
      for (let i = newSerialNumbers.length; i < newCount; i++) {
        newSerialNumbers.push(`${key.toUpperCase()}-${String(i + 1).padStart(3, '0')}`);
      }
    } else if (newCount < newSerialNumbers.length) {
      // Remove excess serial numbers
      newSerialNumbers = newSerialNumbers.slice(0, newCount);
    }

    onConfigChange({
      ...config,
      [key]: {
        ...component,
        count: newCount,
        serialNumbers: newSerialNumbers
      }
    });
  };

  const updateComponentColor = (key: keyof CabinetConfig, color: string) => {
    onConfigChange({
      ...config,
      [key]: {
        ...config[key],
        color
      }
    });
  };

  const updateSerialNumber = (key: keyof CabinetConfig, index: number, serialNumber: string) => {
    const component = config[key];
    const newSerialNumbers = [...component.serialNumbers];
    newSerialNumbers[index] = serialNumber;

    onConfigChange({
      ...config,
      [key]: {
        ...component,
        serialNumbers: newSerialNumbers
      }
    });
  };

  const resetToDefault = () => {
    onConfigChange({
      topOfRackSwitch: { 
        count: 1, 
        color: '#3b82f6', 
        serialNumbers: ['TOR-001'] 
      },
      topPowerSupplies: { 
        count: 1, 
        color: '#f59e0b', 
        serialNumbers: ['PSU-001'] 
      },
      computeTrays1: { 
        count: 10, 
        color: '#10b981', 
        serialNumbers: Array.from({length: 10}, (_, i) => `CT1-${String(i + 1).padStart(3, '0')}`) 
      },
      switchTrays: { 
        count: 9, 
        color: '#3b82f6', 
        serialNumbers: Array.from({length: 9}, (_, i) => `SW-${String(i + 1).padStart(3, '0')}`) 
      },
      computeTrays2: { 
        count: 8, 
        color: '#10b981', 
        serialNumbers: Array.from({length: 8}, (_, i) => `CT2-${String(i + 1).padStart(3, '0')}`) 
      },
      bottomPowerSupplies: { 
        count: 1, 
        color: '#f59e0b', 
        serialNumbers: ['PSU-002'] 
      }
    });
  };

  const configItems = [
    { key: 'topOfRackSwitch', label: 'Top Of Rack Switch', max: 3 },
    { key: 'topPowerSupplies', label: 'Power Supplies (上)', max: 2 },
    { key: 'computeTrays1', label: '10 Compute Trays', max: 15 },
    { key: 'switchTrays', label: '9 Switch Trays', max: 12 },
    { key: 'computeTrays2', label: '8 Compute Trays', max: 15 },
    { key: 'bottomPowerSupplies', label: 'Power Supplies (下)', max: 2 }
  ];

  const totalComponents = Object.values(config).reduce((sum, comp) => sum + comp.count, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>機櫃組態設定</CardTitle>
          <Button variant="outline" size="sm" onClick={resetToDefault}>
            <RotateCcw className="h-4 w-4 mr-2" />
            重置預設
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="count" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              數量
            </TabsTrigger>
            <TabsTrigger value="color" className="flex items-center gap-2">
              <Palette className="h-4 w-4" />
              顏色
            </TabsTrigger>
            <TabsTrigger value="serial" className="flex items-center gap-2">
              <Badge className="h-4 w-4" />
              SN碼
            </TabsTrigger>
          </TabsList>

          <TabsContent value="count" className="space-y-4">
            <div className="grid gap-4">
              {configItems.map((item) => {
                const component = config[item.key as keyof CabinetConfig];
                return (
                  <div key={item.key} className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <div 
                        className="h-3 w-3 rounded" 
                        style={{ backgroundColor: component.color }}
                      />
                      {item.label}
                    </Label>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateComponentCount(item.key as keyof CabinetConfig, component.count - 1)}
                        disabled={component.count <= 0}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <Input
                        type="number"
                        value={component.count}
                        onChange={(e) => updateComponentCount(item.key as keyof CabinetConfig, parseInt(e.target.value) || 0)}
                        className="w-16 text-center"
                        min="0"
                        max={item.max}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateComponentCount(item.key as keyof CabinetConfig, component.count + 1)}
                        disabled={component.count >= item.max}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="color" className="space-y-4">
            <div className="grid gap-4">
              {configItems.map((item) => {
                const component = config[item.key as keyof CabinetConfig];
                return (
                  <div key={item.key} className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <div 
                        className="h-3 w-3 rounded" 
                        style={{ backgroundColor: component.color }}
                      />
                      {item.label}
                    </Label>
                    <Select
                      value={component.color}
                      onValueChange={(color) => updateComponentColor(item.key as keyof CabinetConfig, color)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {colorOptions.map((color) => (
                          <SelectItem key={color.value} value={color.value}>
                            <div className="flex items-center gap-2">
                              <div className={`h-3 w-3 rounded ${color.className}`} />
                              {color.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="serial" className="space-y-4">
            <div className="grid gap-4">
              {configItems.map((item) => {
                const component = config[item.key as keyof CabinetConfig];
                return (
                  <div key={item.key} className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <div 
                        className="h-3 w-3 rounded" 
                        style={{ backgroundColor: component.color }}
                      />
                      {item.label} ({component.count} 個)
                    </Label>
                    <div className="grid gap-2 max-h-32 overflow-y-auto">
                      {component.serialNumbers.map((sn, index) => (
                        <Input
                          key={index}
                          value={sn}
                          onChange={(e) => updateSerialNumber(item.key as keyof CabinetConfig, index, e.target.value)}
                          placeholder={`SN #${index + 1}`}
                          className="text-sm"
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
        
        <div className="pt-4 border-t">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">總組件數</span>
            <Badge variant="secondary">{totalComponents}</Badge>
          </div>
        </div>

        <div className="pt-2">
          <h4 className="font-semibold mb-2 text-sm">配置說明</h4>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>• 根據實際機櫃架構設計</li>
            <li>• 可調整數量、顏色和SN碼</li>
            <li>• 3D視圖即時更新</li>
            <li>• 每種組件都有數量限制</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}