import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, ZoomIn, ZoomOut, ChevronLeft, ChevronRight } from 'lucide-react';
import { useUnifiedData } from '@/hooks/useUnifiedData';
import { useGanttTasks } from '@/hooks/useGanttTasks';
import { GanttTimeline } from '@/components/gantt/GanttTimeline';
import { GanttMachineRow } from '@/components/gantt/GanttMachineRow';
import OptimizedGanttChart from './OptimizedGanttChart';

export default function GanttChart() {
  // Use optimized version for better performance
  return <OptimizedGanttChart />;
}