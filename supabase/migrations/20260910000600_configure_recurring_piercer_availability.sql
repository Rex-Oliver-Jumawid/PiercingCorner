-- Phase 8: one complete recurring Piercer Availability week, atomically.
create function public.configure_recurring_piercer_availability(
  target_piercer_profile_id uuid,
  daily_availability jsonb
)
returns void
language plpgsql security definer set search_path = '' as $$
declare supplied_day_count integer; distinct_day_count integer;
begin
  if not public.is_owner() then raise exception using errcode = '42501', message = 'Owner access required'; end if;
  if target_piercer_profile_id is null or not exists (select 1 from public.piercer_profiles p where p.id = target_piercer_profile_id) then
    raise exception using errcode = '22023', message = 'Piercer profile not found';
  end if;
  if jsonb_typeof(daily_availability) <> 'array' then raise exception using errcode = '22023', message = 'Provide all seven recurring Piercer weekdays'; end if;
  select count(*), count(distinct d.weekday) into supplied_day_count, distinct_day_count
  from jsonb_to_recordset(daily_availability) as d(weekday smallint, is_available boolean, mode text, starts_at time, ends_at time);
  if supplied_day_count <> 7 or distinct_day_count <> 7 or exists (
    select 1 from jsonb_to_recordset(daily_availability) as d(weekday smallint, is_available boolean, mode text, starts_at time, ends_at time)
    where d.weekday is null or d.weekday not between 1 and 7 or d.is_available is null
  ) then raise exception using errcode = '22023', message = 'Provide each recurring Piercer weekday exactly once'; end if;

  -- Validate all incoming states before replacing rows. The table constraint and
  -- trigger remain the authoritative checks for mode/time and Studio conflicts.
  if exists (
    select 1 from jsonb_to_recordset(daily_availability) as d(weekday smallint, is_available boolean, mode text, starts_at time, ends_at time)
    where (not d.is_available and (d.mode is not null or d.starts_at is not null or d.ends_at is not null))
      or (d.is_available and d.mode = 'studio' and (d.starts_at is not null or d.ends_at is not null))
      or (d.is_available and d.mode = 'custom' and (d.starts_at is null or d.ends_at is null or d.starts_at >= d.ends_at))
      or (d.is_available and d.mode not in ('studio', 'custom'))
  ) then raise exception using errcode = '22023', message = 'Invalid recurring Piercer availability state'; end if;

  delete from public.piercer_availability a where a.piercer_profile_id = target_piercer_profile_id;
  insert into public.piercer_availability (piercer_profile_id, weekday, mode, starts_at, ends_at)
  select target_piercer_profile_id, d.weekday, d.mode, d.starts_at, d.ends_at
  from jsonb_to_recordset(daily_availability) as d(weekday smallint, is_available boolean, mode text, starts_at time, ends_at time)
  where d.is_available;
end;
$$;

revoke all on function public.configure_recurring_piercer_availability(uuid, jsonb) from public;
grant execute on function public.configure_recurring_piercer_availability(uuid, jsonb) to authenticated;
comment on function public.configure_recurring_piercer_availability(uuid, jsonb) is
  'Owner-only atomic replacement of seven recurring Piercer Availability states; unavailable weekdays delete their rows.';
