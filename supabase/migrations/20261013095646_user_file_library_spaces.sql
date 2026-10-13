-- Matches the already applied cloud migration.
alter table workspace.test_plan_spaces add column if not exists is_personal boolean not null default false;
create unique index if not exists test_plan_spaces_personal_owner_key on workspace.test_plan_spaces(owner_id) where is_personal;
alter table workspace.test_plan_spaces add constraint test_plan_personal_space_is_global check (not is_personal or project_id is null);
