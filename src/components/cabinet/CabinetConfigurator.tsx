import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Minus, RotateCcw, Settings, Palette, Monitor, Info } from 'lucide-react';
import { useUnifiedData } from '@/hooks/useUnifiedData';

export interface ComponentConfig {
  count: number;
  color: string;
}

export interface CabinetConfig {
  topOfRackSwitch: ComponentConfig;
  topPowerSupplies: ComponentConfig;
  computeTrays1: ComponentConfig;
  switchTrays: ComponentConfig;
  computeTrays2: ComponentConfig;
  bottomPowerSupplies: ComponentConfig;
  srcUnits: ComponentConfig;
}


const colorOptions = [
  { value: '#3b82f6', label: '藍色', className: 'bg-blue-500' },
  { value: '#10b981', label: '綠色', className: 'bg-emerald-500' },
  { value: '#f59e0b', label: '橙色', className: 'bg-amber-500' },
  { value: '#ef4444', label: '紅色', className: 'bg-red-500' },
  { value: '#8b5cf6', label: '紫色', className: 'bg-violet-500' },
  { value: '#6b7280', label: '灰色', className: 'bg-gray-500' },
];

export function CabinetConfigurator({ config, onConfigChange, cabinetId }: { 
  config: CabinetConfig; 
  onConfigChange: (config: CabinetConfig) => void;
  cabinetId?: string;
}) {
  const [activeTab, setActiveTab] = useState(() => {
    const saved = localStorage.getItem('l11-cabinet-activeTab');
    return saved || 'count';
  });
  const [showSystemSelector, setShowSystemSelector] = useState(false);
  const [selectedSystemDetails, setSelectedSystemDetails] = useState<any>(null);
  
  const { systems } = useUnifiedData();

  // 保存當前Tab狀態
  useEffect(() => {
    localStorage.setItem('l11-cabinet-activeTab', activeTab);
  }, [activeTab]);

  const updateComponentCount = (key: keyof CabinetConfig, count: number) => {
    // Top Of Rack Switch 固定為 2 個
    const newCount = key === 'topOfRackSwitch' ? 2 : Math.max(0, Math.min(20, count));
    
    onConfigChange({
      ...config,
      [key]: {
        ...config[key],
        count: newCount
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


  const showSystemDetails = (system: any) => {
    setSelectedSystemDetails(system);
  };

  const resetToDefault = () => {
    onConfigChange({
      topOfRackSwitch: { 
        count: 2, 
        color: '#d97706'
      },
      topPowerSupplies: { 
        count: 2, 
        color: '#d97706'
      },
      computeTrays1: { 
        count: 10, 
        color: '#059669'
      },
      switchTrays: { 
        count: 3, 
        color: '#2563eb'
      },
      computeTrays2: { 
        count: 8, 
        color: '#059669'
      },
      bottomPowerSupplies: { 
        count: 2, 
        color: '#d97706'
      },
      srcUnits: { 
        count: 2, 
        color: '#7c3aed'
      }
    });
  };

  const configItems = [
    { key: 'topOfRackSwitch', label: 'Top Of Rack Switch (兩層設計)', max: 2 },
    { key: 'topPowerSupplies', label: 'Power Supplies (上)', max: 4 },
    { key: 'computeTrays1', label: '10 Compute Trays', max: 15 },
    { key: 'switchTrays', label: '3 Switch Trays', max: 6 },
    { key: 'computeTrays2', label: '8 Compute Trays', max: 15 },
    { key: 'bottomPowerSupplies', label: 'Power Supplies (下)', max: 4 },
    { key: 'srcUnits', label: 'SRC Units', max: 5 }
  ];

  const totalComponents = Object.values(config).reduce((sum, comp) => sum + comp.count, 0);

  return (
    <Card className="bg-slate-900 border-slate-700">
      <CardHeader className="bg-slate-800 border-b border-slate-700">
        <div className="flex items-center justify-between">
          <CardTitle className="text-slate-100">機櫃組態設定</CardTitle>
          <Button variant="outline" size="sm" onClick={resetToDefault} className="border-slate-600 text-slate-200 hover:bg-slate-700">
            <RotateCcw className="h-4 w-4 mr-2" />
            重置預設
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 bg-slate-900">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-slate-800 border-slate-600">
            <TabsTrigger value="count" className="flex items-center gap-2 text-slate-200 data-[state=active]:bg-slate-700 data-[state=active]:text-white">
              <Settings className="h-4 w-4" />
              數量
            </TabsTrigger>
            <TabsTrigger value="color" className="flex items-center gap-2 text-slate-200 data-[state=active]:bg-slate-700 data-[state=active]:text-white">
              <Palette className="h-4 w-4" />
              顏色
            </TabsTrigger>
            <TabsTrigger value="systems" className="flex items-center gap-2 text-slate-200 data-[state=active]:bg-slate-700 data-[state=active]:text-white">
              <Monitor className="h-4 w-4" />
              系統清單
            </TabsTrigger>
          </TabsList>

          <TabsContent value="count" className="space-y-4 mt-4">
            <div className="grid gap-4">
              {configItems.map((item) => {
                const component = config[item.key as keyof CabinetConfig];
                return (
                  <div key={item.key} className="space-y-2">
                    <Label className="flex items-center gap-2 text-slate-200">
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
                          disabled={component.count <= 0 || (item.key === 'topOfRackSwitch' && component.count <= 2)}
                          className="border-slate-600 text-slate-200 hover:bg-slate-700"
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <Input
                          type="number"
                          value={component.count}
                          onChange={(e) => updateComponentCount(item.key as keyof CabinetConfig, parseInt(e.target.value) || 0)}
                          className="w-16 text-center bg-slate-800 border-slate-600 text-slate-100"
                          min={item.key === 'topOfRackSwitch' ? "2" : "0"}
                          max={item.max}
                          disabled={item.key === 'topOfRackSwitch'}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateComponentCount(item.key as keyof CabinetConfig, component.count + 1)}
                          disabled={component.count >= item.max || (item.key === 'topOfRackSwitch' && component.count >= 2)}
                          className="border-slate-600 text-slate-200 hover:bg-slate-700"
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="color" className="space-y-4 mt-4">
            <div className="grid gap-4">
              {configItems.map((item) => {
                const component = config[item.key as keyof CabinetConfig];
                return (
                  <div key={item.key} className="space-y-2">
                    <Label className="flex items-center gap-2 text-slate-200">
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
                      <SelectTrigger className="w-full bg-slate-800 border-slate-600 text-slate-100">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-600">
                        {colorOptions.map((color) => (
                          <SelectItem key={color.value} value={color.value} className="text-slate-100 hover:bg-slate-700">
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


          <TabsContent value="systems" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label className="text-slate-200">可用系統清單 ({systems.filter(system => {
                // 檢查系統是否已被分配到其他機櫃
                const allocationsKey = `global-system-allocations`;
                const savedAllocations = localStorage.getItem(allocationsKey);
                const allocations = savedAllocations ? JSON.parse(savedAllocations) : [];
                const allocation = allocations.find((a: any) => a.systemId === system.id);
                return !allocation; // 只顯示未分配的系統
              }).length} 台可選)</Label>
              <div className="text-xs text-yellow-200 bg-yellow-900/30 border border-yellow-700 p-2 rounded">
                注意：已分配到機櫃的機台將不會顯示在此清單中，以避免重複分配
              </div>
              <div className="grid gap-2 max-h-64 overflow-y-auto border border-slate-600 rounded-md p-2 bg-slate-800">
                {systems
                  .filter(system => {
                    // 過濾掉已分配到其他機櫃的系統
                    const allocationsKey = `global-system-allocations`;
                    const savedAllocations = localStorage.getItem(allocationsKey);
                    const allocations = savedAllocations ? JSON.parse(savedAllocations) : [];
                    const allocation = allocations.find((a: any) => a.systemId === system.id);
                    return !allocation;
                  })
                  .map((system) => (
                  <div 
                    key={system.id} 
                    className="flex items-center justify-between p-2 hover:bg-slate-700 rounded-md cursor-pointer border border-slate-600 bg-emerald-900/30"
                    onClick={() => showSystemDetails(system)}
                  >
                    <div className="flex-1">
                      <div className="font-medium text-sm flex items-center gap-2 text-slate-100">
                        <div className="h-2 w-2 bg-green-400 rounded-full"></div>
                        {system.system_name}
                      </div>
                      <div className="text-xs text-slate-300">
                        SN: {system.serial_number || '未設定'} | 型號: {system.model || 'GB300'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs border-green-400 text-green-300 bg-green-900/30">
                        可選用
                      </Badge>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-slate-300 hover:bg-slate-600"
                        onClick={(e) => {
                          e.stopPropagation();
                          showSystemDetails(system);
                        }}
                      >
                        <Info className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
                {systems.filter(system => {
                  const allocationsKey = `global-system-allocations`;
                  const savedAllocations = localStorage.getItem(allocationsKey);
                  const allocations = savedAllocations ? JSON.parse(savedAllocations) : [];
                  const allocation = allocations.find((a: any) => a.systemId === system.id);
                  return !allocation;
                }).length === 0 && (
                  <div className="text-center py-4 text-slate-400 text-sm">
                    所有系統都已分配到機櫃中
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
        
        <div className="pt-4 border-t border-slate-600">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-200">總組件配置數</span>
            <Badge variant="secondary" className="bg-slate-700 text-slate-200">{totalComponents}</Badge>
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-sm font-medium text-slate-200">已分配機台數</span>
            <Badge variant="default" className="bg-blue-600">
              {(() => {
                // 從localStorage讀取當前機櫃的分配情況
                const allocationsKey = `global-system-allocations`;
                const savedAllocations = localStorage.getItem(allocationsKey);
                const allocations = savedAllocations ? JSON.parse(savedAllocations) : [];
                const currentCabinetAllocations = allocations.filter((a: any) => 
                  a.cabinetId === (cabinetId || 'default')
                );
                return currentCabinetAllocations.length;
              })()}
            </Badge>
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-sm text-slate-300">配置進度</span>
            <Badge variant="outline" className="border-slate-600 text-slate-200">
              {(() => {
                const allocationsKey = `global-system-allocations`;
                const savedAllocations = localStorage.getItem(allocationsKey);
                const allocations = savedAllocations ? JSON.parse(savedAllocations) : [];
                const currentCabinetAllocations = allocations.filter((a: any) => 
                  a.cabinetId === (cabinetId || 'default')
                );
                const progress = Math.min(100, Math.round((currentCabinetAllocations.length / totalComponents) * 100));
                return `${progress}%`;
              })()}
            </Badge>
          </div>
        </div>

        <div className="pt-2">
          <h4 className="font-semibold mb-2 text-sm text-slate-200">配置說明</h4>
            <ul className="text-xs text-slate-400 space-y-1">
            <li>• 根據實際機櫃架構設計</li>
            <li>• 可調整數量和顏色</li>
            <li>• 3D視圖即時更新</li>
            <li>• 每種組件都有數量限制</li>
            <li>• SN碼統一在機櫃組裝清單中設定</li>
          </ul>
        </div>
      </CardContent>

      {/* System Selection Dialog */}
      <Dialog open={showSystemSelector} onOpenChange={setShowSystemSelector}>
        <DialogContent className="max-w-2xl bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-slate-100">選擇系統</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 max-h-96 overflow-y-auto">
            {systems.map((system) => (
              <div 
                key={system.id}
                className="flex items-center justify-between p-3 hover:bg-slate-700 rounded-md cursor-pointer border border-slate-600 bg-slate-800"
                onClick={() => showSystemDetails(system)}
              >
                <div className="flex-1">
                  <div className="font-medium text-slate-100">{system.system_name}</div>
                  <div className="text-sm text-slate-300">
                    序列號: {system.serial_number || '未設定'} | 型號: {system.model || 'GB300'}
                  </div>
                  <div className="text-xs text-slate-400">
                    負責工程師: {system.assigned_engineer || '未分配'} | 當前站點: {system.current_station}
                  </div>
                </div>
                <Badge variant={system.status === '已完成' ? 'default' : 'secondary'} className="bg-slate-700 text-slate-200">
                  {system.status}
                </Badge>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* System Details Dialog */}
      <Dialog open={!!selectedSystemDetails} onOpenChange={() => setSelectedSystemDetails(null)}>
        <DialogContent className="max-w-2xl bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-slate-100">系統詳細資料</DialogTitle>
          </DialogHeader>
          {selectedSystemDetails && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-slate-200">系統名稱</Label>
                  <div className="text-sm text-slate-100">{selectedSystemDetails.system_name}</div>
                </div>
                <div>
                  <Label className="text-sm font-medium text-slate-200">序列號</Label>
                  <div className="text-sm text-slate-100">{selectedSystemDetails.serial_number || '未設定'}</div>
                </div>
                <div>
                  <Label className="text-sm font-medium text-slate-200">型號</Label>
                  <div className="text-sm text-slate-100">{selectedSystemDetails.model || 'GB300'}</div>
                </div>
                <div>
                  <Label className="text-sm font-medium text-slate-200">狀態</Label>
                  <Badge variant={selectedSystemDetails.status === '已完成' ? 'default' : 'secondary'} className="bg-slate-700 text-slate-200">
                    {selectedSystemDetails.status}
                  </Badge>
                </div>
                <div>
                  <Label className="text-sm font-medium text-slate-200">當前站點</Label>
                  <div className="text-sm text-slate-100">{selectedSystemDetails.current_station}</div>
                </div>
                <div>
                  <Label className="text-sm font-medium text-slate-200">整體進度</Label>
                  <div className="text-sm text-slate-100">{selectedSystemDetails.overall_progress || 0}%</div>
                </div>
                <div>
                  <Label className="text-sm font-medium text-slate-200">負責工程師</Label>
                  <div className="text-sm text-slate-100">{selectedSystemDetails.assigned_engineer || '未分配'}</div>
                </div>
                <div>
                  <Label className="text-sm font-medium text-slate-200">Ubuntu版本</Label>
                  <div className="text-sm text-slate-100">{selectedSystemDetails.ubuntu_version || '未設定'}</div>
                </div>
                <div>
                  <Label className="text-sm font-medium text-slate-200">CUDA版本</Label>
                  <div className="text-sm text-slate-100">{selectedSystemDetails.cuda_version || '未設定'}</div>
                </div>
                <div>
                  <Label className="text-sm font-medium text-slate-200">開始時間</Label>
                  <div className="text-sm text-slate-100">
                    {selectedSystemDetails.actual_started_at 
                      ? new Date(selectedSystemDetails.actual_started_at).toLocaleString('zh-TW')
                      : '未開始'
                    }
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium text-slate-200">完成時間</Label>
                  <div className="text-sm text-slate-100">
                    {selectedSystemDetails.actual_completed_at 
                      ? new Date(selectedSystemDetails.actual_completed_at).toLocaleString('zh-TW')
                      : '未完成'
                    }
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}