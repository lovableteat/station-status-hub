
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { AnnouncementEditDialog } from "./AnnouncementEditDialog";
import { Plus, Edit, Trash2, Pin } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Announcement {
  id: string;
  title: string;
  content: string;
  type: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function AnnouncementManager() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const { toast } = useToast();

  const fetchAnnouncements = async () => {
    try {
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAnnouncements(data || []);
    } catch (error) {
      console.error('Error fetching announcements:', error);
      toast({
        title: "載入失敗",
        description: "無法載入公告列表",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from('announcements')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "刪除成功",
        description: "公告已成功刪除"
      });
      
      fetchAnnouncements();
    } catch (error) {
      console.error('Error deleting announcement:', error);
      toast({
        title: "刪除失敗",
        description: "刪除公告時發生錯誤",
        variant: "destructive"
      });
    }
  };

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    try {
      const { error } = await supabase
        .from('announcements')
        .update({ is_active: !currentActive })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "更新成功",
        description: `公告已${!currentActive ? '啟用' : '停用'}`
      });
      
      fetchAnnouncements();
    } catch (error) {
      console.error('Error updating announcement:', error);
      toast({
        title: "更新失敗",
        description: "更新公告狀態時發生錯誤",
        variant: "destructive"
      });
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'system': return 'bg-blue-100 text-blue-800';
      case 'maintenance': return 'bg-yellow-100 text-yellow-800';
      case 'activity': return 'bg-green-100 text-green-800';
      case 'urgent': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getTypeName = (type: string) => {
    switch (type) {
      case 'system': return '系統通知';
      case 'maintenance': return '維護通知';
      case 'activity': return '活動訊息';
      case 'urgent': return '緊急通知';
      default: return '一般訊息';
    }
  };

  const handleEditSuccess = () => {
    setShowEditDialog(false);
    setEditingAnnouncement(null);
    fetchAnnouncements();
  };

  if (isLoading) {
    return <div className="p-6 text-center">載入中...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">公告管理</h1>
        <Button 
          onClick={() => {
            setEditingAnnouncement(null);
            setShowEditDialog(true);
          }}
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          新增公告
        </Button>
      </div>

      <div className="grid gap-4">
        {announcements.map((announcement) => (
          <Card key={announcement.id} className={!announcement.is_active ? 'opacity-60' : ''}>
            <CardHeader className="pb-3">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <CardTitle className="text-lg">{announcement.title}</CardTitle>
                    <Badge className={getTypeColor(announcement.type)}>
                      {getTypeName(announcement.type)}
                    </Badge>
                    {!announcement.is_active && (
                      <Badge variant="secondary">已停用</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    發佈時間: {new Date(announcement.created_at).toLocaleString('zh-TW')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleToggleActive(announcement.id, announcement.is_active)}
                  >
                    <Pin className={`h-4 w-4 ${announcement.is_active ? 'text-green-600' : 'text-gray-400'}`} />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditingAnnouncement(announcement);
                      setShowEditDialog(true);
                    }}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>確認刪除</AlertDialogTitle>
                        <AlertDialogDescription>
                          確定要刪除這則公告嗎？此操作無法復原。
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(announcement.id)}>
                          刪除
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 line-clamp-2">
                {announcement.content}
              </p>
            </CardContent>
          </Card>
        ))}
        
        {announcements.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              暫無公告，點擊上方按鈕新增第一則公告
            </CardContent>
          </Card>
        )}
      </div>

      <AnnouncementEditDialog
        isOpen={showEditDialog}
        onClose={() => {
          setShowEditDialog(false);
          setEditingAnnouncement(null);
        }}
        announcement={editingAnnouncement}
        onSuccess={handleEditSuccess}
      />
    </div>
  );
}
