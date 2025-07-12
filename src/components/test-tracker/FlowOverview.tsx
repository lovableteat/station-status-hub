
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Clock, Target } from "lucide-react";
import { useUnifiedData } from "@/hooks/useUnifiedData";

export function FlowOverview() {
  const { stations, testItems, stationContents } = useUnifiedData();

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">GB300 L10 測試流程說明</h1>
          <p className="text-base text-muted-foreground">測試流程總覽與詳細說明</p>
        </div>
      </div>

      <div className="grid gap-6">
        {stations
          .sort((a, b) => a.station_order - b.station_order)
          .map((station) => {
            const stationItems = testItems.filter(item => item.station_id === station.id);
            const stationContentList = stationContents.filter(content => content.station_id === station.id);
            const totalMinutes = stationItems.reduce((sum, item) => sum + (item.estimated_minutes || 0), 0);
            const totalHours = Math.round(totalMinutes / 60 * 10) / 10;
            
            return (
              <Card key={station.id} className="relative">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="text-lg px-3 py-1">
                      站點 {station.station_order}
                    </Badge>
                    <CardTitle className="text-xl">{station.station_name}</CardTitle>
                  </div>
                  {station.description && (
                    <p className="text-muted-foreground">{station.description}</p>
                  )}
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
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span>說明內容: {stationContentList.length} 項</span>
                    </div>
                  </div>
                  
                  {/* 測試項目 */}
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
                                    順序 {item.item_order}
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

                  {/* 流程說明內容 */}
                  {stationContentList.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-3 flex items-center gap-2">
                        <FileText className="h-4 w-4" />
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

                  {/* 如果沒有內容 */}
                  {stationItems.length === 0 && stationContentList.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
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
