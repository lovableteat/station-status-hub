
import { useNotificationOperations } from './useNotificationOperations';
import { useNotificationCleanup } from './useNotificationCleanup';
import { useNotificationQueries } from './useNotificationQueries';

export function useNotificationReplies() {
  const operations = useNotificationOperations();
  const cleanup = useNotificationCleanup();
  const queries = useNotificationQueries();

  return {
    // 操作相關
    isLoading: operations.isLoading || cleanup.isLoading,
    sendReply: operations.sendReply,
    confirmReply: operations.confirmReply,
    
    // 清理相關
    deleteNotification: cleanup.deleteNotification,
    clearCompletedNotifications: cleanup.clearCompletedNotifications,
    clearReadNotifications: cleanup.clearReadNotifications,
    
    // 查詢相關
    getNotificationReplies: queries.getNotificationReplies,
    createConversation: queries.createConversation
  };
}
