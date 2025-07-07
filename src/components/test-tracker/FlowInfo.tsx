
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clock, Users, CheckCircle, Settings } from "lucide-react";
import { useUnifiedData } from "@/hooks/useUnifiedData";
import { StationContentManager } from "./StationContentManager";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface StationContent {
  id: string;
  station_id: string;
  title: string;
  content: string;
  order_num: number;
}

export function FlowInfo() {
  const { stations, testItems } = useUnifiedData();
  const [stationContents, setStationContents] = useState<StationContent[]>([]);

  useEffect(() => {
    loadStationContents();
  }, []);

  const loadStationContents = async () => {
    try {
      const { data, error } = await supabase
        .from('station_contents')
        .select('*')
        .order('station_id, order_num');

      if (error) throw error;
      setStationContents(data || []);
    } catch (error) {
      console.error('Error loading station contents:', error);
    }
  };

  const getContentsByStation = (stationId: string) => {
    return stationContents
      .filter(content => content.station_id === stationId)
      .sort((a, b) => a.order_num - b.order_num);
  };

  const getContentTypeColor = (title: string) => {
    if (title.includes('目的')) return 'bg-blue-100 text-blue-800';
    if (title.includes('程序') || title.includes('流程')) return 'bg-green-100 text-green-800';
    if (title.includes('設備')) return 'bg-orange-100 text-orange-800';
    if (title.includes('備註')) return 'bg-gray-100 text-gray-800';
    return 'bg-purple-100 text-purple-800';
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">GB300 L10 測試流程說明</h1>
        <p className="text-muted-foreground">測試流程總覽與站點內容管理</p>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">流程總覽</TabsTrigger>
          <TabsTrigger value="management">內容管理</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="space-y-6">
            {/* Flow Overview */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5" />
                  測試流程概要
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-primary">{stations.length}</div>
                    <div className="text-sm text-muted-foreground">測試站點</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-success">{testItems.length}</div>
                    <div className="text-sm text-muted-foreground">測試項目</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-warning">
                      {Math.round(stations.reduce((sum, s) => sum + (s.estimated_hours || 0), 0))}
                    </div>
                    <div className="text-sm text-muted-foreground">預估總時數</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Station Details */}
            <div className="space-y-6">
              {stations.sort((a, b) => a.station_order - b.station_order).map(station => {
                const stationItems = testItems.filter(item => item.station_id === station.id);
                const contents = getContentsByStation(station.id);
                
                return (
                  <Card key={station.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-bold">
                            {station.station_order}
                          </div>
                          {station.station_name}
                        </CardTitle>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="h-4 w-4" />
                          預估 {station.estimated_hours || 0} 小時
                        </div>
                      </div>
                      {station.description && (
                        <p className="text-muted-foreground">{station.description}</p>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Station Contents */}
                      {contents.length > 0 && (
                        <div className="space-y-3">
                          {contents.map(content => (
                            <div key={content.id} className="border-l-4 border-primary/20 pl-4">
                              <div className="flex items-center gap-2 mb-2">
                                <Badge className={getContentTypeColor(content.title)}>
                                  {content.title}
                                </Badge>
                              </div>
                              <div className="text-sm whitespace-pre-wrap text-muted-foreground">
                                {content.content}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Test Items */}
                      {stationItems.length > 0 && (
                        <div>
                          <h4 className="font-medium mb-3 flex items-center gap-2">
                            <Users className="h-4 w-4" />
                            測試項目 ({stationItems.length} 項)
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {stationItems.sort((a, b) => a.item_order - b.item_order).map(item => (
                              <div key={item.id} className="p-3 border rounded-lg">
                                <div className="font-medium text-sm">{item.item_name}</div>
                                {item.description && (
                                  <div className="text-xs text-muted-foreground mt-1">
                                    {item.description}
                                  </div>
                                )}
                                <div className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  預估 {item.estimated_minutes || 30} 分鐘
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {contents.length === 0 && stationItems.length === 0 && (
                        <div className="text-center py-8 text-muted-foreground">
                          <p>尚未配置站點內容和測試項目</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="management">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                站點內容管理
              </CardTitle>
            </CardHeader>
            <CardContent>
              <StationContentManager stations={stations} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
