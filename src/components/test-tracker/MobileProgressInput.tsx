import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Check, X, Clock, Play, Square, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface TestItem {
  id: string;
  station_id: string;
  item_name: string;
  item_order: number;
  description: string;
  estimated_minutes?: number;
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

interface MobileProgressInputProps {
  systemId: string;
  systemName: string;
  stationId: string;
  stationName: string;
  items: TestItem[];
  getProgressForSystemItem: (systemId: string, stationId: string, itemId: string) => TestProgress | undefined;
  getStatusColor: (status: string) => string;
  onUpdate: () => void;
}

export function MobileProgressInput({
  systemId,
  systemName,
  stationId,
  stationName,
  items,
  getProgressForSystemItem,
  getStatusColor,
  onUpdate,
}: MobileProgressInputProps) {
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('Not Start');
  const [notes, setNotes] = useState<string>('');
  const { toast } = useToast();

  const stationItems = items.filter(item => item.station_id === stationId)
    .sort((a, b) => a.item_order - b.item_order);

  const handleQuickAction = async (itemId: string, action: 'start' | 'complete' | 'issue') => {
    try {
      const currentProgress = getProgressForSystemItem(systemId, stationId, itemId);
      const now = new Date().toISOString();
      
      let updateData: any = {};
      
      switch (action) {
        case 'start':
          updateData = {
            system_id: systemId,
            station_id: stationId,
            item_id: itemId,
            status: 'On-going',
            progress_percent: 0,
            started_at: now,
            notes: notes || '開始測試'
          };
          break;
          
        case 'complete':
          updateData = {
            system_id: systemId,
            station_id: stationId,
            item_id: itemId,
            status: 'Done',
            progress_percent: 100,
            completed_at: now,
            notes: notes || '測試完成'
          };
          if (!currentProgress?.started_at) {
            updateData.started_at = now;
          }
          break;
          
        case 'issue':
          updateData = {
            system_id: systemId,
            station_id: stationId,
            item_id: itemId,
            status: 'Issue',
            progress_percent: currentProgress?.progress_percent || 0,
            notes: notes || '發現問題'
          };
          if (!currentProgress?.started_at) {
            updateData.started_at = now;
          }
          break;
      }

      if (currentProgress) {
        const { error } = await supabase
          .from('test_progress')
          .update(updateData)
          .eq('id', currentProgress.id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('test_progress')
          .insert([updateData]);
        
        if (error) throw error;
      }

      toast({
        title: "更新成功",
        description: `已更新 ${stationItems.find(item => item.id === itemId)?.item_name} 狀態`,
      });

      setNotes('');
      setSelectedItem(null);
      onUpdate();
    } catch (error) {
      console.error('Error updating progress:', error);
      toast({
        title: "更新失敗",
        description: "請稍後再試",
        variant: "destructive",
      });
    }
  };

  const handleCustomUpdate = async () => {
    if (!selectedItem) return;
    
    try {
      const currentProgress = getProgressForSystemItem(systemId, stationId, selectedItem);
      const now = new Date().toISOString();
      
      const progressPercent = status === 'Done' ? 100 : 
                            status === 'On-going' ? 50 : 0;
      
      const updateData: any = {
        system_id: systemId,
        station_id: stationId,
        item_id: selectedItem,
        status,
        progress_percent: progressPercent,
        notes: notes || ''
      };
      
      if (status === 'Done') {
        updateData.completed_at = now;
        if (!currentProgress?.started_at) {
          updateData.started_at = now;
        }
      } else if (status === 'On-going' && !currentProgress?.started_at) {
        updateData.started_at = now;
      }

      if (currentProgress) {
        const { error } = await supabase
          .from('test_progress')
          .update(updateData)
          .eq('id', currentProgress.id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('test_progress')
          .insert([updateData]);
        
        if (error) throw error;
      }

      toast({
        title: "更新成功",
        description: `已更新 ${stationItems.find(item => item.id === selectedItem)?.item_name} 狀態`,
      });

      setNotes('');
      setSelectedItem(null);
      setStatus('Not Start');
      onUpdate();
    } catch (error) {
      console.error('Error updating progress:', error);
      toast({
        title: "更新失敗",
        description: "請稍後再試",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="default" size="sm" className="bg-blue-600 hover:bg-blue-700">
          <Zap className="h-3 w-3 mr-1" />
          快速填寫
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            快速填寫 - {stationName}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* 測試項目列表 */}
          <div className="space-y-3">
            {stationItems.map(item => {
              const itemProgress = getProgressForSystemItem(systemId, stationId, item.id);
              const isSelected = selectedItem === item.id;
              
              return (
                <div 
                  key={item.id} 
                  className={`border rounded-lg p-3 transition-all ${
                    isSelected ? 'border-primary bg-primary/5' : 'border-border'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-sm">{item.item_name}</h4>
                      {itemProgress && (
                        <Badge className={`${getStatusColor(itemProgress.status)} text-xs`}>
                          {itemProgress.status}
                        </Badge>
                      )}
                    </div>
                  </div>
                  
                  {item.description && (
                    <p className="text-xs text-muted-foreground mb-2">{item.description}</p>
                  )}
                  
                  {/* 快速操作按鈕 */}
                  <div className="grid grid-cols-3 gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-8"
                      onClick={() => handleQuickAction(item.id, 'start')}
                      disabled={itemProgress?.status === 'Done'}
                    >
                      <Play className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-8 bg-green-50 hover:bg-green-100 text-green-700"
                      onClick={() => handleQuickAction(item.id, 'complete')}
                    >
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-8 bg-red-50 hover:bg-red-100 text-red-700"
                      onClick={() => handleQuickAction(item.id, 'issue')}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                  
                  {/* 顯示時間資訊 */}
                  {itemProgress && (itemProgress.started_at || itemProgress.completed_at) && (
                    <div className="mt-2 pt-2 border-t text-xs text-muted-foreground space-y-1">
                      {itemProgress.started_at && (
                        <div>開始: {new Date(itemProgress.started_at).toLocaleString('zh-TW')}</div>
                      )}
                      {itemProgress.completed_at && (
                        <div>完成: {new Date(itemProgress.completed_at).toLocaleString('zh-TW')}</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 快速備註區域 */}
          <div className="border-t pt-4 space-y-3">
            <Textarea
              placeholder="輸入快速備註 (選填)..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="text-sm"
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}