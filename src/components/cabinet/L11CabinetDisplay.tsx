
import React, { Suspense, useState, useEffect } from 'react';
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
  isSelected: boolean;
  onComponentClick: (componentType: string, serialNumber: string) => void;
}

function CabinetRack({ position, color, size, serialNumber, componentType, isSelected, onComponentClick }: CabinetRackProps) {
  const handleClick = (e: any) => {
    e.stopPropagation();
    onComponentClick(componentType, serialNumber);
  };

  const displayColor = isSelected ? '#ffffff' : color;
  const emissive = isSelected ? '#4ade80' : '#000000';

  return (
    <group position={position} onClick={handleClick}>
      {/* Main component body */}
      <mesh>
        <boxGeometry args={[size[0] - 0.05, size[1] - 0.02, size[2] - 0.05]} />
        <meshPhysicalMaterial 
          color={displayColor}
          metalness={0.7}
          roughness={0.2}
          clearcoat={0.3}
          clearcoatRoughness={0.1}
          emissive={emissive}
          emissiveIntensity={isSelected ? 0.2 : 0}
          transmission={0.1}
          thickness={0.5}
        />
      </mesh>
      
      {/* Front panel with details */}
      <mesh position={[0, 0, size[2]/2 + 0.01]}>
        <boxGeometry args={[size[0] - 0.1, size[1] - 0.05, 0.02]} />
        <meshPhysicalMaterial 
          color={isSelected ? '#f0f0f0' : '#2a2a2a'}
          metalness={0.9}
          roughness={0.1}
          clearcoat={0.8}
          emissive={emissive}
          emissiveIntensity={isSelected ? 0.1 : 0}
        />
      </mesh>
      
      {/* Status LED indicators */}
      <mesh position={[size[0]/2 - 0.3, size[1]/2 - 0.1, size[2]/2 + 0.02]}>
        <sphereGeometry args={[0.02, 8, 8]} />
        <meshPhysicalMaterial 
          color={isSelected ? '#00ff00' : '#ff4444'}
          emissive={isSelected ? '#00ff00' : '#ff0000'}
          emissiveIntensity={0.8}
          transparent={true}
          opacity={0.9}
        />
      </mesh>
      
      {/* Ventilation grilles */}
      {Array.from({length: 3}).map((_, i) => (
        <mesh key={i} position={[size[0]/2 - 0.5 - i * 0.3, 0, size[2]/2 + 0.015]}>
          <boxGeometry args={[0.15, size[1] - 0.1, 0.005]} />
          <meshPhysicalMaterial 
            color="#1a1a1a"
            metalness={0.8}
            roughness={0.3}
          />
        </mesh>
      ))}
      
      {/* Handle */}
      <mesh position={[-size[0]/2 + 0.05, 0, size[2]/2 + 0.03]}>
        <cylinderGeometry args={[0.02, 0.02, size[1] - 0.2, 8]} />
        <meshPhysicalMaterial 
          color="#666666"
          metalness={0.9}
          roughness={0.2}
        />
      </mesh>
    </group>
  );
}

interface CabinetSceneProps {
  config: CabinetConfig;
  isOpen: boolean;
  selectedComponent: { type: string; sn: string } | null;
  onComponentClick: (componentType: string, serialNumber: string) => void;
}

