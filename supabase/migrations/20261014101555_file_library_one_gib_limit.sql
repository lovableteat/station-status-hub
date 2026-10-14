begin;
set local lock_timeout = '5s';

-- Production already permits 1 GiB; record the same boundary in migration
-- history so a fresh database and the browser use identical file metadata.
alter table workspace.test_plan_files
  drop constraint if exists test_plan_files_file_size_check;
alter table workspace.test_plan_files
  add constraint test_plan_files_file_size_check
  check (file_size between 0 and 1073741824) not valid;
alter table workspace.test_plan_files
  validate constraint test_plan_files_file_size_check;

-- Raise only a smaller explicit bucket cap. NULL means no bucket-specific
-- cap, and a larger existing cap must stay unchanged. No global setting moves.
update storage.buckets
set file_size_limit = 1073741824
where id = 'test-plan-files'
  and file_size_limit is not null
  and file_size_limit < 1073741824;

notify pgrst, 'reload schema';
commit;
