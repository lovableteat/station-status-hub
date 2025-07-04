import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Edit, Trash2, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useUnifiedData } from '@/hooks/useUnifiedData';
import { supabase } from '@/integrations/supabase/client';

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
  const [formData, setFormData] = useState({
    name: '',
    startDate: '',
    endDate: '',
    progress: 0
  });
  const { toast } = useToast();

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

        const startDate = new Date();
        startDate.setDate(startDate.getDate() + (index * 7)); // Stagger start dates
        
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 28); // 4 weeks duration

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
  }, [systems, progress]);

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
          .eq('id', editingTask.id);
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
      
      // Refresh data - would need to reload gantt data
    } catch (error) {
      toast({
        title: '操作失敗',
        description: '無法儲存任務',
        variant: 'destructive'
      });
    }
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
              <div className="col-span-3 text-sm font-medium truncate">
                {task.name}
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