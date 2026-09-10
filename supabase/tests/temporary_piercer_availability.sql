-- Focused Phase 6 Temporary Piercer Schedule persistence checks.
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

create function pg_temp.complete_availability()
returns jsonb language sql immutable as $$
  select jsonb_agg(
    case
      when weekday = 4 then jsonb_build_object(
        'weekday', weekday, 'is_available', true, 'mode', 'studio',
        'starts_at', null, 'ends_at', null
      )
      when weekday = 5 then jsonb_build_object(
        'weekday', weekday, 'is_available', true, 'mode', 'custom',
        'starts_at', '15:00', 'ends_at', '18:00'
      )
      else jsonb_build_object(
        'weekday', weekday, 'is_available', false, 'mode', null,
        'starts_at', null, 'ends_at', null
      )
    end order by weekday
  )
  from generate_series(1, 7) weekday;
$$;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
('74000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','temporary-piercer-owner@test.local','',now(),'{}','{}',now(),now()),
('74000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','temporary-piercer-staff@test.local','',now(),'{}','{}',now(),now());

insert into public.staff_accounts (id, display_name, role, status) values
('74000000-0000-0000-0000-000000000001','Temporary Piercer Owner','owner','active'),
('74000000-0000-0000-0000-000000000002','Temporary Piercer Staff','staff','active');

insert into public.piercer_profiles (id, display_name, active) values
('74000000-0000-0000-0000-000000000010','Ana',true),
('74000000-0000-0000-0000-000000000011','Bea',true);

insert into public.piercer_availability (
  piercer_profile_id, weekday, mode, starts_at, ends_at
) values
('74000000-0000-0000-0000-000000000010',1,'custom','12:00','18:00'),
('74000000-0000-0000-0000-000000000010',4,'studio',null,null);

create temporary table recurring_before as
select * from public.piercer_availability
where piercer_profile_id = '74000000-0000-0000-0000-000000000010';
grant select on recurring_before to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','74000000-0000-0000-0000-000000000002',true);

-- Staff can read configuration data but cannot call the Owner mutation RPC.
select pg_temp.assert_true(
  (select count(*) = 0 from public.piercer_temporary_schedules),
  'active Staff can read Temporary Piercer Schedule metadata'
);
do $$ begin
  begin
    perform public.configure_temporary_piercer_schedule(
      '74000000-0000-0000-0000-000000000010', '2026-09-17', '2026-09-20',
      pg_temp.complete_availability()
    );
    raise exception 'Staff temporary Piercer configuration unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub','74000000-0000-0000-0000-000000000001',true);

-- Owner atomically creates a complete inclusive schedule.
select public.configure_temporary_piercer_schedule(
  '74000000-0000-0000-0000-000000000010', '2026-09-17', '2026-09-20',
  pg_temp.complete_availability()
) as ana_schedule_id \gset

select pg_temp.assert_true(
  (select starts_on = '2026-09-17' and ends_on = '2026-09-20'
   from public.piercer_temporary_schedules where id = :'ana_schedule_id'),
  'Owner creates an inclusive Temporary Piercer Schedule'
);
select pg_temp.assert_true(
  (select count(*) = 7 and count(distinct weekday) = 7
   from public.piercer_temporary_availability where schedule_id = :'ana_schedule_id'),
  'valid payload stores every weekday exactly once'
);
select pg_temp.assert_true(
  (select not is_available and mode is null and starts_at is null and ends_at is null
   from public.piercer_temporary_availability where schedule_id = :'ana_schedule_id' and weekday = 1),
  'unavailable state stores no mode or times'
);
select pg_temp.assert_true(
  (select is_available and mode = 'studio' and starts_at is null and ends_at is null
   from public.piercer_temporary_availability where schedule_id = :'ana_schedule_id' and weekday = 4),
  'Studio mode stores null explicit times'
);
select pg_temp.assert_true(
  (select is_available and mode = 'custom' and starts_at = '15:00' and ends_at = '18:00'
   from public.piercer_temporary_availability where schedule_id = :'ana_schedule_id' and weekday = 5),
  'Custom mode stores an increasing explicit interval'
);

