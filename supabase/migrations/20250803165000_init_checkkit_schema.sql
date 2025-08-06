-- CheckKit schema objects
-- =========================================================

-- 1. templates ----------------------------------------------------------
create table public.templates (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null,                     -- auth.users.id
  name             text not null,
  description      text,
  items            jsonb not null,                    -- checklist items array
  is_shareable     boolean not null default false,
  share_token      text unique,                       -- set when is_shareable = true
  inserted_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- 2. license_keys -------------------------------------------------------
create table public.license_keys (
  id                     uuid primary key default gen_random_uuid(),
  owner_id               uuid not null,               -- auth.users.id
  stripe_customer_id     text,
  stripe_subscription_id text,
  seats_total            int  not null default 1,
  seats_used             int  not null default 0,
  inserted_at            timestamptz not null default now()
);

-- 3. devices ------------------------------------------------------------
create table public.devices (
  device_id    text primary key,                      -- hashed machine ID
  key_id       uuid not null references public.license_keys(id) on delete cascade,
  activated_at timestamptz not null default now()
);

-- 4. Row-Level Security -------------------------------------------------
alter table public.templates     enable row level security;
alter table public.license_keys  enable row level security;
alter table public.devices       enable row level security;

-- templates policies
create policy "templates_owner_crud"
  on public.templates
  for all
  using  ( owner_id = auth.uid() )
  with check ( owner_id = auth.uid() );

create policy "templates_read_shareable"
  on public.templates
  for select
  using ( is_shareable OR owner_id = auth.uid() );

-- license_keys policies
create policy "license_keys_owner_read"
  on public.license_keys
  for select
  using ( owner_id = auth.uid() );

-- devices policies
create policy "devices_owner_read"
  on public.devices
  for select
  using (
    key_id in (
      select id from public.license_keys where owner_id = auth.uid()
    )
  );

