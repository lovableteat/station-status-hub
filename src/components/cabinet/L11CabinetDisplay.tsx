
import React, { Suspense, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { BackButton } from '@/components/common/BackButton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RotateCcw, Eye, EyeOff } from 'lucide-react';
import { CabinetConfigurator, CabinetConfig } from './CabinetConfigurator';
import * as THREE from 'three';

interface CabinetRackProps {
  position: [number, number, number];
  color: string;
  size: [number, number, number];
  serialNumber: string;
  componentType: string;
  onComponentClick: (componentType: string, serialNumber: string) => void;
}

function CabinetRack({ position, color, size, serialNumber, componentType, onComponentClick }: CabinetRackProps) {
  const handleClick = (e: any) => {
    e.stopPropagation();
    onComponentClick(componentType, serialNumber);
  };

  return (
    <mesh position={position} onClick={handleClick}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} metalness={0.3} roughness={0.4} />
    </mesh>
  );
}

interface CabinetSceneProps {
  config: CabinetConfig;
  isOpen: boolean;
  onComponentClick: (componentType: string, serialNumber: string) => void;
}

function CabinetScene({ config, isOpen, onComponentClick }: CabinetSceneProps) {
  const frameColor = '#2d3748';
  const slotHeight = 0.35;
  
  // Calculate components based on configuration
  const components = [];
  let currentY = 5.5;

  // Top Of Rack Switch
  for (let i = 0; i < config.topOfRackSwitch.count; i++) {
    components.push({
      position: [0, currentY - (i * slotHeight), 0] as [number, number, number],
      color: config.topOfRackSwitch.color,
      size: [3.8, 0.3, 2] as [number, number, number],
      serialNumber: config.topOfRackSwitch.serialNumbers[i] || `TOR-${i + 1}`,
      componentType: 'Top Of Rack Switch'
    });
  }
  currentY -= config.topOfRackSwitch.count * slotHeight;

  // Power supplies (top)
  for (let i = 0; i < config.topPowerSupplies.count; i++) {
    components.push({
      position: [0, currentY - (i * 0.4), 0] as [number, number, number],
      color: config.topPowerSupplies.color,
      size: [3.8, 0.4, 2] as [number, number, number],
      serialNumber: config.topPowerSupplies.serialNumbers[i] || `PSU-T-${i + 1}`,
      componentType: 'Power Supplies (上)'
    });
  }
  currentY -= config.topPowerSupplies.count * 0.4;

  // First compute tray group (10 Compute Trays)
  for (let i = 0; i < config.computeTrays1.count; i++) {
    components.push({
      position: [0, currentY - (i * slotHeight), 0] as [number, number, number],
      color: config.computeTrays1.color,
      size: [3.8, 0.25, 2] as [number, number, number],
      serialNumber: config.computeTrays1.serialNumbers[i] || `CT1-${i + 1}`,
      componentType: '10 Compute Trays'
    });
  }
  currentY -= config.computeTrays1.count * slotHeight;

  // Switch trays (9 Switch Trays)
  for (let i = 0; i < config.switchTrays.count; i++) {
    components.push({
      position: [0, currentY - (i * slotHeight), 0] as [number, number, number],
      color: config.switchTrays.color,
      size: [3.8, 0.3, 2] as [number, number, number],
      serialNumber: config.switchTrays.serialNumbers[i] || `SW-${i + 1}`,
      componentType: '9 Switch Trays'
    });
  }
  currentY -= config.switchTrays.count * slotHeight;

  // Second compute tray group (8 Compute Trays)
  for (let i = 0; i < config.computeTrays2.count; i++) {
    components.push({
      position: [0, currentY - (i * slotHeight), 0] as [number, number, number],
      color: config.computeTrays2.color,
      size: [3.8, 0.25, 2] as [number, number, number],
      serialNumber: config.computeTrays2.serialNumbers[i] || `CT2-${i + 1}`,
      componentType: '8 Compute Trays'
    });
  }
  currentY -= config.computeTrays2.count * slotHeight;

  // Bottom power supplies
  for (let i = 0; i < config.bottomPowerSupplies.count; i++) {
    components.push({
      position: [0, currentY - (i * 0.4), 0] as [number, number, number],
      color: config.bottomPowerSupplies.color,
      size: [3.8, 0.4, 2] as [number, number, number],
      serialNumber: config.bottomPowerSupplies.serialNumbers[i] || `PSU-B-${i + 1}`,
      componentType: 'Power Supplies (下)'
    });
  }

  // Calculate cabinet height based on components with proper spacing
  const totalSlots = config.topOfRackSwitch.count + config.computeTrays1.count + config.switchTrays.count + config.computeTrays2.count;
  const totalPowerSupplyHeight = (config.topPowerSupplies.count + config.bottomPowerSupplies.count) * 0.4;
  const totalSlotHeight = totalSlots * slotHeight;
  const cabinetHeight = totalSlotHeight + totalPowerSupplyHeight + 4; // Add extra space for frame

  return (
    <group>
      {/* Cabinet frame - conditionally rendered based on isOpen */}
      {!isOpen && (
        <>
          <mesh position={[0, 0, 2.1]}>
            <boxGeometry args={[4, cabinetHeight, 0.1]} />
            <meshStandardMaterial color={frameColor} metalness={0.6} roughness={0.2} />
          </mesh>
          
          <mesh position={[0, 0, -2.1]}>
            <boxGeometry args={[4, cabinetHeight, 0.1]} />
            <meshStandardMaterial color={frameColor} metalness={0.6} roughness={0.2} />
          </mesh>
        </>
      )}
      
      <mesh position={[-2, 0, 0]}>
        <boxGeometry args={[0.1, cabinetHeight, 4]} />
        <meshStandardMaterial 
          color={frameColor} 
          metalness={0.6} 
          roughness={0.2}
          transparent={isOpen}
          opacity={isOpen ? 0.3 : 1}
        />
      </mesh>
      
      <mesh position={[2, 0, 0]}>
        <boxGeometry args={[0.1, cabinetHeight, 4]} />
        <meshStandardMaterial 
          color={frameColor} 
          metalness={0.6} 
          roughness={0.2}
          transparent={isOpen}
          opacity={isOpen ? 0.3 : 1}
        />
      </mesh>
      
      <mesh position={[0, cabinetHeight/2, 0]}>
        <boxGeometry args={[4, 0.1, 4]} />
        <meshStandardMaterial color={frameColor} metalness={0.6} roughness={0.2} />
      </mesh>
      
      <mesh position={[0, -cabinetHeight/2, 0]}>
        <boxGeometry args={[4, 0.1, 4]} />
        <meshStandardMaterial color={frameColor} metalness={0.6} roughness={0.2} />
      </mesh>

      {/* Cabinet components */}
      {components.map((comp, index) => (
        <CabinetRack
          key={index}
          position={comp.position}
          color={comp.color}
          size={comp.size}
          serialNumber={comp.serialNumber}
          componentType={comp.componentType}
          onComponentClick={onComponentClick}
        />
      ))}
      
      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
      <directionalLight position={[-10, -10, -5]} intensity={0.3} />
    </group>
  );
}

