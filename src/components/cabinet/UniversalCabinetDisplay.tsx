import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CabinetTypeConfig, CABINET_TYPE_CONFIGS } from './CabinetTypeManager';
import { CabinetInstanceManager, CabinetInstance } from './CabinetInstanceManager';
import { L11CabinetDisplay } from './L11CabinetDisplay';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

interface UniversalCabinetDisplayProps {
  initialCabinetType?: string;
  initialCabinetId?: string;
}

// 未來的機櫃顯示組件（目前僅為佔位符）
function L12CabinetDisplay() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          L12 存儲機櫃展示
          <Badge variant="secondary">開發中</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-96 flex items-center justify-center border-2 border-dashed border-muted-foreground/25 rounded-lg">
          <div className="text-center space-y-2">
            <p className="text-muted-foreground">L12 機櫃 3D 展示</p>
            <p className="text-sm text-muted-foreground">開發中 - 敬請期待</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function L13CabinetDisplay() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          L13 網路機櫃展示
          <Badge variant="secondary">開發中</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-96 flex items-center justify-center border-2 border-dashed border-muted-foreground/25 rounded-lg">
          <div className="text-center space-y-2">
            <p className="text-muted-foreground">L13 機櫃 3D 展示</p>
            <p className="text-sm text-muted-foreground">開發中 - 敬請期待</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function UniversalCabinetDisplay({ initialCabinetType = 'l11', initialCabinetId }: UniversalCabinetDisplayProps) {
  const [selectedCabinetType, setSelectedCabinetType] = useState<CabinetTypeConfig>(
    () => CABINET_TYPE_CONFIGS.find(c => c.id === initialCabinetType) || CABINET_TYPE_CONFIGS[0]
  );
  const [selectedCabinetInstance, setSelectedCabinetInstance] = useState<CabinetInstance | null>(null);


  const handleCabinetInstanceSelect = (instance: CabinetInstance) => {
    // 防止重複選擇
    if (selectedCabinetInstance?.id === instance.id) return;
    
    setSelectedCabinetInstance(instance);
    // 根據機櫃實例設定對應的類型
    const typeConfig = CABINET_TYPE_CONFIGS.find(c => c.model === instance.model);
    if (typeConfig && typeConfig.id !== selectedCabinetType.id) {
      setSelectedCabinetType(typeConfig);
    }
  };

  const renderCabinetDisplay = () => {
    // 如果選擇了具體的機櫃實例，傳遞機櫃ID
    const cabinetId = selectedCabinetInstance?.id;
    
    switch (selectedCabinetType.id) {
      case 'l11':
        return (
          <L11CabinetDisplay 
            cabinetId={cabinetId || 'L11-A1'} 
          />
        );
      case 'l12':
        return <L12CabinetDisplay />;
      case 'l13':
        return <L13CabinetDisplay />;
      default:
        return (
          <Card>
            <CardContent className="p-8">
              <div className="text-center space-y-2">
                <p className="text-muted-foreground">未知的機櫃型號</p>
                <Button onClick={() => setSelectedCabinetInstance(null)}>
                  返回機櫃列表
                </Button>
              </div>
            </CardContent>
          </Card>
        );
    }
  };

  // 預設顯示機櫃實例管理頁面
  if (!selectedCabinetInstance) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">機櫃管理中心</h1>
            <p className="text-muted-foreground">管理機櫃實例</p>
          </div>
        </div>

        <CabinetInstanceManager 
          currentCabinetId={selectedCabinetInstance?.id}
          onCabinetSelect={(instance) => {
            setSelectedCabinetInstance(instance);
            const typeConfig = CABINET_TYPE_CONFIGS.find(c => c.model === instance.model);
            if (typeConfig) {
              setSelectedCabinetType(typeConfig);
            }
          }}
        />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* 頂部控制欄 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setSelectedCabinetInstance(null)}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回機櫃列表
          </Button>
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              {selectedCabinetInstance.name}
              <Badge variant={selectedCabinetInstance.status === 'active' ? 'default' : 'secondary'}>
                {selectedCabinetInstance.status === 'active' ? '運行中' : 
                 selectedCabinetInstance.status === 'maintenance' ? '維護中' :
                 selectedCabinetInstance.status === 'offline' ? '離線' : '規劃中'}
              </Badge>
            </h1>
            <p className="text-muted-foreground">
              位置: {selectedCabinetInstance.location}
            </p>
          </div>
        </div>
      </div>

      {/* 機櫃顯示區域 */}
      {renderCabinetDisplay()}
    </div>
  );
}