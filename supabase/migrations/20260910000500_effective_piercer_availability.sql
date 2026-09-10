-- Phase 7: derive one piercer's effective interval for a Manila business date.
-- Temporary Piercer Schedule completely overrides Recurring Piercer
-- Availability, then the selected state is intersected with Effective Studio
-- Hours. The result is derived only and never rewrites either schedule layer.

create function public.get_effective_piercer_availability(
  target_piercer_profile_id uuid,
  target_date date
)
returns table (
  piercer_profile_id uuid,
  availability_date date,
  weekday smallint,
  is_available boolean,
  mode text,
  starts_at time,
  ends_at time,
  source text,
  temporary_schedule_id uuid,
  studio_source text,
  studio_temporary_schedule_id uuid,
  studio_exception_id uuid,
  studio_exception_type public.studio_exception_type
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if target_piercer_profile_id is null then
    raise exception using errcode = '22023', message = 'Choose a Piercer profile';
  end if;

  if target_date is null or not isfinite(target_date) then
    raise exception using errcode = '22023', message = 'Choose a finite Piercer availability date';
  end if;

  return query
  with selected_state as (
    select
      target_piercer_profile_id as selected_piercer_id,
      studio.schedule_date,
      studio.weekday as selected_weekday,
      studio.is_open as studio_is_open,
      studio.opens_at as studio_opens_at,
      studio.closes_at as studio_closes_at,
      studio.source as selected_studio_source,
      studio.temporary_schedule_id as selected_studio_temporary_schedule_id,
      studio.exception_id as selected_studio_exception_id,
      studio.exception_type as selected_studio_exception_type,
      schedule.id as selected_temporary_schedule_id,
      case
        when schedule.id is not null then temporary.is_available
        else recurring.piercer_profile_id is not null
      end as selected_is_available,
      case when schedule.id is not null then temporary.mode else recurring.mode end as selected_mode,
      case when schedule.id is not null then temporary.starts_at else recurring.starts_at end as selected_starts_at,
      case when schedule.id is not null then temporary.ends_at else recurring.ends_at end as selected_ends_at
    from public.get_effective_studio_hours(target_date) studio
    left join public.piercer_temporary_schedules schedule
      on schedule.piercer_profile_id = target_piercer_profile_id
      and daterange(schedule.starts_on, schedule.ends_on, '[]') @> target_date
    left join public.piercer_temporary_availability temporary
      on temporary.schedule_id = schedule.id
      and temporary.weekday = studio.weekday
    left join public.piercer_availability recurring
      on recurring.piercer_profile_id = target_piercer_profile_id
      and recurring.weekday = studio.weekday
  ), resolved as (
    select state.*,
      case
        when state.studio_is_open
          and state.selected_is_available is true
          and state.selected_mode = 'studio'
          then state.studio_opens_at
        when state.studio_is_open
          and state.selected_is_available is true
          and state.selected_mode = 'custom'
          and state.selected_starts_at is not null
          and state.selected_ends_at is not null
          then greatest(state.studio_opens_at, state.selected_starts_at)
      end as effective_starts_at,
      case
        when state.studio_is_open
          and state.selected_is_available is true
          and state.selected_mode = 'studio'
          then state.studio_closes_at
        when state.studio_is_open
          and state.selected_is_available is true
          and state.selected_mode = 'custom'
          and state.selected_starts_at is not null
          and state.selected_ends_at is not null
          then least(state.studio_closes_at, state.selected_ends_at)
      end as effective_ends_at
    from selected_state state
  )
  select
    state.selected_piercer_id,
    state.schedule_date,
    state.selected_weekday,
    coalesce(state.effective_starts_at < state.effective_ends_at, false),
    state.selected_mode,
    case when state.effective_starts_at < state.effective_ends_at then state.effective_starts_at end,
    case when state.effective_starts_at < state.effective_ends_at then state.effective_ends_at end,
    case when state.selected_temporary_schedule_id is null then 'recurring'::text else 'temporary'::text end,
    state.selected_temporary_schedule_id,
    state.selected_studio_source,
    state.selected_studio_temporary_schedule_id,
    state.selected_studio_exception_id,
    state.selected_studio_exception_type
  from resolved state;
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
      (at_time at time zone 'Asia/Manila')::time as local_time
  )
  select exists (
    select 1
    from public.piercer_profiles piercer
    cross join local_moment moment
    cross join lateral public.get_effective_piercer_availability(
      piercer.id,
      moment.local_date
    ) availability
    where piercer.id = target_piercer_profile_id
      and piercer.active
      and availability.is_available
      and moment.local_time >= availability.starts_at
      and moment.local_time < availability.ends_at
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

-- The resolver is an internal scheduling primitive in Phase 7. Checked
-- browser operations continue through get_assignable_piercers and waiver RPCs.
revoke all on function public.get_effective_piercer_availability(uuid, date)
  from public, anon, authenticated;
revoke all on function public.piercer_is_assignable(uuid, uuid[], timestamptz)
  from public, anon, authenticated;

comment on function public.get_effective_piercer_availability(uuid, date) is
  'Internal finite-date resolver: Temporary Piercer Schedule > Recurring Piercer Availability, intersected with Effective Studio Hours. Missing temporary child state fails closed without recurring fallback. Sources: recurring, temporary. Timestamp callers must supply the Asia/Manila date.';
comment on function public.piercer_is_assignable(uuid, uuid[], timestamptz) is
  'Internal Manila-time assignment predicate consuming Effective Piercer Availability. Active-profile, selected-service, and qualification checks remain independent; opening is inclusive and closing exclusive.';
