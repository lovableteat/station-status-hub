import React, { useState, useEffect } from "react";
import { SystemStatusUpdater } from "./SystemStatusUpdater";
import { SystemManager } from "./SystemManager";
import { useUnifiedData } from "@/hooks/useUnifiedData";

export function SystemOverview() {
  const { 
    systems, 
    stations, 
    testItems: items, 
    progress, 
    refetch: loadData,
    isLoading 
  } = useUnifiedData();
  
  const [lastCreatedSystemId, setLastCreatedSystemId] = useState<string | undefined>();

  // 處理系統更新，支援增量更新參數
  const handleSystemUpdate = (newSystemId?: string) => {
    if (newSystemId) {
      setLastCreatedSystemId(newSystemId);
      // 延遲清除，讓 SystemStatusUpdater 有時間進行增量更新
      setTimeout(() => setLastCreatedSystemId(undefined), 2000);
    }
    loadData(newSystemId);
  };

  useEffect(() => {
    // 初始載入
    loadData();
  }, [loadData]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-pulse text-muted-foreground">載入中...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 系統管理工具 */}
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">系統管理</h2>
        <SystemManager onSystemUpdate={handleSystemUpdate} />
      </div>

      {/* 系統狀態自動更新器 - 增量優化版本 */}
      <SystemStatusUpdater
        systems={systems}
        stations={stations}
        items={items}
        progress={progress}
        onSystemUpdate={handleSystemUpdate}
        lastCreatedSystemId={lastCreatedSystemId}
      />

      {/* 系統列表概覽 */}
      <div className="grid gap-4">
        <div className="text-sm text-muted-foreground">
          共 {systems.length} 個測試系統，{systems.filter(s => s.status === 'Done').length} 個已完成
        </div>
        
        {systems.slice(0, 5).map(system => (
          <div key={system.id} className="p-4 border rounded-lg">
            <div className="flex justify-between items-center">
              <span className="font-medium">{system.system_name}</span>
              <span className={`px-2 py-1 rounded text-xs ${
                system.status === 'Done' ? 'bg-success/10 text-success' :
                system.status === 'On-going' ? 'bg-warning/10 text-warning' :
                'bg-muted/10 text-muted-foreground'
              }`}>
                {system.status}
              </span>
            </div>
            <div className="mt-2">
              <div className="flex justify-between text-sm text-muted-foreground mb-1">
                <span>進度</span>
                <span>{system.overall_progress}%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div 
                  className="h-2 rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${system.overall_progress}%` }}
                />
              </div>
            </div>
          </div>
        ))}
        
        {systems.length > 5 && (
          <div className="text-center text-sm text-muted-foreground">
            還有 {systems.length - 5} 個系統...
          </div>
        )}
      </div>
    </div>
  );
}