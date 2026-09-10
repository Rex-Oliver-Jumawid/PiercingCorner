-- Focused Phase 7 Effective Piercer Availability and assignment checks.
-- Run only after all migrations against the local Supabase database.
begin;

create function pg_temp.assert_true(condition boolean, message text)
returns void language plpgsql as $$
begin
  if condition is distinct from true then
    raise exception 'assertion failed: %', message;
  end if;
end;
$$;

create function pg_temp.check_availability(
  target_piercer uuid,
  target_day date,
  expected_available boolean,
  expected_mode text,
  expected_start time,
  expected_end time,
  expected_source text
)
returns void language plpgsql as $$
declare actual record;
begin
  select * into actual
  from public.get_effective_piercer_availability(target_piercer, target_day);

  if actual.piercer_profile_id is distinct from target_piercer
     or actual.availability_date is distinct from target_day
     or actual.weekday is distinct from extract(isodow from target_day)::smallint
     or actual.is_available is distinct from expected_available
     or actual.mode is distinct from expected_mode
     or actual.starts_at is distinct from expected_start
     or actual.ends_at is distinct from expected_end
     or actual.source is distinct from expected_source then
    raise exception
      'resolution mismatch for % on %: got %, expected available=%, mode=%, start=%, end=%, source=%',
      target_piercer, target_day, row_to_json(actual), expected_available,
      expected_mode, expected_start, expected_end, expected_source;
  end if;
end;
$$;

create function pg_temp.is_assignable(piercer_id uuid, service_id uuid, moment timestamptz)
returns boolean language sql as $$
  select public.piercer_is_assignable(piercer_id, array[service_id], moment);
$$;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
('75000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','effective-piercer-owner@test.local','',now(),'{}','{}',now(),now()),
('75000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','effective-piercer-staff@test.local','',now(),'{}','{}',now(),now());

insert into public.staff_accounts (id, display_name, role, status) values
('75000000-0000-0000-0000-000000000001','Effective Piercer Owner','owner','active'),
('75000000-0000-0000-0000-000000000002','Effective Piercer Staff','staff','active');

insert into public.services (id, name, price, active) values
('75000000-0000-0000-0000-000000000010','Qualified resolver service',500,true),
('75000000-0000-0000-0000-000000000011','Unqualified resolver service',600,true),
('75000000-0000-0000-0000-000000000012','Inactive resolver service',700,false);

insert into public.piercer_profiles (id, display_name, active) values
('75000000-0000-0000-0000-000000000020','Resolver Piercer',true),
('75000000-0000-0000-0000-000000000021','Corrupt Override Piercer',true);

insert into public.piercer_service_qualifications (piercer_profile_id, service_id) values
('75000000-0000-0000-0000-000000000020','75000000-0000-0000-0000-000000000010'),
('75000000-0000-0000-0000-000000000020','75000000-0000-0000-0000-000000000012');

-- Keep every weekday open for the deterministic resolver matrix. Individual
-- temporary hours and exceptions below exercise closure and narrowing.
update public.studio_hours
set is_open = true, opens_at = '10:00', closes_at = '20:00';

insert into public.piercer_availability (
  piercer_profile_id, weekday, mode, starts_at, ends_at
) values
('75000000-0000-0000-0000-000000000020',1,'custom','12:00','18:00'),
('75000000-0000-0000-0000-000000000020',2,'studio',null,null),
('75000000-0000-0000-0000-000000000020',4,'custom','12:00','18:00'),
('75000000-0000-0000-0000-000000000020',5,'studio',null,null),
('75000000-0000-0000-0000-000000000020',6,'custom','12:00','18:00'),
('75000000-0000-0000-0000-000000000020',7,'studio',null,null),
('75000000-0000-0000-0000-000000000021',4,'custom','12:00','18:00');

