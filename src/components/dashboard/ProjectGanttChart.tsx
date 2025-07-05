import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Edit, Trash2, Save, MoreHorizontal } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { useUnifiedData } from '@/hooks/useUnifiedData';
import { useSystemTimeline } from '@/hooks/useSystemTimeline';
import { supabase } from '@/integrations/supabase/client';
import { SystemGanttEditor } from './SystemGanttEditor';

interface GanttTask {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  progress: number;
  dependencies?: string[];
  color: string;
}

interface GanttProject {
  id: string;
  name: string;
  tasks: GanttTask[];
}

export function ProjectGanttChart() {
  const { systems, progress } = useUnifiedData();
  const { calculateSystemTimeline, isLoading: timelineLoading } = useSystemTimeline();
  const [projects, setProjects] = useState<GanttProject[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<GanttTask | null>(null);
  const [systemTimelines, setSystemTimelines] = useState<Record<string, { start: string; end: string }>>({});
  const [formData, setFormData] = useState({
    name: '',
    startDate: '',
    endDate: '',
    progress: 0
  });
  const { toast } = useToast();

  useEffect(() => {
    const loadSystemTimelines = async () => {
      // Load existing timelines from database
      const { data: tasks } = await supabase
        .from('project_tasks')
        .select('task_name, start_date, end_date')
        .in('task_name', systems.map(s => s.system_name));

      const timelines: Record<string, { start: string; end: string }> = {};
      tasks?.forEach(task => {
        timelines[task.task_name] = {
          start: task.start_date || '',
          end: task.end_date || ''
        };
      });
      setSystemTimelines(timelines);
    };

    loadSystemTimelines();
  }, [systems]);

  useEffect(() => {
    if (timelineLoading || !systems.length) return;
    
    // Convert systems data to gantt format
    const ganttProjects: GanttProject[] = [{
      id: 'main-project',
      name: '測試專案管理',
      tasks: systems.map((system) => {
        const systemProgress = progress.filter(p => p.system_id === system.id);
        const avgProgress = systemProgress.length > 0 
          ? systemProgress.reduce((sum, p) => sum + (p.progress_percent || 0), 0) / systemProgress.length 
          : 0;

        // Use custom timeline if available, otherwise use calculated timeline
        const timeline = systemTimelines[system.system_name];
        let startDate, endDate;
        
        if (timeline && timeline.start && timeline.end) {
          startDate = new Date(timeline.start);
          endDate = new Date(timeline.end);
        } else {
          // Use system timeline calculation based on work schedule
          const calculatedTimeline = calculateSystemTimeline(system.system_name, systems);
          startDate = calculatedTimeline.startDate;
          endDate = calculatedTimeline.endDate;
        }

        return {
          id: system.id,
          name: system.system_name,
          startDate,
          endDate,
          progress: Math.round(avgProgress),
          color: getTaskColor(system.status)
        };
      })
    }];
    
    setProjects(ganttProjects);
  }, [systems, progress, systemTimelines, timelineLoading, calculateSystemTimeline]);

  const getTaskColor = (status: string) => {
    switch (status) {
      case 'Done': return 'hsl(var(--success))';
      case 'On-going': return 'hsl(var(--warning))';
      case 'Not Start': return 'hsl(var(--muted))';
      default: return 'hsl(var(--primary))';
    }
  };

  const handleSaveTask = async () => {
    try {
      // Save to project_tasks table
      const taskData = {
        task_name: formData.name,
        start_date: formData.startDate,
        end_date: formData.endDate,
        progress: formData.progress,
        assigned_to: 'System',
        priority: 'medium'
      };

      if (editingTask) {
        await supabase
          .from('project_tasks')
          .update(taskData)
          .eq('task_name', editingTask.name);
        toast({ title: '更新成功', description: '任務已更新' });
      } else {
        await supabase
          .from('project_tasks')
          .insert(taskData);
        toast({ title: '新增成功', description: '任務已新增' });
      }

      setIsDialogOpen(false);
      setEditingTask(null);
      resetForm();
      
      // Refresh data
      const loadSystemTimelines = async () => {
        const { data: tasks } = await supabase
          .from('project_tasks')
          .select('task_name, start_date, end_date')
          .in('task_name', systems.map(s => s.system_name));

        const timelines: Record<string, { start: string; end: string }> = {};
        tasks?.forEach(task => {
          timelines[task.task_name] = {
            start: task.start_date || '',
            end: task.end_date || ''
          };
        });
        setSystemTimelines(timelines);
      };
      loadSystemTimelines();
    } catch (error) {
      toast({
        title: '操作失敗',
        description: '無法儲存任務',
        variant: 'destructive'
      });
    }
  };

  const handleDeleteTask = async (taskName: string) => {
    try {
      await supabase
        .from('project_tasks')
        .delete()
        .eq('task_name', taskName);

      toast({ 
        title: '刪除成功', 
        description: `任務 ${taskName} 已刪除` 
      });

      // Refresh data
      const loadSystemTimelines = async () => {
        const { data: tasks } = await supabase
          .from('project_tasks')
          .select('task_name, start_date, end_date')
          .in('task_name', systems.map(s => s.system_name));

        const timelines: Record<string, { start: string; end: string }> = {};
        tasks?.forEach(task => {
          timelines[task.task_name] = {
            start: task.start_date || '',
            end: task.end_date || ''
          };
        });
        setSystemTimelines(timelines);
      };
      loadSystemTimelines();
    } catch (error) {
      toast({
        title: '刪除失敗',
        description: '無法刪除任務',
        variant: 'destructive'
      });
    }
  };

  const handleEditTask = (task: GanttTask) => {
    const timeline = systemTimelines[task.name];
    setFormData({
      name: task.name,
      startDate: timeline?.start || task.startDate.toISOString().split('T')[0],
      endDate: timeline?.end || task.endDate.toISOString().split('T')[0],
      progress: task.progress
    });
    setEditingTask(task);
    setIsDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      startDate: '',
      endDate: '',
      progress: 0
    });
  };

  const openAddDialog = () => {
    resetForm();
    setEditingTask(null);
    setIsDialogOpen(true);
  };

  const renderGanttChart = (project: GanttProject) => {
    const today = new Date();
    const projectStart = new Date(Math.min(...project.tasks.map(t => t.startDate.getTime())));
    const projectEnd = new Date(Math.max(...project.tasks.map(t => t.endDate.getTime())));
    const totalDays = Math.ceil((projectEnd.getTime() - projectStart.getTime()) / (1000 * 60 * 60 * 24));

    // Generate week markers
    const weekMarkers = [];
    let currentDate = new Date(projectStart);
    while (currentDate <= projectEnd) {
      const dayFromStart = Math.ceil((currentDate.getTime() - projectStart.getTime()) / (1000 * 60 * 60 * 24));
      const percent = (dayFromStart / totalDays) * 100;
      weekMarkers.push({
        date: new Date(currentDate),
        percent
      });
      currentDate.setDate(currentDate.getDate() + 7);
    }

    // Today marker
    const todayPercent = totalDays > 0 ? Math.max(0, Math.min(100, 
      ((today.getTime() - projectStart.getTime()) / (1000 * 60 * 60 * 24) / totalDays) * 100
    )) : 0;

    return (
      <div className="space-y-4">
        {/* Timeline Header */}
        <div className="space-y-2">
          <div className="grid grid-cols-12 gap-2 text-xs font-medium">
            <div className="col-span-3 text-muted-foreground">任務名稱</div>
            <div className="col-span-2 text-muted-foreground">開始日期</div>
            <div className="col-span-2 text-muted-foreground">結束日期</div>
            <div className="col-span-5 text-muted-foreground">進度時程表</div>
          </div>
          
          {/* Week markers */}
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-7"></div>
            <div className="col-span-5 relative h-8 bg-muted/30 rounded border">
              {weekMarkers.map((marker, idx) => (
                <div
                  key={idx}
                  className="absolute top-0 bottom-0 w-px bg-border"
                  style={{ left: `${marker.percent}%` }}
                >
                  <div className="absolute -top-6 -left-6 text-xs text-muted-foreground whitespace-nowrap">
                    {marker.date.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' })}
                  </div>
                </div>
              ))}
              {/* Today marker */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-primary z-10"
                style={{ left: `${todayPercent}%` }}
              >
                <div className="absolute -top-6 -left-4 text-xs text-primary font-medium">今日</div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Tasks */}
        <div className="space-y-1">
          {project.tasks.map(task => {
            const taskStart = Math.ceil((task.startDate.getTime() - projectStart.getTime()) / (1000 * 60 * 60 * 24));
            const taskDuration = Math.ceil((task.endDate.getTime() - task.startDate.getTime()) / (1000 * 60 * 60 * 24));
            const startPercent = totalDays > 0 ? (taskStart / totalDays) * 100 : 0;
            const widthPercent = totalDays > 0 ? (taskDuration / totalDays) * 100 : 0;

            const isDelayed = task.endDate < today && task.progress < 100;
            const isCritical = task.progress < 50 && task.endDate.getTime() - today.getTime() < 7 * 24 * 60 * 60 * 1000;

            return (
              <div key={task.id} className="grid grid-cols-12 gap-2 items-center py-2 hover:bg-muted/50 rounded-lg px-2 transition-colors">
                <div className="col-span-3">
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium truncate">{task.name}</span>
                      <span className={`text-xs ${isDelayed ? 'text-destructive' : isCritical ? 'text-warning' : 'text-muted-foreground'}`}>
                        {isDelayed ? '已延遲' : isCritical ? '需關注' : '正常'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="col-span-2 text-xs text-muted-foreground">
                  {task.startDate.toLocaleDateString('zh-TW')}
                </div>
                <div className="col-span-2 text-xs text-muted-foreground">
                  {task.endDate.toLocaleDateString('zh-TW')}
                </div>
                <div className="col-span-5 relative">
                  <div className="h-8 bg-muted rounded-lg relative overflow-hidden border">
                    <div
                      className="absolute h-full rounded-lg transition-all duration-300 flex items-center justify-center text-xs text-white font-medium shadow-sm"
                      style={{
                        left: `${Math.max(0, startPercent)}%`,
                        width: `${Math.min(100 - Math.max(0, startPercent), widthPercent)}%`,
                        backgroundColor: isDelayed ? 'hsl(var(--destructive))' : isCritical ? 'hsl(var(--warning))' : task.color
                      }}
                    >
                      {task.progress}%
                    </div>
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    <SystemGanttEditor
                      systemId={task.id}
                      systemName={task.name}
                      currentStartDate={systemTimelines[task.name]?.start}
                      currentEndDate={systemTimelines[task.name]?.end}
                      onUpdate={() => {
                        // Refresh timeline data
                        const loadSystemTimelines = async () => {
                          const { data: tasks } = await supabase
                            .from('project_tasks')
                            .select('task_name, start_date, end_date')
                            .in('task_name', systems.map(s => s.system_name));

                          const timelines: Record<string, { start: string; end: string }> = {};
                          tasks?.forEach(task => {
                            timelines[task.task_name] = {
                              start: task.start_date || '',
                              end: task.end_date || ''
                            };
                          });
                          setSystemTimelines(timelines);
                        };
                        loadSystemTimelines();
                      }}
                    />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                          <MoreHorizontal className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEditTask(task)}>
                          <Edit className="h-3 w-3 mr-2" />
                          編輯任務
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => handleDeleteTask(task.name)}
                          className="text-destructive"
                        >
                          <Trash2 className="h-3 w-3 mr-2" />
                          刪除任務
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="flex items-center gap-2">
            專案甘特圖
          </CardTitle>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openAddDialog} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                新增任務
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingTask ? '編輯任務' : '新增任務'}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>任務名稱</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="請輸入任務名稱"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>開始日期</Label>
                    <Input
                      type="date"
                      value={formData.startDate}
                      onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>結束日期</Label>
                    <Input
                      type="date"
                      value={formData.endDate}
                      onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    />
                  </div>
                </div>
                
                <div>
                  <Label>進度 (%)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.progress}
                    onChange={(e) => setFormData({ ...formData, progress: parseInt(e.target.value) || 0 })}
                  />
                </div>
                
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                    取消
                  </Button>
                  <Button onClick={handleSaveTask}>
                    <Save className="h-4 w-4 mr-2" />
                    儲存
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {projects.map(project => (
          <div key={project.id} className="space-y-4">
            <h4 className="font-medium">{project.name}</h4>
            {renderGanttChart(project)}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}