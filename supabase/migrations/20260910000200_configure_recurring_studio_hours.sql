-- Phase 4: configure the complete recurring Studio week through one atomic,
-- Owner-only boundary while retaining the existing per-row conflict trigger.
create function public.configure_recurring_studio_hours(daily_hours jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  supplied_day_count integer;
  distinct_day_count integer;
  updated_day_count integer;
begin
  if not public.is_owner() then
    raise exception using errcode = '42501', message = 'Owner access required';
  end if;

  if jsonb_typeof(daily_hours) <> 'array' then
    raise exception using errcode = '22023', message = 'Provide all seven recurring Studio weekdays';
  end if;

  select count(*), count(distinct day.weekday)
  into supplied_day_count, distinct_day_count
  from jsonb_to_recordset(daily_hours) as day(
    weekday smallint,
    is_open boolean,
    opens_at time,
    closes_at time
  );

  if supplied_day_count <> 7 or distinct_day_count <> 7
     or exists (
       select 1
       from jsonb_to_recordset(daily_hours) as day(
         weekday smallint,
         is_open boolean,
         opens_at time,
         closes_at time
       )
       where day.weekday is null
          or day.weekday not between 1 and 7
          or day.is_open is null
          or (not day.is_open and (day.opens_at is not null or day.closes_at is not null))
          or (day.is_open and (
            day.opens_at is null
            or day.closes_at is null
            or day.opens_at >= day.closes_at
          ))
     ) then
    raise exception using errcode = '22023', message = 'Provide each recurring Studio weekday exactly once with valid hours';
  end if;

  update public.studio_hours existing
  set is_open = day.is_open,
      opens_at = day.opens_at,
      closes_at = day.closes_at
  from jsonb_to_recordset(daily_hours) as day(
    weekday smallint,
    is_open boolean,
    opens_at time,
    closes_at time
  )
  where existing.weekday = day.weekday;

  get diagnostics updated_day_count = row_count;
  if updated_day_count <> 7 then
    raise exception using errcode = '23514', message = 'Recurring Studio Hours must contain all seven weekdays';
  end if;
end;
$$;

revoke all on function public.configure_recurring_studio_hours(jsonb) from public;
grant execute on function public.configure_recurring_studio_hours(jsonb) to authenticated;

comment on function public.configure_recurring_studio_hours(jsonb) is
  'Owner-only atomic replacement of all seven recurring Studio Hours rows. Existing Piercer Availability conflict triggers remain authoritative.';
