
-- Create code_snippets table for storing code snippets
CREATE TABLE public.code_snippets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  code_content TEXT NOT NULL,
  language VARCHAR(50) NOT NULL DEFAULT 'javascript',
  category VARCHAR(50) NOT NULL DEFAULT 'utility',
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.code_snippets ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for anonymous access (since other tables use anonymous access)
CREATE POLICY "Allow anonymous access to code_snippets" 
ON public.code_snippets 
FOR ALL 
USING (true);

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_code_snippets_updated_at
  BEFORE UPDATE ON public.code_snippets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add some indexes for better performance
CREATE INDEX idx_code_snippets_language ON public.code_snippets(language);
CREATE INDEX idx_code_snippets_category ON public.code_snippets(category);
CREATE INDEX idx_code_snippets_updated_at ON public.code_snippets(updated_at DESC);
