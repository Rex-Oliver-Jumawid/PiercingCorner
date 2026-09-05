-- Persisted Studio scheduling and piercer qualification rules. Piercers remain
-- Studio-domain resources and do not expand the closed owner/staff role model.

alter table public.piercer_profiles
  add column default_station_id uuid references public.stations (id) on delete restrict;

create index piercer_profiles_default_station_id_idx
on public.piercer_profiles (default_station_id);

create table public.studio_hours (
  weekday smallint primary key check (weekday between 1 and 7),
  is_open boolean not null,
  opens_at time,
  closes_at time,
  check (
    (not is_open and opens_at is null and closes_at is null)
    or (is_open and opens_at is not null and closes_at is not null and opens_at < closes_at)
  )
);

insert into public.studio_hours (weekday, is_open, opens_at, closes_at) values
  (1, true, '10:00', '20:00'),
  (2, true, '10:00', '20:00'),
  (3, true, '10:00', '20:00'),
  (4, true, '10:00', '20:00'),
  (5, true, '10:00', '20:00'),
  (6, true, '10:00', '20:00'),
  (7, false, null, null);

create table public.piercer_service_qualifications (
  piercer_profile_id uuid not null references public.piercer_profiles (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (piercer_profile_id, service_id)
);

create index piercer_service_qualifications_service_id_idx
on public.piercer_service_qualifications (service_id);

create table public.piercer_availability (
  piercer_profile_id uuid not null references public.piercer_profiles (id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  starts_at time not null,
  ends_at time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (piercer_profile_id, weekday),
  check (starts_at < ends_at)
);

create trigger piercer_availability_set_updated_at
before update on public.piercer_availability
for each row execute function public.set_updated_at();

create type public.studio_exception_type as enum ('closed', 'reduced_hours');

create table public.studio_exceptions (
  id uuid primary key default gen_random_uuid(),
  exception_date date not null unique,
  exception_type public.studio_exception_type not null,
  opens_at time,
  closes_at time,
  reason text not null check (btrim(reason) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (exception_type = 'closed' and opens_at is null and closes_at is null)
    or (exception_type = 'reduced_hours' and opens_at is not null and closes_at is not null and opens_at < closes_at)
  )
);

create index studio_exceptions_exception_date_idx
on public.studio_exceptions (exception_date);

create trigger studio_exceptions_set_updated_at
before update on public.studio_exceptions
for each row execute function public.set_updated_at();

create function public.validate_piercer_availability()
returns trigger language plpgsql set search_path = '' as $$
declare
  hours public.studio_hours%rowtype;
begin
  select row.* into hours from public.studio_hours row where row.weekday = new.weekday;
  if hours.weekday is null or not hours.is_open
     or new.starts_at < hours.opens_at or new.ends_at > hours.closes_at then
    raise exception using errcode = '23514', message = 'Piercer availability must stay within open studio hours';
  end if;
  return new;
end;
$$;

create trigger piercer_availability_validate_hours
before insert or update on public.piercer_availability
for each row execute function public.validate_piercer_availability();

create function public.prevent_conflicting_studio_hours()
returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (
    select 1 from public.piercer_availability availability
    where availability.weekday = new.weekday
      and (not new.is_open or availability.starts_at < new.opens_at or availability.ends_at > new.closes_at)
  ) then
    raise exception using errcode = '23514', message = 'Update piercer availability before shortening studio hours';
  end if;
  return new;
end;
$$;

create trigger studio_hours_prevent_availability_conflicts
before update on public.studio_hours
for each row execute function public.prevent_conflicting_studio_hours();

create function public.validate_studio_exception()
returns trigger language plpgsql set search_path = '' as $$
declare
  hours public.studio_hours%rowtype;
  local_weekday smallint := extract(isodow from new.exception_date)::smallint;
begin
  if new.exception_type = 'reduced_hours' then
    select row.* into hours from public.studio_hours row where row.weekday = local_weekday;
    if hours.weekday is null or not hours.is_open
       or new.opens_at < hours.opens_at or new.closes_at > hours.closes_at then
      raise exception using errcode = '23514', message = 'Reduced hours must stay within normal studio hours';
    end if;
  end if;
  new.reason := btrim(new.reason);
  return new;
end;
$$;

create trigger studio_exceptions_validate
before insert or update on public.studio_exceptions
for each row execute function public.validate_studio_exception();

create function public.piercer_is_assignable(
  target_piercer_profile_id uuid,
  selected_service_ids uuid[],
  at_time timestamptz
)
returns boolean
language sql stable security definer set search_path = '' as $$
  with local_moment as (
    select (at_time at time zone 'Asia/Manila')::date as local_date,
      (at_time at time zone 'Asia/Manila')::time as local_time,
      extract(isodow from at_time at time zone 'Asia/Manila')::smallint as weekday
  )
  select exists (
    select 1
    from public.piercer_profiles piercer
    cross join local_moment moment
    join public.studio_hours hours on hours.weekday = moment.weekday
    join public.piercer_availability availability
      on availability.piercer_profile_id = piercer.id and availability.weekday = moment.weekday
    left join public.studio_exceptions exception on exception.exception_date = moment.local_date
    where piercer.id = target_piercer_profile_id
      and piercer.active
      and hours.is_open
      and moment.local_time >= hours.opens_at and moment.local_time < hours.closes_at
      and moment.local_time >= availability.starts_at and moment.local_time < availability.ends_at
      and (exception.id is null or (
        exception.exception_type = 'reduced_hours'
        and moment.local_time >= exception.opens_at and moment.local_time < exception.closes_at
      ))
      and cardinality(coalesce(selected_service_ids, '{}'::uuid[])) > 0
      and not exists (
        select 1 from unnest(coalesce(selected_service_ids, '{}'::uuid[])) selected(service_id)
        where not exists (
          select 1 from public.piercer_service_qualifications qualification
          join public.services service on service.id = qualification.service_id and service.active
          where qualification.piercer_profile_id = piercer.id and qualification.service_id = selected.service_id
        )
      )
  );
$$;

create function public.get_assignable_piercers(selected_service_ids uuid[])
returns table (id uuid, name text, default_station_id uuid)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_active_account() then
    raise exception using errcode = '42501', message = 'Active application account required';
  end if;
  if cardinality(coalesce(selected_service_ids, '{}'::uuid[])) = 0
     or cardinality(selected_service_ids) <> (select count(distinct value) from unnest(selected_service_ids) value)
     or exists (select 1 from unnest(selected_service_ids) selected_id where not exists (
       select 1 from public.services service where service.id = selected_id and service.active
     )) then
    raise exception using errcode = '22023', message = 'Choose valid active services';
  end if;
  return query
  select piercer.id, piercer.display_name,
    case when station.active then station.id else null end
  from public.piercer_profiles piercer
  left join public.stations station on station.id = piercer.default_station_id
  where public.piercer_is_assignable(piercer.id, selected_service_ids, clock_timestamp())
  order by piercer.display_name, piercer.id;
end;
$$;

create function public.replace_piercer_qualifications(
  target_piercer_profile_id uuid,
  selected_service_ids uuid[]
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner() then raise exception using errcode = '42501', message = 'Owner access required'; end if;
  if not exists (select 1 from public.piercer_profiles piercer where piercer.id = target_piercer_profile_id) then
    raise exception using errcode = '22023', message = 'Piercer profile not found';
  end if;
  selected_service_ids := coalesce(selected_service_ids, '{}'::uuid[]);
  if cardinality(selected_service_ids) <> (select count(distinct value) from unnest(selected_service_ids) value)
     or exists (select 1 from unnest(selected_service_ids) selected_id where not exists (
       select 1 from public.services service where service.id = selected_id
     )) then
    raise exception using errcode = '22023', message = 'Choose valid services';
  end if;
  delete from public.piercer_service_qualifications qualification
  where qualification.piercer_profile_id = target_piercer_profile_id
    and not qualification.service_id = any(selected_service_ids);
  insert into public.piercer_service_qualifications (piercer_profile_id, service_id)
  select target_piercer_profile_id, service_id from unnest(selected_service_ids) service_id
  on conflict do nothing;
end;
$$;

create function public.enforce_transaction_service_qualification()
returns trigger language plpgsql security definer set search_path = '' as $$
declare assigned_piercer uuid;
begin
  if new.item_type <> 'service' then return new; end if;
  select transaction.piercer_profile_id into assigned_piercer
  from public.transactions transaction where transaction.id = new.transaction_id;
  -- Legacy/open records created before Studio assignment remain editable. Every
  -- newly assigned service transaction is qualification-checked.
  if assigned_piercer is null then return new; end if;
  if not exists (
    select 1 from public.piercer_service_qualifications qualification
    where qualification.piercer_profile_id = assigned_piercer and qualification.service_id = new.service_id
  ) then
    raise exception using errcode = '23514', message = 'Assigned piercer is not qualified for the selected service';
  end if;
  return new;
end;
$$;

create trigger transaction_items_enforce_piercer_qualification
before insert or update of service_id, transaction_id, item_type on public.transaction_items
for each row execute function public.enforce_transaction_service_qualification();

alter table public.studio_hours enable row level security;
alter table public.piercer_service_qualifications enable row level security;
alter table public.piercer_availability enable row level security;
alter table public.studio_exceptions enable row level security;

create policy "active accounts read studio hours" on public.studio_hours
for select to authenticated using (public.is_active_account());
create policy "owners update studio hours" on public.studio_hours
for update to authenticated using (public.is_owner()) with check (public.is_owner());

create policy "active accounts read piercer qualifications" on public.piercer_service_qualifications
for select to authenticated using (public.is_active_account());
create policy "owners manage piercer qualifications" on public.piercer_service_qualifications
for all to authenticated using (public.is_owner()) with check (public.is_owner());

create policy "active accounts read piercer availability" on public.piercer_availability
for select to authenticated using (public.is_active_account());
create policy "owners manage piercer availability" on public.piercer_availability
for all to authenticated using (public.is_owner()) with check (public.is_owner());

create policy "active accounts read studio exceptions" on public.studio_exceptions
for select to authenticated using (public.is_active_account());
create policy "owners manage studio exceptions" on public.studio_exceptions
for all to authenticated using (public.is_owner()) with check (public.is_owner());

revoke all on function public.piercer_is_assignable(uuid, uuid[], timestamptz) from public;
revoke all on function public.get_assignable_piercers(uuid[]) from public;
revoke all on function public.replace_piercer_qualifications(uuid, uuid[]) from public;
grant execute on function public.get_assignable_piercers(uuid[]) to authenticated;
grant execute on function public.replace_piercer_qualifications(uuid, uuid[]) to authenticated;

-- Apply the live schedule once, when a new signed service transaction is
-- established. Payment recovery does not recheck the current clock.
create or replace function public.accept_new_service_waiver(
  signing_event_id uuid,
  client_details jsonb,
  selected_service_ids uuid[],
  selected_product_ids uuid[]
)
returns table (
  id uuid, reference_code text, client_name text, created_at timestamptz,
  total numeric, event_id uuid, template_id uuid, template_version integer,
  template_body text, signed_at timestamptz
)
language plpgsql security definer set search_path = '' as $$
declare
  signing private.waiver_signing_events%rowtype;
  resolved_client_id uuid; resolved_client_name text; existing_client_id uuid;
  new_client_name text; new_client_email text; new_client_phone text;
  selected_piercer_profile_id uuid; selected_station_id uuid;
  created_transaction_id uuid; created_reference text; created_at_value timestamptz;
  resolved_total numeric; accepted_at timestamptz := clock_timestamp(); invalid_count integer;
begin
  if not public.is_active_account() then raise exception using errcode = '42501', message = 'Active application account required'; end if;
  select event.* into signing from private.waiver_signing_events event where event.id = signing_event_id for update;
  if signing.id is null or signing.recorded_by <> auth.uid() or signing.state <> 'prepared' or signing.transaction_id is not null then
    raise exception using errcode = '22023', message = 'Signing session is unavailable';
  end if;
  if accepted_at > signing.expires_at then
    update private.waiver_signing_events event set state = 'abandoned' where event.id = signing.id;
    raise exception using errcode = '22023', message = 'Signing session expired';
  end if;
  selected_service_ids := coalesce(selected_service_ids, '{}'::uuid[]);
  selected_product_ids := coalesce(selected_product_ids, '{}'::uuid[]);
  if cardinality(selected_service_ids) = 0 then raise exception using errcode = '22023', message = 'At least one service is required'; end if;
  if cardinality(selected_service_ids) <> (select count(distinct value) from unnest(selected_service_ids) value)
     or cardinality(selected_product_ids) <> (select count(distinct value) from unnest(selected_product_ids) value) then
    raise exception using errcode = '22023', message = 'Duplicate catalog items are not allowed';
  end if;
  select count(*) into invalid_count from unnest(selected_service_ids) selected_id where not exists (
    select 1 from public.services service where service.id = selected_id and service.active);
  if invalid_count > 0 then raise exception using errcode = '22023', message = 'Every service must exist and be active'; end if;
  select count(*) into invalid_count from unnest(selected_product_ids) selected_id where not exists (
    select 1 from public.products product where product.id = selected_id and product.active);
  if invalid_count > 0 then raise exception using errcode = '22023', message = 'Every product must exist and be active'; end if;
  if jsonb_typeof(client_details) <> 'object' then raise exception using errcode = '22023', message = 'Client details are required'; end if;
  existing_client_id := nullif(client_details ->> 'existing_client_id', '')::uuid;
  new_client_name := client_details ->> 'full_name'; new_client_email := client_details ->> 'email'; new_client_phone := client_details ->> 'phone';
  selected_piercer_profile_id := nullif(client_details ->> 'piercer_profile_id', '')::uuid;
  selected_station_id := nullif(client_details ->> 'station_id', '')::uuid;
  if (existing_client_id is null) = (nullif(btrim(new_client_name), '') is null) then
    raise exception using errcode = '22023', message = 'Choose exactly one client source';
  end if;
  if selected_station_id is null or not exists (select 1 from public.stations station where station.id = selected_station_id and station.active) then
    raise exception using errcode = '22023', message = 'Choose an active station';
  end if;
  if not public.piercer_is_assignable(selected_piercer_profile_id, selected_service_ids, accepted_at) then
    raise exception using errcode = '22023', message = 'The selected piercer is not qualified and available within current studio hours';
  end if;
  if existing_client_id is not null then
    select client.id, client.full_name into resolved_client_id, resolved_client_name from public.clients client where client.id = existing_client_id;
    if resolved_client_id is null then raise exception using errcode = '22023', message = 'Client not found'; end if;
  else
    resolved_client_name := btrim(new_client_name);
    insert into public.clients (full_name, email, phone, created_by)
    values (resolved_client_name, nullif(btrim(new_client_email), ''), nullif(btrim(new_client_phone), ''), auth.uid())
    returning clients.id into resolved_client_id;
  end if;
  created_reference := public.next_transaction_reference();
  insert into public.transactions (reference_code, client_id, status, created_by, piercer_profile_id, station_id)
  values (created_reference, resolved_client_id, 'pending', auth.uid(), selected_piercer_profile_id, selected_station_id)
  returning transactions.id, transactions.created_at into created_transaction_id, created_at_value;
  insert into public.transaction_items (transaction_id, item_type, service_id, product_id, item_name_snapshot, unit_price_snapshot, quantity)
  select created_transaction_id, 'service'::public.transaction_item_type, service.id, null::uuid, service.name, service.price, 1
  from public.services service where service.id = any(selected_service_ids)
  union all
  select created_transaction_id, 'product'::public.transaction_item_type, null::uuid, product.id, product.name, product.price, 1
  from public.products product where product.id = any(selected_product_ids);
  select sum(item.unit_price_snapshot * item.quantity) into resolved_total from public.transaction_items item where item.transaction_id = created_transaction_id;
  if resolved_total is null or resolved_total <= 0 then raise exception using errcode = '22023', message = 'Transaction total must be positive'; end if;
  update private.waiver_signing_events event set transaction_id = created_transaction_id,
    client_name_snapshot = resolved_client_name, signed_at = accepted_at, state = 'accepted' where event.id = signing.id;
  return query select created_transaction_id, created_reference, resolved_client_name, created_at_value,
    resolved_total, signing.id, template.id, template.version, template.body, accepted_at
  from public.waiver_templates template where template.id = signing.waiver_template_id;
end;
$$;
