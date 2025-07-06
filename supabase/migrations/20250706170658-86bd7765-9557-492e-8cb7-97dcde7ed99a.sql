-- Update the super admin account password to liu52417
UPDATE public.system_users 
SET password_hash = public.hash_password('liu52417'),
    updated_at = now()
WHERE username = 'liu52417';