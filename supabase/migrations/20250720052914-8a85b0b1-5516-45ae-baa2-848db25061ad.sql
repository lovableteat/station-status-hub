-- Add display_name field to system_users table
ALTER TABLE public.system_users 
ADD COLUMN display_name VARCHAR(100);

-- Update existing users to have display_name same as username initially
UPDATE public.system_users 
SET display_name = username 
WHERE display_name IS NULL;

-- Set the admin user liu52417 to have super_admin role and proper display name
UPDATE public.system_users 
SET role = 'super_admin', 
    display_name = '劉管理員',
    permissions = '{"all": true}'::jsonb
WHERE username = 'liu52417';