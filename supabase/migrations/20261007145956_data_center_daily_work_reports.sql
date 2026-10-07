create table workspace.data_center_work_reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references workspace.data_center_projects(id) on delete restrict,
  author_id uuid not null references workspace.system_users(id) on delete restrict,
  site_id text not null check (char_length(site_id) between 1 and 120),
  report_date date not null check (report_date between date '2000-01-01' and (now() at time zone 'Asia/Taipei')::date),
  status text not null default 'on-track' check (status in ('on-track', 'blocked', 'completed')),
  summary text not null check (char_length(btrim(summary)) between 1 and 6000),
  next_steps text not null default '' check (char_length(next_steps) <= 3000),
  blockers text not null default '' check (char_length(blockers) <= 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, author_id, site_id, report_date)
);
create index data_center_work_reports_project_date_idx on workspace.data_center_work_reports (project_id, report_date desc, updated_at desc);
create index data_center_work_reports_author_idx on workspace.data_center_work_reports (author_id);
create trigger set_data_center_work_reports_updated_at before update on workspace.data_center_work_reports
  for each row execute function workspace.update_updated_at_column();

alter table workspace.data_center_work_reports enable row level security;
revoke all on workspace.data_center_work_reports from public, anon, authenticated;
grant select on workspace.data_center_work_reports to authenticated;
grant insert (project_id, author_id, site_id, report_date, status, summary, next_steps, blockers)
  on workspace.data_center_work_reports to authenticated;
-- Identity and timestamps cannot be rewritten by a client, even in an otherwise authorized update.
grant update (status, summary, next_steps, blockers) on workspace.data_center_work_reports to authenticated;
grant all on workspace.data_center_work_reports to service_role;

create policy "Data-center members read work reports" on workspace.data_center_work_reports for select to authenticated
  using (workspace.can_view_data_center_projects() and exists (
    select 1 from workspace.data_center_projects p where p.id = project_id and p.archived_at is null
  ));
create policy "Data-center editors create own work reports" on workspace.data_center_work_reports for insert to authenticated
  with check (workspace.can_edit_data_center_projects() and author_id = workspace.current_system_user_id() and exists (
    select 1 from workspace.data_center_projects p where p.id = project_id and p.archived_at is null
      and p.document -> 'sites' @> jsonb_build_array(jsonb_build_object('id', site_id))
  ));
create policy "Data-center editors update own work reports" on workspace.data_center_work_reports for update to authenticated
  using (workspace.can_edit_data_center_projects() and author_id = workspace.current_system_user_id() and exists (
    select 1 from workspace.data_center_projects p where p.id = project_id and p.archived_at is null
  ))
  with check (workspace.can_edit_data_center_projects() and author_id = workspace.current_system_user_id());
