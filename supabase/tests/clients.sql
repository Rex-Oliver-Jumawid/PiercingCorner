-- Run against local Supabase with psql -v ON_ERROR_STOP=1. All fixtures roll back.
begin;
create function pg_temp.assert_true(condition boolean, message text)
returns void language plpgsql as $$ begin
  if condition is distinct from true then raise exception '%', message; end if;
end $$;

insert into auth.users (id, email) values
 ('20000000-0000-0000-0000-000000000001', 'clients-owner@example.test'),
 ('20000000-0000-0000-0000-000000000002', 'clients-staff@example.test'),
 ('20000000-0000-0000-0000-000000000003', 'clients-inactive@example.test');
insert into public.staff_accounts (id, display_name, role, status) values
 ('20000000-0000-0000-0000-000000000001', 'Clients Owner', 'owner', 'active'),
 ('20000000-0000-0000-0000-000000000002', 'Clients Staff', 'staff', 'active'),
 ('20000000-0000-0000-0000-000000000003', 'Clients Inactive', 'staff', 'inactive');
insert into public.clients (id, full_name, email, phone, created_by) values
 ('20000000-0000-0000-0000-000000000101', 'Client %_*()," Test', 'Ana@example.test', '+63 (917) 123-4567', '20000000-0000-0000-0000-000000000001'),
 ('20000000-0000-0000-0000-000000000102', 'Client ordinary Test', null, null, '20000000-0000-0000-0000-000000000001');
insert into public.transactions (client_id, status, created_by, updated_at)
select '20000000-0000-0000-0000-000000000101', status::public.transaction_status,
 '20000000-0000-0000-0000-000000000001', '2026-09-05T10:00:00Z'
from unnest(array['pending','ongoing','completed','cancelled']) status;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
do $$ declare actor text; changed integer; target_id uuid; begin
  foreach actor in array array['20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002'] loop
    perform set_config('request.jwt.claim.sub', actor, true);
    perform pg_temp.assert_true((select transaction_count = 4 and last_activity = '2026-09-05T10:00:00Z' from public.client_summaries where id = '20000000-0000-0000-0000-000000000101'), 'Both roles see all statuses and latest activity');
    perform pg_temp.assert_true((select transaction_count = 0 and last_activity is null from public.client_summaries where id = '20000000-0000-0000-0000-000000000102'), 'Empty histories have zero count and null activity');
    perform pg_temp.assert_true((select count(*) = 1 from public.search_clients('%_*(),"')), 'Search punctuation must be literal');
    perform pg_temp.assert_true((select count(*) = 1 from public.find_client_duplicates(' client %_*()," test ')), 'Names trim and ignore case');
    perform pg_temp.assert_true((select count(*) = 1 from public.find_client_duplicates('Different', ' ANA@EXAMPLE.TEST ')), 'Emails trim and ignore case');
    perform pg_temp.assert_true((select count(*) = 1 from public.find_client_duplicates('Different', null, '639171234567')), 'Phone formatting is ignored');
    perform pg_temp.assert_true((select count(*) = 0 from public.find_client_duplicates('Different', null, '09171234567')), 'Country codes are not inferred');
    perform pg_temp.assert_true((select count(*) = 0 from public.find_client_duplicates('Different', '', '()')), 'Blank contacts never match');
    perform pg_temp.assert_true((select count(*) = 0 from public.find_client_duplicates('Client %_*()," Test', null, null, '20000000-0000-0000-0000-000000000101')), 'Edit excludes self');
    perform * from public.create_client('Created ' || actor, 'created-' || actor || '@example.test', null);
    perform pg_temp.assert_true((select count(*) = 1 from public.clients where full_name = 'Created ' || actor), 'Active roles can create a unique client');
    select id into target_id from public.clients where full_name = 'Created ' || actor;
    perform * from public.update_client(target_id, 'Updated ' || actor, 'updated-' || actor || '@example.test', null);
    perform pg_temp.assert_true((select count(*) = 1 from public.clients where id = target_id and full_name = 'Updated ' || actor), 'Active roles can directly update a unique client');
    begin
      perform * from public.create_client(' updated ' || actor || ' ', null, null);
      raise exception 'Duplicate client creation unexpectedly succeeded';
    exception when unique_violation then null; end;
    begin
      perform * from public.update_client(target_id, 'Different', ' ANA@EXAMPLE.TEST ', null);
      raise exception 'Duplicate client update unexpectedly succeeded';
    exception when unique_violation then null; end;
    insert into public.clients (full_name, email, phone) values ('Duplicate allowed', 'shared@example.test', '123'), ('Duplicate allowed', 'shared@example.test', '123');
    update public.clients set phone = null where id = '20000000-0000-0000-0000-000000000102';
    get diagnostics changed = row_count;
    perform pg_temp.assert_true(changed = 1, 'Both roles can edit a client created by another account');
    delete from public.clients where id = '20000000-0000-0000-0000-000000000102';
    get diagnostics changed = row_count;
    perform pg_temp.assert_true(changed = 0, 'Client deletion remains denied');
  end loop;
end $$;

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000003', true);
select pg_temp.assert_true((select count(*) = 0 from public.client_summaries), 'Inactive cannot read summaries');
select pg_temp.assert_true((select count(*) = 0 from public.search_clients('')), 'Inactive cannot search');
select pg_temp.assert_true((select count(*) = 0 from public.find_client_duplicates('Duplicate allowed')), 'Inactive cannot find duplicates');
do $$ begin
  begin
    perform * from public.create_client('Inactive RPC write');
    raise exception 'Inactive client RPC unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.update_client('20000000-0000-0000-0000-000000000101', 'Inactive RPC update');
    raise exception 'Inactive client update RPC unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.clients (full_name) values ('Inactive write');
    raise exception 'Inactive insert unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select pg_temp.assert_true(not has_table_privilege('anon', 'public.client_summaries', 'SELECT'), 'Anonymous summary grant denied');
select pg_temp.assert_true(not has_function_privilege('anon', 'public.search_clients(text)', 'EXECUTE'), 'Anonymous search grant denied');
select pg_temp.assert_true(not has_function_privilege('anon', 'public.find_client_duplicates(text,text,text,uuid)', 'EXECUTE'), 'Anonymous duplicate grant denied');
select pg_temp.assert_true(not has_function_privilege('anon', 'public.create_client(text,text,text)', 'EXECUTE'), 'Anonymous client creation grant denied');
select pg_temp.assert_true(not has_function_privilege('anon', 'public.update_client(uuid,text,text,text)', 'EXECUTE'), 'Anonymous client update grant denied');
select pg_temp.assert_true(not has_table_privilege('authenticated', 'public.client_summaries', 'UPDATE'), 'Summary writes denied');
rollback;
