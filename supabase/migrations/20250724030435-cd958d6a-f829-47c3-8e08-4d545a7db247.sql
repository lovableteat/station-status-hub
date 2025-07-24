-- Add 90BOM column to test_systems table
ALTER TABLE public.test_systems 
ADD COLUMN bom_90 character varying;