
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Edit, Save, X, Trash2 } from "lucide-react";

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

interface SimpleTestProgressTableProps {
  filteredSystems: any[];
  stations: any[];
  items: any[];
  progress: TestProgress[];
  editingProgress: string | null;
  setEditingProgress: (key: string | null) => void;
  editValues: {
    status: string;
    progress_percent: number;
    notes: string;
    started_at?: string;
    completed_at?: string;
  };
  setEditValues: (values: any) => void;
  getProgressForSystemItem: (systemId: string, stationId: string, itemId: string) => TestProgress | undefined;
  handleEditProgress: (systemId: string, stationId: string, itemId: string) => void;
  handleSaveProgress: (systemId: string, stationId: string, itemId: string) => void;
  handleDeleteProgress: (systemId: string, stationId: string, itemId: string) => void;
  getStatusColor: (status: string) => string;
  onSystemUpdate: () => void;
}

export function SimpleTestProgressTable({
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
  handleDeleteProgress,
  getStatusColor,
  onSystemUpdate,
}: SimpleTestProgressTableProps) {
  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return date.toISOString().slice(0, 16);
    } catch {
      return '';
    }
  };

  return (
    <div className="space-y-6">
      {filteredSystems.map((system) => (
        <Card key={system.id} className="w-full">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{system.system_name}</span>
              <Badge className={getStatusColor(system.status)}>
                {system.status}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stations.map((station) => {
                const stationItems = items.filter(item => item.station_id === station.id);
                if (stationItems.length === 0) return null;

                return (
                  <div key={station.id} className="border rounded-lg p-4">
                    <h4 className="font-semibold mb-3">{station.station_name}</h4>
                    <div className="space-y-2">
                      {stationItems.map((item) => {
                        const itemProgress = getProgressForSystemItem(system.id, station.id, item.id);
                        const isEditing = editingProgress === `${system.id}-${station.id}-${item.id}`;

                        return (
                          <div key={item.id} className="flex items-center justify-between p-2 border rounded">
                            <div className="flex-1">
                              <span className="font-medium">{item.item_name}</span>
                              {itemProgress && (
                                <Badge className={`ml-2 ${getStatusColor(itemProgress.status)}`}>
                                  {itemProgress.status} ({itemProgress.progress_percent}%)
                                </Badge>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              {!isEditing ? (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleEditProgress(system.id, station.id, item.id)}
                                  >
                                    <Edit className="h-3 w-3" />
                                  </Button>
                                  {itemProgress && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleDeleteProgress(system.id, station.id, item.id)}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  )}
                                </>
                              ) : (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleSaveProgress(system.id, station.id, item.id)}
                                  >
                                    <Save className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setEditingProgress(null)}
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}

      {/* 編輯表單 */}
      {editingProgress && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>編輯測試進度</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">狀態</label>
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
                    <SelectItem value="Issue">有問題</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">進度 (%)</label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={editValues.progress_percent}
                  onChange={(e) => setEditValues({...editValues, progress_percent: parseInt(e.target.value) || 0})}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">開始時間</label>
                <Input
                  type="datetime-local"
                  value={editValues.started_at ? formatDateTime(editValues.started_at) : ''}
                  onChange={(e) => setEditValues({
                    ...editValues, 
                    started_at: e.target.value ? new Date(e.target.value).toISOString() : ''
                  })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">完成時間</label>
                <Input
                  type="datetime-local"
                  value={editValues.completed_at ? formatDateTime(editValues.completed_at) : ''}
                  onChange={(e) => setEditValues({
                    ...editValues, 
                    completed_at: e.target.value ? new Date(e.target.value).toISOString() : ''
                  })}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">備註</label>
              <Textarea
                value={editValues.notes}
                onChange={(e) => setEditValues({...editValues, notes: e.target.value})}
                placeholder="輸入備註..."
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
