import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CheckCircle, MessageSquare, X } from "lucide-react";
import { useNotificationReplies } from '@/hooks/useNotificationReplies';

interface NotificationReplyDialogProps {
  isOpen: boolean;
  onClose: () => void;
  notification: {
    id: string;
    title: string;
    message: string;
    sender_id: string;
    metadata?: any;
  };
}

export function NotificationReplyDialog({
  isOpen,
  onClose,
  notification
}: NotificationReplyDialogProps) {
  const [replyContent, setReplyContent] = useState('');
  const [selectedReplyType, setSelectedReplyType] = useState('completion');
  const { sendReply, isLoading } = useNotificationReplies();

  const quickReplies = [
    { type: 'completion', label: '已完成', content: '任務已完成', icon: CheckCircle, color: 'bg-green-500' },
    { type: 'progress', label: '進行中', content: '任務進行中，預計今日完成', icon: MessageSquare, color: 'bg-blue-500' },
    { type: 'issue', label: '有問題', content: '遇到問題，需要進一步討論', icon: X, color: 'bg-red-500' }
  ];

  const handleQuickReply = (type: string, content: string) => {
    setSelectedReplyType(type);
    setReplyContent(content);
  };

  const handleSendReply = async () => {
    if (!replyContent.trim()) return;

    const result = await sendReply(notification.id, selectedReplyType, replyContent);
    if (result) {
      // 回覆成功後，觸發頁面刷新以顯示新的對話
      window.dispatchEvent(new CustomEvent('notification-reply-sent', { 
        detail: { notificationId: notification.id, replyId: result.id } 
      }));
      onClose();
      setReplyContent('');
      setSelectedReplyType('completion');
    }
  };

  const handleClose = () => {
    onClose();
    setReplyContent('');
    setSelectedReplyType('completion');
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            回覆通知
          </DialogTitle>
          <DialogDescription>
            回覆來自 {notification.metadata?.sender_name || '用戶'} 的標註
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 原始通知內容 */}
          <div className="p-3 bg-muted rounded-lg">
            <div className="font-medium text-sm mb-1">{notification.title}</div>
            <div className="text-sm text-muted-foreground">{notification.message}</div>
          </div>

          <Separator />

          {/* 快速回覆選項 */}
          <div>
            <div className="text-sm font-medium mb-2">快速回覆</div>
            <div className="grid grid-cols-1 gap-2">
              {quickReplies.map((reply) => {
                const Icon = reply.icon;
                return (
                  <Button
                    key={reply.type}
                    variant={selectedReplyType === reply.type ? "default" : "outline"}
                    className="justify-start h-auto p-3"
                    onClick={() => handleQuickReply(reply.type, reply.content)}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-1 rounded-full ${reply.color} text-white`}>
                        <Icon className="h-3 w-3" />
                      </div>
                      <div className="text-left">
                        <div className="font-medium">{reply.label}</div>
                        <div className="text-xs text-muted-foreground">{reply.content}</div>
                      </div>
                    </div>
                  </Button>
                );
              })}
            </div>
          </div>

          <Separator />

          {/* 自訂回覆內容 */}
          <div>
            <div className="text-sm font-medium mb-2">回覆訊息</div>
            <Textarea
              placeholder="輸入你的回覆訊息..."
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>

          {/* 回覆類型指示 */}
          {selectedReplyType && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">回覆類型：</span>
              <Badge variant={selectedReplyType === 'completion' ? 'default' : 'secondary'}>
                {quickReplies.find(r => r.type === selectedReplyType)?.label}
              </Badge>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            取消
          </Button>
          <Button 
            onClick={handleSendReply} 
            disabled={isLoading || !replyContent.trim()}
          >
            {isLoading ? '發送中...' : '發送回覆'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}