-- September 17-20: explicit temporary states cover unavailable, Studio mode,
-- and Custom mode while completely replacing the recurring weekday state.
insert into public.piercer_temporary_schedules (
  id, piercer_profile_id, starts_on, ends_on, created_by
) values (
  '75000000-0000-0000-0000-000000000030',
  '75000000-0000-0000-0000-000000000020',
  '2026-09-17', '2026-09-20', '75000000-0000-0000-0000-000000000001'
);
insert into public.piercer_temporary_availability (
  schedule_id, weekday, is_available, mode, starts_at, ends_at
)
select '75000000-0000-0000-0000-000000000030', weekday, false, null, null, null
from generate_series(1,7) weekday;
update public.piercer_temporary_availability
set is_available = true, mode = 'studio'
where schedule_id = '75000000-0000-0000-0000-000000000030' and weekday = 6;
update public.piercer_temporary_availability
set is_available = true, mode = 'custom', starts_at = '12:00', ends_at = '18:00'
where schedule_id = '75000000-0000-0000-0000-000000000030' and weekday = 7;

-- A one-day Custom override proves temporary Custom replaces recurring Custom.
insert into public.piercer_temporary_schedules (
  id, piercer_profile_id, starts_on, ends_on, created_by
) values (
  '75000000-0000-0000-0000-000000000031',
  '75000000-0000-0000-0000-000000000020',
  '2026-09-21', '2026-09-21', '75000000-0000-0000-0000-000000000001'
);
insert into public.piercer_temporary_availability (
  schedule_id, weekday, is_available, mode, starts_at, ends_at
)
select '75000000-0000-0000-0000-000000000031', weekday,
  weekday = 1,
  case when weekday = 1 then 'custom' end,
  case when weekday = 1 then '14:00'::time end,
  case when weekday = 1 then '19:00'::time end
from generate_series(1,7) weekday;

-- Temporary Studio Hours narrow recurring and temporary Custom states.
insert into public.studio_temporary_schedules (id, starts_on, ends_on, created_by)
values ('75000000-0000-0000-0000-000000000040','2026-10-01','2026-10-03','75000000-0000-0000-0000-000000000001');
insert into public.studio_temporary_hours (schedule_id, weekday, is_open, opens_at, closes_at)
select '75000000-0000-0000-0000-000000000040', weekday,
  weekday in (4,5,6),
  case when weekday in (4,5,6) then '13:00'::time end,
  case when weekday in (4,5,6) then '17:00'::time end
from generate_series(1,7) weekday;

insert into public.piercer_temporary_schedules (
  id, piercer_profile_id, starts_on, ends_on, created_by
) values (
  '75000000-0000-0000-0000-000000000035',
  '75000000-0000-0000-0000-000000000020',
  '2026-10-02', '2026-10-03', '75000000-0000-0000-0000-000000000001'
);
insert into public.piercer_temporary_availability (
  schedule_id, weekday, is_available, mode, starts_at, ends_at
)
select '75000000-0000-0000-0000-000000000035', weekday,
  weekday in (5,6),
  case when weekday in (5,6) then 'custom' end,
  case when weekday = 5 then '15:00'::time when weekday = 6 then '20:00'::time end,
  case when weekday = 5 then '20:00'::time when weekday = 6 then '21:00'::time end
from generate_series(1,7) weekday;

-- Reduced-hours exceptions constrain both Custom and Studio modes.
insert into public.studio_exceptions (
  id, exception_date, exception_type, opens_at, closes_at, reason
) values
('75000000-0000-0000-0000-000000000050','2026-10-08','reduced_hours','13:00','17:00','Reduced Custom test'),
('75000000-0000-0000-0000-000000000051','2026-10-09','reduced_hours','13:00','17:00','Reduced Studio test'),
('75000000-0000-0000-0000-000000000052','2026-10-15','closed',null,null,'Recurring Custom closure'),
('75000000-0000-0000-0000-000000000053','2026-10-16','closed',null,null,'Recurring Studio closure'),
('75000000-0000-0000-0000-000000000054','2026-10-17','closed',null,null,'Temporary Studio closure'),
('75000000-0000-0000-0000-000000000055','2026-10-18','closed',null,null,'Temporary Custom closure');

insert into public.piercer_temporary_schedules (
  id, piercer_profile_id, starts_on, ends_on, created_by
) values (
  '75000000-0000-0000-0000-000000000036',
  '75000000-0000-0000-0000-000000000020',
  '2026-10-17', '2026-10-18', '75000000-0000-0000-0000-000000000001'
);
insert into public.piercer_temporary_availability (
  schedule_id, weekday, is_available, mode, starts_at, ends_at
)
select '75000000-0000-0000-0000-000000000036', weekday,
  weekday in (6,7),
  case when weekday = 6 then 'studio' when weekday = 7 then 'custom' end,
  case when weekday = 7 then '12:00'::time end,
  case when weekday = 7 then '18:00'::time end
