-- Fix security functions by properly referencing pgcrypto functions

-- Fix function search_path for hash_password with proper schema reference
CREATE OR REPLACE FUNCTION public.hash_password(password text)
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
  SELECT public.crypt(password, public.gen_salt('bf', 10));
$function$;

-- Fix function search_path for verify_password with proper schema reference
CREATE OR REPLACE FUNCTION public.verify_password(password text, hash text)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
  SELECT public.crypt(password, hash) = hash;
$function$;