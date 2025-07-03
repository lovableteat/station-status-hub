import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Search, Filter, Download, Edit, Save, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface TestSystem {
  id: string;
  system_name: string;
  assigned_engineer: string;
  current_station: string;
  overall_progress: number;
  status: string;
}

interface TestStation {
  id: string;
  station_name: string;
  station_order: number;
}

interface TestItem {
  id: string;
  station_id: string;
  item_name: string;
  item_order: number;
  description: string;
}

interface TestProgress {
  id: string;
  system_id: string;
  station_id: string;
  item_id: string;
  status: string;
  progress_percent: number;
  notes: string;
  started_at?: string;
  completed_at?: string;
}

export function TestTracker() {
  const [systems, setSystems] = useState<TestSystem[]>([]);
  const [stations, setStations] = useState<TestStation[]>([]);
  const [items, setItems] = useState<TestItem[]>([]);
  const [progress, setProgress] = useState<TestProgress[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterEngineer, setFilterEngineer] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [editingProgress, setEditingProgress] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{
    status: string;
    progress_percent: number;
    notes: string;
  }>({ status: "", progress_percent: 0, notes: "" });
  const { toast } = useToast();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [systemsRes, stationsRes, itemsRes, progressRes] = await Promise.all([
        supabase.from('test_systems').select('*').order('system_name'),
        supabase.from('test_flow_stations').select('*').order('station_order'),
        supabase.from('test_flow_items').select('*').order('item_order'),
        supabase.from('test_progress').select('*')
      ]);

      if (systemsRes.data) setSystems(systemsRes.data);
      if (stationsRes.data) setStations(stationsRes.data);
      if (itemsRes.data) setItems(itemsRes.data);
      if (progressRes.data) setProgress(progressRes.data);
    } catch (error) {
      toast({
        title: "載入失敗",
        description: "無法載入測試資料",
        variant: "destructive"
      });
    }
  };

  const getProgressForSystemItem = (systemId: string, stationId: string, itemId: string) => {
    return progress.find(p => 
      p.system_id === systemId && 
      p.station_id === stationId && 
      p.item_id === itemId
    );
  };

  const handleEditProgress = (systemId: string, stationId: string, itemId: string) => {
    const existingProgress = getProgressForSystemItem(systemId, stationId, itemId);
    const editKey = `${systemId}-${stationId}-${itemId}`;
    
    setEditingProgress(editKey);
    setEditValues({
      status: existingProgress?.status || "Not Start",
      progress_percent: existingProgress?.progress_percent || 0,
      notes: existingProgress?.notes || ""
    });
  };

  const handleSaveProgress = async (systemId: string, stationId: string, itemId: string) => {
    try {
      const existingProgress = getProgressForSystemItem(systemId, stationId, itemId);
      
      if (existingProgress) {
        await supabase
          .from('test_progress')
          .update({
            status: editValues.status,
            progress_percent: editValues.progress_percent,
            notes: editValues.notes,
            started_at: editValues.status === 'On-going' && !existingProgress.started_at ? new Date().toISOString() : existingProgress.started_at,
            completed_at: editValues.status === 'Done' ? new Date().toISOString() : null
          })
          .eq('id', existingProgress.id);
      } else {
        await supabase
          .from('test_progress')
          .insert({
            system_id: systemId,
            station_id: stationId,
            item_id: itemId,
            status: editValues.status,
            progress_percent: editValues.progress_percent,
            notes: editValues.notes,
            started_at: editValues.status === 'On-going' ? new Date().toISOString() : null,
            completed_at: editValues.status === 'Done' ? new Date().toISOString() : null
          });
      }

      setEditingProgress(null);
      loadData();
      
      toast({
        title: "儲存成功",
        description: "測試進度已更新"
      });
    } catch (error) {
      toast({
        title: "儲存失敗",
        description: "無法更新測試進度",
        variant: "destructive"
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Done': return 'bg-success text-success-foreground';
      case 'On-going': return 'bg-warning text-warning-foreground';
      case 'Not Start': return 'bg-muted text-muted-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const filteredSystems = systems.filter(system => {
    const matchesSearch = system.system_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         system.assigned_engineer.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesEngineer = !filterEngineer || system.assigned_engineer === filterEngineer;
    const matchesStatus = !filterStatus || system.status === filterStatus;
    return matchesSearch && matchesEngineer && matchesStatus;
  });

  const engineers = [...new Set(systems.map(s => s.assigned_engineer))];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">GB300 L10 測試追蹤</h1>
          <p className="text-muted-foreground">系統測試進度管理 - 40 台機器測試狀態</p>
        </div>
        <Button variant="outline">
          <Download className="h-4 w-4 mr-2" />
          匯出報表
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="搜尋機台編號或負責人..."
                  className="pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            <Select value={filterEngineer} onValueChange={setFilterEngineer}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="選擇工程師" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">全部工程師</SelectItem>
                {engineers.map(engineer => (
                  <SelectItem key={engineer} value={engineer}>{engineer}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="選擇狀態" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">全部狀態</SelectItem>
                <SelectItem value="Not Start">未開始</SelectItem>
                <SelectItem value="On-going">進行中</SelectItem>
                <SelectItem value="Done">已完成</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Test Progress Table */}
      <Card>
        <CardHeader>
          <CardTitle>測試進度表</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div className="min-w-[1400px]">
              {/* Header Row */}
              <div className="grid grid-cols-12 gap-2 p-4 bg-muted/50 rounded-t-lg border-b">
                <div className="col-span-2 font-semibold">機台編號</div>
                <div className="col-span-1 font-semibold">負責人</div>
                <div className="col-span-1 font-semibold">當前站點</div>
                {stations.map(station => (
                  <div key={station.id} className="col-span-2 font-semibold text-center">
                    {station.station_name}
                  </div>
                ))}
              </div>

              {/* Data Rows */}
              {filteredSystems.map(system => (
                <div key={system.id} className="grid grid-cols-12 gap-2 p-4 border-b hover:bg-muted/25">
                  <div className="col-span-2 font-medium">{system.system_name}</div>
                  <div className="col-span-1">
                    <Badge variant="outline">{system.assigned_engineer}</Badge>
                  </div>
                  <div className="col-span-1">
                    <Badge className={getStatusColor(system.status)}>
                      {system.current_station}
                    </Badge>
                  </div>
                  
                  {stations.map(station => {
                    const stationItems = items.filter(item => item.station_id === station.id);
                    const completedItems = stationItems.filter(item => {
                      const prog = getProgressForSystemItem(system.id, station.id, item.id);
                      return prog?.status === 'Done';
                    });
                    const overallPercent = stationItems.length > 0 
                      ? Math.round((completedItems.length / stationItems.length) * 100) 
                      : 0;

                    return (
                      <div key={station.id} className="col-span-2">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span>進度: {overallPercent}%</span>
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <Edit className="h-3 w-3" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-4xl">
                                <DialogHeader>
                                  <DialogTitle>
                                    {system.system_name} - {station.station_name} 詳細進度
                                  </DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4">
                                  {stationItems.map(item => {
                                    const itemProgress = getProgressForSystemItem(system.id, station.id, item.id);
                                    const editKey = `${system.id}-${station.id}-${item.id}`;
                                    const isEditing = editingProgress === editKey;

                                    return (
                                      <div key={item.id} className="border rounded-lg p-4">
                                        <div className="flex items-center justify-between mb-2">
                                          <h4 className="font-medium">{item.item_name}</h4>
                                          <div className="flex gap-2">
                                            {isEditing ? (
                                              <>
                                                <Button 
                                                  size="sm" 
                                                  onClick={() => handleSaveProgress(system.id, station.id, item.id)}
                                                >
                                                  <Save className="h-3 w-3" />
                                                </Button>
                                                <Button 
                                                  size="sm" 
                                                  variant="outline"
                                                  onClick={() => setEditingProgress(null)}
                                                >
                                                  <X className="h-3 w-3" />
                                                </Button>
                                              </>
                                            ) : (
                                              <Button 
                                                size="sm" 
                                                variant="outline"
                                                onClick={() => handleEditProgress(system.id, station.id, item.id)}
                                              >
                                                <Edit className="h-3 w-3" />
                                              </Button>
                                            )}
                                          </div>
                                        </div>
                                        
                                        {isEditing ? (
                                          <div className="space-y-3">
                                            <div>
                                              <Label>狀態</Label>
                                              <Select 
                                                value={editValues.status} 
                                                onValueChange={(value) => setEditValues({...editValues, status: value})}
                                              >
                                                <SelectTrigger>
                                                  <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                  <SelectItem value="Not Start">未開始</SelectItem>
                                                  <SelectItem value="On-going">進行中</SelectItem>
                                                  <SelectItem value="Done">已完成</SelectItem>
                                                </SelectContent>
                                              </Select>
                                            </div>
                                            <div>
                                              <Label>完成度 (%)</Label>
                                              <Input
                                                type="number"
                                                min="0"
                                                max="100"
                                                value={editValues.progress_percent}
                                                onChange={(e) => setEditValues({
                                                  ...editValues, 
                                                  progress_percent: parseInt(e.target.value) || 0
                                                })}
                                              />
                                            </div>
                                            <div>
                                              <Label>備註</Label>
                                              <Textarea
                                                value={editValues.notes}
                                                onChange={(e) => setEditValues({...editValues, notes: e.target.value})}
                                                placeholder="測試備註..."
                                              />
                                            </div>
                                          </div>
                                        ) : (
                                          <div className="space-y-2">
                                            <div className="flex items-center gap-2">
                                              <Badge className={getStatusColor(itemProgress?.status || 'Not Start')}>
                                                {itemProgress?.status || 'Not Start'}
                                              </Badge>
                                              <span className="text-sm text-muted-foreground">
                                                {itemProgress?.progress_percent || 0}%
                                              </span>
                                            </div>
                                            <Progress value={itemProgress?.progress_percent || 0} className="h-2" />
                                            {itemProgress?.notes && (
                                              <p className="text-sm text-muted-foreground">
                                                備註: {itemProgress.notes}
                                              </p>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </DialogContent>
                            </Dialog>
                          </div>
                          <Progress value={overallPercent} className="h-2" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}