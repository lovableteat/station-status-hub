-- 建立通知回覆表
CREATE TABLE public.notification_replies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  notification_id UUID NOT NULL,
  sender_id UUID NOT NULL,
  reply_type VARCHAR(50) NOT NULL DEFAULT 'completion',
  content TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  confirmed_at TIMESTAMP WITH TIME ZONE,
  confirmed_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 建立通知對話表
CREATE TABLE public.notification_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  notification_id UUID NOT NULL,
  participant_ids UUID[] NOT NULL DEFAULT '{}',
  subject TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  last_message_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 擴展現有通知表
ALTER TABLE public.user_notifications 
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS reply_id UUID,
ADD COLUMN IF NOT EXISTS require_confirmation BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS conversation_id UUID;

-- 建立 RLS 政策
ALTER TABLE public.notification_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_conversations ENABLE ROW LEVEL SECURITY;

-- 通知回覆政策
CREATE POLICY "Users can view replies for their notifications" 
ON public.notification_replies 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.user_notifications 
    WHERE id = notification_replies.notification_id 
    AND (recipient_id = auth.uid() OR sender_id = auth.uid())
  )
);

CREATE POLICY "Users can create replies for notifications they received" 
ON public.notification_replies 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_notifications 
    WHERE id = notification_replies.notification_id 
    AND recipient_id = auth.uid()
  )
);

CREATE POLICY "Users can update their own replies" 
ON public.notification_replies 
FOR UPDATE 
USING (sender_id = auth.uid());

-- 通知對話政策
CREATE POLICY "Users can view conversations they participate in" 
ON public.notification_conversations 
FOR SELECT 
USING (auth.uid() = ANY(participant_ids));

CREATE POLICY "Users can create conversations" 
ON public.notification_conversations 
FOR INSERT 
WITH CHECK (auth.uid() = ANY(participant_ids));

CREATE POLICY "Users can update conversations they participate in" 
ON public.notification_conversations 
FOR UPDATE 
USING (auth.uid() = ANY(participant_ids));

-- 建立更新時間觸發器
CREATE TRIGGER update_notification_replies_updated_at
  BEFORE UPDATE ON public.notification_replies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_notification_conversations_updated_at
  BEFORE UPDATE ON public.notification_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();