
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Settings, Database, FileText, Target } from "lucide-react";
import { useUnifiedData } from "@/hooks/useUnifiedData";
import { TestItemManager } from "./TestItemManager";
import { StationContentManager } from "./StationContentManager";
import { FlowInfo } from "./FlowInfo";

export function TestManagementPanel() {
  const { 
    stations: testFlowStations, 
    testItems, 
    stationContents, 
    refetch 
  } = useUnifiedData();

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">GB300 L10 測試流程說明</h1>
          <p className="text-base text-muted-foreground">站點管理、測試項目管理</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Station Management */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Settings className="h-5 w-5" />
              站點管理
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {testFlowStations.map((station) => (
                <div key={station.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <div className="text-base font-medium">{station.station_name}</div>
                    {station.description && (
                      <div className="text-sm text-muted-foreground">{station.description}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-sm">
                      順序: {station.station_order}
                    </Badge>
                    <Badge variant="secondary" className="text-sm">
                      {testItems.filter(item => item.station_id === station.id).length} 項目
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Test Item Management */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Target className="h-5 w-5" />
              測試項目管理
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue={testFlowStations[0]?.id || ''} className="w-full">
              <TabsList className="grid w-full grid-cols-4 text-sm">
                {testFlowStations.slice(0, 4).map((station) => (
                  <TabsTrigger key={station.id} value={station.id} className="text-sm">
                    {station.station_name}
                  </TabsTrigger>
                ))}
              </TabsList>
              {testFlowStations.slice(0, 4).map((station) => (
                <TabsContent key={station.id} value={station.id} className="mt-4">
                  <TestItemManager
                    stationId={station.id}
                    stationName={station.station_name}
                    items={testItems.filter(item => item.station_id === station.id)}
                    onUpdate={refetch}
                  />
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* Flow Overview Content Management */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" />
            流程總覽內容管理
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue={testFlowStations[0]?.id || ''} className="w-full">
            <TabsList className="grid w-full grid-cols-4 text-sm">
              {testFlowStations.slice(0, 4).map((station) => (
                <TabsTrigger key={station.id} value={station.id} className="text-sm">
                  {station.station_name}
                </TabsTrigger>
              ))}
            </TabsList>
            {testFlowStations.slice(0, 4).map((station) => (
              <TabsContent key={station.id} value={station.id} className="mt-4">
                <StationContentManager
                  stationId={station.id}
                  stationName={station.station_name}
                  contents={stationContents.filter(content => content.station_id === station.id)}
                  onUpdate={refetch}
                />
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      {/* Flow Info Display */}
      <FlowInfo />
    </div>
  );
}
