
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useUnifiedData } from "@/hooks/useUnifiedData";
import { StationContentManager } from "./StationContentManager";
import { supabase } from "@/integrations/supabase/client";
import { Clock, Users, Settings, Eye, Edit3, Target, Wrench, FileText } from "lucide-react";

interface StationContent {
  id: string;
  title: string;
  content: string;
  order_num: number;
  station_id: string;
}

export function FlowInfo() {
  const { stations, testItems, isLoading } = useUnifiedData();
  const [stationContents, setStationContents] = useState<{ [key: string]: StationContent[] }>({});

  useEffect(() => {
    loadStationContents();
  }, [stations]);

  const loadStationContents = async () => {
    try {
      const { data, error } = await supabase
        .from('station_contents')
        .select('*')
        .order('order_num');

      if (error) throw error;

      // Group contents by station_id
      const groupedContents = (data || []).reduce((acc, content) => {
        if (!acc[content.station_id]) {
          acc[content.station_id] = [];
        }
        acc[content.station_id].push(content);
        return acc;
      }, {} as { [key: string]: StationContent[] });

      setStationContents(groupedContents);
    } catch (error) {
      console.error('Error loading station contents:', error);
    }
  };

  const getContentByType = (stationId: string, contentType: string) => {
    const contents = stationContents[stationId] || [];
    const content = contents.find(c => c.title === contentType);
    return content?.content || `請設定${contentType}內容`;
  };

  const getContentIcon = (type: string) => {
    switch (type) {
      case '各站目的': return <Target className="h-4 w-4" />;
      case '測試程序': return <Settings className="h-4 w-4" />;
      case '所需設備': return <Wrench className="h-4 w-4" />;
      case '備註': return <FileText className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse">
          <div className="h-8 bg-muted rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-32 bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const sortedStations = [...stations].sort((a, b) => a.station_order - b.station_order);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">GB300 L10 測試流程說明</h2>
          <p className="text-muted-foreground">測試站點流程與詳細資訊管理</p>
        </div>
        <Badge variant="outline" className="px-3 py-1">
          <Users className="h-4 w-4 mr-1" />
          {stations.length} 個測試站點
        </Badge>
        </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid grid-cols-3 w-full max-w-md">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <Eye className="h-4 w-4" />
            流程總覽
          </TabsTrigger>
          <TabsTrigger value="management" className="flex items-center gap-2">
            <Edit3 className="h-4 w-4" />
            內容管理
          </TabsTrigger>
          <TabsTrigger value="items" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            測試項目
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-6">
          <div className="grid gap-6">
            {sortedStations.map((station, index) => {
              const stationTestItems = testItems.filter(item => item.station_id === station.id);
              const stationContentsList = stationContents[station.id] || [];
              
              return (
                <Card key={station.id} className="overflow-hidden">
                  <CardHeader className="bg-gradient-to-r from-primary/10 to-primary/5">
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold">
                          {index + 1}
                        </div>
                        {station.station_name}
                      </CardTitle>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        預估 {station.estimated_hours || 0} 小時
                      </div>
                    </div>
                    {station.description && (
                      <p className="text-sm text-muted-foreground mt-2 ml-11">
                        {station.description}
                      </p>
                    )}
                  </CardHeader>
                  
                  <CardContent className="p-6">
                    <div className="grid md:grid-cols-2 gap-6">
                      {/* Station Content Display */}
                      <div className="space-y-4">
                        {['各站目的', '測試程序', '所需設備', '備註'].map((contentType) => {
                          const content = getContentByType(station.id, contentType);
                          const hasContent = content !== `請設定${contentType}內容`;
                          
                          return (
                            <div key={contentType} className="space-y-2">
                              <div className="flex items-center gap-2 font-medium text-sm">
                                {getContentIcon(contentType)}
                                {contentType}
                              </div>
                              <div className={`text-sm p-3 rounded-lg border ${
                                hasContent 
                                  ? 'bg-background border-border' 
                                  : 'bg-muted/50 border-muted text-muted-foreground italic'
                              }`}>
                                {content}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Test Items */}
                      <div className="space-y-3">
                        <h4 className="font-medium text-sm flex items-center gap-2">
                          <Settings className="h-4 w-4" />
                          測試項目 ({stationTestItems.length})
                        </h4>
                        <div className="space-y-2">
                          {stationTestItems
                            .sort((a, b) => a.item_order - b.item_order)
                            .map((item) => (
                              <div key={item.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                                <div className="flex-1">
                                  <div className="font-medium text-sm">{item.item_name}</div>
                                  {item.description && (
                                    <div className="text-xs text-muted-foreground mt-1">
                                      {item.description}
                                    </div>
                                  )}
                                </div>
                                <div className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {item.estimated_minutes || 30}分
                                </div>
                              </div>
                            ))}
                          {stationTestItems.length === 0 && (
                            <div className="text-center py-4 text-muted-foreground text-sm">
                              此站點尚無測試項目
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="management" className="space-y-6 mt-6">
          {sortedStations.map((station) => (
            <Card key={station.id}>
              <CardContent className="p-6">
                <StationContentManager
                  stationId={station.id}
                  stationName={station.station_name}
                  contents={stationContents[station.id] || []}
                  onDataChange={loadStationContents}
                />
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="items" className="mt-6">
          <div className="grid gap-4">
            {sortedStations.map((station) => {
              const stationTestItems = testItems.filter(item => item.station_id === station.id);
              
              return (
                <Card key={station.id}>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>{station.station_name}</span>
                      <Badge variant="secondary">{stationTestItems.length} 項目</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3">
                      {stationTestItems
                        .sort((a, b) => a.item_order - b.item_order)
                        .map((item, idx) => (
                          <div key={item.id} className="flex items-center gap-4 p-3 rounded-lg border bg-card/50">
                            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">
                              {idx + 1}
                            </div>
                            <div className="flex-1">
                              <div className="font-medium">{item.item_name}</div>
                              {item.description && (
                                <div className="text-sm text-muted-foreground mt-1">
                                  {item.description}
                                </div>
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground flex items-center gap-1">
                              <Clock className="h-4 w-4" />
                              {item.estimated_minutes || 30} 分鐘
                            </div>
                          </div>
                        ))}
                      {stationTestItems.length === 0 && (
                        <div className="text-center py-8 text-muted-foreground">
                          此站點尚無測試項目
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
