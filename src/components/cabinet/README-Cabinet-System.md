# 機櫃管理系統架構說明

## 系統概覽

這個通用機櫃管理系統支持多種機櫃型號，並可以輕鬆擴展以支援未來的新機櫃。

## 核心組件

### 1. CabinetTypeManager.tsx
- 管理機櫃型號的選擇和配置
- 定義機櫃型號的結構和屬性
- 提供型號切換功能

### 2. UniversalCabinetDisplay.tsx
- 統一的機櫃顯示入口
- 根據選擇的型號渲染對應的展示組件
- 管理不同型號之間的切換

### 3. L11CabinetDisplay.tsx
- L11 機櫃的具體 3D 展示實現
- 作為其他機櫃型號實現的參考

## 如何新增新機櫃型號

### 步驟 1: 在 CabinetTypeManager.tsx 中新增型號配置

```typescript
// 在 CABINET_TYPE_CONFIGS 陣列中新增配置
{
  id: 'l14',  // 唯一識別碼
  name: 'L14 新型機櫃',
  model: 'L14',
  description: '新一代高效能機櫃',
  maxUnits: 42,
  powerRequirements: '25kW',
  dimensions: { width: 600, height: 2000, depth: 1200 },
  defaultComponents: {
    // 定義機櫃組件的預設配置
    newComponent1: { count: 4, color: '#ff6b6b', height: 0.3, position: 'top' },
    newComponent2: { count: 16, color: '#4ecdc4', height: 0.2, position: 'middle' },
    // ...其他組件
  },
  status: 'development'  // 'active' | 'development' | 'deprecated'
}
```

### 步驟 2: 創建專用的展示組件

創建新檔案：`src/components/cabinet/L14CabinetDisplay.tsx`

```typescript
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function L14CabinetDisplay() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>L14 機櫃 3D 展示</CardTitle>
      </CardHeader>
      <CardContent>
        {/* 實現 L14 機櫃的 3D 顯示邏輯 */}
        {/* 可以參考 L11CabinetDisplay.tsx 的實現 */}
      </CardContent>
    </Card>
  );
}
```

### 步驟 3: 在 UniversalCabinetDisplay.tsx 中註冊新組件

```typescript
// 導入新組件
import { L14CabinetDisplay } from './L14CabinetDisplay';

// 在 renderCabinetDisplay 函數中新增 case
const renderCabinetDisplay = () => {
  switch (selectedCabinetType.id) {
    case 'l11':
      return <L11CabinetDisplay />;
    case 'l12':
      return <L12CabinetDisplay />;
    case 'l13':
      return <L13CabinetDisplay />;
    case 'l14':  // 新增的 case
      return <L14CabinetDisplay />;
    default:
      // ...
  }
};
```

## 機櫃配置結構說明

### CabinetTypeConfig 介面

```typescript
interface CabinetTypeConfig {
  id: string;                    // 機櫃型號的唯一識別碼
  name: string;                  // 顯示名稱
  model: string;                 // 型號代碼
  description: string;           // 描述
  maxUnits: number;              // 最大 U 數
  powerRequirements: string;     // 功率需求
  dimensions: {                  // 物理尺寸
    width: number;
    height: number;
    depth: number;
  };
  defaultComponents: {           // 預設組件配置
    [componentName: string]: {
      count: number;             // 數量
      color: string;             // 顏色 (HEX)
      height: number;            // 高度比例
      position: 'top' | 'middle' | 'bottom';  // 位置
    };
  };
  status: 'active' | 'development' | 'deprecated';  // 狀態
}
```

## 組件狀態管理

- **localStorage**: 用於保存用戶的機櫃型號選擇
- **狀態同步**: 確保不同組件之間的狀態一致性
- **錯誤處理**: 提供降級顯示和錯誤恢復機制

## 擴展建議

### 1. 動態配置
考慮從後端 API 載入機櫃配置，而不是硬編碼

### 2. 組件庫
建立可重用的 3D 組件庫，不同機櫃可以共享通用組件

### 3. 配置編輯器
實現視覺化的機櫃配置編輯器，讓用戶可以自定義組件

### 4. 版本管理
為機櫃配置添加版本控制，支持配置的歷史管理

## 性能考量

- **懶加載**: 大型 3D 組件應該使用 React.lazy() 進行懶加載
- **記憶化**: 使用 React.memo() 避免不必要的重新渲染
- **資源清理**: 確保 Three.js 資源在組件卸載時正確清理

## 測試策略

- 為每個機櫃型號編寫獨立的測試
- 測試型號切換功能
- 驗證配置的正確性和完整性