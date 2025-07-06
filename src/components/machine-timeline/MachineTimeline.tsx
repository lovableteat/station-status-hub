import { useMachineTimelineData } from "@/hooks/useMachineTimelineData";
import { TimelineGrid } from "./TimelineGrid";
import { MachineRow } from "./MachineRow";

export function MachineTimeline() {
  const { timelineData, timelineBounds, isLoading } = useMachineTimelineData();

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
        <div className="text-center py-8">
          <h2 className="text-xl font-semibold mb-2">機台時間軸</h2>
          <p className="text-muted-foreground">目前沒有機台測試資料</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">機台時間軸</h1>
        <p className="text-muted-foreground">GB300 L10 測試進度時間軸視圖</p>
      </div>

      <div className="bg-background border rounded-lg">
        <div className="flex">
          {/* Left side: Machine list */}
          <div className="w-48 border-r bg-muted/20">
            <div className="h-20 flex items-center justify-center border-b bg-muted/50">
              <h3 className="font-semibold">機台編號</h3>
            </div>
            <div className="space-y-0">
              {timelineData.map((machine) => (
                <div
                  key={machine.id}
                  className="h-16 flex items-center justify-center border-b"
                >
                  <div className="font-medium text-center">
                    {machine.system_name}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right side: Timeline area */}
          <div className="flex-1 overflow-x-auto">
            <div className="min-w-[1200px]">
              <TimelineGrid bounds={timelineBounds} />
              
              <div className="space-y-0">
                {timelineData.map((machine) => (
                  <MachineRow
                    key={machine.id}
                    machine={machine}
                    bounds={timelineBounds}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}