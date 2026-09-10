-- Phase 5: make the existing weekly piercer availability source explicit.
-- Existing rows contain deliberate intervals, so they remain equivalent as
-- custom availability. Studio-mode rows derive their interval at runtime.
alter table public.piercer_availability
  add column mode text not null default 'custom';

alter table public.piercer_availability
  drop constraint piercer_availability_check,
  alter column starts_at drop not null,
  alter column ends_at drop not null,
  add constraint piercer_availability_mode_check
    check (mode in ('studio', 'custom')),
  add constraint piercer_availability_mode_times_check
    check (
      (mode = 'studio' and starts_at is null and ends_at is null)
      or
      (mode = 'custom' and starts_at is not null and ends_at is not null and starts_at < ends_at)
    );

create or replace function public.validate_piercer_availability()
returns trigger language plpgsql set search_path = '' as $$
declare
  hours public.studio_hours%rowtype;
begin
  if new.mode = 'studio' then
    return new;
  end if;

  select row.* into hours from public.studio_hours row where row.weekday = new.weekday;
  if hours.weekday is null or not hours.is_open
     or new.starts_at < hours.opens_at or new.ends_at > hours.closes_at then
    raise exception using errcode = '23514', message = 'Custom piercer availability must stay within open recurring studio hours';
  end if;
  return new;
end;
$$;

create or replace function public.prevent_conflicting_studio_hours()
returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (
    select 1 from public.piercer_availability availability
    where availability.weekday = new.weekday
      and availability.mode = 'custom'
      and (not new.is_open or availability.starts_at < new.opens_at or availability.ends_at > new.closes_at)
  ) then
    raise exception using errcode = '23514', message = 'Update custom piercer availability before shortening recurring studio hours';
  end if;
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
      and (
        availability.mode = 'studio'
        or (
          availability.mode = 'custom'
          and moment.local_time >= availability.starts_at
          and moment.local_time < availability.ends_at
        )
      )
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

revoke all on function public.piercer_is_assignable(uuid, uuid[], timestamptz)
  from public, anon, authenticated;

comment on table public.piercer_availability is
  'Recurring weekly Piercer Availability. Missing weekday means unavailable; studio follows Effective Studio Hours; custom stores an explicit interval.';
comment on column public.piercer_availability.mode is
  'studio derives null times from Effective Studio Hours; custom requires explicit increasing times. Existing rows migrated to custom.';
comment on function public.piercer_is_assignable(uuid, uuid[], timestamptz) is
  'Internal Manila-time assignment predicate. Intersects custom recurring availability with Effective Studio Hours; studio mode follows Effective Studio Hours. Qualification and active-profile checks remain independent.';
