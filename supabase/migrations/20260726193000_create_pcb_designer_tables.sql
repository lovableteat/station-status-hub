create table if not exists public.pcb_designer_projects (
  owner_id uuid not null default auth.uid(),
  id text primary key,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pcb_designer_templates (
  owner_id uuid not null default auth.uid(),
  id text primary key,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pcb_designer_library (
  owner_id uuid not null default auth.uid(),
  id text primary key,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pcb_designer_projects_updated_at_idx
  on public.pcb_designer_projects (owner_id, updated_at desc);
create index if not exists pcb_designer_projects_payload_idx
  on public.pcb_designer_projects using gin (payload);
create index if not exists pcb_designer_templates_updated_at_idx
  on public.pcb_designer_templates (owner_id, updated_at desc);
create index if not exists pcb_designer_templates_payload_idx
  on public.pcb_designer_templates using gin (payload);
create index if not exists pcb_designer_library_updated_at_idx
  on public.pcb_designer_library (owner_id, updated_at desc);
create index if not exists pcb_designer_library_payload_idx
  on public.pcb_designer_library using gin (payload);

create or replace function public.set_pcb_designer_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_pcb_designer_projects_updated_at on public.pcb_designer_projects;
create trigger set_pcb_designer_projects_updated_at
before update on public.pcb_designer_projects
for each row execute function public.set_pcb_designer_updated_at();

drop trigger if exists set_pcb_designer_templates_updated_at on public.pcb_designer_templates;
create trigger set_pcb_designer_templates_updated_at
before update on public.pcb_designer_templates
for each row execute function public.set_pcb_designer_updated_at();

drop trigger if exists set_pcb_designer_library_updated_at on public.pcb_designer_library;
create trigger set_pcb_designer_library_updated_at
before update on public.pcb_designer_library
for each row execute function public.set_pcb_designer_updated_at();

alter table public.pcb_designer_projects enable row level security;
alter table public.pcb_designer_templates enable row level security;
alter table public.pcb_designer_library enable row level security;

drop policy if exists "PCB owners manage projects" on public.pcb_designer_projects;
create policy "PCB owners manage projects"
on public.pcb_designer_projects
for all
to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists "PCB owners manage templates" on public.pcb_designer_templates;
create policy "PCB owners manage templates"
on public.pcb_designer_templates
for all
to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists "PCB owners manage library" on public.pcb_designer_library;
create policy "PCB owners manage library"
on public.pcb_designer_library
for all
to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

revoke all on public.pcb_designer_projects from anon;
revoke all on public.pcb_designer_templates from anon;
revoke all on public.pcb_designer_library from anon;

grant select, insert, update, delete on public.pcb_designer_projects to authenticated;
grant select, insert, update, delete on public.pcb_designer_templates to authenticated;
grant select, insert, update, delete on public.pcb_designer_library to authenticated;
