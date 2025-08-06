-- Add tags field to issues table for tagging functionality
ALTER TABLE issues 
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- Add mentioned_users field to issues table for user mentions
ALTER TABLE issues 
ADD COLUMN IF NOT EXISTS mentioned_users TEXT[] DEFAULT '{}';

-- Update sop_content field in code_snippets table (already exists)