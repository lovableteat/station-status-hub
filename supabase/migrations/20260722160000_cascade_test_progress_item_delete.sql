begin;

-- A flow item owns its per-system progress rows. Keeping a restrictive foreign key
-- makes the editor unable to remove any item after testing has started.
alter table public.test_progress
  drop constraint if exists test_progress_item_id_fkey;

alter table public.test_progress
  add constraint test_progress_item_id_fkey
  foreign key (item_id)
  references public.test_flow_items(id)
  on delete cascade;

create index if not exists idx_test_progress_item_id
  on public.test_progress(item_id);

commit;
