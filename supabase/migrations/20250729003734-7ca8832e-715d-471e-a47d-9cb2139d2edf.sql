-- Add SOP field to tools_management table
ALTER TABLE tools_management ADD COLUMN sop_content TEXT;

-- Add SOP field to code_snippets table  
ALTER TABLE code_snippets ADD COLUMN sop_content TEXT;