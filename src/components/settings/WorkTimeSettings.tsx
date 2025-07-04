import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Clock, Settings, Calendar, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface WorkTimeConfig {
  daily_work_hours: number;
  work_days: string[];
  overtime_rate: number;
  start_time: string;
  end_time: string;
  break_duration: number;
}

const DEFAULT_CONFIG: WorkTimeConfig = {
  daily_work_hours: 8,
  work_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
  overtime_rate: 1.5,
  start_time: '09:00',
  end_time: '18:00',
  break_duration: 60
};

const WEEK_DAYS = [
  { key: 'Monday', label: '週一' },
  { key: 'Tuesday', label: '週二' },
  { key: 'Wednesday', label: '週三' },
  { key: 'Thursday', label: '週四' },
  { key: 'Friday', label: '週五' },
  { key: 'Saturday', label: '週六' },
  { key: 'Sunday', label: '週日' }
];

export function WorkTimeSettings() {
  const [config, setConfig] = useState<WorkTimeConfig>(DEFAULT_CONFIG);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('*')
        .eq('category', 'work_time')
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading settings:', error);
        return;
      }

      if (data) {
        setConfig(data.settings as unknown as WorkTimeConfig);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveSettings = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('system_settings')
        .upsert({
          category: 'work_time',
          settings: config as any,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;

      toast({
        title: "設定已儲存",
        description: "工作時間設定已成功更新",
      });
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: "儲存失敗",
        description: "無法儲存工作時間設定",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const toggleWorkDay = (day: string) => {
    setConfig(prev => ({
      ...prev,
      work_days: prev.work_days.includes(day)
        ? prev.work_days.filter(d => d !== day)
        : [...prev.work_days, day]
    }));
  };

  const calculateOvertimeThreshold = () => {
    const startTime = new Date(`2024-01-01T${config.start_time}`);
    const endTime = new Date(`2024-01-01T${config.end_time}`);
    const workMinutes = (endTime.getTime() - startTime.getTime()) / 60000;
    const workHours = (workMinutes - config.break_duration) / 60;
    return Math.round(workHours * 100) / 100;
  };

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-muted rounded w-1/3"></div>
        <div className="h-64 bg-muted rounded"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Settings className="h-6 w-6" />
            工作時間設定
          </h2>
          <p className="text-muted-foreground">配置系統的工作時間規則和加班計算</p>
        </div>
        <Button onClick={saveSettings} disabled={isSaving}>
          <Save className="h-4 w-4 mr-2" />
          {isSaving ? '儲存中...' : '儲存設定'}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 基本設定 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              基本工作時間
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="start-time">上班時間</Label>
                <Input
                  id="start-time"
                  type="time"
                  value={config.start_time}
                  onChange={(e) => setConfig(prev => ({ ...prev, start_time: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="end-time">下班時間</Label>
                <Input
                  id="end-time"
                  type="time"
                  value={config.end_time}
                  onChange={(e) => setConfig(prev => ({ ...prev, end_time: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="daily-hours">每日工作時間 (小時)</Label>
                <Input
                  id="daily-hours"
                  type="number"
                  min="1"
                  max="24"
                  value={config.daily_work_hours}
                  onChange={(e) => setConfig(prev => ({ ...prev, daily_work_hours: parseInt(e.target.value) || 8 }))}
                />
              </div>
              <div>
                <Label htmlFor="break-duration">午休時間 (分鐘)</Label>
                <Input
                  id="break-duration"
                  type="number"
                  min="0"
                  max="180"
                  value={config.break_duration}
                  onChange={(e) => setConfig(prev => ({ ...prev, break_duration: parseInt(e.target.value) || 60 }))}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="overtime-rate">加班費率倍數</Label>
              <Input
                id="overtime-rate"
                type="number"
                min="1"
                max="3"
                step="0.1"
                value={config.overtime_rate}
                onChange={(e) => setConfig(prev => ({ ...prev, overtime_rate: parseFloat(e.target.value) || 1.5 }))}
              />
            </div>

            <Separator />

            <div className="bg-muted/20 p-4 rounded-lg">
              <h4 className="font-medium mb-2">時間計算摘要</h4>
              <div className="space-y-1 text-sm">
                <p>實際工作時間: {calculateOvertimeThreshold()} 小時</p>
                <p>加班門檻: 超過 {config.daily_work_hours} 小時</p>
                <p>加班費率: {config.overtime_rate}x</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 工作日設定 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              工作日設定
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-base font-medium">選擇工作日</Label>
              <p className="text-sm text-muted-foreground mb-3">
                選擇的日期為正常工作日，其他日期視為加班日
              </p>
              
              <div className="grid grid-cols-2 gap-3">
                {WEEK_DAYS.map(day => (
                  <div key={day.key} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{day.label}</span>
                      {config.work_days.includes(day.key) && (
                        <Badge variant="secondary" className="text-xs">工作日</Badge>
                      )}
                    </div>
                    <Switch
                      checked={config.work_days.includes(day.key)}
                      onCheckedChange={() => toggleWorkDay(day.key)}
                    />
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            <div className="bg-muted/20 p-4 rounded-lg">
              <h4 className="font-medium mb-2">工作日摘要</h4>
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1">
                  <span className="text-sm">工作日: </span>
                  {config.work_days.map(day => (
                    <Badge key={day} variant="outline" className="text-xs">
                      {WEEK_DAYS.find(d => d.key === day)?.label}
                    </Badge>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground">
                  每週工作 {config.work_days.length} 天，共 {config.work_days.length * config.daily_work_hours} 小時
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}