import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CabinetTypeManager, CabinetTypeConfig, CABINET_TYPE_CONFIGS } from './CabinetTypeManager';
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
  const [showTypeSelector, setShowTypeSelector] = useState(false);
  const [viewMode, setViewMode] = useState<'instance' | 'type'>('instance');

  const handleCabinetTypeChange = (config: CabinetTypeConfig) => {
    setSelectedCabinetType(config);
    setShowTypeSelector(false);
  };

  const handleCabinetInstanceSelect = (instance: CabinetInstance) => {
    setSelectedCabinetInstance(instance);
    // 根據機櫃實例設定對應的類型
    const typeConfig = CABINET_TYPE_CONFIGS.find(c => c.model === instance.model);
    if (typeConfig) {
      setSelectedCabinetType(typeConfig);
    }
  };

  const renderCabinetDisplay = () => {
    // 如果選擇了具體的機櫃實例，傳遞機櫃ID
    const cabinetId = selectedCabinetInstance?.id;
    
    switch (selectedCabinetType.id) {
      case 'l11':
        return <L11CabinetDisplay cabinetId={cabinetId} />;
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
                <Button onClick={() => setShowTypeSelector(true)}>
                  返回選擇器
                </Button>
              </div>
            </CardContent>
          </Card>
        );
    }
  };

  if (showTypeSelector) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setShowTypeSelector(false)}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回
          </Button>
          <div>
            <h1 className="text-3xl font-bold">機櫃管理中心</h1>
            <p className="text-muted-foreground">選擇並管理不同型號的機櫃</p>
          </div>
        </div>

        {/* 切換檢視模式 */}
        <div className="flex gap-2">
          <Button 
            variant={viewMode === 'instance' ? 'default' : 'outline'}
            onClick={() => setViewMode('instance')}
          >
            機櫃實例管理
          </Button>
          <Button 
            variant={viewMode === 'type' ? 'default' : 'outline'}
            onClick={() => setViewMode('type')}
          >
            機櫃型號管理
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-6">
          {viewMode === 'instance' ? (
            <CabinetInstanceManager 
              currentCabinetId={selectedCabinetInstance?.id}
              onCabinetSelect={handleCabinetInstanceSelect}
            />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <CabinetTypeManager 
                onSelectCabinetType={handleCabinetTypeChange}
                currentTypeId={selectedCabinetType.id}
              />
              
              {/* 機櫃型號概覽 */}
              <Card>
                <CardHeader>
                  <CardTitle>所有機櫃型號</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {CABINET_TYPE_CONFIGS.map((config) => (
                      <div 
                        key={config.id}
                        className={`p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors ${
                          selectedCabinetType.id === config.id ? 'border-primary bg-primary/5' : ''
                        }`}
                        onClick={() => handleCabinetTypeChange(config)}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-medium">{config.name}</h4>
                            <p className="text-sm text-muted-foreground">{config.description}</p>
                          </div>
                          <Badge 
                            variant={config.status === 'active' ? 'default' : 'secondary'}
                          >
                            {config.status === 'active' ? '可用' : '開發中'}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* 頂部控制欄 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              {selectedCabinetInstance ? (
                <>
                  {selectedCabinetInstance.name}
                  <Badge variant={selectedCabinetInstance.status === 'active' ? 'default' : 'secondary'}>
                    {selectedCabinetInstance.status === 'active' ? '運行中' : 
                     selectedCabinetInstance.status === 'maintenance' ? '維護中' :
                     selectedCabinetInstance.status === 'offline' ? '離線' : '規劃中'}
                  </Badge>
                </>
              ) : (
                <>
                  {selectedCabinetType.name}
                  <Badge variant={selectedCabinetType.status === 'active' ? 'default' : 'secondary'}>
                    {selectedCabinetType.status === 'active' ? '生產中' : '開發中'}
                  </Badge>
                </>
              )}
            </h1>
            <p className="text-muted-foreground">
              {selectedCabinetInstance ? 
                `位置: ${selectedCabinetInstance.location}` : 
                selectedCabinetType.description
              }
            </p>
          </div>
        </div>
        
        <Button 
          variant="outline" 
          onClick={() => setShowTypeSelector(true)}
        >
          切換機櫃
        </Button>
      </div>

      {/* 機櫃顯示區域 */}
      {renderCabinetDisplay()}
    </div>
  );
}