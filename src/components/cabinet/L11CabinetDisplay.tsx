
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

// 生成序號的函數
const generateSerialNumbers = (prefix: string, count: number): string[] => {
  return Array.from({length: count}, (_, i) => `${prefix}-${String(i + 1).padStart(3, '0')}`);
};

// 根據組件類型獲取序號列表
const getSerialNumbers = (componentType: string, count: number): string[] => {
  const prefixMap: { [key: string]: string } = {
    'topOfRackSwitch': 'TOR',
    'switchTrays': 'SW',
    'computeTrays1': 'CT1',
    'computeTrays2': 'CT2',
    'topPowerSupplies': 'PSU-T',
    'bottomPowerSupplies': 'PSU-B',
    'srcUnits': 'SRC'
  };
  return generateSerialNumbers(prefixMap[componentType] || componentType.toUpperCase(), count);
};

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
  
  // 根據圖像重新定義機櫃結構 - 從上到下的實際排列順序
  const cabinetStructure = [
    { type: 'topOfRackSwitch', count: 2, height: 0.25, color: '#d97706' }, // 橙色 Top Of Rack Switch (兩層設計)
    { type: 'topPowerSupplies', count: 2, height: 0.3, color: '#d97706' }, // 橙色 Power Supplies (上)
    { type: 'computeTrays1', count: 10, height: 0.2, color: '#059669' },   // 綠色 10 Compute Trays
    { type: 'switchTrays', count: 3, height: 0.25, color: '#2563eb' },     // 藍色 3 Switch Trays
    { type: 'computeTrays2', count: 8, height: 0.2, color: '#059669' },    // 綠色 8 Compute Trays
    { type: 'bottomPowerSupplies', count: 2, height: 0.3, color: '#d97706' }, // 橙色 Power Supplies (下)
    { type: 'srcUnits', count: 2, height: 0.25, color: '#7c3aed' }         // 紫色 SRC Units
  ];
  
  // 計算機櫃總高度 - 緊密排列不留多餘空間
  const totalHeight = cabinetStructure.reduce((sum, section) => 
    sum + (config[section.type as keyof CabinetConfig]?.count || section.count) * section.height, 0
  ) + 0.2; // 只添加最小間距
  
  const components = [];
  let currentY = totalHeight / 2 - 0.1; // 從頂部開始
  
  // 組件類型名稱映射
  function getComponentTypeName(type: string): string {
    const typeMap: { [key: string]: string } = {
      'topOfRackSwitch': 'Top Of Rack Switch',
      'computeTrays1': '10 Compute Trays',
      'computeTrays2': '8 Compute Trays', 
      'switchTrays': '3 Switch Trays',
      'topPowerSupplies': 'Power Supplies (上)',
      'bottomPowerSupplies': 'Power Supplies (下)',
      'srcUnits': 'SRC Units'
    };
    return typeMap[type] || type;
  }
  
  // 根據實際結構創建組件
  cabinetStructure.forEach((section) => {
    const sectionConfig = config[section.type as keyof CabinetConfig];
    const actualCount = sectionConfig?.count || section.count;
    const actualColor = sectionConfig?.color || section.color;
    
    for (let i = 0; i < actualCount; i++) {
      // Top Of Rack Switch採用上下兩層設計，不是前後分層
      if (section.type === 'topOfRackSwitch' && actualCount === 2) {
        components.push({
          position: [0, currentY - (i * section.height), 0] as [number, number, number],
          color: actualColor,
          size: [3.8, section.height - 0.02, 1.8] as [number, number, number],
          serialNumber: getSerialNumbers(section.type, actualCount)[i] || `TOR-${i + 1}`,
          componentType: 'Top Of Rack Switch'
        });
      } else {
        components.push({
          position: [0, currentY - (i * section.height), 0] as [number, number, number],
          color: actualColor,
          size: [3.8, section.height - 0.02, 1.8] as [number, number, number],
          serialNumber: getSerialNumbers(section.type, actualCount)[i] || `${section.type.toUpperCase()}-${i + 1}`,
          componentType: getComponentTypeName(section.type)
        });
      }
    }
    
    // 更新當前Y位置 - 所有組件都正常占用垂直空間
    currentY -= actualCount * section.height;
  });
  
  // 計算實際機櫃邊界 - 緊密貼合組件
  const topY = totalHeight / 2 - 0.05; // 減少頂部間距
  const bottomY = currentY + 0.05; // 減少底部間距，消除多餘空間
  const cabinetHeight = topY - bottomY;

  return (
    <group>
      {/* Enhanced Cabinet frame */}
      {!isOpen && (
        <>
          {/* Front glass panel */}
          <mesh position={[0, (topY + bottomY) / 2, 2.1]}>
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
          <mesh position={[0, (topY + bottomY) / 2, -2.1]}>
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
      <mesh position={[-2, (topY + bottomY) / 2, 0]}>
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
      
      <mesh position={[2, (topY + bottomY) / 2, 0]}>
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
      
      {/* Top and bottom panels */}
      <mesh position={[0, topY + 0.05, 0]}>
        <boxGeometry args={[4, 0.1, 4]} />
        <meshPhysicalMaterial 
          color={frameColor} 
          metalness={0.8} 
          roughness={0.2}
          clearcoat={0.6}
        />
      </mesh>
      
      <mesh position={[0, bottomY - 0.05, 0]}>
        <boxGeometry args={[4, 0.1, 4]} />
        <meshPhysicalMaterial 
          color={frameColor} 
          metalness={0.8} 
          roughness={0.2}
          clearcoat={0.6}
        />
      </mesh>

      {/* Rack rails */}
      <mesh position={[-1.8, (topY + bottomY) / 2, 1.8]}>
        <boxGeometry args={[0.05, cabinetHeight - 0.2, 0.1]} />
        <meshPhysicalMaterial color="#333333" metalness={0.9} roughness={0.1} />
      </mesh>
      <mesh position={[1.8, (topY + bottomY) / 2, 1.8]}>
        <boxGeometry args={[0.05, cabinetHeight - 0.2, 0.1]} />
        <meshPhysicalMaterial color="#333333" metalness={0.9} roughness={0.1} />
      </mesh>
      <mesh position={[-1.8, (topY + bottomY) / 2, -1.8]}>
        <boxGeometry args={[0.05, cabinetHeight - 0.2, 0.1]} />
        <meshPhysicalMaterial color="#333333" metalness={0.9} roughness={0.1} />
      </mesh>
      <mesh position={[1.8, (topY + bottomY) / 2, -1.8]}>
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
  
  // 監聽系統資料變化，同步更新機櫃組裝清單中的序號顯示
  useEffect(() => {
    const updateComponentMappingWithLatestSerialNumbers = () => {
      if (!systems || systems.length === 0) return;
      
      const updatedMapping = { ...componentSystemMapping };
      let hasChanges = false;
      
      // 檢查並更新每個映射的序號資料
      Object.keys(updatedMapping).forEach(key => {
        const mappingData = updatedMapping[key];
        // 根據系統ID找到最新的系統資料
        const currentSystem = systems.find(s => s.id === mappingData.systemId);
        
        if (currentSystem) {
          // 如果系統的序號資料有變更，更新映射
          const currentSerialNumber = currentSystem.serial_number || currentSystem.system_name;
          if (mappingData.serialNumber !== currentSerialNumber) {
            updatedMapping[key] = {
              ...mappingData,
              systemName: currentSystem.system_name,
              serialNumber: currentSerialNumber
            };
            hasChanges = true;
          }
        }
      });
      
      // 如果有變更，更新狀態和本地存儲
      if (hasChanges) {
        setComponentSystemMapping(updatedMapping);
        localStorage.setItem('l11-cabinet-componentSystemMapping', JSON.stringify(updatedMapping));
      }
    };
    
    updateComponentMappingWithLatestSerialNumbers();
  }, [systems, componentSystemMapping]);
  
  const [config, setConfig] = useState<CabinetConfig>(() => {
    const savedConfig = localStorage.getItem('l11-cabinet-config');
    return savedConfig ? JSON.parse(savedConfig) : {
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

  // 處理選擇機台系統
  const handleSelectSystem = (componentType: string, componentSn: string) => {
    setSystemSelectionDialog({
      open: true,
      componentType,
      componentSn
    });
  };

  // 處理系統選擇確認
  const handleSystemSelection = (system: any) => {
    const key = `${systemSelectionDialog.componentType}-${systemSelectionDialog.componentSn}`;
    const currentSerialNumber = system.serial_number || system.system_name;
    
    const newMapping = {
      ...componentSystemMapping,
      [key]: {
        systemId: system.id,
        systemName: system.system_name,
        serialNumber: currentSerialNumber
      }
    };
    
    setComponentSystemMapping(newMapping);
    localStorage.setItem('l11-cabinet-componentSystemMapping', JSON.stringify(newMapping));
    
    setSystemSelectionDialog({
      open: false,
      componentType: '',
      componentSn: ''
    });
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
                     {getSerialNumbers('topOfRackSwitch', config.topOfRackSwitch.count).map((sn, index) => (
                       <div key={sn} className="text-sm font-mono bg-blue-50 dark:bg-blue-950 px-3 py-2 rounded border hover:bg-blue-100 dark:hover:bg-blue-900 cursor-pointer transition-colors">
                         <div className="font-medium">#{index + 1}</div>
                         <div className="text-blue-600 dark:text-blue-400 font-bold">{sn}</div>
                           <div className="mt-1 space-y-1">
                             {componentSystemMapping[`Top Of Rack Switch-${sn}`] && (
                                <div className="text-xs text-green-600 dark:text-green-400 font-medium">
                                  <div>已配置: {componentSystemMapping[`Top Of Rack Switch-${sn}`].systemName}</div>
                                  <div className="text-blue-600 dark:text-blue-400 font-mono">
                                    測試追蹤序號: {componentSystemMapping[`Top Of Rack Switch-${sn}`].serialNumber}
                                  </div>
                                  <div className="text-gray-500 dark:text-gray-400 text-xs">
                                    機櫃組件: {sn}
                                  </div>
                                </div>
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
                     {getSerialNumbers('switchTrays', config.switchTrays.count).map((sn, index) => (
                       <div key={sn} className="text-sm font-mono bg-blue-50 dark:bg-blue-950 px-3 py-2 rounded border hover:bg-blue-100 dark:hover:bg-blue-900 cursor-pointer transition-colors">
                         <div className="font-medium">#{index + 1}</div>
                         <div className="text-blue-600 dark:text-blue-400 font-bold">{sn}</div>
                            <div className="mt-1 space-y-1">
                              {componentSystemMapping[`3 Switch Trays-${sn}`] && (
                                 <div className="text-xs text-green-600 dark:text-green-400 font-medium">
                                   <div>已配置: {componentSystemMapping[`3 Switch Trays-${sn}`].systemName}</div>
                                   <div className="text-blue-600 dark:text-blue-400 font-mono">
                                     測試追蹤序號: {componentSystemMapping[`3 Switch Trays-${sn}`].serialNumber}
                                   </div>
                                   <div className="text-gray-500 dark:text-gray-400 text-xs">
                                     機櫃組件: {sn}
                                   </div>
                                 </div>
                              )}
                             <Button 
                               variant="ghost" 
                               size="sm" 
                               className="w-full text-xs h-6"
                               onClick={() => handleSelectSystem('3 Switch Trays', sn)}
                             >
                               {componentSystemMapping[`3 Switch Trays-${sn}`] ? '重新選擇' : '選擇機台'}
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
                     {getSerialNumbers('computeTrays1', config.computeTrays1.count).map((sn, index) => (
                       <div key={sn} className="text-sm font-mono bg-emerald-50 dark:bg-emerald-950 px-3 py-2 rounded border hover:bg-emerald-100 dark:hover:bg-emerald-900 cursor-pointer transition-colors">
                         <div className="font-medium">#{index + 1}</div>
                         <div className="text-emerald-600 dark:text-emerald-400 font-bold">{sn}</div>
                           <div className="mt-1 space-y-1">
                             {componentSystemMapping[`10 Compute Trays-${sn}`] && (
                                <div className="text-xs text-green-600 dark:text-green-400 font-medium">
                                  <div>已配置: {componentSystemMapping[`10 Compute Trays-${sn}`].systemName}</div>
                                  <div className="text-emerald-600 dark:text-emerald-400 font-mono">
                                    測試追蹤序號: {componentSystemMapping[`10 Compute Trays-${sn}`].serialNumber}
                                  </div>
                                  <div className="text-gray-500 dark:text-gray-400 text-xs">
                                    機櫃組件: {sn}
                                  </div>
                                </div>
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
                     {getSerialNumbers('computeTrays2', config.computeTrays2.count).map((sn, index) => (
                       <div key={sn} className="text-sm font-mono bg-emerald-50 dark:bg-emerald-950 px-3 py-2 rounded border hover:bg-emerald-100 dark:hover:bg-emerald-900 cursor-pointer transition-colors">
                         <div className="font-medium">#{index + 1}</div>
                         <div className="text-emerald-600 dark:text-emerald-400 font-bold">{sn}</div>
                           <div className="mt-1 space-y-1">
                              {componentSystemMapping[`8 Compute Trays-${sn}`] && (
                                <div className="text-xs text-green-600 dark:text-green-400 font-medium">
                                  <div>已配置: {componentSystemMapping[`8 Compute Trays-${sn}`].systemName}</div>
                                  <div className="text-emerald-600 dark:text-emerald-400 font-mono">
                                    測試追蹤序號: {componentSystemMapping[`8 Compute Trays-${sn}`].serialNumber}
                                  </div>
                                  <div className="text-gray-500 dark:text-gray-400 text-xs">
                                    機櫃組件: {sn}
                                  </div>
                                </div>
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
                     {getSerialNumbers('topPowerSupplies', config.topPowerSupplies.count).map((sn, index) => (
                       <div key={sn} className="text-sm font-mono bg-amber-50 dark:bg-amber-950 px-3 py-2 rounded border hover:bg-amber-100 dark:hover:bg-amber-900 cursor-pointer transition-colors">
                         <div className="font-medium">#{index + 1}</div>
                         <div className="text-amber-600 dark:text-amber-400 font-bold">{sn}</div>
                           <div className="mt-1 space-y-1">
                              {componentSystemMapping[`Power Supplies (上)-${sn}`] && (
                                <div className="text-xs text-green-600 dark:text-green-400 font-medium">
                                  <div>已配置: {componentSystemMapping[`Power Supplies (上)-${sn}`].systemName}</div>
                                  <div className="text-amber-600 dark:text-amber-400 font-mono">
                                    測試追蹤序號: {componentSystemMapping[`Power Supplies (上)-${sn}`].serialNumber}
                                  </div>
                                  <div className="text-gray-500 dark:text-gray-400 text-xs">
                                    機櫃組件: {sn}
                                  </div>
                                </div>
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
                     {getSerialNumbers('bottomPowerSupplies', config.bottomPowerSupplies.count).map((sn, index) => (
                       <div key={sn} className="text-sm font-mono bg-amber-50 dark:bg-amber-950 px-3 py-2 rounded border hover:bg-amber-100 dark:hover:bg-amber-900 cursor-pointer transition-colors">
                         <div className="font-medium">#{index + 1}</div>
                         <div className="text-amber-600 dark:text-amber-400 font-bold">{sn}</div>
                           <div className="mt-1 space-y-1">
                              {componentSystemMapping[`Power Supplies (下)-${sn}`] && (
                                <div className="text-xs text-green-600 dark:text-green-400 font-medium">
                                  <div>已配置: {componentSystemMapping[`Power Supplies (下)-${sn}`].systemName}</div>
                                  <div className="text-amber-600 dark:text-amber-400 font-mono">
                                    測試追蹤序號: {componentSystemMapping[`Power Supplies (下)-${sn}`].serialNumber}
                                  </div>
                                  <div className="text-gray-500 dark:text-gray-400 text-xs">
                                    機櫃組件: {sn}
                                  </div>
                                </div>
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
                   {getSerialNumbers('srcUnits', config.srcUnits.count).map((sn, index) => (
                     <div key={sn} className="text-sm font-mono bg-purple-50 dark:bg-purple-950 px-3 py-2 rounded border hover:bg-purple-100 dark:hover:bg-purple-900 cursor-pointer transition-colors">
                       <div className="font-medium">#{index + 1}</div>
                       <div className="text-purple-600 dark:text-purple-400 font-bold">{sn}</div>
                         <div className="mt-1 space-y-1">
                            {componentSystemMapping[`SRC Units-${sn}`] && (
                              <div className="text-xs text-green-600 dark:text-green-400 font-medium">
                                <div>已配置: {componentSystemMapping[`SRC Units-${sn}`].systemName}</div>
                                <div className="text-purple-600 dark:text-purple-400 font-mono">
                                  測試追蹤序號: {componentSystemMapping[`SRC Units-${sn}`].serialNumber}
                                </div>
                                <div className="text-gray-500 dark:text-gray-400 text-xs">
                                  機櫃組件: {sn}
                                </div>
                              </div>
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
        onSystemSelect={handleSystemSelection}
      />
    </div>
  );
}
