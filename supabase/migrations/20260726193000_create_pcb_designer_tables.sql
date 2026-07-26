create table if not exists public.pcb_designer_projects (
  id text primary key,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pcb_designer_templates (
  id text primary key,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pcb_designer_library (
  id text primary key,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pcb_designer_projects_updated_at_idx
  on public.pcb_designer_projects (updated_at desc);
create index if not exists pcb_designer_projects_payload_idx
  on public.pcb_designer_projects using gin (payload);
create index if not exists pcb_designer_templates_updated_at_idx
  on public.pcb_designer_templates (updated_at desc);
create index if not exists pcb_designer_templates_payload_idx
  on public.pcb_designer_templates using gin (payload);
create index if not exists pcb_designer_library_updated_at_idx
  on public.pcb_designer_library (updated_at desc);
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

grant select, insert, update, delete on public.pcb_designer_projects to anon, authenticated;
grant select, insert, update, delete on public.pcb_designer_templates to anon, authenticated;
grant select, insert, update, delete on public.pcb_designer_library to anon, authenticated;
