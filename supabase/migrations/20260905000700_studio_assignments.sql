-- Studio resources used to assign service transactions. Piercers remain a
-- Studio capability, not an application access role.
create table public.piercer_profiles (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (btrim(display_name) <> ''),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.stations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name)
);

alter table public.transactions
  add column piercer_profile_id uuid references public.piercer_profiles (id) on delete restrict,
  add column station_id uuid references public.stations (id) on delete restrict;

create index transactions_piercer_profile_id_idx on public.transactions (piercer_profile_id);
create index transactions_station_id_idx on public.transactions (station_id);

create trigger piercer_profiles_set_updated_at
before update on public.piercer_profiles
for each row execute function public.set_updated_at();

create trigger stations_set_updated_at
before update on public.stations
for each row execute function public.set_updated_at();

alter table public.piercer_profiles enable row level security;
alter table public.stations enable row level security;

create policy "active accounts read active piercers"
on public.piercer_profiles for select to authenticated
using (public.is_active_account() and active);

create policy "owners read all piercers"
on public.piercer_profiles for select to authenticated
using (public.is_owner());

create policy "owners create piercers"
on public.piercer_profiles for insert to authenticated
with check (public.is_owner());

create policy "owners update piercers"
on public.piercer_profiles for update to authenticated
using (public.is_owner())
with check (public.is_owner());

create policy "active accounts read active stations"
on public.stations for select to authenticated
using (public.is_active_account() and active);

create policy "owners read all stations"
on public.stations for select to authenticated
using (public.is_owner());

create policy "owners create stations"
on public.stations for insert to authenticated
with check (public.is_owner());

create policy "owners update stations"
on public.stations for update to authenticated
using (public.is_owner())
with check (public.is_owner());

