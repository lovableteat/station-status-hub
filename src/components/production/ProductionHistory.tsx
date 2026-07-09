import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Clock, 
  AlertTriangle, 
  CheckCircle, 
  RefreshCw, 
  TrendingDown,
  ArrowRight,
  History
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTestProject } from "@/components/test-projects/TestProjectProvider";

interface ProductionRecord {
  id: string;
  system_id: string;
  system_name: string;
  station_name: string;
  status: string;
  started_at: string;
  completed_at?: string;
  rework_count: number;
  is_rework: boolean;
  notes?: string;
  engineer: string;
}

interface BottleneckInfo {
  station_name: string;
  queue_count: number;
  avg_processing_time: number;
  efficiency_rate: number;
}

export function ProductionHistory() {
  const [records, setRecords] = useState<ProductionRecord[]>([]);
  const [bottlenecks, setBottlenecks] = useState<BottleneckInfo[]>([]);
  const [selectedSystem, setSelectedSystem] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { activeProjectId } = useTestProject();

  useEffect(() => {
    loadProductionData();
  }, [activeProjectId]);

  const loadProductionData = async () => {
    try {
      setLoading(true);

      if (!activeProjectId) {
        setRecords([]);
        setBottlenecks([]);
        return;
      }

      const { data: projectSystems, error: projectSystemsError } = await supabase
        .from('test_systems')
        .select('id')
        .eq('project_id', activeProjectId);

      if (projectSystemsError) {
        throw projectSystemsError;
      }

      const systemIds = (projectSystems || []).map((system) => system.id);
      if (systemIds.length === 0) {
        setRecords([]);
        setBottlenecks([]);
        return;
      }
      
      // Load production records with rework history
      const { data: progressData } = await supabase
        .from('test_progress')
        .select(`
          *,
          test_systems(system_name),
          test_flow_stations(station_name)
        `)
        .eq('project_id', activeProjectId)
        .in('system_id', systemIds)
        .order('updated_at', { ascending: false });

      if (progressData) {
        const processedRecords = progressData.map(p => ({
          id: p.id,
          system_id: p.system_id,
          system_name: p.test_systems?.system_name || 'Unknown',
          station_name: p.test_flow_stations?.station_name || 'Unknown',
          status: p.status || 'Not Start',
          started_at: p.started_at || p.created_at,
          completed_at: p.completed_at,
          rework_count: p.notes?.includes('返工') ? 1 : 0,
          is_rework: p.notes?.includes('返工') || false,
          notes: p.notes,
          engineer: p.assigned_to || 'Unassigned'
        }));
        setRecords(processedRecords);
      }

      // Calculate bottlenecks
      calculateBottlenecks(progressData || []);
      
    } catch (error) {
      console.error('Error loading production data:', error);
      toast({
        title: "載入失敗",
        description: "無法載入生產履歷數據",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const calculateBottlenecks = (data: any[]) => {
    const stationStats = new Map();
    
    data.forEach(item => {
      const stationName = item.test_flow_stations?.station_name;
      if (!stationName) return;
      
      if (!stationStats.has(stationName)) {
        stationStats.set(stationName, {
          total: 0,
          completed: 0,
          totalTime: 0,
          queueCount: 0
        });
      }
      
      const stats = stationStats.get(stationName);
      stats.total++;
      
      if (item.status === 'Done') {
        stats.completed++;
        if (item.started_at && item.completed_at) {
          const processingTime = new Date(item.completed_at).getTime() - new Date(item.started_at).getTime();
          stats.totalTime += processingTime;
        }
      } else if (item.status === 'On-going') {
        stats.queueCount++;
      }
    });

    const bottleneckData = Array.from(stationStats.entries()).map(([stationName, stats]) => ({
      station_name: stationName,
      queue_count: stats.queueCount,
      avg_processing_time: stats.completed > 0 ? Math.round(stats.totalTime / stats.completed / (1000 * 60 * 60)) : 0,
      efficiency_rate: stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0
    }));

    // Sort by bottleneck severity (queue count + low efficiency)
    bottleneckData.sort((a, b) => {
      const severityA = a.queue_count + (100 - a.efficiency_rate);
      const severityB = b.queue_count + (100 - b.efficiency_rate);
      return severityB - severityA;
    });

    setBottlenecks(bottleneckData);
  };

  const handleRework = async (progressRecordId: string) => {
    try {
      if (!activeProjectId) {
        return;
      }

      // Find the specific progress record to update
      const { data: progressRecord } = await supabase
        .from('test_progress')
        .select('*')
        .eq('project_id', activeProjectId)
        .eq('id', progressRecordId)
        .single();

      if (progressRecord) {
        // Update the progress to indicate rework
        await supabase
          .from('test_progress')
          .update({
            status: 'On-going',
            notes: (progressRecord.notes || '') + ' [返工 ' + new Date().toLocaleString() + ']',
            started_at: new Date().toISOString()
          })
          .eq('project_id', activeProjectId)
          .eq('id', progressRecord.id);

        toast({
          title: "返工已記錄",
          description: "系統已標記為返工狀態"
        });

        loadProductionData();
      }
    } catch (error) {
      toast({
        title: "返工記錄失敗",
        description: "無法記錄返工狀態",
        variant: "destructive"
      });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Done':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'On-going':
        return <Clock className="h-4 w-4 text-blue-500" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-gray-400" />;
    }
  };

  const getBottleneckSeverity = (bottleneck: BottleneckInfo) => {
    const severity = bottleneck.queue_count + (100 - bottleneck.efficiency_rate);
    if (severity > 80) return 'high';
    if (severity > 40) return 'medium';
    return 'low';
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center">載入中...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                機台生產履歷
              </CardTitle>
              <p className="text-sm text-muted-foreground">追蹤系統測試進度與返工記錄</p>
            </div>
            <Button onClick={loadProductionData} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              刷新
            </Button>
          </div>
        </CardHeader>
      </Card>

      <Tabs defaultValue="bottlenecks" className="space-y-4">
        <TabsList>
          <TabsTrigger value="bottlenecks">瓶頸分析</TabsTrigger>
          <TabsTrigger value="history">生產履歷</TabsTrigger>
          <TabsTrigger value="rework">返工記錄</TabsTrigger>
        </TabsList>

        <TabsContent value="bottlenecks">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingDown className="h-5 w-5" />
                瓶頸站點分析
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {bottlenecks.map((bottleneck, index) => {
                  const severity = getBottleneckSeverity(bottleneck);
                  return (
                    <div 
                      key={bottleneck.station_name}
                      className={`p-4 rounded-lg border ${
                        severity === 'high' ? 'bg-red-50 border-red-200' :
                        severity === 'medium' ? 'bg-yellow-50 border-yellow-200' :
                        'bg-green-50 border-green-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">{bottleneck.station_name}</h4>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                            <span>排隊: {bottleneck.queue_count} 台</span>
                            <span>平均處理: {bottleneck.avg_processing_time}h</span>
                            <span>效率: {bottleneck.efficiency_rate}%</span>
                          </div>
                        </div>
                        <Badge variant={severity === 'high' ? 'destructive' : severity === 'medium' ? 'default' : 'secondary'}>
                          {severity === 'high' ? '嚴重瓶頸' : severity === 'medium' ? '中度瓶頸' : '正常'}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>系統測試履歷</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-96">
                <div className="space-y-2">
                  {records.map((record) => (
                    <div 
                      key={record.id}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                      onClick={() => setSelectedSystem(selectedSystem === record.system_id ? null : record.system_id)}
                    >
                      <div className="flex items-center gap-3">
                        {getStatusIcon(record.status)}
                        <div>
                          <div className="font-medium">{record.system_name}</div>
                          <div className="text-sm text-muted-foreground">
                            {record.station_name} - {record.engineer}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm">
                          {new Date(record.started_at).toLocaleString()}
                        </div>
                        {record.is_rework && (
                          <Badge variant="outline" className="text-xs">
                            返工 {record.rework_count}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rework">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5" />
                返工記錄管理
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-96">
                <div className="space-y-2">
                  {records
                    .filter(r => r.is_rework || r.notes?.includes('返工'))
                    .map((record) => (
                      <div key={record.id} className="flex items-center justify-between p-3 border rounded-lg bg-yellow-50">
                        <div className="flex items-center gap-3">
                          <RefreshCw className="h-4 w-4 text-yellow-600" />
                          <div>
                            <div className="font-medium">{record.system_name}</div>
                            <div className="text-sm text-muted-foreground">
                              {record.station_name} - 返工原因: {record.notes?.split('[返工')[0] || '未知'}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">
                            返工 {record.rework_count}
                          </Badge>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRework(record.id)}
                          >
                            再次返工
                          </Button>
                        </div>
                      </div>
                    ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
