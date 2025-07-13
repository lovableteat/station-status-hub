
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Settings, Target, CheckCircle, Clock, Users, TrendingUp } from "lucide-react";
import { useUnifiedData } from "@/hooks/useUnifiedData";

export function FlowOverview() {
  const { stations, testItems, stationContents, systems, progress } = useUnifiedData();

  // Calculate station statistics
  const getStationStats = (stationId: string) => {
    const stationSystems = systems.length;
    const completedSystems = progress.filter(p => 
      p.station_id === stationId && p.status === 'Done'
    ).length;
    
    return {
      total: stationSystems,
      completed: completedSystems,
      progress: stationSystems > 0 ? Math.round((completedSystems / stationSystems) * 100) : 0
    };
  };

  // Calculate total test items count
  const totalTestItems = testItems.reduce((sum, item) => sum + (item.estimated_minutes || 0), 0);
  const totalHours = Math.round(totalTestItems / 60 * 10) / 10;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">GB300 L10 測試流程說明</h1>
          <p className="text-base text-muted-foreground">各站點站數詳細設置暨明表所需設備清單</p>
        </div>
      </div>

      {/* Process Flow Overview */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Target className="h-5 w-5" />
          測試流程總覽
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {stations
            .sort((a, b) => a.station_order - b.station_order)
            .map((station) => {
              const stationItemCount = testItems.filter(item => item.station_id === station.id).length;
              const stats = getStationStats(station.id);
              
              return (
                <Card key={station.id} className="relative overflow-hidden">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                        stats.progress === 100 ? 'bg-green-100 text-green-600' :
                        stats.progress > 0 ? 'bg-blue-100 text-blue-600' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        <Settings className="h-6 w-6" />
                      </div>
                      <Badge variant="outline" className="text-xs">
                        Station {station.station_order}
                      </Badge>
                    </div>
                    <div>
                      <h3 className="font-medium text-sm">{station.station_name}</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        {station.estimated_hours || 0}小時
                      </p>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">測試系統數</span>
                        <span className="font-medium text-blue-600">{stats.total}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">測試項目數</span>
                        <span className="font-medium">{stationItemCount}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">完成進度</span>
                        <span className={`font-medium ${
                          stats.progress === 100 ? 'text-green-600' : 
                          stats.progress > 0 ? 'text-blue-600' : 'text-gray-500'
                        }`}>
                          {stats.progress}%
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
        </div>

        {/* Summary Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <Target className="h-8 w-8 text-blue-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">總測試條數</p>
                  <p className="text-2xl font-bold text-blue-600">{testItems.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <Clock className="h-8 w-8 text-orange-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">預估總時間</p>
                  <p className="text-2xl font-bold text-orange-600">{totalHours}小時</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <TrendingUp className="h-8 w-8 text-green-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">測試系統數</p>
                  <p className="text-2xl font-bold text-green-600">{systems.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Detailed Station Information */}
      <div className="space-y-6">
        {stations
          .sort((a, b) => a.station_order - b.station_order)
          .map((station) => {
            const stationItems = testItems.filter(item => item.station_id === station.id);
            const stationContentList = stationContents.filter(content => content.station_id === station.id);
            const stats = getStationStats(station.id);
            
            return (
              <Card key={station.id} className="relative">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      stats.progress === 100 ? 'bg-green-100 text-green-600' :
                      stats.progress > 0 ? 'bg-orange-100 text-orange-600' :
                      'bg-purple-100 text-purple-600'
                    }`}>
                      <Settings className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <CardTitle className="text-lg">{station.station_name}</CardTitle>
                        <Badge variant="outline" className="text-sm">
                          Station {station.station_order}
                        </Badge>
                        <Badge variant="secondary" className="text-sm">
                          {stats.progress}% 完成
                        </Badge>
                      </div>
                      {station.description && (
                        <p className="text-muted-foreground mt-1">{station.description}</p>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex gap-6 text-sm">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span>預估時間: {station.estimated_hours || 0} 小時</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Target className="h-4 w-4 text-muted-foreground" />
                      <span>測試項目: {stationItems.length} 個</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span>測試系統: {stats.total} 個</span>
                    </div>
                  </div>
                  
                  {/* Test Items */}
                  {stationItems.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-3 flex items-center gap-2">
                        <Target className="h-4 w-4" />
                        測試項目
                      </h4>
                      <div className="grid gap-3">
                        {stationItems
                          .sort((a, b) => a.item_order - b.item_order)
                          .map((item) => (
                            <div key={item.id} className="flex items-center justify-between p-3 bg-muted/20 rounded-lg">
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-1">
                                  <span className="font-medium">{item.item_name}</span>
                                  <Badge variant="outline" className="text-xs">
                                    {item.item_order}
                                  </Badge>
                                </div>
                                {item.description && (
                                  <p className="text-sm text-muted-foreground">{item.description}</p>
                                )}
                              </div>
                              <Badge variant="secondary" className="text-xs">
                                {item.estimated_minutes || 0} 分鐘
                              </Badge>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Station Content */}
                  {stationContentList.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-3 flex items-center gap-2">
                        <CheckCircle className="h-4 w-4" />
                        流程說明
                      </h4>
                      <div className="space-y-3">
                        {stationContentList
                          .sort((a, b) => a.order_num - b.order_num)
                          .map((content, index) => (
                            <div key={content.id} className="border-l-4 border-primary/20 pl-4">
                              <div className="flex items-center gap-2 mb-2">
                                <Badge variant="outline" className="text-xs">
                                  {index + 1}
                                </Badge>
                                <h5 className="font-medium">{content.title}</h5>
                              </div>
                              {content.content && (
                                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                  {content.content}
                                </p>
                              )}
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Empty State */}
                  {stationItems.length === 0 && stationContentList.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>此站點暫無詳細內容</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
      </div>
    </div>
  );
}
