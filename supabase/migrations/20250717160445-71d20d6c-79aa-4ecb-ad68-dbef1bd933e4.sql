
-- Add os_mac_address column to test_systems table
ALTER TABLE public.test_systems 
ADD COLUMN os_mac_address character varying;