-- Incomplete, duplicate, reversed, and unknown-piercer inputs fail before commit.
do $$ begin
  begin
    perform public.configure_temporary_piercer_schedule(
      '74000000-0000-0000-0000-000000000010', '2026-10-01', '2026-10-07',
      (select jsonb_agg(value) from jsonb_array_elements(pg_temp.complete_availability()) with ordinality item(value, position) where position < 7)
    );
    raise exception 'missing weekday unexpectedly succeeded';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.configure_temporary_piercer_schedule(
      '74000000-0000-0000-0000-000000000010', '2026-10-01', '2026-10-07',
      (select jsonb_agg(case when position = 7 then jsonb_set(value, '{weekday}', '6') else value end)
       from jsonb_array_elements(pg_temp.complete_availability()) with ordinality item(value, position))
    );
    raise exception 'duplicate weekday unexpectedly succeeded';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.configure_temporary_piercer_schedule(
      '74000000-0000-0000-0000-000000000010', '2026-10-07', '2026-10-01',
      pg_temp.complete_availability()
    );
    raise exception 'reversed range unexpectedly succeeded';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.configure_temporary_piercer_schedule(
      '74000000-0000-0000-0000-000000000099', '2026-10-01', '2026-10-07',
      pg_temp.complete_availability()
    );
    raise exception 'unknown piercer unexpectedly succeeded';
  exception when invalid_parameter_value then null; end;
end $$;

-- The GiST exclusion scopes overlap to one piercer.
do $$ begin
  begin
    perform public.configure_temporary_piercer_schedule(
      '74000000-0000-0000-0000-000000000010', '2026-09-19', '2026-09-22',
      pg_temp.complete_availability()
    );
    raise exception 'same-piercer overlap unexpectedly succeeded';
  exception when exclusion_violation then null; end;
end $$;

select public.configure_temporary_piercer_schedule(
  '74000000-0000-0000-0000-000000000011', '2026-09-17', '2026-09-20',
  pg_temp.complete_availability()
) as bea_schedule_id \gset
select pg_temp.assert_true(
  (select count(*) = 2 from public.piercer_temporary_schedules
   where starts_on = '2026-09-17' and ends_on = '2026-09-20'),
  'different piercers may cover the same dates'
);

-- Database constraints reject every malformed availability representation.
do $$
declare invalid_payload jsonb;
begin
  invalid_payload := jsonb_set(pg_temp.complete_availability(), '{0}',
    '{"weekday":1,"is_available":true,"mode":null,"starts_at":null,"ends_at":null}'::jsonb);
  begin
    perform public.configure_temporary_piercer_schedule(
      '74000000-0000-0000-0000-000000000010', '2026-10-01', '2026-10-07', invalid_payload
    );
    raise exception 'available state without a mode unexpectedly succeeded';
  exception when invalid_parameter_value then null; end;

  invalid_payload := jsonb_set(pg_temp.complete_availability(), '{0}',
    '{"weekday":1,"is_available":false,"mode":"studio","starts_at":null,"ends_at":null}'::jsonb);
  begin
    perform public.configure_temporary_piercer_schedule(
      '74000000-0000-0000-0000-000000000010', '2026-10-01', '2026-10-07', invalid_payload
    );
    raise exception 'unavailable state with mode unexpectedly succeeded';
  exception when check_violation then null; end;

  invalid_payload := jsonb_set(pg_temp.complete_availability(), '{0}',
    '{"weekday":1,"is_available":true,"mode":"studio","starts_at":"10:00","ends_at":"20:00"}'::jsonb);
  begin
    perform public.configure_temporary_piercer_schedule(
      '74000000-0000-0000-0000-000000000010', '2026-10-01', '2026-10-07', invalid_payload
    );
    raise exception 'Studio mode with explicit times unexpectedly succeeded';
  exception when check_violation then null; end;

  invalid_payload := jsonb_set(pg_temp.complete_availability(), '{0}',
    '{"weekday":1,"is_available":true,"mode":"custom","starts_at":null,"ends_at":null}'::jsonb);
  begin
    perform public.configure_temporary_piercer_schedule(
      '74000000-0000-0000-0000-000000000010', '2026-10-01', '2026-10-07', invalid_payload
    );
    raise exception 'Custom mode without times unexpectedly succeeded';
  exception when check_violation then null; end;

  invalid_payload := jsonb_set(pg_temp.complete_availability(), '{0}',
    '{"weekday":1,"is_available":true,"mode":"custom","starts_at":"18:00","ends_at":"12:00"}'::jsonb);
  begin
    perform public.configure_temporary_piercer_schedule(
      '74000000-0000-0000-0000-000000000010', '2026-10-01', '2026-10-07', invalid_payload
    );
    raise exception 'Custom mode with reversed times unexpectedly succeeded';
  exception when check_violation then null; end;
end $$;

select pg_temp.assert_true(
  not exists (
    select 1 from public.piercer_temporary_schedules
    where piercer_profile_id = '74000000-0000-0000-0000-000000000010'
      and starts_on = '2026-10-01'
      and ends_on = '2026-10-07'
  ),
  'an invalid Temporary Piercer state must roll back the parent and all weekdays'
);