from generate_series(1,7) weekday;

-- A covering parent with no required Thursday child simulates structural
-- corruption. The resolver must retain temporary precedence and fail closed.
insert into public.piercer_temporary_schedules (
  id, piercer_profile_id, starts_on, ends_on, created_by
) values (
  '75000000-0000-0000-0000-000000000037',
  '75000000-0000-0000-0000-000000000021',
  '2026-11-05', '2026-11-05', '75000000-0000-0000-0000-000000000001'
);
insert into public.piercer_temporary_availability (
  schedule_id, weekday, is_available, mode, starts_at, ends_at
)
select '75000000-0000-0000-0000-000000000037', weekday, false, null, null, null
from generate_series(1,7) weekday where weekday <> 4;

-- An expired record remains durable and irrelevant to current-date resolution.
insert into public.piercer_temporary_schedules (
  id, piercer_profile_id, starts_on, ends_on, created_by
) values (
  '75000000-0000-0000-0000-000000000038',
  '75000000-0000-0000-0000-000000000020',
  '2020-01-01', '2020-01-02', '75000000-0000-0000-0000-000000000001'
);
insert into public.piercer_temporary_availability (
  schedule_id, weekday, is_available, mode, starts_at, ends_at
)
select '75000000-0000-0000-0000-000000000038', weekday, false, null, null, null
from generate_series(1,7) weekday;

create temporary table recurring_before as
select * from public.piercer_availability
where piercer_profile_id in (
  '75000000-0000-0000-0000-000000000020',
  '75000000-0000-0000-0000-000000000021'
);
create temporary table temporary_schedules_before as
select * from public.piercer_temporary_schedules
where piercer_profile_id in (
  '75000000-0000-0000-0000-000000000020',
  '75000000-0000-0000-0000-000000000021'
);
create temporary table temporary_availability_before as
select availability.* from public.piercer_temporary_availability availability
join temporary_schedules_before schedule on schedule.id = availability.schedule_id;

-- Recurring states, missing weekday, and temporary precedence/source.
select pg_temp.check_availability('75000000-0000-0000-0000-000000000020','2026-09-14',true,'custom','12:00','18:00','recurring');
select pg_temp.check_availability('75000000-0000-0000-0000-000000000020','2026-09-15',true,'studio','10:00','20:00','recurring');
select pg_temp.check_availability('75000000-0000-0000-0000-000000000020','2026-09-16',false,null,null,null,'recurring');
select pg_temp.check_availability('75000000-0000-0000-0000-000000000020','2026-09-17',false,null,null,null,'temporary');
select pg_temp.check_availability('75000000-0000-0000-0000-000000000020','2026-09-18',false,null,null,null,'temporary');
select pg_temp.check_availability('75000000-0000-0000-0000-000000000020','2026-09-19',true,'studio','10:00','20:00','temporary');
select pg_temp.check_availability('75000000-0000-0000-0000-000000000020','2026-09-20',true,'custom','12:00','18:00','temporary');
select pg_temp.check_availability('75000000-0000-0000-0000-000000000020','2026-09-21',true,'custom','14:00','19:00','temporary');

-- Inclusive endpoints and automatic recurring fallback before/after ranges.
select pg_temp.assert_true(
  (select temporary_schedule_id = '75000000-0000-0000-0000-000000000030'
   from public.get_effective_piercer_availability('75000000-0000-0000-0000-000000000020','2026-09-17')),
  'temporary start date is inclusive'
);
select pg_temp.assert_true(
  (select temporary_schedule_id = '75000000-0000-0000-0000-000000000030'
   from public.get_effective_piercer_availability('75000000-0000-0000-0000-000000000020','2026-09-20')),
  'temporary end date is inclusive'
);
select pg_temp.check_availability('75000000-0000-0000-0000-000000000020','2026-09-10',true,'custom','12:00','18:00','recurring');
select pg_temp.check_availability('75000000-0000-0000-0000-000000000020','2026-09-24',true,'custom','12:00','18:00','recurring');
select pg_temp.assert_true(
  exists (select 1 from public.piercer_temporary_schedules where id = '75000000-0000-0000-0000-000000000038'),
  'expired temporary schedule requires no cleanup'
);

