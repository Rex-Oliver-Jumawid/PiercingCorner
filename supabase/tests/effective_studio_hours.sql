-- Deterministic Phase 3 coverage; all fixtures and deliberate corruption roll back.
begin;
create function pg_temp.check_hours(day date, expected_open boolean, opening time, closing time, expected_source text)
returns void language plpgsql as $$
declare actual record;
begin
  select * into strict actual from public.get_effective_studio_hours(day);
  if actual.schedule_date is distinct from day
    or actual.weekday is distinct from extract(isodow from day)::smallint
    or actual.is_open is distinct from expected_open
    or actual.opens_at is distinct from opening or actual.closes_at is distinct from closing
    or actual.source is distinct from expected_source then
    raise exception 'Unexpected effective hours for %: %', day, row_to_json(actual);
  end if;
end $$;
create function pg_temp.assert_true(condition boolean, message text)
returns void language plpgsql as $$ begin
  if condition is distinct from true then raise exception 'assertion failed: %', message; end if;
end $$;

insert into auth.users (id, email) values ('71000000-0000-0000-0000-000000000001', 'effective-owner@test.local');
insert into public.staff_accounts (id, display_name, role, status)
values ('71000000-0000-0000-0000-000000000001', 'Effective Owner', 'owner', 'active');
insert into public.services (id, name, price) values
('71000000-0000-0000-0000-000000000020', 'Effective qualified', 500),
('71000000-0000-0000-0000-000000000021', 'Effective unqualified', 500);
insert into public.piercer_profiles (id, display_name)
values ('71000000-0000-0000-0000-000000000040', 'Effective Piercer');
insert into public.piercer_service_qualifications (piercer_profile_id, service_id)
values ('71000000-0000-0000-0000-000000000040', '71000000-0000-0000-0000-000000000020');
insert into public.piercer_availability (piercer_profile_id, weekday, starts_at, ends_at)
select '71000000-0000-0000-0000-000000000040', day, '10:00', '20:00' from generate_series(1,6) day;
create temporary table recurring_before as select jsonb_agg(to_jsonb(h) order by weekday) value from public.studio_hours h;
create temporary table availability_before as select jsonb_agg(to_jsonb(a) order by weekday) value from public.piercer_availability a;

create function pg_temp.assignable(moment timestamptz)
returns boolean language sql as $$
select public.piercer_is_assignable('71000000-0000-0000-0000-000000000040',
array['71000000-0000-0000-0000-000000000020']::uuid[], moment);
$$;
select pg_temp.check_hours('2026-09-14', true, '10:00', '20:00', 'recurring');
select pg_temp.check_hours('2026-09-13', false, null, null, 'recurring');
select pg_temp.assert_true(pg_temp.assignable('2026-09-14 10:00+08'), 'recurring opening inclusive');
select pg_temp.assert_true(not pg_temp.assignable('2026-09-14 20:00+08'), 'recurring closing exclusive');

set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-0000-0000-000000000001',true);
select public.configure_temporary_studio_schedule('2026-09-17', '2026-09-20', (
  select jsonb_agg(jsonb_build_object('weekday', day, 'is_open', day <> 5,
    'opens_at', case when day <> 5 then '12:00' end,
    'closes_at', case when day <> 5 then '18:00' end)) from generate_series(1,7) day
));
select pg_temp.check_hours('2026-09-16', true, '10:00', '20:00', 'recurring');
select pg_temp.check_hours('2026-09-17', true, '12:00', '18:00', 'temporary');
select pg_temp.check_hours('2026-09-18', false, null, null, 'temporary');
select pg_temp.check_hours('2026-09-19', true, '12:00', '18:00', 'temporary');
-- Inclusive end also proves a temporary schedule can open a recurring closed Sunday.
select pg_temp.check_hours('2026-09-20', true, '12:00', '18:00', 'temporary');
select pg_temp.check_hours('2026-09-21', true, '10:00', '20:00', 'recurring');
select pg_temp.check_hours('2027-09-17', true, '10:00', '20:00', 'recurring');
select pg_temp.assert_true((select count(*) = 1 from public.studio_temporary_schedules), 'expired schedule remains stored');

