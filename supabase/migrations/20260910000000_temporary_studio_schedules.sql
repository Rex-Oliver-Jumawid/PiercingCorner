-- Phase 2 persists date-bounded Studio schedule overrides independently from
-- the recurring weekly defaults in public.studio_hours. Runtime scheduling
-- continues to use recurring hours until the later effective-hours phase.

create table public.studio_temporary_schedules (
  id uuid primary key default gen_random_uuid(),
  starts_on date not null,
  ends_on date not null,
  created_by uuid not null default auth.uid()
    references public.staff_accounts (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint studio_temporary_schedules_valid_range check (starts_on <= ends_on),
  constraint studio_temporary_schedules_no_overlap exclude using gist (
    daterange(starts_on, ends_on, '[]') with &&
  )
);

create index studio_temporary_schedules_date_range_idx
on public.studio_temporary_schedules (starts_on, ends_on);

create trigger studio_temporary_schedules_set_updated_at
before update on public.studio_temporary_schedules
for each row execute function public.set_updated_at();

create table public.studio_temporary_hours (
  schedule_id uuid not null
    references public.studio_temporary_schedules (id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  is_open boolean not null,
  opens_at time,
  closes_at time,
  primary key (schedule_id, weekday),
  constraint studio_temporary_hours_valid_window check (
    (not is_open and opens_at is null and closes_at is null)
    or (is_open and opens_at is not null and closes_at is not null and opens_at < closes_at)
  )
);

alter table public.studio_temporary_schedules enable row level security;
alter table public.studio_temporary_hours enable row level security;

create policy "active accounts read temporary studio schedules"
on public.studio_temporary_schedules
for select to authenticated using (public.is_active_account());

create policy "owners manage temporary studio schedules"
on public.studio_temporary_schedules
for all to authenticated using (public.is_owner()) with check (public.is_owner());

create policy "active accounts read temporary studio hours"
on public.studio_temporary_hours
for select to authenticated using (public.is_active_account());

create policy "owners manage temporary studio hours"
on public.studio_temporary_hours
for all to authenticated using (public.is_owner()) with check (public.is_owner());

create function public.configure_temporary_studio_schedule(
  schedule_starts_on date,
  schedule_ends_on date,
  daily_hours jsonb,
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

  if schedule_starts_on is null or schedule_ends_on is null
     or schedule_starts_on > schedule_ends_on then
    raise exception using errcode = '22023', message = 'Choose a valid temporary Studio schedule date range';
  end if;

  if jsonb_typeof(daily_hours) <> 'array' then
    raise exception using errcode = '22023', message = 'Provide all seven temporary Studio weekdays';
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
       where day.weekday is null or day.weekday not between 1 and 7 or day.is_open is null
     ) then
    raise exception using errcode = '22023', message = 'Provide each temporary Studio weekday exactly once';
  end if;

  if target_schedule_id is null then
    insert into public.studio_temporary_schedules (starts_on, ends_on, created_by)
    values (schedule_starts_on, schedule_ends_on, auth.uid())
    returning id into configured_schedule_id;
  else
    select schedule.id into configured_schedule_id
    from public.studio_temporary_schedules schedule
    where schedule.id = target_schedule_id
    for update;

    if configured_schedule_id is null then
      raise exception using errcode = '22023', message = 'Temporary Studio schedule not found';
    end if;

    update public.studio_temporary_schedules schedule
    set starts_on = schedule_starts_on, ends_on = schedule_ends_on
    where schedule.id = configured_schedule_id;

    delete from public.studio_temporary_hours hour
    where hour.schedule_id = configured_schedule_id;
  end if;

  insert into public.studio_temporary_hours (
    schedule_id,
    weekday,
    is_open,
    opens_at,
    closes_at
  )
  select
    configured_schedule_id,
    day.weekday,
    day.is_open,
    day.opens_at,
    day.closes_at
  from jsonb_to_recordset(daily_hours) as day(
    weekday smallint,
    is_open boolean,
    opens_at time,
    closes_at time
  );

  return configured_schedule_id;
end;
$$;

grant select on table
  public.studio_temporary_schedules,
  public.studio_temporary_hours
to authenticated;

-- Direct writes stay unavailable so the seven-row invariant cannot be bypassed
-- through separate browser requests. The Owner-only RPC is the mutation path;
-- mutation policies remain as defense in depth if privileges change later.
revoke insert, update, delete on table
  public.studio_temporary_schedules,
  public.studio_temporary_hours
from authenticated;

revoke all on function public.configure_temporary_studio_schedule(date, date, jsonb, uuid) from public;
grant execute on function public.configure_temporary_studio_schedule(date, date, jsonb, uuid) to authenticated;
