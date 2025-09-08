import * as THREE from 'three';

// 內存清理工具函數
export const cleanupThreeJSResources = (scene: THREE.Scene, renderer?: THREE.WebGLRenderer) => {
  try {
    // 遍歷場景中的所有對象
    scene.traverse((object) => {
      if ((object as any).isMesh) {
        const mesh = object as THREE.Mesh;
        
        // 清理幾何體
        if (mesh.geometry) {
          mesh.geometry.dispose();
        }
        
        // 清理材質
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach(material => {
              material.dispose();
              // 清理材質的紋理
              Object.values(material).forEach(value => {
                if (value && typeof value === 'object' && 'dispose' in value) {
                  (value as any).dispose();
                }
              });
            });
          } else {
            mesh.material.dispose();
            // 清理材質的紋理
            Object.values(mesh.material).forEach(value => {
              if (value && typeof value === 'object' && 'dispose' in value) {
                (value as any).dispose();
              }
            });
          }
        }
      }
    });
    
    // 清理渲染器
    if (renderer) {
      renderer.dispose();
      renderer.forceContextLoss();
    }
    
    // 清空場景
    while (scene.children.length > 0) {
      scene.remove(scene.children[0]);
    }
    
    console.log('Three.js resources cleaned up successfully');
  } catch (error) {
    console.error('Error during Three.js cleanup:', error);
  }
};

// 清理localStorage中損壞的數據
export const cleanupLocalStorageData = (keyPrefix: string) => {
  try {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.includes(keyPrefix)) {
        try {
          const data = localStorage.getItem(key);
          if (data) {
            JSON.parse(data);
          }
        } catch {
          localStorage.removeItem(key);
          console.warn(`Removed corrupted localStorage key: ${key}`);
        }
      }
    });
  } catch (error) {
    console.error('Error during localStorage cleanup:', error);
  }
};

// 內存使用監控
export const checkMemoryUsage = () => {
  if ('memory' in performance) {
    const memory = (performance as any).memory;
    console.log('Memory usage:', {
      used: Math.round(memory.usedJSHeapSize / 1024 / 1024) + ' MB',
      total: Math.round(memory.totalJSHeapSize / 1024 / 1024) + ' MB',
      limit: Math.round(memory.jsHeapSizeLimit / 1024 / 1024) + ' MB'
    });
    
    // 如果內存使用率超過80%，建議清理
    const usagePercent = memory.usedJSHeapSize / memory.jsHeapSizeLimit;
    if (usagePercent > 0.8) {
      console.warn('High memory usage detected:', Math.round(usagePercent * 100) + '%');
      return true;
    }
  }
  return false;
};

// 防抖函數，避免頻繁的狀態更新
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};