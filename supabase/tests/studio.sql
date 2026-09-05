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
do $$ declare changed_count integer; begin
  update public.studio_hours set is_open = false, opens_at = null, closes_at = null where weekday = 1;
  get diagnostics changed_count = row_count;
  perform pg_temp.assert_true(changed_count = 0, 'Staff must not change Studio Hours');
end $$;

reset role;
rollback;
