import { useState, useEffect } from 'react';

interface SystemAllocation {
  systemId: string;
  systemName: string;
  cabinetId: string;
  componentType: string;
  componentSn: string;
}

export function useGlobalSystemAllocation() {
  const [allocations, setAllocations] = useState<SystemAllocation[]>(() => {
    try {
      const saved = localStorage.getItem('global-system-allocations');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // 保存到localStorage
  useEffect(() => {
    localStorage.setItem('global-system-allocations', JSON.stringify(allocations));
  }, [allocations]);

  // 檢查系統是否已分配
  const isSystemAllocated = (systemId: string): boolean => {
    return allocations.some(allocation => allocation.systemId === systemId);
  };

  // 獲取系統的分配信息
  const getSystemAllocation = (systemId: string): SystemAllocation | undefined => {
    return allocations.find(allocation => allocation.systemId === systemId);
  };

  // 分配系統
  const allocateSystem = (
    systemId: string,
    systemName: string,
    cabinetId: string,
    componentType: string,
    componentSn: string
  ): boolean => {
    // 檢查系統是否已分配到其他機櫃
    const existingAllocation = allocations.find(a => a.systemId === systemId);
    
    if (existingAllocation && existingAllocation.cabinetId !== cabinetId) {
      return false; // 系統已分配到其他機櫃
    }

    // 移除現有分配（如果存在）
    const filteredAllocations = allocations.filter(a => 
      !(a.cabinetId === cabinetId && a.componentType === componentType && a.componentSn === componentSn)
    );

    // 添加新分配
    const newAllocation: SystemAllocation = {
      systemId,
      systemName,
      cabinetId,
      componentType,
      componentSn
    };

    setAllocations([...filteredAllocations, newAllocation]);
    return true;
  };

  // 釋放系統分配
  const deallocateSystem = (systemId: string, cabinetId?: string): void => {
    setAllocations(prev => prev.filter(allocation => 
      allocation.systemId !== systemId || (cabinetId && allocation.cabinetId !== cabinetId)
    ));
  };

  // 釋放組件的分配
  const deallocateComponent = (cabinetId: string, componentType: string, componentSn: string): void => {
    setAllocations(prev => prev.filter(allocation => 
      !(allocation.cabinetId === cabinetId && 
        allocation.componentType === componentType && 
        allocation.componentSn === componentSn)
    ));
  };

  // 獲取機櫃的所有分配
  const getCabinetAllocations = (cabinetId: string): SystemAllocation[] => {
    return allocations.filter(allocation => allocation.cabinetId === cabinetId);
  };

  // 過濾可用系統（排除已分配到其他機櫃的系統）
  const getAvailableSystems = (systems: any[], currentCabinetId: string) => {
    return systems.filter(system => {
      const allocation = getSystemAllocation(system.id);
      return !allocation || allocation.cabinetId === currentCabinetId;
    });
  };

  return {
    allocations,
    isSystemAllocated,
    getSystemAllocation,
    allocateSystem,
    deallocateSystem,
    deallocateComponent,
    getCabinetAllocations,
    getAvailableSystems
  };
}