
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Announcement {
  id: string;
  title: string;
  content: string;
  type: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface AnnouncementEditDialogProps {
  isOpen: boolean;
  onClose: () => void;
  announcement?: Announcement | null;
  onSuccess: () => void;
}

export function AnnouncementEditDialog({
  isOpen,
  onClose,
  announcement,
  onSuccess
}: AnnouncementEditDialogProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [type, setType] = useState("info");
  const [isActive, setIsActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (announcement) {
      setTitle(announcement.title);
      setContent(announcement.content);
      setType(announcement.type || "info");
      setIsActive(announcement.is_active);
    } else {
      setTitle("");
      setContent("");
      setType("info");
      setIsActive(true);
    }
  }, [announcement]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      toast({
        title: "輸入錯誤",
        description: "請填寫標題和內容",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const announcementData = {
        title: title.trim(),
        content: content.trim(),
        type,
        is_active: isActive
      };

      if (announcement) {
        // 更新現有公告
        const { error } = await supabase
          .from('announcements')
          .update(announcementData)
          .eq('id', announcement.id);

        if (error) throw error;

        toast({
          title: "更新成功",
          description: "公告已成功更新"
        });
      } else {
        // 新增公告
        const { error } = await supabase
          .from('announcements')
          .insert([announcementData]);

        if (error) throw error;

        toast({
          title: "新增成功",
          description: "公告已成功新增"
        });
      }

      onSuccess();
    } catch (error) {
      console.error('Error saving announcement:', error);
      toast({
        title: "儲存失敗",
        description: "儲存公告時發生錯誤",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>
            {announcement ? "編輯公告" : "新增公告"}
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">標題</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="請輸入公告標題"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">公告類型</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="info">一般訊息</SelectItem>
                <SelectItem value="system">系統通知</SelectItem>
                <SelectItem value="maintenance">維護通知</SelectItem>
                <SelectItem value="activity">活動訊息</SelectItem>
                <SelectItem value="urgent">緊急通知</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="content">內容</Label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="請輸入公告內容"
              rows={6}
              required
            />
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="is_active"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
            <Label htmlFor="is_active">立即發佈</Label>
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "儲存中..." : (announcement ? "更新" : "新增")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
