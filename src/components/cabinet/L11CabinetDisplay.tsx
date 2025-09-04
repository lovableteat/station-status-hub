
import React, { Suspense, useState, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { BackButton } from '@/components/common/BackButton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RotateCcw, Eye, EyeOff } from 'lucide-react';
import { CabinetConfigurator, CabinetConfig } from './CabinetConfigurator';
import { SystemSelectionDialog } from './SystemSelectionDialog';
import { useUnifiedData } from '@/hooks/useUnifiedData';
import { supabase } from '@/integrations/supabase/client';
import * as THREE from 'three';

interface SystemDetails {
  system_name?: string;
  model?: string;
  current_station?: string;
  status?: string;
  assigned_engineer?: string;
  overall_progress?: number;
  team?: string;
  bmc_address?: string;
  os_mac_address?: string; // NIC MAC Address
  ubuntu_version?: string;
  cuda_version?: string;
}

interface SelectedComponent {
  type: string;
  sn: string;
  details?: SystemDetails;
}

interface ComponentSystemMapping {
  [key: string]: {
    systemId: string;
    systemName: string;
    serialNumber: string;
  };
}

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
  
  // Calculate total height first
  const totalSlots = config.topOfRackSwitch.count + config.computeTrays1.count + config.switchTrays.count + config.computeTrays2.count;
  const totalPowerSupplyHeight = (config.topPowerSupplies.count + config.bottomPowerSupplies.count) * 0.4;
  const srcUnitsHeight = config.srcUnits.count * 0.4;
  const totalSlotHeight = totalSlots * slotHeight;
  const cabinetHeight = totalSlotHeight + totalPowerSupplyHeight + srcUnitsHeight + 0.2; // Minimal spacing for frame
  
  // Calculate components based on configuration
  const components = [];
  let currentY = cabinetHeight / 2 - 0.1; // Start from the very top

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
  currentY -= config.bottomPowerSupplies.count * 0.4;

  // SRC units
  for (let i = 0; i < config.srcUnits.count; i++) {
    components.push({
      position: [0, currentY - (i * 0.4), 0] as [number, number, number],
      color: config.srcUnits.color,
      size: [3.8, 0.35, 2] as [number, number, number],
      serialNumber: config.srcUnits.serialNumbers[i] || `SRC-${i + 1}`,
      componentType: 'SRC Units'
    });
  }
  
  // Calculate the bottom position for tight fit (including SRC units)
  const lowestComponentY = currentY - config.srcUnits.count * 0.4;
  
  // Calculate actual cabinet bounds based on component positions
  const topComponentY = cabinetHeight / 2 - 0.1; // Position of top component
  const actualCabinetHeight = topComponentY - lowestComponentY + 0.4; // Height from top to bottom component + component thickness

  return (
    <group>
      {/* Enhanced Cabinet frame */}
      {!isOpen && (
        <>
          {/* Front glass panel */}
          <mesh position={[0, (topComponentY + lowestComponentY) / 2, 2.1]}>
            <boxGeometry args={[4, actualCabinetHeight, 0.05]} />
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
          <mesh position={[0, (topComponentY + lowestComponentY) / 2, -2.1]}>
            <boxGeometry args={[4, actualCabinetHeight, 0.1]} />
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
      <mesh position={[-2, (topComponentY + lowestComponentY) / 2, 0]}>
        <boxGeometry args={[0.1, actualCabinetHeight, 4]} />
        <meshPhysicalMaterial 
          color={frameColor} 
          metalness={0.7} 
          roughness={0.3}
          clearcoat={0.4}
          transparent={isOpen}
          opacity={isOpen ? 0.2 : 1}
        />
      </mesh>
      
      <mesh position={[2, (topComponentY + lowestComponentY) / 2, 0]}>
        <boxGeometry args={[0.1, actualCabinetHeight, 4]} />
        <meshPhysicalMaterial 
          color={frameColor} 
          metalness={0.7} 
          roughness={0.3}
          clearcoat={0.4}
          transparent={isOpen}
          opacity={isOpen ? 0.2 : 1}
        />
      </mesh>
      
      {/* Top and bottom panels - Adjusted to component bounds */}
      <mesh position={[0, topComponentY + 0.2, 0]}>
        <boxGeometry args={[4, 0.1, 4]} />
        <meshPhysicalMaterial 
          color={frameColor} 
          metalness={0.8} 
          roughness={0.2}
          clearcoat={0.6}
        />
      </mesh>
      
      <mesh position={[0, lowestComponentY - 0.25, 0]}>
        <boxGeometry args={[4, 0.1, 4]} />
        <meshPhysicalMaterial 
          color={frameColor} 
          metalness={0.8} 
          roughness={0.2}
          clearcoat={0.6}
        />
      </mesh>

      {/* Rack rails - Adjusted to component bounds */}
      <mesh position={[-1.8, (topComponentY + lowestComponentY) / 2, 1.8]}>
        <boxGeometry args={[0.05, actualCabinetHeight - 0.2, 0.1]} />
        <meshPhysicalMaterial color="#333333" metalness={0.9} roughness={0.1} />
      </mesh>
      <mesh position={[1.8, (topComponentY + lowestComponentY) / 2, 1.8]}>
        <boxGeometry args={[0.05, actualCabinetHeight - 0.2, 0.1]} />
        <meshPhysicalMaterial color="#333333" metalness={0.9} roughness={0.1} />
      </mesh>
      <mesh position={[-1.8, (topComponentY + lowestComponentY) / 2, -1.8]}>
        <boxGeometry args={[0.05, actualCabinetHeight - 0.2, 0.1]} />
        <meshPhysicalMaterial color="#333333" metalness={0.9} roughness={0.1} />
      </mesh>
      <mesh position={[1.8, (topComponentY + lowestComponentY) / 2, -1.8]}>
        <boxGeometry args={[0.05, actualCabinetHeight - 0.2, 0.1]} />
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
  // 引入系統資料
  const { systems } = useUnifiedData();
  
  // 創建模擬的系統進度數據
  const systemProgress = systems.map(system => ({
    system,
    progress: system.overall_progress || 0,
    status: system.status || 'Not Start',
    test_items_completed: Math.floor((system.overall_progress || 0) / 10),
    test_items_total: 10
  }));
  
  // 從localStorage讀取和保存狀態
  const [autoRotate, setAutoRotate] = useState(() => {
    const saved = localStorage.getItem('l11-cabinet-autoRotate');
    return saved ? JSON.parse(saved) : true;
  });
  
  const [isOpen, setIsOpen] = useState(() => {
    const saved = localStorage.getItem('l11-cabinet-isOpen');
    return saved ? JSON.parse(saved) : true;
  });
  
  const [selectedComponent, setSelectedComponent] = useState<SelectedComponent | null>(() => {
    const saved = localStorage.getItem('l11-cabinet-selectedComponent');
    return saved ? JSON.parse(saved) : null;
  });

  // 組件到系統的映射
  const [componentSystemMapping, setComponentSystemMapping] = useState<ComponentSystemMapping>(() => {
    const saved = localStorage.getItem('l11-cabinet-componentSystemMapping');
    return saved ? JSON.parse(saved) : {};
  });

  // 系統選擇對話框狀態
  const [systemSelectionDialog, setSystemSelectionDialog] = useState<{
    open: boolean;
    componentType: string;
    componentSn: string;
  }>({
    open: false,
    componentType: '',
    componentSn: ''
  });
  
  const [config, setConfig] = useState<CabinetConfig>(() => {
    const savedConfig = localStorage.getItem('l11-cabinet-config');
    return savedConfig ? JSON.parse(savedConfig) : {
      topOfRackSwitch: { 
        count: 2, 
        color: '#3b82f6', 
        serialNumbers: ['TOR-001', 'TOR-002'] 
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
      },
      srcUnits: { 
        count: 2, 
        color: '#8b5cf6', 
        serialNumbers: Array.from({length: 2}, (_, i) => `SRC-${String(i + 1).padStart(3, '0')}`) 
      }
    };
  });

  // 自動保存狀態到localStorage
  useEffect(() => {
    localStorage.setItem('l11-cabinet-autoRotate', JSON.stringify(autoRotate));
  }, [autoRotate]);

  useEffect(() => {
    localStorage.setItem('l11-cabinet-isOpen', JSON.stringify(isOpen));
  }, [isOpen]);

  useEffect(() => {
    localStorage.setItem('l11-cabinet-selectedComponent', JSON.stringify(selectedComponent));
  }, [selectedComponent]);

  useEffect(() => {
    localStorage.setItem('l11-cabinet-config', JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    localStorage.setItem('l11-cabinet-componentSystemMapping', JSON.stringify(componentSystemMapping));
  }, [componentSystemMapping]);
  
  const handleReset = () => {
    setAutoRotate(true);
    localStorage.setItem('l11-cabinet-autoRotate', JSON.stringify(true));
  };

  const handleComponentClick = async (componentType: string, serialNumber: string) => {
    // 檢查是否有映射的系統
    const mappingKey = `${componentType}-${serialNumber}`;
    const mappedSystem = componentSystemMapping[mappingKey];
    
    let details: SystemDetails | undefined;
    if (mappedSystem) {
      // 如果有映射的系統，使用該系統的資訊
      const system = systems.find(s => s.id === mappedSystem.systemId);
      if (system) {
        details = {
          system_name: system.system_name,
          model: system.model,
          current_station: system.current_station,
          status: system.status,
          assigned_engineer: system.assigned_engineer,
          overall_progress: system.overall_progress,
          team: 'N/A', // 從新的系統資料結構中沒有team欄位
          bmc_address: 'N/A',
          os_mac_address: 'N/A',
          ubuntu_version: system.ubuntu_version,
          cuda_version: system.cuda_version
        };
      }
    }
    
    const newSelectedComponent = { 
      type: componentType, 
      sn: serialNumber,
      details 
    };
    setSelectedComponent(newSelectedComponent);
    localStorage.setItem('l11-cabinet-selectedComponent', JSON.stringify(newSelectedComponent));
  };

  const handleConfigChange = (newConfig: CabinetConfig) => {
    setConfig(newConfig);
    localStorage.setItem('l11-cabinet-config', JSON.stringify(newConfig));
  };

  const handleIsOpenChange = (newIsOpen: boolean) => {
    setIsOpen(newIsOpen);
    localStorage.setItem('l11-cabinet-isOpen', JSON.stringify(newIsOpen));
  };

  const handleSelectedComponentClear = () => {
    setSelectedComponent(null);
    localStorage.removeItem('l11-cabinet-selectedComponent');
  };

  // 開啟系統選擇對話框
  const handleSelectSystem = (componentType: string, componentSn: string) => {
    setSystemSelectionDialog({
      open: true,
      componentType,
      componentSn
    });
  };

  // 選擇系統後的處理
  const handleSystemSelected = (system: any) => {
    const mappingKey = `${systemSelectionDialog.componentType}-${systemSelectionDialog.componentSn}`;
    const newMapping = {
      ...componentSystemMapping,
      [mappingKey]: {
        systemId: system.id,
        systemName: system.system_name,
        serialNumber: system.serial_number || system.system_name
      }
    };
    
    setComponentSystemMapping(newMapping);
    localStorage.setItem('l11-cabinet-componentSystemMapping', JSON.stringify(newMapping));
    
    // 同步更新機櫃組態設定中的 SN 碼
    const newConfig = { ...config };
    const componentType = systemSelectionDialog.componentType;
    const componentSn = systemSelectionDialog.componentSn;
    const newSn = system.serial_number || system.system_name;
    
    // 找到對應的配置項目並更新 SN 碼
    let configKey: keyof CabinetConfig | null = null;
    if (componentType === 'Top Of Rack Switch') configKey = 'topOfRackSwitch';
    else if (componentType === '9 Switch Trays') configKey = 'switchTrays';
    else if (componentType === '10 Compute Trays') configKey = 'computeTrays1';
    else if (componentType === '8 Compute Trays') configKey = 'computeTrays2';
    else if (componentType === 'Power Supplies (上)') configKey = 'topPowerSupplies';
    else if (componentType === 'Power Supplies (下)') configKey = 'bottomPowerSupplies';
    else if (componentType === 'SRC Units') configKey = 'srcUnits';
    
    if (configKey) {
      const componentConfig = newConfig[configKey];
      const snIndex = componentConfig.serialNumbers.findIndex(sn => sn === componentSn);
      if (snIndex !== -1) {
        componentConfig.serialNumbers[snIndex] = newSn;
        setConfig(newConfig);
        localStorage.setItem('l11-cabinet-config', JSON.stringify(newConfig));
      }
    }
    
    // 更新選中的組件
    handleComponentClick(systemSelectionDialog.componentType, systemSelectionDialog.componentSn);
  };


  const totalComponents = config.computeTrays1.count + config.computeTrays2.count;
  const totalSwitches = config.topOfRackSwitch.count + config.switchTrays.count;
  const totalPowerSupplies = config.topPowerSupplies.count + config.bottomPowerSupplies.count;
  const totalSrcUnits = config.srcUnits.count;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <BackButton />
          <h1 className="text-3xl font-bold text-foreground mt-2">L11機櫃展示</h1>
          <p className="text-muted-foreground">3D可組態機櫃結構展示與切換</p>
        </div>
        
        <div className="flex gap-2">
          <Button
            variant={isOpen ? "default" : "outline"}
            size="sm"
            onClick={() => handleIsOpenChange(!isOpen)}
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
                <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-3">選中組件詳細資訊</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="font-medium text-blue-800 dark:text-blue-200">組件類型:</span>
                    <p className="text-gray-700 dark:text-gray-300">{selectedComponent.type}</p>
                  </div>
                   <div>
                     <span className="font-medium text-blue-800 dark:text-blue-200">序列號:</span>
                     <p className="text-yellow-500 dark:text-yellow-400 font-mono font-bold">{selectedComponent.sn}</p>
                   </div>
                  {selectedComponent.details && (
                    <>
                      <div>
                        <span className="font-medium text-blue-800 dark:text-blue-200">系統名稱:</span>
                        <p className="text-gray-700 dark:text-gray-300">{selectedComponent.details.system_name || 'N/A'}</p>
                      </div>
                      <div>
                        <span className="font-medium text-blue-800 dark:text-blue-200">型號:</span>
                        <p className="text-gray-700 dark:text-gray-300">{selectedComponent.details.model || 'N/A'}</p>
                      </div>
                      <div>
                        <span className="font-medium text-blue-800 dark:text-blue-200">當前工站:</span>
                        <p className="text-gray-700 dark:text-gray-300">{selectedComponent.details.current_station || 'N/A'}</p>
                      </div>
                      <div>
                        <span className="font-medium text-blue-800 dark:text-blue-200">狀態:</span>
                        <Badge variant={selectedComponent.details.status === 'Completed' ? 'default' : 'secondary'} className="ml-1">
                          {selectedComponent.details.status || 'N/A'}
                        </Badge>
                      </div>
                      <div>
                        <span className="font-medium text-blue-800 dark:text-blue-200">指派工程師:</span>
                        <p className="text-gray-700 dark:text-gray-300">{selectedComponent.details.assigned_engineer || '未指派'}</p>
                      </div>
                      <div>
                        <span className="font-medium text-blue-800 dark:text-blue-200">整體進度:</span>
                        <p className="text-gray-700 dark:text-gray-300">{selectedComponent.details.overall_progress || 0}%</p>
                      </div>
                      {selectedComponent.details.team && (
                        <div>
                          <span className="font-medium text-blue-800 dark:text-blue-200">團隊:</span>
                          <p className="text-gray-700 dark:text-gray-300">{selectedComponent.details.team}</p>
                        </div>
                      )}
                      {selectedComponent.details.bmc_address && (
                        <div>
                          <span className="font-medium text-blue-800 dark:text-blue-200">BMC地址:</span>
                          <p className="text-gray-700 dark:text-gray-300 font-mono">{selectedComponent.details.bmc_address}</p>
                        </div>
                      )}
                      {selectedComponent.details.os_mac_address && (
                        <div>
                          <span className="font-medium text-blue-800 dark:text-blue-200">NIC MAC地址:</span>
                          <p className="text-gray-700 dark:text-gray-300 font-mono">{selectedComponent.details.os_mac_address}</p>
                        </div>
                      )}
                      {selectedComponent.details.ubuntu_version && (
                        <div>
                          <span className="font-medium text-blue-800 dark:text-blue-200">Ubuntu版本:</span>
                          <p className="text-gray-700 dark:text-gray-300">{selectedComponent.details.ubuntu_version}</p>
                        </div>
                      )}
                      {selectedComponent.details.cuda_version && (
                        <div>
                          <span className="font-medium text-blue-800 dark:text-blue-200">CUDA版本:</span>
                          <p className="text-gray-700 dark:text-gray-300">{selectedComponent.details.cuda_version}</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="mt-3" 
                  onClick={handleSelectedComponentClear}
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
            componentSystemMapping={componentSystemMapping}
            onComponentSystemMappingChange={setComponentSystemMapping}
          />
          
        </div>
      </div>
      
      {/* 機櫃組裝清單 */}
      <Card>
        <CardHeader>
          <CardTitle>機櫃組裝清單</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* 網路交換設備 */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="h-4 w-4 bg-blue-500 rounded"></div>
                <h3 className="text-lg font-semibold text-blue-600">網路交換設備</h3>
                <Badge variant="outline">{config.topOfRackSwitch.count + config.switchTrays.count} 台</Badge>
              </div>
              <div className="pl-7 space-y-2">
                <div>
                  <h4 className="font-medium mb-2">Top Of Rack Switch</h4>
                   <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                     {config.topOfRackSwitch.serialNumbers.slice(0, config.topOfRackSwitch.count).map((sn, index) => (
                       <div key={sn} className="text-sm font-mono bg-blue-50 dark:bg-blue-950 px-3 py-2 rounded border hover:bg-blue-100 dark:hover:bg-blue-900 cursor-pointer transition-colors">
                         <div className="font-medium">#{index + 1}</div>
                         <div className="text-blue-600 dark:text-blue-400 font-bold">{sn}</div>
                           <div className="mt-1 space-y-1">
                             {componentSystemMapping[`Top Of Rack Switch-${sn}`] && (
                               <>
                                 <div className="text-xs text-green-600 dark:text-green-400 font-medium">
                                   已配置: {componentSystemMapping[`Top Of Rack Switch-${sn}`].systemName}
                                 </div>
                                 <div className="text-xs text-muted-foreground">
                                   SN: {componentSystemMapping[`Top Of Rack Switch-${sn}`].serialNumber}
                                 </div>
                               </>
                             )}
                             <Button 
                               variant="ghost" 
                               size="sm" 
                               className="w-full text-xs h-6"
                               onClick={() => handleSelectSystem('Top Of Rack Switch', sn)}
                             >
                               {componentSystemMapping[`Top Of Rack Switch-${sn}`] ? '重新選擇' : '選擇機台'}
                             </Button>
                           </div>
                       </div>
                     ))}
                   </div>
                </div>
                <div>
                  <h4 className="font-medium mb-2">Switch Trays</h4>
                   <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                     {config.switchTrays.serialNumbers.slice(0, config.switchTrays.count).map((sn, index) => (
                       <div key={sn} className="text-sm font-mono bg-blue-50 dark:bg-blue-950 px-3 py-2 rounded border hover:bg-blue-100 dark:hover:bg-blue-900 cursor-pointer transition-colors">
                         <div className="font-medium">#{index + 1}</div>
                         <div className="text-blue-600 dark:text-blue-400 font-bold">{sn}</div>
                           <div className="mt-1 space-y-1">
                             {componentSystemMapping[`9 Switch Trays-${sn}`] && (
                               <>
                                 <div className="text-xs text-green-600 dark:text-green-400 font-medium">
                                   已配置: {componentSystemMapping[`9 Switch Trays-${sn}`].systemName}
                                 </div>
                                 <div className="text-xs text-muted-foreground">
                                   SN: {componentSystemMapping[`9 Switch Trays-${sn}`].serialNumber}
                                 </div>
                               </>
                             )}
                             <Button 
                               variant="ghost" 
                               size="sm" 
                               className="w-full text-xs h-6"
                               onClick={() => handleSelectSystem('9 Switch Trays', sn)}
                             >
                               {componentSystemMapping[`9 Switch Trays-${sn}`] ? '重新選擇' : '選擇機台'}
                             </Button>
                           </div>
                       </div>
                     ))}
                   </div>
                </div>
              </div>
            </div>

            {/* 運算單元 */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="h-4 w-4 bg-emerald-500 rounded"></div>
                <h3 className="text-lg font-semibold text-emerald-600">運算單元</h3>
                <Badge variant="outline">{config.computeTrays1.count + config.computeTrays2.count} 台</Badge>
              </div>
              <div className="pl-7 space-y-2">
                <div>
                  <h4 className="font-medium mb-2">10 Compute Trays</h4>
                   <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                     {config.computeTrays1.serialNumbers.slice(0, config.computeTrays1.count).map((sn, index) => (
                       <div key={sn} className="text-sm font-mono bg-emerald-50 dark:bg-emerald-950 px-3 py-2 rounded border hover:bg-emerald-100 dark:hover:bg-emerald-900 cursor-pointer transition-colors">
                         <div className="font-medium">#{index + 1}</div>
                         <div className="text-emerald-600 dark:text-emerald-400 font-bold">{sn}</div>
                           <div className="mt-1 space-y-1">
                             {componentSystemMapping[`10 Compute Trays-${sn}`] && (
                               <>
                                 <div className="text-xs text-green-600 dark:text-green-400 font-medium">
                                   已配置: {componentSystemMapping[`10 Compute Trays-${sn}`].systemName}
                                 </div>
                                 <div className="text-xs text-muted-foreground">
                                   SN: {componentSystemMapping[`10 Compute Trays-${sn}`].serialNumber}
                                 </div>
                               </>
                             )}
                             <Button 
                               variant="ghost" 
                               size="sm" 
                               className="w-full text-xs h-6"
                               onClick={() => handleSelectSystem('10 Compute Trays', sn)}
                             >
                               {componentSystemMapping[`10 Compute Trays-${sn}`] ? '重新選擇' : '選擇機台'}
                             </Button>
                           </div>
                       </div>
                     ))}
                   </div>
                </div>
                <div>
                  <h4 className="font-medium mb-2">8 Compute Trays</h4>
                   <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                     {config.computeTrays2.serialNumbers.slice(0, config.computeTrays2.count).map((sn, index) => (
                       <div key={sn} className="text-sm font-mono bg-emerald-50 dark:bg-emerald-950 px-3 py-2 rounded border hover:bg-emerald-100 dark:hover:bg-emerald-900 cursor-pointer transition-colors">
                         <div className="font-medium">#{index + 1}</div>
                         <div className="text-emerald-600 dark:text-emerald-400 font-bold">{sn}</div>
                           <div className="mt-1 space-y-1">
                             {componentSystemMapping[`8 Compute Trays-${sn}`] && (
                               <>
                                 <div className="text-xs text-green-600 dark:text-green-400 font-medium">
                                   已配置: {componentSystemMapping[`8 Compute Trays-${sn}`].systemName}
                                 </div>
                                 <div className="text-xs text-muted-foreground">
                                   SN: {componentSystemMapping[`8 Compute Trays-${sn}`].serialNumber}
                                 </div>
                               </>
                             )}
                             <Button 
                               variant="ghost" 
                               size="sm" 
                               className="w-full text-xs h-6"
                               onClick={() => handleSelectSystem('8 Compute Trays', sn)}
                             >
                               {componentSystemMapping[`8 Compute Trays-${sn}`] ? '重新選擇' : '選擇機台'}
                             </Button>
                           </div>
                       </div>
                     ))}
                   </div>
                </div>
              </div>
            </div>

            {/* 電源供應單元 */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="h-4 w-4 bg-amber-500 rounded"></div>
                <h3 className="text-lg font-semibold text-amber-600">電源供應單元</h3>
                <Badge variant="outline">{config.topPowerSupplies.count + config.bottomPowerSupplies.count} 台</Badge>
              </div>
              <div className="pl-7 space-y-2">
                <div>
                  <h4 className="font-medium mb-2">Power Supplies (上)</h4>
                   <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                     {config.topPowerSupplies.serialNumbers.slice(0, config.topPowerSupplies.count).map((sn, index) => (
                       <div key={sn} className="text-sm font-mono bg-amber-50 dark:bg-amber-950 px-3 py-2 rounded border hover:bg-amber-100 dark:hover:bg-amber-900 cursor-pointer transition-colors">
                         <div className="font-medium">#{index + 1}</div>
                         <div className="text-amber-600 dark:text-amber-400 font-bold">{sn}</div>
                           <div className="mt-1 space-y-1">
                             {componentSystemMapping[`Power Supplies (上)-${sn}`] && (
                               <>
                                 <div className="text-xs text-green-600 dark:text-green-400 font-medium">
                                   已配置: {componentSystemMapping[`Power Supplies (上)-${sn}`].systemName}
                                 </div>
                                 <div className="text-xs text-muted-foreground">
                                   SN: {componentSystemMapping[`Power Supplies (上)-${sn}`].serialNumber}
                                 </div>
                               </>
                             )}
                             <Button 
                               variant="ghost" 
                               size="sm" 
                               className="w-full text-xs h-6"
                               onClick={() => handleSelectSystem('Power Supplies (上)', sn)}
                             >
                               {componentSystemMapping[`Power Supplies (上)-${sn}`] ? '重新選擇' : '選擇機台'}
                             </Button>
                           </div>
                       </div>
                     ))}
                   </div>
                </div>
                <div>
                  <h4 className="font-medium mb-2">Power Supplies (下)</h4>
                   <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                     {config.bottomPowerSupplies.serialNumbers.slice(0, config.bottomPowerSupplies.count).map((sn, index) => (
                       <div key={sn} className="text-sm font-mono bg-amber-50 dark:bg-amber-950 px-3 py-2 rounded border hover:bg-amber-100 dark:hover:bg-amber-900 cursor-pointer transition-colors">
                         <div className="font-medium">#{index + 1}</div>
                         <div className="text-amber-600 dark:text-amber-400 font-bold">{sn}</div>
                           <div className="mt-1 space-y-1">
                             {componentSystemMapping[`Power Supplies (下)-${sn}`] && (
                               <>
                                 <div className="text-xs text-green-600 dark:text-green-400 font-medium">
                                   已配置: {componentSystemMapping[`Power Supplies (下)-${sn}`].systemName}
                                 </div>
                                 <div className="text-xs text-muted-foreground">
                                   SN: {componentSystemMapping[`Power Supplies (下)-${sn}`].serialNumber}
                                 </div>
                               </>
                             )}
                             <Button 
                               variant="ghost" 
                               size="sm" 
                               className="w-full text-xs h-6"
                               onClick={() => handleSelectSystem('Power Supplies (下)', sn)}
                             >
                               {componentSystemMapping[`Power Supplies (下)-${sn}`] ? '重新選擇' : '選擇機台'}
                             </Button>
                           </div>
                       </div>
                     ))}
                   </div>
                </div>
              </div>
            </div>

            {/* SRC單元 */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="h-4 w-4 bg-purple-500 rounded"></div>
                <h3 className="text-lg font-semibold text-purple-600">SRC單元</h3>
                <Badge variant="outline">{config.srcUnits.count} 台</Badge>
              </div>
              <div className="pl-7">
                 <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                   {config.srcUnits.serialNumbers.slice(0, config.srcUnits.count).map((sn, index) => (
                     <div key={sn} className="text-sm font-mono bg-purple-50 dark:bg-purple-950 px-3 py-2 rounded border hover:bg-purple-100 dark:hover:bg-purple-900 cursor-pointer transition-colors">
                       <div className="font-medium">#{index + 1}</div>
                       <div className="text-purple-600 dark:text-purple-400 font-bold">{sn}</div>
                         <div className="mt-1 space-y-1">
                           {componentSystemMapping[`SRC Units-${sn}`] && (
                             <>
                               <div className="text-xs text-green-600 dark:text-green-400 font-medium">
                                 已配置: {componentSystemMapping[`SRC Units-${sn}`].systemName}
                               </div>
                               <div className="text-xs text-muted-foreground">
                                 SN: {componentSystemMapping[`SRC Units-${sn}`].serialNumber}
                               </div>
                             </>
                           )}
                           <Button 
                             variant="ghost" 
                             size="sm" 
                             className="w-full text-xs h-6"
                             onClick={() => handleSelectSystem('SRC Units', sn)}
                           >
                             {componentSystemMapping[`SRC Units-${sn}`] ? '重新選擇' : '選擇機台'}
                           </Button>
                         </div>
                     </div>
                   ))}
                 </div>
              </div>
            </div>

            {/* 總計統計 */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">總組件數量統計：</span>
                <div className="flex gap-4">
                  <span>交換機: {totalSwitches}台</span>
                  <span>運算單元: {totalComponents}台</span>
                  <span>電源供應: {totalPowerSupplies}台</span>
                  <span>SRC單元: {totalSrcUnits}台</span>
                  <span className="font-semibold">總計: {totalSwitches + totalComponents + totalPowerSupplies + totalSrcUnits}台</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 系統選擇對話框 */}
      <SystemSelectionDialog
        open={systemSelectionDialog.open}
        onOpenChange={(open) => setSystemSelectionDialog(prev => ({ ...prev, open }))}
        componentType={systemSelectionDialog.componentType}
        componentSn={systemSelectionDialog.componentSn}
        systems={systems}
        systemProgress={systemProgress}
        onSystemSelect={handleSystemSelected}
      />
    </div>
  );
}
