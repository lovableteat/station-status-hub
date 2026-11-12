-- NOT A RECOVERY MIGRATION. Intentionally non-executable fail-closed sentinel.
-- Restoring the earlier definitions/ACLs would reopen anonymous impersonation.
-- Keep the current twelve actor guards and repair compatibility forward.
BEGIN;
DO $retired$
BEGIN
  RAISE EXCEPTION 'PCB rollback retired: preserve verified-actor guards and anonymous denial; prepare a reviewed forward correction';
END;
$retired$;
ROLLBACK;
