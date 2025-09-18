-- Create API keys management table
CREATE TABLE public.api_keys (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key_name text NOT NULL,
  api_key text NOT NULL UNIQUE,
  description text,
  permissions jsonb NOT NULL DEFAULT '{"read": true, "write": false}'::jsonb,
  created_by uuid,
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamp with time zone,
  last_used_at timestamp with time zone,
  usage_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Admins can manage API keys" 
ON public.api_keys 
FOR ALL 
USING (true);

-- Create function to generate random API key
CREATE OR REPLACE FUNCTION public.generate_api_key()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT 'ak_' || encode(gen_random_bytes(32), 'base64')::text;
$function$;

-- Create function to validate API key and update usage
CREATE OR REPLACE FUNCTION public.validate_and_update_api_key(key_to_check text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  key_info record;
  result jsonb;
BEGIN
  -- Get key info and update usage in one query
  UPDATE public.api_keys 
  SET 
    last_used_at = now(),
    usage_count = usage_count + 1,
    updated_at = now()
  WHERE api_key = key_to_check 
    AND is_active = true 
    AND (expires_at IS NULL OR expires_at > now())
  RETURNING id, key_name, permissions, usage_count INTO key_info;
  
  IF key_info IS NOT NULL THEN
    result := jsonb_build_object(
      'valid', true,
      'key_id', key_info.id,
      'key_name', key_info.key_name,
      'permissions', key_info.permissions,
      'usage_count', key_info.usage_count
    );
  ELSE
    result := jsonb_build_object('valid', false);
  END IF;
  
  RETURN result;
END;
$function$;

-- Add trigger for updated_at
CREATE TRIGGER update_api_keys_updated_at
BEFORE UPDATE ON public.api_keys
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();