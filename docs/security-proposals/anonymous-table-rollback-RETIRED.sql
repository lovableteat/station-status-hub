-- NOT A RECOVERY MIGRATION. Fail-closed sentinel for the two applied table cutovers.
-- Keep test_progress_audit/tasks anonymous denial and all earlier applied boundaries.
-- The private historical reopen scripts are not distributed or executed here.
BEGIN;
DO $retired$
BEGIN
 RAISE EXCEPTION 'Anonymous table rollback retired: preserve all six applied boundaries and current data; prepare a reviewed forward correction';
END;
$retired$;
ROLLBACK;
