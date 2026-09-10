begin;

create function pg_temp.assert_true(condition boolean, message text)
returns void language plpgsql as $$ begin if not condition then raise exception 'assertion failed: %', message; end if; end; $$;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
('70000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','studio-owner@test.local','',now(),'{}','{}',now(),now()),
('70000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','studio-staff@test.local','',now(),'{}','{}',now(),now());
insert into public.staff_accounts (id,display_name,role,status) values
('70000000-0000-0000-0000-000000000001','Studio Owner','owner','active'),
('70000000-0000-0000-0000-000000000002','Studio Staff','staff','active');
insert into public.clients (id,full_name,created_by) values
('70000000-0000-0000-0000-000000000010','Studio Client','70000000-0000-0000-0000-000000000001');
insert into public.services (id,name,price,active) values
('70000000-0000-0000-0000-000000000020','Qualified Service',500,true),
('70000000-0000-0000-0000-000000000021','Unqualified Service',600,true);
insert into public.stations (id,name,active) values ('70000000-0000-0000-0000-000000000030','Studio Station',true);
insert into public.piercer_profiles (id,display_name,active,default_station_id) values
('70000000-0000-0000-0000-000000000040','Qualified Piercer',true,'70000000-0000-0000-0000-000000000030');
insert into public.piercer_service_qualifications (piercer_profile_id,service_id) values
('70000000-0000-0000-0000-000000000040','70000000-0000-0000-0000-000000000020');

create temporary table recurring_studio_hours_before as
select jsonb_agg(to_jsonb(hours) order by hours.weekday) as value
from public.studio_hours hours;

create function pg_temp.temporary_studio_hours(all_closed boolean default false, invalid_range boolean default false)
returns jsonb language sql as $$
  select jsonb_agg(
    jsonb_build_object(
      'weekday', day,
      'is_open', not all_closed and day between 1 and 6,
      'opens_at', case when not all_closed and day between 1 and 6 then '12:00' else null end,
      'closes_at', case
        when invalid_range and day = 3 then '11:00'
        when not all_closed and day between 1 and 6 then '18:00'
        else null
      end
    ) order by day
  )
  from generate_series(1, 7) day;
$$;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','70000000-0000-0000-0000-000000000001',true);

select set_config(
  'test.temporary_schedule_id',
  public.configure_temporary_studio_schedule(
    schedule_starts_on => '2026-09-17',
    schedule_ends_on => '2026-09-20',
    daily_hours => pg_temp.temporary_studio_hours()
  )::text,
  true
);
select pg_temp.assert_true(
  (select count(*) = 1 from public.studio_temporary_schedules where starts_on = '2026-09-17' and ends_on = '2026-09-20'),
  'Owner must create a valid temporary Studio schedule'
);
select pg_temp.assert_true(
  (select count(*) = 7 from public.studio_temporary_hours where schedule_id = current_setting('test.temporary_schedule_id')::uuid),
  'Temporary Studio schedules must persist all seven weekdays'
);

select public.configure_temporary_studio_schedule(
  schedule_starts_on => '2026-10-01',
  schedule_ends_on => '2026-10-07',
  daily_hours => pg_temp.temporary_studio_hours(true)
);
select pg_temp.assert_true(
  (select count(*) = 7
   from public.studio_temporary_hours hour
   join public.studio_temporary_schedules schedule on schedule.id = hour.schedule_id
   where schedule.starts_on = '2026-10-01'
     and not hour.is_open and hour.opens_at is null and hour.closes_at is null),
  'An all-closed temporary Studio schedule must be valid and unambiguous'
);

do $$ begin
  begin
    perform public.configure_temporary_studio_schedule(
      schedule_starts_on => '2026-11-02',
      schedule_ends_on => '2026-11-01',
      daily_hours => pg_temp.temporary_studio_hours()
    );
    raise exception 'invalid temporary Studio date range unexpectedly succeeded';
  exception when invalid_parameter_value then null;
  end;
end $$;

do $$ begin
  begin
    perform public.configure_temporary_studio_schedule(
      schedule_starts_on => '2026-09-20',
      schedule_ends_on => '2026-09-22',
      daily_hours => pg_temp.temporary_studio_hours()
    );
    raise exception 'overlapping temporary Studio schedule unexpectedly succeeded';
  exception when exclusion_violation then null;
  end;
end $$;

do $$ begin
  begin
    perform public.configure_temporary_studio_schedule(
      schedule_starts_on => '2026-09-18',
      schedule_ends_on => '2026-09-22',
      daily_hours => pg_temp.temporary_studio_hours(false, true),
      target_schedule_id => current_setting('test.temporary_schedule_id')::uuid
    );
    raise exception 'invalid temporary Studio hours unexpectedly succeeded';
  exception when check_violation then null;
  end;
