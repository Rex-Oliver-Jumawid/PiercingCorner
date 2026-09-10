-- Phase 11 hardening: reject an available Temporary Piercer state when its
-- mode is null. The prior CHECK could evaluate to UNKNOWN for that row shape,
-- which PostgreSQL accepts.

alter table public.piercer_temporary_availability
  drop constraint piercer_temporary_availability_state_check,
  add constraint piercer_temporary_availability_state_check check (
    (
      not is_available
      and mode is null
      and starts_at is null
      and ends_at is null
    )
    or (
      is_available
      and mode is not distinct from 'studio'
      and starts_at is null
      and ends_at is null
    )
    or (
      is_available
      and mode is not distinct from 'custom'
      and starts_at is not null
      and ends_at is not null
      and starts_at < ends_at
    )
  );

create or replace function public.configure_temporary_piercer_schedule(
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

  if exists (
    select 1
    from jsonb_to_recordset(daily_availability) as day(
      weekday smallint,
      is_available boolean,
      mode text,
      starts_at time,
      ends_at time
    )
    where day.is_available and day.mode is null
  ) then
    raise exception using errcode = '22023', message = 'Invalid temporary Piercer availability state';
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

revoke all on function public.configure_temporary_piercer_schedule(uuid, date, date, jsonb, uuid)
  from public;
grant execute on function public.configure_temporary_piercer_schedule(uuid, date, date, jsonb, uuid)
  to authenticated;

comment on function public.configure_temporary_piercer_schedule(uuid, date, date, jsonb, uuid) is
  'Owner-only atomic create or same-piercer replacement of one complete seven-day Temporary Piercer Schedule. Every available state requires an explicit studio or custom mode.';
