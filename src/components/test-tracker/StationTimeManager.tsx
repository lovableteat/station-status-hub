
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TimeInputControls } from "./TimeInputControls";
import { Clock, Settings, Save, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";

interface StationTimeSettings {
  id?: string;
  system_id: string;
  station_id: string;
  estimated_start_time?: string;
  estimated_end_time?: string;
  actual_completion_time?: string;
  created_at?: string;
  updated_at?: string;
}

interface StationTimeManagerProps {
  systemId: string;
  stationId: string;
  stationName: string;
  systemName: string;
  onUpdate?: () => void;
}

export function StationTimeManager({
  systemId,
  stationId,
  stationName,
  systemName,
  onUpdate
}: StationTimeManagerProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [settings, setSettings] = useState<StationTimeSettings | null>(null);
  const [estimatedStartTime, setEstimatedStartTime] = useState<string | undefined>();
  const [estimatedEndTime, setEstimatedEndTime] = useState<string | undefined>();
  const [actualCompletionTime, setActualCompletionTime] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();
  const isMobile = useIsMobile();

  // 檢查是否為Station 4或之後的station
  const isEligibleStation = () => {
    return stationName.includes('Station 4') || 
           stationName.includes('NV TEST') ||
           stationName.match(/Station [5-9]/) ||
           stationName.match(/Station [1-9][0-9]/);
  };

  // 載入站點時間設定
  const loadStationTimeSettings = async () => {
    try {
      setIsLoading(true);
      
      const { data, error } = await supabase
        .from('station_time_settings' as any)
        .select('*')
        .eq('system_id', systemId)
        .eq('station_id', stationId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') { // PGRST116 is "not found" error
        console.error('Error loading station time settings:', error);
        return;
      }

      if (data) {
        const timeSettings = data as StationTimeSettings;
        setSettings(timeSettings);
        setEstimatedStartTime(timeSettings.estimated_start_time || undefined);
        setEstimatedEndTime(timeSettings.estimated_end_time || undefined);
        setActualCompletionTime(timeSettings.actual_completion_time || undefined);
      } else {
        // 如果沒有設定，自動計算實際完成時間
        await calculateActualCompletionTime();
      }
    } catch (error) {
      console.error('Error loading station time settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 計算實際完成時間（從該站點的所有完成項目中取最晚時間）
  const calculateActualCompletionTime = async () => {
    try {
      const { data: progressData, error } = await supabase
        .from('test_progress')
        .select('completed_at')
        .eq('system_id', systemId)
        .eq('station_id', stationId)
        .eq('status', 'Done')
        .not('completed_at', 'is', null)
        .order('completed_at', { ascending: false })
        .limit(1);

      if (error) {
        console.error('Error calculating actual completion time:', error);
        return null;
      }

      if (progressData && progressData.length > 0) {
        const latestCompletionTime = progressData[0].completed_at;
        setActualCompletionTime(latestCompletionTime);
        return latestCompletionTime;
      }
    } catch (error) {
      console.error('Error calculating actual completion time:', error);
    }
    return null;
  };

  // 儲存站點時間設定
  const saveStationTimeSettings = async () => {
    try {
      setIsSaving(true);

      const settingsData = {
        system_id: systemId,
        station_id: stationId,
        estimated_start_time: estimatedStartTime,
        estimated_end_time: estimatedEndTime,
        actual_completion_time: actualCompletionTime
      };

      let result;
      if (settings?.id) {
        // 更新現有設定
        result = await supabase
          .from('station_time_settings' as any)
          .update(settingsData)
          .eq('id', settings.id)
          .select()
          .single();
      } else {
        // 創建新設定
        result = await supabase
          .from('station_time_settings' as any)
          .insert(settingsData)
          .select()
          .single();
      }

      if (result.error) {
        throw result.error;
      }

      setSettings(result.data as StationTimeSettings);
      toast({
        title: "設定已儲存",
        description: `${stationName} 時間設定已成功更新`
      });

      onUpdate?.();
    } catch (error) {
      console.error('Error saving station time settings:', error);
      toast({
        title: "儲存失敗",
        description: "無法儲存站點時間設定",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  // 重新計算實際完成時間
  const recalculateActualTime = async () => {
    const calculatedTime = await calculateActualCompletionTime();
    if (calculatedTime) {
      toast({
        title: "實際完成時間已更新",
        description: "已自動設定為該站點最晚完成時間"
      });
    } else {
      toast({
        title: "無法計算實際完成時間",
        description: "該站點還沒有已完成的測試項目",
        variant: "destructive"
      });
    }
  };

  useEffect(() => {
    if (dialogOpen && isEligibleStation()) {
      loadStationTimeSettings();
    }
  }, [dialogOpen, systemId, stationId]);

  // 如果不是符合條件的站點，不顯示按鈕
  if (!isEligibleStation()) {
    return null;
  }

  const formatDisplayTime = (timeStr?: string) => {
    if (!timeStr) return '-';
    try {
      return new Date(timeStr).toLocaleString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '-';
    }
  };

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 px-2">
          <Clock className="h-3 w-3 mr-1" />
          時間設定
        </Button>
      </DialogTrigger>
      <DialogContent className={isMobile ? "max-w-[95vw] max-h-[90vh]" : "max-w-2xl max-h-[85vh]"}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            {systemName} - {stationName} 時間設定
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <>
              {/* 預計開始時間 */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">預計開始時間</CardTitle>
                </CardHeader>
                <CardContent>
                  <TimeInputControls
                    label="設定預計開始時間"
                    value={estimatedStartTime}
                    onChange={setEstimatedStartTime}
                    isMobile={isMobile}
                  />
                </CardContent>
              </Card>

              {/* 預計完成時間 */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">預計完成時間</CardTitle>
                </CardHeader>
                <CardContent>
                  <TimeInputControls
                    label="設定預計完成時間"
                    value={estimatedEndTime}
                    onChange={setEstimatedEndTime}
                    minValue={estimatedStartTime}
                    isMobile={isMobile}
                  />
                </CardContent>
              </Card>

              {/* 實際完成時間 */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">實際完成時間</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={recalculateActualTime}
                      disabled={isSaving}
                    >
                      <Clock className="h-3 w-3 mr-1" />
                      自動計算
                    </Button>
                    <div className="text-sm text-muted-foreground flex items-center">
                      將自動設定為該站點最晚完成時間
                    </div>
                  </div>
                  
                  <TimeInputControls
                    label="手動調整實際完成時間"
                    value={actualCompletionTime}
                    onChange={setActualCompletionTime}
                    isMobile={isMobile}
                  />
                </CardContent>
              </Card>

              {/* 當前設定概覽 */}
              {(estimatedStartTime || estimatedEndTime || actualCompletionTime) && (
                <Card className="bg-muted/30">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">當前時間設定</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 gap-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">預計開始:</span>
                        <span className="font-medium">{formatDisplayTime(estimatedStartTime)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">預計完成:</span>
                        <span className="font-medium">{formatDisplayTime(estimatedEndTime)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">實際完成:</span>
                        <span className="font-medium">{formatDisplayTime(actualCompletionTime)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* 操作按鈕 */}
              <div className="flex gap-2 pt-4">
                <Button 
                  onClick={saveStationTimeSettings} 
                  disabled={isSaving}
                  className="flex-1"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {isSaving ? '儲存中...' : '儲存設定'}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setDialogOpen(false)}
                  className="flex-1"
                >
                  <X className="h-4 w-4 mr-2" />
                  取消
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