end $$;
select pg_temp.assert_true(
  (select starts_on = '2026-09-17' and ends_on = '2026-09-20'
   from public.studio_temporary_schedules
   where id = current_setting('test.temporary_schedule_id')::uuid),
  'Failed replacement must roll back temporary schedule metadata'
);
select pg_temp.assert_true(
  (select count(*) = 7 from public.studio_temporary_hours where schedule_id = current_setting('test.temporary_schedule_id')::uuid),
  'Failed replacement must roll back temporary weekday replacement'
);

reset role;
select pg_temp.assert_true(
  (select value from recurring_studio_hours_before) =
  (select jsonb_agg(to_jsonb(hours) order by hours.weekday) from public.studio_hours hours),
  'Temporary Studio configuration must not mutate recurring studio_hours'
);

update public.studio_hours set is_open = true, opens_at = '00:00', closes_at = '23:59:59'
where weekday = extract(isodow from clock_timestamp() at time zone 'Asia/Manila');
insert into public.piercer_availability (piercer_profile_id,weekday,starts_at,ends_at) values
('70000000-0000-0000-0000-000000000040',extract(isodow from clock_timestamp() at time zone 'Asia/Manila'),'00:00','23:59:59');

select pg_temp.assert_true(public.piercer_is_assignable(
  '70000000-0000-0000-0000-000000000040',
  array['70000000-0000-0000-0000-000000000020']::uuid[], clock_timestamp()
), 'qualified available piercer must be assignable');
select pg_temp.assert_true(not public.piercer_is_assignable(
  '70000000-0000-0000-0000-000000000040',
  array['70000000-0000-0000-0000-000000000021']::uuid[], clock_timestamp()
), 'unqualified service must make the piercer unavailable');

insert into public.studio_exceptions (exception_date,exception_type,reason)
values ((clock_timestamp() at time zone 'Asia/Manila')::date,'closed','Test closure');
select pg_temp.assert_true(not public.piercer_is_assignable(
  '70000000-0000-0000-0000-000000000040',
  array['70000000-0000-0000-0000-000000000020']::uuid[], clock_timestamp()
), 'all-day exception must override availability');
delete from public.studio_exceptions where reason = 'Test closure';

do $$ begin
  begin
    update public.studio_hours set closes_at = '12:00'
    where weekday = extract(isodow from clock_timestamp() at time zone 'Asia/Manila');
    raise exception 'conflicting Studio Hours unexpectedly succeeded';
  exception when check_violation then null;
  end;
end $$;

insert into public.transactions (id,reference_code,client_id,status,created_by,piercer_profile_id,station_id) values
('70000000-0000-0000-0000-000000000050','TXN-STUDIO','70000000-0000-0000-0000-000000000010','pending','70000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000040','70000000-0000-0000-0000-000000000030');
insert into public.transaction_items (transaction_id,item_type,service_id,item_name_snapshot,unit_price_snapshot,quantity) values
('70000000-0000-0000-0000-000000000050','service','70000000-0000-0000-0000-000000000020','Qualified Service',500,1);
do $$ begin
  begin
    insert into public.transaction_items (transaction_id,item_type,service_id,item_name_snapshot,unit_price_snapshot,quantity) values
    ('70000000-0000-0000-0000-000000000050','service','70000000-0000-0000-0000-000000000021','Unqualified Service',600,1);
    raise exception 'unqualified transaction service unexpectedly succeeded';
  exception when check_violation then null;
  end;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','70000000-0000-0000-0000-000000000002',true);
select pg_temp.assert_true((select count(*) = 1 from public.get_assignable_piercers(array['70000000-0000-0000-0000-000000000020']::uuid[])), 'Staff must receive the checked assignable profile');
select pg_temp.assert_true((select count(*) = 2 from public.studio_temporary_schedules), 'Active Staff may read temporary Studio schedules');
do $$ begin
  begin
    perform public.configure_temporary_studio_schedule(
      schedule_starts_on => '2026-12-01',
      schedule_ends_on => '2026-12-07',
      daily_hours => pg_temp.temporary_studio_hours()
    );
    raise exception 'Staff temporary Studio mutation unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;
do $$ declare changed_count integer; begin
  update public.studio_hours set is_open = false, opens_at = null, closes_at = null where weekday = 1;
  get diagnostics changed_count = row_count;
  perform pg_temp.assert_true(changed_count = 0, 'Staff must not change Studio Hours');
end $$;

reset role;
rollback;
