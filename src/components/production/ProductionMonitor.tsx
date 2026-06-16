import { useUnifiedData } from "@/hooks/useUnifiedData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Monitor, AlertTriangle, CheckCircle, ArrowLeft, Bug, Pause, PlayCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { TestProgressAuditLog } from "./TestProgressAuditLog";
import { ExportDialog } from "./ExportDialog";
import { ProductionHistory } from "./ProductionHistory";
import { BackButton } from "@/components/common/BackButton";
import { SystemSelectionDialog } from "./SystemSelectionDialog";

export function ProductionMonitor() {
  const {
    stationStatuses,
    stations: rawStations,
    systems,
    testItems,
    progress,
    isLoading,
  } = useUnifiedData();

  const [focusedSystem, setFocusedSystem] = useState<string | null>(null);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showProductionHistory, setShowProductionHistory] = useState(false);
  const [showSystemSelection, setShowSystemSelection] = useState(false);
  const [selectedStation, setSelectedStation] = useState<any>(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const systemParam = urlParams.get('system');
    if (systemParam) setFocusedSystem(systemParam);
  }, []);

  // 動態取得 L10 流程的所有站別（依 station_order 排序）。
  // 新增/刪除站別 → 監控牆會自動跟著調整。
  const flowStations = useMemo(() => {
    const sorted = [...rawStations].sort(
      (a, b) => (a.station_order ?? 0) - (b.station_order ?? 0)
    );
    return sorted.map((s) => {
      const status = stationStatuses.find((ss) => ss.id === s.id);
      return {
        id: s.id,
        name: s.station_name,
        order: s.station_order,
        statusMeta: status,
      };
    });
  }, [rawStations, stationStatuses]);

  const getStatusColor = (overallProgress: number, hasError: boolean) => {
    if (hasError) return 'bg-red-500 text-white';
    if (overallProgress === 100) return 'bg-green-500 text-white';
    if (overallProgress >= 1) return 'bg-yellow-500 text-white';
    return 'bg-gray-500 text-white';
  };

  const getStatusIcon = (overallProgress: number, hasError: boolean) => {
    if (hasError) return <AlertTriangle className="h-4 w-4" />;
    if (overallProgress === 100) return <CheckCircle className="h-4 w-4" />;
    if (overallProgress >= 1) return <PlayCircle className="h-4 w-4" />;
    return <Pause className="h-4 w-4" />;
  };

  const getStatusText = (overallProgress: number, hasError: boolean) => {
    if (hasError) return '異常';
    if (overallProgress === 100) return '已完成';
    if (overallProgress >= 1) return '進行中';
    return '未開始';
  };

  const getCurrentTestItem = (systemId: string, stationId: string) => {
    const stationItems = testItems.filter((item) => item.station_id === stationId);
    const ongoing = stationItems.find((item) =>
      progress.find(
        (p) =>
          p.system_id === systemId &&
          p.station_id === stationId &&
          p.item_id === item.id &&
          p.status === 'On-going'
      )
    );
    return ongoing?.item_name || '待開始';
  };

  // 計算某系統在某站別的進度
  const calcStationProgress = (stationId: string, systemId: string): number => {
    const system = systems.find((s) => s.id === systemId);
    const stationTestItems = testItems.filter((item) => item.station_id === stationId);
    if (stationTestItems.length === 0) return 0;
    if (system?.status === '已完成') return 100;
    const completed = progress.filter(
      (p) => p.system_id === systemId && p.station_id === stationId && p.status === 'Done'
    ).length;
    return Math.round((completed / stationTestItems.length) * 100);
  };

  // 整體進度＝所有站別平均
  const calcOverallProgress = (systemId: string): number => {
    if (flowStations.length === 0) return 0;
    const total = flowStations.reduce(
      (acc, st) => acc + calcStationProgress(st.id, systemId),
      0
    );
    return Math.round(total / flowStations.length);
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3"></div>
          <div className="grid grid-cols-5 gap-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-48 bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!flowStations.length && !systems.length) {
    return (
      <div className="p-6">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-bold">生產監控牆</h2>
          <p className="text-muted-foreground">目前沒有站點或系統資料</p>
        </div>
      </div>
    );
  }

  // 單一系統聚焦檢視
  if (focusedSystem) {
    const system = systems.find((s) => s.system_name === focusedSystem);
    if (!system) {
      return (
        <div className="p-6 text-center">
          <p className="text-muted-foreground">系統 {focusedSystem} 未找到</p>
          <Button onClick={() => setFocusedSystem(null)} className="mt-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回總覽
          </Button>
        </div>
      );
    }

    const overall = calcOverallProgress(system.id);
    const hasError = progress.some((p) => p.system_id === system.id && p.status === 'Error');
    const gridCols = `grid-cols-${Math.min(flowStations.length || 1, 6)}`;

    return (
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button onClick={() => setFocusedSystem(null)} variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              返回總覽
            </Button>
            <div>
              <h1 className="text-3xl font-bold">{system.system_name} - 生產監控</h1>
              <p className="text-muted-foreground">即時測試進度 - 當前站點: {system.current_station}</p>
            </div>
          </div>
          <Badge className={getStatusColor(overall, hasError)} variant="outline">
            {getStatusIcon(overall, hasError)}
            <span className="ml-1">{getStatusText(overall, hasError)}</span>
          </Badge>
        </div>

        <Card className="bg-gradient-to-br from-background to-muted/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Monitor className="h-5 w-5" />
              測試流程監控（共 {flowStations.length} 站）
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="grid gap-4"
              style={{
                gridTemplateColumns: `repeat(${Math.min(flowStations.length || 1, 6)}, minmax(0, 1fr))`,
              }}
            >
              {flowStations.map((station) => {
                const isActive = system.current_station === station.name;
                const stationProgress = calcStationProgress(station.id, system.id);
                const isCompleted = stationProgress === 100;
                const currentTestItem = getCurrentTestItem(system.id, station.id);

                return (
                  <div
                    key={station.id}
                    className={`relative p-4 rounded-lg border-2 transition-all ${
                      isActive
                        ? 'border-primary bg-primary/10 shadow-lg'
                        : isCompleted
                        ? 'border-success bg-success/10'
                        : 'border-muted bg-muted/50'
                    }`}
                  >
                    <div className="text-center space-y-2">
                      <div
                        className={`w-12 h-12 mx-auto rounded-full flex items-center justify-center ${
                          isActive
                            ? 'bg-primary text-primary-foreground animate-pulse'
                            : isCompleted
                            ? 'bg-success text-success-foreground'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {getStatusIcon(stationProgress, false)}
                      </div>
                      <h3 className="font-medium text-sm">{station.name}</h3>
                      <div className="text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1">
                        <span className="font-medium">測項: </span>
                        <span>{currentTestItem}</span>
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">進度: {stationProgress}%</div>
                        <Progress value={stationProgress} className="h-1" />
                      </div>
                      <div className="flex items-center justify-center gap-1 mt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => {
                            const event = new CustomEvent('navigate', {
                              detail: {
                                module: 'issues',
                                params: { station: station.name, system: system.system_name },
                              },
                            });
                            window.dispatchEvent(event);
                          }}
                        >
                          <Bug className="h-3 w-3 mr-1" />
                          問題
                        </Button>
                      </div>
                      {isActive && (
                        <div className="absolute -top-2 -right-2">
                          <div className="w-4 h-4 bg-primary rounded-full animate-ping"></div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 text-center">
              <div className="text-2xl font-bold text-primary">整體進度：{overall}%</div>
              <Progress value={overall} className="mt-2 h-3" />
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-primary">{system.assigned_engineer}</div>
              <div className="text-sm text-muted-foreground">負責工程師</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-success">{overall}%</div>
              <div className="text-sm text-muted-foreground">完成進度</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-warning">
                {new Date().toLocaleDateString('zh-TW')}
              </div>
              <div className="text-sm text-muted-foreground">監控日期</div>
            </CardContent>
          </Card>
        </div>

        <TestProgressAuditLog systemId={system.id} systemName={system.system_name} />

        {showProductionHistory && <ProductionHistory />}

        <ExportDialog
          open={showExportDialog}
          onOpenChange={setShowExportDialog}
          title="生產監控報表"
          data={systems}
          stations={stationStatuses}
          testItems={testItems}
          progress={progress}
        />
      </div>
    );
  }

  // 機台總覽
  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <BackButton />
          <div>
            <h1 className="text-3xl font-bold">生產監控牆</h1>
            <p className="text-muted-foreground">
              即時機台狀態監控（共 {flowStations.length} 站，依 station_order 排序）
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {systems.map((system) => {
          const overall = calcOverallProgress(system.id);
          const hasError = progress.some((p) => p.system_id === system.id && p.status === 'Error');
          const currentStationName = system.current_station || flowStations[0]?.name || '-';
          const currentStation = flowStations.find((s) => s.name === currentStationName);
          const currentTestItem = currentStation
            ? getCurrentTestItem(system.id, currentStation.id)
            : '待開始';

          return (
            <Card key={system.id} className="relative overflow-hidden transition-all duration-200 hover:shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-3 rounded-full ${getStatusColor(overall, hasError)}`}>
                    {getStatusIcon(overall, hasError)}
                  </div>
                  <Badge variant="outline" className={getStatusColor(overall, hasError)}>
                    {getStatusText(overall, hasError)}
                  </Badge>
                </div>

                <h3 className="font-semibold text-lg mb-2">{system.system_name}</h3>

                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">目前站別:</span>
                    <span className="font-medium">{currentStationName}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">目前測項:</span>
                    <span className="font-medium text-xs">{currentTestItem}</span>
                  </div>
                </div>

                <div className="space-y-2 mb-4">
                  <h4 className="text-sm font-medium text-muted-foreground">各站進度追蹤</h4>
                  <div
                    className="grid gap-1"
                    style={{
                      gridTemplateColumns: `repeat(${Math.min(flowStations.length || 1, 6)}, minmax(0, 1fr))`,
                    }}
                  >
                    {flowStations.map((st) => {
                      const sp = calcStationProgress(st.id, system.id);
                      const label = `S${st.order - 1 >= 0 ? st.order - 1 : st.order}`;
                      return (
                        <div key={st.id} className="text-center" title={st.name}>
                          <div className="text-xs text-muted-foreground mb-1">{label}</div>
                          <div
                            className={`h-2 rounded-full ${
                              sp === 100 ? 'bg-green-500' : sp >= 1 ? 'bg-yellow-500' : 'bg-gray-500'
                            }`}
                          />
                          <div className="text-xs mt-1">{sp}%</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">整體進度:</span>
                    <span className="font-medium">{overall}%</span>
                  </div>
                  <Progress value={overall} className="h-2" />
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => setFocusedSystem(system.system_name)}
                  >
                    查看詳情
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const event = new CustomEvent('navigate', {
                        detail: { module: 'issues', params: { system: system.system_name } },
                      });
                      window.dispatchEvent(event);
                    }}
                  >
                    <Bug className="h-4 w-4" />
                  </Button>
                </div>

                {overall >= 1 && overall <= 99 && !hasError && (
                  <div className="absolute top-2 right-2">
                    <div className="w-3 h-3 bg-yellow-500 rounded-full animate-pulse"></div>
                  </div>
                )}
                {overall === 100 && !hasError && (
                  <div className="absolute top-2 right-2">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {showProductionHistory && <ProductionHistory />}

      <ExportDialog
        open={showExportDialog}
        onOpenChange={setShowExportDialog}
        title="生產監控報表"
        data={systems}
        stations={stationStatuses}
        testItems={testItems}
        progress={progress}
      />

      <SystemSelectionDialog
        open={showSystemSelection}
        onOpenChange={setShowSystemSelection}
        stationName={selectedStation?.name || ''}
        systems={selectedStation?.current_systems || []}
        systemProgress={selectedStation?.system_progress || []}
        onSystemSelect={setFocusedSystem}
      />
    </div>
  );
}
