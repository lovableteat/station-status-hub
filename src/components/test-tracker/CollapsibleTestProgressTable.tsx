import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProgressEditDialog } from "./ProgressEditDialog";
import { SystemEditDialog } from "./SystemEditDialog";
import { ChevronDown, ChevronRight } from "lucide-react";

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

interface CollapsibleTestProgressTableProps {
  filteredSystems: TestSystem[];
  stations: TestStation[];
  items: TestItem[];
  progress: TestProgress[];
  editingProgress: string | null;
  setEditingProgress: (key: string | null) => void;
  editValues: {
    status: string;
    progress_percent: number;
    notes: string;
  };
  setEditValues: (values: any) => void;
  getProgressForSystemItem: (systemId: string, stationId: string, itemId: string) => TestProgress | undefined;
  handleEditProgress: (systemId: string, stationId: string, itemId: string) => void;
  handleSaveProgress: (systemId: string, stationId: string, itemId: string) => void;
  getStatusColor: (status: string) => string;
  onSystemUpdate: () => void;
}

export function CollapsibleTestProgressTable({
  filteredSystems,
  stations,
  items,
  progress,
  editingProgress,
  setEditingProgress,
  editValues,
  setEditValues,
  getProgressForSystemItem,
  handleEditProgress,
  handleSaveProgress,
  getStatusColor,
  onSystemUpdate,
}: CollapsibleTestProgressTableProps) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Filter stations to only show Station 0-3
  const filteredStations = stations.filter(station => 
    station.station_order >= 0 && station.station_order <= 3
  );

  const toggleRow = (key: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedRows(newExpanded);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>測試進度表</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {filteredSystems.map(system => (
            <div key={system.id} className="border rounded-lg overflow-hidden">
              {/* System Header */}
              <div className="bg-muted/30 p-4 border-b">
                <div className="grid grid-cols-12 gap-4 items-center">
                  <div className="col-span-3 flex items-center gap-2">
                    <button 
                      className="font-medium text-primary hover:underline cursor-pointer text-left"
                      onClick={() => {
                        // Navigate to production monitor with focus on specific system
                        const currentUrl = new URL(window.location.href);
                        currentUrl.searchParams.set('system', system.system_name);
                        window.history.pushState({}, '', currentUrl.toString());
                        
                        // Dispatch custom event to trigger navigation
                        const event = new CustomEvent('navigate', { 
                          detail: { module: 'monitor', params: { system: system.system_name } } 
                        });
                        window.dispatchEvent(event);
                      }}
                    >
                      {system.system_name}
                    </button>
                    <SystemEditDialog
                      systemId={system.id}
                      systemName={system.system_name}
                      assignedEngineer={system.assigned_engineer}
                      onUpdate={onSystemUpdate}
                    />
                  </div>
                  
                  <div className="col-span-2">
                    <SystemEditDialog
                      systemId={system.id}
                      systemName={system.system_name}
                      assignedEngineer={system.assigned_engineer}
                      onUpdate={onSystemUpdate}
                      variant="button"
                    />
                  </div>
                  
                  <div className="col-span-2">
                    <Badge className={getStatusColor(system.status)}>
                      {system.current_station}
                    </Badge>
                  </div>
                  
                  <div className="col-span-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">整體進度: {system.overall_progress}%</span>
                      <Progress value={system.overall_progress} className="flex-1 h-2" />
                    </div>
                  </div>
                  
                  <div className="col-span-2 text-right">
                    <Badge variant="outline" className={getStatusColor(system.status)}>
                      {system.status === 'Done' ? '已完成' : system.status === 'On-going' ? '進行中' : '未開始'}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Station Rows */}
              <div className="divide-y">
                {filteredStations.map(station => {
                  const stationItems = items.filter(item => item.station_id === station.id);
                  const completedItems = stationItems.filter(item => {
                    const prog = getProgressForSystemItem(system.id, station.id, item.id);
                    return prog?.status === 'Done';
                  });
                  const overallPercent = stationItems.length > 0 
                    ? Math.round((completedItems.length / stationItems.length) * 100) 
                    : 0;

                  const rowKey = `${system.id}-${station.id}`;
                  const isExpanded = expandedRows.has(rowKey);

                  return (
                    <div key={station.id}>
                      {/* Station Header Row */}
                      <div 
                        className="p-3 hover:bg-muted/25 cursor-pointer transition-colors"
                        onClick={() => toggleRow(rowKey)}
                      >
                        <div className="grid grid-cols-12 gap-4 items-center">
                          <div className="col-span-1 flex justify-center">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </div>
                          
                          <div className="col-span-3 font-medium">
                            {station.station_name}
                          </div>
                          
                          <div className="col-span-2 text-sm text-muted-foreground">
                            {stationItems.length} 個測試項目
                          </div>
                          
                          <div className="col-span-3">
                            <div className="flex items-center gap-2">
                              <span className="text-sm">進度: {overallPercent}%</span>
                              <Progress value={overallPercent} className="flex-1 h-2" />
                            </div>
                          </div>
                          
                          <div className="col-span-2">
                            <Badge variant="secondary" className={
                              overallPercent === 100 ? 'bg-success text-success-foreground' :
                              overallPercent > 0 ? 'bg-warning text-warning-foreground' :
                              'bg-muted text-muted-foreground'
                            }>
                              {completedItems.length}/{stationItems.length}
                            </Badge>
                          </div>
                          
                          <div className="col-span-1">
                            <ProgressEditDialog
                              systemName={system.system_name}
                              stationName={station.station_name}
                              stationItems={stationItems}
                              progress={progress}
                              editingProgress={editingProgress}
                              setEditingProgress={setEditingProgress}
                              editValues={editValues}
                              setEditValues={setEditValues}
                              getProgressForSystemItem={getProgressForSystemItem}
                              handleEditProgress={handleEditProgress}
                              handleSaveProgress={handleSaveProgress}
                              getStatusColor={getStatusColor}
                              systemId={system.id}
                              stationId={station.id}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Expanded Items */}
                      {isExpanded && (
                        <div className="bg-muted/10 border-t">
                          {stationItems.map(item => {
                            const itemProgress = getProgressForSystemItem(system.id, station.id, item.id);
                            return (
                              <div 
                                key={item.id} 
                                className="grid grid-cols-12 gap-4 items-center p-3 border-b last:border-b-0 hover:bg-muted/50 transition-colors"
                              >
                                <div className="col-span-1"></div>
                                
                                <div className="col-span-4">
                                  <div className="text-sm font-medium">{item.item_name}</div>
                                  {item.description && (
                                    <div className="text-xs text-muted-foreground mt-1">{item.description}</div>
                                  )}
                                </div>
                                
                                <div className="col-span-2">
                                  <Badge className={getStatusColor(itemProgress?.status || 'Not Start')}>
                                    {itemProgress?.status || 'Not Start'}
                                  </Badge>
                                </div>
                                
                                <div className="col-span-2">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm">{itemProgress?.progress_percent || 0}%</span>
                                    <Progress value={itemProgress?.progress_percent || 0} className="flex-1 h-1" />
                                  </div>
                                </div>
                                
                                <div className="col-span-2 text-xs text-muted-foreground">
                                  {itemProgress?.notes || '無備註'}
                                </div>
                                
                                <div className="col-span-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleEditProgress(system.id, station.id, item.id)}
                                  >
                                    編輯
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}