function ErrorFallback() {
  return (
    <div className="h-[600px] rounded-lg border bg-slate-900 flex items-center justify-center">
      <div className="text-white text-center">
        <h3 className="text-lg font-semibold mb-2">3D顯示載入失敗</h3>
        <p className="text-sm text-slate-400">請重新整理頁面或聯繫系統管理員</p>
      </div>
    </div>
  );
}

export function L11CabinetDisplay() {
  const [autoRotate, setAutoRotate] = useState(true);
  const [isOpen, setIsOpen] = useState(true);
  const [selectedComponent, setSelectedComponent] = useState<{ type: string; sn: string } | null>(null);
  const [config, setConfig] = useState<CabinetConfig>({
    topOfRackSwitch: { 
      count: 1, 
      color: '#3b82f6', 
      serialNumbers: ['TOR-001'] 
    },
    topPowerSupplies: { 
      count: 4, 
      color: '#f59e0b', 
      serialNumbers: Array.from({length: 4}, (_, i) => `PSU-T-${String(i + 1).padStart(3, '0')}`) 
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
      count: 4, 
      color: '#f59e0b', 
      serialNumbers: Array.from({length: 4}, (_, i) => `PSU-B-${String(i + 1).padStart(3, '0')}`) 
    }
  });
  
  const handleReset = () => {
    setAutoRotate(true);
  };

  const handleComponentClick = (componentType: string, serialNumber: string) => {
    setSelectedComponent({ type: componentType, sn: serialNumber });
  };

  const totalComponents = config.computeTrays1.count + config.computeTrays2.count;
  const totalSwitches = config.topOfRackSwitch.count + config.switchTrays.count;
  const totalPowerSupplies = config.topPowerSupplies.count + config.bottomPowerSupplies.count;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <BackButton />
          <h1 className="text-3xl font-bold text-foreground mt-2">L11機櫃展示</h1>
          <p className="text-muted-foreground">3D可組態機櫃結構展示</p>
        </div>
        
        <div className="flex gap-2">
          <Button
            variant={isOpen ? "default" : "outline"}
            size="sm"
            onClick={() => setIsOpen(!isOpen)}
          >
            {isOpen ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
            {isOpen ? "關閉機殼" : "打開機殼"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            重置視角
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* 3D Display */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
              L11機櫃 3D結構
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[600px] rounded-lg overflow-hidden border bg-slate-900">
              <Suspense fallback={<ErrorFallback />}>
                <Canvas
                  camera={{ position: [8, 3, 8], fov: 50 }}
                  style={{ background: 'linear-gradient(to bottom, #1e293b, #0f172a)' }}
                >
                  <Suspense fallback={null}>
                    <CabinetScene config={config} isOpen={isOpen} onComponentClick={handleComponentClick} />
                    <OrbitControls 
                      autoRotate={autoRotate}
                      autoRotateSpeed={1}
                      enablePan={true}
                      enableZoom={true}
                      enableRotate={true}
                      minDistance={5}
                      maxDistance={25}
                      onStart={() => setAutoRotate(false)}
                    />
                  </Suspense>
                </Canvas>
              </Suspense>
            </div>
          </CardContent>
        </Card>

        {/* Configuration Panel */}
        <div className="lg:col-span-2 space-y-6">
          <CabinetConfigurator 
            config={config} 
            onConfigChange={setConfig}
          />
          
          {/* Information Panel */}
          <Card>
            <CardHeader>
              <CardTitle>機櫃組件說明</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-3 w-3 bg-blue-500 rounded" />
                  <Badge variant="outline">交換機</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  網路交換設備，負責資料傳輸
                </p>
              </div>
              
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-3 w-3 bg-emerald-500 rounded" />
                  <Badge variant="outline">運算單元</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  主要處理運算任務的伺服器托盤
                </p>
              </div>
              
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-3 w-3 bg-amber-500 rounded" />
                  <Badge variant="outline">電源供應</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  提供穩定電力供應的冗餘電源
                </p>
              </div>

              {selectedComponent && (
                <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                  <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">選中組件</h4>
                  <div className="space-y-1">
                    <p className="text-sm"><span className="font-medium">類型:</span> {selectedComponent.type}</p>
                    <p className="text-sm"><span className="font-medium">序號:</span> {selectedComponent.sn}</p>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mt-2" 
                    onClick={() => setSelectedComponent(null)}
                  >
                    清除選擇
                  </Button>
                </div>
              )}

              <div className="pt-4 border-t">
                <h4 className="font-semibold mb-2">操作說明</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• 滑鼠拖拽旋轉視角</li>
                  <li>• 滾輪縮放檢視</li>
                  <li>• 點擊組件檢視SN碼</li>
                  <li>• 左側面板調整配置</li>
                  <li>• 即時3D預覽更新</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-blue-600">{totalSwitches}</div>
            <div className="text-sm text-muted-foreground">交換機托盤</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-emerald-600">{totalComponents}</div>
            <div className="text-sm text-muted-foreground">運算托盤</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-amber-600">{totalPowerSupplies}</div>
            <div className="text-sm text-muted-foreground">電源供應單元</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