-- Studio layers constrain every selected state without rewriting it.
select pg_temp.check_availability('75000000-0000-0000-0000-000000000020','2026-10-01',true,'custom','13:00','17:00','recurring');
select pg_temp.check_availability('75000000-0000-0000-0000-000000000020','2026-10-02',true,'custom','15:00','17:00','temporary');
select pg_temp.check_availability('75000000-0000-0000-0000-000000000020','2026-10-03',false,'custom',null,null,'temporary');
select pg_temp.check_availability('75000000-0000-0000-0000-000000000020','2026-10-08',true,'custom','13:00','17:00','recurring');
select pg_temp.check_availability('75000000-0000-0000-0000-000000000020','2026-10-09',true,'studio','13:00','17:00','recurring');
select pg_temp.check_availability('75000000-0000-0000-0000-000000000020','2026-10-15',false,'custom',null,null,'recurring');
select pg_temp.check_availability('75000000-0000-0000-0000-000000000020','2026-10-16',false,'studio',null,null,'recurring');
select pg_temp.check_availability('75000000-0000-0000-0000-000000000020','2026-10-17',false,'studio',null,null,'temporary');
select pg_temp.check_availability('75000000-0000-0000-0000-000000000020','2026-10-18',false,'custom',null,null,'temporary');

select pg_temp.assert_true(
  (select studio_source = 'temporary'
     and studio_temporary_schedule_id = '75000000-0000-0000-0000-000000000040'
   from public.get_effective_piercer_availability('75000000-0000-0000-0000-000000000020','2026-10-02')),
  'resolver carries Temporary Studio Hours source context'
);
select pg_temp.assert_true(
  (select studio_source = 'exception'
     and studio_exception_id = '75000000-0000-0000-0000-000000000050'
     and studio_exception_type = 'reduced_hours'
   from public.get_effective_piercer_availability('75000000-0000-0000-0000-000000000020','2026-10-08')),
  'resolver carries Studio Exception source context'
);

-- A malformed covering temporary schedule never exposes recurring fallback.
select pg_temp.check_availability('75000000-0000-0000-0000-000000000021','2026-11-05',false,null,null,null,'temporary');
select pg_temp.assert_true(
  (select temporary_schedule_id = '75000000-0000-0000-0000-000000000037'
   from public.get_effective_piercer_availability('75000000-0000-0000-0000-000000000021','2026-11-05')),
  'corrupted temporary child state fails closed while retaining override identity'
);

