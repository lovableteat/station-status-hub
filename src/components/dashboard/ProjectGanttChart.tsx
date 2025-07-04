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
    // Convert systems data to gantt format
    const ganttProjects: GanttProject[] = [{
      id: 'main-project',
      name: '測試專案管理',
      tasks: systems.map((system, index) => {
        const systemProgress = progress.filter(p => p.system_id === system.id);
        const avgProgress = systemProgress.length > 0 
          ? systemProgress.reduce((sum, p) => sum + (p.progress_percent || 0), 0) / systemProgress.length 
          : 0;

        // Use custom timeline if available, otherwise use default
        const timeline = systemTimelines[system.system_name];
        let startDate, endDate;
        
        if (timeline && timeline.start && timeline.end) {
          startDate = new Date(timeline.start);
          endDate = new Date(timeline.end);
        } else {
          startDate = new Date();
          startDate.setDate(startDate.getDate() + (index * 7)); // Stagger start dates
          endDate = new Date(startDate);
          endDate.setDate(endDate.getDate() + 28); // 4 weeks duration
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
  }, [systems, progress, systemTimelines]);

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

    return (
      <div className="space-y-2">
        <div className="grid grid-cols-12 gap-2 text-xs text-muted-foreground mb-2">
          <div className="col-span-3">任務名稱</div>
          <div className="col-span-9 flex justify-between">
            <span>{projectStart.toLocaleDateString()}</span>
            <span>{projectEnd.toLocaleDateString()}</span>
          </div>
        </div>
        
        {project.tasks.map(task => {
          const taskStart = Math.ceil((task.startDate.getTime() - projectStart.getTime()) / (1000 * 60 * 60 * 24));
          const taskDuration = Math.ceil((task.endDate.getTime() - task.startDate.getTime()) / (1000 * 60 * 60 * 24));
          const startPercent = (taskStart / totalDays) * 100;
          const widthPercent = (taskDuration / totalDays) * 100;

          return (
            <div key={task.id} className="grid grid-cols-12 gap-2 items-center py-1">
              <div className="col-span-3 text-sm font-medium truncate flex items-center gap-2">
                {task.name}
                <div className="flex items-center gap-1">
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
                        className="text-danger"
                      >
                        <Trash2 className="h-3 w-3 mr-2" />
                        刪除任務
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              <div className="col-span-9 relative h-6 bg-muted rounded">
                <div
                  className="absolute h-full rounded transition-all duration-300 flex items-center justify-center text-xs text-white font-medium"
                  style={{
                    left: `${startPercent}%`,
                    width: `${widthPercent}%`,
                    backgroundColor: task.color
                  }}
                >
                  {task.progress}%
                </div>
              </div>
            </div>
          );
        })}
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