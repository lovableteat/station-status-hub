
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Users, Settings, Target, Plus, Edit, Trash2, Save } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface SystemUser {
  id: string;
  username: string;
  role: string;
  status: string;
  created_at: string;
}

interface ProductionTarget {
  id: string;
  daily_target: number;
  weekly_target: number;
  target_date: string;
  created_at: string;
}

export function UserManagement() {
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [targets, setTargets] = useState<ProductionTarget[]>([]);
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'engineer' });
  const [newTarget, setNewTarget] = useState({ daily_target: 5, weekly_target: 25 });
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [isTargetDialogOpen, setIsTargetDialogOpen] = useState(false);
  const [editingTarget, setEditingTarget] = useState<ProductionTarget | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadUsers();
    loadTargets();
  }, []);

  const loadUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('system_users')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error loading users:', error);
      toast({
        title: "載入失敗",
        description: "無法載入使用者列表",
        variant: "destructive"
      });
    }
  };

  const loadTargets = async () => {
    try {
      const { data, error } = await supabase
        .from('production_targets')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTargets(data || []);
    } catch (error) {
      console.error('Error loading targets:', error);
      toast({
        title: "載入失敗",
        description: "無法載入生產目標",
        variant: "destructive"
      });
    }
  };

  const handleCreateUser = async () => {
    try {
      const { error } = await supabase
        .from('system_users')
        .insert({
          username: newUser.username,
          password_hash: newUser.password, // This should be hashed in production
          role: newUser.role,
          status: 'active'
        });

      if (error) throw error;

      toast({
        title: "新增成功",
        description: "使用者已新增"
      });

      setNewUser({ username: '', password: '', role: 'engineer' });
      setIsUserDialogOpen(false);
      loadUsers();
    } catch (error) {
      console.error('Error creating user:', error);
      toast({
        title: "新增失敗",
        description: "無法新增使用者",
        variant: "destructive"
      });
    }
  };

  const handleCreateTarget = async () => {
    try {
      const { error } = await supabase
        .from('production_targets')
        .insert({
          daily_target: newTarget.daily_target,
          weekly_target: newTarget.weekly_target,
          target_date: new Date().toISOString().split('T')[0]
        });

      if (error) throw error;

      toast({
        title: "新增成功",
        description: "生產目標已新增"
      });

      setNewTarget({ daily_target: 5, weekly_target: 25 });
      setIsTargetDialogOpen(false);
      loadTargets();
    } catch (error) {
      console.error('Error creating target:', error);
      toast({
        title: "新增失敗",
        description: "無法新增生產目標",
        variant: "destructive"
      });
    }
  };

  const handleUpdateTarget = async () => {
    if (!editingTarget) return;

    try {
      const { error } = await supabase
        .from('production_targets')
        .update({
          daily_target: newTarget.daily_target,
          weekly_target: newTarget.weekly_target
        })
        .eq('id', editingTarget.id);

      if (error) throw error;

      toast({
        title: "更新成功",
        description: "生產目標已更新"
      });

      setEditingTarget(null);
      setIsTargetDialogOpen(false);
      loadTargets();
    } catch (error) {
      console.error('Error updating target:', error);
      toast({
        title: "更新失敗",
        description: "無法更新生產目標",
        variant: "destructive"
      });
    }
  };

  const handleDeleteTarget = async (targetId: string) => {
    try {
      const { error } = await supabase
        .from('production_targets')
        .delete()
        .eq('id', targetId);

      if (error) throw error;

      toast({
        title: "刪除成功",
        description: "生產目標已刪除"
      });

      loadTargets();
    } catch (error) {
      console.error('Error deleting target:', error);
      toast({
        title: "刪除失敗",
        description: "無法刪除生產目標",
        variant: "destructive"
      });
    }
  };

  const openEditTargetDialog = (target: ProductionTarget) => {
    setEditingTarget(target);
    setNewTarget({
      daily_target: target.daily_target,
      weekly_target: target.weekly_target
    });
    setIsTargetDialogOpen(true);
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin':
        return <Badge className="bg-red-100 text-red-800">管理員</Badge>;
      case 'engineer':
        return <Badge className="bg-blue-100 text-blue-800">工程師</Badge>;
      case 'tester':
        return <Badge className="bg-green-100 text-green-800">測試員</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-800">{role}</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    return status === 'active' ? 
      <Badge className="bg-green-100 text-green-800">啟用</Badge> : 
      <Badge className="bg-red-100 text-red-800">停用</Badge>;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Users className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">後台使用者管理</h1>
          <p className="text-muted-foreground">管理系統使用者與生產目標設定</p>
        </div>
      </div>

      <Tabs defaultValue="users" className="space-y-6">
        <TabsList>
          <TabsTrigger value="users" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            使用者管理
          </TabsTrigger>
          <TabsTrigger value="targets" className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            生產目標設定
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>系統使用者</CardTitle>
                <Dialog open={isUserDialogOpen} onOpenChange={setIsUserDialogOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      新增使用者
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>新增系統使用者</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label>使用者名稱</Label>
                        <Input
                          value={newUser.username}
                          onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                          placeholder="請輸入使用者名稱"
                        />
                      </div>
                      <div>
                        <Label>密碼</Label>
                        <Input
                          type="password"
                          value={newUser.password}
                          onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                          placeholder="請輸入密碼"
                        />
                      </div>
                      <div>
                        <Label>角色</Label>
                        <Select value={newUser.role} onValueChange={(value) => setNewUser({ ...newUser, role: value })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">管理員</SelectItem>
                            <SelectItem value="engineer">工程師</SelectItem>
                            <SelectItem value="tester">測試員</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setIsUserDialogOpen(false)}>
                          取消
                        </Button>
                        <Button onClick={handleCreateUser}>
                          <Save className="h-4 w-4 mr-2" />
                          建立
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>使用者名稱</TableHead>
                    <TableHead>角色</TableHead>
                    <TableHead>狀態</TableHead>
                    <TableHead>建立時間</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.username}</TableCell>
                      <TableCell>{getRoleBadge(user.role)}</TableCell>
                      <TableCell>{getStatusBadge(user.status)}</TableCell>
                      <TableCell>{new Date(user.created_at).toLocaleDateString('zh-TW')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="targets">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>生產目標設定</CardTitle>
                <Dialog open={isTargetDialogOpen} onOpenChange={setIsTargetDialogOpen}>
                  <DialogTrigger asChild>
                    <Button onClick={() => setEditingTarget(null)}>
                      <Plus className="h-4 w-4 mr-2" />
                      新增目標設定
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>
                        {editingTarget ? '編輯目標設定' : '新增目標設定'}
                      </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label>每日目標 (台)</Label>
                        <Input
                          type="number"
                          value={newTarget.daily_target}
                          onChange={(e) => setNewTarget({ ...newTarget, daily_target: parseInt(e.target.value) || 0 })}
                          placeholder="請輸入每日目標"
                        />
                      </div>
                      <div>
                        <Label>每週目標 (台)</Label>
                        <Input
                          type="number"
                          value={newTarget.weekly_target}
                          onChange={(e) => setNewTarget({ ...newTarget, weekly_target: parseInt(e.target.value) || 0 })}
                          placeholder="請輸入每週目標"
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setIsTargetDialogOpen(false)}>
                          取消
                        </Button>
                        <Button onClick={editingTarget ? handleUpdateTarget : handleCreateTarget}>
                          <Save className="h-4 w-4 mr-2" />
                          {editingTarget ? '更新' : '建立'}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>每日目標</TableHead>
                    <TableHead>每週目標</TableHead>
                    <TableHead>目標設定</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {targets.map((target) => (
                    <TableRow key={target.id}>
                      <TableCell className="font-medium">{target.daily_target} 台</TableCell>
                      <TableCell>{target.weekly_target} 台</TableCell>
                      <TableCell>{new Date(target.target_date).toLocaleDateString('zh-TW')}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditTargetDialog(target)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>確認刪除</AlertDialogTitle>
                                <AlertDialogDescription>
                                  確定要刪除此目標設定嗎？此操作無法復原。
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>取消</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteTarget(target.id)}>
                                  刪除
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
