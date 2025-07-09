
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Announcement {
  id: string;
  title: string;
  content: string;
  type: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface AnnouncementDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  announcement: Announcement | null;
  announcements?: Announcement[];
}

export function AnnouncementDetailModal({
  isOpen,
  onClose,
  announcement,
  announcements
}: AnnouncementDetailModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const currentAnnouncement = announcements 
    ? announcements[currentIndex] 
    : announcement;

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

  const goToPrevious = () => {
    if (announcements && currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const goToNext = () => {
    if (announcements && currentIndex < announcements.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  if (!currentAnnouncement) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Badge className={getTypeColor(currentAnnouncement.type)}>
                {getTypeName(currentAnnouncement.type)}
              </Badge>
              {announcements && (
                <span className="text-sm text-muted-foreground">
                  {currentIndex + 1} / {announcements.length}
                </span>
              )}
            </DialogTitle>
            {announcements && announcements.length > 1 && (
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goToPrevious}
                  disabled={currentIndex === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goToNext}
                  disabled={currentIndex === announcements.length - 1}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold mb-2">
                {currentAnnouncement.title}
              </h2>
              <p className="text-sm text-muted-foreground">
                發佈時間: {new Date(currentAnnouncement.created_at).toLocaleString('zh-TW')}
              </p>
            </div>

            <div className="border-t pt-4">
              <div className="whitespace-pre-wrap text-sm leading-relaxed">
                {currentAnnouncement.content}
              </div>
            </div>
          </div>
        </ScrollArea>

        <div className="flex justify-end pt-4 border-t">
          <Button onClick={onClose}>關閉</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
