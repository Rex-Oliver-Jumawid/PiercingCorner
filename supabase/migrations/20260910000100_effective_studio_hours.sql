-- Phase 3: derive Studio hours without changing either recurring schedule.
-- Invoker functions preserve table RLS for direct authenticated reads and run
-- with the existing checked definer's privileges during assignment.
create function public.get_base_studio_hours(target_date date)
returns table (
  schedule_date date,
  weekday smallint,
  is_open boolean,
  opens_at time,
  closes_at time,
  source text,
  temporary_schedule_id uuid
)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if target_date is null or not isfinite(target_date) then
    raise exception using errcode = '22023', message = 'Choose a finite Studio date';
  end if;

  return query
  with selected_hours as (
    select extract(isodow from target_date)::smallint as day,
      schedule.id as schedule_id,
      case when schedule.id is not null then temporary.is_open else recurring.is_open end as open,
      case when schedule.id is not null then temporary.opens_at else recurring.opens_at end as start_time,
      case when schedule.id is not null then temporary.closes_at else recurring.closes_at end as end_time
    from (values (target_date)) requested(day)
    left join public.studio_temporary_schedules schedule
      on daterange(schedule.starts_on, schedule.ends_on, '[]') @> requested.day
    left join public.studio_temporary_hours temporary
      on temporary.schedule_id = schedule.id
      and temporary.weekday = extract(isodow from requested.day)::smallint
    left join public.studio_hours recurring
      on recurring.weekday = extract(isodow from requested.day)::smallint
  )
  select target_date, hours.day,
    coalesce(hours.open, false),
    case when hours.open then hours.start_time end,
    case when hours.open then hours.end_time end,
    case when hours.schedule_id is not null then 'temporary'::text else 'recurring'::text end,
    hours.schedule_id
  from selected_hours hours;
end;
$$;

create function public.get_effective_studio_hours(target_date date)
returns table (
  schedule_date date,
  weekday smallint,
  is_open boolean,
  opens_at time,
  closes_at time,
  source text,
  temporary_schedule_id uuid,
  exception_id uuid,
  exception_type public.studio_exception_type
)
language sql stable security invoker set search_path = '' as $$
  with resolved as (
    select base.*, exception.id as override_id,
      exception.exception_type as override_type,
      exception.opens_at as override_start, exception.closes_at as override_end,
      case when exception.id is null then base.is_open
        else coalesce(exception.exception_type = 'reduced_hours' and base.is_open
          and exception.opens_at >= base.opens_at and exception.closes_at <= base.closes_at, false)
      end as effective_open
    from public.get_base_studio_hours(target_date) base
    left join public.studio_exceptions exception on exception.exception_date = base.schedule_date
  )
  select hours.schedule_date, hours.weekday, hours.effective_open,
    case when hours.effective_open then
      case when hours.override_id is null then hours.opens_at else hours.override_start end end,
    case when hours.effective_open then
      case when hours.override_id is null then hours.closes_at else hours.override_end end end,
    case when hours.override_id is null then hours.source else 'exception'::text end,
    hours.temporary_schedule_id, hours.override_id, hours.override_type
  from resolved hours;
$$;

create or replace function public.validate_studio_exception()
returns trigger language plpgsql set search_path = '' as $$
declare
  hours record;
begin
  if new.exception_type = 'reduced_hours' then
    -- Never resolve the exception being validated: only Temporary > Recurring.
    select * into hours from public.get_base_studio_hours(new.exception_date);
    if not hours.is_open
       or new.opens_at < hours.opens_at or new.closes_at > hours.closes_at then
      raise exception using errcode = '23514', message = 'Reduced hours must stay within base studio hours';
    end if;
  end if;
  new.reason := btrim(new.reason);
  return new;
end;
$$;

create or replace function public.piercer_is_assignable(
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
    cross join lateral public.get_effective_studio_hours(moment.local_date) hours
    join public.piercer_availability availability
      on availability.piercer_profile_id = piercer.id and availability.weekday = moment.weekday
    where piercer.id = target_piercer_profile_id
      and piercer.active
      and hours.is_open
      and moment.local_time >= hours.opens_at and moment.local_time < hours.closes_at
      and moment.local_time >= availability.starts_at and moment.local_time < availability.ends_at
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

revoke all on function public.get_base_studio_hours(date) from public, anon, authenticated;
revoke all on function public.get_effective_studio_hours(date) from public, anon, authenticated;
-- Supabase default privileges can grant these roles directly, independently of PUBLIC.
revoke all on function public.piercer_is_assignable(uuid, uuid[], timestamptz)
  from public, anon, authenticated;
grant execute on function public.get_base_studio_hours(date) to authenticated;
grant execute on function public.get_effective_studio_hours(date) to authenticated;

comment on function public.get_base_studio_hours(date) is
  'Temporary > Recurring for a finite calendar date; missing selected weekday fails closed. Sources: recurring, temporary. Reads obey caller RLS.';
comment on function public.get_effective_studio_hours(date) is
  'Exception > Temporary > Recurring; closed results have null times. Invalidated reduced exceptions fail closed. Sources: recurring, temporary, exception. Timestamp callers must supply the Asia/Manila date.';
