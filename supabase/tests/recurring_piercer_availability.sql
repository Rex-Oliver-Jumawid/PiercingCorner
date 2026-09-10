-- Focused Phase 5 Recurring Piercer Availability mode and assignment checks.
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

create function pg_temp.is_assignable(piercer_id uuid, service_id uuid, moment timestamptz)
returns boolean language sql as $$
  select public.piercer_is_assignable(piercer_id, array[service_id], moment);
$$;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
('73000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','availability-owner@test.local','',now(),'{}','{}',now(),now()),
('73000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','availability-staff@test.local','',now(),'{}','{}',now(),now());

insert into public.staff_accounts (id, display_name, role, status) values
('73000000-0000-0000-0000-000000000001','Availability Owner','owner','active'),
('73000000-0000-0000-0000-000000000002','Availability Staff','staff','active');

insert into public.services (id, name, price, active) values
('73000000-0000-0000-0000-000000000010','Qualified availability service',500,true),
('73000000-0000-0000-0000-000000000011','Unqualified availability service',600,true);

insert into public.piercer_profiles (id, display_name, active) values
('73000000-0000-0000-0000-000000000020','Mode Piercer',true),
('73000000-0000-0000-0000-000000000021','Constraint Piercer',true),
('73000000-0000-0000-0000-000000000022','Staff Target Piercer',true);

insert into public.piercer_service_qualifications (piercer_profile_id, service_id)
values ('73000000-0000-0000-0000-000000000020','73000000-0000-0000-0000-000000000010');

-- Omitting the newly added mode reproduces a pre-Phase-5 explicit row: the
-- migration default preserves it as custom with the exact stored interval.
insert into public.piercer_availability (piercer_profile_id, weekday, starts_at, ends_at)
values ('73000000-0000-0000-0000-000000000020',1,'12:00','18:00');
select pg_temp.assert_true(
  (select mode = 'custom' and starts_at = '12:00' and ends_at = '18:00'
   from public.piercer_availability
   where piercer_profile_id = '73000000-0000-0000-0000-000000000020' and weekday = 1),
  'existing explicit availability remains custom with unchanged times'
);

-- Database constraints own the mode/time representation invariant.
do $$ begin
  begin
    insert into public.piercer_availability (piercer_profile_id, weekday, mode, starts_at, ends_at)
    values ('73000000-0000-0000-0000-000000000021',1,'custom',null,null);
    raise exception 'custom availability without times unexpectedly succeeded';
  exception when check_violation then null; end;
  begin
    insert into public.piercer_availability (piercer_profile_id, weekday, mode, starts_at, ends_at)
    values ('73000000-0000-0000-0000-000000000021',1,'custom','18:00','12:00');
    raise exception 'custom availability with an invalid interval unexpectedly succeeded';
  exception when check_violation then null; end;
  begin
    insert into public.piercer_availability (piercer_profile_id, weekday, mode, starts_at, ends_at)
    values ('73000000-0000-0000-0000-000000000021',1,'studio','10:00','20:00');
    raise exception 'studio availability with copied times unexpectedly succeeded';
  exception when check_violation then null; end;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','73000000-0000-0000-0000-000000000001',true);

-- Owners can persist both recurring modes. Studio mode stores no times.
insert into public.piercer_availability (piercer_profile_id, weekday, mode, starts_at, ends_at) values
('73000000-0000-0000-0000-000000000020',2,'studio',null,null),
('73000000-0000-0000-0000-000000000020',4,'custom','11:00','17:00');
select pg_temp.assert_true(
  (select mode = 'studio' and starts_at is null and ends_at is null
   from public.piercer_availability
   where piercer_profile_id = '73000000-0000-0000-0000-000000000020' and weekday = 2),
  'Owner persists studio mode without explicit times'
);

do $$ begin
  begin
    insert into public.piercer_availability (piercer_profile_id, weekday, mode, starts_at, ends_at)
    values ('73000000-0000-0000-0000-000000000021',7,'custom','10:00','12:00');
    raise exception 'custom hours outside recurring Studio Hours unexpectedly succeeded';
  exception when check_violation then null; end;
end $$;

-- A studio-mode row follows recurring changes and does not block them.
update public.studio_hours
set is_open = true, opens_at = '11:00', closes_at = '19:00'
where weekday = 2;
select pg_temp.assert_true(
  (select mode = 'studio' and starts_at is null and ends_at is null
   from public.piercer_availability
   where piercer_profile_id = '73000000-0000-0000-0000-000000000020' and weekday = 2),
  'recurring Studio changes preserve studio-mode availability'
);

-- Custom rows retain the existing recurring Studio conflict protection.
do $$ begin
  begin
    update public.studio_hours set opens_at = '13:00' where weekday = 1;
    raise exception 'Studio Hours conflicting with custom availability unexpectedly succeeded';
  exception when check_violation then null; end;
end $$;

reset role;

-- Missing Wednesday row continues to mean unavailable.
select pg_temp.assert_true(
  not pg_temp.is_assignable('73000000-0000-0000-0000-000000000020','73000000-0000-0000-0000-000000000010','2026-09-16 13:00+08'),
  'missing recurring weekday remains unavailable'
);

