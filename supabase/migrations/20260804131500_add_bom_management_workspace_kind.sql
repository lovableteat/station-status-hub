-- Keep BOM document spaces separate from Test_Plan spaces inside the same
-- maintenance project. Existing rows remain Test_Plan spaces by default.
alter table public.test_plan_spaces
  add column if not exists workspace_kind text not null default 'test-plan';

alter table public.test_plan_spaces
  drop constraint if exists test_plan_spaces_workspace_kind_check;

alter table public.test_plan_spaces
  add constraint test_plan_spaces_workspace_kind_check
  check (workspace_kind in ('test-plan', 'bom-management'));

drop index if exists public.test_plan_spaces_project_name_uidx;
drop index if exists public.test_plan_spaces_project_updated_idx;

create unique index if not exists test_plan_spaces_project_kind_name_uidx
  on public.test_plan_spaces (
    project_id,
    workspace_kind,
    lower(btrim(name))
  );

create index if not exists test_plan_spaces_project_kind_updated_idx
  on public.test_plan_spaces (project_id, workspace_kind, updated_at desc);
