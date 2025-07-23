-- Add bmc_address column to test_systems table
ALTER TABLE public.test_systems 
ADD COLUMN bmc_address character varying;