-- Extend the existing atomic service-waiver acceptance boundary. Assignment
-- IDs travel in the already-validated client_details object so the RPC shape
-- stays stable while assignment, client creation, items, and pending record
-- are committed as one operation.
create or replace function public.accept_new_service_waiver(
  signing_event_id uuid,
  client_details jsonb,
  selected_service_ids uuid[],
  selected_product_ids uuid[]
)
returns table (
  id uuid,
  reference_code text,
  client_name text,
  created_at timestamptz,
  total numeric,
  event_id uuid,
  template_id uuid,
  template_version integer,
  template_body text,
  signed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  signing private.waiver_signing_events%rowtype;
  resolved_client_id uuid;
  resolved_client_name text;
  existing_client_id uuid;
  new_client_name text;
  new_client_email text;
  new_client_phone text;
  selected_piercer_profile_id uuid;
  selected_station_id uuid;
  created_transaction_id uuid;
  created_reference text;
  created_at_value timestamptz;
  resolved_total numeric;
  accepted_at timestamptz := clock_timestamp();
  invalid_count integer;
begin
  if not public.is_active_account() then
    raise exception using errcode = '42501', message = 'Active application account required';
  end if;

  select event.* into signing
  from private.waiver_signing_events event
  where event.id = signing_event_id
  for update;
  if signing.id is null or signing.recorded_by <> auth.uid()
     or signing.state <> 'prepared' or signing.transaction_id is not null then
    raise exception using errcode = '22023', message = 'Signing session is unavailable';
  end if;
  if clock_timestamp() > signing.expires_at then
    update private.waiver_signing_events event set state = 'abandoned' where event.id = signing.id;
    raise exception using errcode = '22023', message = 'Signing session expired';
  end if;

  selected_service_ids := coalesce(selected_service_ids, '{}'::uuid[]);
  selected_product_ids := coalesce(selected_product_ids, '{}'::uuid[]);
  if cardinality(selected_service_ids) = 0 then
    raise exception using errcode = '22023', message = 'At least one service is required';
  end if;
  if cardinality(selected_service_ids) <> (select count(distinct value) from unnest(selected_service_ids) value)
     or cardinality(selected_product_ids) <> (select count(distinct value) from unnest(selected_product_ids) value) then
    raise exception using errcode = '22023', message = 'Duplicate catalog items are not allowed';
  end if;
  select count(*) into invalid_count from unnest(selected_service_ids) selected_id
  where not exists (select 1 from public.services service where service.id = selected_id and service.active);
  if invalid_count > 0 then
    raise exception using errcode = '22023', message = 'Every service must exist and be active';
  end if;
  select count(*) into invalid_count from unnest(selected_product_ids) selected_id
  where not exists (select 1 from public.products product where product.id = selected_id and product.active);
  if invalid_count > 0 then
    raise exception using errcode = '22023', message = 'Every product must exist and be active';
  end if;

  if jsonb_typeof(client_details) <> 'object' then
    raise exception using errcode = '22023', message = 'Client details are required';
  end if;
  existing_client_id := nullif(client_details ->> 'existing_client_id', '')::uuid;
  new_client_name := client_details ->> 'full_name';
  new_client_email := client_details ->> 'email';
  new_client_phone := client_details ->> 'phone';
  selected_piercer_profile_id := nullif(client_details ->> 'piercer_profile_id', '')::uuid;
  selected_station_id := nullif(client_details ->> 'station_id', '')::uuid;
  if (existing_client_id is null) = (nullif(btrim(new_client_name), '') is null) then
    raise exception using errcode = '22023', message = 'Choose exactly one client source';
  end if;
  if selected_piercer_profile_id is null or not exists (
    select 1 from public.piercer_profiles piercer
    where piercer.id = selected_piercer_profile_id and piercer.active
  ) then
    raise exception using errcode = '22023', message = 'Choose an active piercer';
  end if;
  if selected_station_id is null or not exists (
    select 1 from public.stations station
    where station.id = selected_station_id and station.active
  ) then
    raise exception using errcode = '22023', message = 'Choose an active station';
  end if;

  if existing_client_id is not null then
    select client.id, client.full_name into resolved_client_id, resolved_client_name
    from public.clients client where client.id = existing_client_id;
    if resolved_client_id is null then
      raise exception using errcode = '22023', message = 'Client not found';
    end if;
  else
    resolved_client_name := btrim(new_client_name);
    insert into public.clients (full_name, email, phone, created_by)
    values (resolved_client_name, nullif(btrim(new_client_email), ''), nullif(btrim(new_client_phone), ''), auth.uid())
    returning clients.id into resolved_client_id;
  end if;

  created_reference := public.next_transaction_reference();
  insert into public.transactions (
    reference_code, client_id, status, created_by, piercer_profile_id, station_id
  ) values (
    created_reference, resolved_client_id, 'pending', auth.uid(),
    selected_piercer_profile_id, selected_station_id
  ) returning transactions.id, transactions.created_at into created_transaction_id, created_at_value;

  insert into public.transaction_items (
    transaction_id, item_type, service_id, product_id,
    item_name_snapshot, unit_price_snapshot, quantity
  )
  select created_transaction_id, 'service'::public.transaction_item_type, service.id, null::uuid,
    service.name, service.price, 1
  from public.services service where service.id = any(selected_service_ids)
  union all
  select created_transaction_id, 'product'::public.transaction_item_type, null::uuid, product.id,
    product.name, product.price, 1
  from public.products product where product.id = any(selected_product_ids);

  select sum(item.unit_price_snapshot * item.quantity) into resolved_total
  from public.transaction_items item where item.transaction_id = created_transaction_id;
  if resolved_total is null or resolved_total <= 0 then
    raise exception using errcode = '22023', message = 'Transaction total must be positive';
  end if;

  update private.waiver_signing_events event
  set transaction_id = created_transaction_id,
      client_name_snapshot = resolved_client_name,
      signed_at = accepted_at,
      state = 'accepted'
  where event.id = signing.id;

  return query
  select created_transaction_id, created_reference, resolved_client_name,
    created_at_value, resolved_total, signing.id, template.id, template.version,
    template.body, accepted_at
  from public.waiver_templates template where template.id = signing.waiver_template_id;
end;
$$;
