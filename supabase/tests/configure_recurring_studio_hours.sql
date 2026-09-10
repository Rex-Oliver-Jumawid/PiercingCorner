begin;

create function pg_temp.assert_true(condition boolean, message text)
returns void language plpgsql as $$
begin
  if not condition then raise exception 'assertion failed: %', message; end if;
end;
$$;

create function pg_temp.recurring_hours(
  all_closed boolean default false,
  start_time time default '09:00',
  end_time time default '21:00'
)
returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object(
    'weekday', day,
    'is_open', not all_closed and day between 1 and 6,
    'opens_at', case when not all_closed and day between 1 and 6 then start_time end,
    'closes_at', case when not all_closed and day between 1 and 6 then end_time end
  ) order by day)
  from generate_series(1, 7) day;
$$;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
('72000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','recurring-owner@test.local','',now(),'{}','{}',now(),now()),
('72000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','recurring-staff@test.local','',now(),'{}','{}',now(),now());

insert into public.staff_accounts (id, display_name, role, status) values
('72000000-0000-0000-0000-000000000001','Recurring Owner','owner','active'),
('72000000-0000-0000-0000-000000000002','Recurring Staff','staff','active');

insert into public.studio_temporary_schedules (id, starts_on, ends_on, created_by)
values ('72000000-0000-0000-0000-000000000010','2027-02-01','2027-02-07','72000000-0000-0000-0000-000000000001');
insert into public.studio_temporary_hours (schedule_id, weekday,is_open,opens_at,closes_at)
select '72000000-0000-0000-0000-000000000010', day, false, null, null
from generate_series(1, 7) day;
insert into public.studio_exceptions (id, exception_date, exception_type, reason)
values ('72000000-0000-0000-0000-000000000011','2027-03-01','closed','RPC preservation check');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','72000000-0000-0000-0000-000000000001',true);

select public.configure_recurring_studio_hours(pg_temp.recurring_hours());
select pg_temp.assert_true(
  (select count(*) = 7 from public.studio_hours),
  'Owner configuration must retain exactly seven recurring weekdays'
);
select pg_temp.assert_true(
  (select count(*) = 6 from public.studio_hours where is_open and opens_at = '09:00' and closes_at = '21:00'),
  'Owner must configure all selected recurring weekdays'
);
select pg_temp.assert_true(
  (select not is_open and opens_at is null and closes_at is null from public.studio_hours where weekday = 7),
  'Unselected recurring weekdays must persist explicitly closed'
);

create temporary table recurring_before_failure as
select jsonb_agg(to_jsonb(hours) order by hours.weekday) value from public.studio_hours hours;

do $$ begin
  begin
    perform public.configure_recurring_studio_hours(
      (select jsonb_agg(day) from jsonb_array_elements(pg_temp.recurring_hours()) day where (day ->> 'weekday')::int < 7)
    );
    raise exception 'incomplete recurring schedule unexpectedly succeeded';
  exception when invalid_parameter_value then null;
  end;
end $$;

do $$ begin
  begin
    perform public.configure_recurring_studio_hours(
      (select jsonb_agg(case when (day ->> 'weekday')::int = 7 then jsonb_set(day, '{weekday}', '6') else day end)
       from jsonb_array_elements(pg_temp.recurring_hours()) day)
    );
    raise exception 'duplicate recurring weekday unexpectedly succeeded';
  exception when invalid_parameter_value then null;
  end;
end $$;

do $$ begin
  begin
    perform public.configure_recurring_studio_hours(pg_temp.recurring_hours(false, '18:00', '10:00'));
    raise exception 'invalid recurring time range unexpectedly succeeded';
  exception when invalid_parameter_value then null;
  end;
end $$;

select pg_temp.assert_true(
  (select value from recurring_before_failure) =
  (select jsonb_agg(to_jsonb(hours) order by hours.weekday) from public.studio_hours hours),
  'Invalid recurring input must leave every weekday unchanged'
);

select public.configure_recurring_studio_hours(pg_temp.recurring_hours(true));
select pg_temp.assert_true(
  (select count(*) = 7 from public.studio_hours where not is_open and opens_at is null and closes_at is null),
  'An all-closed recurring schedule must be valid'
);
select public.configure_recurring_studio_hours(pg_temp.recurring_hours(false, '10:00', '20:00'));

reset role;
insert into public.piercer_profiles (id, display_name, active)
values ('72000000-0000-0000-0000-000000000020','Conflict Piercer',true);
insert into public.piercer_availability (piercer_profile_id, weekday, starts_at, ends_at)
values ('72000000-0000-0000-0000-000000000020',3,'11:00','17:00');
create temporary table recurring_before_conflict as
select jsonb_agg(to_jsonb(hours) order by hours.weekday) value from public.studio_hours hours;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','72000000-0000-0000-0000-000000000001',true);
do $$ declare payload jsonb; begin
  select jsonb_agg(
    case when (day ->> 'weekday')::int = 3
      then jsonb_build_object('weekday',3,'is_open',false,'opens_at',null,'closes_at',null)
      when (day ->> 'is_open')::boolean
      then jsonb_set(jsonb_set(day, '{opens_at}', '"12:00"'), '{closes_at}', '"18:00"')
      else day
    end order by (day ->> 'weekday')::int
  ) into payload from jsonb_array_elements(pg_temp.recurring_hours(false, '10:00', '20:00')) day;
  begin
    perform public.configure_recurring_studio_hours(payload);
    raise exception 'conflicting recurring configuration unexpectedly succeeded';
  exception when check_violation then null;
  end;
end $$;

reset role;
select pg_temp.assert_true(
  (select value from recurring_before_conflict) =
  (select jsonb_agg(to_jsonb(hours) order by hours.weekday) from public.studio_hours hours),
  'One Piercer Availability conflict must roll back the complete recurring configuration'
);
select pg_temp.assert_true(
  (select count(*) = 1 from public.studio_temporary_schedules where id = '72000000-0000-0000-0000-000000000010')
  and (select count(*) = 7 from public.studio_temporary_hours where schedule_id = '72000000-0000-0000-0000-000000000010'),
  'Recurring configuration must leave Temporary Studio Schedules unchanged'
);
select pg_temp.assert_true(
  (select count(*) = 1 from public.studio_exceptions where id = '72000000-0000-0000-0000-000000000011'),
  'Recurring configuration must leave Studio Exceptions unchanged'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','72000000-0000-0000-0000-000000000002',true);
do $$ begin
  begin
    perform public.configure_recurring_studio_hours(pg_temp.recurring_hours());
    raise exception 'Staff recurring Studio configuration unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
rollback;