-- Custom assignment remains bounded by both its explicit interval and the
-- effective Studio interval, with opening inclusive and closing exclusive.
select pg_temp.assert_true(
  not pg_temp.is_assignable('73000000-0000-0000-0000-000000000020','73000000-0000-0000-0000-000000000010','2026-09-14 11:59:59+08'),
  'custom availability rejects time before its opening'
);
select pg_temp.assert_true(
  pg_temp.is_assignable('73000000-0000-0000-0000-000000000020','73000000-0000-0000-0000-000000000010','2026-09-14 12:00+08'),
  'custom availability opening remains inclusive'
);
select pg_temp.assert_true(
  not pg_temp.is_assignable('73000000-0000-0000-0000-000000000020','73000000-0000-0000-0000-000000000010','2026-09-14 18:00+08'),
  'custom availability closing remains exclusive'
);

-- Studio mode follows the current effective recurring window.
select pg_temp.assert_true(
  not pg_temp.is_assignable('73000000-0000-0000-0000-000000000020','73000000-0000-0000-0000-000000000010','2026-09-15 10:59:59+08'),
  'studio mode follows changed recurring opening'
);
select pg_temp.assert_true(
  pg_temp.is_assignable('73000000-0000-0000-0000-000000000020','73000000-0000-0000-0000-000000000010','2026-09-15 11:00+08'),
  'studio mode follows changed recurring interval'
);

-- Qualification remains independent from scheduling mode.
select pg_temp.assert_true(
  not pg_temp.is_assignable('73000000-0000-0000-0000-000000000020','73000000-0000-0000-0000-000000000011','2026-09-15 12:00+08'),
  'studio mode does not bypass service qualification'
);
update public.piercer_profiles set active = false where id = '73000000-0000-0000-0000-000000000020';
select pg_temp.assert_true(
  not pg_temp.is_assignable('73000000-0000-0000-0000-000000000020','73000000-0000-0000-0000-000000000010','2026-09-15 12:00+08'),
  'studio mode does not bypass active profile status'
);
update public.piercer_profiles set active = true where id = '73000000-0000-0000-0000-000000000020';

-- Temporary Studio Hours constrain studio mode dynamically without rewriting
-- the recurring piercer row.
insert into public.studio_temporary_schedules (id, starts_on, ends_on, created_by)
values ('73000000-0000-0000-0000-000000000030','2026-09-15','2026-09-15','73000000-0000-0000-0000-000000000001');
insert into public.studio_temporary_hours (schedule_id, weekday, is_open, opens_at, closes_at)
select '73000000-0000-0000-0000-000000000030', day, day = 2,
  case when day = 2 then '14:00'::time end,
  case when day = 2 then '16:00'::time end
from generate_series(1,7) day;
select pg_temp.assert_true(
  not pg_temp.is_assignable('73000000-0000-0000-0000-000000000020','73000000-0000-0000-0000-000000000010','2026-09-15 13:59:59+08')
  and pg_temp.is_assignable('73000000-0000-0000-0000-000000000020','73000000-0000-0000-0000-000000000010','2026-09-15 14:00+08')
  and not pg_temp.is_assignable('73000000-0000-0000-0000-000000000020','73000000-0000-0000-0000-000000000010','2026-09-15 16:00+08'),
  'studio mode follows Temporary Studio Hours exactly'
);
select pg_temp.assert_true(
  (select mode = 'studio' and starts_at is null and ends_at is null
   from public.piercer_availability
   where piercer_profile_id = '73000000-0000-0000-0000-000000000020' and weekday = 2),
  'temporary Studio resolution does not rewrite recurring piercer data'
);

insert into public.studio_exceptions (exception_date, exception_type, reason)
values ('2026-09-15','closed','Mode closure');
select pg_temp.assert_true(
  not pg_temp.is_assignable('73000000-0000-0000-0000-000000000020','73000000-0000-0000-0000-000000000010','2026-09-15 15:00+08'),
  'Studio closure makes studio-mode piercer unavailable'
);

-- Staff can read recurring availability for operations but cannot mutate it.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','73000000-0000-0000-0000-000000000002',true);
select pg_temp.assert_true(
  (select count(*) = 3 from public.piercer_availability
   where piercer_profile_id = '73000000-0000-0000-0000-000000000020'),
  'active Staff can read recurring piercer availability'
);
do $$ begin
  begin
    insert into public.piercer_availability (piercer_profile_id, weekday, mode, starts_at, ends_at)
    values ('73000000-0000-0000-0000-000000000022',2,'studio',null,null);
    raise exception 'Staff availability insert unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
end $$;
do $$ declare changed_count integer; begin
  update public.piercer_availability set mode = 'studio', starts_at = null, ends_at = null
  where piercer_profile_id = '73000000-0000-0000-0000-000000000020' and weekday = 1;
  get diagnostics changed_count = row_count;
  perform pg_temp.assert_true(changed_count = 0, 'Staff must not update recurring piercer availability');
end $$;
do $$ declare changed_count integer; begin
  delete from public.piercer_availability
  where piercer_profile_id = '73000000-0000-0000-0000-000000000020' and weekday = 1;
  get diagnostics changed_count = row_count;
  perform pg_temp.assert_true(changed_count = 0, 'Staff must not delete recurring piercer availability');
end $$;

reset role;
rollback;