-- Calendar arithmetic remains date-based across leap-day/month and
-- Sunday-to-Monday/year boundaries.
select public.configure_temporary_studio_schedule('2028-02-29', '2028-02-29', (
  select jsonb_agg(jsonb_build_object(
    'weekday', day, 'is_open', true, 'opens_at', '11:00', 'closes_at', '17:00'
  ) order by day) from generate_series(1,7) day
));
select public.configure_temporary_studio_schedule('2028-12-31', '2029-01-01', (
  select jsonb_agg(jsonb_build_object(
    'weekday', day, 'is_open', true, 'opens_at', '09:00', 'closes_at', '16:00'
  ) order by day) from generate_series(1,7) day
));
select pg_temp.check_hours('2028-02-28', true, '10:00', '20:00', 'recurring');
select pg_temp.check_hours('2028-02-29', true, '11:00', '17:00', 'temporary');
select pg_temp.check_hours('2028-03-01', true, '10:00', '20:00', 'recurring');
select pg_temp.check_hours('2028-12-30', true, '10:00', '20:00', 'recurring');
select pg_temp.check_hours('2028-12-31', true, '09:00', '16:00', 'temporary');
select pg_temp.check_hours('2029-01-01', true, '09:00', '16:00', 'temporary');
select pg_temp.check_hours('2029-01-02', true, '10:00', '20:00', 'recurring');
reset role;
select pg_temp.assert_true(not pg_temp.assignable('2026-09-17 11:00+08'), 'temporary restricts recurring piercer');
select pg_temp.assert_true(pg_temp.assignable('2026-09-17 12:00+08'), 'temporary opening inclusive');
select pg_temp.assert_true(not pg_temp.assignable('2026-09-17 18:00+08'), 'temporary closing exclusive');
select pg_temp.assert_true(not pg_temp.assignable('2026-09-18 13:00+08'), 'temporary closed day');
select pg_temp.assert_true(not pg_temp.assignable('2026-09-20 13:00+08'), 'temporary opening does not invent piercer availability');
select pg_temp.assert_true(not public.piercer_is_assignable('71000000-0000-0000-0000-000000000040',
array['71000000-0000-0000-0000-000000000021']::uuid[], '2026-09-17 13:00+08'), 'qualification unchanged');
update public.piercer_profiles set active = false where id = '71000000-0000-0000-0000-000000000040';
select pg_temp.assert_true(not pg_temp.assignable('2026-09-17 13:00+08'), 'inactive piercer');
update public.piercer_profiles set active = true where id = '71000000-0000-0000-0000-000000000040';

set local role authenticated;
insert into public.studio_exceptions (exception_date, exception_type, reason) values
('2026-09-14', 'closed', 'Recurring closure'), ('2026-09-17', 'closed', 'Temporary closure');
select pg_temp.check_hours('2026-09-14', false, null, null, 'exception');
select pg_temp.check_hours('2026-09-17', false, null, null, 'exception');
reset role;
select pg_temp.assert_true(not pg_temp.assignable('2026-09-17 13:00+08'), 'closure overrides assignment');
set local role authenticated;
update public.studio_exceptions set exception_type = 'reduced_hours', opens_at = '12:00', closes_at = '18:00'
where exception_date = '2026-09-14';
update public.studio_exceptions set exception_type = 'reduced_hours', opens_at = '13:00', closes_at = '17:00'
where exception_date = '2026-09-17';
select pg_temp.check_hours('2026-09-14', true, '12:00', '18:00', 'exception');
select pg_temp.check_hours('2026-09-17', true, '13:00', '17:00', 'exception');
select pg_temp.assert_true((select exception_id is not null and temporary_schedule_id is not null
  and exception_type = 'reduced_hours' from public.get_effective_studio_hours('2026-09-17')), 'diagnostic IDs and type');
