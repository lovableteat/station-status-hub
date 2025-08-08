import { useUnifiedData } from "./useUnifiedData";
import { ProgressCalculator, SystemProgressData } from "@/components/reports/ProgressCalculator";
import { useMemo } from "react";

export function useTestProgressData() {
  const { systems, stations, testItems, progress, isLoading, refetch } = useUnifiedData();

  const progressData = useMemo(() => {
    if (!systems.length || !stations.length || !testItems.length) {
      return [];
    }

    return ProgressCalculator.calculateSystemProgress(
      systems,
      stations,
      testItems,
      progress
    );
  }, [systems, stations, testItems, progress]);

  const statistics = useMemo(() => {
    // 僅統計列入儀表板的系統
    const included = progressData.filter(d => !d.excludeFromDashboard);
    const total = included.length;
    const completed = included.filter(d => d.status === '已完成' || d.overallProgress === 100).length;
    const inProgress = included.filter(d => d.status === '進行中' || (d.overallProgress > 0 && d.overallProgress < 100)).length;
    const notStarted = included.filter(d => d.status === '未開始' || d.overallProgress === 0).length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      total,
      completed,
      inProgress,
      notStarted,
      completionRate
    };
  }, [progressData]);

  return {
    progressData,
    statistics,
    isLoading,
    refetch,
    rawData: {
      systems,
      stations,
      testItems,
      progress
    }
  };
}