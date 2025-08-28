
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, Minus, RotateCcw } from 'lucide-react';

export interface CabinetConfig {
  topSwitches: number;
  powerSupplies: number;
  computeTrays1: number;
  switchTrays: number;
  computeTrays2: number;
  bottomPowerSupplies: number;
}

interface CabinetConfiguratorProps {
  config: CabinetConfig;
  onConfigChange: (config: CabinetConfig) => void;
}

export function CabinetConfigurator({ config, onConfigChange }: CabinetConfiguratorProps) {
  const updateConfig = (key: keyof CabinetConfig, value: number) => {
    const newValue = Math.max(0, Math.min(20, value)); // Limit between 0-20
    onConfigChange({
      ...config,
      [key]: newValue
    });
  };

  const resetToDefault = () => {
    onConfigChange({
      topSwitches: 1,
      powerSupplies: 1,
      computeTrays1: 10,
      switchTrays: 9,
      computeTrays2: 8,
      bottomPowerSupplies: 1
    });
  };

  const configItems = [
    { key: 'topSwitches', label: '頂部交換機', color: 'bg-blue-500', max: 3 },
    { key: 'powerSupplies', label: '上電源供應', color: 'bg-amber-500', max: 2 },
    { key: 'computeTrays1', label: '運算托盤組1', color: 'bg-emerald-500', max: 15 },
    { key: 'switchTrays', label: '交換機托盤', color: 'bg-blue-500', max: 12 },
    { key: 'computeTrays2', label: '運算托盤組2', color: 'bg-emerald-500', max: 15 },
    { key: 'bottomPowerSupplies', label: '底部電源供應', color: 'bg-amber-500', max: 2 }
  ];

  const totalComponents = Object.values(config).reduce((sum, count) => sum + count, 0);

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
        <div className="grid gap-4">
          {configItems.map((item) => (
            <div key={item.key} className="space-y-2">
              <Label className="flex items-center gap-2">
                <div className={`h-3 w-3 rounded ${item.color}`} />
                {item.label}
              </Label>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => updateConfig(item.key as keyof CabinetConfig, config[item.key as keyof CabinetConfig] - 1)}
                  disabled={config[item.key as keyof CabinetConfig] <= 0}
                >
                  <Minus className="h-3 w-3" />
                </Button>
                <Input
                  type="number"
                  value={config[item.key as keyof CabinetConfig]}
                  onChange={(e) => updateConfig(item.key as keyof CabinetConfig, parseInt(e.target.value) || 0)}
                  className="w-16 text-center"
                  min="0"
                  max={item.max}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => updateConfig(item.key as keyof CabinetConfig, config[item.key as keyof CabinetConfig] + 1)}
                  disabled={config[item.key as keyof CabinetConfig] >= item.max}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
        
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
            <li>• 可動態調整各組件數量</li>
            <li>• 3D視圖即時更新</li>
            <li>• 每種組件都有數量限制</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