do $$ begin
  begin
    update public.studio_exceptions set opens_at = '10:00', closes_at = '19:00' where exception_date = '2026-09-17';
    raise exception 'out-of-base exception accepted';
  exception when check_violation then null; end;
  begin
    insert into public.studio_exceptions (exception_date, exception_type, opens_at, closes_at, reason)
    values ('2026-09-18', 'reduced_hours', '12:00', '18:00', 'Cannot reopen temporary closure');
    raise exception 'closed temporary day reopened';
  exception when check_violation then null; end;
  begin
    insert into public.studio_exceptions (exception_date, exception_type, opens_at, closes_at, reason)
    values ('2026-09-13', 'reduced_hours', '12:00', '18:00', 'Cannot reopen recurring closure');
    raise exception 'closed recurring day reopened';
  exception when check_violation then null; end;
end $$;
reset role;
select pg_temp.assert_true(pg_temp.assignable('2026-09-17 13:00+08'), 'reduced opening inclusive');
select pg_temp.assert_true(not pg_temp.assignable('2026-09-17 12:00+08'), 'reduced hours constrain temporary');
select pg_temp.assert_true(not pg_temp.assignable('2026-09-17 17:00+08'), 'reduced closing exclusive');
select pg_temp.assert_true((select value from recurring_before) = (select jsonb_agg(to_jsonb(h) order by weekday) from public.studio_hours h), 'recurring hours unchanged');
select pg_temp.assert_true((select value from availability_before) = (select jsonb_agg(to_jsonb(a) order by weekday) from public.piercer_availability a), 'recurring availability unchanged');

-- A later configuration change can invalidate an existing exception: fail closed.
update public.studio_temporary_hours set opens_at = '14:00' where weekday = 4;
select pg_temp.check_hours('2026-09-17', false, null, null, 'exception');
select pg_temp.assert_true(not pg_temp.assignable('2026-09-17 15:00+08'), 'invalidated exception fails closed');
-- Deliberate privileged structural corruption must never fall back through a temporary day.
delete from public.studio_temporary_hours where weekday = 6;
select pg_temp.check_hours('2026-09-19', false, null, null, 'temporary');
delete from public.studio_hours where weekday = 2;
select pg_temp.check_hours('2026-09-22', false, null, null, 'recurring');
do $$ begin
  begin perform public.get_effective_studio_hours(null); raise exception 'null accepted';
  exception when invalid_parameter_value then null; end;
  begin perform public.get_effective_studio_hours('infinity'); raise exception 'infinity accepted';
  exception when invalid_parameter_value then null; end;
end $$;

-- UTC Sunday is already Manila Monday; a non-Manila session timezone must not leak in.
update public.studio_hours set opens_at = '00:00' where weekday = 1;
update public.piercer_availability set starts_at = '00:00' where weekday = 1;
set local timezone = 'America/Los_Angeles';
select pg_temp.assert_true(not pg_temp.assignable('2026-09-20 15:59:59+00'), 'Manila Sunday still unavailable');
select pg_temp.assert_true(pg_temp.assignable('2026-09-20 16:00:00+00'), 'Manila Monday boundary and recurring resume');

-- Direct RPC reads retain table RLS and do not expose configuration to inactive accounts.
update public.staff_accounts set role = 'staff' where id = '71000000-0000-0000-0000-000000000001';
set local role authenticated;
select pg_temp.check_hours('2026-09-20', true, '12:00', '18:00', 'temporary');
reset role;
update public.staff_accounts set status = 'inactive' where id = '71000000-0000-0000-0000-000000000001';
set local role authenticated;
select pg_temp.check_hours('2026-09-17', false, null, null, 'recurring');
select pg_temp.assert_true((select temporary_schedule_id is null and exception_id is null from public.get_effective_studio_hours('2026-09-17')), 'RLS hides diagnostic IDs');
reset role;
select pg_temp.assert_true(not has_function_privilege('anon', 'public.get_effective_studio_hours(date)', 'EXECUTE'), 'anonymous resolver denied');
select pg_temp.assert_true(not has_function_privilege('authenticated', 'public.piercer_is_assignable(uuid,uuid[],timestamptz)', 'EXECUTE'), 'unchecked assignment predicate stays private');
rollback;
