-- Create user notifications table
CREATE TABLE public.user_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient_id UUID NOT NULL,
  sender_id UUID NOT NULL,
  notification_type VARCHAR(50) NOT NULL DEFAULT 'mention',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  reference_type VARCHAR(50), -- 'issue', 'test_progress', 'system', etc.
  reference_id UUID,
  metadata JSONB DEFAULT '{}',
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create user mentions table
CREATE TABLE public.user_mentions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mention_id UUID NOT NULL,
  mentioned_user_id UUID NOT NULL,
  mentioned_by_user_id UUID NOT NULL,
  content_type VARCHAR(50) NOT NULL, -- 'issue', 'test_progress', 'comment', etc.
  content_id UUID NOT NULL,
  content_text TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_mentions ENABLE ROW LEVEL SECURITY;

-- Create policies for user_notifications
CREATE POLICY "Users can view their own notifications" 
ON public.user_notifications 
FOR SELECT 
USING (true); -- Allow viewing notifications for all users since we don't have auth yet

CREATE POLICY "Users can create notifications" 
ON public.user_notifications 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Users can update their own notifications" 
ON public.user_notifications 
FOR UPDATE 
USING (true);

-- Create policies for user_mentions
CREATE POLICY "Users can view mentions" 
ON public.user_mentions 
FOR SELECT 
USING (true);

CREATE POLICY "Users can create mentions" 
ON public.user_mentions 
FOR INSERT 
WITH CHECK (true);

-- Create indexes for better performance
CREATE INDEX idx_user_notifications_recipient ON public.user_notifications(recipient_id);
CREATE INDEX idx_user_notifications_sender ON public.user_notifications(sender_id);
CREATE INDEX idx_user_notifications_type ON public.user_notifications(notification_type);
CREATE INDEX idx_user_notifications_read ON public.user_notifications(is_read);
CREATE INDEX idx_user_mentions_user ON public.user_mentions(mentioned_user_id);
CREATE INDEX idx_user_mentions_content ON public.user_mentions(content_type, content_id);

-- Create trigger for updating timestamps
CREATE TRIGGER update_user_notifications_updated_at
BEFORE UPDATE ON public.user_notifications
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();