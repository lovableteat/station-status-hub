import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useMachineTimelineData } from "@/hooks/useMachineTimelineData";
import { TimelineGrid } from "./TimelineGrid";
import { TimelineControls } from "./TimelineControls";
import { MachineRow } from "./MachineRow";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export type TimelineViewType = 'day' | 'week' | 'month';

export function MachineTimeline() {
  const { timelineData, timelineBounds, isLoading } = useMachineTimelineData();
  const [viewType, setViewType] = useState<TimelineViewType>('week');
  const [selectedMachine, setSelectedMachine] = useState<string | null>(null);
  const isMobile = useIsMobile();

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4"></div>
          <div className="h-64 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  if (timelineData.length === 0) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>機台時間軸</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">目前沒有機台測試資料</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">機台時間軸</h1>
          <p className="text-muted-foreground">GB300 L10 測試進度時間軸視圖</p>
        </div>
        
        <TimelineControls 
          viewType={viewType} 
          onViewTypeChange={setViewType}
          timelineBounds={timelineBounds}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {isMobile ? (
            // Mobile: Vertical card layout
            <div className="space-y-4 p-4">
              {timelineData.map((machine) => (
                <Card key={machine.id} className="border-2">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{machine.system_name}</CardTitle>
                      <Badge 
                        variant={
                          machine.status === 'Done' ? 'default' : 
                          machine.status === 'On-going' ? 'secondary' : 
                          'outline'
                        }
                      >
                        {machine.overall_progress}%
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      負責人: {machine.assigned_engineer || '未分配'}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="text-sm">
                        <span className="font-medium">開始時間: </span>
                        {machine.start_time ? 
                          new Date(machine.start_time).toLocaleString('zh-TW') : 
                          '未開始'
                        }
                      </div>
                      <div className="text-sm">
                        <span className="font-medium">完成時間: </span>
                        {machine.end_time ? 
                          new Date(machine.end_time).toLocaleString('zh-TW') : 
                          '進行中'
                        }
                      </div>
                      {machine.duration_hours && (
                        <div className="text-sm">
                          <span className="font-medium">測試時長: </span>
                          {machine.duration_hours.toFixed(1)} 小時
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            // Desktop: Timeline layout
            <div className="relative">
              <div className="flex">
                {/* Left side: Machine list */}
                <div className="w-64 border-r bg-muted/20">
                  <div className="p-4 border-b bg-muted/50">
                    <h3 className="font-semibold">機台編號</h3>
                  </div>
                  <div className="space-y-0">
                    {timelineData.map((machine) => (
                      <div
                        key={machine.id}
                        className={cn(
                          "p-4 border-b cursor-pointer hover:bg-muted/50 transition-colors",
                          selectedMachine === machine.id && "bg-muted"
                        )}
                        onClick={() => setSelectedMachine(
                          selectedMachine === machine.id ? null : machine.id
                        )}
                      >
                        <div className="font-medium">{machine.system_name}</div>
                        <div className="text-sm text-muted-foreground">
                          {machine.assigned_engineer || '未分配'}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge 
                            variant={
                              machine.status === 'Done' ? 'default' : 
                              machine.status === 'On-going' ? 'secondary' : 
                              'outline'
                            }
                            className="text-xs"
                          >
                            {machine.overall_progress}%
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right side: Timeline area */}
                <div className="flex-1 overflow-x-auto">
                  <div className="min-w-[800px]">
                    <TimelineGrid 
                      viewType={viewType}
                      bounds={timelineBounds}
                    />
                    
                    <div className="space-y-0">
                      {timelineData.map((machine) => (
                        <MachineRow
                          key={machine.id}
                          machine={machine}
                          viewType={viewType}
                          bounds={timelineBounds}
                          isSelected={selectedMachine === machine.id}
                          onSelect={() => setSelectedMachine(
                            selectedMachine === machine.id ? null : machine.id
                          )}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}