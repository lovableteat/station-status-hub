-- Add new columns to test_systems table
ALTER TABLE public.test_systems 
ADD COLUMN old_bmc_address character varying,
ADD COLUMN cabinet character varying;