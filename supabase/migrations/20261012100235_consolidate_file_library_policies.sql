-- Evaluate one policy per action while preserving the same authenticated
-- view/edit boundary and compatibility with legacy project-scoped clients.
set local lock_timeout = '5s';
drop policy "test-plan-spaces-global-read" on workspace.test_plan_spaces;
drop policy "test-plan-spaces-global-insert" on workspace.test_plan_spaces;
drop policy "test-plan-spaces-global-update" on workspace.test_plan_spaces;
drop policy "test-plan-spaces-global-delete" on workspace.test_plan_spaces;

alter policy "test-plan-spaces-project-read" on workspace.test_plan_spaces
  using (workspace.test_plan_current_user_can('view'));
alter policy "test-plan-spaces-project-insert" on workspace.test_plan_spaces
  with check (
    owner_id = workspace.test_plan_current_system_user_id()
    and workspace.test_plan_current_user_can('edit')
    and (
      project_id is null or exists (
        select 1 from workspace.test_projects projects
        where projects.id = test_plan_spaces.project_id
          and projects.status <> 'archived' and not projects.is_archived
      )
    )
  );
alter policy "test-plan-spaces-project-update" on workspace.test_plan_spaces
  using (workspace.test_plan_current_user_can('edit'))
  with check (workspace.test_plan_current_user_can('edit'));
alter policy "test-plan-spaces-project-delete" on workspace.test_plan_spaces
  using (workspace.test_plan_current_user_can('edit'));

notify pgrst, 'reload schema';