-- Replacement keeps the ID, replaces all children, and never touches recurring rows.
select public.configure_temporary_piercer_schedule(
  '74000000-0000-0000-0000-000000000010', '2026-09-23', '2026-09-26',
  (select jsonb_agg(
    jsonb_build_object('weekday', weekday, 'is_available', true, 'mode', 'studio', 'starts_at', null, 'ends_at', null)
    order by weekday
  ) from generate_series(1, 7) weekday),
  :'ana_schedule_id'
) as replaced_schedule_id \gset
select pg_temp.assert_true(:'replaced_schedule_id' = :'ana_schedule_id', 'replacement preserves schedule identity');
select pg_temp.assert_true(
  (select count(*) = 7 and bool_and(is_available and mode = 'studio' and starts_at is null and ends_at is null)
   from public.piercer_temporary_availability where schedule_id = :'ana_schedule_id'),
  'replacement atomically replaces all seven weekday states'
);

create temporary table replacement_before as
select row_to_json(snapshot)::jsonb as value from (
  select schedule.starts_on, schedule.ends_on,
    (select jsonb_agg(to_jsonb(availability) order by availability.weekday)
     from public.piercer_temporary_availability availability
     where availability.schedule_id = schedule.id) as availability
  from public.piercer_temporary_schedules schedule where schedule.id = :'ana_schedule_id'
) snapshot;
grant select on replacement_before to authenticated;

do $$
declare invalid_payload jsonb;
begin
  invalid_payload := jsonb_set(pg_temp.complete_availability(), '{4}',
    '{"weekday":5,"is_available":true,"mode":"custom","starts_at":"18:00","ends_at":"15:00"}'::jsonb);
  begin
    perform public.configure_temporary_piercer_schedule(
      '74000000-0000-0000-0000-000000000010', '2026-09-24', '2026-09-27',
      invalid_payload,
      (select id from public.piercer_temporary_schedules
       where piercer_profile_id = '74000000-0000-0000-0000-000000000010'
         and starts_on = '2026-09-23' and ends_on = '2026-09-26')
    );
    raise exception 'invalid replacement unexpectedly succeeded';
  exception when check_violation then null; end;
end $$;

select pg_temp.assert_true(
  (select value from replacement_before) = (
    select row_to_json(snapshot)::jsonb from (
      select schedule.starts_on, schedule.ends_on,
        (select jsonb_agg(to_jsonb(availability) order by availability.weekday)
         from public.piercer_temporary_availability availability
         where availability.schedule_id = schedule.id) as availability
      from public.piercer_temporary_schedules schedule where schedule.id = :'ana_schedule_id'
    ) snapshot
  ),
  'invalid replacement rolls back metadata and all child rows'
);

do $$ begin
  begin
    perform public.configure_temporary_piercer_schedule(
      '74000000-0000-0000-0000-000000000011', '2026-10-01', '2026-10-07',
      pg_temp.complete_availability(),
      (select id from public.piercer_temporary_schedules
       where piercer_profile_id = '74000000-0000-0000-0000-000000000010'
         and starts_on = '2026-09-23' and ends_on = '2026-09-26')
    );
    raise exception 'cross-piercer replacement unexpectedly succeeded';
  exception when invalid_parameter_value then null; end;
end $$;

select pg_temp.assert_true(
  (select piercer_profile_id = '74000000-0000-0000-0000-000000000010'
   from public.piercer_temporary_schedules where id = :'ana_schedule_id'),
  'replacement target cannot be hijacked across piercers'
);

select pg_temp.assert_true(
  not exists (
    (select * from recurring_before except select * from public.piercer_availability
     where piercer_profile_id = '74000000-0000-0000-0000-000000000010')
    union all
    (select * from public.piercer_availability
     where piercer_profile_id = '74000000-0000-0000-0000-000000000010' except select * from recurring_before)
  ),
  'temporary create and replacement never rewrite Recurring Piercer Availability'
);

-- Expired schedules remain durable; no cleanup/reset operation is needed.
select public.configure_temporary_piercer_schedule(
  '74000000-0000-0000-0000-000000000010', '2020-01-01', '2020-01-02',
  pg_temp.complete_availability()
) as expired_schedule_id \gset
select pg_temp.assert_true(
  exists (select 1 from public.piercer_temporary_schedules where id = :'expired_schedule_id')
  and (select count(*) = 7 from public.piercer_temporary_availability where schedule_id = :'expired_schedule_id'),
  'expired schedules remain stored without cleanup jobs'
);

reset role;
rollback;
