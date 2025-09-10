
import React, { Suspense, useState, useEffect, useCallback, useRef } from 'react';
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
import { useGlobalSystemAllocation } from '@/hooks/useGlobalSystemAllocation';
import { supabase } from '@/integrations/supabase/client';
import * as THREE from 'three';
import { useNavigate } from 'react-router-dom';
import { CabinetAssemblyManualInput } from './CabinetAssemblyManualInput';

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
  serial_number?: string;
  model?: string;
  current_station?: string;
  status?: string;
  assigned_engineer?: string;
  overall_progress?: number;
  team?: string;
  cabinet?: string;
  bom_90?: string;
  bmc_address?: string;
  old_bmc_address?: string;
  os_mac_address?: string; // NIC MAC Address
  ubuntu_version?: string;
  cuda_version?: string;
  created_at?: string;
  updated_at?: string;
  actual_started_at?: string;
  actual_completed_at?: string;
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

function CabinetScene({ config, isOpen, selectedComponent, onComponentClick, componentSystemMapping }: CabinetSceneProps & { componentSystemMapping: ComponentSystemMapping }) {
  const { gl, scene } = useThree();
  
  // 清理函數
  useEffect(() => {
    return () => {
      // 清理Three.js資源
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry?.dispose();
          if (object.material) {
            if (Array.isArray(object.material)) {
              object.material.forEach(material => material.dispose());
            } else {
              object.material.dispose();
            }
          }
        }
      });
      
      // 清理渲染器資源
      gl.dispose();
    };
  }, [gl, scene]);

  const frameColor = '#1a1a1a';
  
  // 根據圖像重新定義機櫃結構 - 從上到下的實際排列順序
  const cabinetStructure = [
    { type: 'topOfRackSwitch', count: 1, height: 0.25, color: '#8b5cf6' }, // 紫色 Top Of Rack Switch (高層設計)
    { type: 'topPowerSupplies', count: 2, height: 0.3, color: '#f59e0b' }, // 橙色 Power Supplies (上)
    { type: 'computeTrays1', count: 10, height: 0.2, color: '#10b981' },   // 綠色 10 Compute Trays
    { type: 'switchTrays', count: 3, height: 0.25, color: '#3b82f6' },     // 藍色 3 Switch Trays
    { type: 'computeTrays2', count: 8, height: 0.2, color: '#10b981' },    // 綠色 8 Compute Trays
    { type: 'bottomPowerSupplies', count: 2, height: 0.3, color: '#f59e0b' }, // 橙色 Power Supplies (下)
    { type: 'srcUnits', count: 2, height: 0.25, color: '#8b5cf6' }         // 紫色 SRC Units
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
      const componentTypeName = getComponentTypeName(section.type);
      const defaultSerial = getSerialNumbers(section.type, actualCount)[i] || `${section.type.toUpperCase()}-${i + 1}`;
      
      // 檢查是否有映射的系統序列號
      const mappingKey = `${componentTypeName}-${defaultSerial}`;
      const mappedSystem = componentSystemMapping[mappingKey];
      
      // 使用映射的系統序列號，如果沒有則使用預設序列號
      const displaySerial = mappedSystem?.serialNumber || defaultSerial;
      
      components.push({
        position: [0, currentY - (i * section.height), 0] as [number, number, number],
        color: actualColor,
        size: [3.8, section.height - 0.02, 1.8] as [number, number, number],
        serialNumber: displaySerial,
        componentType: componentTypeName
      });
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

function ErrorFallback({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="h-[600px] rounded-lg border bg-slate-900 flex items-center justify-center">
      <div className="text-white text-center space-y-4">
        <h3 className="text-lg font-semibold mb-2">3D顯示載入失敗</h3>
        <p className="text-sm text-slate-400">可能是由於瀏覽器兼容性或內存不足造成</p>
        <div className="flex gap-2 justify-center">
          {onRetry && (
            <Button onClick={onRetry} variant="outline" size="sm">
              重新載入
            </Button>
          )}
          <Button onClick={() => window.location.reload()} variant="default" size="sm">
            重新整理頁面
          </Button>
        </div>
      </div>
    </div>
  );
}

export function L11CabinetDisplay({ cabinetId: initialCabinetId }: { cabinetId?: string }) {
  const { systems } = useUnifiedData();
  const navigate = useNavigate();
  const { getAvailableSystems, allocateSystem, deallocateComponent, deallocateSystem, getCabinetAllocations } = useGlobalSystemAllocation();
  
  // 使用ref來防止內存洩漏和狀態循環
  const canvasRef = useRef<HTMLDivElement>(null);
  const [sceneError, setSceneError] = useState(false);
  const [canvasKey, setCanvasKey] = useState(0); // 用於強制重新創建Canvas
  
  // 機櫃狀態管理 - 使用傳入的機櫃ID或默認值
  const currentCabinetId = initialCabinetId || 'cabinet-001';
  
  // 從localStorage讀取和保存狀態 - 為每個機櫃獨立存儲
  const getStorageKey = useCallback((key: string) => 
    currentCabinetId ? `${key}-${currentCabinetId}` : key
  , [currentCabinetId]);
  
  // 讀取全域預設配置
  const getGlobalDefaultConfig = (): CabinetConfig => {
    const globalDefault = localStorage.getItem('l11-cabinet-global-default-config');
    if (globalDefault) {
      return JSON.parse(globalDefault);
    }
    // 根據圖片更新預設配置
    return {
      topOfRackSwitch: { 
        count: 1, 
        color: '#8b5cf6'  // 紫色
      },
      topPowerSupplies: { 
        count: 2, 
        color: '#f59e0b'  // 橙色
      },
      computeTrays1: { 
        count: 10, 
        color: '#10b981'  // 綠色
      },
      switchTrays: { 
        count: 3, 
        color: '#3b82f6'  // 藍色
      },
      computeTrays2: { 
        count: 8, 
        color: '#10b981'  // 綠色
      },
      bottomPowerSupplies: { 
        count: 2, 
        color: '#f59e0b'  // 橙色
      },
      srcUnits: { 
        count: 2, 
        color: '#8b5cf6'  // 紫色
      }
    };
  };

  // 默認配置
  const getDefaultConfig = (): CabinetConfig => getGlobalDefaultConfig();

  // 從localStorage讀取指定機櫃的配置
  const loadCabinetConfig = useCallback((cabinetId: string): CabinetConfig => {
    const savedConfig = localStorage.getItem(`l11-cabinet-config-${cabinetId}`);
    return savedConfig ? JSON.parse(savedConfig) : getDefaultConfig();
  }, []);

  const [config, setConfig] = useState<CabinetConfig>(() => {
    return loadCabinetConfig(currentCabinetId);
  });
  
  const [autoRotate, setAutoRotate] = useState(() => {
    const saved = localStorage.getItem(getStorageKey('l11-cabinet-autoRotate'));
    return saved ? JSON.parse(saved) : true;
  });
  
  const [isOpen, setIsOpen] = useState(() => {
    const saved = localStorage.getItem(getStorageKey('l11-cabinet-isOpen'));
    return saved ? JSON.parse(saved) : true;
  });
  
  const [selectedComponent, setSelectedComponent] = useState<SelectedComponent | null>(() => {
    const saved = localStorage.getItem(getStorageKey('l11-cabinet-selectedComponent'));
    return saved ? JSON.parse(saved) : null;
  });

  // 組件到系統的映射 - 為每個機櫃獨立存儲
  const [componentSystemMapping, setComponentSystemMapping] = useState<ComponentSystemMapping>(() => {
    const saved = localStorage.getItem(getStorageKey('l11-cabinet-componentSystemMapping'));
    return saved ? JSON.parse(saved) : {};
  });

  // 當機櫃ID改變時，重新載入所有配置
  useEffect(() => {
    const newConfig = loadCabinetConfig(currentCabinetId);
    setConfig(newConfig);
    
    const newAutoRotate = localStorage.getItem(getStorageKey('l11-cabinet-autoRotate'));
    setAutoRotate(newAutoRotate ? JSON.parse(newAutoRotate) : true);
    
    const newIsOpen = localStorage.getItem(getStorageKey('l11-cabinet-isOpen'));
    setIsOpen(newIsOpen ? JSON.parse(newIsOpen) : true);
    
    const newSelectedComponent = localStorage.getItem(getStorageKey('l11-cabinet-selectedComponent'));
    setSelectedComponent(newSelectedComponent ? JSON.parse(newSelectedComponent) : null);
    
    const newComponentSystemMapping = localStorage.getItem(getStorageKey('l11-cabinet-componentSystemMapping'));
    setComponentSystemMapping(newComponentSystemMapping ? JSON.parse(newComponentSystemMapping) : {});
  }, [currentCabinetId, loadCabinetConfig, getStorageKey]);

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
          localStorage.setItem(getStorageKey('l11-cabinet-componentSystemMapping'), JSON.stringify(updatedMapping));
        }
    };
    
    updateComponentMappingWithLatestSerialNumbers();
  }, [systems, componentSystemMapping, getStorageKey]);
  
  // 創建模擬的系統進度數據
  const systemProgress = systems.map(system => ({
    system,
    progress: system.overall_progress || 0,
    status: system.status || 'Not Start',
    test_items_completed: Math.floor((system.overall_progress || 0) / 10),
    test_items_total: 10
  }));


  // 自動保存狀態到localStorage - 使用機櫃ID特定的key
  useEffect(() => {
    localStorage.setItem(getStorageKey('l11-cabinet-autoRotate'), JSON.stringify(autoRotate));
  }, [autoRotate, getStorageKey]);

  useEffect(() => {
    localStorage.setItem(getStorageKey('l11-cabinet-isOpen'), JSON.stringify(isOpen));
  }, [isOpen, getStorageKey]);

  // 使用防抖機制優化localStorage同步，並添加錯誤處理
  useEffect(() => {
    if (!selectedComponent) return;
    
    const debounced = setTimeout(() => {
      try {
        localStorage.setItem(getStorageKey('l11-cabinet-selectedComponent'), JSON.stringify(selectedComponent));
      } catch (error) {
        console.warn('Failed to save selectedComponent to localStorage:', error);
      }
    }, 300);
    return () => clearTimeout(debounced);
  }, [selectedComponent, getStorageKey]);

  useEffect(() => {
    const debounced = setTimeout(() => {
      try {
        localStorage.setItem(getStorageKey('l11-cabinet-config'), JSON.stringify(config));
      } catch (error) {
        console.warn('Failed to save config to localStorage:', error);
      }
    }, 300);
    return () => clearTimeout(debounced);
  }, [config, getStorageKey]);

  useEffect(() => {
    const debounced = setTimeout(() => {
      try {
        localStorage.setItem(getStorageKey('l11-cabinet-componentSystemMapping'), JSON.stringify(componentSystemMapping));
      } catch (error) {
        console.warn('Failed to save componentSystemMapping to localStorage:', error);
      }
    }, 300);
    return () => clearTimeout(debounced);
  }, [componentSystemMapping, getStorageKey]);
  
  // 添加組件卸載時的清理
  useEffect(() => {
    return () => {
      // 清理任何可能存在的定時器或監聽器
      setSceneError(false);
    };
  }, []);
  
  const handleReset = useCallback(() => {
    try {
      setAutoRotate(true);
      localStorage.setItem(getStorageKey('l11-cabinet-autoRotate'), JSON.stringify(true));
      // 重置3D場景錯誤狀態
      setSceneError(false);
      setCanvasKey(prev => prev + 1); // 強制重新創建Canvas
    } catch (error) {
      console.error('Error during reset:', error);
    }
  }, [getStorageKey]);

  // 改進錯誤處理，當Canvas無法載入時顯示簡化版本
  const [canvasError, setCanvasError] = useState(false);
  
  const handleCanvasError = useCallback(() => {
    console.warn('Canvas failed to initialize, showing fallback');
    setCanvasError(true);
  }, []);
  
  const handleRetryCanvas = useCallback(() => {
    setCanvasError(false);
    setSceneError(false);
    setCanvasKey(prev => prev + 1);
  }, []);

  const handleComponentClick = async (componentType: string, serialNumber: string) => {
    // 檢查是否有映射的系統
    const mappingKey = `${componentType}-${serialNumber}`;
    const mappedSystem = componentSystemMapping[mappingKey];
    
    let details: SystemDetails | undefined;
    if (mappedSystem) {
      // 如果有映射的系統，使用該系統的完整資訊
      const system = systems.find(s => s.id === mappedSystem.systemId);
      if (system) {
        details = {
          system_name: system.system_name,
          model: system.model || 'GB300',
          current_station: system.current_station,
          status: system.status,
          assigned_engineer: system.assigned_engineer,
          overall_progress: system.overall_progress,
          team: '未設定', // 該欄位在系統中不存在
          bmc_address: '未設定', // 該欄位在系統中不存在
          os_mac_address: '未設定', // 該欄位在系統中不存在
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
    localStorage.setItem(getStorageKey('l11-cabinet-selectedComponent'), JSON.stringify(newSelectedComponent));
  };

  const handleConfigChange = (newConfig: CabinetConfig) => {
    setConfig(newConfig);
    localStorage.setItem(getStorageKey('l11-cabinet-config'), JSON.stringify(newConfig));
  };

  const handleIsOpenChange = (newIsOpen: boolean) => {
    setIsOpen(newIsOpen);
    localStorage.setItem(getStorageKey('l11-cabinet-isOpen'), JSON.stringify(newIsOpen));
  };

  const handleSelectedComponentClear = () => {
    setSelectedComponent(null);
    localStorage.removeItem(getStorageKey('l11-cabinet-selectedComponent'));
  };

  // 處理選擇機台系統
  const handleSelectSystem = (componentType: string, componentSn: string) => {
    setSystemSelectionDialog({
      open: true,
      componentType,
      componentSn
    });
  };

  // 處理全清除系統映射
  const handleClearAllSystemMappings = useCallback(() => {
    if (Object.keys(componentSystemMapping).length === 0) {
      alert('目前沒有已配置的系統需要清除');
      return;
    }

    const confirmed = window.confirm('確定要清除所有已配置的系統映射嗎？此操作不可復原。');
    if (!confirmed) return;

    try {
      // 清除全域分配
      Object.entries(componentSystemMapping).forEach(([key, mapping]) => {
        deallocateSystem(mapping.systemId, currentCabinetId || 'default');
      });

      // 清除本地映射
      setComponentSystemMapping({});
      localStorage.removeItem(getStorageKey('l11-cabinet-componentSystemMapping'));

      // 清除選中的組件
      setSelectedComponent(null);
      localStorage.removeItem(getStorageKey('l11-cabinet-selectedComponent'));

      alert('已成功清除所有系統映射');
    } catch (error) {
      console.error('清除系統映射時發生錯誤:', error);
      alert('清除失敗，請重試');
    }
  }, [componentSystemMapping, currentCabinetId, deallocateSystem, getStorageKey]);

  // 處理系統選擇確認，添加錯誤處理
  const handleSystemSelection = useCallback((system: any) => {
    try {
      const currentSerialNumber = system.serial_number || system.system_name;
      const key = `${systemSelectionDialog.componentType}-${systemSelectionDialog.componentSn}`;
      
      // 檢查全域分配
      const canAllocate = allocateSystem(
        system.id,
        system.system_name,
        currentCabinetId || 'default',
        systemSelectionDialog.componentType,
        systemSelectionDialog.componentSn
      );
      
      if (!canAllocate) {
        alert('該系統已分配到其他機櫃，無法重複分配');
        return;
      }
      
      const newMapping = {
        ...componentSystemMapping,
        [key]: {
          systemId: system.id,
          systemName: system.system_name,
          serialNumber: currentSerialNumber
        }
      };
      
      setComponentSystemMapping(newMapping);
      
      setSystemSelectionDialog({
        open: false,
        componentType: '',
        componentSn: ''
      });
    } catch (error) {
      console.error('Error during system selection:', error);
      alert('系統選擇過程中發生錯誤，請重試');
    }
  }, [systemSelectionDialog, componentSystemMapping, allocateSystem, currentCabinetId]);


  const totalComponents = config.computeTrays1.count + config.computeTrays2.count;
  const totalSwitches = config.topOfRackSwitch.count + config.switchTrays.count;
  const totalPowerSupplies = config.topPowerSupplies.count + config.bottomPowerSupplies.count;
  const totalSrcUnits = config.srcUnits.count;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            機櫃管理中心 - {currentCabinetId}
          </h1>
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
            <div className="h-[600px] rounded-lg overflow-hidden border bg-gradient-to-b from-slate-900 to-slate-800 shadow-2xl" ref={canvasRef}>
              {sceneError || canvasError ? (
                <ErrorFallback onRetry={handleRetryCanvas} />
              ) : (
                <Suspense fallback={<div className="h-full flex items-center justify-center text-white">載入中...</div>}>
                  <Canvas
                    key={`canvas-${canvasKey}-${currentCabinetId}`}
                    camera={{ position: [8, 3, 8], fov: 50 }}
                    style={{ 
                      background: 'radial-gradient(ellipse at center, #1e293b 0%, #0f172a 70%, #020617 100%)',
                    }}
                    shadows={true}
                    gl={{ 
                      antialias: true, 
                      alpha: true,
                      powerPreference: "high-performance",
                      failIfMajorPerformanceCaveat: false
                    }}
                    onCreated={(state) => {
                      try {
                        // 設置錯誤處理
                        state.gl.domElement.addEventListener('webglcontextlost', (e) => {
                          console.warn('WebGL context lost, attempting to restore...');
                          e.preventDefault();
                          setSceneError(true);
                        });
                        
                        state.gl.domElement.addEventListener('webglcontextrestored', () => {
                          console.log('WebGL context restored');
                          setSceneError(false);
                        });
                        
                        console.log('Canvas initialized successfully');
                      } catch (error) {
                        console.error('Error setting up canvas:', error);
                        handleCanvasError();
                      }
                    }}
                    onError={(error) => {
                      console.error('Canvas error:', error);
                      handleCanvasError();
                    }}
                  >
                    <Suspense fallback={null}>
                      <CabinetScene 
                        config={config} 
                        isOpen={isOpen} 
                        selectedComponent={selectedComponent} 
                        onComponentClick={handleComponentClick}
                        componentSystemMapping={componentSystemMapping}
                      />
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
              )}
            </div>
            
            {/* Selected Component Display */}
            {selectedComponent && (
              <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-3">選中組件詳細資訊</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
                  <div>
                    <span className="font-medium text-blue-800 dark:text-blue-200">組件類型:</span>
                    <p className="text-gray-700 dark:text-gray-300">{selectedComponent.type}</p>
                  </div>
                  <div>
                    <span className="font-medium text-blue-800 dark:text-blue-200">序列號:</span>
                    <p className="text-yellow-500 dark:text-yellow-400 font-mono font-bold">{selectedComponent.sn}</p>
                  </div>
                  <div>
                    <span className="font-medium text-blue-800 dark:text-blue-200">機櫃位置:</span>
                    <p className="text-gray-700 dark:text-gray-300">{currentCabinetId || '未指定'}</p>
                  </div>
                  
                  {selectedComponent.details ? (
                    <>
                      <div>
                        <span className="font-medium text-blue-800 dark:text-blue-200">系統名稱:</span>
                        <p className="text-gray-700 dark:text-gray-300">{selectedComponent.details.system_name || 'N/A'}</p>
                      </div>
                      <div>
                        <span className="font-medium text-blue-800 dark:text-blue-200">系統序號:</span>
                        <p className="text-gray-700 dark:text-gray-300 font-mono">{selectedComponent.details.serial_number || 'N/A'}</p>
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
                        <span className="font-medium text-blue-800 dark:text-blue-200">整體進度:</span>
                        <div className="flex items-center gap-2">
                          <p className="text-gray-700 dark:text-gray-300">{selectedComponent.details.overall_progress || 0}%</p>
                          <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                            <div 
                              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${selectedComponent.details.overall_progress || 0}%` }}
                            ></div>
                          </div>
                        </div>
                      </div>
                      <div>
                        <span className="font-medium text-blue-800 dark:text-blue-200">指派工程師:</span>
                        <p className="text-gray-700 dark:text-gray-300">{selectedComponent.details.assigned_engineer || '未指派'}</p>
                      </div>
                      {selectedComponent.details.team && (
                        <div>
                          <span className="font-medium text-blue-800 dark:text-blue-200">團隊:</span>
                          <p className="text-gray-700 dark:text-gray-300">{selectedComponent.details.team}</p>
                        </div>
                      )}
                      {selectedComponent.details.cabinet && (
                        <div>
                          <span className="font-medium text-blue-800 dark:text-blue-200">所屬機櫃:</span>
                          <p className="text-gray-700 dark:text-gray-300">{selectedComponent.details.cabinet}</p>
                        </div>
                      )}
                      {selectedComponent.details.bom_90 && (
                        <div>
                          <span className="font-medium text-blue-800 dark:text-blue-200">BOM-90:</span>
                          <p className="text-gray-700 dark:text-gray-300">{selectedComponent.details.bom_90}</p>
                        </div>
                      )}
                      {selectedComponent.details.bmc_address && (
                        <div>
                          <span className="font-medium text-blue-800 dark:text-blue-200">BMC地址:</span>
                          <p className="text-gray-700 dark:text-gray-300 font-mono">{selectedComponent.details.bmc_address}</p>
                        </div>
                      )}
                      {selectedComponent.details.old_bmc_address && (
                        <div>
                          <span className="font-medium text-blue-800 dark:text-blue-200">舊BMC地址:</span>
                          <p className="text-gray-700 dark:text-gray-300 font-mono">{selectedComponent.details.old_bmc_address}</p>
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
                      {selectedComponent.details.created_at && (
                        <div>
                          <span className="font-medium text-blue-800 dark:text-blue-200">建立時間:</span>
                          <p className="text-gray-700 dark:text-gray-300">
                            {new Date(selectedComponent.details.created_at).toLocaleString('zh-TW')}
                          </p>
                        </div>
                      )}
                      {selectedComponent.details.updated_at && (
                        <div>
                          <span className="font-medium text-blue-800 dark:text-blue-200">更新時間:</span>
                          <p className="text-gray-700 dark:text-gray-300">
                            {new Date(selectedComponent.details.updated_at).toLocaleString('zh-TW')}
                          </p>
                        </div>
                      )}
                      {selectedComponent.details.actual_started_at && (
                        <div>
                          <span className="font-medium text-blue-800 dark:text-blue-200">實際開始時間:</span>
                          <p className="text-gray-700 dark:text-gray-300">
                            {new Date(selectedComponent.details.actual_started_at).toLocaleString('zh-TW')}
                          </p>
                        </div>
                      )}
                      {selectedComponent.details.actual_completed_at && (
                        <div>
                          <span className="font-medium text-blue-800 dark:text-blue-200">實際完成時間:</span>
                          <p className="text-gray-700 dark:text-gray-300">
                            {new Date(selectedComponent.details.actual_completed_at).toLocaleString('zh-TW')}
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="lg:col-span-3">
                      <span className="text-amber-600 dark:text-amber-400">尚未分配系統</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-2 mt-4">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleSelectedComponentClear}
                  >
                    清除選擇
                  </Button>
                  {selectedComponent.details && (
                    <Button 
                      variant="default" 
                      size="sm" 
                      onClick={() => {
                        // 導航到測試追蹤頁面並聚焦該系統
                        window.open(`/test-tracker?focus=${selectedComponent.details?.system_name}`, '_blank');
                      }}
                    >
                      查看測試進度
                    </Button>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Configuration Panel */}
        <div className="lg:col-span-2 space-y-6">
          <CabinetConfigurator 
            config={config} 
            onConfigChange={handleConfigChange}
            cabinetId={currentCabinetId}
          />
          
        </div>
      </div>
      
      {/* 機櫃組裝清單 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>機櫃組裝清單</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearAllSystemMappings}
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              全清除選擇
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* 網路交換設備 - 手動輸入SN和MAC */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="h-4 w-4 bg-blue-500 rounded"></div>
                <h3 className="text-lg font-semibold text-blue-600">網路交換設備</h3>
              </div>
              <div className="pl-7 space-y-4">
                <CabinetAssemblyManualInput
                  componentType="topOfRackSwitch"
                  componentName="Top Of Rack Switch (高層設計)"
                  count={config.topOfRackSwitch.count}
                  color={config.topOfRackSwitch.color}
                  cabinetId={currentCabinetId}
                />
                <CabinetAssemblyManualInput
                  componentType="switchTrays"
                  componentName="Switch Trays"
                  count={config.switchTrays.count}
                  color={config.switchTrays.color}
                  cabinetId={currentCabinetId}
                />
              </div>
            </div>

            {/* 電源供應單元 - 手動輸入SN和MAC */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="h-4 w-4 bg-amber-500 rounded"></div>
                <h3 className="text-lg font-semibold text-amber-600">電源供應單元</h3>
              </div>
              <div className="pl-7 space-y-4">
                <CabinetAssemblyManualInput
                  componentType="topPowerSupplies"
                  componentName="Power Supplies (上)"
                  count={config.topPowerSupplies.count}
                  color={config.topPowerSupplies.color}
                  cabinetId={currentCabinetId}
                />
                <CabinetAssemblyManualInput
                  componentType="bottomPowerSupplies"
                  componentName="Power Supplies (下)"
                  count={config.bottomPowerSupplies.count}
                  color={config.bottomPowerSupplies.color}
                  cabinetId={currentCabinetId}
                />
              </div>
            </div>

            {/* SRC單元 - 手動輸入SN和MAC */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="h-4 w-4 bg-violet-500 rounded"></div>
                <h3 className="text-lg font-semibold text-violet-600">SRC單元</h3>
              </div>
              <div className="pl-7">
                <CabinetAssemblyManualInput
                  componentType="srcUnits"
                  componentName="SRC Units"
                  count={config.srcUnits.count}
                  color={config.srcUnits.color}
                  cabinetId={currentCabinetId}
                />
              </div>
            </div>

            {/* 運算單元 - 只有運算單元可以選擇機台 */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="h-4 w-4 bg-emerald-500 rounded"></div>
                <h3 className="text-lg font-semibold text-emerald-600">運算單元</h3>
                <Badge variant="outline">
                  {Object.keys(componentSystemMapping).filter(key => 
                    key.includes('10 Compute Trays') || key.includes('8 Compute Trays')
                  ).length} / {config.computeTrays1.count + config.computeTrays2.count} 已配置
                </Badge>
              </div>
              <div className="pl-7 space-y-2">
                <div>
                  <h4 className="font-medium mb-2">10 Compute Trays ({config.computeTrays1.count} 層)</h4>
                   <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                     {Array.from({length: config.computeTrays1.count}).map((_, index) => {
                       const configuredMapping = Object.entries(componentSystemMapping)
                         .find(([key]) => key === `10 Compute Trays-CT1-${String(index + 1).padStart(3, '0')}`);
                       
                       if (configuredMapping) {
                         const [key, mapping] = configuredMapping;
                         return (
                           <div key={key} className="text-sm font-mono bg-emerald-50 dark:bg-emerald-950 px-3 py-2 rounded border hover:bg-emerald-100 dark:hover:bg-emerald-900 cursor-pointer transition-colors">
                             <div className="font-medium">#{index + 1}</div>
                              <div className="text-yellow-500 dark:text-yellow-400 font-bold">{mapping.serialNumber}</div>
                             <div className="mt-1 space-y-1">
                               <div className="text-xs text-green-600 dark:text-green-400 font-medium">
                                 <div>系統: {mapping.systemName}</div>
                               </div>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="w-full text-xs h-6"
                                  onClick={() => handleSelectSystem('10 Compute Trays', `CT1-${String(index + 1).padStart(3, '0')}`)}
                                >
                                  重新選擇
                                </Button>
                             </div>
                           </div>
                         );
                       }

                       return (
                         <div key={`empty-ct1-${index}`} className="text-sm font-mono bg-gray-50 dark:bg-gray-950 px-3 py-2 rounded border border-dashed hover:bg-gray-100 dark:hover:bg-gray-900 cursor-pointer transition-colors">
                           <div className="font-medium">#{index + 1}</div>
                           <div className="text-gray-500 dark:text-gray-400">未配置</div>
                           <Button 
                             variant="ghost" 
                             size="sm" 
                             className="w-full text-xs h-6 mt-1"
                             onClick={() => handleSelectSystem('10 Compute Trays', `CT1-${String(index + 1).padStart(3, '0')}`)}
                           >
                             選擇機台
                           </Button>
                         </div>
                       );
                     })}
                   </div>
                </div>
                <div>
                  <h4 className="font-medium mb-2">8 Compute Trays ({config.computeTrays2.count} 層)</h4>
                   <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                     {Array.from({length: config.computeTrays2.count}).map((_, index) => {
                       const configuredMapping = Object.entries(componentSystemMapping)
                         .find(([key]) => key === `8 Compute Trays-CT2-${String(index + 1).padStart(3, '0')}`);
                       
                       if (configuredMapping) {
                         const [key, mapping] = configuredMapping;
                         return (
                           <div key={key} className="text-sm font-mono bg-emerald-50 dark:bg-emerald-950 px-3 py-2 rounded border hover:bg-emerald-100 dark:hover:bg-emerald-900 cursor-pointer transition-colors">
                             <div className="font-medium">#{index + 1}</div>
                              <div className="text-yellow-500 dark:text-yellow-400 font-bold">{mapping.serialNumber}</div>
                             <div className="mt-1 space-y-1">
                               <div className="text-xs text-green-600 dark:text-green-400 font-medium">
                                 <div>系統: {mapping.systemName}</div>
                               </div>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="w-full text-xs h-6"
                                  onClick={() => handleSelectSystem('8 Compute Trays', `CT2-${String(index + 1).padStart(3, '0')}`)}
                                >
                                  重新選擇
                                </Button>
                             </div>
                           </div>
                         );
                       }

                       return (
                         <div key={`empty-ct2-${index}`} className="text-sm font-mono bg-gray-50 dark:bg-gray-950 px-3 py-2 rounded border border-dashed hover:bg-gray-100 dark:hover:bg-gray-900 cursor-pointer transition-colors">
                           <div className="font-medium">#{index + 1}</div>
                           <div className="text-gray-500 dark:text-gray-400">未配置</div>
                           <Button 
                             variant="ghost" 
                             size="sm" 
                             className="w-full text-xs h-6 mt-1"
                             onClick={() => handleSelectSystem('8 Compute Trays', `CT2-${String(index + 1).padStart(3, '0')}`)}
                           >
                             選擇機台
                           </Button>
                         </div>
                       );
                     })}
                   </div>
                </div>
              </div>
            </div>

            {/* 電源供應單元 */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="h-4 w-4 bg-amber-500 rounded"></div>
                <h3 className="text-lg font-semibold text-amber-600">電源供應單元</h3>
                <Badge variant="outline">
                  {Object.keys(componentSystemMapping).filter(key => 
                    key.includes('Power Supplies')
                  ).length} / {config.topPowerSupplies.count + config.bottomPowerSupplies.count} 已配置
                </Badge>
              </div>
              <div className="pl-7 space-y-2">
                <div>
                  <h4 className="font-medium mb-2">Power Supplies (上) ({config.topPowerSupplies.count} 層)</h4>
                   <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                     {Array.from({length: config.topPowerSupplies.count}).map((_, index) => {
                       const configuredMapping = Object.entries(componentSystemMapping)
                         .find(([key]) => key === `Power Supplies (上)-PSU-T-${String(index + 1).padStart(3, '0')}`);
                       
                       if (configuredMapping) {
                         const [key, mapping] = configuredMapping;
                         return (
                           <div key={key} className="text-sm font-mono bg-amber-50 dark:bg-amber-950 px-3 py-2 rounded border hover:bg-amber-100 dark:hover:bg-amber-900 cursor-pointer transition-colors">
                             <div className="font-medium">#{index + 1}</div>
                              <div className="text-yellow-500 dark:text-yellow-400 font-bold">{mapping.serialNumber}</div>
                             <div className="mt-1 space-y-1">
                               <div className="text-xs text-green-600 dark:text-green-400 font-medium">
                                 <div>系統: {mapping.systemName}</div>
                               </div>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="w-full text-xs h-6"
                                  onClick={() => handleSelectSystem('Power Supplies (上)', `PSU-T-${String(index + 1).padStart(3, '0')}`)}
                                >
                                  重新選擇
                                </Button>
                             </div>
                           </div>
                         );
                       }

                       return (
                         <div key={`empty-psu-top-${index}`} className="text-sm font-mono bg-gray-50 dark:bg-gray-950 px-3 py-2 rounded border border-dashed hover:bg-gray-100 dark:hover:bg-gray-900 cursor-pointer transition-colors">
                           <div className="font-medium">#{index + 1}</div>
                           <div className="text-gray-500 dark:text-gray-400">未配置</div>
                           <Button 
                             variant="ghost" 
                             size="sm" 
                             className="w-full text-xs h-6 mt-1"
                             onClick={() => handleSelectSystem('Power Supplies (上)', `PSU-T-${String(index + 1).padStart(3, '0')}`)}
                           >
                             選擇機台
                           </Button>
                         </div>
                       );
                     })}
                   </div>
                </div>
                <div>
                  <h4 className="font-medium mb-2">Power Supplies (下) ({config.bottomPowerSupplies.count} 層)</h4>
                   <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                     {Array.from({length: config.bottomPowerSupplies.count}).map((_, index) => {
                       const configuredMapping = Object.entries(componentSystemMapping)
                         .find(([key]) => key === `Power Supplies (下)-PSU-B-${String(index + 1).padStart(3, '0')}`);
                       
                       if (configuredMapping) {
                         const [key, mapping] = configuredMapping;
                         return (
                           <div key={key} className="text-sm font-mono bg-amber-50 dark:bg-amber-950 px-3 py-2 rounded border hover:bg-amber-100 dark:hover:bg-amber-900 cursor-pointer transition-colors">
                             <div className="font-medium">#{index + 1}</div>
                             <div className="text-yellow-500 dark:text-yellow-400 font-bold">{mapping.serialNumber}</div>
                             <div className="mt-1 space-y-1">
                               <div className="text-xs text-green-600 dark:text-green-400 font-medium">
                                 <div>系統: {mapping.systemName}</div>
                               </div>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="w-full text-xs h-6"
                                  onClick={() => handleSelectSystem('Power Supplies (下)', `PSU-B-${String(index + 1).padStart(3, '0')}`)}
                                >
                                  重新選擇
                                </Button>
                             </div>
                           </div>
                         );
                       }

                       return (
                         <div key={`empty-psu-bottom-${index}`} className="text-sm font-mono bg-gray-50 dark:bg-gray-950 px-3 py-2 rounded border border-dashed hover:bg-gray-100 dark:hover:bg-gray-900 cursor-pointer transition-colors">
                           <div className="font-medium">#{index + 1}</div>
                           <div className="text-gray-500 dark:text-gray-400">未配置</div>
                           <Button 
                             variant="ghost" 
                             size="sm" 
                             className="w-full text-xs h-6 mt-1"
                             onClick={() => handleSelectSystem('Power Supplies (下)', `PSU-B-${String(index + 1).padStart(3, '0')}`)}
                           >
                             選擇機台
                           </Button>
                         </div>
                       );
                     })}
                   </div>
                </div>
              </div>
            </div>

            {/* SRC單元 */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="h-4 w-4 bg-purple-500 rounded"></div>
                <h3 className="text-lg font-semibold text-purple-600">SRC單元</h3>
                <Badge variant="outline">
                  {Object.keys(componentSystemMapping).filter(key => 
                    key.includes('SRC Units')
                  ).length} / {config.srcUnits.count} 已配置
                </Badge>
              </div>
               <div className="pl-7">
                 <h4 className="font-medium mb-2">SRC Units ({config.srcUnits.count} 層)</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                    {Array.from({length: config.srcUnits.count}).map((_, index) => {
                      const configuredMapping = Object.entries(componentSystemMapping)
                        .find(([key]) => key === `SRC Units-SRC-${String(index + 1).padStart(3, '0')}`);
                      
                      if (configuredMapping) {
                        const [key, mapping] = configuredMapping;
                        return (
                          <div key={key} className="text-sm font-mono bg-purple-50 dark:bg-purple-950 px-3 py-2 rounded border hover:bg-purple-100 dark:hover:bg-purple-900 cursor-pointer transition-colors">
                            <div className="font-medium">#{index + 1}</div>
                            <div className="text-yellow-500 dark:text-yellow-400 font-bold">{mapping.serialNumber}</div>
                            <div className="mt-1 space-y-1">
                              <div className="text-xs text-green-600 dark:text-green-400 font-medium">
                                <div>系統: {mapping.systemName}</div>
                              </div>
                               <Button 
                                 variant="ghost" 
                                 size="sm" 
                                 className="w-full text-xs h-6"
                                 onClick={() => handleSelectSystem('SRC Units', `SRC-${String(index + 1).padStart(3, '0')}`)}
                               >
                                 重新選擇
                               </Button>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div key={`empty-src-${index}`} className="text-sm font-mono bg-gray-50 dark:bg-gray-950 px-3 py-2 rounded border border-dashed hover:bg-gray-100 dark:hover:bg-gray-900 cursor-pointer transition-colors">
                          <div className="font-medium">#{index + 1}</div>
                          <div className="text-gray-500 dark:text-gray-400">未配置</div>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="w-full text-xs h-6 mt-1"
                            onClick={() => handleSelectSystem('SRC Units', `SRC-${String(index + 1).padStart(3, '0')}`)}
                          >
                            選擇機台
                          </Button>
                        </div>
                      );
                    })}
                  </div>
               </div>
            </div>

            {/* 總計統計 */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">組件配置統計：</span>
                <div className="flex gap-4">
                  <span>交換機: {Object.keys(componentSystemMapping).filter(key => 
                    key.includes('Top Of Rack Switch') || key.includes('3 Switch Trays')
                  ).length} / {config.topOfRackSwitch.count + config.switchTrays.count}</span>
                  <span>運算單元: {Object.keys(componentSystemMapping).filter(key => 
                    key.includes('10 Compute Trays') || key.includes('8 Compute Trays')
                  ).length} / {config.computeTrays1.count + config.computeTrays2.count}</span>
                  <span>電源供應: {Object.keys(componentSystemMapping).filter(key => 
                    key.includes('Power Supplies')
                  ).length} / {config.topPowerSupplies.count + config.bottomPowerSupplies.count}</span>
                  <span>SRC單元: {Object.keys(componentSystemMapping).filter(key => 
                    key.includes('SRC Units')
                  ).length} / {config.srcUnits.count}</span>
                  <span className="font-semibold">總計: {Object.keys(componentSystemMapping).length} / {Object.values(config).reduce((sum, comp) => sum + comp.count, 0)}</span>
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
        systems={getAvailableSystems(systems, currentCabinetId || 'default').filter(system => 
          !Object.values(componentSystemMapping).some(mapping => mapping.systemId === system.id)
        )}
        systemProgress={systemProgress}
        onSystemSelect={handleSystemSelection}
      />
    </div>
  );
}
