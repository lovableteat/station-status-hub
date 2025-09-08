import { useState, useEffect, useCallback } from 'react';

interface SystemAllocation {
  systemId: string;
  cabinetId: string;
  componentKey: string;
}

interface GlobalSystemAllocationState {
  allocations: SystemAllocation[];
  isSystemAllocated: (systemId: string, excludeCabinetId?: string) => boolean;
  allocateSystem: (systemId: string, cabinetId: string, componentKey: string) => void;
  deallocateSystem: (systemId: string, cabinetId: string) => void;
  getSystemAllocation: (systemId: string) => SystemAllocation | null;
}

const STORAGE_KEY = 'global-system-allocations';

export function useGlobalSystemAllocation(): GlobalSystemAllocationState {
  const [allocations, setAllocations] = useState<SystemAllocation[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // 防抖保存到 localStorage
  const saveAllocations = useCallback((newAllocations: SystemAllocation[]) => {
    const timeoutId = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newAllocations));
      } catch (error) {
        console.error('Failed to save system allocations:', error);
      }
    }, 500);
    return () => clearTimeout(timeoutId);
  }, []);

  // 保存到 localStorage
  useEffect(() => {
    const cleanup = saveAllocations(allocations);
    return cleanup;
  }, [allocations, saveAllocations]);

  const isSystemAllocated = useCallback((systemId: string, excludeCabinetId?: string): boolean => {
    return allocations.some(allocation => 
      allocation.systemId === systemId && 
      (!excludeCabinetId || allocation.cabinetId !== excludeCabinetId)
    );
  }, [allocations]);

  const allocateSystem = useCallback((systemId: string, cabinetId: string, componentKey: string) => {
    setAllocations(prev => {
      // 移除該系統的所有舊分配
      const filtered = prev.filter(a => a.systemId !== systemId);
      // 移除該組件位置的舊分配
      const finalFiltered = filtered.filter(a => !(a.cabinetId === cabinetId && a.componentKey === componentKey));
      // 添加新分配
      return [...finalFiltered, { systemId, cabinetId, componentKey }];
    });
  }, []);

  const deallocateSystem = useCallback((systemId: string, cabinetId: string) => {
    setAllocations(prev => prev.filter(a => 
      !(a.systemId === systemId && a.cabinetId === cabinetId)
    ));
  }, []);

  const getSystemAllocation = useCallback((systemId: string): SystemAllocation | null => {
    return allocations.find(a => a.systemId === systemId) || null;
  }, [allocations]);

  return {
    allocations,
    isSystemAllocated,
    allocateSystem,
    deallocateSystem,
    getSystemAllocation
  };
}