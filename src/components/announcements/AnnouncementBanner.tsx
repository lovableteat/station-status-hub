
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AnnouncementDetailModal } from "./AnnouncementDetailModal";

interface Announcement {
  id: string;
  title: string;
  content: string;
  type: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface AnnouncementBannerProps {
  showInModal?: boolean;
  maxDisplay?: number;
}

export function AnnouncementBanner({ showInModal = false, maxDisplay = 3 }: AnnouncementBannerProps) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  const fetchActiveAnnouncements = async () => {
    try {
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(maxDisplay);

      if (error) throw error;
      setAnnouncements(data || []);
      
      // 如果有新公告且設定為模態顯示，則自動彈出
      if (showInModal && data && data.length > 0) {
        setShowModal(true);
      }
    } catch (error) {
      console.error('Error fetching announcements:', error);
    }
  };

  useEffect(() => {
    fetchActiveAnnouncements();
  }, [maxDisplay]);

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'system': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'maintenance': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'activity': return 'bg-green-100 text-green-800 border-green-200';
      case 'urgent': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
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

  if (!isVisible || announcements.length === 0) {
    return null;
  }

  const displayedAnnouncements = isExpanded ? announcements : announcements.slice(0, 1);

  return (
    <>
      <Card className="mb-6 border-l-4 border-l-blue-500">
        <CardContent className="p-4">
          <div className="flex justify-between items-start mb-2">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              📢 最新公告
              {announcements.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="h-6 px-2"
                >
                  {isExpanded ? (
                    <>
                      <ChevronUp className="h-4 w-4" />
                      收起
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-4 w-4" />
                      查看全部 ({announcements.length})
                    </>
                  )}
                </Button>
              )}
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsVisible(false)}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-3">
            {displayedAnnouncements.map((announcement) => (
              <div
                key={announcement.id}
                className="border-l-2 border-gray-200 pl-4 cursor-pointer hover:bg-gray-50 rounded p-2 transition-colors"
                onClick={() => {
                  setSelectedAnnouncement(announcement);
                  setShowModal(true);
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Badge className={getTypeColor(announcement.type)}>
                    {getTypeName(announcement.type)}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {new Date(announcement.created_at).toLocaleDateString('zh-TW')}
                  </span>
                </div>
                <h4 className="font-medium mb-1">{announcement.title}</h4>
                <p className="text-sm text-gray-600 line-clamp-2">
                  {announcement.content}
                </p>
                <div className="text-xs text-blue-600 mt-1">點擊查看詳情 →</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <AnnouncementDetailModal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setSelectedAnnouncement(null);
        }}
        announcement={selectedAnnouncement}
        announcements={showInModal ? announcements : undefined}
      />
    </>
  );
}
