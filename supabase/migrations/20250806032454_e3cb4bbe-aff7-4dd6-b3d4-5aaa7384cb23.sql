-- Create user_mentions table to track mentions
CREATE TABLE IF NOT EXISTS public.user_mentions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mention_id TEXT NOT NULL,
  mentioned_user_id UUID NOT NULL,
  mentioned_by_user_id UUID NOT NULL,
  content_type TEXT NOT NULL, -- 'issue', 'code_snippet', etc.
  content_id UUID NOT NULL,
  content_text TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on user_mentions
ALTER TABLE public.user_mentions ENABLE ROW LEVEL SECURITY;

-- Create policies for user_mentions
CREATE POLICY "Users can view mentions where they are involved" 
ON public.user_mentions 
FOR SELECT 
USING (true);

CREATE POLICY "Users can create mentions" 
ON public.user_mentions 
FOR INSERT 
WITH CHECK (true);

-- Create indexes for better performance
CREATE INDEX idx_user_mentions_mentioned_user_id ON public.user_mentions(mentioned_user_id);
CREATE INDEX idx_user_mentions_content ON public.user_mentions(content_type, content_id);
CREATE INDEX idx_user_mentions_created_at ON public.user_mentions(created_at);

-- Create trigger for updated_at
CREATE TRIGGER update_user_mentions_updated_at
  BEFORE UPDATE ON public.user_mentions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();