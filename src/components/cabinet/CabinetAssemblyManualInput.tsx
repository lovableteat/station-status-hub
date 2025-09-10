import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Edit2, Save, X } from 'lucide-react';

interface ManualComponentData {
  serialNumber: string;
  macAddress: string;
}

interface ManualInputProps {
  componentType: string;
  componentName: string;
  count: number;
  color: string;
  cabinetId: string;
  onDataChange?: (data: ManualComponentData[]) => void;
}

export function CabinetAssemblyManualInput({ 
  componentType, 
  componentName, 
  count, 
  color, 
  cabinetId,
  onDataChange 
}: ManualInputProps) {
  const [componentData, setComponentData] = useState<ManualComponentData[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [tempData, setTempData] = useState<ManualComponentData>({ serialNumber: '', macAddress: '' });

  // 從localStorage載入數據
  useEffect(() => {
    const storageKey = `cabinet-manual-${cabinetId}-${componentType}`;
    const savedData = localStorage.getItem(storageKey);
    if (savedData) {
      const parsed = JSON.parse(savedData);
      setComponentData(parsed);
    } else {
      // 初始化空數據
      const initialData = Array.from({ length: count }, (_, index) => ({
        serialNumber: `${componentType.toUpperCase()}-${String(index + 1).padStart(3, '0')}`,
        macAddress: ''
      }));
      setComponentData(initialData);
    }
  }, [cabinetId, componentType, count]);

  // 當數據改變時保存到localStorage並通知父組件
  useEffect(() => {
    if (componentData.length > 0) {
      const storageKey = `cabinet-manual-${cabinetId}-${componentType}`;
      localStorage.setItem(storageKey, JSON.stringify(componentData));
      onDataChange?.(componentData);
    }
  }, [componentData, cabinetId, componentType, onDataChange]);

  const handleEdit = (index: number) => {
    setEditingIndex(index);
    setTempData(componentData[index]);
  };

  const handleSave = () => {
    if (editingIndex !== null) {
      const newData = [...componentData];
      newData[editingIndex] = tempData;
      setComponentData(newData);
      setEditingIndex(null);
      setTempData({ serialNumber: '', macAddress: '' });
    }
  };

  const handleCancel = () => {
    setEditingIndex(null);
    setTempData({ serialNumber: '', macAddress: '' });
  };

  const getConfiguredCount = () => {
    return componentData.filter(item => item.serialNumber && item.macAddress).length;
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <div className="h-4 w-4 rounded" style={{ backgroundColor: color }}></div>
        <h4 className="font-medium">{componentName} ({count} 個)</h4>
        <Badge variant="outline">
          {getConfiguredCount()} / {count} 已配置
        </Badge>
      </div>
      <div className="pl-7">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {componentData.slice(0, count).map((item, index) => (
            <div 
              key={index} 
              className={`p-3 rounded border transition-colors ${
                item.serialNumber && item.macAddress 
                  ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800' 
                  : 'bg-gray-50 dark:bg-gray-950 border-gray-200 dark:border-gray-800'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium text-sm">#{index + 1}</div>
                {editingIndex === index ? (
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleSave}
                      disabled={!tempData.serialNumber || !tempData.macAddress}
                    >
                      <Save className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={handleCancel}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(index)}>
                    <Edit2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
              
              {editingIndex === index ? (
                <div className="space-y-2">
                  <div>
                    <Label className="text-xs">SN碼</Label>
                    <Input
                      value={tempData.serialNumber}
                      onChange={(e) => setTempData(prev => ({ ...prev, serialNumber: e.target.value }))}
                      placeholder="輸入序列號"
                      className="h-7 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">MAC地址</Label>
                    <Input
                      value={tempData.macAddress}
                      onChange={(e) => setTempData(prev => ({ ...prev, macAddress: e.target.value }))}
                      placeholder="輸入MAC地址"
                      className="h-7 text-xs font-mono"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <div>
                    <div className="text-xs text-muted-foreground">SN碼:</div>
                    <div className="text-xs font-mono font-medium">
                      {item.serialNumber || '未設定'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">MAC地址:</div>
                    <div className="text-xs font-mono font-medium">
                      {item.macAddress || '未設定'}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}