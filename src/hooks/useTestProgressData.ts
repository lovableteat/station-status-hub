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
    const total = progressData.length;
    const completed = progressData.filter(d => d.status === '已完成').length;
    const inProgress = progressData.filter(d => d.status === '進行中').length;
    const notStarted = progressData.filter(d => d.status === '未開始').length;
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