-- Assignment consumes the resolver and retains Manila boundaries, active
-- profile checks, service qualification, and selected-service validation.
select pg_temp.assert_true(
  not pg_temp.is_assignable('75000000-0000-0000-0000-000000000020','75000000-0000-0000-0000-000000000010','2026-09-14 11:59:59+08')
  and pg_temp.is_assignable('75000000-0000-0000-0000-000000000020','75000000-0000-0000-0000-000000000010','2026-09-14 12:00+08')
  and not pg_temp.is_assignable('75000000-0000-0000-0000-000000000020','75000000-0000-0000-0000-000000000010','2026-09-14 18:00+08'),
  'recurring Custom assignment keeps opening-inclusive and closing-exclusive boundaries'
);
select pg_temp.assert_true(
  pg_temp.is_assignable('75000000-0000-0000-0000-000000000020','75000000-0000-0000-0000-000000000010','2026-09-15 10:00+08')
  and not pg_temp.is_assignable('75000000-0000-0000-0000-000000000020','75000000-0000-0000-0000-000000000010','2026-09-15 20:00+08'),
  'recurring Studio-mode assignment remains unchanged'
);
select pg_temp.assert_true(
  not pg_temp.is_assignable('75000000-0000-0000-0000-000000000020','75000000-0000-0000-0000-000000000010','2026-09-17 13:00+08'),
  'Temporary Unavailable makes a previously recurring-assignable piercer unavailable'
);
select pg_temp.assert_true(
  pg_temp.is_assignable('75000000-0000-0000-0000-000000000020','75000000-0000-0000-0000-000000000010','2026-09-19 10:00+08'),
  'Temporary Studio mode is assignable during Effective Studio Hours'
);
select pg_temp.assert_true(
  not pg_temp.is_assignable('75000000-0000-0000-0000-000000000020','75000000-0000-0000-0000-000000000010','2026-10-02 14:59:59+08')
  and pg_temp.is_assignable('75000000-0000-0000-0000-000000000020','75000000-0000-0000-0000-000000000010','2026-10-02 15:00+08')
  and not pg_temp.is_assignable('75000000-0000-0000-0000-000000000020','75000000-0000-0000-0000-000000000010','2026-10-02 17:00+08'),
  'Temporary Custom assignment uses its intersected effective interval'
);
select pg_temp.assert_true(
  not pg_temp.is_assignable('75000000-0000-0000-0000-000000000020','75000000-0000-0000-0000-000000000011','2026-09-15 12:00+08'),
  'service qualification remains independent from scheduling'
);
select pg_temp.assert_true(
  not public.piercer_is_assignable('75000000-0000-0000-0000-000000000020','{}'::uuid[],'2026-09-15 12:00+08')
  and not pg_temp.is_assignable('75000000-0000-0000-0000-000000000020','75000000-0000-0000-0000-000000000012','2026-09-15 12:00+08'),
  'empty and inactive selected services remain invalid for assignment'
);
update public.piercer_profiles set active = false
where id = '75000000-0000-0000-0000-000000000020';
select pg_temp.assert_true(
  not pg_temp.is_assignable('75000000-0000-0000-0000-000000000020','75000000-0000-0000-0000-000000000010','2026-09-15 12:00+08'),
  'active-profile requirement remains independent from scheduling'
);
update public.piercer_profiles set active = true
where id = '75000000-0000-0000-0000-000000000020';

-- Resolution is read-only across both persistence layers.
select pg_temp.assert_true(
  not exists (
    (select * from recurring_before except select * from public.piercer_availability
     where piercer_profile_id in ('75000000-0000-0000-0000-000000000020','75000000-0000-0000-0000-000000000021'))
    union all
    (select * from public.piercer_availability
     where piercer_profile_id in ('75000000-0000-0000-0000-000000000020','75000000-0000-0000-0000-000000000021') except select * from recurring_before)
  ),
  'resolution never mutates Recurring Piercer Availability'
);
select pg_temp.assert_true(
  not exists (
    (select * from temporary_schedules_before except select * from public.piercer_temporary_schedules
     where piercer_profile_id in ('75000000-0000-0000-0000-000000000020','75000000-0000-0000-0000-000000000021'))
    union all
    (select * from public.piercer_temporary_schedules
     where piercer_profile_id in ('75000000-0000-0000-0000-000000000020','75000000-0000-0000-0000-000000000021') except select * from temporary_schedules_before)
  )
  and not exists (
    (select * from temporary_availability_before except
     select availability.* from public.piercer_temporary_availability availability
     join temporary_schedules_before schedule on schedule.id = availability.schedule_id)
    union all
    (select availability.* from public.piercer_temporary_availability availability
     join temporary_schedules_before schedule on schedule.id = availability.schedule_id
     except select * from temporary_availability_before)
  ),
  'resolution never mutates Temporary Piercer Schedule persistence'
);

-- Internal predicates are not browser-executable in Phase 7.
select pg_temp.assert_true(
  not has_function_privilege('public', 'public.get_effective_piercer_availability(uuid,date)', 'execute')
  and not has_function_privilege('anon', 'public.get_effective_piercer_availability(uuid,date)', 'execute')
  and not has_function_privilege('authenticated', 'public.get_effective_piercer_availability(uuid,date)', 'execute'),
  'Effective Piercer Availability remains an internal backend primitive'
);

do $$ begin
  begin
    perform * from public.get_effective_piercer_availability(null, '2026-09-14');
    raise exception 'null piercer unexpectedly succeeded';
  exception when invalid_parameter_value then null; end;
  begin
    perform * from public.get_effective_piercer_availability('75000000-0000-0000-0000-000000000020', null);
    raise exception 'null date unexpectedly succeeded';
  exception when invalid_parameter_value then null; end;
end $$;

rollback;
