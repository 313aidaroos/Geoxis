create extension if not exists pgcrypto;

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.tenant_memberships (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  role text not null check (role in ('owner','admin','member')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create table if not exists public.admin_emails (
  email text primary key,
  role text not null check (role in ('owner','admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.tracked_assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  external_id text not null,
  name text not null,
  type text not null,
  operator text,
  destination text,
  cargo text,
  created_at timestamptz not null default now(),
  unique (tenant_id, external_id)
);

create table if not exists public.asset_positions (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  asset_id uuid not null references public.tracked_assets(id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  altitude_meters double precision default 0,
  heading double precision default 0,
  speed_mps double precision default 0,
  alarm boolean not null default false,
  alarm_reason text,
  recorded_at timestamptz not null default now()
);

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete set null,
  requester_email text not null,
  subject text not null,
  message text not null,
  inbox text not null default 'geoxis@apixis.dev',
  route_to text not null default 'awad@apixis.dev',
  status text not null default 'open' check (status in ('open','triaged','closed')),
  created_at timestamptz not null default now()
);

create or replace view public.current_asset_positions as
select distinct on (a.id)
  a.tenant_id,
  a.external_id,
  a.name,
  a.type,
  a.operator,
  a.destination,
  a.cargo,
  p.latitude,
  p.longitude,
  p.altitude_meters,
  p.heading,
  p.speed_mps,
  p.alarm,
  p.alarm_reason,
  p.recorded_at
from public.tracked_assets a
join public.asset_positions p on p.asset_id = a.id
order by a.id, p.recorded_at desc;

alter table public.tenants enable row level security;
alter table public.profiles enable row level security;
alter table public.tenant_memberships enable row level security;
alter table public.tracked_assets enable row level security;
alter table public.asset_positions enable row level security;
alter table public.support_tickets enable row level security;

create or replace function public.is_member(t uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tenant_memberships m where m.tenant_id = t and m.user_id = auth.uid())
$$;

create or replace function public.is_admin_user() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_emails a join public.profiles p on p.email = a.email where p.user_id = auth.uid())
$$;

drop policy if exists tenants_member_select on public.tenants;
create policy tenants_member_select on public.tenants for select using (public.is_member(id) or public.is_admin_user());

drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select on public.profiles for select using (user_id = auth.uid() or public.is_admin_user());

drop policy if exists memberships_member_select on public.tenant_memberships;
create policy memberships_member_select on public.tenant_memberships for select using (user_id = auth.uid() or public.is_admin_user());

drop policy if exists assets_member_select on public.tracked_assets;
create policy assets_member_select on public.tracked_assets for select using (public.is_member(tenant_id) or public.is_admin_user());

drop policy if exists positions_member_select on public.asset_positions;
create policy positions_member_select on public.asset_positions for select using (public.is_member(tenant_id) or public.is_admin_user());

drop policy if exists tickets_owner_or_admin_select on public.support_tickets;
create policy tickets_owner_or_admin_select on public.support_tickets for select using (public.is_member(tenant_id) or public.is_admin_user());

insert into public.admin_emails (email, role) values ('awad@apixis.dev', 'owner')
on conflict (email) do update set role = excluded.role;

insert into public.tenants (slug, name) values ('geoxis-demo', 'Geoxis Demo Operations')
on conflict (slug) do nothing;
