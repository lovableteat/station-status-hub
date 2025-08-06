import { supabase } from "@/integrations/supabase/client";

export interface NotificationData {
  recipient_id: string;
  sender_id?: string;
  template_key?: string;
  title?: string;
  message?: string;
  notification_type?: string;
  category?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  reference_type?: string;
  reference_id?: string;
  action_url?: string;
  metadata?: any;
  expires_at?: string;
  grouped_id?: string;
}

interface NotificationTemplate {
  id: string;
  template_key: string;
  title_template: string;
  message_template: string;
  category: string;
  priority: string;
  metadata_schema: any;
  is_active: boolean;
}

class NotificationService {
  private templates: Map<string, NotificationTemplate> = new Map();
  private templatesLoaded = false;

  async loadTemplates() {
    if (this.templatesLoaded) return;

    try {
      const { data, error } = await supabase
        .from('notification_templates')
        .select('*')
        .eq('is_active', true);

      if (error) throw error;

      data?.forEach(template => {
        this.templates.set(template.template_key, template);
      });

      this.templatesLoaded = true;
    } catch (error) {
      console.error('Error loading notification templates:', error);
    }
  }

  private interpolateTemplate(template: string, data: Record<string, any>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return data[key] || match;
    });
  }

  async createNotification(data: NotificationData): Promise<boolean> {
    try {
      await this.loadTemplates();

      let notificationData = { ...data };

      // Use template if provided
      if (data.template_key) {
        const template = this.templates.get(data.template_key);
        if (template) {
          notificationData.title = this.interpolateTemplate(template.title_template, data.metadata || {});
          notificationData.message = this.interpolateTemplate(template.message_template, data.metadata || {});
          notificationData.category = template.category;
          notificationData.priority = template.priority as any;
        }
      }

      // Set defaults and ensure required fields
      notificationData.notification_type = notificationData.notification_type || 'general';
      notificationData.category = notificationData.category || 'general';
      notificationData.priority = notificationData.priority || 'normal';
      notificationData.title = notificationData.title || '通知';
      notificationData.message = notificationData.message || '新通知';

      const { error } = await supabase
        .from('user_notifications')
        .insert({
          recipient_id: notificationData.recipient_id,
          sender_id: notificationData.sender_id,
          title: notificationData.title,
          message: notificationData.message,
          notification_type: notificationData.notification_type,
          category: notificationData.category,
          priority: notificationData.priority,
          reference_type: notificationData.reference_type,
          reference_id: notificationData.reference_id,
          action_url: notificationData.action_url,
          metadata: notificationData.metadata,
          expires_at: notificationData.expires_at,
          grouped_id: notificationData.grouped_id,
        });

      if (error) throw error;

      // Track analytics
      await this.trackNotificationAnalytics(notificationData.recipient_id, 'sent', {
        template_key: data.template_key,
        category: notificationData.category,
        priority: notificationData.priority
      });

      return true;
    } catch (error) {
      console.error('Error creating notification:', error);
      return false;
    }
  }

  async createBulkNotifications(notifications: NotificationData[]): Promise<boolean> {
    try {
      await this.loadTemplates();

      const processedNotifications = notifications.map(data => {
        let notificationData = { ...data };

        // Use template if provided
        if (data.template_key) {
          const template = this.templates.get(data.template_key);
          if (template) {
            notificationData.title = this.interpolateTemplate(template.title_template, data.metadata || {});
            notificationData.message = this.interpolateTemplate(template.message_template, data.metadata || {});
            notificationData.category = template.category;
            notificationData.priority = template.priority as any;
          }
        }

        // Set defaults and ensure required fields
        notificationData.notification_type = notificationData.notification_type || 'general';
        notificationData.category = notificationData.category || 'general';
        notificationData.priority = notificationData.priority || 'normal';
        notificationData.title = notificationData.title || '通知';
        notificationData.message = notificationData.message || '新通知';

        return {
          recipient_id: notificationData.recipient_id,
          sender_id: notificationData.sender_id,
          title: notificationData.title,
          message: notificationData.message,
          notification_type: notificationData.notification_type,
          category: notificationData.category,
          priority: notificationData.priority,
          reference_type: notificationData.reference_type,
          reference_id: notificationData.reference_id,
          action_url: notificationData.action_url,
          metadata: notificationData.metadata,
          expires_at: notificationData.expires_at,
          grouped_id: notificationData.grouped_id,
        };
      });

      const { error } = await supabase
        .from('user_notifications')
        .insert(processedNotifications);

      if (error) throw error;

      // Track bulk analytics
      for (const notification of processedNotifications) {
        await this.trackNotificationAnalytics(notification.recipient_id, 'sent', {
          bulk: true,
          category: notification.category,
          priority: notification.priority
        });
      }

      return true;
    } catch (error) {
      console.error('Error creating bulk notifications:', error);
      return false;
    }
  }

  async createMentionNotification(data: {
    recipient_id: string;
    sender_id: string;
    sender_name: string;
    mention_context: string;
    reference_type: string;
    reference_id: string;
    reference_title: string;
  }): Promise<boolean> {
    return this.createNotification({
      template_key: 'mention_in_issue',
      recipient_id: data.recipient_id,
      sender_id: data.sender_id,
      reference_type: data.reference_type,
      reference_id: data.reference_id,
      metadata: {
        sender_name: data.sender_name,
        mention_context: data.mention_context,
        issue_title: data.reference_title,
        issueStatus: 'mentioned'
      }
    });
  }

  async createSystemNotification(data: {
    title: string;
    message: string;
    recipients: string[];
    priority?: 'low' | 'normal' | 'high' | 'urgent';
    category?: string;
    metadata?: any;
  }): Promise<boolean> {
    const notifications = data.recipients.map(recipient_id => ({
      recipient_id,
      title: data.title,
      message: data.message,
      notification_type: 'system',
      category: data.category || 'system',
      priority: data.priority || 'normal',
      metadata: data.metadata
    }));

    return this.createBulkNotifications(notifications);
  }

  async createTestCompletionNotification(data: {
    system_id: string;
    system_name: string;
    recipients: string[];
  }): Promise<boolean> {
    return this.createSystemNotification({
      title: '測試完成通知',
      message: `系統 "${data.system_name}" 的測試已完成`,
      recipients: data.recipients,
      category: 'test',
      priority: 'normal',
      metadata: {
        system_id: data.system_id,
        system_name: data.system_name
      }
    });
  }

  async createIssueAssignmentNotification(data: {
    issue_id: string;
    issue_title: string;
    assigned_to: string;
    assigned_by: string;
  }): Promise<boolean> {
    return this.createNotification({
      template_key: 'issue_assigned',
      recipient_id: data.assigned_to,
      sender_id: data.assigned_by,
      reference_type: 'issue',
      reference_id: data.issue_id,
      metadata: {
        issue_title: data.issue_title,
        assigned_by: data.assigned_by
      }
    });
  }

  private async trackNotificationAnalytics(
    user_id: string, 
    action: 'sent' | 'delivered' | 'read' | 'clicked' | 'dismissed', 
    metadata?: any
  ): Promise<void> {
    try {
      await supabase
        .from('notification_analytics')
        .insert({
          notification_id: crypto.randomUUID(),
          user_id,
          action,
          metadata
        });
    } catch (error) {
      console.error('Error tracking notification analytics:', error);
    }
  }

  async cleanupExpiredNotifications(): Promise<void> {
    try {
      await supabase.rpc('cleanup_old_notifications');
    } catch (error) {
      console.error('Error cleaning up notifications:', error);
    }
  }
}

export const notificationService = new NotificationService();