function CabinetScene({ config, isOpen, selectedComponent, onComponentClick }: CabinetSceneProps) {
  const frameColor = '#1a1a1a';
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
  const cabinetHeight = Math.max(8, totalSlotHeight + totalPowerSupplyHeight + 2); // Minimum height with proper spacing

  return (
    <group>
      {/* Enhanced Cabinet frame */}
      {!isOpen && (
        <>
          {/* Front glass panel */}
          <mesh position={[0, 0, 2.1]}>
            <boxGeometry args={[4, cabinetHeight, 0.05]} />
            <meshPhysicalMaterial 
              color="#111111"
              metalness={0.1}
              roughness={0.02}
              transmission={0.8}
              thickness={0.1}
              clearcoat={1}
              clearcoatRoughness={0.1}
              transparent={true}
              opacity={0.3}
            />
          </mesh>
          
          {/* Back panel */}
          <mesh position={[0, 0, -2.1]}>
            <boxGeometry args={[4, cabinetHeight, 0.1]} />
            <meshPhysicalMaterial 
              color={frameColor}
              metalness={0.8}
              roughness={0.2}
              clearcoat={0.5}
            />
          </mesh>
        </>
      )}
      
      {/* Side panels with better materials */}
      <mesh position={[-2, 0, 0]}>
        <boxGeometry args={[0.1, cabinetHeight, 4]} />
        <meshPhysicalMaterial 
          color={frameColor} 
          metalness={0.7} 
          roughness={0.3}
          clearcoat={0.4}
          transparent={isOpen}
          opacity={isOpen ? 0.2 : 1}
        />
      </mesh>
      
      <mesh position={[2, 0, 0]}>
        <boxGeometry args={[0.1, cabinetHeight, 4]} />
        <meshPhysicalMaterial 
          color={frameColor} 
          metalness={0.7} 
          roughness={0.3}
          clearcoat={0.4}
          transparent={isOpen}
          opacity={isOpen ? 0.2 : 1}
        />
      </mesh>
      
      {/* Top and bottom panels - Adjusted to remove gaps */}
      <mesh position={[0, cabinetHeight/2 - 0.05, 0]}>
        <boxGeometry args={[4, 0.1, 4]} />
        <meshPhysicalMaterial 
          color={frameColor} 
          metalness={0.8} 
          roughness={0.2}
          clearcoat={0.6}
        />
      </mesh>
      
      <mesh position={[0, -cabinetHeight/2 + 0.05, 0]}>
        <boxGeometry args={[4, 0.1, 4]} />
        <meshPhysicalMaterial 
          color={frameColor} 
          metalness={0.8} 
          roughness={0.2}
          clearcoat={0.6}
        />
      </mesh>

      {/* Rack rails */}
      <mesh position={[-1.8, 0, 1.8]}>
        <boxGeometry args={[0.05, cabinetHeight - 0.2, 0.1]} />
        <meshPhysicalMaterial color="#333333" metalness={0.9} roughness={0.1} />
      </mesh>
      <mesh position={[1.8, 0, 1.8]}>
        <boxGeometry args={[0.05, cabinetHeight - 0.2, 0.1]} />
        <meshPhysicalMaterial color="#333333" metalness={0.9} roughness={0.1} />
      </mesh>
      <mesh position={[-1.8, 0, -1.8]}>
        <boxGeometry args={[0.05, cabinetHeight - 0.2, 0.1]} />
        <meshPhysicalMaterial color="#333333" metalness={0.9} roughness={0.1} />
      </mesh>
      <mesh position={[1.8, 0, -1.8]}>
        <boxGeometry args={[0.05, cabinetHeight - 0.2, 0.1]} />
        <meshPhysicalMaterial color="#333333" metalness={0.9} roughness={0.1} />
      </mesh>

      {/* Cabinet components */}
      {components.map((comp, index) => {
        const isSelected = selectedComponent?.type === comp.componentType && selectedComponent?.sn === comp.serialNumber;
        return (
          <CabinetRack
            key={index}
            position={comp.position}
            color={comp.color}
            size={comp.size}
            serialNumber={comp.serialNumber}
            componentType={comp.componentType}
            isSelected={isSelected}
            onComponentClick={onComponentClick}
          />
        );
      })}
      
      {/* Enhanced lighting setup - Much brighter for better visibility */}
      <ambientLight intensity={1.2} color="#f5f5f5" />
      <directionalLight 
        position={[10, 10, 5]} 
        intensity={2.5} 
        color="#ffffff"
        castShadow={true}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <directionalLight 
        position={[-10, 10, 5]} 
        intensity={1.8} 
        color="#ffffff"
      />
      <directionalLight 
        position={[0, -10, 5]} 
        intensity={1.5} 
        color="#ffffff"
      />
      <pointLight 
        position={[0, 0, 8]} 
        intensity={2.0} 
        color="#ffffff"
        distance={20}
        decay={1.5}
      />
      <pointLight 
        position={[5, 5, 3]} 
        intensity={1.5} 
        color="#ffffff"
        distance={15}
        decay={1.8}
      />
      <pointLight 
        position={[-5, -5, 3]} 
        intensity={1.5} 
        color="#ffffff"
        distance={15}
        decay={1.8}
      />
      
      {/* Additional spot lights for cabinet interior */}
      <spotLight 
        position={[0, 10, 5]} 
        target-position={[0, 0, 0]}
        angle={0.6} 
        intensity={2.0} 
        color="#ffffff"
        penumbra={0.3}
      />
      
      {/* Rim lighting */}
      <directionalLight 
        position={[0, 0, -10]} 
        intensity={0.6} 
        color="#64b5f6"
      />
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
  const [config, setConfig] = useState<CabinetConfig>(() => {
    const savedConfig = localStorage.getItem('l11-cabinet-config');
    return savedConfig ? JSON.parse(savedConfig) : {
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
    };
  });
  
  const handleReset = () => {
    setAutoRotate(true);
  };

  const handleComponentClick = (componentType: string, serialNumber: string) => {
    setSelectedComponent({ type: componentType, sn: serialNumber });
  };

  const handleConfigChange = (newConfig: CabinetConfig) => {
    setConfig(newConfig);
    localStorage.setItem('l11-cabinet-config', JSON.stringify(newConfig));
  };

  useEffect(() => {
    localStorage.setItem('l11-cabinet-config', JSON.stringify(config));
  }, [config]);

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
            <div className="h-[600px] rounded-lg overflow-hidden border bg-gradient-to-b from-slate-900 to-slate-800 shadow-2xl">
              <Suspense fallback={<ErrorFallback />}>
                <Canvas
                  camera={{ position: [8, 3, 8], fov: 50 }}
                  style={{ 
                    background: 'radial-gradient(ellipse at center, #1e293b 0%, #0f172a 70%, #020617 100%)',
                  }}
                  shadows={true}
                  gl={{ 
                    antialias: true, 
                    alpha: true,
                    powerPreference: "high-performance"
                  }}
                >
                  <Suspense fallback={null}>
                    <CabinetScene config={config} isOpen={isOpen} selectedComponent={selectedComponent} onComponentClick={handleComponentClick} />
                    <OrbitControls 
                      autoRotate={autoRotate}
                      autoRotateSpeed={0.5}
                      enablePan={true}
                      enableZoom={true}
                      enableRotate={true}
                      minDistance={4}
                      maxDistance={20}
                      minPolarAngle={0}
                      maxPolarAngle={Math.PI}
                      onStart={() => setAutoRotate(false)}
                      enableDamping={true}
                      dampingFactor={0.05}
                    />
                  </Suspense>
                </Canvas>
              </Suspense>
            </div>
            
            {/* Selected Component Display */}
            {selectedComponent && (
              <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
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
          </CardContent>
        </Card>

        {/* Configuration Panel */}
        <div className="lg:col-span-2 space-y-6">
          <CabinetConfigurator 
            config={config} 
            onConfigChange={handleConfigChange}
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
