-- Phase 6 persists date-bounded Piercer Availability overrides independently
-- from public.piercer_availability. Operational resolution remains deferred to
-- the Effective Piercer Availability phase.

create extension if not exists btree_gist with schema extensions;

create table public.piercer_temporary_schedules (
  id uuid primary key default gen_random_uuid(),
  piercer_profile_id uuid not null
    references public.piercer_profiles (id) on delete restrict,
  starts_on date not null,
  ends_on date not null,
  created_by uuid not null default auth.uid()
    references public.staff_accounts (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint piercer_temporary_schedules_valid_range check (starts_on <= ends_on),
  constraint piercer_temporary_schedules_no_overlap exclude using gist (
    piercer_profile_id with =,
    daterange(starts_on, ends_on, '[]') with &&
  )
);

create index piercer_temporary_schedules_piercer_date_range_idx
on public.piercer_temporary_schedules (piercer_profile_id, starts_on, ends_on);

create trigger piercer_temporary_schedules_set_updated_at
before update on public.piercer_temporary_schedules
for each row execute function public.set_updated_at();

create table public.piercer_temporary_availability (
  schedule_id uuid not null
    references public.piercer_temporary_schedules (id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  is_available boolean not null,
  mode text,
  starts_at time,
  ends_at time,
  primary key (schedule_id, weekday),
  constraint piercer_temporary_availability_state_check check (
    (
      not is_available
      and mode is null
      and starts_at is null
      and ends_at is null
    )
    or (
      is_available
      and mode = 'studio'
      and starts_at is null
      and ends_at is null
    )
    or (
      is_available
      and mode = 'custom'
      and starts_at is not null
      and ends_at is not null
      and starts_at < ends_at
    )
  )
);

alter table public.piercer_temporary_schedules enable row level security;
alter table public.piercer_temporary_availability enable row level security;

create policy "active accounts read temporary piercer schedules"
on public.piercer_temporary_schedules
for select to authenticated using (public.is_active_account());

create policy "owners manage temporary piercer schedules"
on public.piercer_temporary_schedules
for all to authenticated using (public.is_owner()) with check (public.is_owner());

create policy "active accounts read temporary piercer availability"
on public.piercer_temporary_availability
for select to authenticated using (public.is_active_account());

create policy "owners manage temporary piercer availability"
on public.piercer_temporary_availability
for all to authenticated using (public.is_owner()) with check (public.is_owner());

create function public.configure_temporary_piercer_schedule(
  target_piercer_profile_id uuid,
  schedule_starts_on date,
  schedule_ends_on date,
  daily_availability jsonb,
  target_schedule_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  configured_schedule_id uuid;
  supplied_day_count integer;
  distinct_day_count integer;
begin
  if not public.is_owner() then
    raise exception using errcode = '42501', message = 'Owner access required';
  end if;

  if target_piercer_profile_id is null or not exists (
    select 1 from public.piercer_profiles profile
    where profile.id = target_piercer_profile_id
  ) then
    raise exception using errcode = '22023', message = 'Piercer profile not found';
  end if;

  if schedule_starts_on is null or schedule_ends_on is null
     or schedule_starts_on > schedule_ends_on then
    raise exception using errcode = '22023', message = 'Choose a valid temporary Piercer schedule date range';
  end if;

  if jsonb_typeof(daily_availability) <> 'array' then
    raise exception using errcode = '22023', message = 'Provide all seven temporary Piercer weekdays';
  end if;

  select count(*), count(distinct day.weekday)
  into supplied_day_count, distinct_day_count
  from jsonb_to_recordset(daily_availability) as day(
    weekday smallint,
    is_available boolean,
    mode text,
    starts_at time,
    ends_at time
  );

  if supplied_day_count <> 7 or distinct_day_count <> 7
     or exists (
       select 1
       from jsonb_to_recordset(daily_availability) as day(
         weekday smallint,
         is_available boolean,
         mode text,
         starts_at time,
         ends_at time
       )
       where day.weekday is null
         or day.weekday not between 1 and 7
         or day.is_available is null
     ) then
    raise exception using errcode = '22023', message = 'Provide each temporary Piercer weekday exactly once';
  end if;

  if target_schedule_id is null then
    insert into public.piercer_temporary_schedules (
      piercer_profile_id,
      starts_on,
      ends_on,
      created_by
    )
    values (
      target_piercer_profile_id,
      schedule_starts_on,
      schedule_ends_on,
      auth.uid()
    )
    returning id into configured_schedule_id;
  else
    select schedule.id into configured_schedule_id
    from public.piercer_temporary_schedules schedule
    where schedule.id = target_schedule_id
      and schedule.piercer_profile_id = target_piercer_profile_id
    for update;

    if configured_schedule_id is null then
      raise exception using errcode = '22023', message = 'Temporary Piercer schedule not found for this piercer';
    end if;

    update public.piercer_temporary_schedules schedule
    set starts_on = schedule_starts_on, ends_on = schedule_ends_on
    where schedule.id = configured_schedule_id;

    delete from public.piercer_temporary_availability availability
    where availability.schedule_id = configured_schedule_id;
  end if;

  insert into public.piercer_temporary_availability (
    schedule_id,
    weekday,
    is_available,
    mode,
    starts_at,
    ends_at
  )
  select
    configured_schedule_id,
    day.weekday,
    day.is_available,
    day.mode,
    day.starts_at,
    day.ends_at
  from jsonb_to_recordset(daily_availability) as day(
    weekday smallint,
    is_available boolean,
    mode text,
    starts_at time,
    ends_at time
  );

  return configured_schedule_id;
end;
$$;

grant select on table
  public.piercer_temporary_schedules,
  public.piercer_temporary_availability
to authenticated;

-- Browser writes stay RPC-only so partial child schedules cannot bypass the
-- complete seven-day mutation boundary. Owner policies remain defense in depth.
revoke insert, update, delete on table
  public.piercer_temporary_schedules,
  public.piercer_temporary_availability
from authenticated;

revoke all on function public.configure_temporary_piercer_schedule(uuid, date, date, jsonb, uuid) from public;
grant execute on function public.configure_temporary_piercer_schedule(uuid, date, date, jsonb, uuid) to authenticated;

comment on table public.piercer_temporary_schedules is
  'Inclusive date-bounded Temporary Piercer Schedule metadata. Same-piercer ranges cannot overlap and recurring availability is never rewritten.';
comment on table public.piercer_temporary_availability is
  'Seven explicit weekday states per Temporary Piercer Schedule: unavailable, studio, or custom. Operational resolution is deferred.';
comment on function public.configure_temporary_piercer_schedule(uuid, date, date, jsonb, uuid) is
  'Owner-only atomic create or same-piercer replacement of one complete seven-day Temporary Piercer Schedule.';
