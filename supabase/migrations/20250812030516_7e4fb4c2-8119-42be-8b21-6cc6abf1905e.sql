-- Create per-system per-item exclusion table for dashboard analytics
create table if not exists public.dashboard_item_exclusions (
  id uuid primary key default gen_random_uuid(),
  system_id uuid not null references public.test_systems(id) on delete cascade,
  station_id uuid references public.test_flow_stations(id) on delete set null,
  item_id uuid not null references public.test_flow_items(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  unique (system_id, item_id)
);

-- Enable RLS
alter table public.dashboard_item_exclusions enable row level security;

-- Open policies to match current no-login mode (can be tightened when auth is enabled)
create policy "Anyone can select dashboard_item_exclusions"
  on public.dashboard_item_exclusions for select
  using (true);

create policy "Anyone can insert dashboard_item_exclusions"
  on public.dashboard_item_exclusions for insert
  with check (true);

create policy "Anyone can update dashboard_item_exclusions"
  on public.dashboard_item_exclusions for update
  using (true)
  with check (true);

create policy "Anyone can delete dashboard_item_exclusions"
  on public.dashboard_item_exclusions for delete
  using (true);

-- Helpful index for lookups
create index if not exists idx_dashboard_item_exclusions_system_item
  on public.dashboard_item_exclusions (system_id, item_id);
